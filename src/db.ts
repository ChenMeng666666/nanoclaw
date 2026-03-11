import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { safeJsonParse } from './security.js';
import { setDatabase } from './db-agents.js';
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

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );

    -- Multi-agent architecture tables

    -- Agents table: core agent configuration
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      user_name TEXT,
      personality TEXT,
      "values" TEXT,
      appearance TEXT,
      anthropic_token_encrypted TEXT,
      anthropic_url TEXT,
      anthropic_model TEXT DEFAULT 'claude-sonnet-4-6',
      is_active INTEGER DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Channel instances: one-to-one mapping between agents and bots
    CREATE TABLE IF NOT EXISTS channel_instances (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      jid TEXT NOT NULL,
      name TEXT,
      config TEXT,
      mode TEXT DEFAULT 'both',
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- User profiles: per-user memory and preferences
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      channel_instance_id TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      name TEXT,
      preferences TEXT,
      memory_summary TEXT,
      last_interaction TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (channel_instance_id) REFERENCES channel_instances(id)
    );

    -- Evolution log: shared experience repository with review status (Gene structure)
    -- 符合 GEP 1.5.0 标准
    CREATE TABLE IF NOT EXISTS evolution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ability_name TEXT NOT NULL,
      description TEXT,
      source_agent_id TEXT,
      content TEXT,
      content_embedding BLOB,
      content_hash TEXT,
      tags TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TEXT,
      feedback TEXT,
      -- Gene structure fields (符合 GEP 标准)
      schema_version TEXT DEFAULT '1.5.0',
      asset_id TEXT,
      model_name TEXT,
      category TEXT DEFAULT 'learn',
      signals_match TEXT DEFAULT '[]',
      summary TEXT,
      preconditions TEXT DEFAULT '[]',
      validation_commands TEXT DEFAULT '[]',
      chain_id TEXT,
      gdi_score TEXT,
      ecosystem_status TEXT DEFAULT 'stale',
      strategy TEXT DEFAULT '[]',
      constraints TEXT DEFAULT '{}',
      validation TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_evolution_content_hash ON evolution_log(content_hash);
    CREATE INDEX IF NOT EXISTS idx_evolution_asset_id ON evolution_log(asset_id);
    CREATE INDEX IF NOT EXISTS idx_evolution_chain_id ON evolution_log(chain_id);
    CREATE INDEX IF NOT EXISTS idx_evolution_status ON evolution_log(ecosystem_status);

    -- Capsules 表（符合 GEP 标准）
    CREATE TABLE IF NOT EXISTS capsules (
      id TEXT PRIMARY KEY,           -- sha256:<hex>
      gene_id INTEGER NOT NULL,
      trigger TEXT DEFAULT '[]',
      summary TEXT,
      confidence REAL DEFAULT 0.0,
      blast_radius TEXT DEFAULT '{}',
      outcome TEXT DEFAULT '{}',
      env_fingerprint TEXT DEFAULT '{}',
      success_streak INTEGER DEFAULT 0,
      approved_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (gene_id) REFERENCES evolution_log(id)
    );

    -- 能力链表
    CREATE TABLE IF NOT EXISTS ability_chains (
      chain_id TEXT PRIMARY KEY,
      genes TEXT DEFAULT '[]',
      capsules TEXT DEFAULT '[]',
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 知识流事件表
    CREATE TABLE IF NOT EXISTS knowledge_flow_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      gene_id INTEGER,
      capsule_id TEXT,
      event_id TEXT,
      timestamp TEXT NOT NULL,
      success INTEGER NOT NULL,
      metrics TEXT DEFAULT '{}'
    );

    -- 验证报告表
    CREATE TABLE IF NOT EXISTS validation_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gene_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      commands TEXT DEFAULT '[]',
      success INTEGER NOT NULL,
      environment TEXT DEFAULT '{}',
      test_results TEXT,
      error TEXT,
      FOREIGN KEY (gene_id) REFERENCES evolution_log(id)
    );

    -- 生态系统指标快照表
    CREATE TABLE IF NOT EXISTS ecosystem_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      shannon_diversity REAL,
      avg_gdi_score REAL,
      total_genes INTEGER,
      total_capsules INTEGER,
      promoted_genes INTEGER,
      stale_genes INTEGER,
      archived_genes INTEGER
    );

    -- Evolution versions: version control for evolution entries
    CREATE TABLE IF NOT EXISTS evolution_versions (
      id INTEGER PRIMARY KEY,
      evolution_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      content TEXT,
      change_reason TEXT,
      changed_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (evolution_id) REFERENCES evolution_log(id)
    );

    -- Memories: hierarchical memory architecture (L1/L2/L3)
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      agent_folder TEXT NOT NULL,
      user_jid TEXT,
      level TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      content_hash TEXT,
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_folder) REFERENCES agents(folder)
    );
    CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash, agent_folder, level);

    -- Reflections: periodic reflection and summary records
    CREATE TABLE IF NOT EXISTS reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_folder TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      triggered_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_folder) REFERENCES agents(folder)
    );

    -- Learning tasks: scheduled learning tasks
    CREATE TABLE IF NOT EXISTS learning_tasks (
      id TEXT PRIMARY KEY,
      agent_folder TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reflection_id INTEGER,
      resources TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (agent_folder) REFERENCES agents(folder)
    );

    -- Audit log: audit trail for all operations
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_folder TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    -- Routing bindings: persistent thread/topic to agent bindings (ACP-style)
    CREATE TABLE IF NOT EXISTS routing_bindings (
      id TEXT PRIMARY KEY,
      channel_type TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      session_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(channel_type, thread_id)
    );
    CREATE INDEX IF NOT EXISTS idx_routing_bindings_lookup
      ON routing_bindings(channel_type, thread_id);
    CREATE INDEX IF NOT EXISTS idx_routing_bindings_agent
      ON routing_bindings(agent_id);

    -- Bot identities: per-chat bot identity
    CREATE TABLE IF NOT EXISTS bot_identities (
      id TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      bot_name TEXT NOT NULL,
      bot_avatar TEXT,
      is_active INTEGER DEFAULT 1,
      config TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(chat_jid),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bot_identities_chat ON bot_identities(chat_jid);
    CREATE INDEX IF NOT EXISTS idx_bot_identities_agent ON bot_identities(agent_id);

    -- Collaboration tasks: team-based tasks
    CREATE TABLE IF NOT EXISTS collaboration_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      team_id TEXT,
      assigned_agents TEXT DEFAULT '[]', -- JSON array
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      progress REAL DEFAULT 0,
      dependencies TEXT DEFAULT '[]', -- JSON array
      context TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_collaboration_tasks_status ON collaboration_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_collaboration_tasks_team ON collaboration_tasks(team_id);
    CREATE INDEX IF NOT EXISTS idx_collaboration_tasks_priority ON collaboration_tasks(priority);

    -- Collaboration task assignments: per-agent task assignments
    CREATE TABLE IF NOT EXISTS collaboration_task_assignments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'accepted',
      assigned_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (task_id) REFERENCES collaboration_tasks(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON collaboration_task_assignments(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_assignments_agent ON collaboration_task_assignments(agent_id);

    -- Team states: track team status and collaboration mode
    CREATE TABLE IF NOT EXISTS team_states (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      members TEXT DEFAULT '[]', -- JSON array
      leader_id TEXT,
      status TEXT DEFAULT 'active',
      collaboration_mode TEXT DEFAULT 'peer-to-peer',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_team_states_status ON team_states(status);
    CREATE INDEX IF NOT EXISTS idx_team_states_leader ON team_states(leader_id);

    -- Team collaboration states: track active team collaboration
    CREATE TABLE IF NOT EXISTS team_collaboration_states (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      task_id TEXT,
      status TEXT DEFAULT 'planning',
      progress REAL DEFAULT 0,
      active_agents TEXT DEFAULT '[]', -- JSON array
      last_activity TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES team_states(id),
      FOREIGN KEY (task_id) REFERENCES collaboration_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_collaboration_team ON team_collaboration_states(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_collaboration_task ON team_collaboration_states(task_id);

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_memories_agent_level ON memories(agent_folder, level);
    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_jid);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
    CREATE INDEX IF NOT EXISTS idx_evolution_status ON evolution_log(status);
    CREATE INDEX IF NOT EXISTS idx_channel_instances_agent ON channel_instances(agent_id);
    CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_folder);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

    -- Learning results: track outcomes of learning tasks
    CREATE TABLE IF NOT EXISTS learning_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      agent_folder TEXT NOT NULL,
      metric_before REAL,
      metric_after REAL,
      metric_name TEXT,
      status TEXT NOT NULL,
      description TEXT,
      signals TEXT,
      gene_id TEXT,
      blast_radius TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_learning_results_agent ON learning_results(agent_folder);
    CREATE INDEX IF NOT EXISTS idx_learning_results_task ON learning_results(task_id);
    CREATE INDEX IF NOT EXISTS idx_learning_results_status ON learning_results(status);

    -- Operation snapshots: for rollback capability
    CREATE TABLE IF NOT EXISTS operation_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      operation_type TEXT NOT NULL,
      group_folder TEXT,
      chat_jid TEXT,
      before_state TEXT NOT NULL,
      after_state TEXT,
      timestamp TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      description TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_operation_snapshots_operation_id ON operation_snapshots(operation_id);
    CREATE INDEX IF NOT EXISTS idx_operation_snapshots_group ON operation_snapshots(group_folder);
    CREATE INDEX IF NOT EXISTS idx_operation_snapshots_status ON operation_snapshots(status);
    CREATE INDEX IF NOT EXISTS idx_operation_snapshots_time ON operation_snapshots(timestamp DESC);
  `);

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

  // 为现有记录计算 asset_id
  try {
    const existingEntries = database
      .prepare('SELECT id, content FROM evolution_log WHERE asset_id IS NULL')
      .all() as Array<{ id: number; content: string }>;
    for (const entry of existingEntries) {
      const hash = crypto
        .createHash('sha256')
        .update(entry.content)
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
      .all() as Array<{ id: number; content: string }>;
    for (const entry of existingEntries) {
      const hash = crypto
        .createHash('sha256')
        .update(entry.content)
        .digest('hex');
      database
        .prepare('UPDATE evolution_log SET content_hash = ? WHERE id = ?')
        .run(hash, entry.id);
    }
  } catch (err) {
    logger.debug({ err }, 'Failed to add content_hash column to evolution_log');
    /* column already exists */
  }

  // Add content_hash column to memories if it doesn't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE memories ADD COLUMN content_hash TEXT`);
    // 为现有记录计算并填充 content_hash
    const existingMemories = database
      .prepare('SELECT id, content FROM memories')
      .all() as Array<{ id: string; content: string }>;
    for (const memory of existingMemories) {
      const hash = crypto
        .createHash('sha256')
        .update(memory.content)
        .digest('hex');
      database
        .prepare('UPDATE memories SET content_hash = ? WHERE id = ?')
        .run(hash, memory.id);
    }
  } catch (err) {
    logger.debug({ err }, 'Failed to add content_hash column to memories');
    /* column already exists */
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

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.chat_jid,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run,
    task.status,
    task.created_at,
  );
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTask
    | undefined;
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
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
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.schedule_value !== undefined) {
    fields.push('schedule_value = ?');
    values.push(updates.schedule_value);
  }
  if (updates.next_run !== undefined) {
    fields.push('next_run = ?');
    values.push(updates.next_run);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}

export function deleteTask(id: string): void {
  // Delete child records first (FK constraint)
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(now) as ScheduledTask[];
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}

export function logTaskRun(log: TaskRunLog): void {
  db.prepare(
    `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result,
    log.error,
  );
}

// --- Router state accessors ---

export function getRouterState(key: string): string | undefined {
  const row = db
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
  ).run(key, value);
}

// --- Session accessors ---

export function getSession(groupFolder: string): string | undefined {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(groupFolder: string, sessionId: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
  ).run(groupFolder, sessionId);
}

export function getAllSessions(): Record<string, string> {
  const rows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.group_folder] = row.session_id;
  }
  return result;
}

// --- Registered group accessors ---

export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  const row = db
    .prepare('SELECT * FROM registered_groups WHERE jid = ?')
    .get(jid) as
    | {
        jid: string;
        name: string;
        folder: string;
        trigger_pattern: string;
        added_at: string;
        container_config: string | null;
        requires_trigger: number | null;
        is_main: number | null;
      }
    | undefined;
  if (!row) return undefined;
  if (!isValidGroupFolder(row.folder)) {
    logger.warn(
      { jid: row.jid, folder: row.folder },
      'Skipping registered group with invalid folder',
    );
    return undefined;
  }
  return {
    jid: row.jid,
    name: row.name,
    folder: row.folder,
    trigger: row.trigger_pattern,
    added_at: row.added_at,
    containerConfig: row.container_config
      ? safeJsonParse(row.container_config, undefined)
      : undefined,
    requiresTrigger:
      row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    isMain: row.is_main === 1 ? true : undefined,
  };
}

export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  if (!isValidGroupFolder(group.folder)) {
    throw new Error(`Invalid group folder "${group.folder}" for JID ${jid}`);
  }
  db.prepare(
    `INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, is_main)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    jid,
    group.name,
    group.folder,
    group.trigger,
    group.added_at,
    group.containerConfig ? JSON.stringify(group.containerConfig) : null,
    group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
    group.isMain ? 1 : 0,
  );
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  const rows = db.prepare('SELECT * FROM registered_groups').all() as Array<{
    jid: string;
    name: string;
    folder: string;
    trigger_pattern: string;
    added_at: string;
    container_config: string | null;
    requires_trigger: number | null;
    is_main: number | null;
  }>;
  const result: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    if (!isValidGroupFolder(row.folder)) {
      logger.warn(
        { jid: row.jid, folder: row.folder },
        'Skipping registered group with invalid folder',
      );
      continue;
    }
    result[row.jid] = {
      name: row.name,
      folder: row.folder,
      trigger: row.trigger_pattern,
      added_at: row.added_at,
      containerConfig: row.container_config
        ? safeJsonParse(row.container_config, undefined)
        : undefined,
      requiresTrigger:
        row.requires_trigger === null ? undefined : row.requires_trigger === 1,
      isMain: row.is_main === 1 ? true : undefined,
    };
  }
  return result;
}

