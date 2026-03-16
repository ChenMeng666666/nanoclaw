import crypto from 'crypto';
import {
  getRouterState,
  setRouterState,
  getAllSessions,
  getAllRegisteredGroups,
  getMessagesSince,
} from '../../../db.js';
import { safeJsonParse } from '../../../security.js';
import { logger } from '../../../logger.js';
import type { RegisteredGroup } from '../../../types/core-runtime.js';
import { ASSISTANT_NAME } from '../../../config.js';
import type { GroupQueue } from '../infrastructure/group-queue.js';

export interface AppState {
  lastTimestamp: string;
  sessions: Record<string, string>;
  registeredGroups: Record<string, RegisteredGroup>;
  lastAgentTimestamp: Record<string, string>;
}

const messageDeduplicationCache = new Map<
  string,
  {
    timestamp: number;
    hash: string;
  }
>();
const MESSAGE_DEDUPLICATION_WINDOW = 30 * 1000;
const MESSAGE_DEDUPLICATION_MAX_SIZE = 500;
let lastCacheCleanupTime = 0;
const CACHE_CLEANUP_INTERVAL = 10 * 1000;

function calculateMessageHash(content: string): string {
  return crypto
    .createHash('md5')
    .update(content.trim().toLowerCase())
    .digest('hex');
}

type MessageDedupResult =
  | { duplicate: true; reason: 'same_message_id' }
  | { duplicate: false; reason: 'accepted' };

function evaluateMessageDeduplication(
  chatJid: string,
  messageId: string,
  content: string,
  timestamp: string,
): MessageDedupResult {
  const now = Date.now();
  const messageTime = new Date(timestamp).getTime();

  if (now - lastCacheCleanupTime > CACHE_CLEANUP_INTERVAL) {
    for (const [key, value] of messageDeduplicationCache.entries()) {
      if (now - value.timestamp > MESSAGE_DEDUPLICATION_WINDOW) {
        messageDeduplicationCache.delete(key);
      }
    }
    lastCacheCleanupTime = now;

    if (messageDeduplicationCache.size >= MESSAGE_DEDUPLICATION_MAX_SIZE) {
      const oldest = [...messageDeduplicationCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, Math.ceil(MESSAGE_DEDUPLICATION_MAX_SIZE * 0.1));
      for (const [key] of oldest) {
        messageDeduplicationCache.delete(key);
      }
    }
  }

  const uniqueKey = `${chatJid}:${messageId}`;
  if (messageDeduplicationCache.has(uniqueKey)) {
    logger.debug(
      { chatJid, messageId },
      'Duplicate message detected (same ID)',
    );
    return { duplicate: true, reason: 'same_message_id' };
  }

  const contentHash = calculateMessageHash(content);
  messageDeduplicationCache.set(uniqueKey, {
    timestamp: messageTime,
    hash: contentHash,
  });

  return { duplicate: false, reason: 'accepted' };
}

export function isDuplicateMessage(
  chatJid: string,
  messageId: string,
  content: string,
  timestamp: string,
): boolean {
  const dedupResult = evaluateMessageDeduplication(
    chatJid,
    messageId,
    content,
    timestamp,
  );
  return dedupResult.duplicate;
}

export function loadAppState(): AppState {
  const lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  let lastAgentTimestamp: Record<string, string>;

  try {
    const parsed = agentTs ? safeJsonParse(agentTs) : null;
    lastAgentTimestamp =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, string>)
        : {};
    for (const [jid, ts] of Object.entries(lastAgentTimestamp)) {
      if (typeof ts !== 'string' || !ts) {
        delete lastAgentTimestamp[jid];
        logger.warn(
          { jid, invalidTimestamp: ts },
          'Removed invalid lastAgentTimestamp entry',
        );
      }
    }
  } catch (err) {
    logger.warn(
      { err },
      'Corrupted last_agent_timestamp in DB, resetting to empty state',
    );
    lastAgentTimestamp = {};
  }
  const sessions = getAllSessions();
  const registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );

  return {
    lastTimestamp,
    sessions,
    registeredGroups,
    lastAgentTimestamp,
  };
}

export function saveAppState(state: AppState): void {
  setRouterState('last_timestamp', state.lastTimestamp);
  setRouterState(
    'last_agent_timestamp',
    JSON.stringify(state.lastAgentTimestamp),
  );
}

export function recoverPendingMessages(
  state: AppState,
  queue: GroupQueue,
): void {
  for (const [chatJid, group] of Object.entries(state.registeredGroups)) {
    const sinceTimestamp = state.lastAgentTimestamp[chatJid] || '';
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
