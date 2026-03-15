import fs from 'fs';
import path from 'path';
import {
  ASSISTANT_NAME,
  POLL_INTERVAL,
  TIMEZONE,
  TRIGGER_PATTERN,
} from '../../config.js';
import {
  getNewMessages,
  setRegisteredGroup,
  getMessagesSince,
} from '../../db.js';
import type { GroupQueue } from '../../group-queue.js';
import { resolveGroupFolderPath } from '../../group-folder.js';
import { findChannel, formatMessages } from '../../router.js';
import {
  isTriggerAllowed,
  loadSenderAllowlist,
} from '../../sender-allowlist.js';
import type {
  Channel,
  NewMessage,
  RegisteredGroup,
} from '../../types/core-runtime.js';
import { logger } from '../../logger.js';
import {
  isDuplicateMessage,
  saveAppState,
  type AppState,
} from '../message/state-recovery-service.js';
import { validateUserInput, sanitizeWebContent } from '../../security.js';
import { getAvailableGroups } from '../message/group-utils.js';
import type { AvailableGroup } from '../../container-runner.js';
import { LearningSystemInitializer } from '../../infrastructure/system/learning-system-initializer.js';
import { MessagePipeline } from '../message/message-pipeline.js';
import { RemoteControlSystemSkill } from '../skills/remote-control-skill.js';
import type { SystemSkill } from '../system-skill.js';

export class MessageOrchestrator {
  private messageLoopRunning = false;
  private pipeline: MessagePipeline;
  private systemSkills: SystemSkill[] = [];

  constructor(
    private state: AppState,
    private queue: GroupQueue,
    private channels: Channel[],
  ) {
    this.pipeline = new MessagePipeline(state, queue, channels);
    this.registerSystemSkills();
  }

  private registerSystemSkills() {
    this.systemSkills.push(new RemoteControlSystemSkill());
  }

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
  public getAvailableGroups(): AvailableGroup[] {
    return getAvailableGroups(this.state.registeredGroups);
  }

  /**
   * Process all pending messages for a group.
   */
  public async processGroupMessagesWithTimeout(
    chatJid: string,
    timeoutMs: number = 300000,
  ): Promise<boolean> {
    return this.pipeline.processGroupMessagesWithTimeout(chatJid, timeoutMs);
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

            // System Skills Execution
            const channel = findChannel(this.channels, msg.chat_jid);
            const group = this.state.registeredGroups[msg.chat_jid];
            let handledBySkill = false;

            if (channel) {
              for (const skill of this.systemSkills) {
                if (skill.shouldHandle(msg, group)) {
                  logger.debug(
                    { skill: skill.name, chatJid: msg.chat_jid },
                    'Executing system skill',
                  );
                  await skill.execute(msg, channel, {
                    state: this.state,
                    registeredGroups: this.state.registeredGroups,
                    channels: this.channels,
                  });
                  handledBySkill = true;
                  break; // Only one skill handles a message
                }
              }
            }

            if (handledBySkill) {
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
              // console.log(
              //   `DEBUG: Enqueuing check for chat ${chatJid} with ${messagesToSend.length} messages`,
              // );
              this.queue.enqueueMessageCheck(chatJid);
            }
          }

          this.state.lastTimestamp = newTimestamp;
          saveAppState(this.state);
        }
      } catch (err) {
        // Log the error but don't crash
        logger.error({ err }, 'Error in message loop');
        // console.error(err);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }
  }
}
