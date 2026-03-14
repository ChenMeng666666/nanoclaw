export type RolloutMode = 'stable' | 'canary' | 'auto';

export interface RetrievalRolloutConfig {
  mode: RolloutMode;
  canaryEnabled: boolean;
  canaryPercentage: number;
  vectorSearchMinScore: number;
  lowConfidenceThreshold: number;
  rerankWeights: {
    fused: number;
    vector: number;
    bm25: number;
    quality: number;
    timestamp: number;
    importance: number;
  };
}

export interface MigrationRuleConfig {
  l1ToL2MinAccessCount: number;
  l1ToL2MinIdleDays: number;
  l2ToL3MinIdleDays: number;
  l2ToL3MinImportance: number;
  migratedContentPrefix: string;
}

export interface MigrationRolloutConfig {
  mode: RolloutMode;
  canaryEnabled: boolean;
  canaryPercentage: number;
  canaryRules: Partial<MigrationRuleConfig>;
}

export interface MemoryReleaseControl {
  retrieval: RetrievalRolloutConfig;
  migration: MigrationRolloutConfig;
  updatedAt: string;
}

export interface UpdateReleaseControlInput {
  retrieval?: Partial<RetrievalRolloutConfig>;
  migration?: Partial<MigrationRolloutConfig>;
}

export function safeParseReleaseControl(
  raw: string,
): MemoryReleaseControl | null {
  try {
    const parsed = JSON.parse(raw) as MemoryReleaseControl;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (!parsed.retrieval || !parsed.migration || !parsed.updatedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
