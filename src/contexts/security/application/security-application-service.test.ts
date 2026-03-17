import type http from 'http';
import { describe, expect, it } from 'vitest';

import { createSecurityApplicationService } from './security-application-service.js';

function createRequest(
  headers: Record<string, string> = {},
): http.IncomingMessage {
  return { headers } as http.IncomingMessage;
}

describe('security application service runtime auth', () => {
  it('denies request when apiKey is missing and no-auth is disabled', () => {
    const service = createSecurityApplicationService();
    const authorized = service.isAuthorizedRuntimeRequest(createRequest(), {
      allowNoAuth: false,
      apiKey: undefined,
    });
    expect(authorized).toBe(false);
  });

  it('authorizes request when no-auth is enabled', () => {
    const service = createSecurityApplicationService();
    const authorized = service.isAuthorizedRuntimeRequest(createRequest(), {
      allowNoAuth: true,
      apiKey: undefined,
    });
    expect(authorized).toBe(true);
  });

  it('authorizes request only with matching apiKey', () => {
    const service = createSecurityApplicationService();
    const authorized = service.isAuthorizedRuntimeRequest(
      createRequest({ 'x-api-key': 'correct-key' }),
      {
        allowNoAuth: false,
        apiKey: 'correct-key',
      },
    );
    expect(authorized).toBe(true);
  });

  it('denies request with mismatched apiKey', () => {
    const service = createSecurityApplicationService();
    const authorized = service.isAuthorizedRuntimeRequest(
      createRequest({ 'x-api-key': 'wrong-key' }),
      {
        allowNoAuth: false,
        apiKey: 'correct-key',
      },
    );
    expect(authorized).toBe(false);
  });
});
