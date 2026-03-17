import type { EcosystemMetrics } from '../../../../../types/gep.js';
import { getDb } from './shared.js';

export function getEcosystemMetrics(limit: number = 30): EcosystemMetrics[] {
  const rows = getDb()
    .prepare('SELECT * FROM ecosystem_metrics ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as Array<{
    id: number;
    timestamp: string;
    shannon_diversity: number;
    avg_gdi_score: number;
    total_genes: number;
    total_capsules: number;
    promoted_genes: number;
    stale_genes: number;
    archived_genes: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    shannonDiversity: row.shannon_diversity,
    avgGDIScore: row.avg_gdi_score,
    totalGenes: row.total_genes,
    totalCapsules: row.total_capsules,
    promotedGenes: row.promoted_genes,
    staleGenes: row.stale_genes,
    archivedGenes: row.archived_genes,
    fitnessLandscape: [] as any,
    symbioticRelationships: [],
    macroEvolutionEvents: [],
    negentropyReduction: 0,
  }));
}
