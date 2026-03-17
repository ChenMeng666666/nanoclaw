import { CronExpressionParser } from 'cron-parser';

import { TIMEZONE } from '../config.js';

const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z)?$/;
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;

export function parseIntervalMs(value: unknown): number | null {
  const raw =
    typeof value === 'number' || typeof value === 'string'
      ? String(value).trim()
      : '';
  if (!/^\d+$/.test(raw)) return null;
  const intervalMs = Number(raw);
  if (!Number.isSafeInteger(intervalMs)) return null;
  if (intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) return null;
  return intervalMs;
}

export function parseOnceTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!ISO_8601_PATTERN.test(raw)) return null;
  const parsedDate = new Date(raw);
  if (isNaN(parsedDate.getTime())) return null;
  return parsedDate.toISOString();
}

export function computeNextRun(
  scheduleType: 'cron' | 'interval' | 'once',
  scheduleValue: string,
): string | null {
  if (scheduleType === 'cron') {
    try {
      const interval = CronExpressionParser.parse(scheduleValue, {
        tz: TIMEZONE,
      });
      return interval.next().toISOString();
    } catch {
      return null;
    }
  }
  if (scheduleType === 'interval') {
    const intervalMs = parseIntervalMs(scheduleValue);
    if (intervalMs === null) {
      return null;
    }
    return new Date(Date.now() + intervalMs).toISOString();
  }
  return parseOnceTimestamp(scheduleValue);
}
