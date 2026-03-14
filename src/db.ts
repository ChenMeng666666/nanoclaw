import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { ASSISTANT_NAME, STORE_DIR } from './config.js';
import { logger } from './logger.js';
import { setDatabase } from './db-agents.js';
import { migrateJsonState as runJsonStateMigration } from './infrastructure/persistence/sqlite/migrations/json-state.js';
import { initializeSchemaTables } from './infrastructure/persistence/sqlite/schema.js';
import * as taskRepository from './infrastructure/persistence/repositories/task-repository.js';
import * as routingRepository from './infrastructure/persistence/repositories/routing-repository.js';
import * as botIdentityRepository from './infrastructure/persistence/repositories/bot-identity-repository.js';
import * as collaborationTaskRepository from './infrastructure/persistence/repositories/collaboration-task-repository.js';
import * as teamStateRepository from './infrastructure/persistence/repositories/team-state-repository.js';
import {
  AgentConfig,
  ChannelInstance,
  UserProfile,
  EvolutionEntry,
  Memory,
  Reflection,
  LearningTask,
  NewMessage,
  RegisteredGroup,
  ScheduledTask,
  TaskRunLog,
  BotIdentity,
  CollaborationTask,
  TeamState,
} from './types.js';

let db: Database.Database;

function toHashInput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function createSchema(database: Database.Database): void {
  initializeSchemaTables(database);

  // Add context_mode column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // Add is_bot_message column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    // Backfill: mark existing bot messages that used the content prefix pattern
    database
      .prepare(`UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`)
      .run(`${ASSISTANT_NAME}:%`);
  } catch {
    /* column already exists */
  }

  // Add is_main column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE registered_groups ADD COLUMN is_main INTEGER DEFAULT 0`,
    );
    // Backfill: existing rows with folder = 'main' are the main group
    database.exec(
      `UPDATE registered_groups SET is_main = 1 WHERE folder = 'main'`,
    );
  } catch {
    /* column already exists */
  }

  // Add channel and is_group columns if they don't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE chats ADD COLUMN channel TEXT`);
    database.exec(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
    // Backfill from JID patterns
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 1 WHERE jid LIKE '%@g.us'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 0 WHERE jid LIKE '%@s.whatsapp.net'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'discord', is_group = 1 WHERE jid LIKE 'dc:%'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'telegram', is_group = 1 WHERE jid LIKE 'tg:%'`,
    );
  } catch {
    /* columns already exist */
  }

  // Add Gene structure columns to evolution_log if they don't exist (migration for existing DBs)
  // 符合 GEP 1.5.0 标准的字段
  const geneColumns = [
    { name: 'category', default: "'learn'" },
    { name: 'signals_match', default: "'[]'" },
    { name: 'strategy', default: "'[]'" },
    { name: 'constraints', default: "'{}'" },
    { name: 'validation', default: "'[]'" },
    { name: 'schema_version', default: "'1.5.0'" },
    { name: 'asset_id', default: 'NULL' },
    { name: 'model_name', default: 'NULL' },
    { name: 'summary', default: 'NULL' },
    { name: 'preconditions', default: "'[]'" },
    { name: 'validation_commands', default: "'[]'" },
    { name: 'chain_id', default: 'NULL' },
    { name: 'gdi_score', default: 'NULL' },
    { name: 'ecosystem_status', default: "'stale'" },
  ];

  for (const col of geneColumns) {
    try {
      database.exec(
        `ALTER TABLE evolution_log ADD COLUMN ${col.name} TEXT DEFAULT ${col.default}`,
      );
    } catch {
      /* column already exists */
    }
  }

  // Create indexes for Gene structure columns
  try {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_evolution_asset_id ON evolution_log(asset_id);
      CREATE INDEX IF NOT EXISTS idx_evolution_chain_id ON evolution_log(chain_id);
      CREATE INDEX IF NOT EXISTS idx_evolution_ecosystem_status ON evolution_log(ecosystem_status);
    `);
  } catch (err) {
    logger.debug(
      { err },
      'Failed to create indexes for evolution_log Gene columns',
    );
  }

  // 为现有记录计算 asset_id
  try {
    const existingEntries = database
      .prepare('SELECT id, content FROM evolution_log WHERE asset_id IS NULL')
      .all() as Array<{ id: number; content: string | null }>;
    for (const entry of existingEntries) {
      const hash = crypto
        .createHash('sha256')
        .update(toHashInput(entry.content))
        .digest('hex');
      const assetId = `sha256:${hash}`;
      database
        .prepare('UPDATE evolution_log SET asset_id = ? WHERE id = ?')
        .run(assetId, entry.id);
    }
  } catch (err) {
    logger.debug({ err }, 'Failed to compute asset_id for existing entries');
  }

  // Add content_hash column to evolution_log if it doesn't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE evolution_log ADD COLUMN content_hash TEXT`);
    // 为现有记录计算并填充 content_hash
    const existingEntries = database
      .prepare('SELECT id, content FROM evolution_log')
      .all() as Array<{ id: number; content: string | null }>;
    for (const entry of existingEntries) {
      const hash = crypto
        .createHash('sha256')
        .update(toHashInput(entry.content))
        .digest('hex');
      database
        .prepare('UPDATE evolution_log SET content_hash = ? WHERE id = ?')
        .run(hash, entry.id);
    }
  } catch (err) {
    logger.debug({ err }, 'Failed to add content_hash column to evolution_log');
    /* column already exists */
  }

  // Create index for evolution_log content_hash
  try {
    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_evolution_content_hash ON evolution_log(content_hash)`,
    );
  } catch (err) {
    logger.debug({ err }, 'Failed to create index idx_evolution_content_hash');
  }

  // Add content_hash column to memories if it doesn't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE memories ADD COLUMN content_hash TEXT`);
    // 为现有记录计算并填充 content_hash
    const existingMemories = database
      .prepare('SELECT id, content FROM memories')
      .all() as Array<{ id: string; content: string | null }>;
    for (const memory of existingMemories) {
      const hash = crypto
        .createHash('sha256')
        .update(toHashInput(memory.content))
        .digest('hex');
      database
        .prepare('UPDATE memories SET content_hash = ? WHERE id = ?')
        .run(hash, memory.id);
    }
  } catch (err) {
    logger.debug({ err }, 'Failed to add content_hash column to memories');
    /* column already exists */
  }

  // Create index for memories content_hash
  try {
    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash, agent_folder, level)`,
    );
  } catch (err) {
    logger.debug({ err }, 'Failed to create index idx_memories_content_hash');
  }

  try {
    database.exec(`ALTER TABLE memories ADD COLUMN session_id TEXT`);
  } catch (err) {
    logger.debug({ err }, 'Failed to add session_id column to memories');
  }

  try {
    database.exec(`ALTER TABLE memories ADD COLUMN scope TEXT DEFAULT 'agent'`);
  } catch (err) {
    logger.debug({ err }, 'Failed to add scope column to memories');
  }

  try {
    database.exec(`ALTER TABLE memories ADD COLUMN message_type TEXT`);
  } catch (err) {
    logger.debug({ err }, 'Failed to add message_type column to memories');
  }

  try {
    database.exec(`ALTER TABLE memories ADD COLUMN timestamp_weight REAL`);
  } catch (err) {
    logger.debug({ err }, 'Failed to add timestamp_weight column to memories');
  }

  try {
    database.exec(`ALTER TABLE memories ADD COLUMN tags TEXT`);
  } catch (err) {
    logger.debug({ err }, 'Failed to add tags column to memories');
  }

  try {
    database.exec(`ALTER TABLE memories ADD COLUMN source_type TEXT`);
  } catch (err) {
    logger.debug({ err }, 'Failed to add source_type column to memories');
  }

  try {
    database.exec(
      `ALTER TABLE memories ADD COLUMN quality_score REAL DEFAULT 0.5`,
    );
  } catch (err) {
    logger.debug({ err }, 'Failed to add quality_score column to memories');
  }

  try {
    database.exec(`UPDATE memories SET scope = 'agent' WHERE scope IS NULL`);
  } catch (err) {
    logger.debug({ err }, 'Failed to backfill scope for existing memories');
  }

  try {
    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope, agent_folder, user_jid, session_id)`,
    );
  } catch (err) {
    logger.debug({ err }, 'Failed to create index idx_memories_scope');
  }

  try {
    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_memories_quality ON memories(quality_score DESC, importance DESC)`,
    );
  } catch (err) {
    logger.debug({ err }, 'Failed to create index idx_memories_quality');
  }
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);
  setDatabase(db); // 初始化 db-agents 模块的数据库引用

  // Migrate from JSON files if they exist
  migrateJsonState();
}

/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
  setDatabase(db); // 确保 db-agents.ts 中的全局变量也被初始化
}

/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
): void {
  const ch = channel ?? null;
  const group = isGroup === undefined ? null : isGroup ? 1 : 0;

  if (name) {
    // Update with name, preserving existing timestamp if newer
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, name, timestamp, ch, group);
  } else {
    // Update timestamp only, preserve existing name if any
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, chatJid, timestamp, ch, group);
  }
}

/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid: string, name: string): void {
  db.prepare(
    `
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `,
  ).run(chatJid, name, new Date().toISOString());
}

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  channel: string;
  is_group: number;
}

/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats(): ChatInfo[] {
  return db
    .prepare(
      `
    SELECT jid, name, last_message_time, channel, is_group
    FROM chats
    ORDER BY last_message_time DESC
  `,
    )
    .all() as ChatInfo[];
}

/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync(): string | null {
  // Store sync time in a special chat entry
  const row = db
    .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
    .get() as { last_message_time: string } | undefined;
  return row?.last_message_time || null;
}

/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`,
  ).run(now);
}

