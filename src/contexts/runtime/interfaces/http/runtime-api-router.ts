import type http from 'http';
import { URL } from 'url';

import { logger } from '../../../../logger.js';
import { createRuntimeRateLimitGuard } from '../../../../interfaces/http/middleware/rate-limit.js';
import { createSecurityApplicationService } from '../../../security/application/security-application-service.js';
import { createEvolutionHandlers } from './handlers/evolution-handlers.js';
import { handleLearningCollaborationEndpoints } from '../../../../interfaces/http/handlers/learning-collaboration-handlers.js';
import { createMemoryHandlers } from './handlers/memory-handlers.js';
import { createLearningHandlers } from '../../../../interfaces/http/handlers/learning/index.js';
import {
  createApiError,
  isApiError,
  writeJSON,
} from '../../../../interfaces/http/response.js';

export interface RuntimeApiRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  path: string;
}

export interface RuntimeApiRouterOptions {
  port: number;
  allowNoAuth: boolean;
  apiKey?: string;
  handleLegacyRoute?: (context: RuntimeApiRouteContext) => Promise<boolean>;
}

export function createRuntimeApiRouter(options: RuntimeApiRouterOptions): {
  resetRateLimitState(): void;
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<void>;
} {
  const securityService = createSecurityApplicationService(
    createRuntimeRateLimitGuard(),
  );
  const memoryHandlers = createMemoryHandlers();
  const evolutionHandlers = createEvolutionHandlers();
  const learningHandlers = createLearningHandlers();

  return {
    resetRateLimitState() {
      securityService.resetRateLimitState();
    },
    handler: async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

      if (req.method !== 'OPTIONS') {
        if (!securityService.isAuthorizedRuntimeRequest(req, options)) {
          logger.warn(
            {
              method: req.method,
              url: req.url,
              ip: req.socket.remoteAddress,
            },
            'Runtime API access denied: invalid API key',
          );
          writeJSON(res, 401, { error: 'Unauthorized: Invalid API key' });
          return;
        }
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url || '', `http://localhost:${options.port}`);
      const path = url.pathname;
      const context = { req, res, url, path };

      try {
        if (securityService.isRuntimeRateLimitExceeded(req, path, Date.now())) {
          throw createApiError(
            429,
            'RATE_LIMIT_EXCEEDED',
            'Too many runtime API requests',
          );
        }

        if (await memoryHandlers.handle(req, res, url, path)) {
          return;
        }

        if (await evolutionHandlers.handle(req, res, url, path)) {
          return;
        }

        if (await handleLearningCollaborationEndpoints(req, res, url, path)) {
          return;
        }

        if (await learningHandlers.handle(req, res, url, path)) {
          return;
        }

        if (
          options.handleLegacyRoute &&
          (await options.handleLegacyRoute(context))
        ) {
          return;
        }

        writeJSON(res, 404, { code: 'NOT_FOUND', error: 'Not found' });
      } catch (err) {
        logger.error({ path, method: req.method, err }, 'Runtime API error');
        if (isApiError(err)) {
          writeJSON(res, err.statusCode, {
            code: err.code,
            error: err.message,
          });
          return;
        }
        writeJSON(res, 500, {
          code: 'INTERNAL_ERROR',
          error: err instanceof Error ? err.message : 'Internal server error',
        });
      }
    },
  };
}
