import type Database from 'better-sqlite3';
import crypto from 'crypto';
import type { Memory } from '../../../../types/agent-memory.js';
import { mapMemoryRow, type MemoryRow } from '../../mappers/memory-mapper.js';
import { getDatabase as getPersistenceDatabase } from '../../sqlite/transaction-manager.js';

const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const database = getPersistenceDatabase() as unknown as Record<
      string,
      unknown
    >;
    const value = database[property as keyof typeof database];
    if (typeof value === 'function') {
      return value.bind(database);
    }
    return value;
  },
});

export interface MemoryQueryOptions {
  scope?: Memory['scope'];
  sessionId?: string;
  sourceType?: Memory['sourceType'];
  tags?: string[];
  messageType?: Memory['messageType'];
}

function resolveMemoryScope(
  memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'>,
): NonNullable<Memory['scope']> {
  if (memory.scope) {
    return memory.scope;
  }
  if (memory.sessionId) {
    return 'session';
  }
  if (memory.userJid) {
    return 'user';
  }
  return 'agent';
}

function validateScopeSession(
  scope: Memory['scope'] | undefined,
  sessionId: string | undefined,
): void {
  if (scope === 'session' && !sessionId) {
    throw new Error('sessionId is required when scope is session');
  }
  if (scope && scope !== 'session' && sessionId) {
    throw new Error('sessionId can only be used when scope is session');
  }
}

