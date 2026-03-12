import { beforeEach, describe, expect, it } from 'vitest';

import {
  _initTestDatabase,
  getAllTasks,
  getTaskById,
  setRegisteredGroup,
} from './db.js';
import { scheduleAgentWakeup } from './collaboration-scheduler.js';
import type { CollaborationTask } from './types.js';

describe('collaboration scheduler wakeup', () => {
  beforeEach(() => {
    _initTestDatabase();
    setRegisteredGroup('agent-a@g.us', {
      name: 'Agent A',
      folder: 'agent-a',
      trigger: '@AgentA',
      added_at: new Date().toISOString(),
    });
  });

  it('creates wakeup task for assigned agent', () => {
    const task: CollaborationTask = {
      id: 'task-1',
      title: '协作任务',
      assignedAgents: ['agent-a'],
      status: 'pending',
      priority: 'high',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    scheduleAgentWakeup(task, 'agent-a', 'msg-1');

    const wakeup = getTaskById('collab-wakeup-task-1-agent-a');
    expect(wakeup).toBeDefined();
    expect(wakeup?.chat_jid).toBe('agent-a@g.us');
    expect(wakeup?.status).toBe('active');
  });

  it('deduplicates active wakeup task', () => {
    const task: CollaborationTask = {
      id: 'task-2',
      title: '协作任务2',
      assignedAgents: ['agent-a'],
      status: 'pending',
      priority: 'medium',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    scheduleAgentWakeup(task, 'agent-a', 'msg-1');
    scheduleAgentWakeup(task, 'agent-a', 'msg-2');

    const all = getAllTasks().filter((item) => item.id === 'collab-wakeup-task-2-agent-a');
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('active');
  });
});