// --- JSON migration ---

function migrateJsonState(): void {
  const migrateFile = (filename: string) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      fs.renameSync(filePath, `${filePath}.migrated`);
      return data;
    } catch {
      return null;
    }
  };

  // Migrate router_state.json
  const routerState = migrateFile('router_state.json') as {
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  } | null;
  if (routerState) {
    if (routerState.last_timestamp) {
      setRouterState('last_timestamp', routerState.last_timestamp);
    }
    if (routerState.last_agent_timestamp) {
      setRouterState(
        'last_agent_timestamp',
        JSON.stringify(routerState.last_agent_timestamp),
      );
    }
  }

  // Migrate sessions.json
  const sessions = migrateFile('sessions.json') as Record<
    string,
    string
  > | null;
  if (sessions) {
    for (const [folder, sessionId] of Object.entries(sessions)) {
      setSession(folder, sessionId);
    }
  }

  // Migrate registered_groups.json
  const groups = migrateFile('registered_groups.json') as Record<
    string,
    RegisteredGroup
  > | null;
  if (groups) {
    for (const [jid, group] of Object.entries(groups)) {
      try {
        setRegisteredGroup(jid, group);
      } catch (err) {
        logger.warn(
          { jid, folder: group.folder, err },
          'Skipping migrated registered group with invalid folder',
        );
      }
    }
  }
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
  db.prepare(`
    INSERT OR REPLACE INTO bot_identities (
      id, chat_jid, agent_id, bot_name, bot_avatar, config, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    identity.id,
    identity.chatJid,
    identity.agentId,
    identity.botName,
    identity.botAvatar || null,
    JSON.stringify(identity.config || {}),
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

/**
 * 获取 Bot Identity
 */
export function getBotIdentityByChatJid(chatJid: string) {
  const row = db.prepare('SELECT * FROM bot_identities WHERE chat_jid = ?').get(
    chatJid,
  ) as {
    id: string;
    chat_jid: string;
    agent_id: string;
    bot_name: string;
    bot_avatar?: string;
    is_active: number;
    config?: string;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    chatJid: row.chat_jid,
    agentId: row.agent_id,
    botName: row.bot_name,
    botAvatar: row.bot_avatar,
    isActive: Boolean(row.is_active),
    config: row.config ? safeJsonParse(row.config) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 获取所有 Bot Identities
 */
export function getAllBotIdentities() {
  const rows = db.prepare('SELECT * FROM bot_identities').all() as Array<{
    id: string;
    chat_jid: string;
    agent_id: string;
    bot_name: string;
    bot_avatar?: string;
    is_active: number;
    config?: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    chatJid: row.chat_jid,
    agentId: row.agent_id,
    botName: row.bot_name,
    botAvatar: row.bot_avatar,
    isActive: Boolean(row.is_active),
    config: row.config ? safeJsonParse(row.config) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
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
  const fields = [];
  const params = [];

  if (updates.chatJid !== undefined) {
    fields.push('chat_jid = ?');
    params.push(updates.chatJid);
  }
  if (updates.agentId !== undefined) {
    fields.push('agent_id = ?');
    params.push(updates.agentId);
  }
  if (updates.botName !== undefined) {
    fields.push('bot_name = ?');
    params.push(updates.botName);
  }
  if (updates.botAvatar !== undefined) {
    fields.push('bot_avatar = ?');
    params.push(updates.botAvatar || null);
  }
  if (updates.config !== undefined) {
    fields.push('config = ?');
    params.push(JSON.stringify(updates.config));
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?');
    params.push(updates.isActive ? 1 : 0);
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  if (fields.length > 1) {
    db.prepare(`
      UPDATE bot_identities
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...params);
  }
}

