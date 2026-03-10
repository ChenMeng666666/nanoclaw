import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import {
  ASSISTANT_NAME,
  IDLE_TIMEOUT,
  POLL_INTERVAL,
  TIMEZONE,
  TRIGGER_PATTERN,
  validateAllConfig,
} from './config.js';
import { preloadRoutingCache } from './db-routing.js';
import './channels/index.js';
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  cleanupOrphans,
  ensureContainerRuntimeRunning,
} from './container-runtime.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  getRegisteredGroup,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
} from './db.js';
import { routeMessageToAgent, buildAgentGroup } from './agent-router.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatMessages, formatOutbound } from './router.js';
import {
  isSenderAllowed,
  isTriggerAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from './sender-allowlist.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';
import { reflectionScheduler } from './reflection-scheduler.js';
import { contextEngineRegistry } from './context-engine/registry.js';
import {
  DefaultContextEngine,
  createDefaultContextEngine,
} from './context-engine/default-engine.js';
import { LocalLLMQueryExpansionProvider } from './query-expansion/local-llm-provider.js';
import { startRuntimeAPI } from './runtime-api.js';
import { MainEvolutionApplier } from './main-evolution-applier.js';
import {
  validateUserInput,
  sanitizeObject,
  safeJsonParse,
} from './security.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
// ContextEngine 实例映射（按 agentFolder）
const contextEngines = new Map<string, DefaultContextEngine>();
let messageLoopRunning = false;

// 消息去重缓存
const messageDeduplicationCache = new Map<
  string,
  {
    timestamp: number;
    hash: string;
  }
>();
const MESSAGE_DEDUPLICATION_WINDOW = 30 * 1000; // 消息去重窗口（30秒）
const MESSAGE_DEDUPLICATION_MAX_SIZE = 500; // 最大缓存条目数

const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs
      ? (safeJsonParse(agentTs) as Record<string, string>)
      : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

function registerGroup(jid: string, group: RegisteredGroup): void {
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

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  // 预先设置学习体系模板（可选，agent-learning skill 会自动初始化）
  // 复制默认配置和脚本到新 group，让新 agent 一开始就有学习体系可用
  const learningSystemDir = path.join(groupDir, '.learning-system');
  const skillConfigDir = path.join(
    process.cwd(),
    'container/skills/agent-learning/config',
  );
  const skillScriptDir = path.join(
    process.cwd(),
    'container/skills/agent-learning/scripts',
  );

  if (fs.existsSync(skillConfigDir) && !fs.existsSync(learningSystemDir)) {
    try {
      // 创建学习体系目录结构
      fs.mkdirSync(path.join(learningSystemDir, 'config'), { recursive: true });
      fs.mkdirSync(path.join(learningSystemDir, 'scripts'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(learningSystemDir, 'cron'), { recursive: true });
      fs.mkdirSync(path.join(learningSystemDir, 'status'), { recursive: true });
      fs.mkdirSync(path.join(learningSystemDir, 'plans'), { recursive: true });
      fs.mkdirSync(path.join(learningSystemDir, 'reflections'), {
        recursive: true,
      });

      // 复制配置和脚本
      if (fs.existsSync(skillConfigDir)) {
        const configFiles = fs.readdirSync(skillConfigDir);
        configFiles.forEach((file) => {
          const src = path.join(skillConfigDir, file);
          const dest = path.join(learningSystemDir, 'config', file);
          if (fs.statSync(src).isFile()) {
            fs.copyFileSync(src, dest);
          }
        });
      }

      if (fs.existsSync(skillScriptDir)) {
        const scriptFiles = fs.readdirSync(skillScriptDir);
        scriptFiles.forEach((file) => {
          const src = path.join(skillScriptDir, file);
          const dest = path.join(learningSystemDir, 'scripts', file);
          if (fs.statSync(src).isFile()) {
            fs.copyFileSync(src, dest);
            fs.chmodSync(dest, '755');
          }
        });

        // 同时复制 init.sh 到根目录
        const initScriptSrc = path.join(skillScriptDir, 'init.sh');
        const initScriptDest = path.join(learningSystemDir, 'init.sh');
        if (fs.existsSync(initScriptSrc)) {
          fs.copyFileSync(initScriptSrc, initScriptDest);
          fs.chmodSync(initScriptDest, '755');
        }
      }

      logger.info(
        { jid, name: group.name, folder: group.folder },
        'Learning system template initialized for new group',
      );
    } catch (err) {
      logger.warn(
        {
          jid,
          name: group.name,
          err: err instanceof Error ? err.message : String(err),
        },
        'Failed to initialize learning system template, will use skill auto-init',
      );
    }
  }

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  registeredGroups = groups;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
    return true;
  }

  const isMainGroup = group.isMain === true;

  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  if (missedMessages.length === 0) return true;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const allowlistCfg = loadSenderAllowlist();
    const hasTrigger = missedMessages.some(
      (m) =>
        TRIGGER_PATTERN.test(m.content.trim()) &&
        (m.is_from_me || isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages, TIMEZONE);

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

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
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let outputSentToUser = false;

  const output = await runAgent(group, prompt, chatJid, async (result) => {
    // Streaming output callback — called for each agent result
    if (result.result) {
      const raw =
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result);
      // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
      const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
      logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
      if (text) {
        await channel.sendMessage(chatJid, text);
        outputSentToUser = true;
        queue.markOutputSent(chatJid);
      }
      // Only reset idle timer on actual results, not session-update markers (result: null)
      resetIdleTimer();
    }

    if (result.status === 'success') {
      queue.notifyIdle(chatJid);
    }

    if (result.status === 'error') {
      hadError = true;
    }
  });

  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      return true;
    }
    // Roll back cursor so retries can re-process these messages
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.isMain === true;
  const sessionId = sessions[group.folder];

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
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Wrap onOutput to track session ID from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
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
        queue.registerProcess(chatJid, proc, containerName, group.folder),
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
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

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');
        logger.debug({ messages }, '=== New messages ===');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate messages by group and content
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          // 检查消息是否重复
          if (
            isDuplicateMessage(msg.chat_jid, msg.id, msg.content, msg.timestamp)
          ) {
            logger.warn(
              { chatJid: msg.chat_jid, messageId: msg.id },
              'Skipping duplicate message',
            );
            continue;
          }

          // 安全检查：验证用户输入是否包含潜在恶意内容（暂时禁用，调试中）
          // const inputValidation = validateUserInput(msg.content);
          // if (!inputValidation.valid) {
          //   logger.warn(
          //     {
          //       chatJid: msg.chat_jid,
          //       messageId: msg.id,
          //       issues: inputValidation.issues,
          //     },
          //     'Blocking potentially malicious message',
          //   );
          //   continue;
          // }

          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
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

          const group = registeredGroups[chatJid];
          if (!group) {
            logger.warn({ chatJid }, 'Group not registered, skipping messages');
            continue;
          }

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
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
            lastAgentTimestamp[chatJid] || '',
            ASSISTANT_NAME,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend, TIMEZONE);

          // 在处理消息前先保存旧的 cursor，以便失败时可以回滚
          const previousCursor = lastAgentTimestamp[chatJid] || '';
          const newCursor =
            messagesToSend[messagesToSend.length - 1]?.timestamp;

          if (queue.sendMessage(chatJid, formatted, newCursor)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            // 更新 lastAgentTimestamp
            lastAgentTimestamp[chatJid] = newCursor;
            saveState();
            // Show typing indicator while the container processes the piped message
            channel
              .setTyping?.(chatJid, true)
              ?.catch((err) =>
                logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
              );
          } else {
            // No active container — enqueue for a new one
            // 先更新 cursor，防止下次循环重复处理
            lastAgentTimestamp[chatJid] = newCursor;
            saveState();
            logger.debug(
              {
                chatJid,
                count: messagesToSend.length,
                previousCursor,
                newCursor,
              },
              'Enqueuing message check for new container',
            );
            queue.enqueueMessageCheck(chatJid);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * 计算消息的哈希值（用于去重）
 */
function calculateMessageHash(content: string): string {
  return crypto
    .createHash('md5')
    .update(content.trim().toLowerCase())
    .digest('hex');
}

/**
 * 检查消息是否重复
 */
function isDuplicateMessage(
  chatJid: string,
  messageId: string,
  content: string,
  timestamp: string,
): boolean {
  const now = Date.now();
  const messageTime = new Date(timestamp).getTime();

  // 清理过期的缓存条目
  for (const [key, value] of messageDeduplicationCache.entries()) {
    if (now - value.timestamp > MESSAGE_DEDUPLICATION_WINDOW) {
      messageDeduplicationCache.delete(key);
    }
  }

  // 检查缓存大小
  if (messageDeduplicationCache.size >= MESSAGE_DEDUPLICATION_MAX_SIZE) {
    // 清理最旧的条目
    const oldest = [...messageDeduplicationCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, Math.ceil(MESSAGE_DEDUPLICATION_MAX_SIZE * 0.1));
    for (const [key] of oldest) {
      messageDeduplicationCache.delete(key);
    }
  }

  // 优化去重逻辑：只检查完全相同的消息（ID），不检查相同内容的消息
  // 这样可以防止不同用户发送相同内容被误判为重复
  const uniqueKey = `${chatJid}:${messageId}`;
  if (messageDeduplicationCache.has(uniqueKey)) {
    logger.debug(
      { chatJid, messageId },
      'Duplicate message detected (same ID)',
    );
    return true;
  }

  // 构建去重键
  const contentHash = calculateMessageHash(content);

  // 添加到去重缓存
  messageDeduplicationCache.set(uniqueKey, {
    timestamp: messageTime,
    hash: contentHash,
  });

  return false;
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

// 本地 LLM 查询扩展提供者实例
let localLLMProvider: LocalLLMQueryExpansionProvider | null = null;

async function setupLocalLLMQueryExpansion(): Promise<void> {
  const modelPath =
    process.env.LOCAL_LLM_MODEL_PATH ||
    './model/Qwen3.5-2B_Abliterated.Q4_K_M.gguf';

  try {
    localLLMProvider = new LocalLLMQueryExpansionProvider({
      modelPath,
      modelType: 'qwen3.5',
      numVariants: 3,
      temperature: 0.7,
      maxTokens: 200,
    });

    await localLLMProvider.initialize();
    logger.info({ modelPath }, 'Local LLM query expansion initialized');

    // 设置到 context engine 注册表的全局配置
    contextEngineRegistry.setGlobalOptions({
      queryExpansionProvider: localLLMProvider,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), modelPath },
      'Failed to initialize local LLM, falling back to keyword query expansion',
    );
    localLLMProvider = null;
  }
}

/**
 * 在后台初始化本地 LLM，不阻塞应用启动
 */
function setupLocalLLMQueryExpansionInBackground(): void {
  setupLocalLLMQueryExpansion().catch((err) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'Background local LLM setup failed',
    );
  });
}

