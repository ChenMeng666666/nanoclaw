import type { EvolutionEntry } from '../../../../../types/evolution.js';
import { getDb, mapEvolutionLogRow, type EvolutionLogRow } from './shared.js';

export interface ApprovedEvolutionEntriesQuery {
  tags?: string[];
  limit?: number;
}

function getApprovedEvolutionEntriesByQuery(
  query: ApprovedEvolutionEntriesQuery,
): EvolutionEntry[] {
  const limit = query.limit ?? 20;
  let sql = `
    SELECT * FROM evolution_log
    WHERE status = 'approved'
  `;
  const params: unknown[] = [];

  if (query.tags && query.tags.length > 0) {
    sql += ` AND EXISTS (
      SELECT 1 FROM json_each(tags) WHERE value IN (${query.tags.map(() => '?').join(',')})
    )`;
    params.push(...query.tags);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = getDb()
    .prepare(sql)
    .all(...params) as EvolutionLogRow[];
  return rows.map(mapEvolutionLogRow);
}

export function getEvolutionEntry(id: number): EvolutionEntry | undefined {
  const row = getDb()
    .prepare('SELECT * FROM evolution_log WHERE id = ?')
    .get(id) as EvolutionLogRow | undefined;
  if (!row) {
    return undefined;
  }
  return mapEvolutionLogRow(row);
}

export function getDuplicateEvolutionEntry(
  abilityName: string,
  contentHash: string,
  timeWindowHours: number = 24,
): EvolutionEntry | undefined {
  const timeThreshold = new Date(
    Date.now() - timeWindowHours * 60 * 60 * 1000,
  ).toISOString();
  const row = getDb()
    .prepare(
      `SELECT * FROM evolution_log
       WHERE ability_name = ? AND content_hash = ? AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(abilityName, contentHash, timeThreshold) as
    | EvolutionLogRow
    | undefined;
  if (!row) {
    return undefined;
  }
  return mapEvolutionLogRow(row);
}

export function getApprovedEvolutionEntries(
  tags?: string[],
  limit: number = 20,
): EvolutionEntry[] {
  return getApprovedEvolutionEntriesByQuery({ tags, limit });
}

export function getEvolutionEntriesByCategory(
  category: 'repair' | 'optimize' | 'innovate' | 'learn',
  limit: number = 20,
): EvolutionEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM evolution_log WHERE status = 'approved' AND category = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(category, limit) as EvolutionLogRow[];
  return rows.map(mapEvolutionLogRow);
}

export function getEvolutionEntriesByStatus(
  status: 'promoted' | 'stale' | 'archived',
  limit: number = 20,
): EvolutionEntry[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM evolution_log WHERE ecosystem_status = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(status, limit) as EvolutionLogRow[];
  return rows.map(mapEvolutionLogRow);
}

export function getEvolutionEntryByAssetId(
  assetId: string,
): EvolutionEntry | undefined {
  const row = getDb()
    .prepare('SELECT * FROM evolution_log WHERE asset_id = ?')
    .get(assetId) as EvolutionLogRow | undefined;
  if (!row) {
    return undefined;
  }
  return mapEvolutionLogRow(row);
}
