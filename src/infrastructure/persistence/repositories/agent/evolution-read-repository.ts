import type Database from 'better-sqlite3';
import type { EvolutionEntry } from '../../../../types/evolution.js';
import type {
  GEPCapsule,
  AbilityChain,
  ValidationReport,
  EcosystemMetrics,
} from '../../../../types/gep.js';
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
        chain_id: string | null;
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
    chain_id: row.chain_id || undefined,
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
    .get(abilityName, contentHash, timeThreshold) as
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
        chain_id: string | null;
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

export function getCapsuleById(id: string): GEPCapsule | undefined {
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

export function getCapsulesByGeneId(geneId: number): GEPCapsule[] {
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

export function getAbilityChain(chainId: string): AbilityChain | undefined {
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

export function getValidationReportsByGeneId(
  geneId: number,
): ValidationReport[] {
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

export function getEcosystemMetrics(limit: number = 30): EcosystemMetrics[] {
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

export function getEvolutionEntriesByStatus(
  status: 'promoted' | 'stale' | 'archived',
  limit: number = 20,
): EvolutionEntry[] {
  const rows = db
    .prepare(
      'SELECT * FROM evolution_log WHERE ecosystem_status = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(status, limit) as Array<{
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
    chain_id: string | null;
    ecosystem_status: string;
    preconditions: string | null;
    validation_commands: string | null;
    summary: string | null;
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
    chainId: row.chain_id || undefined,
    ecosystemStatus: row.ecosystem_status,
  }));
}

export function getEvolutionEntryByAssetId(
  assetId: string,
): EvolutionEntry | undefined {
  const row = db
    .prepare('SELECT * FROM evolution_log WHERE asset_id = ?')
    .get(assetId) as
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
        chain_id: string | null;
        ecosystem_status: string;
        preconditions: string | null;
        validation_commands: string | null;
        summary: string | null;
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
    chainId: row.chain_id || undefined,
    ecosystemStatus: row.ecosystem_status,
  };
}
