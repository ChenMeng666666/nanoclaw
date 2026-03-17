import { createApiError } from '../../../../../interfaces/http/response.js';
import {
  compactRecord,
  parseOptionalIntegerInRange,
  parseOptionalNumberInRange,
  parseOptionalString,
} from './shared.js';

function parseReleaseMode(
  value: unknown,
  field: string,
): 'stable' | 'canary' | 'auto' | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value !== 'stable' && value !== 'canary' && value !== 'auto') {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be one of stable, canary, auto`,
    );
  }
  return value;
}

function parseOptionalRerankWeights(value: unknown):
  | {
      fused?: number;
      vector?: number;
      bm25?: number;
      quality?: number;
      timestamp?: number;
      importance?: number;
    }
  | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value !== 'object') {
    throw createApiError(
      400,
      'INVALID_RERANK_WEIGHTS',
      'rerankWeights must be an object',
    );
  }
  const obj = value as Record<string, unknown>;
  return compactRecord({
    fused: parseOptionalNumberInRange(obj.fused, 'rerankWeights.fused', 0, 5),
    vector: parseOptionalNumberInRange(
      obj.vector,
      'rerankWeights.vector',
      0,
      5,
    ),
    bm25: parseOptionalNumberInRange(obj.bm25, 'rerankWeights.bm25', 0, 5),
    quality: parseOptionalNumberInRange(
      obj.quality,
      'rerankWeights.quality',
      0,
      5,
    ),
    timestamp: parseOptionalNumberInRange(
      obj.timestamp,
      'rerankWeights.timestamp',
      0,
      5,
    ),
    importance: parseOptionalNumberInRange(
      obj.importance,
      'rerankWeights.importance',
      0,
      5,
    ),
  });
}

export function parseReleaseControlPatch(body: Record<string, unknown>): {
  retrieval?: Record<string, unknown>;
  migration?: Record<string, unknown>;
} {
  const retrievalInput =
    body.retrieval && typeof body.retrieval === 'object'
      ? (body.retrieval as Record<string, unknown>)
      : undefined;
  const migrationInput =
    body.migration && typeof body.migration === 'object'
      ? (body.migration as Record<string, unknown>)
      : undefined;
  if (!retrievalInput && !migrationInput) {
    throw createApiError(
      400,
      'INVALID_RELEASE_PATCH',
      'retrieval or migration patch is required',
    );
  }

  const retrievalPatch = retrievalInput
    ? {
        mode: parseReleaseMode(retrievalInput.mode, 'retrieval.mode'),
        canaryEnabled:
          typeof retrievalInput.canaryEnabled === 'boolean'
            ? retrievalInput.canaryEnabled
            : undefined,
        canaryPercentage: parseOptionalIntegerInRange(
          retrievalInput.canaryPercentage,
          'retrieval.canaryPercentage',
          0,
          100,
        ),
        vectorSearchMinScore: parseOptionalNumberInRange(
          retrievalInput.vectorSearchMinScore,
          'retrieval.vectorSearchMinScore',
          0,
          1,
        ),
        lowConfidenceThreshold: parseOptionalNumberInRange(
          retrievalInput.lowConfidenceThreshold,
          'retrieval.lowConfidenceThreshold',
          0,
          1,
        ),
        rerankWeights: parseOptionalRerankWeights(retrievalInput.rerankWeights),
      }
    : undefined;

  const migrationRulesInput =
    migrationInput?.canaryRules &&
    typeof migrationInput.canaryRules === 'object'
      ? (migrationInput.canaryRules as Record<string, unknown>)
      : undefined;
  const migrationPatch = migrationInput
    ? {
        mode: parseReleaseMode(migrationInput.mode, 'migration.mode'),
        canaryEnabled:
          typeof migrationInput.canaryEnabled === 'boolean'
            ? migrationInput.canaryEnabled
            : undefined,
        canaryPercentage: parseOptionalIntegerInRange(
          migrationInput.canaryPercentage,
          'migration.canaryPercentage',
          0,
          100,
        ),
        canaryRules: migrationRulesInput
          ? {
              l1ToL2MinAccessCount: parseOptionalIntegerInRange(
                migrationRulesInput.l1ToL2MinAccessCount,
                'migration.canaryRules.l1ToL2MinAccessCount',
                1,
                100,
              ),
              l1ToL2MinIdleDays: parseOptionalNumberInRange(
                migrationRulesInput.l1ToL2MinIdleDays,
                'migration.canaryRules.l1ToL2MinIdleDays',
                0,
                365,
              ),
              l2ToL3MinIdleDays: parseOptionalNumberInRange(
                migrationRulesInput.l2ToL3MinIdleDays,
                'migration.canaryRules.l2ToL3MinIdleDays',
                0,
                365,
              ),
              l2ToL3MinImportance: parseOptionalNumberInRange(
                migrationRulesInput.l2ToL3MinImportance,
                'migration.canaryRules.l2ToL3MinImportance',
                0,
                1,
              ),
              migratedContentPrefix: parseOptionalString(
                migrationRulesInput.migratedContentPrefix,
              ),
            }
          : undefined,
      }
    : undefined;

  return {
    retrieval: compactRecord(retrievalPatch),
    migration: compactRecord(migrationPatch),
  };
}
