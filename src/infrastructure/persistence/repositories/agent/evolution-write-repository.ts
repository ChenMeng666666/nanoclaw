import Database from 'better-sqlite3';
import crypto from 'crypto';
import { safeJsonParse } from '../../../../security.js';
import { getDatabase as getPersistenceDatabase } from '../../sqlite/transaction-manager.js';
import {
  getEvolutionEntry,
  getAbilityChain,
} from './evolution-read-repository.js';

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

export interface CreateGeneInput {
  abilityName: string;
  description?: string;
  sourceAgentId: string;
  content: string;
  contentEmbedding?: number[];
  tags?: string[];
  status?: 'pending' | 'reviewing' | 'approved' | 'rejected';
  category?: 'repair' | 'optimize' | 'innovate' | 'learn';
  signalsMatch?: string[];
  strategy?: string[];
  constraints?: {
    maxFiles?: number;
    forbiddenPaths?: string[];
    applicableScenarios?: string[];
  };
  validation?: string[];
}

export function createEvolutionEntry(entry: CreateGeneInput): number {
  const contentHash = crypto
    .createHash('sha256')
    .update(entry.content)
    .digest('hex');
  const result = db
    .prepare(
      `
    INSERT INTO evolution_log (
      ability_name, description, source_agent_id, content, content_embedding, content_hash, tags, status,
      category, signals_match, strategy, constraints, validation, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      entry.abilityName,
      entry.description || null,
      entry.sourceAgentId,
      entry.content,
      entry.contentEmbedding ? JSON.stringify(entry.contentEmbedding) : null,
      contentHash,
      entry.tags ? JSON.stringify(entry.tags) : null,
      entry.status || 'pending',
      entry.category || 'learn',
      entry.signalsMatch ? JSON.stringify(entry.signalsMatch) : '[]',
      entry.strategy ? JSON.stringify(entry.strategy) : '[]',
      entry.constraints ? JSON.stringify(entry.constraints) : '{}',
      entry.validation ? JSON.stringify(entry.validation) : '[]',
      new Date().toISOString(),
    );
  return result.lastInsertRowid as number;
}

export function updateEvolutionStatus(
  id: number,
  status: 'pending' | 'reviewing' | 'approved' | 'rejected',
  reviewedBy?: string,
  feedback?: string,
): void {
  const fields: string[] = ['status = ?'];
  const values: unknown[] = [status];

  if (reviewedBy) {
    fields.push('reviewed_by = ?', 'reviewed_at = ?');
    values.push(reviewedBy, new Date().toISOString());
  }
  if (feedback) {
    const row = db
      .prepare('SELECT feedback FROM evolution_log WHERE id = ?')
      .get(id) as { feedback: string | null } | undefined;
    const existingFeedback = safeJsonParse(row?.feedback, []) as Array<{
      agentId: string;
      comment: string;
      rating: number;
      usedAt?: string;
    }>;
    existingFeedback.push({
      agentId: reviewedBy || 'system',
      comment: feedback,
      rating: status === 'approved' ? 5 : 1,
      usedAt: new Date().toISOString(),
    });
    fields.push('feedback = ?');
    values.push(JSON.stringify(existingFeedback));
  }

  values.push(id);
  db.prepare(`UPDATE evolution_log SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );
}

export function addEvolutionFeedback(
  id: number,
  agentId: string,
  comment: string,
  rating: number,
): void {
  const entry = getEvolutionEntry(id);
  if (!entry) return;

  const feedback = entry.feedback || [];
  feedback.push({
    agentId,
    comment,
    rating,
    usedAt: new Date().toISOString(),
  });

  db.prepare(`UPDATE evolution_log SET feedback = ? WHERE id = ?`).run(
    JSON.stringify(feedback),
    id,
  );
}

