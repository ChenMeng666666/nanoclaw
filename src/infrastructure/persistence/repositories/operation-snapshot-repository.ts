import Database from 'better-sqlite3';

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

export function createOperationSnapshot(
  database: Database.Database,
  snapshot: Omit<OperationSnapshot, 'id'>,
): number {
  const result = database
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

export function getOperationSnapshotByOperationId(
  database: Database.Database,
  operationId: string,
): OperationSnapshot | undefined {
  const row = database
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

export function updateOperationSnapshot(
  database: Database.Database,
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
  database
    .prepare(
      `UPDATE operation_snapshots SET ${fields.join(', ')} WHERE operation_id = ?`,
    )
    .run(...values);
}

export function getOperationSnapshots(
  database: Database.Database,
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

  const rows = database.prepare(sql).all(...params) as Array<{
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

export function deleteOperationSnapshot(
  database: Database.Database,
  operationId: string,
): void {
  database
    .prepare('DELETE FROM operation_snapshots WHERE operation_id = ?')
    .run(operationId);
}

export function cleanupOperationSnapshots(
  database: Database.Database,
  keepDays: number = 7,
): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  database
    .prepare('DELETE FROM operation_snapshots WHERE timestamp < ?')
    .run(cutoffDate.toISOString());
}