/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

/**
 * Store a message directly.
 */
export function storeMessageDirect(msg: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
  botPrefix: string,
  limit: number = 200,
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => '?').join(',');
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  // Subquery takes the N most recent, outer query re-sorts chronologically.
  const sql = `
    SELECT * FROM (
      SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me
      FROM messages
      WHERE timestamp > ? AND chat_jid IN (${placeholders})
        AND is_bot_message = 0 AND content NOT LIKE ?
        AND content != '' AND content IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    ) ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids, `${botPrefix}:%`, limit) as NewMessage[];

  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  return { messages: rows, newTimestamp };
}

export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  botPrefix: string,
  limit: number = 200,
): NewMessage[] {
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  // Subquery takes the N most recent, outer query re-sorts chronologically.
  const sql = `
    SELECT * FROM (
      SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me
      FROM messages
      WHERE chat_jid = ? AND timestamp > ?
        AND is_bot_message = 0 AND content NOT LIKE ?
        AND content != '' AND content IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    ) ORDER BY timestamp
  `;
  return db
    .prepare(sql)
    .all(chatJid, sinceTimestamp, `${botPrefix}:%`, limit) as NewMessage[];
}

export function getRecentMessagesWithinWindow(
  chatJid: string,
  options?: {
    limit?: number;
    pageSize?: number;
    windowHours?: number;
    beforeTimestamp?: string;
    botPrefix?: string;
  },
): NewMessage[] {
  const limit = Math.max(1, Math.min(options?.limit ?? 200, 500));
  const pageSize = Math.max(10, Math.min(options?.pageSize ?? 50, 200));
  const windowHours = Math.max(
    1,
    Math.min(options?.windowHours ?? 24, 24 * 30),
  );
  const botPrefix = options?.botPrefix || ASSISTANT_NAME;
  const now = Date.now();
  const windowStart = new Date(
    now - windowHours * 60 * 60 * 1000,
  ).toISOString();
  let cursor = options?.beforeTimestamp || new Date(now + 1000).toISOString();
  const result: NewMessage[] = [];

  const statement = db.prepare(`
    SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me
    FROM messages
    WHERE chat_jid = ? AND timestamp >= ? AND timestamp < ?
      AND is_bot_message = 0 AND content NOT LIKE ?
      AND content != '' AND content IS NOT NULL
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  while (result.length < limit) {
    const fetchSize = Math.min(pageSize, limit - result.length);
    const page = statement.all(
      chatJid,
      windowStart,
      cursor,
      `${botPrefix}:%`,
      fetchSize,
    ) as NewMessage[];
    if (page.length === 0) {
      break;
    }
    result.push(...page);
    cursor = page[page.length - 1].timestamp;
    if (page.length < fetchSize) {
      break;
    }
  }

  return result.reverse();
}

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  taskRepository.createTask(db, task);
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return taskRepository.getTaskById(db, id);
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return taskRepository.getTasksForGroup(db, groupFolder);
}

