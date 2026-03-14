import crypto from 'crypto';

export const GEP_SCHEMA_VERSION = '1.5.0';

export interface GEPAsset {
  type: 'Gene' | 'Capsule' | 'EvolutionEvent';
  schema_version: string;
  asset_id: string;
  model_name?: string;
}

export function generateAssetId(content: string): string {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `sha256:${hash}`;
}

export interface GEPGene extends GEPAsset {
  type: 'Gene';
  category: 'repair' | 'optimize' | 'innovate';
  signals_match: string[];
  summary: string;
  preconditions: string[];
  validation_commands: string[];
  chain_id?: string;
  gdi_score?: GDIScore;
  status: 'promoted' | 'stale' | 'archived';
  id: number;
  ability_name: string;
  description?: string;
  source_agent_id: string;
  content: string;
  content_embedding?: number[];
  tags: string[];
  feedback: Array<{
    agent_id: string;
    comment: string;
    rating: number;
    used_at?: string;
  }>;
  created_at: string;
}

export interface GEPCapsule extends GEPAsset {
  type: 'Capsule';
  trigger: string[];
  gene: string;
  summary: string;
  confidence: number;
  blast_radius: {
    files: number;
    lines: number;
  };
  outcome: {
    status: 'success' | 'partial' | 'failed';
    score: number;
  };
  env_fingerprint: {
    platform: string;
    arch: string;
    runtime?: string;
    dependencies?: string[];
  };
  success_streak: number;
  gene_id: number;
  approved_at: string;
}

export interface GDIScore {
  intrinsicQuality: number;
  usageMetrics: number;
  socialSignals: number;
  freshness: number;
  total: number;
}

export interface AbilityChain {
  chain_id: string;
  genes: string[];
  capsules: string[];
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ValidationReport {
  id: number;
  gene_id: number;
  timestamp: string;
  commands: string[];
  success: boolean;
  environment: {
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  test_results?: Record<string, unknown>;
  error?: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarity: number;
  reason?: string;
  existingAssetId?: string;
}

export interface EcosystemMetrics {
  shannonDiversity: number;
  fitnessLandscape: Array<{ timestamp: string; avgSuccess: number }>;
  symbioticRelationships: Array<{
    geneA: number;
    geneB: number;
    cooccurrence: number;
  }>;
  macroEvolutionEvents: Array<{
    type: 'cambrian_explosion' | 'mass_extinction';
    timestamp: string;
    description: string;
    geneCount: number;
  }>;
  negentropyReduction: number;
  totalGenes: number;
  totalCapsules: number;
  promotedGenes: number;
  staleGenes: number;
  archivedGenes: number;
  avgGDIScore: number;
}

export type EvolutionStrategy =
  | 'balanced'
  | 'repair'
  | 'optimize'
  | 'innovate'
  | 'repair-only';

export interface StrategyConfig {
  name: EvolutionStrategy;
  prioritizeRepair: boolean;
  explorationRate: number;
  riskTolerance: 'low' | 'medium' | 'high';
}

export const STRATEGY_CONFIGS: Record<EvolutionStrategy, StrategyConfig> = {
  balanced: {
    name: 'balanced',
    prioritizeRepair: false,
    explorationRate: 0.3,
    riskTolerance: 'medium',
  },
  repair: {
    name: 'repair',
    prioritizeRepair: true,
    explorationRate: 0.1,
    riskTolerance: 'low',
  },
  optimize: {
    name: 'optimize',
    prioritizeRepair: false,
    explorationRate: 0.2,
    riskTolerance: 'medium',
  },
  innovate: {
    name: 'innovate',
    prioritizeRepair: false,
    explorationRate: 0.5,
    riskTolerance: 'high',
  },
  'repair-only': {
    name: 'repair-only',
    prioritizeRepair: true,
    explorationRate: 0,
    riskTolerance: 'low',
  },
};
