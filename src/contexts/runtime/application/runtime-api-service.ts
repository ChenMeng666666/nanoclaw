import http from 'http';
import net from 'net';

import { RUNTIME_API_CONFIG } from '../../../config.js';
import { logger } from '../../../logger.js';
import { createRuntimeApiRouter } from '../interfaces/http/runtime-api-router.js';

export {
  analyzeLearningNeeds,
  inferPlanPriority,
  normalizeLearningNeeds,
} from '../../../domain/learning/services/learning-needs-analyzer.js';
export {
  analyzeLearningOutcome,
  extractKnowledgePoints,
  splitToPoints,
} from '../../../domain/learning/services/learning-outcome-analyzer.js';
export {
  generateDailySummary,
  generateRuntimeReflection,
} from '../../../domain/learning/services/reflection-generator.js';
export { orchestrateLearningIntent } from '../../../domain/learning/services/learning-scheduler.js';

export interface RuntimeAPIOptions {
  enabled: boolean;
  port: number;
  host: string;
}

const DEFAULT_OPTIONS: RuntimeAPIOptions = {
  enabled: process.env.RUNTIME_API_ENABLED !== 'false',
  port: RUNTIME_API_CONFIG.port,
  host: process.env.RUNTIME_API_HOST || '127.0.0.1',
};

function checkPortAvailable(port: number, host: string): Promise<boolean> {
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
    server.listen(port, host);
  });
}

async function findAvailablePort(
  startPort: number,
  host: string,
): Promise<number> {
  const maxAttempts = 100;
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const available = await checkPortAvailable(port, host);
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

  if (opts.port > 0) {
    const preferredPortAvailable = await checkPortAvailable(
      opts.port,
      opts.host,
    );
    if (!preferredPortAvailable) {
      const availablePort = await findAvailablePort(opts.port, opts.host);
      logger.info(
        { originalPort: opts.port, newPort: availablePort, host: opts.host },
        'Port conflict detected, using available port',
      );
      opts.port = availablePort;
    }
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

  const router = createRuntimeApiRouter({
    port: opts.port,
    allowNoAuth,
    apiKey: runtimeApiKey,
  });
  router.resetRateLimitState();

  const server = http.createServer(router.handler);

  server.listen(opts.port, opts.host, () => {
    logger.info(
      { port: opts.port, host: opts.host },
      'Runtime API server started',
    );
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
