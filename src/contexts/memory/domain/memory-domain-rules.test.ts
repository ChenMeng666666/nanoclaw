import { describe, expect, it } from 'vitest';

import { memoryDomainRules } from './memory-domain-rules.js';

describe('memory domain rules', () => {
  it('calculates importance within range', () => {
    const importance = memoryDomainRules.calculateImportance(
      '这是一个需要长期保留的重要经验',
      'L2',
    );
    expect(importance).toBeGreaterThan(0);
    expect(importance).toBeLessThanOrEqual(1);
  });

  it('merges tags with deduplication', () => {
    const merged = memoryDomainRules.mergeTags(
      ['learning', 'runtime'],
      ['runtime', 'security'],
    );
    expect(merged).toEqual(['learning', 'runtime', 'security']);
  });

  it('appends lifecycle content when no conflict marker', () => {
    const merged = memoryDomainRules.mergeLifecycleContent(
      '已有知识点',
      '新增知识点',
      false,
    );
    expect(merged).toContain('补充：新增知识点');
  });
});
