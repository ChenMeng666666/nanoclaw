import type http from 'http';
import type { SignalType } from '../../../signal-extractor.js';

import { MEMORY_CONFIG } from '../../../config.js';
import { safeJsonParse } from '../../../security.js';
import { createApiError } from '../response.js';

const MEMORY_LEVELS = new Set(['L1', 'L2', 'L3']);
const MEMORY_SCOPES = new Set(['session', 'user', 'agent', 'global']);
const MEMORY_SOURCE_TYPES = new Set(['direct', 'extracted', 'summary']);
const MEMORY_MESSAGE_TYPES = new Set([
  'user',
  'system',
  'bot',
  'code',
  'document',
]);
const EVOLUTION_SIGNAL_TYPES = new Set<SignalType>([
  'capability_gap',
  'learning_opportunity',
  'knowledge_missing',
  'recurring_error',
  'performance_issue',
  'user_feedback',
  'negative_feedback',
  'positive_feedback',
  'stable_plateau',
  'learning_stagnation',
  'saturation',
  'feature_request',
  'improvement_suggestion',
  'innovation_idea',
]);

export function readJSON(
  req: http.IncomingMessage,
  maxBytes: number = MEMORY_CONFIG.api.maxRequestBodyBytes,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      const chunkText = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      body += chunkText;
      size += Buffer.byteLength(chunkText);
      if (size > maxBytes && !aborted) {
        aborted = true;
        reject(
          createApiError(
            413,
            'REQUEST_BODY_TOO_LARGE',
            `request body exceeds ${maxBytes} bytes`,
          ),
        );
        req.destroy();
      }
    });
    req.on('end', () => {
      if (aborted) {
        return;
      }
      try {
        resolve(safeJsonParse(body) as Record<string, unknown>);
      } catch {
        reject(createApiError(400, 'INVALID_JSON', 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} is required`,
    );
  }
  return value.trim();
}

export function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseOptionalStringWithLimit(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  const parsed = parseOptionalString(value);
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed.length > maxLength) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} exceeds ${maxLength} characters`,
    );
  }
  return parsed;
}

export function parseLearningResultStatus(
  value: unknown,
  field: string,
): 'keep' | 'discard' | 'crash' {
  if (value === 'keep' || value === 'discard' || value === 'crash') {
    return value;
  }
  throw createApiError(
    400,
    `INVALID_${field.toUpperCase()}`,
    `${field} must be one of keep, discard, crash`,
  );
}

export function parseOptionalBlastRadius(
  value: unknown,
  field: string,
): { files: number; lines: number } | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be an object`,
    );
  }
  const raw = value as Record<string, unknown>;
  const files = parseRequiredIntegerInRange(
    raw.files,
    `${field}.files`,
    0,
    1000000,
  );
  const lines = parseRequiredIntegerInRange(
    raw.lines,
    `${field}.lines`,
    0,
    100000000,
  );
  return { files, lines };
}

export function parseMemoryLevel(
  value: unknown,
  field: string,
): 'L1' | 'L2' | 'L3' {
  if (typeof value !== 'string' || !MEMORY_LEVELS.has(value)) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be one of L1, L2, L3`,
    );
  }
  return value as 'L1' | 'L2' | 'L3';
}

export function parseOptionalMemoryScope(
  value: unknown,
  field: string,
): 'session' | 'user' | 'agent' | 'global' | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !MEMORY_SCOPES.has(value)) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be one of session, user, agent, global`,
    );
  }
  return value as 'session' | 'user' | 'agent' | 'global';
}

export function parseOptionalMemorySourceType(
  value: unknown,
  field: string,
): 'direct' | 'extracted' | 'summary' | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !MEMORY_SOURCE_TYPES.has(value)) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be one of direct, extracted, summary`,
    );
  }
  return value as 'direct' | 'extracted' | 'summary';
}

export function parseOptionalMemoryMessageType(
  value: unknown,
  field: string,
): 'user' | 'system' | 'bot' | 'code' | 'document' | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !MEMORY_MESSAGE_TYPES.has(value)) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be one of user, system, bot, code, document`,
    );
  }
  return value as 'user' | 'system' | 'bot' | 'code' | 'document';
}

export function parseOptionalStringArray(
  value: unknown,
  field: string,
): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be an array`,
    );
  }
  const parsed = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parsed.length > 0 ? parsed : undefined;
}

export function parseOptionalSignalTypes(
  value: unknown,
  field: string,
): SignalType[] | undefined {
  const parsed = parseOptionalStringArray(value, field);
  if (!parsed) {
    return undefined;
  }
  const invalidSignal = parsed.find(
    (item) => !EVOLUTION_SIGNAL_TYPES.has(item as SignalType),
  );
  if (invalidSignal) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} contains invalid signal type: ${invalidSignal}`,
    );
  }
  return parsed as SignalType[];
}

export function normalizeMemoryScope(
  scope: 'session' | 'user' | 'agent' | 'global' | undefined,
  sessionId: string | undefined,
): 'session' | 'user' | 'agent' | 'global' | undefined {
  if (scope === 'session' && !sessionId) {
    throw createApiError(
      400,
      'INVALID_SESSIONID',
      'sessionId is required when scope=session',
    );
  }
  if (scope && scope !== 'session' && sessionId) {
    throw createApiError(
      400,
      'INVALID_SCOPE_SESSION_COMBINATION',
      'sessionId can only be used with scope=session',
    );
  }
  if (!scope && sessionId) {
    return 'session';
  }
  return scope;
}

export function parseMemoryLimit(value: unknown): number {
  const defaultLimit = 10;
  if (value === undefined) {
    return defaultLimit;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw createApiError(400, 'INVALID_LIMIT', 'limit must be an integer');
  }
  if (
    value < MEMORY_CONFIG.api.minLimit ||
    value > MEMORY_CONFIG.api.maxLimit
  ) {
    throw createApiError(
      400,
      'INVALID_LIMIT',
      `limit must be between ${MEMORY_CONFIG.api.minLimit} and ${MEMORY_CONFIG.api.maxLimit}`,
    );
  }
  return value;
}

export function parseEvolutionLimit(value: unknown): number {
  const defaultLimit = 20;
  if (value === undefined) {
    return defaultLimit;
  }
  const parsed = parseOptionalIntegerInRange(
    value,
    'limit',
    MEMORY_CONFIG.api.minLimit,
    MEMORY_CONFIG.api.maxLimit,
  );
  return parsed ?? defaultLimit;
}

export function parseRequiredIntegerInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const parsed = parseOptionalIntegerInRange(value, field, min, max);
  if (parsed === undefined) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} is required`,
    );
  }
  return parsed;
}

export function parseOptionalIntegerInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be an integer between ${min} and ${max}`,
    );
  }
  return parsed;
}

export function parseEvolutionCategory(
  value: unknown,
): 'repair' | 'optimize' | 'innovate' | 'learn' | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (
    value !== 'repair' &&
    value !== 'optimize' &&
    value !== 'innovate' &&
    value !== 'learn'
  ) {
    throw createApiError(
      400,
      'INVALID_CATEGORY',
      'category must be one of repair, optimize, innovate, learn',
    );
  }
  return value;
}

export function parseOptionalNumberInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw createApiError(
      400,
      `INVALID_${field.toUpperCase()}`,
      `${field} must be between ${min} and ${max}`,
    );
  }
  return parsed;
}

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

function compactRecord<T extends Record<string, unknown>>(
  input: T | undefined,
): T | undefined {
  if (!input) {
    return undefined;
  }
  const filtered = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
  if (Object.keys(filtered).length === 0) {
    return undefined;
  }
  return filtered;
}
