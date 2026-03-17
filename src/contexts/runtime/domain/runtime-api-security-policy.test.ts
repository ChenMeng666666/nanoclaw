import { describe, expect, it } from 'vitest';

import { runtimeApiSecurityPolicyService } from './runtime-api-security-policy.js';

describe('runtime api security policy', () => {
  it('returns policy when api key exists', () => {
    const policy = runtimeApiSecurityPolicyService.resolve({
      runtimeApiKey: 'k',
      allowNoAuth: false,
    });
    expect(policy).toEqual({ allowNoAuth: false, apiKey: 'k' });
  });

  it('throws when key missing and no-auth disabled', () => {
    expect(() =>
      runtimeApiSecurityPolicyService.resolve({
        runtimeApiKey: undefined,
        allowNoAuth: false,
      }),
    ).toThrow(
      'RUNTIME_API_KEY is required unless RUNTIME_API_ALLOW_NO_AUTH=true',
    );
  });

  it('allows no-auth mode without key', () => {
    const policy = runtimeApiSecurityPolicyService.resolve({
      runtimeApiKey: undefined,
      allowNoAuth: true,
    });
    expect(policy).toEqual({ allowNoAuth: true, apiKey: undefined });
  });
});