export function createMemory(
  memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'>,
): void {
  const now = new Date().toISOString();
  const contentHash = crypto
    .createHash('sha256')
    .update(memory.content)
    .digest('hex');
  const scope = resolveMemoryScope(memory);
  validateScopeSession(scope, memory.sessionId);
  db.prepare(
    `
    INSERT INTO memories (id, agent_folder, user_jid, session_id, scope, level, content, embedding, content_hash, importance, quality_score, message_type, timestamp_weight, tags, source_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    memory.id,
    memory.agentFolder,
    memory.userJid || null,
    memory.sessionId || null,
    scope,
    memory.level,
    memory.content,
    memory.embedding ? JSON.stringify(memory.embedding) : null,
    contentHash,
    memory.importance || 0.5,
    memory.qualityScore ?? 0.5,
    memory.messageType || null,
    memory.timestampWeight ?? null,
    memory.tags ? JSON.stringify(memory.tags) : null,
    memory.sourceType || null,
    now,
    now,
  );
}

export function getMemories(
  agentFolder: string,
  level?: 'L1' | 'L2' | 'L3',
  userJid?: string,
  options?: MemoryQueryOptions,
): Memory[] {
  let sql = 'SELECT * FROM memories WHERE agent_folder = ?';
  const params: unknown[] = [agentFolder];

  if (level) {
    sql += ' AND level = ?';
    params.push(level);
  }
  if (userJid) {
    sql += ' AND (user_jid = ? OR user_jid IS NULL)';
    params.push(userJid);
  }
  if (options?.scope) {
    sql += ' AND scope = ?';
    params.push(options.scope);
  }
  if (options?.sessionId) {
    sql += ' AND session_id = ?';
    params.push(options.sessionId);
  }
  if (options?.sourceType) {
    sql += ' AND source_type = ?';
    params.push(options.sourceType);
  }
  if (options?.messageType) {
    sql += ' AND message_type = ?';
    params.push(options.messageType);
  }
  if (options?.tags && options.tags.length > 0) {
    const tagClauses = options.tags.map(() => 'tags LIKE ?').join(' OR ');
    sql += ` AND (${tagClauses})`;
    params.push(...options.tags.map((tag) => `%"${tag}"%`));
  }

  sql += ' ORDER BY importance DESC, access_count DESC';

  const rows = db.prepare(sql).all(...params) as MemoryRow[];
  return rows.map(mapMemoryRow);
}

export function getAllMemories(level?: 'L1' | 'L2' | 'L3'): Memory[] {
  let sql = 'SELECT * FROM memories';
  const params: unknown[] = [];

  if (level) {
    sql += ' WHERE level = ?';
    params.push(level);
  }

  sql += ' ORDER BY importance DESC, access_count DESC';

  const rows = db.prepare(sql).all(...params) as MemoryRow[];
  return rows.map(mapMemoryRow);
}

export function getUserMemories(
  agentFolder: string,
  userJid: string,
  levels?: ('L1' | 'L2' | 'L3')[],
  options?: MemoryQueryOptions,
): Memory[] {
  let sql =
    'SELECT * FROM memories WHERE agent_folder = ? AND (user_jid = ? OR user_jid IS NULL)';
  const params: unknown[] = [agentFolder, userJid];

  if (levels && levels.length > 0) {
    const placeholders = levels.map(() => '?').join(',');
    sql += ` AND level IN (${placeholders})`;
    params.push(...levels);
  }
  if (options?.scope) {
    sql += ' AND scope = ?';
    params.push(options.scope);
  }
  if (options?.sessionId) {
    sql += ' AND session_id = ?';
    params.push(options.sessionId);
  }

  sql += ' ORDER BY level, importance DESC, access_count DESC';

  const rows = db.prepare(sql).all(...params) as MemoryRow[];
  return rows.map(mapMemoryRow);
}

export function getDuplicateMemory(
  agentFolder: string,
  contentHash: string,
  level: string,
  userJid?: string,
): Memory | undefined {
  let sql =
    'SELECT * FROM memories WHERE agent_folder = ? AND content_hash = ? AND level = ?';
  const params: unknown[] = [agentFolder, contentHash, level];

  if (userJid) {
    sql += ' AND (user_jid = ? OR user_jid IS NULL)';
    params.push(userJid);
  }

  sql += ' ORDER BY created_at DESC LIMIT 1';

  const row = db.prepare(sql).get(...params) as MemoryRow | undefined;
  if (!row) return undefined;
  return mapMemoryRow(row);
}

export function updateMemory(
  id: string,
  updates: Partial<
    Pick<
      Memory,
      | 'content'
      | 'importance'
      | 'qualityScore'
      | 'embedding'
      | 'level'
      | 'updatedAt'
      | 'messageType'
      | 'timestampWeight'
      | 'sessionId'
      | 'tags'
      | 'sourceType'
      | 'scope'
    >
  >,
): void {
  const existing = db
    .prepare('SELECT scope, session_id FROM memories WHERE id = ?')
    .get(id) as { scope: string | null; session_id: string | null } | undefined;
  const nextScope = (updates.scope ?? existing?.scope ?? undefined) as
    | Memory['scope']
    | undefined;
  const nextSessionId = updates.sessionId ?? existing?.session_id ?? undefined;
  validateScopeSession(nextScope, nextSessionId);

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
    const contentHash = crypto
      .createHash('sha256')
      .update(updates.content)
      .digest('hex');
    fields.push('content_hash = ?');
    values.push(contentHash);
  }
  if (updates.importance !== undefined) {
    fields.push('importance = ?');
    values.push(updates.importance);
  }
  if (updates.qualityScore !== undefined) {
    fields.push('quality_score = ?');
    values.push(updates.qualityScore);
  }
  if (updates.embedding !== undefined) {
    fields.push('embedding = ?');
    values.push(JSON.stringify(updates.embedding));
  }
  if (updates.level !== undefined) {
    fields.push('level = ?');
    values.push(updates.level);
  }
  if (updates.messageType !== undefined) {
    fields.push('message_type = ?');
    values.push(updates.messageType);
  }
  if (updates.timestampWeight !== undefined) {
    fields.push('timestamp_weight = ?');
    values.push(updates.timestampWeight);
  }
  if (updates.sessionId !== undefined) {
    fields.push('session_id = ?');
    values.push(updates.sessionId);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.sourceType !== undefined) {
    fields.push('source_type = ?');
    values.push(updates.sourceType);
  }
  if (updates.scope !== undefined) {
    fields.push('scope = ?');
    values.push(updates.scope);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );
}

export function incrementMemoryAccess(memoryId: string): void {
  db.prepare(
    `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), memoryId);
}

export function deleteMemory(id: string): void {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}
