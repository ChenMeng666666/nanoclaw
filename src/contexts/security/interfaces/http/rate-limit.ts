import type http from 'http';

import { RUNTIME_API_CONFIG, SECURITY_CONFIG } from '../../../../config.js';

const MEMORY_RATE_BUCKET_MAX_KEYS = 20000;

function isMemoryApiPath(path: string): boolean {
  return (
    path === '/api/memory/search' ||
    path === '/api/memory/add' ||
    path === '/api/memory/list' ||
    path === '/api/memory/metrics/dashboard' ||
    path === '/api/memory/release/control' ||
    path === '/api/memory/release/rollback'
  );
}

function isEvolutionApiPath(path: string): boolean {
  return (
    path === '/api/evolution/metrics/dashboard' ||
    path === '/api/governance/metrics/dashboard' ||
    path === '/api/evolution/query' ||
    path === '/api/evolution/submit' ||
    path === '/api/evolution/feedback' ||
    path === '/api/evolution/select-gene'
  );
}

function resolveClientIdentity(req: http.IncomingMessage): string {
  if (RUNTIME_API_CONFIG.trustProxy) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (typeof xForwardedFor === 'string') {
      const forwarded = xForwardedFor.split(',')[0]?.trim();
      if (forwarded) {
        return forwarded;
      }
    }
  }
  return req.socket.remoteAddress || 'unknown';
}

export function createRuntimeRateLimitGuard(): {
  reset(): void;
  isRateLimitedApiPath(path: string): boolean;
  consume(req: http.IncomingMessage, now: number): boolean;
} {
  const memoryRateBucket = new Map<
    string,
    { count: number; windowStart: number }
  >();

  const cleanupRateLimitBucket = (now: number, windowMs: number): void => {
    for (const [key, value] of memoryRateBucket.entries()) {
      if (now - value.windowStart > windowMs * 2) {
        memoryRateBucket.delete(key);
      }
    }
    if (memoryRateBucket.size > MEMORY_RATE_BUCKET_MAX_KEYS) {
      const entries = [...memoryRateBucket.entries()].sort(
        (a, b) => a[1].windowStart - b[1].windowStart,
      );
      const removeCount = memoryRateBucket.size - MEMORY_RATE_BUCKET_MAX_KEYS;
      for (let i = 0; i < removeCount; i++) {
        memoryRateBucket.delete(entries[i][0]);
      }
    }
  };

  const consumeRateLimitToken = (clientId: string, now: number): boolean => {
    const windowMs = SECURITY_CONFIG.networkSecurity.rateLimitWindow;
    const maxCount = SECURITY_CONFIG.networkSecurity.rateLimit;
    if (memoryRateBucket.size > MEMORY_RATE_BUCKET_MAX_KEYS) {
      cleanupRateLimitBucket(now, windowMs);
    }
    const current = memoryRateBucket.get(clientId);
    if (!current || now - current.windowStart >= windowMs) {
      memoryRateBucket.set(clientId, { count: 1, windowStart: now });
      return true;
    }
    if (current.count >= maxCount) {
      return false;
    }
    current.count += 1;
    memoryRateBucket.set(clientId, current);
    return true;
  };

  return {
    reset() {
      memoryRateBucket.clear();
    },
    isRateLimitedApiPath(path: string): boolean {
      return isMemoryApiPath(path) || isEvolutionApiPath(path);
    },
    consume(req: http.IncomingMessage, now: number): boolean {
      const clientId = resolveClientIdentity(req);
      return consumeRateLimitToken(clientId, now);
    },
  };
}
