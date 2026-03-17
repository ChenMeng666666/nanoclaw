import { createApiError } from '../../../../../interfaces/http/response.js';
import { parseRequiredIntegerInRange } from './shared.js';

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