/**
 * 删除 Bot Identity
 */
export function deleteBotIdentity(id: string): void {
  db.prepare('DELETE FROM bot_identities WHERE id = ?').run(id);
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
  db.prepare(`
    INSERT OR REPLACE INTO collaboration_tasks (
      id, title, description, team_id, assigned_agents, status, priority, progress, dependencies, context, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.title,
    task.description || null,
    task.teamId || null,
    JSON.stringify(task.assignedAgents),
    task.status || 'pending',
    task.priority || 'medium',
    task.progress || 0,
    JSON.stringify(task.dependencies || []),
    task.context || null,
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

/**
 * 获取协作任务
 */
export function getCollaborationTaskById(id: string) {
  const row = db.prepare('SELECT * FROM collaboration_tasks WHERE id = ?').get(
    id,
  ) as {
    id: string;
    title: string;
    description?: string;
    team_id?: string;
    assigned_agents: string;
    status: string;
    priority: string;
    progress: number;
    dependencies: string;
    context?: string;
    created_at: string;
    updated_at: string;
    completed_at?: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    teamId: row.team_id,
    assignedAgents: safeJsonParse(row.assigned_agents) as string[],
    status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    priority: row.priority as 'low' | 'medium' | 'high' | 'critical',
    progress: row.progress,
    dependencies: safeJsonParse(row.dependencies) as string[],
    context: row.context,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/**
 * 获取所有协作任务
 */
export function getAllCollaborationTasks() {
  const rows = db.prepare('SELECT * FROM collaboration_tasks').all() as Array<{
    id: string;
    title: string;
    description?: string;
    team_id?: string;
    assigned_agents: string;
    status: string;
    priority: string;
    progress: number;
    dependencies: string;
    context?: string;
    created_at: string;
    updated_at: string;
    completed_at?: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    teamId: row.team_id,
    assignedAgents: safeJsonParse(row.assigned_agents) as string[],
    status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    priority: row.priority as 'low' | 'medium' | 'high' | 'critical',
    progress: row.progress,
    dependencies: safeJsonParse(row.dependencies) as string[],
    context: row.context,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }));
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
  const fields = [];
  const params = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    params.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    params.push(updates.description || null);
  }
  if (updates.teamId !== undefined) {
    fields.push('team_id = ?');
    params.push(updates.teamId || null);
  }
  if (updates.assignedAgents !== undefined) {
    fields.push('assigned_agents = ?');
    params.push(JSON.stringify(updates.assignedAgents));
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    params.push(updates.status);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    params.push(updates.priority);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    params.push(updates.progress);
  }
  if (updates.dependencies !== undefined) {
    fields.push('dependencies = ?');
    params.push(JSON.stringify(updates.dependencies));
  }
  if (updates.context !== undefined) {
    fields.push('context = ?');
    params.push(updates.context || null);
  }
  if (updates.completedAt !== undefined) {
    fields.push('completed_at = ?');
    params.push(updates.completedAt);
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  if (fields.length > 1) {
    db.prepare(`
      UPDATE collaboration_tasks
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...params);
  }
}

