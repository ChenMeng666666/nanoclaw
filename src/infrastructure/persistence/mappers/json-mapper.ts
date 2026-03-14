import { safeJsonParse } from '../../../security.js';

export function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  return safeJsonParse(value, []) as string[];
}

export function parseObject<T>(
  value: string | null | undefined,
  fallback: T,
): T {
  if (!value) return fallback;
  return safeJsonParse(value, fallback) as T;
}
