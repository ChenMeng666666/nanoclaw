import { getDatabase } from './db-agents.js';

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
}

/**
 * 获取路由绑定
 * @returns 绑定信息，如果不存在则返回 null
 */
export function getRoutingBinding(
  channelType: string,
  threadId: string,
): { agentId: string; sessionKey?: string } | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
    SELECT agent_id, session_key
    FROM routing_bindings
    WHERE channel_type = ? AND thread_id = ?
  `,
    )
    .get(channelType, threadId) as
    | { agent_id: string; session_key: string | null }
    | undefined;

  if (!row) return null;

  return {
    agentId: row.agent_id,
    sessionKey: row.session_key || undefined,
  };
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
