import { beforeEach, describe, expect, it } from 'vitest';

import { _initTestDatabase } from './db.js';
import {
  normalizeLearningNeeds,
  inferPlanPriority,
  splitToPoints,
  analyzeLearningOutcome,
} from './runtime-api.js';

describe('runtime-api helpers', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('normalizes learning needs and filters invalid items', () => {
    const normalized = normalizeLearningNeeds([
      {
        topic: '  强化错误恢复能力  ',
        level: 'advanced',
        urgency: 'high',
        estimatedTime: 2.4,
        resources: ['a', 1, 'b'],
      },
      { topic: '' },
      null,
    ]);

    expect(normalized).toEqual([
      {
        topic: '强化错误恢复能力',
        level: 'advanced',
        urgency: 'high',
        estimatedTime: 2,
        resources: ['a', 'b'],
      },
    ]);
  });

  it('infers plan priority by urgency', () => {
    expect(
      inferPlanPriority([
        {
          topic: 'x',
          level: 'beginner',
          urgency: 'medium',
          estimatedTime: 1,
          resources: [],
        },
      ]),
    ).toBe('medium');

    expect(
      inferPlanPriority([
        {
          topic: 'x',
          level: 'beginner',
          urgency: 'high',
          estimatedTime: 1,
          resources: [],
        },
      ]),
    ).toBe('high');
  });

  it('splits text into useful points', () => {
    const points = splitToPoints(
      '问题：任务失败。解决：增加重试；改进：补充监控。\n- 下一步：加入回归测试',
    );
    expect(points.length).toBeGreaterThan(0);
    expect(points.some((point) => point.includes('解决'))).toBe(true);
  });

  it('returns explicit message when learning task not found', () => {
    const outcome = analyzeLearningOutcome('task-not-exists');
    expect(outcome.taskId).toBe('task-not-exists');
    expect(outcome.difficulties[0]).toContain('未找到对应学习任务');
  });
});
