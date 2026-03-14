import {
  validateAllConfig,
} from './config.js';
import { logger } from './logger.js';
import { checkSystemDependencies } from './infrastructure/system/dependency-check.js';
import {
  ensureContainerRuntimeRunning,
  cleanupOrphans,
} from './container-runtime.js';
import {
  initDatabase,
  storeMessage,
  storeChatMetadata,
} from './db.js';
import { preloadRoutingCache } from './db-routing.js';
import {
  loadAppState,
  recoverPendingMessages,
} from './application/message/state-recovery-service.js';
import { AppLifecycleManager } from './application/bootstrap/app-lifecycle.js';
import { MessageOrchestrator } from './application/bootstrap/message-orchestrator.js';
import { startRuntimeAPI } from './runtime-api.js';
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
import { GroupQueue } from './group-queue.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatOutbound } from './router.js';
import { writeGroupsSnapshot } from './container-runner.js';
import {
  isSenderAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from './sender-allowlist.js';
import { NewMessage } from './types.js';
import './channels/index.js'; // Register channels

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

async function main(): Promise<void> {
  // 1. Config & Dependencies
  if (!validateAllConfig()) {
    logger.fatal('Critical configuration errors, cannot start');
    process.exit(1);
  }
  logger.info('Configuration validation passed');

  await checkSystemDependencies();
  ensureContainerRuntimeRunning();
  cleanupOrphans();
  initDatabase();
  logger.info('Database initialized');
  preloadRoutingCache();

  // 2. State & Core Services
  const appState = loadAppState();
  const lifecycleManager = new AppLifecycleManager();
  const queue = new GroupQueue();
  const channels: any[] = []; // will be populated

  // 3. Message Orchestrator
  const orchestrator = new MessageOrchestrator(appState, queue, channels);
  queue.setProcessMessagesFn((jid) =>
    orchestrator.processGroupMessagesWithTimeout(jid),
  );

  // 4. Channels Setup
  const channelOpts = {
    onMessage: (chatJid: string, msg: NewMessage) => {
      // Sender allowlist drop mode: discard messages from denied senders before storing
      if (
        !msg.is_from_me &&
        !msg.is_bot_message &&
        appState.registeredGroups[chatJid]
      ) {
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
    registeredGroups: () => appState.registeredGroups,
  };

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

  // 5. Lifecycle Management
  lifecycleManager.registerChannels(channels);
  lifecycleManager.registerQueue(queue);
  lifecycleManager.setupLocalLLMQueryExpansionInBackground();
  lifecycleManager.startBackgroundTasks();
  lifecycleManager.setupErrorHandlers();

  // 6. Subsystems (Scheduler & IPC)
  startSchedulerLoop({
    registeredGroups: () => appState.registeredGroups,
    getSessions: () => appState.sessions,
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
    registeredGroups: () => appState.registeredGroups,
    registerGroup: (jid, group) => orchestrator.registerGroup(jid, group),
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups: () => orchestrator.getAvailableGroups(),
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
  });

  // 7. Runtime API
  try {
    const server = await startRuntimeAPI();
    lifecycleManager.registerRuntimeAPIServer(server);
    logger.info('Runtime API started');
  } catch (err) {
    logger.error({ err }, 'Failed to start Runtime API');
    process.exit(1);
  }

  // 8. Start Main Loop
  recoverPendingMessages(appState, queue);
  orchestrator.startMessageLoop().catch((err) => {
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
