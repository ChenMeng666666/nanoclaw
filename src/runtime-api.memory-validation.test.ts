import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

vi.mock('./embedding-providers/registry.js', () => ({
  generateEmbedding: vi.fn(async () => [0.2, 0.2, 0.2]),
}));

import { _initTestDatabase } from './db.js';
import { createAgent } from './db-agents.js';
import { startRuntimeAPI } from './runtime-api.js';
import { MEMORY_CONFIG } from './config.js';

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
});
