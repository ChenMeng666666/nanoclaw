import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ASSISTANT_NAME, STORE_DIR } from './config.js';
import { logger } from './logger.js';
import { setDatabase } from './db-agents.js';
import {
  migrateJsonState as runJsonStateMigration,
  initializeSchemaTables,
} from './platform/persistence/sqlite.js';
import {
  setRouterState as setRouterStateForMigration,
  setSession as setSessionForMigration,
  setRegisteredGroup as setRegisteredGroupForMigration,
} from './platform/persistence/facades.js';

export * from './platform/persistence/facades.js';

let db: Database.Database;

function toHashInput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function createSchema(database: Database.Database): void {
  initializeSchemaTables(database);

  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    // ignore
  }

  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    database
      .prepare(`UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`)
      .run(`${ASSISTANT_NAME}:%`);
  } catch {
    // ignore
  }

  try {
    database.exec(
      `ALTER TABLE registered_groups ADD COLUMN is_main INTEGER DEFAULT 0`,
    );
    database.exec(
      `UPDATE registered_groups SET is_main = 1 WHERE folder = 'main'`,
    );
  } catch {
    // ignore
  }

  try {
    database.exec(`ALTER TABLE chats ADD COLUMN channel TEXT`);
    database.exec(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
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
    // ignore
  }

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
      // ignore
    }
  }

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

  try {
    const existingEntries = database
      .prepare('SELECT id, content FROM evolution_log WHERE asset_id IS NULL')
      .all() as Array<{ id: number; content: string | null }>;
    for (const entry of existingEntries) {
      const hash = crypto
        .createHash('sha256')
        .update(toHashInput(entry.content))
        .digest('hex');
      database
        .prepare('UPDATE evolution_log SET asset_id = ? WHERE id = ?')
        .run(`sha256:${hash}`, entry.id);
    }
  } catch (err) {
    logger.debug({ err }, 'Failed to compute asset_id for existing entries');
  }

  try {
    database.exec(`ALTER TABLE evolution_log ADD COLUMN content_hash TEXT`);
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
  }

  try {
    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_evolution_content_hash ON evolution_log(content_hash)`,
    );
  } catch (err) {
    logger.debug({ err }, 'Failed to create index idx_evolution_content_hash');
  }

  try {
    database.exec(`ALTER TABLE memories ADD COLUMN content_hash TEXT`);
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
  }

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

function migrateJsonState(): void {
  runJsonStateMigration({
    setRouterState: setRouterStateForMigration,
    setSession: setSessionForMigration,
    setRegisteredGroup: setRegisteredGroupForMigration,
  });
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  createSchema(db);
  setDatabase(db);
  migrateJsonState();
}

export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
  setDatabase(db);
}
