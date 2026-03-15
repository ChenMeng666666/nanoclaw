import type Database from 'better-sqlite3';
import crypto from 'crypto';
import { safeJsonParse } from '../../../../security.js';
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

export interface AuditLogEntry {
  agentFolder?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export function logAudit(entry: AuditLogEntry): void {
  db.prepare(
    `
    INSERT INTO audit_log (agent_folder, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    entry.agentFolder || null,
    entry.action,
    entry.entityType,
    entry.entityId || null,
    entry.details ? JSON.stringify(entry.details) : null,
    new Date().toISOString(),
  );
}

export function createScheduledTaskForLearning(
  groupFolder: string,
  chatJid: string,
  prompt: string,
  scheduleType: 'cron' | 'interval' | 'once',
  scheduleValue: string,
  nextRun: string,
): string {
  const id = `learning_${groupFolder}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, next_run, status, created_at, context_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'isolated')
  `,
  ).run(
    id,
    groupFolder,
    chatJid || `${groupFolder}_learning`,
    prompt,
    scheduleType,
    scheduleValue,
    nextRun,
    'active',
    now,
  );

  return id;
}

export function getAuditLogs(
  agentFolder?: string,
  limit: number = 100,
): Array<AuditLogEntry & { createdAt: string }> {
  let sql = 'SELECT * FROM audit_log';
  const params: unknown[] = [];

  if (agentFolder) {
    sql += ' WHERE agent_folder = ?';
    params.push(agentFolder);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    agent_folder: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    agentFolder: row.agent_folder || undefined,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || undefined,
    details: safeJsonParse(row.details, undefined),
    createdAt: row.created_at,
  }));
}