export function getAllTasks(): ScheduledTask[] {
  return taskRepository.getAllTasks(db);
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'
    >
  >,
): void {
  taskRepository.updateTask(db, id, updates);
}

export function deleteTask(id: string): void {
  taskRepository.deleteTask(db, id);
}

export function getDueTasks(): ScheduledTask[] {
  return taskRepository.getDueTasks(db);
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  taskRepository.updateTaskAfterRun(db, id, nextRun, lastResult);
}

export function logTaskRun(log: TaskRunLog): void {
  taskRepository.logTaskRun(db, log);
}

// --- Router state accessors ---

export function getRouterState(key: string): string | undefined {
  return routingRepository.getRouterState(db, key);
}

export function setRouterState(key: string, value: string): void {
  routingRepository.setRouterState(db, key, value);
}

// --- Session accessors ---

export function getSession(groupFolder: string): string | undefined {
  return routingRepository.getSession(db, groupFolder);
}

export function setSession(groupFolder: string, sessionId: string): void {
  routingRepository.setSession(db, groupFolder, sessionId);
}

export function getAllSessions(): Record<string, string> {
  return routingRepository.getAllSessions(db);
}

// --- Registered group accessors ---

export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  return routingRepository.getRegisteredGroup(db, jid);
}

export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  routingRepository.setRegisteredGroup(db, jid, group);
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  return routingRepository.getAllRegisteredGroups(db);
}

