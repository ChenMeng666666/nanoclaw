import type http from 'http';
import type { URL } from 'url';

import { MEMORY_CONFIG } from '../../../config.js';
import { memoryApplicationService as memoryManager } from '../../../contexts/memory/application/index.js';
import {
  normalizeMemoryScope,
  parseMemoryLevel,
  parseMemoryLimit,
  parseOptionalIntegerInRange,
  parseOptionalMemoryMessageType,
  parseOptionalMemoryScope,
  parseOptionalMemorySourceType,
  parseOptionalString,
  parseOptionalStringArray,
  parseReleaseControlPatch,
  parseRequiredString,
  readJSON,
} from '../../../contexts/security/interfaces/http/runtime-api-parsers.js';
import { createApiError, writeJSON } from '../response.js';

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

export function createMemoryHandlers(): {
  handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    path: string,
  ): Promise<boolean>;
} {
  let inFlightMemorySearches = 0;

  return {
    async handle(req, res, url, path) {
      if (path === '/api/memory/search' && req.method === 'POST') {
        const body = await readJSON(req);
        const query = parseRequiredString(body.query, 'query');
        const agentFolder = parseRequiredString(
          body.agentFolder,
          'agentFolder',
        );
        const userJid = parseOptionalString(body.userJid);
        const limit = parseMemoryLimit(body.limit);
        const scope = parseOptionalMemoryScope(body.scope, 'scope');
        const sessionId = parseOptionalString(body.sessionId);
        const sourceType = parseOptionalMemorySourceType(
          body.sourceType,
          'sourceType',
        );
        const messageType = parseOptionalMemoryMessageType(
          body.messageType,
          'messageType',
        );
        const tags = parseOptionalStringArray(body.tags, 'tags');
        const normalizedScope = normalizeMemoryScope(scope, sessionId);

        if (inFlightMemorySearches >= MEMORY_CONFIG.api.maxConcurrentSearches) {
          throw createApiError(
            429,
            'MEMORY_SEARCH_CONCURRENCY_LIMIT',
            'too many concurrent memory searches',
          );
        }
        inFlightMemorySearches += 1;
        const searchPromise = memoryManager.searchMemoriesDetailed(
          agentFolder,
          query,
          limit,
          userJid,
          {
            scope: normalizedScope,
            sessionId,
            sourceType,
            messageType,
            tags,
          },
        );
        searchPromise.finally(() => {
          inFlightMemorySearches = Math.max(0, inFlightMemorySearches - 1);
        });
        const hits = (await withTimeout(
          searchPromise,
          MEMORY_CONFIG.api.searchTimeoutMs,
          createApiError(
            504,
            'MEMORY_SEARCH_TIMEOUT',
            `memory search timeout after ${MEMORY_CONFIG.api.searchTimeoutMs}ms`,
          ),
        )) as unknown as Array<{
          memory: Record<string, unknown>;
          explain?: unknown;
        }>;

        writeJSON(res, 200, {
          memories: hits.map((hit) => ({
            ...hit.memory,
            explain: hit.explain,
          })),
        });
        return true;
      }

      if (path === '/api/memory/add' && req.method === 'POST') {
        const body = await readJSON(req);
        const agentFolder = parseRequiredString(
          body.agentFolder,
          'agentFolder',
        );
        const content = parseRequiredString(body.content, 'content');
        const level = parseMemoryLevel(body.level ?? 'L1', 'level');
        const userJid = parseOptionalString(body.userJid);
        const scope = parseOptionalMemoryScope(body.scope, 'scope');
        const sessionId = parseOptionalString(body.sessionId);
        const sourceType = parseOptionalMemorySourceType(
          body.sourceType,
          'sourceType',
        );
        const messageType = parseOptionalMemoryMessageType(
          body.messageType,
          'messageType',
        );
        const tags = parseOptionalStringArray(body.tags, 'tags');
        const normalizedScope = normalizeMemoryScope(scope, sessionId);

        if (content.length > MEMORY_CONFIG.api.maxContentLength) {
          throw createApiError(
            400,
            'MEMORY_CONTENT_TOO_LONG',
            `content exceeds ${MEMORY_CONFIG.api.maxContentLength} characters`,
          );
        }

        await memoryManager.addMemory(agentFolder, content, level, userJid, {
          scope: normalizedScope,
          sessionId,
          sourceType,
          messageType,
          tags,
        });

        writeJSON(res, 200, { success: true });
        return true;
      }

      if (path === '/api/memory/list' && req.method === 'GET') {
        const agentFolder = parseRequiredString(
          url.searchParams.get('agentFolder'),
          'agentFolder',
        );
        const levelParam = url.searchParams.get('level');
        const level = levelParam
          ? parseMemoryLevel(levelParam, 'level')
          : undefined;
        const userJid = url.searchParams.get('userJid') || undefined;
        const scopeParam = url.searchParams.get('scope');
        const scope = scopeParam
          ? parseOptionalMemoryScope(scopeParam, 'scope')
          : undefined;
        const sessionId = url.searchParams.get('sessionId') || undefined;
        const sourceTypeParam = url.searchParams.get('sourceType');
        const sourceType = sourceTypeParam
          ? parseOptionalMemorySourceType(sourceTypeParam, 'sourceType')
          : undefined;
        const messageTypeParam = url.searchParams.get('messageType');
        const messageType = messageTypeParam
          ? parseOptionalMemoryMessageType(messageTypeParam, 'messageType')
          : undefined;
        const tagsParam = url.searchParams.get('tags');
        const tags = tagsParam
          ? tagsParam
              .split(',')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          : undefined;
        const normalizedScope = normalizeMemoryScope(scope, sessionId);

        const memories = await memoryManager.listMemories(
          agentFolder,
          level,
          userJid,
          {
            scope: normalizedScope,
            sessionId,
            sourceType,
            messageType,
            tags,
          },
        );

        writeJSON(res, 200, { memories });
        return true;
      }

      if (path === '/api/memory/metrics/dashboard' && req.method === 'GET') {
        const timelineLimit = parseOptionalIntegerInRange(
          url.searchParams.get('timelineLimit'),
          'timelineLimit',
          1,
          200,
        );
        const dashboard = memoryManager.getDashboardMetrics(
          timelineLimit ?? 24,
        );
        writeJSON(res, 200, dashboard);
        return true;
      }

      if (path === '/api/memory/release/control' && req.method === 'GET') {
        writeJSON(res, 200, memoryManager.getReleaseControl());
        return true;
      }

      if (path === '/api/memory/release/control' && req.method === 'POST') {
        const body = await readJSON(req);
        const operator =
          parseOptionalString(body.operator) || 'runtime-api-operator';
        const reason = parseOptionalString(body.reason);
        const patch = parseReleaseControlPatch(body);
        const result = memoryManager.updateReleaseControl(
          patch,
          operator,
          reason,
        );
        writeJSON(res, 200, result);
        return true;
      }

      if (path === '/api/memory/release/rollback' && req.method === 'POST') {
        const body = await readJSON(req);
        const operationId = parseRequiredString(
          body.operationId,
          'operationId',
        );
        const operator =
          parseOptionalString(body.operator) || 'runtime-api-operator';
        const control = memoryManager.rollbackReleaseControl(
          operationId,
          operator,
        );
        writeJSON(res, 200, {
          status: 'rolled_back',
          operationId,
          control,
        });
        return true;
      }

      return false;
    },
  };
}
