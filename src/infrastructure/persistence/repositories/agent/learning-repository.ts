import Database from 'better-sqlite3';
import { LearningTask, Reflection } from '../../../../types.js';
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

export function createReflection(
  reflection: Omit<Reflection, 'id' | 'createdAt'>,
): number {
  const result = db
    .prepare(
      `
    INSERT INTO reflections (agent_folder, type, content, triggered_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(
      reflection.agentFolder,
      reflection.type,
      reflection.content,
      reflection.triggeredBy || null,
      new Date().toISOString(),
    );
  return result.lastInsertRowid as number;
}

export function getReflectionsByAgent(
  agentFolder: string,
  type?: string,
): Reflection[] {
  let sql =
    'SELECT * FROM reflections WHERE agent_folder = ? ORDER BY created_at DESC';
  const params: unknown[] = [agentFolder];

  if (type) {
    sql =
      'SELECT * FROM reflections WHERE agent_folder = ? AND type = ? ORDER BY created_at DESC';
    params.push(type);
  }

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    agent_folder: string;
    type: string;
    content: string;
    triggered_by: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    agentFolder: row.agent_folder,
    type: row.type as
      | 'hourly'
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'yearly'
      | 'task',
    content: row.content,
    triggeredBy: row.triggered_by || undefined,
    createdAt: row.created_at,
  }));
}

export function createLearningTask(
  task: Omit<LearningTask, 'completedAt'>,
): void {
  db.prepare(
    `
    INSERT INTO learning_tasks (id, agent_folder, description, status, reflection_id, resources, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.agentFolder,
    task.description,
    task.status || 'pending',
    task.reflectionId || null,
    task.resources ? JSON.stringify(task.resources) : null,
    new Date().toISOString(),
  );
}

export function getLearningTask(id: string): LearningTask | undefined {
  const row = db
    .prepare('SELECT * FROM learning_tasks WHERE id = ?')
    .get(id) as
    | {
        id: string;
        agent_folder: string;
        description: string;
        status: string;
        reflection_id: number | null;
        resources: string | null;
        created_at: string;
        completed_at: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    agentFolder: row.agent_folder,
    description: row.description,
    status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    reflectionId: row.reflection_id || undefined,
    resources: safeJsonParse(row.resources, undefined),
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  };
}

export function getLearningTasksByAgent(agentFolder: string): LearningTask[] {
  const rows = db
    .prepare(
      'SELECT * FROM learning_tasks WHERE agent_folder = ? ORDER BY created_at DESC',
    )
    .all(agentFolder) as Array<{
    id: string;
    agent_folder: string;
    description: string;
    status: string;
    reflection_id: number | null;
    resources: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    agentFolder: row.agent_folder,
    description: row.description,
    status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    reflectionId: row.reflection_id || undefined,
    resources: safeJsonParse(row.resources, undefined),
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  }));
}

export function updateLearningTask(
  id: string,
  updates: Partial<
    Pick<LearningTask, 'status' | 'reflectionId' | 'completedAt'>
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.reflectionId !== undefined) {
    fields.push('reflection_id = ?');
    values.push(updates.reflectionId);
  }
  if (updates.completedAt !== undefined) {
    fields.push('completed_at = ?');
    values.push(updates.completedAt);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE learning_tasks SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );
}

export interface LearningResultEntry {
  id: number;
  taskId?: string;
  agentFolder: string;
  metricBefore?: number;
  metricAfter?: number;
  metricName?: string;
  status: 'keep' | 'discard' | 'crash';
  description?: string;
  signals?: string[];
  geneId?: string;
  blastRadius?: { files: number; lines: number };
  createdAt: string;
}

export function createLearningResult(
  result: Omit<LearningResultEntry, 'id' | 'createdAt'>,
): number {
  const dbResult = db
    .prepare(
      `
    INSERT INTO learning_results (
      task_id, agent_folder, metric_before, metric_after, metric_name,
      status, description, signals, gene_id, blast_radius, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      result.taskId || null,
      result.agentFolder,
      result.metricBefore ?? null,
      result.metricAfter ?? null,
      result.metricName || null,
      result.status,
      result.description || null,
      result.signals ? JSON.stringify(result.signals) : null,
      result.geneId || null,
      result.blastRadius ? JSON.stringify(result.blastRadius) : null,
      new Date().toISOString(),
    );
  return dbResult.lastInsertRowid as number;
}

export function getLearningResult(id: number): LearningResultEntry | undefined {
  const row = db
    .prepare('SELECT * FROM learning_results WHERE id = ?')
    .get(id) as
    | {
        id: number;
        task_id: string | null;
        agent_folder: string;
        metric_before: number | null;
        metric_after: number | null;
        metric_name: string | null;
        status: string;
        description: string | null;
        signals: string | null;
        gene_id: string | null;
        blast_radius: string | null;
        created_at: string;
      }
    | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    taskId: row.task_id || undefined,
    agentFolder: row.agent_folder,
    metricBefore: row.metric_before ?? undefined,
    metricAfter: row.metric_after ?? undefined,
    metricName: row.metric_name || undefined,
    status: row.status as 'keep' | 'discard' | 'crash',
    description: row.description || undefined,
    signals: safeJsonParse(row.signals, undefined),
    geneId: row.gene_id || undefined,
    blastRadius: safeJsonParse(row.blast_radius, undefined),
    createdAt: row.created_at,
  };
}

export function getLearningResultsByAgent(
  agentFolder: string,
  limit: number = 50,
): LearningResultEntry[] {
  const rows = db
    .prepare(
      'SELECT * FROM learning_results WHERE agent_folder = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(agentFolder, limit) as Array<{
    id: number;
    task_id: string | null;
    agent_folder: string;
    metric_before: number | null;
    metric_after: number | null;
    metric_name: string | null;
    status: string;
    description: string | null;
    signals: string | null;
    gene_id: string | null;
    blast_radius: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id || undefined,
    agentFolder: row.agent_folder,
    metricBefore: row.metric_before ?? undefined,
    metricAfter: row.metric_after ?? undefined,
    metricName: row.metric_name || undefined,
    status: row.status as 'keep' | 'discard' | 'crash',
    description: row.description || undefined,
    signals: safeJsonParse(row.signals, undefined),
    geneId: row.gene_id || undefined,
    blastRadius: safeJsonParse(row.blast_radius, undefined),
    createdAt: row.created_at,
  }));
}

export function getRecentLearningResults(
  limit: number = 10,
): LearningResultEntry[] {
  const rows = db
    .prepare('SELECT * FROM learning_results ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{
    id: number;
    task_id: string | null;
    agent_folder: string;
    metric_before: number | null;
    metric_after: number | null;
    metric_name: string | null;
    status: string;
    description: string | null;
    signals: string | null;
    gene_id: string | null;
    blast_radius: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id || undefined,
    agentFolder: row.agent_folder,
    metricBefore: row.metric_before ?? undefined,
    metricAfter: row.metric_after ?? undefined,
    metricName: row.metric_name || undefined,
    status: row.status as 'keep' | 'discard' | 'crash',
    description: row.description || undefined,
    signals: safeJsonParse(row.signals, undefined),
    geneId: row.gene_id || undefined,
    blastRadius: safeJsonParse(row.blast_radius, undefined),
    createdAt: row.created_at,
  }));
}
