import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgent } from './db-agents.js';
import { _initTestDatabase } from './db.js';
import { startRuntimeAPI } from './runtime-api.js';

describe('learning p1 contracts', () => {
  let server: import('http').Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    _initTestDatabase();
    createAgent({
      id: 'agent-learning-p1',
      name: 'Agent Learning P1',
      folder: 'agent-learning-p1',
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
    delete process.env.LEARNING_SDK_ENABLED;
    delete process.env.LEARNING_SDK_PREFERRED;
  });

  it('orchestrates learning intent with reflection check and schedule mapping', async () => {
    const response = await fetch(`${baseUrl}/api/learning/orchestrate-intent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-learning-p1',
        topic: '学习上下文工程',
        goal: '建立稳定编排链路',
        schedulePreference: {
          mode: 'fixed_time',
          fixedTime: '21:30',
        },
      }),
    });
    const body = (await response.json()) as {
      learningTaskId?: string;
      scheduleTaskId?: string;
      scheduleType?: string;
      scheduleValue?: string;
      reflectionPlan?: { taskId?: string };
      modelDecisions?: Array<{ stage?: string; selected?: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.learningTaskId).toBeTypeOf('string');
    expect(body.scheduleTaskId).toBeTypeOf('string');
    expect(body.scheduleType).toBe('cron');
    expect(body.scheduleValue).toContain('21');
    expect(body.reflectionPlan?.taskId).toBeTypeOf('string');
    expect(body.modelDecisions?.length).toBeGreaterThan(0);
  });

  it('accepts fallback id field in learning task start contract', async () => {
    const createResp = await fetch(`${baseUrl}/api/learning/task/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-learning-p1',
        description: '学习任务契约测试',
      }),
    });
    const created = (await createResp.json()) as { id: string };

    const startResp = await fetch(`${baseUrl}/api/learning/task/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-learning-p1',
        id: created.id,
      }),
    });
    const started = (await startResp.json()) as {
      taskId?: string;
      status?: string;
    };

    expect(startResp.status).toBe(200);
    expect(started.taskId).toBe(created.id);
    expect(started.status).toBe('in_progress');
  });

  it('creates standardized plan outputs for schedule and phase task alignment', async () => {
    const response = await fetch(`${baseUrl}/api/learning/plan/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-key',
      },
      body: JSON.stringify({
        agentFolder: 'agent-learning-p1',
        topic: '学习记忆系统',
        goal: '完成P1改造',
        phases: [{ name: '第一阶段' }, { name: '第二阶段' }],
        schedulePreference: {
          mode: 'interval',
          intervalMinutes: 90,
        },
      }),
    });
    const body = (await response.json()) as {
      scheduleType?: string;
      scheduleValue?: string;
      phaseTaskIds?: string[];
      scheduledTaskIds?: string[];
    };

    expect(response.status).toBe(200);
    expect(body.scheduleType).toBe('interval');
    expect(body.scheduleValue).toBe('90m');
    expect(body.phaseTaskIds?.length).toBe(2);
    expect(body.scheduledTaskIds?.length).toBe(2);
  });
});
