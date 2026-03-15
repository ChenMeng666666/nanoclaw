import Database from 'better-sqlite3';
import type { ScheduledTask, TaskRunLog } from '../../../types.js';

export function createTask(
  database: Database.Database,
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  database
    .prepare(
      `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
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

export function getTaskById(
  database: Database.Database,
  id: string,
): ScheduledTask | undefined {
  return database
    .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
    .get(id) as ScheduledTask | undefined;
}

export function getTasksForGroup(
  database: Database.Database,
  groupFolder: string,
): ScheduledTask[] {
  return database
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

export function getAllTasks(database: Database.Database): ScheduledTask[] {
  return database
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
}

export function updateTask(
  database: Database.Database,
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
  database
    .prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);
}

export function deleteTask(database: Database.Database, id: string): void {
  database.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  database.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function getDueTasks(database: Database.Database): ScheduledTask[] {
  const now = new Date().toISOString();
  return database
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
  database: Database.Database,
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  database
    .prepare(
      `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
    )
    .run(nextRun, now, lastResult, nextRun, id);
}

export function logTaskRun(database: Database.Database, log: TaskRunLog): void {
  database
    .prepare(
      `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      log.task_id,
      log.run_at,
      log.duration_ms,
      log.status,
      log.result,
      log.error,
    );
}
