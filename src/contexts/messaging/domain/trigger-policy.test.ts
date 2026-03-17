import { describe, expect, it } from 'vitest';

import { triggerPolicy } from './trigger-policy.js';

describe('trigger policy', () => {
  it('requires trigger for non-main group by default', () => {
    expect(triggerPolicy.shouldRequireTrigger(false, undefined)).toBe(true);
  });

  it('does not require trigger for main group', () => {
    expect(triggerPolicy.shouldRequireTrigger(true, true)).toBe(false);
  });

  it('allows disabling trigger explicitly', () => {
    expect(triggerPolicy.shouldRequireTrigger(false, false)).toBe(false);
  });

  it('accepts trigger from self without allowlist', () => {
    const hasTrigger = triggerPolicy.hasEligibleTrigger(
      [{ content: '@nano 处理一下', sender: 'u1', isFromMe: true }],
      /@nano/i,
      () => false,
    );
    expect(hasTrigger).toBe(true);
  });

  it('rejects message without trigger pattern', () => {
    const hasTrigger = triggerPolicy.hasEligibleTrigger(
      [{ content: '普通消息', sender: 'u1', isFromMe: true }],
      /@nano/i,
      () => true,
    );
    expect(hasTrigger).toBe(false);
  });

  it('accepts trigger from allowed sender', () => {
    const hasTrigger = triggerPolicy.hasEligibleTrigger(
      [{ content: '@nano 请执行', sender: 'u2', isFromMe: false }],
      /@nano/i,
      (sender) => sender === 'u2',
    );
    expect(hasTrigger).toBe(true);
  });
});
