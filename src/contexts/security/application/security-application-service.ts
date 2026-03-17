import type http from 'http';

import { SECURITY_CONFIG } from '../../../config.js';
import { validateAdditionalMounts } from '../../../mount-security.js';
import type { AdditionalMount } from '../../../types/core-runtime.js';
import { createApiError } from '../../../interfaces/http/response.js';
import { CommandSafetyService } from '../domain/index.js';
import { createRuntimeRateLimitGuard } from '../interfaces/http/rate-limit.js';

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
  enforceRuntimeRateLimit(
    req: http.IncomingMessage,
    path: string,
    now: number,
  ): void;
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

export function createSecurityApplicationService(): SecurityApplicationService {
  const runtimeRateLimitGuard = createRuntimeRateLimitGuard();
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
    enforceRuntimeRateLimit(req, path, now) {
      if (!SECURITY_CONFIG.networkSecurity.enableRateLimiting) {
        return;
      }
      if (!runtimeRateLimitGuard.isRateLimitedApiPath(path)) {
        return;
      }
      if (!runtimeRateLimitGuard.consume(req, now)) {
        throw createApiError(
          429,
          'RATE_LIMIT_EXCEEDED',
          'Too many runtime API requests',
        );
      }
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
