import http from 'http';
import net from 'net';
import { URL } from 'url';
import { logger } from './logger.js';
import { SECURITY_CONFIG } from './config.js';
import { createRuntimeRateLimitGuard } from './interfaces/http/middleware/rate-limit.js';
import { createEvolutionHandlers } from './interfaces/http/handlers/evolution-handlers.js';
import { handleLearningCollaborationEndpoints } from './interfaces/http/handlers/learning-collaboration-handlers.js';
import { createMemoryHandlers } from './interfaces/http/handlers/memory-handlers.js';
import { createLearningLegacyHandlers } from './interfaces/http/handlers/learning-legacy-handlers.js';
import {
  createApiError,
  isApiError,
  writeJSON,
} from './interfaces/http/response.js';

export {
  normalizeLearningNeeds,
  inferPlanPriority,
  analyzeLearningNeeds,
  analyzeLearningOutcome,
  extractKnowledgePoints,
  generateRuntimeReflection,
  generateDailySummary,
  splitToPoints,
  orchestrateLearningIntent,
} from './runtime-api-learning-helpers.js';

export interface RuntimeAPIOptions {
  enabled: boolean;
  port: number;
  host: string;
}

const DEFAULT_OPTIONS: RuntimeAPIOptions = {
  enabled: process.env.RUNTIME_API_ENABLED !== 'false',
  port: Number(process.env.RUNTIME_API_PORT || 3100),
  host: process.env.RUNTIME_API_HOST || '127.0.0.1',
};

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  const maxAttempts = 100;
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const available = await checkPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(
    `No available ports found starting from ${startPort} after ${maxAttempts} attempts`,
  );
}

export async function startRuntimeAPI(
  options: Partial<RuntimeAPIOptions> = {},
): Promise<http.Server> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!opts.enabled) {
    throw new Error('Runtime API is disabled');
  }

  if (opts.port === 3000 || opts.port === 3001) {
    const availablePort = await findAvailablePort(3100);
    logger.info(
      { originalPort: opts.port, newPort: availablePort },
      'Port conflict detected, using available port',
    );
    opts.port = availablePort;
  }

  const allowNoAuth = process.env.RUNTIME_API_ALLOW_NO_AUTH === 'true';
  const runtimeApiKey = process.env.RUNTIME_API_KEY;
  if (!runtimeApiKey && !allowNoAuth) {
    throw new Error(
      'RUNTIME_API_KEY is required unless RUNTIME_API_ALLOW_NO_AUTH=true',
    );
  }
  if (!runtimeApiKey && allowNoAuth) {
    logger.warn(
      'Runtime API running without API key because RUNTIME_API_ALLOW_NO_AUTH=true',
    );
  }

  const rateLimitGuard = createRuntimeRateLimitGuard();
  rateLimitGuard.reset();
  const memoryHandlers = createMemoryHandlers();
  const evolutionHandlers = createEvolutionHandlers();
  const learningLegacyHandlers = createLearningLegacyHandlers();

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    if (req.method !== 'OPTIONS') {
      const apiKey = req.headers['x-api-key'] as string | undefined;
      if (
        !allowNoAuth &&
        runtimeApiKey &&
        (!apiKey || apiKey !== runtimeApiKey)
      ) {
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

    const url = new URL(req.url || '', `http://localhost:${opts.port}`);
    const path = url.pathname;

    try {
      if (
        rateLimitGuard.isRateLimitedApiPath(path) &&
        SECURITY_CONFIG.networkSecurity.enableRateLimiting
      ) {
        if (!rateLimitGuard.consume(req, Date.now())) {
          throw createApiError(
            429,
            'RATE_LIMIT_EXCEEDED',
            'Too many runtime API requests',
          );
        }
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

      if (await learningLegacyHandlers.handle(req, res, url, path)) {
        return;
      }

      writeJSON(res, 404, { code: 'NOT_FOUND', error: 'Not found' });
    } catch (err) {
      logger.error({ path, method: req.method, err }, 'Runtime API error');
      if (isApiError(err)) {
        writeJSON(res, err.statusCode, { code: err.code, error: err.message });
        return;
      }
      writeJSON(res, 500, {
        code: 'INTERNAL_ERROR',
        error: err instanceof Error ? err.message : 'Internal server error',
      });
    }
  });

  server.listen(opts.port, () => {
    logger.info({ port: opts.port }, 'Runtime API server started');
  });

  server.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      logger.error(
        { port: opts.port },
        'Runtime API port already in use - server failed to start',
      );
      process.exit(1);
    } else {
      logger.error({ err }, 'Runtime API server error');
    }
  });

  return server;
}
