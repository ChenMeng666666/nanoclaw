import { describe, it, expect, vi } from 'vitest';

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs: number = 100,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

describe('task scheduler integration', () => {
  it('pauses invalid-folder tasks under real timer loop', async () => {
    const originalPollInterval = process.env.SCHEDULER_POLL_INTERVAL;
    vi.resetModules();
    process.env.SCHEDULER_POLL_INTERVAL = '5000';
    const db = await import('./db.js');
    const scheduler = await import('./task-scheduler.js');

    try {
      db._initTestDatabase();
      scheduler._resetSchedulerLoopForTests();

      db.createTask({
        id: 'task-invalid-folder-real-timer',
        group_folder: '../outside',
        chat_jid: 'bad@g.us',
        prompt: 'run',
        schedule_type: 'once',
        schedule_value: '2026-03-13T00:00:00.000Z',
        context_mode: 'isolated',
        next_run: new Date(Date.now() - 1000).toISOString(),
        status: 'active',
        created_at: '2026-03-13T00:00:00.000Z',
      });

      const enqueueTask = vi.fn(
        async (_groupJid: string, _taskId: string, fn: () => Promise<void>) => {
          await fn();
        },
      );

      scheduler.startSchedulerLoop({
        registeredGroups: () => ({}),
        getSessions: () => ({}),
        queue: { enqueueTask } as any,
        onProcess: vi.fn(async () => {}),
        sendMessage: vi.fn(async () => {}),
      });

      const reached = await waitFor(() => {
        const task = db.getTaskById('task-invalid-folder-real-timer');
        return task?.status === 'paused';
      }, 7000);

      expect(reached).toBe(true);
      expect(enqueueTask).toHaveBeenCalledWith(
        'bad@g.us',
        'task-invalid-folder-real-timer',
        expect.any(Function),
      );
    } finally {
      scheduler._resetSchedulerLoopForTests();
      if (originalPollInterval === undefined) {
        delete process.env.SCHEDULER_POLL_INTERVAL;
      } else {
        process.env.SCHEDULER_POLL_INTERVAL = originalPollInterval;
      }
      vi.resetModules();
    }
  });
});
