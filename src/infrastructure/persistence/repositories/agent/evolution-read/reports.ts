import type { ValidationReport } from '../../../../../types/gep.js';
import { safeJsonParse } from '../../../../../security.js';
import { getDb } from './shared.js';

export function getValidationReportsByGeneId(
  geneId: number,
): ValidationReport[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM validation_reports WHERE gene_id = ? ORDER BY timestamp DESC',
    )
    .all(geneId) as Array<{
    id: number;
    gene_id: number;
    timestamp: string;
    commands: string;
    success: number;
    environment: string;
    test_results: string;
    error: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    gene_id: row.gene_id,
    timestamp: row.timestamp,
    commands: safeJsonParse(row.commands, []),
    success: row.success === 1,
    environment: safeJsonParse(row.environment, {}) as any,
    test_results: safeJsonParse(row.test_results, undefined),
    error: row.error,
  }));
}
