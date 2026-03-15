import fs from 'fs';
import path from 'path';
import {
  ASSISTANT_NAME,
  IDLE_TIMEOUT,
  MEMORY_CONFIG,
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
  getAllTasks,
  getMessagesSince,
  setSession,
} from '../../db.js';
import { routeMessageToAgent } from '../../agent-router.js';
import { GroupQueue } from '../../group-queue.js';
import { findChannel, formatMessages } from '../../router.js';
import {
  isTriggerAllowed,
  loadSenderAllowlist,
} from '../../sender-allowlist.js';
import { Channel, RegisteredGroup } from '../../types.js';
import { logger } from '../../logger.js';
import { contextEngineRegistry } from '../../context-engine/registry.js';
import type { ContextEngine } from '../../context-engine/interface.js';
import {
  saveAppState,
  AppState,
} from './state-recovery-service.js';
import { getAvailableGroups } from './group-utils.js';

export class MessagePipeline {
  constructor(
    private state: AppState,
    private queue: GroupQueue,
    private channels: Channel[],
  ) {}

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
    const availableGroups = getAvailableGroups(this.state.registeredGroups);
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
}
