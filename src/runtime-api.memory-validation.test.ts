import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

vi.mock('./embedding-providers/registry.js', () => ({
  generateEmbedding: vi.fn(async () => [0.2, 0.2, 0.2]),
}));

import { _initTestDatabase } from './db.js';
import { createAgent } from './db-agents.js';
import { startRuntimeAPI } from './runtime-api.js';
import { MEMORY_CONFIG } from './config.js';
import { memoryManager } from './memory-manager.js';

describe('runtime api memory validation', () => {
  let server: import('http').Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    _initTestDatabase();
    createAgent({
      id: 'agent-runtime-api-memory',
      name: 'Agent Runtime API Memory',
      folder: 'agent-runtime-api-memory',
      credentials: {
        anthropicModel: 'claude-sonnet-4-6',
      },
    });

    process.env.RUNTIME_API_KEY = 'test-key';
    process.env.RUNTIME_API_ENABLED = 'true';

    server = await startRuntimeAPI({ port: 0, enabled: true });
    await new Promise<void>((resolve) => {
      server!.on('listening', () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }
    delete process.env.RUNTIME_API_KEY;
    delete process.env.RUNTIME_API_ENABLED;
    delete process.env.RUNTIME_API_ALLOW_NO_AUTH;
    vi.restoreAllMocks();
  });

  it('rejects invalid level and invalid limit', async () => {
    const invalidLevel = await fetch(`${baseUrl}/api/memory/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        content: 'hello',
        level: 'L9',
      }),
    });
    const invalidLevelBody = (await invalidLevel.json()) as {
      code?: string;
    };

    const invalidLimit = await fetch(`${baseUrl}/api/memory/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        query: 'hello',
        limit: MEMORY_CONFIG.api.maxLimit + 1,
      }),
    });
    const invalidLimitBody = (await invalidLimit.json()) as {
      code?: string;
    };

    expect(invalidLevel.status).toBe(400);
    expect(invalidLevelBody.code).toBe('INVALID_LEVEL');
    expect(invalidLimit.status).toBe(400);
    expect(invalidLimitBody.code).toBe('INVALID_LIMIT');
  });

  it('rejects invalid scope-session combinations', async () => {
    const missingSession = await fetch(`${baseUrl}/api/memory/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        content: 'session memory',
        scope: 'session',
      }),
    });
    const mismatchedScope = await fetch(`${baseUrl}/api/memory/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        content: 'user memory',
        scope: 'user',
        sessionId: 's-1',
      }),
    });

    expect(missingSession.status).toBe(400);
    expect(mismatchedScope.status).toBe(400);
  });

  it('rejects overlong content and oversized body', async () => {
    const overlongContent = 'x'.repeat(MEMORY_CONFIG.api.maxContentLength + 1);
    const overlongResponse = await fetch(`${baseUrl}/api/memory/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        content: overlongContent,
      }),
    });

    const oversizedPayload = JSON.stringify({
      agentFolder: 'agent-runtime-api-memory',
      content: 'x'.repeat(MEMORY_CONFIG.api.maxRequestBodyBytes + 1024),
    });
    let oversizedStatus: number | null = null;
    try {
      const oversizedResponse = await fetch(`${baseUrl}/api/memory/add`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test-key',
        },
        body: oversizedPayload,
      });
      oversizedStatus = oversizedResponse.status;
    } catch {
      oversizedStatus = 413;
    }

    expect(overlongResponse.status).toBe(400);
    expect(oversizedStatus).toBe(413);
  });

  it('returns memory explain payload for search hits', async () => {
    await fetch(`${baseUrl}/api/memory/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        content: 'alpha query expansion design',
        level: 'L2',
        tags: ['alpha'],
      }),
    });

    const response = await fetch(`${baseUrl}/api/memory/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        query: 'alpha query',
        limit: 5,
      }),
    });
    const body = (await response.json()) as {
      memories?: Array<{ explain?: { scores?: { final?: number } } }>;
    };

    expect(response.status).toBe(200);
    expect(body.memories?.length).toBeGreaterThan(0);
    expect(body.memories?.[0]?.explain?.scores?.final).toBeTypeOf('number');
  });

  it('returns memory dashboard metrics', async () => {
    await memoryManager.setWorkingMemory(
      'agent-runtime-api-memory',
      'cache warmup content',
    );
    await memoryManager.getWorkingMemory('agent-runtime-api-memory');
    await fetch(`${baseUrl}/api/memory/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        content: 'dashboard keyword record',
        level: 'L2',
      }),
    });
    await fetch(`${baseUrl}/api/memory/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-runtime-api-memory',
        query: 'dashboard keyword',
        limit: 5,
      }),
    });

    const response = await fetch(
      `${baseUrl}/api/memory/metrics/dashboard?timelineLimit=5`,
      {
        method: 'GET',
        headers: {
          'x-api-key': 'test-key',
        },
      },
    );
    const body = (await response.json()) as {
      summary?: {
        counters?: { totalSearches?: number };
        retrievalLatencyMs?: { avg?: number };
      };
      timeline?: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.summary?.counters?.totalSearches).toBeGreaterThan(0);
    expect(body.summary?.retrievalLatencyMs?.avg).toBeTypeOf('number');
    expect(Array.isArray(body.timeline)).toBe(true);
  });

  it('supports release control update and rollback', async () => {
    const updateResponse = await fetch(
      `${baseUrl}/api/memory/release/control`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test-key',
        },
        body: JSON.stringify({
          operator: 'test-suite',
          reason: 'enable canary',
          retrieval: {
            mode: 'auto',
            canaryEnabled: true,
            canaryPercentage: 25,
            lowConfidenceThreshold: 0.55,
          },
          migration: {
            mode: 'auto',
            canaryEnabled: true,
            canaryPercentage: 30,
            canaryRules: {
              l2ToL3MinImportance: 0.62,
            },
          },
        }),
      },
    );
    const updateBody = (await updateResponse.json()) as {
      operationId?: string;
      control?: {
        retrieval?: { canaryPercentage?: number };
      };
    };

    expect(updateResponse.status).toBe(200);
    expect(updateBody.operationId).toBeTruthy();
    expect(updateBody.control?.retrieval?.canaryPercentage).toBe(25);

    const rollbackResponse = await fetch(
      `${baseUrl}/api/memory/release/rollback`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test-key',
        },
        body: JSON.stringify({
          operationId: updateBody.operationId,
          operator: 'test-suite',
        }),
      },
    );
    const rollbackBody = (await rollbackResponse.json()) as {
      status?: string;
      control?: {
        retrieval?: { mode?: string };
      };
    };

    expect(rollbackResponse.status).toBe(200);
    expect(rollbackBody.status).toBe('rolled_back');
    expect(rollbackBody.control?.retrieval?.mode).toBe('stable');
  });

  it('enforces memory api rate limiting', async () => {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': 'test-key',
      'x-forwarded-for': `rate-limit-${Date.now()}`,
    };
    const total = 160;
    let limited = false;
    for (let i = 0; i < total; i++) {
      const response = await fetch(
        `${baseUrl}/api/memory/list?agentFolder=agent-runtime-api-memory`,
        {
          method: 'GET',
          headers,
        },
      );
      if (response.status === 429) {
        const body = (await response.json()) as { code?: string };
        expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it('rejects excessive concurrent memory searches', async () => {
    vi.spyOn(memoryManager, 'searchMemoriesDetailed').mockImplementation(
      async () =>
        await new Promise((resolve) =>
          setTimeout(
            () => resolve([]),
            MEMORY_CONFIG.api.searchTimeoutMs - 400,
          ),
        ),
    );
    const headers = {
      'content-type': 'application/json',
      'x-api-key': 'test-key',
      'x-forwarded-for': `concurrency-${Date.now()}`,
    };
    const requests = Array.from(
      { length: MEMORY_CONFIG.api.maxConcurrentSearches + 2 },
      () =>
        fetch(`${baseUrl}/api/memory/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            agentFolder: 'agent-runtime-api-memory',
            query: 'parallel load',
            limit: 3,
          }),
        }),
    );
    const responses = await Promise.all(requests);
    const rejected = responses.filter((item) => item.status === 429);
    expect(rejected.length).toBeGreaterThan(0);
    if (rejected.length > 0) {
      const payload = (await rejected[0].json()) as { code?: string };
      expect(
        payload.code === 'MEMORY_SEARCH_CONCURRENCY_LIMIT' ||
          payload.code === 'RATE_LIMIT_EXCEEDED',
      ).toBe(true);
    }
  });

  it('fails startup when runtime api key is missing by default', async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }
    delete process.env.RUNTIME_API_KEY;
    delete process.env.RUNTIME_API_ALLOW_NO_AUTH;

    await expect(startRuntimeAPI({ port: 0, enabled: true })).rejects.toThrow(
      'RUNTIME_API_KEY',
    );
  });

  it('allows explicit no-auth mode when enabled', async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }
    delete process.env.RUNTIME_API_KEY;
    process.env.RUNTIME_API_ALLOW_NO_AUTH = 'true';

    server = await startRuntimeAPI({ port: 0, enabled: true });
    await new Promise<void>((resolve) => {
      server!.on('listening', () => resolve());
    });
    const address = server.address() as AddressInfo;
    const noAuthUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${noAuthUrl}/api/evolution/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: 'no-auth-health-check',
        limit: 1,
      }),
    });
    expect(response.status).toBe(200);
  });
});