export function createCapsule(capsule: {
  id: string;
  geneId: number;
  trigger: string[];
  summary: string;
  confidence: number;
  blastRadius: { files: number; lines: number };
  outcome: { status: 'success' | 'partial' | 'failed'; score: number };
  envFingerprint: {
    platform: string;
    arch: string;
    runtime?: string;
    dependencies?: string[];
  };
  successStreak: number;
  approvedAt: string;
}): void {
  db.prepare(
    `
    INSERT INTO capsules (
      id, gene_id, trigger, summary, confidence, blast_radius, outcome, env_fingerprint,
      success_streak, approved_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    capsule.id,
    capsule.geneId,
    JSON.stringify(capsule.trigger),
    capsule.summary,
    capsule.confidence,
    JSON.stringify(capsule.blastRadius),
    JSON.stringify(capsule.outcome),
    JSON.stringify(capsule.envFingerprint),
    capsule.successStreak,
    capsule.approvedAt,
    new Date().toISOString(),
  );
}

export function updateCapsuleSuccessStreak(
  id: string,
  successStreak: number,
): void {
  db.prepare('UPDATE capsules SET success_streak = ? WHERE id = ?').run(
    successStreak,
    id,
  );
}

export function createAbilityChain(chain: {
  chainId: string;
  genes: string[];
  capsules: string[];
  description?: string;
}): void {
  db.prepare(
    `
    INSERT INTO ability_chains (chain_id, genes, capsules, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    chain.chainId,
    JSON.stringify(chain.genes),
    JSON.stringify(chain.capsules),
    chain.description || null,
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

export function updateAbilityChain(
  chainId: string,
  updates: {
    genes?: string[];
    capsules?: string[];
    description?: string;
  },
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.genes !== undefined) {
    fields.push('genes = ?');
    values.push(JSON.stringify(updates.genes));
  }

  if (updates.capsules !== undefined) {
    fields.push('capsules = ?');
    values.push(JSON.stringify(updates.capsules));
  }

  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(chainId);

  db.prepare(
    `UPDATE ability_chains SET ${fields.join(', ')} WHERE chain_id = ?`,
  ).run(...values);
}

export function addGeneToChain(chainId: string, geneAssetId: string): void {
  const chain = getAbilityChain(chainId);
  if (!chain) return;

  const genes = [...new Set([...chain.genes, geneAssetId])];
  updateAbilityChain(chainId, { genes });
}

export function addCapsuleToChain(
  chainId: string,
  capsuleAssetId: string,
): void {
  const chain = getAbilityChain(chainId);
  if (!chain) return;

  const capsules = [...new Set([...chain.capsules, capsuleAssetId])];
  updateAbilityChain(chainId, { capsules });
}

export function createValidationReport(report: {
  geneId: number;
  commands: string[];
  success: boolean;
  environment: { platform: string; arch: string; nodeVersion: string };
  testResults?: Record<string, unknown>;
  error?: string;
}): number {
  const result = db
    .prepare(
      `
    INSERT INTO validation_reports (
      gene_id, timestamp, commands, success, environment, test_results, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      report.geneId,
      new Date().toISOString(),
      JSON.stringify(report.commands),
      report.success ? 1 : 0,
      JSON.stringify(report.environment),
      report.testResults ? JSON.stringify(report.testResults) : null,
      report.error || null,
    );

  return result.lastInsertRowid as number;
}

export function createEcosystemMetrics(metrics: {
  shannonDiversity: number;
  avgGDIScore: number;
  totalGenes: number;
  totalCapsules: number;
  promotedGenes: number;
  staleGenes: number;
  archivedGenes: number;
}): number {
  const result = db
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

export function updateGeneChainId(id: number, chainId: string): void {
  db.prepare('UPDATE evolution_log SET chain_id = ? WHERE id = ?').run(
    chainId,
    id,
  );
}

export function updateGeneStatus(
  id: number,
  status: 'promoted' | 'stale' | 'archived',
): void {
  db.prepare('UPDATE evolution_log SET ecosystem_status = ? WHERE id = ?').run(
    status,
    id,
  );
}

export function updateGeneGDIScore(id: number, gdiScore: any): void {
  db.prepare('UPDATE evolution_log SET gdi_score = ? WHERE id = ?').run(
    JSON.stringify(gdiScore),
    id,
  );
}
