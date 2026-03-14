import { beforeEach, describe, expect, it, vi } from 'vitest';

const { scheduleMock, stopSpies, destroySpies } = vi.hoisted(() => {
  const stopSpies: Array<ReturnType<typeof vi.fn>> = [];
  const destroySpies: Array<ReturnType<typeof vi.fn>> = [];
  const scheduleMock = vi.fn(() => {
    const stop = vi.fn();
    const destroy = vi.fn();
    stopSpies.push(stop);
    destroySpies.push(destroy);
    return { stop, destroy };
  });
  return { scheduleMock, stopSpies, destroySpies };
});

vi.mock('node-cron', () => ({
  default: {
    schedule: scheduleMock,
  },
}));

import { ReflectionScheduler } from './application/scheduling/reflection-scheduler.js';

describe('reflection scheduler lifecycle', () => {
  beforeEach(() => {
    scheduleMock.mockClear();
    stopSpies.length = 0;
    destroySpies.length = 0;
  });

  it('stops and destroys all cron tasks', () => {
    const scheduler = new ReflectionScheduler();

    scheduler.start();
    expect(scheduleMock).toHaveBeenCalledTimes(7);

    scheduler.stop();
    expect(stopSpies).toHaveLength(7);
    expect(destroySpies).toHaveLength(7);
    for (const stop of stopSpies) {
      expect(stop).toHaveBeenCalledTimes(1);
    }
    for (const destroy of destroySpies) {
      expect(destroy).toHaveBeenCalledTimes(1);
    }
  });

  it('does not register duplicate tasks while running', () => {
    const scheduler = new ReflectionScheduler();

    scheduler.start();
    scheduler.start();

    expect(scheduleMock).toHaveBeenCalledTimes(7);
    scheduler.stop();
  });
});