// --- JSON migration ---

function migrateJsonState(): void {
  runJsonStateMigration({
    setRouterState,
    setSession,
    setRegisteredGroup,
  });
}

// ===== 事务支持 =====

/**
 * 开始事务
 */
export function beginTransaction(): void {
  db.exec('BEGIN TRANSACTION');
}

/**
 * 提交事务
 */
export function commit(): void {
  db.exec('COMMIT');
}

/**
 * 回滚事务
 */
export function rollback(): void {
  db.exec('ROLLBACK');
}

/**
 * 操作快照管理函数
 */

export interface OperationSnapshot {
  id: number;
  operationId: string;
  operationType: string;
  groupFolder?: string;
  chatJid?: string;
  beforeState: string;
  afterState?: string;
  timestamp: string;
  status: 'pending' | 'applied' | 'rolled_back';
  description?: string;
}

/**
 * 存储操作快照
 */
export function createOperationSnapshot(
  snapshot: Omit<OperationSnapshot, 'id'>,
): number {
  const result = db
    .prepare(
      `
    INSERT INTO operation_snapshots (
      operation_id, operation_type, group_folder, chat_jid, before_state, after_state, timestamp, status, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      snapshot.operationId,
      snapshot.operationType,
      snapshot.groupFolder,
      snapshot.chatJid,
      snapshot.beforeState,
      snapshot.afterState || null,
      snapshot.timestamp,
      snapshot.status,
      snapshot.description || null,
    );
  return result.lastInsertRowid as number;
}

/**
 * 根据操作ID获取快照
 */
export function getOperationSnapshotByOperationId(
  operationId: string,
): OperationSnapshot | undefined {
  const row = db
    .prepare('SELECT * FROM operation_snapshots WHERE operation_id = ?')
    .get(operationId) as
    | (OperationSnapshot & {
        operation_id: string;
        operation_type: string;
        group_folder?: string;
        chat_jid?: string;
        before_state: string;
        after_state?: string;
      })
    | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    operationId: row.operation_id,
    operationType: row.operation_type,
    groupFolder: row.group_folder,
    chatJid: row.chat_jid,
    beforeState: row.before_state,
    afterState: row.after_state,
    timestamp: row.timestamp,
    status: row.status as 'pending' | 'applied' | 'rolled_back',
    description: row.description,
  };
}

/**
 * 更新操作快照
 */
export function updateOperationSnapshot(
  operationId: string,
  updates: Partial<OperationSnapshot>,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.afterState !== undefined) {
    fields.push('after_state = ?');
    values.push(updates.afterState);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }

  if (fields.length === 0) return;

  values.push(operationId);
  db.prepare(
    `UPDATE operation_snapshots SET ${fields.join(', ')} WHERE operation_id = ?`,
  ).run(...values);
}

/**
 * 获取操作快照列表
 */
export function getOperationSnapshots(
  query: {
    status?: 'pending' | 'applied' | 'rolled_back';
    operationType?: string;
    groupFolder?: string;
    chatJid?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  } = {},
): OperationSnapshot[] {
  let sql = `
    SELECT * FROM operation_snapshots
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (query.status) {
    sql += ' AND status = ?';
    params.push(query.status);
  }
  if (query.operationType) {
    sql += ' AND operation_type = ?';
    params.push(query.operationType);
  }
  if (query.groupFolder) {
    sql += ' AND group_folder = ?';
    params.push(query.groupFolder);
  }
  if (query.chatJid) {
    sql += ' AND chat_jid = ?';
    params.push(query.chatJid);
  }
  if (query.startTime) {
    sql += ' AND timestamp >= ?';
    params.push(query.startTime.toISOString());
  }
  if (query.endTime) {
    sql += ' AND timestamp <= ?';
    params.push(query.endTime.toISOString());
  }

  sql += ' ORDER BY timestamp DESC';

  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  }

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    operation_id: string;
    operation_type: string;
    group_folder?: string;
    chat_jid?: string;
    before_state: string;
    after_state?: string;
    timestamp: string;
    status: string;
    description?: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    operationId: row.operation_id,
    operationType: row.operation_type,
    groupFolder: row.group_folder,
    chatJid: row.chat_jid,
    beforeState: row.before_state,
    afterState: row.after_state,
    timestamp: row.timestamp,
    status: row.status as 'pending' | 'applied' | 'rolled_back',
    description: row.description,
  }));
}

