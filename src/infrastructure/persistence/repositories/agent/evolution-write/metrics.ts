import { getDb } from './shared.js';

export function createEcosystemMetrics(metrics: {
  shannonDiversity: number;
  avgGDIScore: number;
  totalGenes: number;
  totalCapsules: number;
  promotedGenes: number;
  staleGenes: number;
  archivedGenes: number;
}): number {
  const result = getDb()
    .prepare(
      `
    INSERT INTO ecosystem_metrics (
      timestamp, shannon_diversity, avg_gdi_score, total_genes, total_capsules,
      promoted_genes, stale_genes, archived_genes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      new Date().toISOString(),
      metrics.shannonDiversity,
      metrics.avgGDIScore,
      metrics.totalGenes,
      metrics.totalCapsules,
      metrics.promotedGenes,
      metrics.staleGenes,
      metrics.archivedGenes,
    );

  return result.lastInsertRowid as number;
}
