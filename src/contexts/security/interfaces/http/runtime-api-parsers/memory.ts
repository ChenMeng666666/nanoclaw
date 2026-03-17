import { MEMORY_CONFIG } from '../../../../../config.js';
import { createApiError } from '../../../../../interfaces/http/response.js';

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
