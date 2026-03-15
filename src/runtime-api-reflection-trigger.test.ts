import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type * as dbAgentsType from './db-agents.js';

const mocks = vi.hoisted(() => ({
  triggerReflection: vi.fn(),
  getAgentByFolder: vi.fn(),
}));

vi.mock('./application/learning/reflection-executor.js', () => ({
  reflectionExecutor: {
    triggerReflection: mocks.triggerReflection,
    createLearningTask: vi.fn(),
    completeLearningTask: vi.fn(),
  },
}));

vi.mock('./db-agents.js', async () => {
  const actual = await vi.importActual<typeof dbAgentsType>('./db-agents.js');
  return {
    ...actual,
    getAgentByFolder: mocks.getAgentByFolder,
  };
});

import { startRuntimeAPI } from './runtime-api.js';

describe('runtime-api reflection trigger endpoint', () => {
  let server: Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    process.env.RUNTIME_API_KEY = 'test-key';
    process.env.RUNTIME_API_ENABLED = 'true';

    mocks.getAgentByFolder.mockReset();
    mocks.triggerReflection.mockReset();

    server = await startRuntimeAPI({ port: 3476, enabled: true });
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
    delete process.env.NODE_ENV;
    delete process.env.RUNTIME_API_ALLOW_NO_AUTH;
  });

  it('triggers reflection for a valid agent and type', async () => {
    mocks.getAgentByFolder.mockReturnValue({
      id: 'a1',
      name: 'Agent One',
      folder: 'agent-one',
      isActive: true,
      credentials: { anthropicModel: 'x' },
    });
    mocks.triggerReflection.mockResolvedValue(undefined);

    const response = await fetch(`${baseUrl}/api/reflection/trigger`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-one',
        type: 'daily',
        triggeredBy: 'manual',
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe('triggered');
    expect(mocks.triggerReflection).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'agent-one' }),
      'daily',
      'manual',
    );
  });

  it('returns 404 when agent does not exist', async () => {
    mocks.getAgentByFolder.mockReturnValue(undefined);

    const response = await fetch(`${baseUrl}/api/reflection/trigger`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'missing-agent',
        type: 'daily',
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.error).toBe('Agent not found');
    expect(mocks.triggerReflection).not.toHaveBeenCalled();
  });

  it('returns 400 when reflection type is invalid', async () => {
    mocks.getAgentByFolder.mockReturnValue({
      id: 'a1',
      name: 'Agent One',
      folder: 'agent-one',
      isActive: true,
      credentials: { anthropicModel: 'x' },
    });

    const response = await fetch(`${baseUrl}/api/reflection/trigger`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-one',
        type: 'invalid',
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid reflection type');
    expect(mocks.triggerReflection).not.toHaveBeenCalled();
  });

  it('accepts yearly reflection type', async () => {
    mocks.getAgentByFolder.mockReturnValue({
      id: 'a1',
      name: 'Agent One',
      folder: 'agent-one',
      isActive: true,
      credentials: { anthropicModel: 'x' },
    });
    mocks.triggerReflection.mockResolvedValue(undefined);

    const response = await fetch(`${baseUrl}/api/reflection/trigger`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-one',
        type: 'yearly',
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.type).toBe('yearly');
    expect(mocks.triggerReflection).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'agent-one' }),
      'yearly',
      undefined,
    );
  });

  it('accepts requests without api key when explicitly enabling no-auth mode', async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }

    delete process.env.RUNTIME_API_KEY;
    process.env.RUNTIME_API_ALLOW_NO_AUTH = 'true';

    server = await startRuntimeAPI({ port: 3476, enabled: true });
    await new Promise<void>((resolve) => {
      server!.on('listening', () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    mocks.getAgentByFolder.mockReturnValue({
      id: 'a1',
      name: 'Agent One',
      folder: 'agent-one',
      isActive: true,
      credentials: { anthropicModel: 'x' },
    });
    mocks.triggerReflection.mockResolvedValue(undefined);

    const response = await fetch(`${baseUrl}/api/reflection/trigger`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        agentFolder: 'agent-one',
        type: 'daily',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.triggerReflection).toHaveBeenCalledOnce();
  });
});
