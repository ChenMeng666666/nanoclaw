import { MEMORY_CONFIG } from '../../../../../config.js';
import { createApiError } from '../../../../../interfaces/http/response.js';
import { parseOptionalIntegerInRange } from './shared.js';

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
