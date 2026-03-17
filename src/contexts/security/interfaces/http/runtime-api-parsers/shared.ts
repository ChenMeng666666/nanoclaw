import type http from 'http';

import { MEMORY_CONFIG } from '../../../../../config.js';
import { safeJsonParse } from '../../../../../security.js';
import { createApiError } from '../../../../../interfaces/http/response.js';

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

export function compactRecord<T extends Record<string, unknown>>(
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
