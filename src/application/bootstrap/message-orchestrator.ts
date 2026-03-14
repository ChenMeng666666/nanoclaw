import fs from 'fs';
import path from 'path';
import {
  ASSISTANT_NAME,
  IDLE_TIMEOUT,
  MEMORY_CONFIG,
  POLL_INTERVAL,
  TIMEZONE,
  TRIGGER_PATTERN,
} from '../../config.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from '../../container-runner.js';
import {
  getAllChats,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  setRegisteredGroup,
  setSession,
  storeMessage,
  storeChatMetadata,
} from '../../db.js';
import { routeMessageToAgent } from '../../agent-router.js';
import { GroupQueue } from '../../group-queue.js';
import { resolveGroupFolderPath } from '../../group-folder.js';
import { findChannel, formatMessages, formatOutbound } from '../../router.js';
import {
  isSenderAllowed,
  isTriggerAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from '../../sender-allowlist.js';
import { Channel, NewMessage, RegisteredGroup } from '../../types.js';
import { logger } from '../../logger.js';
import { contextEngineRegistry } from '../../context-engine/registry.js';
import type { ContextEngine } from '../../context-engine/interface.js';
import {
  isDuplicateMessage,
  saveAppState,
  AppState,
} from '../message/state-recovery-service.js';
import { validateUserInput, sanitizeWebContent } from '../../security.js';
import { getAvailableGroups } from '../message/group-utils.js';
import { LearningSystemInitializer } from '../../infrastructure/system/learning-system-initializer.js';

export class MessageOrchestrator {
  private messageLoopRunning = false;

  constructor(
    private state: AppState,
    private queue: GroupQueue,
    private channels: Channel[],
  ) {}

  public getRegisteredGroups(): Record<string, RegisteredGroup> {
    return this.state.registeredGroups;
  }

  public getSessions(): Record<string, string> {
    return this.state.sessions;
  }

  /**
   * Register a new group and initialize its environment
   */
  public registerGroup(jid: string, group: RegisteredGroup): void {
    let groupDir: string;
    try {
      groupDir = resolveGroupFolderPath(group.folder);
    } catch (err) {
      logger.warn(
        { jid, folder: group.folder, err },
        'Rejecting group registration with invalid folder',
      );
      return;
    }

    this.state.registeredGroups[jid] = group;
    setRegisteredGroup(jid, group);

    // Create group folder
    fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

    // Initialize learning system template
    LearningSystemInitializer.initialize(jid, group, groupDir);

    logger.info(
      { jid, name: group.name, folder: group.folder },
      'Group registered',
    );
  }

  /**
   * Get available groups list for the agent.
   */
  public getAvailableGroups(): import('../../container-runner.js').AvailableGroup[] {
    return getAvailableGroups(this.state.registeredGroups);
  }

  /**
   * Process all pending messages for a group.
   */
  public async processGroupMessagesWithTimeout(
    chatJid: string,
    timeoutMs: number = 300000,
  ): Promise<boolean> {
    type ProcessMessagesOutcomeCode =
      | 'skipped_no_group'
      | 'skipped_no_channel'
      | 'skipped_no_messages'
      | 'skipped_missing_trigger'
      | 'processed'
      | 'processed_with_post_output_error'
      | 'retry_needed';
    interface ProcessMessagesOutcome {
      ok: boolean;
      code: ProcessMessagesOutcomeCode;
    }

    let didTimeout = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<ProcessMessagesOutcome>((resolve) => {
      timeoutHandle = setTimeout(() => {
        didTimeout = true;
        this.queue.closeStdin(chatJid);
        resolve({ ok: false, code: 'retry_needed' });
      }, timeoutMs);
    });

    const processingPromise = (async (): Promise<ProcessMessagesOutcome> => {
      const group = this.state.registeredGroups[chatJid];
      if (!group) return { ok: true, code: 'skipped_no_group' };

      const channel = findChannel(this.channels, chatJid);
      if (!channel) {
        logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
        return { ok: true, code: 'skipped_no_channel' };
      }

      const isMainGroup = group.isMain === true;
      const sessionId = this.state.sessions[group.folder];
      const memoryPipelineRoute = MEMORY_CONFIG.runtime.mainPipeline;

      const sinceTimestamp = this.state.lastAgentTimestamp[chatJid] || '';
      const missedMessages = getMessagesSince(
        chatJid,
        sinceTimestamp,
        ASSISTANT_NAME,
      );

      if (missedMessages.length === 0) {
        return { ok: true, code: 'skipped_no_messages' };
      }

      // For non-main groups, check if trigger is required and present
      if (!isMainGroup && group.requiresTrigger === true) {
        const allowlistCfg = loadSenderAllowlist();
        const hasTrigger = missedMessages.some(
          (m) =>
            TRIGGER_PATTERN.test(m.content.trim()) &&
            (m.is_from_me || isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
        );
        if (!hasTrigger) {
          return { ok: true, code: 'skipped_missing_trigger' };
        }
      }

      let contextEngine: ContextEngine | null = null;
      let prompt = formatMessages(missedMessages, TIMEZONE);
      if (memoryPipelineRoute === 'context_engine') {
        try {
          contextEngine = await contextEngineRegistry.getEngine(group.folder);
          const assembledContext = await contextEngine.assemble(
            chatJid,
            20,
            sessionId,
          );
          const ingestTimestamp = new Date().toISOString();
          await Promise.all(
            missedMessages.map((message) =>
              contextEngine!.ingest(message, {
                ...assembledContext,
                agentFolder: group.folder,
                sessionId,
                userJid: message.sender,
                messages: [message],
                timestamp: ingestTimestamp,
              }),
            ),
          );
          if (assembledContext.memories.length > 0) {
            const memoryBlock = assembledContext.memories
              .slice(0, 8)
              .map((memory, index) => `${index + 1}. ${memory.content}`)
              .join('\n');
            prompt = `[相关记忆]\n${memoryBlock}\n\n${prompt}`;
          }
        } catch (err) {
          logger.warn(
            { chatJid, agentFolder: group.folder, sessionId, err },
            'ContextEngine pipeline failed, fallback',
          );
        }
      } else {
        logger.warn(
          {
            chatJid,
            agentFolder: group.folder,
            sessionId,
            memoryPipelineRoute,
          },
          'Unsupported memory pipeline route, skipping context injection',
        );
      }
      const newCursor = missedMessages[missedMessages.length - 1].timestamp;

      logger.info(
        { group: group.name, messageCount: missedMessages.length },
        'Processing messages',
      );

      // Track idle timer for closing stdin when agent is idle
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          logger.debug(
            { group: group.name },
            'Idle timeout, closing container stdin',
          );
          this.queue.closeStdin(chatJid);
        }, IDLE_TIMEOUT);
      };

      await channel.setTyping?.(chatJid, true);
      let hadError = false;
      let outputSentToUser = false;
      let responseText = '';

      const output = await this.runAgent(
        group,
        prompt,
        chatJid,
        async (result) => {
          if (didTimeout) {
            return;
          }
          // Streaming output callback — called for each agent result
          if (result.result) {
            const raw =
              typeof result.result === 'string'
                ? result.result
                : JSON.stringify(result.result);
            // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
            const text = raw
              .replace(/<internal>[\s\S]*?<\/internal>/g, '')
              .trim();
            logger.info(
              { group: group.name },
              `Agent output: ${raw.slice(0, 200)}`,
            );
            if (text) {
              await channel.sendMessage(chatJid, text);
              outputSentToUser = true;
              responseText += responseText ? `\n${text}` : text;
              this.queue.markOutputSent(chatJid);
            }
            // Only reset idle timer on actual results, not session-update markers (result: null)
            resetIdleTimer();
          }

          if (result.status === 'success') {
            this.queue.notifyIdle(chatJid);
          }

          if (result.status === 'error') {
            hadError = true;
          }
        },
      );

      await channel.setTyping?.(chatJid, false);
      if (idleTimer) clearTimeout(idleTimer);
      if (didTimeout) {
        return { ok: false, code: 'retry_needed' };
      }
      if (contextEngine) {
        try {
          await contextEngine.afterTurn({
            response: responseText,
            sessionId,
          });
        } catch (err) {
          logger.warn({ chatJid, err }, 'ContextEngine afterTurn failed');
        }
      }

      if (output === 'error' || hadError) {
        if (outputSentToUser) {
          this.state.lastAgentTimestamp[chatJid] = newCursor;
          saveAppState(this.state);
          logger.warn(
            { group: group.name },
            'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
          );
          return { ok: true, code: 'processed_with_post_output_error' };
        }
        logger.warn(
          { group: group.name },
          'Agent error, keeping cursor unchanged for retry',
        );
        return { ok: false, code: 'retry_needed' };
      }

      this.state.lastAgentTimestamp[chatJid] = newCursor;
      saveAppState(this.state);
      return { ok: true, code: 'processed' };
    })();

    return Promise.race([processingPromise, timeoutPromise])
      .then((outcome) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (outcome.code !== 'processed') {
          logger.debug(
            { chatJid, outcome },
            'Group message processing outcome',
          );
        }
        return outcome.ok;
      })
      .catch((err) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        logger.error({ chatJid, err }, 'Message processing failed');
        return false;
      });
  }

  private async runAgent(
    group: RegisteredGroup,
    prompt: string,
    chatJid: string,
    onOutput?: (output: ContainerOutput) => Promise<void>,
  ): Promise<'success' | 'error'> {
    const isMain = group.isMain === true;
    const sessionId = this.state.sessions[group.folder];

    // 多智能体路由：尝试从 chatJid 查找对应的 agent 配置
    const agentRoute = await routeMessageToAgent(chatJid);
    const agentConfig = agentRoute?.agentConfig;

    // Update tasks snapshot for container to read (filtered by group)
    const tasks = getAllTasks();
    writeTasksSnapshot(
      group.folder,
      isMain,
      tasks.map((t) => ({
        id: t.id,
        groupFolder: t.group_folder,
        prompt: t.prompt,
        schedule_type: t.schedule_type,
        schedule_value: t.schedule_value,
        status: t.status,
        next_run: t.next_run,
      })),
    );

    // Update available groups snapshot (main group only can see all groups)
    const availableGroups = this.getAvailableGroups();
    writeGroupsSnapshot(
      group.folder,
      isMain,
      availableGroups,
      new Set(Object.keys(this.state.registeredGroups)),
    );

    // Wrap onOutput to track session ID from streamed results
    const wrappedOnOutput = onOutput
      ? async (output: ContainerOutput) => {
          if (output.newSessionId) {
            this.state.sessions[group.folder] = output.newSessionId;
            setSession(group.folder, output.newSessionId);
          }
          await onOutput(output);
        }
      : undefined;

    try {
      const output = await runContainerAgent(
        group,
        {
          prompt,
          sessionId,
          groupFolder: group.folder,
          chatJid,
          isMain,
          assistantName: ASSISTANT_NAME,
          agentConfig, // 多智能体配置
        },
        (proc, containerName) =>
          this.queue.registerProcess(
            chatJid,
            proc,
            containerName,
            group.folder,
          ),
        wrappedOnOutput,
      );

      if (output.newSessionId) {
        this.state.sessions[group.folder] = output.newSessionId;
        setSession(group.folder, output.newSessionId);
      }

      if (output.status === 'error') {
        logger.error(
          { group: group.name, error: output.error },
          'Container agent error',
        );
        return 'error';
      }

      return 'success';
    } catch (err) {
      logger.error({ group: group.name, err }, 'Agent error');
      return 'error';
    }
  }

  public async startMessageLoop(): Promise<void> {
    if (this.messageLoopRunning) {
      logger.debug('Message loop already running, skipping duplicate start');
      return;
    }
    this.messageLoopRunning = true;

    logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

    while (true) {
      try {
        const jids = Object.keys(this.state.registeredGroups);
        const { messages, newTimestamp } = getNewMessages(
          jids,
          this.state.lastTimestamp,
          ASSISTANT_NAME,
        );

        if (messages.length > 0) {
          logger.info({ count: messages.length }, 'New messages');
          logger.debug({ messages }, '=== New messages ===');

          // Deduplicate messages by group and content
          const messagesByGroup = new Map<string, NewMessage[]>();
          for (const msg of messages) {
            // 检查消息是否重复
            if (
              isDuplicateMessage(
                msg.chat_jid,
                msg.id,
                msg.content,
                msg.timestamp,
              )
            ) {
              logger.warn(
                { chatJid: msg.chat_jid, messageId: msg.id },
                'Skipping duplicate message',
              );
              continue;
            }

            // 安全检查：验证用户输入是否包含潜在恶意内容
            const sanitizedContent = sanitizeWebContent(msg.content);
            const inputValidation = validateUserInput(sanitizedContent);
            if (!inputValidation.valid) {
              logger.warn(
                {
                  chatJid: msg.chat_jid,
                  messageId: msg.id,
                  issues: inputValidation.issues,
                },
                'Blocking potentially malicious message',
              );
              continue;
            }

            const safeMessage =
              sanitizedContent === msg.content
                ? msg
                : { ...msg, content: sanitizedContent };

            const existing = messagesByGroup.get(msg.chat_jid);
            if (existing) {
              existing.push(safeMessage);
            } else {
              messagesByGroup.set(msg.chat_jid, [safeMessage]);
            }
          }

          logger.debug(
            { groupCount: messagesByGroup.size },
            '=== Processing groups ===',
          );
          for (const [chatJid, groupMessages] of messagesByGroup) {
            logger.debug(
              { chatJid, messageCount: groupMessages.length },
              '=== Processing chat ===',
            );

            const group = this.state.registeredGroups[chatJid];
            if (!group) {
              logger.warn(
                { chatJid },
                'Group not registered, skipping messages',
              );
              continue;
            }

            const consumedCursor = this.queue.consumePipedMessageAck(chatJid);
            if (consumedCursor) {
              const previousCursor =
                this.state.lastAgentTimestamp[chatJid] || '';
              const shouldAdvance =
                !previousCursor ||
                new Date(consumedCursor).getTime() >=
                  new Date(previousCursor).getTime();
              if (shouldAdvance) {
                this.state.lastAgentTimestamp[chatJid] = consumedCursor;
                saveAppState(this.state);
                logger.debug(
                  { chatJid, consumedCursor, previousCursor },
                  'Advanced cursor after IPC consumption ack',
                );
              }
            }

            const channel = findChannel(this.channels, chatJid);
            if (!channel) {
              logger.warn(
                { chatJid },
                'No channel owns JID, skipping messages',
              );
              continue;
            }

            const isMainGroup = group.isMain === true;
            // 只有明确设置了 requiresTrigger = true 时才需要触发词
            // 默认为 false（不需要触发词）
            const needsTrigger = group.requiresTrigger === true && !isMainGroup;

            // For non-main groups, only act on trigger messages.
            // Non-trigger messages accumulate in DB and get pulled as
            // context when a trigger eventually arrives.
            if (needsTrigger) {
              logger.debug({ chatJid }, '=== Checking trigger ===');
              const allowlistCfg = loadSenderAllowlist();
              const hasTrigger = groupMessages.some((m) => {
                const hasPattern = TRIGGER_PATTERN.test(m.content.trim());
                const isAllowed =
                  m.is_from_me ||
                  isTriggerAllowed(chatJid, m.sender, allowlistCfg);
                logger.debug(
                  {
                    chatJid,
                    messageId: m.id,
                    content: m.content,
                    hasPattern,
                    isAllowed,
                    triggerPattern: TRIGGER_PATTERN,
                  },
                  '=== Trigger check ===',
                );
                return hasPattern && isAllowed;
              });
              if (!hasTrigger) {
                logger.warn({ chatJid }, 'No trigger message found, skipping');
                continue;
              }
            }

            // Pull all messages since lastAgentTimestamp so non-trigger
            // context that accumulated between triggers is included.
            const allPending = getMessagesSince(
              chatJid,
              this.state.lastAgentTimestamp[chatJid] || '',
              ASSISTANT_NAME,
            );
            const messagesToSend =
              allPending.length > 0 ? allPending : groupMessages;
            const formatted = formatMessages(messagesToSend, TIMEZONE);

            // 在处理消息前先保存旧的 cursor，以便失败时可以回滚
            const previousCursor = this.state.lastAgentTimestamp[chatJid] || '';
            const newCursor =
              messagesToSend[messagesToSend.length - 1]?.timestamp;

            if (this.queue.hasPendingPipedMessage(chatJid)) {
              logger.debug(
                { chatJid, count: messagesToSend.length },
                'Skipping duplicate pipe while previous IPC message is unconsumed',
              );
              continue;
            }

            const pipeResult = this.queue.sendMessageDetailed(
              chatJid,
              formatted,
              newCursor,
            );
            if (pipeResult.success) {
              logger.debug(
                {
                  chatJid,
                  count: messagesToSend.length,
                  code: pipeResult.code,
                  filePath: pipeResult.filePath,
                },
                'Piped messages to active container',
              );
              const ackedCursor = this.queue.consumePipedMessageAck(chatJid);
              if (ackedCursor) {
                this.state.lastAgentTimestamp[chatJid] = ackedCursor;
                saveAppState(this.state);
              }
              // Show typing indicator while the container processes the piped message
              channel
                .setTyping?.(chatJid, true)
                ?.catch((err) =>
                  logger.warn(
                    { chatJid, err },
                    'Failed to set typing indicator',
                  ),
                );
            } else {
              if (pipeResult.code === 'task_container_pending') {
                logger.debug(
                  {
                    chatJid,
                    count: messagesToSend.length,
                    code: pipeResult.code,
                  },
                  'Task container pending, skip enqueue for now',
                );
                continue;
              }
              // No active container — enqueue for a new one
              logger.debug(
                {
                  chatJid,
                  count: messagesToSend.length,
                  code: pipeResult.code,
                  previousCursor,
                  newCursor,
                },
                'Enqueuing message check for new container',
              );
              console.log(
                `DEBUG: Enqueuing check for chat ${chatJid} with ${messagesToSend.length} messages`,
              );
              this.queue.enqueueMessageCheck(chatJid);
            }
          }

          this.state.lastTimestamp = newTimestamp;
          saveAppState(this.state);
        }
      } catch (err) {
        logger.error({ err }, 'Error in message loop');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }
  }
}
