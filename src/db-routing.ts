import { getDatabase } from './db-agents.js';
import { logger } from './logger.js';

/**
 * 路由绑定接口
 */
export interface RoutingBinding {
  id: string;
  channelType: string; // 'telegram', 'discord', 'slack'
  threadId: string; // Telegram topic/thread ID
  agentId: string;
  sessionKey?: string; // 绑定的 session key
  createdAt: string;
  updatedAt: string;
}

// 路由绑定缓存
interface CachedBinding {
  agentId: string;
  sessionKey?: string;
  updatedAt: string;
}

const routingCache = new Map<string, CachedBinding>();
let cacheLoaded = false;
const cacheListeners: Array<() => void> = [];

/**
 * 生成缓存键
 */
function getCacheKey(channelType: string, threadId: string): string {
  return `${channelType}:${threadId}`;
}

/**
 * 预加载所有路由绑定到缓存
 */
export function preloadRoutingCache(): void {
  if (cacheLoaded) {
    logger.debug('Routing cache already loaded');
    return;
  }

  try {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT channel_type, thread_id, agent_id, session_key, updated_at FROM routing_bindings')
      .all() as Array<{
        channel_type: string;
        thread_id: string;
        agent_id: string;
        session_key: string | null;
        updated_at: string;
      }>;

    routingCache.clear();
    for (const row of rows) {
      const cacheKey = getCacheKey(row.channel_type, row.thread_id);
      routingCache.set(cacheKey, {
        agentId: row.agent_id,
        sessionKey: row.session_key || undefined,
        updatedAt: row.updated_at,
      });
    }

    cacheLoaded = true;
    logger.info({ count: routingCache.size }, 'Routing cache preloaded');

    // 通知监听器
    for (const listener of cacheListeners) {
      try {
        listener();
      } catch (err) {
        logger.warn({ err }, 'Error in cache listener');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Failed to preload routing cache');
  }
}

/**
 * 清除路由缓存
 */
export function clearRoutingCache(): void {
  routingCache.clear();
  cacheLoaded = false;
  logger.debug('Routing cache cleared');
}

/**
 * 添加缓存变更监听器
 */
export function addCacheListener(listener: () => void): () => void {
  cacheListeners.push(listener);
  return () => {
    const idx = cacheListeners.indexOf(listener);
    if (idx !== -1) {
      cacheListeners.splice(idx, 1);
    }
  };
}

/**
 * 创建路由绑定
 */
export function createRoutingBinding(binding: {
  channelType: string;
  threadId: string;
  agentId: string;
  sessionKey?: string;
}): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = `rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(
    `
    INSERT OR REPLACE INTO routing_bindings (id, channel_type, thread_id, agent_id, session_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    binding.channelType,
    binding.threadId,
    binding.agentId,
    binding.sessionKey || null,
    now,
    now,
  );

  // 更新缓存
  const cacheKey = getCacheKey(binding.channelType, binding.threadId);
  routingCache.set(cacheKey, {
    agentId: binding.agentId,
    sessionKey: binding.sessionKey,
    updatedAt: now,
  });

  logger.debug(
    { channelType: binding.channelType, threadId: binding.threadId, agentId: binding.agentId },
    'Routing binding created/updated',
  );
}

/**
 * 获取路由绑定
 * @returns 绑定信息，如果不存在则返回 null
 */
export function getRoutingBinding(
  channelType: string,
  threadId: string,
): { agentId: string; sessionKey?: string } | null {
  // 确保缓存已加载
  if (!cacheLoaded) {
    preloadRoutingCache();
  }

  const cacheKey = getCacheKey(channelType, threadId);
  const cached = routingCache.get(cacheKey);

  if (cached) {
    logger.debug(
      { channelType, threadId, agentId: cached.agentId },
      'Route binding from cache',
    );
    return {
      agentId: cached.agentId,
      sessionKey: cached.sessionKey,
    };
  }

  logger.debug({ channelType, threadId }, 'Route binding not in cache, querying DB');

  const db = getDatabase();
  const row = db
    .prepare(
      `
    SELECT agent_id, session_key, updated_at
    FROM routing_bindings
    WHERE channel_type = ? AND thread_id = ?
  `,
    )
    .get(channelType, threadId) as
    | { agent_id: string; session_key: string | null; updated_at: string }
    | undefined;

  if (!row) return null;

  // 更新缓存
  const binding: CachedBinding = {
    agentId: row.agent_id,
    sessionKey: row.session_key || undefined,
    updatedAt: row.updated_at,
  };
  routingCache.set(cacheKey, binding);

  return binding;
}

/**
 * 删除路由绑定
 */
export function deleteRoutingBinding(
  channelType: string,
  threadId: string,
): void {
  const db = getDatabase();
  db.prepare(
    `
    DELETE FROM routing_bindings
    WHERE channel_type = ? AND thread_id = ?
  `,
  ).run(channelType, threadId);

  // 从缓存中删除
  const cacheKey = getCacheKey(channelType, threadId);
  routingCache.delete(cacheKey);

  logger.debug(
    { channelType, threadId },
    'Routing binding deleted from cache',
  );
}

/**
 * 更新路由绑定的 session key
 */
export function updateRoutingBindingSession(
  channelType: string,
  threadId: string,
  sessionKey: string,
): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE routing_bindings
    SET session_key = ?, updated_at = ?
    WHERE channel_type = ? AND thread_id = ?
  `,
  ).run(sessionKey, now, channelType, threadId);

  // 更新缓存
  const cacheKey = getCacheKey(channelType, threadId);
  const existing = routingCache.get(cacheKey);
  if (existing) {
    routingCache.set(cacheKey, {
      ...existing,
      sessionKey,
      updatedAt: now,
    });
  }

  logger.debug(
    { channelType, threadId, sessionKey },
    'Routing binding session key updated',
  );
}

/**
 * 获取某个 agent 的所有路由绑定
 */
export function getRoutingBindingsByAgent(agentId: string): RoutingBinding[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
    SELECT * FROM routing_bindings
    WHERE agent_id = ?
    ORDER BY created_at DESC
  `,
    )
    .all(agentId) as Array<{
    id: string;
    channel_type: string;
    thread_id: string;
    agent_id: string;
    session_key: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    channelType: row.channel_type,
    threadId: row.thread_id,
    agentId: row.agent_id,
    sessionKey: row.session_key || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * 获取所有路由绑定
 */
export function getAllRoutingBindings(): RoutingBinding[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM routing_bindings ORDER BY created_at DESC')
    .all() as Array<{
    id: string;
    channel_type: string;
    thread_id: string;
    agent_id: string;
    session_key: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    channelType: row.channel_type,
    threadId: row.thread_id,
    agentId: row.agent_id,
    sessionKey: row.session_key || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