/**
 * 删除协作任务
 */
export function deleteCollaborationTask(id: string): void {
  db.prepare('DELETE FROM collaboration_tasks WHERE id = ?').run(id);
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
  db.prepare(`
    INSERT OR REPLACE INTO team_states (
      id, name, description, members, leader_id, collaboration_mode, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    team.id,
    team.name,
    team.description || null,
    JSON.stringify(team.members),
    team.leaderId || null,
    team.collaborationMode || 'peer-to-peer',
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

/**
 * 获取团队状态
 */
export function getTeamStateById(id: string) {
  const row = db.prepare('SELECT * FROM team_states WHERE id = ?').get(
    id,
  ) as {
    id: string;
    name: string;
    description?: string;
    members: string;
    leader_id?: string;
    status: string;
    collaboration_mode: string;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    members: safeJsonParse(row.members) as string[],
    leaderId: row.leader_id,
    status: row.status as 'active' | 'inactive' | 'dissolved',
    collaborationMode: row.collaboration_mode as 'hierarchical' | 'peer-to-peer' | 'swarm',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 获取所有团队状态
 */
export function getAllTeamStates() {
  const rows = db.prepare('SELECT * FROM team_states').all() as Array<{
    id: string;
    name: string;
    description?: string;
    members: string;
    leader_id?: string;
    status: string;
    collaboration_mode: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    members: safeJsonParse(row.members) as string[],
    leaderId: row.leader_id,
    status: row.status as 'active' | 'inactive' | 'dissolved',
    collaborationMode: row.collaboration_mode as 'hierarchical' | 'peer-to-peer' | 'swarm',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
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
  const fields = [];
  const params = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    params.push(updates.description || null);
  }
  if (updates.members !== undefined) {
    fields.push('members = ?');
    params.push(JSON.stringify(updates.members));
  }
  if (updates.leaderId !== undefined) {
    fields.push('leader_id = ?');
    params.push(updates.leaderId || null);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    params.push(updates.status);
  }
  if (updates.collaborationMode !== undefined) {
    fields.push('collaboration_mode = ?');
    params.push(updates.collaborationMode);
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  if (fields.length > 1) {
    db.prepare(`
      UPDATE team_states
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...params);
  }
}

