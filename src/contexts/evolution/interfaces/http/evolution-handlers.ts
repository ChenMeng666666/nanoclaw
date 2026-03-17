import type http from 'http';
import type { URL } from 'url';

import { MEMORY_CONFIG } from '../../../../config.js';
import { getEvolutionEntriesByCategory } from '../../../../db-agents.js';
import { evolutionApplicationService as evolutionManager } from '../../application/index.js';
import { memoryApplicationService as memoryManager } from '../../../memory/application/index.js';
import type { Signal, SignalType } from '../../../../signal-extractor.js';
import {
  parseEvolutionCategory,
  parseEvolutionLimit,
  parseOptionalIntegerInRange,
  parseOptionalString,
  parseOptionalStringArray,
  parseRequiredIntegerInRange,
  parseRequiredString,
  readJSON,
} from '../../../../interfaces/http/parsers/runtime-api-parsers.js';
import {
  createApiError,
  writeJSON,
} from '../../../../interfaces/http/response.js';

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function createEvolutionHandlers(): {
  handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    path: string,
  ): Promise<boolean>;
} {
  let inFlightEvolutionQueries = 0;

  return {
    async handle(req, res, url, path) {
      if (path === '/api/evolution/metrics/dashboard' && req.method === 'GET') {
        const timelineLimit = parseOptionalIntegerInRange(
          url.searchParams.get('timelineLimit'),
          'timelineLimit',
          1,
          200,
        );
        const dashboard = evolutionManager.getDashboardMetrics(
          timelineLimit ?? 30,
        );
        writeJSON(res, 200, dashboard);
        return true;
      }

      if (
        path === '/api/governance/metrics/dashboard' &&
        req.method === 'GET'
      ) {
        const timelineLimit = parseOptionalIntegerInRange(
          url.searchParams.get('timelineLimit'),
          'timelineLimit',
          1,
          200,
        );
        writeJSON(res, 200, {
          generatedAt: new Date().toISOString(),
          evolution: evolutionManager.getDashboardMetrics(timelineLimit ?? 30),
          memory: memoryManager.getDashboardMetrics(timelineLimit ?? 24),
        });
        return true;
      }

      if (path === '/api/evolution/query' && req.method === 'POST') {
        const body = await readJSON(req);
        const query = parseRequiredString(body.query, 'query');
        const tags = parseOptionalStringArray(body.tags, 'tags');
        const limit = parseEvolutionLimit(body.limit);

        if (
          inFlightEvolutionQueries >= MEMORY_CONFIG.api.maxConcurrentSearches
        ) {
          throw createApiError(
            429,
            'EVOLUTION_QUERY_CONCURRENCY_LIMIT',
            'too many concurrent evolution queries',
          );
        }
        inFlightEvolutionQueries += 1;
        const queryPromise = evolutionManager.queryExperience(
          query,
          tags,
          limit,
        );
        queryPromise.finally(() => {
          inFlightEvolutionQueries = Math.max(0, inFlightEvolutionQueries - 1);
        });
        const entries = await withTimeout(
          queryPromise,
          MEMORY_CONFIG.api.searchTimeoutMs,
          createApiError(
            504,
            'EVOLUTION_QUERY_TIMEOUT',
            `evolution query timeout after ${MEMORY_CONFIG.api.searchTimeoutMs}ms`,
          ),
        );

        writeJSON(res, 200, { entries });
        return true;
      }

      if (path === '/api/evolution/submit' && req.method === 'POST') {
        const body = await readJSON(req);
        const abilityName = parseRequiredString(
          body.abilityName,
          'abilityName',
        );
        const content = parseRequiredString(body.content, 'content');
        const sourceAgentId = parseRequiredString(
          body.sourceAgentId,
          'sourceAgentId',
        );
        if (content.length > MEMORY_CONFIG.api.maxContentLength) {
          throw createApiError(
            400,
            'EVOLUTION_CONTENT_TOO_LONG',
            `content exceeds ${MEMORY_CONFIG.api.maxContentLength} characters`,
          );
        }
        const description = parseOptionalString(body.description);
        const tags = parseOptionalStringArray(body.tags, 'tags');

        const id = await evolutionManager.submitExperience(
          abilityName,
          content,
          sourceAgentId,
          description,
          tags,
        );

        writeJSON(res, 200, { id, status: 'submitted' });
        return true;
      }

      if (path === '/api/evolution/feedback' && req.method === 'POST') {
        const body = await readJSON(req);
        const id = parseRequiredIntegerInRange(
          body.id,
          'id',
          1,
          Number.MAX_SAFE_INTEGER,
        );
        const agentId = parseRequiredString(body.agentId, 'agentId');
        const comment = parseRequiredString(body.comment, 'comment');
        const rating = parseRequiredIntegerInRange(body.rating, 'rating', 1, 5);

        await evolutionManager.submitFeedback(id, agentId, comment, rating);

        writeJSON(res, 200, { success: true });
        return true;
      }

      if (path === '/api/evolution/select-gene' && req.method === 'POST') {
        const body = await readJSON(req);
        const signalTypes =
          parseOptionalStringArray(body.signals, 'signals') || [];
        const signals: Signal[] = signalTypes.map((type) => ({
          type: type as SignalType,
          confidence: 0.8,
        }));
        const category = parseEvolutionCategory(body.category);

        if (category) {
          const genes = getEvolutionEntriesByCategory(category, 10);
          writeJSON(res, 200, {
            category,
            genes,
            count: genes.length,
          });
          return true;
        }

        const selectedGene = await evolutionManager.selectGene(signals);
        const genes = selectedGene ? [selectedGene] : [];
        const geneCategory = selectedGene?.category || 'learn';

        writeJSON(res, 200, {
          category: geneCategory,
          genes,
          count: genes.length,
        });
        return true;
      }

      return false;
    },
  };
}
