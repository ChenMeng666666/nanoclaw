/**
 * 路由绑定数据库操作单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { setDatabase, getDatabase } from '../db-agents.js';
import {
  createRoutingBinding,
  getRoutingBinding,
  deleteRoutingBinding,
  updateRoutingBindingSession,
  getRoutingBindingsByAgent,
  getAllRoutingBindings,
} from '../db-routing.js';

describe('Routing Bindings', () => {
  let db: Database.Database;

  beforeEach(() => {
    // 创建内存数据库并设置 schema
    db = new Database(':memory:');

    // 创建 routing_bindings 表
    db.exec(`
      CREATE TABLE routing_bindings (
        id TEXT PRIMARY KEY,
        channel_type TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        session_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(channel_type, thread_id)
      )
    `);
    db.exec(`
      CREATE INDEX idx_routing_bindings_lookup
        ON routing_bindings(channel_type, thread_id)
    `);

    // 设置全局数据库引用
    setDatabase(db);
  });

  it('should create a routing binding', () => {
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:123:456',
      agentId: 'agent_1',
    });

    const binding = getRoutingBinding('telegram', 'tg:123:456');
    expect(binding).toBeDefined();
    expect(binding?.agentId).toBe('agent_1');
  });

  it('should return null for non-existent binding', () => {
    const binding = getRoutingBinding('telegram', 'nonexistent');
    expect(binding).toBeNull();
  });

  it('should create binding with session key', () => {
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:123:456',
      agentId: 'agent_1',
      sessionKey: 'session_abc',
    });

    const binding = getRoutingBinding('telegram', 'tg:123:456');
    expect(binding).toBeDefined();
    expect(binding?.sessionKey).toBe('session_abc');
  });

  it('should delete a routing binding', () => {
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:123:456',
      agentId: 'agent_1',
    });

    deleteRoutingBinding('telegram', 'tg:123:456');

    const binding = getRoutingBinding('telegram', 'tg:123:456');
    expect(binding).toBeNull();
  });

  it('should update session key', () => {
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:123:456',
      agentId: 'agent_1',
    });

    updateRoutingBindingSession('telegram', 'tg:123:456', 'new_session');

    const binding = getRoutingBinding('telegram', 'tg:123:456');
    expect(binding?.sessionKey).toBe('new_session');
  });

  it('should get bindings by agent', () => {
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:123:456',
      agentId: 'agent_1',
    });
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:789:012',
      agentId: 'agent_1',
    });
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:111:222',
      agentId: 'agent_2',
    });

    const bindings = getRoutingBindingsByAgent('agent_1');
    expect(bindings.length).toBe(2);
    expect(bindings.map((b) => b.threadId)).toContain('tg:123:456');
    expect(bindings.map((b) => b.threadId)).toContain('tg:789:012');
  });

  it('should get all bindings', () => {
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:123:456',
      agentId: 'agent_1',
    });
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:789:012',
      agentId: 'agent_2',
    });

    const bindings = getAllRoutingBindings();
    expect(bindings.length).toBe(2);
  });

  it('should enforce unique constraint on channel_type + thread_id', () => {
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:123:456',
      agentId: 'agent_1',
    });

    // 更新现有绑定而不是创建新绑定
    createRoutingBinding({
      channelType: 'telegram',
      threadId: 'tg:123:456',
      agentId: 'agent_2',
    });

    const binding = getRoutingBinding('telegram', 'tg:123:456');
    expect(binding?.agentId).toBe('agent_2'); // 应该是更新后的值
  });
});