/**
 * 删除团队状态
 */
export function deleteTeamState(id: string): void {
  db.prepare('DELETE FROM team_states WHERE id = ?').run(id);
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
  db.prepare(`
    INSERT OR REPLACE INTO team_collaboration_states (
      id, team_id, task_id, status, progress, active_agents, last_activity, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    state.id,
    state.teamId,
    state.taskId || null,
    state.status || 'planning',
    state.progress || 0,
    JSON.stringify(state.activeAgents),
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

/**
 * 获取团队协作状态
 */
export function getTeamCollaborationStateById(id: string) {
  const row = db.prepare('SELECT * FROM team_collaboration_states WHERE id = ?').get(
    id,
  ) as {
    id: string;
    team_id: string;
    task_id?: string;
    status: string;
    progress: number;
    active_agents: string;
    last_activity: string;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    teamId: row.team_id,
    taskId: row.task_id,
    status: row.status as 'planning' | 'executing' | 'reviewing' | 'completed',
    progress: row.progress,
    activeAgents: safeJsonParse(row.active_agents) as string[],
    lastActivity: row.last_activity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  const fields = [];
  const params = [];

  if (updates.taskId !== undefined) {
    fields.push('task_id = ?');
    params.push(updates.taskId || null);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    params.push(updates.status);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    params.push(updates.progress);
  }
  if (updates.activeAgents !== undefined) {
    fields.push('active_agents = ?');
    params.push(JSON.stringify(updates.activeAgents));
  }
  if (updates.lastActivity !== undefined) {
    fields.push('last_activity = ?');
    params.push(updates.lastActivity);
  } else {
    fields.push('last_activity = ?');
    params.push(new Date().toISOString());
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  if (fields.length > 1) {
    db.prepare(`
      UPDATE team_collaboration_states
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...params);
  }
}

/**
 * 删除团队协作状态
 */
export function deleteTeamCollaborationState(id: string): void {
  db.prepare('DELETE FROM team_collaboration_states WHERE id = ?').run(id);
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
