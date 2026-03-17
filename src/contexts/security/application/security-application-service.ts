import type http from 'http';

import { SECURITY_CONFIG } from '../../../config.js';
import { validateAdditionalMounts } from '../../../mount-security.js';
import type { AdditionalMount } from '../../../types/core-runtime.js';
import { CommandSafetyService } from '../../../domain/evolution/services/command-safety-service.js';

export interface RuntimeApiAuthOptions {
  allowNoAuth: boolean;
  apiKey?: string;
}

export interface SecurityApplicationService {
  resetRateLimitState(): void;
  isAuthorizedRuntimeRequest(
    req: http.IncomingMessage,
    options: RuntimeApiAuthOptions,
  ): boolean;
  isRuntimeRateLimitExceeded(
    req: http.IncomingMessage,
    path: string,
    now: number,
  ): boolean;
  validateCommandSafety(command: string): boolean;
  assertCommandsSafe(commands: string[]): void;
  validateAdditionalMounts(
    mounts: AdditionalMount[],
    groupName: string,
    isMain: boolean,
  ): Array<{
    hostPath: string;
    containerPath: string;
    readonly: boolean;
  }>;
}

interface RuntimeRateLimitGuard {
  reset(): void;
  isRateLimitedApiPath(path: string): boolean;
  consume(req: http.IncomingMessage, now: number): boolean;
}

const NOOP_RATE_LIMIT_GUARD: RuntimeRateLimitGuard = {
  reset() {},
  isRateLimitedApiPath() {
    return false;
  },
  consume() {
    return true;
  },
};

export function createSecurityApplicationService(
  runtimeRateLimitGuard: RuntimeRateLimitGuard = NOOP_RATE_LIMIT_GUARD,
): SecurityApplicationService {
  const commandSafetyService = new CommandSafetyService();

  return {
    resetRateLimitState() {
      runtimeRateLimitGuard.reset();
    },
    isAuthorizedRuntimeRequest(req, options) {
      if (options.allowNoAuth || !options.apiKey) {
        return true;
      }
      const requestApiKey = req.headers['x-api-key'];
      return (
        typeof requestApiKey === 'string' && requestApiKey === options.apiKey
      );
    },
    isRuntimeRateLimitExceeded(req, path, now) {
      if (!SECURITY_CONFIG.networkSecurity.enableRateLimiting) {
        return false;
      }
      if (!runtimeRateLimitGuard.isRateLimitedApiPath(path)) {
        return false;
      }
      return !runtimeRateLimitGuard.consume(req, now);
    },
    validateCommandSafety(command) {
      return commandSafetyService.validateCommandSafety(command);
    },
    assertCommandsSafe(commands) {
      commandSafetyService.assertCommandsSafe(commands);
    },
    validateAdditionalMounts(mounts, groupName, isMain) {
      return validateAdditionalMounts(mounts, groupName, isMain);
    },
  };
}

export const securityApplicationService = createSecurityApplicationService();
