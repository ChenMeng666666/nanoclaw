import Database from 'better-sqlite3';
import crypto from 'crypto';
import { EvolutionEntry } from '../../../../types.js';
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

export function getEvolutionEntry(id: number): EvolutionEntry | undefined {
  const row = db.prepare('SELECT * FROM evolution_log WHERE id = ?').get(id) as
    | {
        id: number;
        ability_name: string;
        description: string | null;
        source_agent_id: string | null;
        content: string;
        content_embedding: string | null;
        tags: string | null;
        status: string;
        reviewed_by: string | null;
        reviewed_at: string | null;
        feedback: string | null;
        gdi_score: string | null;
        category: string | null;
        signals_match: string | null;
        strategy: string | null;
        constraints: string | null;
        validation: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    abilityName: row.ability_name,
    description: row.description || '',
    sourceAgentId: row.source_agent_id || '',
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status as 'pending' | 'reviewing' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    feedback: safeJsonParse(row.feedback, []),
    gdi_score: safeJsonParse(row.gdi_score, undefined),
    gdiScore: safeJsonParse(row.gdi_score, undefined),
    category:
      (row.category as 'repair' | 'optimize' | 'innovate' | 'learn') || 'learn',
    signalsMatch: safeJsonParse(row.signals_match, []),
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  };
}