async function main(): Promise<void> {
  // 配置验证
  const configValid = validateAllConfig();
  if (!configValid) {
    logger.fatal('Critical configuration errors, cannot start');
    process.exit(1);
  }
  logger.info('Configuration validation passed');

  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');

  // 预加载路由绑定缓存
  preloadRoutingCache();

  loadState();

  // 在后台设置本地 LLM 查询扩展，不阻塞启动
  setupLocalLLMQueryExpansionInBackground();

  // 启动反思调度器（多智能体架构）
  reflectionScheduler.start();
  logger.info('Reflection scheduler started');

  // ContextEngine 记忆管理已通过引擎内部处理
  // 定期持久化由每个 ContextEngine 实例自行管理
  const memoryPersistInterval = setInterval(
    async () => {
      // 触发所有引擎的持久化
      for (const engine of contextEngines.values()) {
        await engine.afterTurn({ response: '', newMemories: [] });
      }
    },
    5 * 60 * 1000,
  );

  // 记忆迁移定时器（保留，但移除，因为 ContextEngine 内部处理）
  const memoryMigrateInterval = setInterval(
    () => {
      // 迁移逻辑已整合到 ContextEngine 中
    },
    60 * 60 * 1000,
  );

  // 初始化主项目进化系统
  logger.info('Main evolution system initialized');

  // 错误处理中集成进化系统
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    MainEvolutionApplier.submitMainExperience({
      abilityName: '错误恢复',
      content: `系统遇到未捕获异常: ${err.message}\n${err.stack}`,
      category: 'repair',
      tags: ['error', 'system'],
    }).catch((e: unknown) =>
      logger.warn({ e }, 'Failed to submit error experience'),
    );
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    MainEvolutionApplier.submitMainExperience({
      abilityName: 'Promise 拒绝处理',
      content: `系统遇到未处理的 Promise 拒绝: ${reason}`,
      category: 'repair',
      tags: ['error', 'promise'],
    }).catch((e: unknown) =>
      logger.warn({ e }, 'Failed to submit rejection experience'),
    );
  });

  // 启动运行时 API（供容器内 agent 调用）
  const runtimeAPIServer = startRuntimeAPI();
  logger.info('Runtime API server initialized');

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    // 停止调度器
    reflectionScheduler.stop();

    // 停止记忆定时任务
    clearInterval(memoryPersistInterval);
    clearInterval(memoryMigrateInterval);

    // 关闭运行时 API
    await new Promise<void>((resolve) => {
      runtimeAPIServer.close(() => resolve());
    });

    // 清理本地 LLM 资源
    if (localLLMProvider) {
      try {
        await localLLMProvider.destroy();
        logger.info('Local LLM provider destroyed');
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Failed to destroy local LLM provider',
        );
      }
    }

    // 持久化记忆 - ContextEngine 已在运行中持续处理
    logger.info('ContextEngine memories are persisted during runtime');

    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    onMessage: (chatJid: string, msg: NewMessage) => {
      // Sender allowlist drop mode: discard messages from denied senders before storing
      if (!msg.is_from_me && !msg.is_bot_message && registeredGroups[chatJid]) {
        const cfg = loadSenderAllowlist();
        if (
          shouldDropMessage(chatJid, cfg) &&
          !isSenderAllowed(chatJid, msg.sender, cfg)
        ) {
          if (cfg.logDenied) {
            logger.debug(
              { chatJid, sender: msg.sender },
              'sender-allowlist: dropping message (drop mode)',
            );
          }
          return;
        }
      }
      storeMessage(msg);
    },
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
  };

  // Create and connect all registered channels.
  // Each channel self-registers via the barrel import above.
  // Factories return null when credentials are missing, so unconfigured channels are skipped.
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel installed but credentials missing — skipping. Check .env or re-run the channel skill.',
      );
      continue;
    }
    channels.push(channel);
    await channel.connect();
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // Start subsystems (independently of connection handler)
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        logger.warn({ jid }, 'No channel owns JID, cannot send message');
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage(jid, text);
    },
  });
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
  });
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start NanoClaw');
    process.exit(1);
  });
}