/**
 * 删除操作快照
 */
export function deleteOperationSnapshot(operationId: string): void {
  db.prepare('DELETE FROM operation_snapshots WHERE operation_id = ?').run(
    operationId,
  );
}

/**
 * 清理旧的操作快照
 */
export function cleanupOperationSnapshots(keepDays: number = 7): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  db.prepare('DELETE FROM operation_snapshots WHERE timestamp < ?').run(
    cutoffDate.toISOString(),
  );
}

/**
 * Bot Identity 操作函数
 */

/**
 * 创建 Bot Identity
 */
export function createBotIdentity(identity: {
  id: string;
  chatJid: string;
  agentId: string;
  botName: string;
  botAvatar?: string;
  config?: Record<string, any>;
}): void {
  botIdentityRepository.createBotIdentity(db, identity);
}

/**
 * 获取 Bot Identity
 */
export function getBotIdentityByChatJid(chatJid: string) {
  return botIdentityRepository.getBotIdentityByChatJid(db, chatJid);
}

/**
 * 获取所有 Bot Identities
 */
export function getAllBotIdentities() {
  return botIdentityRepository.getAllBotIdentities(db);
}

/**
 * 更新 Bot Identity
 */
export function updateBotIdentity(
  id: string,
  updates: Partial<{
    chatJid?: string;
    agentId?: string;
    botName?: string;
    botAvatar?: string;
    config?: Record<string, any>;
    isActive?: boolean;
  }>,
): void {
  botIdentityRepository.updateBotIdentity(db, id, updates);
}

