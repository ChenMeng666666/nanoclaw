import fs from 'fs';
import { describe, expect, it, beforeEach } from 'vitest';

import { createScheduledTaskForLearning } from './db-agents.js';
import { _initTestDatabase, getTaskById } from './db.js';

describe('learning p0 contracts', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('stores learning scheduled task with scheduler-compatible cron type', () => {
    const taskId = createScheduledTaskForLearning(
      'agent-folder',
      'chat-1',
      '学习主题A',
      'cron',
      '0 20 * * *',
      '2026-03-14T20:00:00',
    );

    const task = getTaskById(taskId);
    expect(task).toBeDefined();
    expect(task?.schedule_type).toBe('cron');
    expect(task?.schedule_value).toBe('0 20 * * *');
  });

  it('injects runtime api key header in learning automation scripts', () => {
    const root = new URL('..', import.meta.url).pathname;
    const scripts = [
      `${root}/container/skills/agent-learning/scripts/trigger-daily-plan.sh`,
      `${root}/container/skills/agent-learning/scripts/trigger-reflection.sh`,
      `${root}/container/skills/agent-learning/scripts/generate-daily-summary.sh`,
    ];

    for (const scriptPath of scripts) {
      const content = fs.readFileSync(scriptPath, 'utf8');
      expect(content).toContain('X-API-Key');
    }
  });
});
