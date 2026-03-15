import type Database from 'better-sqlite3';
import { parseStringArray } from '../mappers/json-mapper.js';

export function createCollaborationTask(
  database: Database.Database,
  task: {
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
  },
): void {
  database
    .prepare(
      `
    INSERT OR REPLACE INTO collaboration_tasks (
      id, title, description, team_id, assigned_agents, status, priority, progress, dependencies, context, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
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

export function getCollaborationTaskById(
  database: Database.Database,
  id: string,
) {
  const row = database
    .prepare('SELECT * FROM collaboration_tasks WHERE id = ?')
    .get(id) as
    | {
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
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    teamId: row.team_id,
    assignedAgents: parseStringArray(row.assigned_agents),
    status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    priority: row.priority as 'low' | 'medium' | 'high' | 'critical',
    progress: row.progress,
    dependencies: parseStringArray(row.dependencies),
    context: row.context,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export function getAllCollaborationTasks(database: Database.Database) {
  const rows = database
    .prepare('SELECT * FROM collaboration_tasks')
    .all() as Array<{
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
    assignedAgents: parseStringArray(row.assigned_agents),
    status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    priority: row.priority as 'low' | 'medium' | 'high' | 'critical',
    progress: row.progress,
    dependencies: parseStringArray(row.dependencies),
    context: row.context,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }));
}

export function updateCollaborationTask(
  database: Database.Database,
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
  const fields: string[] = [];
  const params: unknown[] = [];

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
    database
      .prepare(
        `
      UPDATE collaboration_tasks
      SET ${fields.join(', ')}
      WHERE id = ?
    `,
      )
      .run(...params);
  }
}

export function deleteCollaborationTask(
  database: Database.Database,
  id: string,
): void {
  database.prepare('DELETE FROM collaboration_tasks WHERE id = ?').run(id);
}