/**
 * 删除 Bot Identity
 */
export function deleteBotIdentity(id: string): void {
  botIdentityRepository.deleteBotIdentity(db, id);
}

/**
 * Collaboration Task 操作函数
 */

/**
 * 创建协作任务
 */
export function createCollaborationTask(task: {
  id: string;
  title: string;
  description?: string;
  teamId?: string;
  assignedAgents: string[];
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  progress?: number;
  dependencies?: string[];
  context?: string;
}): void {
  collaborationTaskRepository.createCollaborationTask(db, task);
}

/**
 * 获取协作任务
 */
export function getCollaborationTaskById(id: string) {
  return collaborationTaskRepository.getCollaborationTaskById(db, id);
}

/**
 * 获取所有协作任务
 */
export function getAllCollaborationTasks() {
  return collaborationTaskRepository.getAllCollaborationTasks(db);
}

/**
 * 更新协作任务
 */
export function updateCollaborationTask(
  id: string,
  updates: Partial<{
    title?: string;
    description?: string;
    teamId?: string;
    assignedAgents?: string[];
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    progress?: number;
    dependencies?: string[];
    context?: string;
    completedAt?: string;
  }>,
): void {
  collaborationTaskRepository.updateCollaborationTask(db, id, updates);
}

/**
 * 删除协作任务
 */
export function deleteCollaborationTask(id: string): void {
  collaborationTaskRepository.deleteCollaborationTask(db, id);
}

/**
 * Team State 操作函数
 */

/**
 * 创建团队状态
 */
export function createTeamState(team: {
  id: string;
  name: string;
  description?: string;
  members: string[];
  leaderId?: string;
  collaborationMode?: 'hierarchical' | 'peer-to-peer' | 'swarm';
}): void {
  teamStateRepository.createTeamState(db, team);
}

/**
 * 获取团队状态
 */
export function getTeamStateById(id: string) {
  return teamStateRepository.getTeamStateById(db, id);
}

/**
 * 获取所有团队状态
 */
export function getAllTeamStates() {
  return teamStateRepository.getAllTeamStates(db);
}

/**
 * 更新团队状态
 */
export function updateTeamState(
  id: string,
  updates: Partial<{
    name?: string;
    description?: string;
    members?: string[];
    leaderId?: string;
    status?: 'active' | 'inactive' | 'dissolved';
    collaborationMode?: 'hierarchical' | 'peer-to-peer' | 'swarm';
  }>,
): void {
  teamStateRepository.updateTeamState(db, id, updates);
}

/**
 * 删除团队状态
 */
export function deleteTeamState(id: string): void {
  teamStateRepository.deleteTeamState(db, id);
}

/**
 * Team Collaboration State 操作函数
 */

/**
 * 创建团队协作状态
 */
export function createTeamCollaborationState(state: {
  id: string;
  teamId: string;
  taskId?: string;
  status?: 'planning' | 'executing' | 'reviewing' | 'completed';
  progress?: number;
  activeAgents: string[];
}): void {
  teamStateRepository.createTeamCollaborationState(db, state);
}

/**
 * 获取团队协作状态
 */
export function getTeamCollaborationStateById(id: string) {
  return teamStateRepository.getTeamCollaborationStateById(db, id);
}

/**
 * 更新团队协作状态
 */
export function updateTeamCollaborationState(
  id: string,
  updates: Partial<{
    taskId?: string;
    status?: 'planning' | 'executing' | 'reviewing' | 'completed';
    progress?: number;
    activeAgents?: string[];
    lastActivity?: string;
  }>,
): void {
  teamStateRepository.updateTeamCollaborationState(db, id, updates);
}

/**
 * 删除团队协作状态
 */
export function deleteTeamCollaborationState(id: string): void {
  teamStateRepository.deleteTeamCollaborationState(db, id);
}

/**
 * 事务包装函数
 */
export function transaction<T>(fn: () => T): T {
  beginTransaction();
  try {
    const result = fn();
    commit();
    return result;
  } catch (error) {
    rollback();
    throw error;
  }
}