export function getDuplicateEvolutionEntry(
  abilityName: string,
  contentHash: string,
  timeWindowHours: number = 24,
): EvolutionEntry | undefined {
  const timeThreshold = new Date(
    Date.now() - timeWindowHours * 60 * 60 * 1000,
  ).toISOString();
  const row = db
    .prepare(
      `SELECT * FROM evolution_log
       WHERE ability_name = ? AND content_hash = ? AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(abilityName, contentHash, timeThreshold) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    abilityName: row.ability_name,
    description: row.description || '',
    sourceAgentId: row.source_agent_id || '',
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status as 'pending' | 'reviewing' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    feedback: safeJsonParse(row.feedback, []),
    gdi_score: safeJsonParse((row as any).gdi_score, undefined),
    gdiScore: safeJsonParse((row as any).gdi_score, undefined),
    category:
      (row.category as 'repair' | 'optimize' | 'innovate' | 'learn') || 'learn',
    signalsMatch: safeJsonParse(row.signals_match, []),
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  };
}

export function getApprovedEvolutionEntries(
  tags?: string[],
  limit: number = 20,
): EvolutionEntry[] {
  let sql = `
    SELECT * FROM evolution_log
    WHERE status = 'approved'
  `;
  const params: unknown[] = [];

  if (tags && tags.length > 0) {
    sql += ` AND EXISTS (
      SELECT 1 FROM json_each(tags) WHERE value IN (${tags.map(() => '?').join(',')})
    )`;
    params.push(...tags);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    ability_name: string;
    description: string | null;
    source_agent_id: string | null;
    content: string;
    content_embedding: string | null;
    tags: string | null;
    status: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    feedback: string | null;
    gdi_score: string | null;
    category: string | null;
    signals_match: string | null;
    strategy: string | null;
    constraints: string | null;
    validation: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    abilityName: row.ability_name,
    description: row.description || '',
    sourceAgentId: row.source_agent_id || '',
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status as 'pending' | 'reviewing' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    feedback: safeJsonParse(row.feedback, []),
    gdi_score: safeJsonParse(row.gdi_score, undefined),
    gdiScore: safeJsonParse(row.gdi_score, undefined),
    category:
      (row.category as 'repair' | 'optimize' | 'innovate' | 'learn') || 'learn',
    signalsMatch: safeJsonParse(row.signals_match, []),
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  }));
}

export function getEvolutionEntriesByCategory(
  category: 'repair' | 'optimize' | 'innovate' | 'learn',
  limit: number = 20,
): EvolutionEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM evolution_log WHERE status = 'approved' AND category = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(category, limit) as Array<{
    id: number;
    ability_name: string;
    description: string | null;
    source_agent_id: string | null;
    content: string;
    content_embedding: string | null;
    tags: string | null;
    status: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    feedback: string | null;
    gdi_score: string | null;
    category: string | null;
    signals_match: string | null;
    strategy: string | null;
    constraints: string | null;
    validation: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    abilityName: row.ability_name,
    description: row.description || '',
    sourceAgentId: row.source_agent_id || '',
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status as 'pending' | 'reviewing' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    feedback: safeJsonParse(row.feedback, []),
    gdi_score: safeJsonParse(row.gdi_score, undefined),
    gdiScore: safeJsonParse(row.gdi_score, undefined),
    category:
      (row.category as 'repair' | 'optimize' | 'innovate' | 'learn') || 'learn',
    signalsMatch: safeJsonParse(row.signals_match, []),
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  }));
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

export function getCapsuleById(id: string): any | undefined {
  const row = db.prepare('SELECT * FROM capsules WHERE id = ?').get(id) as
    | {
        id: string;
        gene_id: number;
        trigger: string;
        summary: string;
        confidence: number;
        blast_radius: string;
        outcome: string;
        env_fingerprint: string;
        success_streak: number;
        approved_at: string;
        created_at: string;
      }
    | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    geneId: row.gene_id,
    trigger: safeJsonParse(row.trigger, []),
    summary: row.summary,
    confidence: row.confidence,
    blastRadius: safeJsonParse(row.blast_radius, { files: 0, lines: 0 }),
    outcome: safeJsonParse(row.outcome, { status: 'failed', score: 0 }),
    envFingerprint: safeJsonParse(row.env_fingerprint, {
      platform: '',
      arch: '',
    }),
    successStreak: row.success_streak,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

export function getCapsulesByGeneId(geneId: number): any[] {
  const rows = db
    .prepare('SELECT * FROM capsules WHERE gene_id = ? ORDER BY created_at ASC')
    .all(geneId) as Array<{
    id: string;
    gene_id: number;
    trigger: string;
    summary: string;
    confidence: number;
    blast_radius: string;
    outcome: string;
    env_fingerprint: string;
    success_streak: number;
    approved_at: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    geneId: row.gene_id,
    trigger: safeJsonParse(row.trigger, []),
    summary: row.summary,
    confidence: row.confidence,
    blastRadius: safeJsonParse(row.blast_radius, { files: 0, lines: 0 }),
    outcome: safeJsonParse(row.outcome, { status: 'failed', score: 0 }),
    envFingerprint: safeJsonParse(row.env_fingerprint, {
      platform: '',
      arch: '',
    }),
    successStreak: row.success_streak,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  }));
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

export function getAbilityChain(chainId: string): any | undefined {
  const row = db
    .prepare('SELECT * FROM ability_chains WHERE chain_id = ?')
    .get(chainId) as
    | {
        chain_id: string;
        genes: string;
        capsules: string;
        description: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return undefined;

  return {
    chainId: row.chain_id,
    genes: safeJsonParse(row.genes, []),
    capsules: safeJsonParse(row.capsules, []),
    description: row.description || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

export function getValidationReportsByGeneId(geneId: number): any[] {
  const rows = db
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
    geneId: row.gene_id,
    timestamp: row.timestamp,
    commands: safeJsonParse(row.commands, []),
    success: row.success === 1,
    environment: safeJsonParse(row.environment, {}),
    testResults: safeJsonParse(row.test_results, undefined),
    error: row.error,
  }));
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

export function getEcosystemMetrics(limit: number = 30): any[] {
  const rows = db
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
  }));
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

export function getEvolutionEntriesByStatus(
  status: 'promoted' | 'stale' | 'archived',
  limit: number = 20,
): any[] {
  const rows = db
    .prepare(
      'SELECT * FROM evolution_log WHERE ecosystem_status = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(status, limit) as any[];
  return rows.map((row) => ({
    id: row.id,
    abilityName: row.ability_name,
    description: row.description,
    sourceAgentId: row.source_agent_id,
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    feedback: safeJsonParse(row.feedback, []),
    category: row.category,
    signalsMatch: safeJsonParse(row.signals_match, []),
    summary: row.summary,
    preconditions: safeJsonParse(row.preconditions, []),
    validationCommands: safeJsonParse(row.validation_commands, []),
    chainId: row.chain_id,
    gdi_score: safeJsonParse(row.gdi_score, undefined),
    gdiScore: safeJsonParse(row.gdi_score, undefined),
    ecosystemStatus: row.ecosystem_status,
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  }));
}

export function getEvolutionEntryByAssetId(assetId: string): any | undefined {
  const row = db
    .prepare('SELECT * FROM evolution_log WHERE asset_id = ?')
    .get(assetId) as any;
  if (!row) return undefined;

  return {
    id: row.id,
    abilityName: row.ability_name,
    description: row.description,
    sourceAgentId: row.source_agent_id,
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    feedback: safeJsonParse(row.feedback, []),
    category: row.category,
    signalsMatch: safeJsonParse(row.signals_match, []),
    summary: row.summary,
    preconditions: safeJsonParse(row.preconditions, []),
    validationCommands: safeJsonParse(row.validation_commands, []),
    chainId: row.chain_id,
    gdi_score: safeJsonParse(row.gdi_score, undefined),
    gdiScore: safeJsonParse(row.gdi_score, undefined),
    ecosystemStatus: row.ecosystem_status,
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  };
}
