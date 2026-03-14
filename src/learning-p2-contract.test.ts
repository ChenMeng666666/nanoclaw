import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgent } from './db-agents.js';
import { _initTestDatabase, getTasksForGroup } from './db.js';
import { startRuntimeAPI } from './runtime-api.js';

describe('learning p2 contracts', () => {
  let server: import('http').Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    _initTestDatabase();
    createAgent({
      id: 'agent-learning-p2',
      name: 'Agent Learning P2',
      folder: 'agent-learning-p2',
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
  });

  it('keeps learning automation status aligned with scheduled task execution state', async () => {
    const startResp = await fetch(`${baseUrl}/api/learning/automation/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-learning-p2',
        dailyPlanTime: '09:15',
        dailySummaryTime: '22:45',
      }),
    });
    const startBody = (await startResp.json()) as {
      status?: string;
      tasks?: Array<{ type?: string; taskId?: string }>;
    };

    expect(startResp.status).toBe(200);
    expect(startBody.status).toBe('started');
    expect(startBody.tasks?.length).toBe(2);

    const statusRunningResp = await fetch(
      `${baseUrl}/api/learning/automation/status?agentFolder=agent-learning-p2`,
      {
        method: 'GET',
        headers: {
          'x-api-key': 'test-key',
        },
      },
    );
    const statusRunning = (await statusRunningResp.json()) as {
      desiredState?: string;
      observedState?: string;
      tasks?: Array<{ status?: string }>;
    };

    expect(statusRunningResp.status).toBe(200);
    expect(statusRunning.desiredState).toBe('running');
    expect(statusRunning.observedState).toBe('running');
    expect(statusRunning.tasks?.map((task) => task.status)).toEqual([
      'active',
      'active',
    ]);

    const firstTaskIds = getTasksForGroup('agent-learning-p2').map(
      (task) => task.id,
    );
    expect(firstTaskIds.length).toBe(2);

    const restartResp = await fetch(
      `${baseUrl}/api/learning/automation/start`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test-key',
        },
        body: JSON.stringify({
          agentFolder: 'agent-learning-p2',
        }),
      },
    );
    expect(restartResp.status).toBe(200);
    const secondTaskIds = getTasksForGroup('agent-learning-p2').map(
      (task) => task.id,
    );
    expect(secondTaskIds.length).toBe(2);
    expect(secondTaskIds).toEqual(firstTaskIds);

    const stopResp = await fetch(`${baseUrl}/api/learning/automation/stop`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-learning-p2',
      }),
    });
    expect(stopResp.status).toBe(200);

    const statusStoppedResp = await fetch(
      `${baseUrl}/api/learning/automation/status?agentFolder=agent-learning-p2`,
      {
        method: 'GET',
        headers: {
          'x-api-key': 'test-key',
        },
      },
    );
    const statusStopped = (await statusStoppedResp.json()) as {
      desiredState?: string;
      observedState?: string;
      tasks?: Array<{ status?: string }>;
    };

    expect(statusStoppedResp.status).toBe(200);
    expect(statusStopped.desiredState).toBe('stopped');
    expect(statusStopped.observedState).toBe('stopped');
    expect(statusStopped.tasks?.map((task) => task.status)).toEqual([
      'paused',
      'paused',
    ]);
  });
});
