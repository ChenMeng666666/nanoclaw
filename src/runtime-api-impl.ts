/**
 * 运行时 API 模块
 *
 * 提供 IPC 接口供容器内的 agent 调用：
 * - 查询记忆
 * - 添加记忆
 * - 查询进化库
 * - 提交经验到进化库
 * - 创建学习任务
 *
 * 使用方式（agent 端）：
 * ```typescript
 * const response = await fetch('http://localhost:PORT/memory/search', {
 *   method: 'POST',
 *   body: JSON.stringify({ query: 'xxx', agentFolder: 'andy' })
 * });
 * ```
 */
import http from 'http';
import net from 'net';
import { URL } from 'url';

import { memoryManager } from './memory-manager.js';
import { evolutionManager } from './evolution-manager.js';
import { reflectionScheduler } from './reflection-scheduler.js';
import {
  getMemories,
  createMemory,
  getAgentByFolder,
  getLearningTask,
  getLearningTasksByAgent,
  getReflectionsByAgent,
  createLearningTask,
  createReflection,
  updateLearningTask,
  createScheduledTaskForLearning,
  createLearningResult,
  getLearningResultsByAgent,
  getRecentLearningResults,
} from './db-agents.js';
import { getAllTasks, getTasksForGroup, updateTask } from './db.js';
import { logger } from './logger.js';
import {
  MEMORY_CONFIG,
  RUNTIME_API_CONFIG,
  SECURITY_CONFIG,
} from './config.js';
import { createRuntimeRateLimitGuard } from './interfaces/http/middleware/rate-limit.js';
import { createEvolutionHandlers } from './interfaces/http/handlers/evolution-handlers.js';
import { handleLearningCollaborationEndpoints } from './interfaces/http/handlers/learning-collaboration-handlers.js';
import { createMemoryHandlers } from './interfaces/http/handlers/memory-handlers.js';
import {
  parseEvolutionCategory,
  parseLearningResultStatus,
  parseMemoryLevel,
  parseOptionalBlastRadius,
  parseOptionalIntegerInRange,
  parseOptionalMemoryMessageType,
  parseOptionalMemoryScope,
  parseOptionalMemorySourceType,
  parseOptionalNumberInRange,
  parseOptionalString,
  parseOptionalStringArray,
  parseOptionalStringWithLimit,
  parseReleaseControlPatch,
  parseRequiredIntegerInRange,
  parseRequiredString,
  readJSON,
  normalizeMemoryScope,
  parseMemoryLimit,
  parseEvolutionLimit,
} from './interfaces/http/parsers/runtime-api-parsers.js';
import {
  createApiError,
  isApiError,
  writeJSON,
} from './interfaces/http/response.js';
import { LocalLLMQueryExpansionProvider } from './query-expansion/local-llm-provider.js';
import type {
  LearningNeed,
  DailyLearningPlan,
  DetailedReflection,
  DailyLearningSummary,
  LearningIntentOrchestrationResult,
  LearningModelDecision,
} from './types.js';

export interface RuntimeAPIOptions {
  port: number;
  enabled: boolean;
}

const DEFAULT_OPTIONS: RuntimeAPIOptions = {
  port: parseInt(process.env.RUNTIME_API_PORT || '3456', 10),
  enabled: process.env.RUNTIME_API_ENABLED !== 'false',
};

const learningAutomationState = new Set<string>();
const LEARNING_AUTOMATION_DAILY_PLAN_PROMPT =
  '[learning-automation:daily-plan] 触发每日学习计划';
const LEARNING_AUTOMATION_DAILY_SUMMARY_PROMPT =
  '[learning-automation:daily-summary] 触发每日学习总结';
let learningNeedsLlmProvider: LocalLLMQueryExpansionProvider | null = null;
let learningNeedsLlmInitPromise: Promise<void> | null = null;

// 检查端口是否可用
function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port);
  });
}

// 尝试找到可用的端口
async function findAvailablePort(
  basePort: number,
  fallbacks: number[],
): Promise<number> {
  // 尝试主端口
  if (await checkPortAvailable(basePort)) {
    return basePort;
  }

  // 尝试备用端口
  for (const port of fallbacks) {
    if (await checkPortAvailable(port)) {
      logger.warn(
        { basePort, fallbackPort: port },
        'Primary port in use, using fallback port',
      );
      return port;
    }
  }

  throw new Error(
    `All ports in range ${basePort} and fallbacks ${fallbacks} are in use`,
  );
}

/**
 * 启动运行时 API 服务器
 */
export async function startRuntimeAPI(
  options: Partial<RuntimeAPIOptions> = {},
): Promise<http.Server> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let inFlightMemorySearches = 0;
  let inFlightEvolutionQueries = 0;

  if (!opts.enabled) {
    logger.info('Runtime API disabled');
    return http.createServer((req, res) => {
      logger.debug(
        { method: req.method, url: req.url },
        'Runtime API request received while API is disabled',
      );
      writeJSON(res, 503, {
        error: 'Runtime API disabled',
        reason: 'Set RUNTIME_API_ENABLED=true to enable this endpoint',
      });
    });
  }

  // 尝试找到可用的端口
  try {
    opts.port = await findAvailablePort(
      opts.port,
      RUNTIME_API_CONFIG.fallbackPorts,
    );
  } catch (err) {
    logger.error({ err }, 'Failed to find available port for Runtime API');
    throw err;
  }

  const allowNoAuth = process.env.RUNTIME_API_ALLOW_NO_AUTH === 'true';
  const API_KEY = process.env.RUNTIME_API_KEY;
  if (!API_KEY && !allowNoAuth) {
    throw new Error(
      'RUNTIME_API_KEY 环境变量未设置；如需在本地无鉴权调试，请显式设置 RUNTIME_API_ALLOW_NO_AUTH=true',
    );
  }
  if (!API_KEY && allowNoAuth) {
    logger.warn(
      'Runtime API running without API key because RUNTIME_API_ALLOW_NO_AUTH=true',
    );
  }

  const rateLimitGuard = createRuntimeRateLimitGuard();
  rateLimitGuard.reset();
  const memoryHandlers = createMemoryHandlers();
  const evolutionHandlers = createEvolutionHandlers();

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    // 认证检查
    if (req.method !== 'OPTIONS') {
      const apiKey = req.headers['x-api-key'] as string | undefined;
      if (!allowNoAuth && API_KEY && (!apiKey || apiKey !== API_KEY)) {
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

      // ===== 记忆 API =====

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
        const hits = await withTimeout(
          searchPromise,
          MEMORY_CONFIG.api.searchTimeoutMs,
          createApiError(
            504,
            'MEMORY_SEARCH_TIMEOUT',
            `memory search timeout after ${MEMORY_CONFIG.api.searchTimeoutMs}ms`,
          ),
        );

        writeJSON(res, 200, {
          memories: hits.map((hit) => ({
            ...hit.memory,
            explain: hit.explain,
          })),
        });
        return;
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
        return;
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

        const memories = getMemories(agentFolder, level, userJid, {
          scope: normalizedScope,
          sessionId,
          sourceType,
          messageType,
          tags,
        });

        writeJSON(res, 200, { memories });
        return;
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
        return;
      }

      if (path === '/api/memory/release/control' && req.method === 'GET') {
        writeJSON(res, 200, memoryManager.getReleaseControl());
        return;
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
        return;
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
        return;
      }

      // ===== 进化库 API =====

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
        return;
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
        return;
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
        return;
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
        return;
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
        return;
      }

      // ===== 学习自动化 API =====

      if (path === '/api/learning/analyze-needs' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        const needs = await analyzeLearningNeeds(String(agentFolder));
        const modelDecision = resolveLearningModelDecision(
          'analyze-needs',
          'local',
        );

        writeJSON(res, 200, { needs, modelDecision });
        return;
      }

      if (
        path === '/api/learning/orchestrate-intent' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const {
          agentFolder,
          topic,
          goal,
          resources,
          schedulePreference,
          chatJid,
        } = body;
        if (!agentFolder || !topic) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }
        const result = await orchestrateLearningIntent({
          agentFolder: String(agentFolder),
          topic: String(topic),
          goal: typeof goal === 'string' ? goal : undefined,
          resources: Array.isArray(resources)
            ? resources.filter(
                (item): item is string => typeof item === 'string',
              )
            : [],
          schedulePreference,
          chatJid: typeof chatJid === 'string' ? chatJid : undefined,
        });

        writeJSON(res, 200, result);
        return;
      }

      if (
        path === '/api/learning/generate-daily-plan' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, learningNeeds } = body;

        if (!agentFolder || !learningNeeds) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const explicitNeeds = normalizeLearningNeeds(learningNeeds);
        const agentFolderStr = String(agentFolder);
        const derivedNeeds =
          explicitNeeds.length > 0
            ? explicitNeeds
            : await analyzeLearningNeeds(agentFolderStr);
        const needs =
          derivedNeeds.length > 0
            ? derivedNeeds
            : [
                {
                  topic: '复盘最近学习任务',
                  level: 'beginner',
                  urgency: 'medium',
                  estimatedTime: 1,
                  resources: [],
                } satisfies LearningNeed,
              ];

        const plan: DailyLearningPlan = {
          id: `plan-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          agentFolder: agentFolderStr,
          tasks: needs.map((need, index) => ({
            id: `task-${Date.now()}-${index}`,
            agentFolder: agentFolderStr,
            description: need.topic,
            status: 'pending' as const,
            resources: need.resources,
            createdAt: new Date().toISOString(),
          })),
          estimatedTime: needs.reduce(
            (sum, need) => sum + need.estimatedTime,
            0,
          ),
          priority: inferPlanPriority(needs),
        };

        writeJSON(res, 200, plan);
        return;
      }

      if (path === '/api/learning/analyze-outcome' && req.method === 'POST') {
        const body = await readJSON(req);
        const { taskId } = body;

        if (!taskId) {
          writeJSON(res, 400, { error: 'Missing taskId' });
          return;
        }

        const analysis = analyzeLearningOutcome(String(taskId));

        writeJSON(res, 200, analysis);
        return;
      }

      if (path === '/api/learning/extract-knowledge' && req.method === 'POST') {
        const body = await readJSON(req);
        const { taskId, reflectionId } = body;

        if (!taskId && !reflectionId) {
          writeJSON(res, 400, { error: 'Missing taskId or reflectionId' });
          return;
        }

        const knowledge = extractKnowledgePoints(
          taskId ? String(taskId) : undefined,
          reflectionId ? Number(reflectionId) : undefined,
        );

        writeJSON(res, 200, { knowledgePoints: knowledge });
        return;
      }

      if (path === '/api/learning/automation/start' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, chatJid, dailyPlanTime, dailySummaryTime } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        const agentFolderStr = String(agentFolder);
        const existingTasks = getLearningAutomationTasks(agentFolderStr);
        const dailyPlanSchedule = resolveLearningSchedulePreference(
          parseFixedTimePreference(dailyPlanTime, '08:00'),
          new Date(),
        );
        const dailySummarySchedule = resolveLearningSchedulePreference(
          parseFixedTimePreference(dailySummaryTime, '23:00'),
          new Date(),
        );

        const dailyPlanTaskId = upsertLearningAutomationTask({
          agentFolder: agentFolderStr,
          chatJid: typeof chatJid === 'string' ? chatJid : '',
          prompt: LEARNING_AUTOMATION_DAILY_PLAN_PROMPT,
          scheduleType: dailyPlanSchedule.scheduleType,
          scheduleValue: dailyPlanSchedule.scheduleValue,
          nextRun: dailyPlanSchedule.nextRun,
          existingTask: existingTasks.dailyPlan,
        });
        const dailySummaryTaskId = upsertLearningAutomationTask({
          agentFolder: agentFolderStr,
          chatJid: typeof chatJid === 'string' ? chatJid : '',
          prompt: LEARNING_AUTOMATION_DAILY_SUMMARY_PROMPT,
          scheduleType: dailySummarySchedule.scheduleType,
          scheduleValue: dailySummarySchedule.scheduleValue,
          nextRun: dailySummarySchedule.nextRun,
          existingTask: existingTasks.dailySummary,
        });
        learningAutomationState.add(agentFolderStr);
        writeJSON(res, 200, {
          status: 'started',
          desiredState: 'running',
          observedState: 'running',
          tasks: [
            { type: 'daily_plan', taskId: dailyPlanTaskId },
            { type: 'daily_summary', taskId: dailySummaryTaskId },
          ],
        });
        return;
      }

      if (path === '/api/learning/automation/stop' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        const agentFolderStr = String(agentFolder);
        const tasks = getLearningAutomationTasks(agentFolderStr);
        if (tasks.dailyPlan) {
          updateTask(tasks.dailyPlan.id, { status: 'paused' });
        }
        if (tasks.dailySummary) {
          updateTask(tasks.dailySummary.id, { status: 'paused' });
        }
        learningAutomationState.delete(agentFolderStr);
        writeJSON(res, 200, {
          status: 'stopped',
          desiredState: 'stopped',
          observedState: 'stopped',
          tasks: [
            tasks.dailyPlan
              ? { type: 'daily_plan', taskId: tasks.dailyPlan.id }
              : null,
            tasks.dailySummary
              ? { type: 'daily_summary', taskId: tasks.dailySummary.id }
              : null,
          ].filter(Boolean),
        });
        return;
      }

      if (path === '/api/learning/automation/status' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        const tasks = getLearningAutomationTasks(agentFolder);
        const observedState =
          tasks.dailyPlan?.status === 'active' &&
          tasks.dailySummary?.status === 'active'
            ? 'running'
            : 'stopped';
        const desiredState = learningAutomationState.has(agentFolder)
          ? 'running'
          : 'stopped';
        writeJSON(res, 200, {
          status: observedState,
          desiredState,
          observedState,
          tasks: [
            {
              type: 'daily_plan',
              taskId: tasks.dailyPlan?.id || null,
              status: tasks.dailyPlan?.status || 'missing',
              nextRun: tasks.dailyPlan?.next_run || null,
              lastRun: tasks.dailyPlan?.last_run || null,
            },
            {
              type: 'daily_summary',
              taskId: tasks.dailySummary?.id || null,
              status: tasks.dailySummary?.status || 'missing',
              nextRun: tasks.dailySummary?.next_run || null,
              lastRun: tasks.dailySummary?.last_run || null,
            },
          ],
        });
        return;
      }

      if (
        path === '/api/learning/reflection/generate' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, type } = body;

        if (!agentFolder || !type) {
          writeJSON(res, 400, { error: 'Missing agentFolder or type' });
          return;
        }

        const agentFolderStr = String(agentFolder);

        const reflection = await generateRuntimeReflection(
          agentFolderStr,
          String(type),
        );

        writeJSON(res, 200, reflection);
        return;
      }

      if (
        path === '/api/learning/generate-daily-summary' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, tasks } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        const agentFolderStr = String(agentFolder);
        const taskList = Array.isArray(tasks) ? tasks : undefined;
        const summary = await generateDailySummary(agentFolderStr, taskList);

        writeJSON(res, 200, summary);
        return;
      }

      // ===== 学习任务 API =====

      if (path === '/api/learning/tasks' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const status = url.searchParams.get('status');

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        const tasks = getLearningTasksByAgent(agentFolder);
        const filtered = status
          ? tasks.filter((t) => t.status === status)
          : tasks;

        writeJSON(res, 200, { tasks: filtered });
        return;
      }

      if (path === '/api/learning/task/create' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, description, resources } = body;

        if (!agentFolder || !description) {
          writeJSON(res, 400, { error: 'Missing agentFolder or description' });
          return;
        }

        const id = await reflectionScheduler.createLearningTask(
          agentFolder as string,
          description as string,
          resources as string[] | undefined,
        );

        writeJSON(res, 200, { id });
        return;
      }

      // ===== 学习计划 API（新增） =====

      if (path === '/api/learning/plan/create' && req.method === 'POST') {
        const body = await readJSON(req);
        const {
          agentFolder,
          topic,
          goal,
          phases,
          resources,
          estimatedDuration,
          chatJid,
          schedulePreference,
        } = body;

        if (!agentFolder || !topic || !goal) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const agentFolderStr = String(agentFolder);
        const topicStr = String(topic);
        const goalStr = String(goal);
        const resolvedSchedule = resolveLearningSchedulePreference(
          schedulePreference,
          new Date(),
        );
        const id = await reflectionScheduler.createLearningTask(
          agentFolderStr,
          `${topicStr}: ${goalStr}`,
          resources as string[] | undefined,
        );

        // 将计划信息存储到记忆系统（作为 L2 短期记忆）
        await memoryManager.addMemory(
          agentFolderStr,
          `学习计划：${topicStr} - ${goalStr}，预计${estimatedDuration || '未指定'}，阶段：${JSON.stringify(phases)}`,
          'L2',
          undefined,
        );

        const scheduledTaskIds: string[] = [];
        const phaseTaskIds: string[] = [];
        if (phases && Array.isArray(phases) && phases.length > 0) {
          for (let i = 0; i < phases.length; i++) {
            const phase = phases[i];
            const phaseName = phase.name || `阶段${i + 1}`;
            const phaseTaskId = await reflectionScheduler.createLearningTask(
              agentFolderStr,
              `${topicStr} - ${phaseName}`,
              resources as string[] | undefined,
            );
            phaseTaskIds.push(phaseTaskId);
            const phaseSchedule = offsetSchedule(
              resolvedSchedule,
              i,
              phases.length,
            );

            const taskId = createScheduledTaskForLearning(
              agentFolderStr,
              (chatJid as string) || '',
              `学习${topicStr} - ${phaseName} [taskId:${phaseTaskId}]`,
              phaseSchedule.scheduleType,
              phaseSchedule.scheduleValue,
              phaseSchedule.nextRun,
            );
            scheduledTaskIds.push(taskId);
          }
        }

        writeJSON(res, 200, {
          id,
          topic,
          goal,
          phases,
          phaseTaskIds,
          status: 'created',
          scheduledTaskIds,
          scheduleType: resolvedSchedule.scheduleType,
          scheduleValue: resolvedSchedule.scheduleValue,
          nextRun: resolvedSchedule.nextRun,
          message:
            scheduledTaskIds.length > 0
              ? `已创建学习计划并自动安排${scheduledTaskIds.length}个定时学习任务`
              : '已创建学习计划',
        });
        return;
      }

      if (path === '/api/learning/task/complete' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, taskId, id, phaseName, reflection, timeSpent } =
          body;
        const resolvedTaskId =
          typeof taskId === 'string' && taskId.trim()
            ? taskId.trim()
            : typeof id === 'string' && id.trim()
              ? id.trim()
              : '';

        if (!agentFolder || !resolvedTaskId) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const task = getLearningTask(resolvedTaskId);
        if (!task) {
          writeJSON(res, 404, { error: 'Learning task not found' });
          return;
        }
        if (task.agentFolder !== String(agentFolder)) {
          writeJSON(res, 409, {
            error: 'Learning task does not belong to agentFolder',
          });
          return;
        }

        // 触发完整的学习任务完成流程（包括反思和进化提交）
        await reflectionScheduler.completeLearningTask(resolvedTaskId);

        // 将反思内容存储到记忆系统
        if (reflection) {
          const reflectionContent =
            typeof reflection === 'string'
              ? reflection
              : `学习反思：${phaseName || ''} - ${JSON.stringify(reflection)}`;

          await memoryManager.addMemory(
            agentFolder as string,
            reflectionContent,
            'L2',
            undefined,
          );
        }

        writeJSON(res, 200, {
          taskId: resolvedTaskId,
          status: 'completed',
          reflection: reflection || null,
          timeSpent:
            typeof timeSpent === 'number' && Number.isFinite(timeSpent)
              ? timeSpent
              : null,
        });
        return;
      }

      if (path === '/api/learning/task/start' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, taskId, id, phaseName } = body;
        const resolvedTaskId =
          typeof taskId === 'string' && taskId.trim()
            ? taskId.trim()
            : typeof id === 'string' && id.trim()
              ? id.trim()
              : '';

        if (!agentFolder || !resolvedTaskId) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const task = getLearningTask(resolvedTaskId);
        if (!task) {
          writeJSON(res, 404, { error: 'Learning task not found' });
          return;
        }
        if (task.agentFolder !== String(agentFolder)) {
          writeJSON(res, 409, {
            error: 'Learning task does not belong to agentFolder',
          });
          return;
        }

        updateLearningTask(resolvedTaskId, {
          status: 'in_progress',
        });

        // 记录开始学习到记忆系统
        await memoryManager.addMemory(
          agentFolder as string,
          `开始学习任务：${phaseName || resolvedTaskId}`,
          'L1',
          undefined,
        );

        writeJSON(res, 200, {
          taskId: resolvedTaskId,
          status: 'in_progress',
        });
        return;
      }

      if (path === '/api/learning/plans' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const status = url.searchParams.get('status');

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        // 从记忆系统查询学习计划
        const memories = await memoryManager.searchMemories(
          agentFolder,
          '学习计划',
          20,
        );

        writeJSON(res, 200, { plans: memories });
        return;
      }

      // ===== 定时任务 API =====

      if (path === '/api/scheduled/tasks' && req.method === 'GET') {
        const groupFolder = url.searchParams.get('groupFolder');
        const status = url.searchParams.get('status');

        let tasks;
        if (groupFolder) {
          tasks = getTasksForGroup(groupFolder);
        } else {
          tasks = getAllTasks();
        }

        const filtered = status
          ? tasks.filter((t: { status: string }) => t.status === status)
          : tasks;

        writeJSON(res, 200, { tasks: filtered });
        return;
      }

      // ===== 反思 API =====

      if (path === '/api/reflection/trigger' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, type, triggeredBy } = body;

        if (!agentFolder || !type) {
          writeJSON(res, 400, { error: 'Missing agentFolder or type' });
          return;
        }

        const reflectionType = type as
          | 'hourly'
          | 'daily'
          | 'weekly'
          | 'monthly'
          | 'yearly'
          | 'task';
        const supportedTypes = new Set([
          'hourly',
          'daily',
          'weekly',
          'monthly',
          'yearly',
          'task',
        ]);

        if (!supportedTypes.has(reflectionType)) {
          writeJSON(res, 400, { error: 'Invalid reflection type' });
          return;
        }

        const agent = getAgentByFolder(agentFolder as string);
        if (!agent) {
          writeJSON(res, 404, { error: 'Agent not found' });
          return;
        }

        await reflectionScheduler.triggerReflection(
          agent,
          reflectionType,
          triggeredBy as string | undefined,
        );

        writeJSON(res, 200, {
          status: 'triggered',
          agentFolder,
          type: reflectionType,
        });
        return;
      }

      // ===== 学习结果 API =====

      if (path === '/api/learning/result' && req.method === 'POST') {
        const body = await readJSON(req);
        const agentFolder = parseRequiredString(
          body.agentFolder,
          'agentFolder',
        );
        const status = parseLearningResultStatus(body.status, 'status');
        const taskId = parseOptionalString(body.taskId);
        const metricBefore = parseOptionalNumberInRange(
          body.metricBefore,
          'metricBefore',
          -1000000000,
          1000000000,
        );
        const metricAfter = parseOptionalNumberInRange(
          body.metricAfter,
          'metricAfter',
          -1000000000,
          1000000000,
        );
        const metricName = parseOptionalStringWithLimit(
          body.metricName,
          'metricName',
          120,
        );
        const description = parseOptionalStringWithLimit(
          body.description,
          'description',
          MEMORY_CONFIG.api.maxContentLength,
        );
        const signals = parseOptionalStringArray(body.signals, 'signals');
        const geneId = parseOptionalString(body.geneId);
        const blastRadius = parseOptionalBlastRadius(
          body.blastRadius,
          'blastRadius',
        );

        const id = createLearningResult({
          taskId,
          agentFolder,
          metricBefore,
          metricAfter,
          metricName,
          status,
          description,
          signals,
          geneId,
          blastRadius,
        });

        writeJSON(res, 200, { id, status: 'recorded' });
        return;
      }

      if (path === '/api/learning/results' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const limit =
          parseOptionalIntegerInRange(
            url.searchParams.get('limit'),
            'limit',
            MEMORY_CONFIG.api.minLimit,
            MEMORY_CONFIG.api.maxLimit,
          ) || 50;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        const results = getLearningResultsByAgent(agentFolder, limit);
        writeJSON(res, 200, { results });
        return;
      }

      // ===== 学习体系 API =====

      // 获取学习体系版本
      if (path === '/api/learning/system/version' && req.method === 'GET') {
        const LATEST_VERSION = '1.1';
        writeJSON(res, 200, {
          version: LATEST_VERSION,
          releaseDate: '2026-03-10',
          features: [
            '增强版本管理和增量更新',
            '学习体系版本API',
            '优化同步钩子',
          ],
        });
        return;
      }

      // 触发学习体系更新
      if (path === '/api/learning/system/update' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        // 模拟学习体系更新
        writeJSON(res, 200, {
          status: 'updated',
          version: '1.1',
          message: '学习体系已更新到最新版本',
          agentFolder,
        });
        return;
      }

      // 获取版本差异
      if (path === '/api/learning/system/diff' && req.method === 'GET') {
        const fromVersion = url.searchParams.get('fromVersion') || '1.0';
        const toVersion = url.searchParams.get('toVersion') || '1.1';

        writeJSON(res, 200, {
          fromVersion,
          toVersion,
          changes: [
            {
              file: 'config.json',
              type: 'modified',
              description: '添加迁移历史记录字段',
            },
            {
              file: 'init.sh',
              type: 'modified',
              description: '增强版本管理和增量更新功能',
            },
            {
              file: 'post-load.sh',
              type: 'modified',
              description: '优化同步钩子，添加增量同步',
            },
          ],
          breakingChanges: [],
          migrationSteps: [
            '检查当前版本',
            '备份配置文件',
            '执行版本迁移',
            '验证更新结果',
          ],
        });
        return;
      }

      // ===== 信号提取 API =====

      if (path === '/api/signals/extract' && req.method === 'POST') {
        const body = await readJSON(req);
        const { content, memorySnippet, language } = body;

        if (!content) {
          writeJSON(res, 400, { error: 'Missing content' });
          return;
        }

        // 动态导入信号提取模块
        const { extractSignals } = await import('./signal-extractor.js');
        const signals = extractSignals({
          content: content as string,
          memorySnippet: memorySnippet as string | undefined,
          language: language as 'en' | 'zh-CN' | 'zh-TW' | 'ja' | undefined,
        });

        writeJSON(res, 200, { signals });
        return;
      }

      // ===== 饱和检测 API =====

      if (path === '/api/saturation/detect' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const limit =
          parseOptionalIntegerInRange(
            url.searchParams.get('limit'),
            'limit',
            MEMORY_CONFIG.api.minLimit,
            MEMORY_CONFIG.api.maxLimit,
          ) || 10;

        // 获取最近的学习结果
        const recentResults = agentFolder
          ? getLearningResultsByAgent(agentFolder, limit)
          : getRecentLearningResults(limit);

        // 动态导入饱和检测模块
        const { detectSaturation, getSaturationSummary } =
          await import('./saturation-detector.js');
        const state = detectSaturation(
          recentResults.map((r) => ({
            id: String(r.id),
            taskId: r.taskId,
            agentFolder: r.agentFolder,
            status: r.status,
            createdAt: r.createdAt,
            signals: r.signals,
            geneId: r.geneId,
            metricBefore: r.metricBefore,
            metricAfter: r.metricAfter,
          })),
        );

        const summary = getSaturationSummary(state);

        writeJSON(res, 200, { state, summary });
        return;
      }

      // ===== 协作系统 API =====

      // 智能体间消息 API
      if (
        path === '/api/collaboration/messages/send' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { fromAgentId, toAgentId, type, content, metadata } = body;

        if (!fromAgentId || !toAgentId || !type || !content) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const { sendAgentMessage } = await import('./agent-communication.js');
        const messageId = sendAgentMessage(
          fromAgentId as string,
          toAgentId as string,
          type as any,
          content as string,
          metadata as Record<string, unknown>,
        );

        writeJSON(res, 200, { id: messageId, status: 'sent' });
        return;
      }

      if (
        path === '/api/collaboration/messages/receive' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentId } = body;

        if (!agentId) {
          writeJSON(res, 400, { error: 'Missing agentId' });
          return;
        }

        const { receiveAgentMessages } =
          await import('./agent-communication.js');
        const messages = receiveAgentMessages(agentId as string);

        writeJSON(res, 200, { messages });
        return;
      }

      if (
        path === '/api/collaboration/messages/status' &&
        req.method === 'GET'
      ) {
        const messageId = url.searchParams.get('messageId');

        if (!messageId) {
          writeJSON(res, 400, { error: 'Missing messageId' });
          return;
        }

        const { getAgentMessageStatus } =
          await import('./agent-communication.js');
        const status = getAgentMessageStatus(messageId);

        writeJSON(res, 200, { status });
        return;
      }

      // 协作任务 API
      if (path === '/api/collaboration/tasks' && req.method === 'GET') {
        const status = url.searchParams.get('status');
        const teamId = url.searchParams.get('teamId');

        const { getAllCollaborationTasks } = await import('./db.js');
        let tasks = getAllCollaborationTasks();

        if (status) {
          tasks = tasks.filter((t) => t.status === status);
        }

        if (teamId) {
          tasks = tasks.filter((t) => t.teamId === teamId);
        }

        writeJSON(res, 200, { tasks });
        return;
      }

      if (path === '/api/collaboration/task/create' && req.method === 'POST') {
        const body = await readJSON(req);
        const {
          title,
          description,
          teamId,
          assignedAgents,
          status,
          priority,
          dependencies,
          context,
        } = body;

        if (!title || !assignedAgents) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const taskId = `collab-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const { createCollaborationTask } = await import('./db.js');
        createCollaborationTask({
          id: taskId,
          title: String(title),
          description: description as string | undefined,
          teamId: teamId as string | undefined,
          assignedAgents: Array.isArray(assignedAgents) ? assignedAgents : [],
          status:
            (status as 'pending' | 'in_progress' | 'completed' | 'failed') ||
            'pending',
          priority:
            (priority as 'low' | 'medium' | 'high' | 'critical') || 'medium',
          dependencies: Array.isArray(dependencies) ? dependencies : [],
          context: context as string | undefined,
          progress: 0,
        });

        writeJSON(res, 200, { id: taskId, status: 'created' });
        return;
      }

      if (path === '/api/collaboration/task/update' && req.method === 'POST') {
        const body = await readJSON(req);
        const { taskId, updates } = body;

        if (!taskId || !updates) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const { updateCollaborationTask } = await import('./db.js');
        updateCollaborationTask(
          taskId as string,
          updates as Parameters<typeof updateCollaborationTask>[1],
        );

        writeJSON(res, 200, { success: true });
        return;
      }

      if (
        path === '/api/collaboration/task/progress' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { taskId, progress, status } = body;

        if (!taskId || progress === undefined) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const { updateTaskProgress } =
          await import('./collaboration-scheduler.js');
        updateTaskProgress(
          taskId as string,
          Number(progress),
          status as
            | 'pending'
            | 'in_progress'
            | 'completed'
            | 'failed'
            | undefined,
        );

        writeJSON(res, 200, { success: true });
        return;
      }

      // 团队管理 API
      if (path === '/api/collaboration/teams' && req.method === 'GET') {
        const { getAllTeamStates } = await import('./db.js');
        const teams = getAllTeamStates();

        writeJSON(res, 200, { teams });
        return;
      }

      if (path === '/api/collaboration/team/create' && req.method === 'POST') {
        const body = await readJSON(req);
        const { name, description, members, collaborationMode } = body;

        if (!name) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const { createTeam } = await import('./team-manager.js');
        const teamId = createTeam(
          String(name),
          description as string | undefined,
          Array.isArray(members) ? members : [],
          collaborationMode as
            | 'hierarchical'
            | 'peer-to-peer'
            | 'swarm'
            | undefined,
        );

        writeJSON(res, 200, { id: teamId, status: 'created' });
        return;
      }

      if (path === '/api/collaboration/team/update' && req.method === 'POST') {
        const body = await readJSON(req);
        const { teamId, updates } = body;

        if (!teamId || !updates) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const { updateTeamState } = await import('./db.js');
        updateTeamState(teamId as string, updates);

        writeJSON(res, 200, { success: true });
        return;
      }

      if (
        path === '/api/collaboration/team/add-member' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { teamId, agentId } = body;

        if (!teamId || !agentId) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const { addMemberToTeam } = await import('./team-manager.js');
        addMemberToTeam(teamId as string, agentId as string);

        writeJSON(res, 200, { success: true });
        return;
      }

      if (
        path === '/api/collaboration/team/remove-member' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { teamId, agentId } = body;

        if (!teamId || !agentId) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const { removeMemberFromTeam } = await import('./team-manager.js');
        removeMemberFromTeam(teamId as string, agentId as string);

        writeJSON(res, 200, { success: true });
        return;
      }

      if (path === '/api/collaboration/team/health' && req.method === 'GET') {
        const teamId = url.searchParams.get('teamId');

        if (!teamId) {
          writeJSON(res, 400, { error: 'Missing teamId' });
          return;
        }

        const { checkTeamHealth } = await import('./team-manager.js');
        const health = checkTeamHealth(teamId);

        writeJSON(res, 200, health);
        return;
      }

      // Bot Identity API
      if (path === '/api/collaboration/bot-identity' && req.method === 'GET') {
        const chatJid = url.searchParams.get('chatJid');

        if (!chatJid) {
          writeJSON(res, 400, { error: 'Missing chatJid' });
          return;
        }

        const { getBotIdentityByChatJid } = await import('./db.js');
        const identity = getBotIdentityByChatJid(chatJid);

        writeJSON(res, 200, { identity });
        return;
      }

      if (
        path === '/api/collaboration/bot-identity/create' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { chatJid, agentId, botName, botAvatar, config } = body;

        if (!chatJid || !agentId || !botName) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const identityId = `bot-identity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { createBotIdentity } = await import('./db.js');
        createBotIdentity({
          id: identityId,
          chatJid: String(chatJid),
          agentId: String(agentId),
          botName: String(botName),
          botAvatar: botAvatar as string | undefined,
          config: config as Record<string, any> | undefined,
        });

        writeJSON(res, 200, { id: identityId, status: 'created' });
        return;
      }

      // ===== Gene 选择 API =====

      if (path === '/api/evolution/select-gene' && req.method === 'POST') {
        const body = await readJSON(req);
        const signals = parseOptionalStringArray(body.signals, 'signals') || [];
        const category = parseEvolutionCategory(body.category);

        // 动态导入信号提取模块
        const { getRecommendedGeneCategory } =
          await import('./signal-extractor.js');
        const { getEvolutionEntriesByCategory } =
          await import('./db-agents.js');

        // 如果没有指定类别，根据信号推荐
        const geneCategory =
          category || getRecommendedGeneCategory(signals as any[]);

        // 获取该类别的 Gene
        const genes = getEvolutionEntriesByCategory(
          geneCategory as 'repair' | 'optimize' | 'innovate' | 'learn',
          10,
        );

        writeJSON(res, 200, {
          category: geneCategory,
          genes,
          count: genes.length,
        });
        return;
      }

      // 404
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
      // 直接抛出错误，终止进程
      process.exit(1);
    } else {
      logger.error({ err }, 'Runtime API server error');
    }
  });

  return server;
}

// ===== 辅助函数 =====

export function normalizeLearningNeeds(input: unknown): LearningNeed[] {
  if (!Array.isArray(input)) return [];
  const normalized: LearningNeed[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const topic = typeof record.topic === 'string' ? record.topic.trim() : '';
    if (!topic) continue;
    const level =
      record.level === 'beginner' ||
      record.level === 'intermediate' ||
      record.level === 'advanced'
        ? record.level
        : 'beginner';
    const urgency =
      record.urgency === 'low' ||
      record.urgency === 'medium' ||
      record.urgency === 'high'
        ? record.urgency
        : 'medium';
    const estimatedTime =
      typeof record.estimatedTime === 'number' && record.estimatedTime > 0
        ? Math.min(8, Math.max(1, Math.round(record.estimatedTime)))
        : 1;
    const resources = Array.isArray(record.resources)
      ? record.resources.filter((r): r is string => typeof r === 'string')
      : [];
    normalized.push({ topic, level, urgency, estimatedTime, resources });
  }
  return normalized;
}

export function inferPlanPriority(
  needs: LearningNeed[],
): 'high' | 'medium' | 'low' {
  if (needs.some((n) => n.urgency === 'high')) return 'high';
  if (needs.some((n) => n.urgency === 'medium')) return 'medium';
  return 'low';
}

export async function analyzeLearningNeeds(
  agentFolder: string,
): Promise<LearningNeed[]> {
  const tasks = getLearningTasksByAgent(agentFolder);
  const reflections = getReflectionsByAgent(agentFolder).slice(0, 12);
  const needs: LearningNeed[] = [];
  const seenTopics = new Set<string>();

  const pushNeed = (need: LearningNeed): void => {
    if (seenTopics.has(need.topic)) return;
    seenTopics.add(need.topic);
    needs.push(need);
  };

  for (const task of tasks.filter((t) => t.status === 'failed').slice(0, 3)) {
    pushNeed({
      topic: `复盘失败任务：${task.description.slice(0, 40)}`,
      level: 'intermediate',
      urgency: 'high',
      estimatedTime: 2,
      resources: task.resources || [],
    });
  }

  for (const task of tasks.filter((t) => t.status === 'pending').slice(0, 3)) {
    pushNeed({
      topic: `推进待办任务：${task.description.slice(0, 40)}`,
      level: 'beginner',
      urgency: 'medium',
      estimatedTime: 1,
      resources: task.resources || [],
    });
  }

  for (const reflection of reflections) {
    const lines = reflection.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6);
    for (const line of lines) {
      if (
        line.includes('困难') ||
        line.includes('问题') ||
        line.includes('改进')
      ) {
        pushNeed({
          topic: `改进点：${line.replace(/^[-*]\s*/, '').slice(0, 40)}`,
          level: 'intermediate',
          urgency: 'medium',
          estimatedTime: 1,
          resources: [],
        });
      }
    }
    if (needs.length >= 6) break;
  }

  if (needs.length < 3) {
    const memories = await memoryManager.searchMemories(
      agentFolder,
      '学习 反思 改进 困难',
      8,
    );
    for (const memory of memories) {
      const content = memory.content.trim();
      if (!content) continue;
      pushNeed({
        topic: `知识巩固：${content.slice(0, 40)}`,
        level: 'beginner',
        urgency: 'low',
        estimatedTime: 1,
        resources: [],
      });
      if (needs.length >= 6) break;
    }
  }
  const modelDecision = resolveLearningModelDecision('analyze-needs', 'local');
  const llmNeeds =
    modelDecision.selected === 'local'
      ? await analyzeLearningNeedsWithLLM(agentFolder, needs)
      : [];
  for (const need of llmNeeds) {
    pushNeed(need);
  }

  return needs.slice(0, 10);
}

export function analyzeLearningOutcome(taskId: string): {
  taskId: string;
  knowledgeGained: string[];
  difficulties: string[];
  solutions: string[];
  suggestions: string[];
} {
  const task = getLearningTask(taskId);
  if (!task) {
    return {
      taskId,
      knowledgeGained: [],
      difficulties: ['未找到对应学习任务'],
      solutions: ['确认任务 ID 并重新提交'],
      suggestions: ['在任务开始前调用 /api/learning/task/start'],
    };
  }

  const reflections = getReflectionsByAgent(task.agentFolder)
    .filter((r) => r.triggeredBy === taskId)
    .slice(0, 3);
  const reflectionTexts = reflections.map((r) => r.content);
  const sourceText = [task.description, ...reflectionTexts].join('\n');
  const points = splitToPoints(sourceText);

  return {
    taskId,
    knowledgeGained: points.slice(0, 5),
    difficulties: reflections.length
      ? points
          .filter((p) => p.includes('困难') || p.includes('问题'))
          .slice(0, 3)
      : ['尚无任务反思，建议先完成任务并触发反思'],
    solutions: points
      .filter(
        (p) => p.includes('解决') || p.includes('改进') || p.includes('优化'),
      )
      .slice(0, 3),
    suggestions: [
      task.status === 'completed'
        ? '将本次经验同步到进化库'
        : '先推进任务到 completed',
      '补充可量化指标（耗时、质量评分）',
    ],
  };
}

export function extractKnowledgePoints(
  taskId?: string,
  reflectionId?: number,
): string[] {
  const points = new Set<string>();
  if (taskId) {
    const task = getLearningTask(taskId);
    if (task) {
      splitToPoints(task.description).forEach((point) => points.add(point));
      const reflections = getReflectionsByAgent(task.agentFolder)
        .filter(
          (reflection) =>
            reflection.triggeredBy === taskId ||
            (reflectionId !== undefined && reflection.id === reflectionId),
        )
        .slice(0, 5);
      for (const reflection of reflections) {
        splitToPoints(reflection.content).forEach((point) => points.add(point));
      }
    }
  }
  return Array.from(points).slice(0, 10);
}

export async function generateRuntimeReflection(
  agentFolder: string,
  type: string,
): Promise<DetailedReflection> {
  const taskType = [
    'hourly',
    'daily',
    'weekly',
    'monthly',
    'yearly',
    'task',
  ].includes(type)
    ? (type as 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'task')
    : 'task';
  const tasks = getLearningTasksByAgent(agentFolder).slice(0, 20);
  const completedCount = tasks.filter(
    (task) => task.status === 'completed',
  ).length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const recentMemories = await memoryManager.searchMemories(
    agentFolder,
    '学习 任务 进展',
    5,
  );

  const content = [
    `反思类型：${taskType}`,
    `已完成任务：${completedCount}，失败任务：${failedCount}`,
    `重点观察：${
      recentMemories.map((memory) => memory.content.slice(0, 30)).join('；') ||
      '暂无近期学习记忆'
    }`,
    `下一步：优先处理失败任务并量化学习指标`,
  ].join('\n');

  const id = createReflection({
    agentFolder,
    type: taskType,
    content,
    triggeredBy: 'runtime-api',
  });

  return {
    id,
    agentFolder,
    type: taskType,
    content,
    actualDuration: 30,
    knowledgeGained: extractKnowledgePoints(undefined, undefined).slice(0, 3),
    difficulties: failedCount > 0 ? ['存在失败任务待复盘'] : ['暂无明显阻塞'],
    solutions: ['按优先级处理失败任务', '更新学习计划中的依赖关系'],
    suggestions: ['每次任务完成后立即生成反思'],
    keyInsights: [
      `完成率：${tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100)}%`,
    ],
    nextSteps: ['继续跟踪学习成果并记录到记忆系统'],
    rating: failedCount > 0 ? 3 : 4,
    createdAt: new Date().toISOString(),
  };
}

export async function generateDailySummary(
  agentFolder: string,
  providedTasks?: unknown[],
): Promise<DailyLearningSummary> {
  const allTasks = getLearningTasksByAgent(agentFolder);
  const tasksCompleted = allTasks.filter((task) => task.status === 'completed');
  const taskList =
    providedTasks && providedTasks.length > 0 ? providedTasks : tasksCompleted;
  const reflections = getReflectionsByAgent(agentFolder, 'daily').slice(0, 3);
  const memories = await memoryManager.searchMemories(
    agentFolder,
    '学习 总结',
    8,
  );
  const knowledgePoints = new Set<string>();
  for (const memory of memories) {
    splitToPoints(memory.content).forEach((point) =>
      knowledgePoints.add(point),
    );
  }

  return {
    id: `summary-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    agentFolder,
    tasksCompleted: taskList.length,
    totalTimeSpent: taskList.length * 45,
    knowledgePoints: Array.from(knowledgePoints).slice(0, 8),
    achievements: tasksCompleted
      .slice(0, 3)
      .map((task) => `完成：${task.description.slice(0, 40)}`),
    challenges: reflections.length
      ? reflections.map((reflection) => reflection.content.slice(0, 40))
      : ['暂无每日反思，建议补充 reflection/generate'],
    improvements: ['统一任务优先级规则', '补充结果量化指标'],
    tomorrowPlan: ['优先处理失败任务', '为高优先级需求分配固定学习时段'],
    mood: tasksCompleted.length > 0 ? 'good' : 'average',
    notes: '总结基于任务、反思与记忆自动生成',
  };
}

export function splitToPoints(text: string): string[] {
  return text
    .split(/[\n。；;!！?？]/g)
    .map((part) => part.replace(/^[-*]\s*/, '').trim())
    .filter((part) => part.length >= 6)
    .slice(0, 20);
}

async function getLearningNeedsLlmProvider(): Promise<LocalLLMQueryExpansionProvider | null> {
  if (process.env.LEARNING_NEEDS_LLM_ENABLED !== 'true') {
    return null;
  }
  const modelPath = process.env.LEARNING_NEEDS_LLM_MODEL_PATH;
  if (!modelPath) {
    logger.warn('LEARNING_NEEDS_LLM_ENABLED=true but model path is missing');
    return null;
  }
  if (learningNeedsLlmProvider) return learningNeedsLlmProvider;
  if (!learningNeedsLlmInitPromise) {
    const provider = new LocalLLMQueryExpansionProvider({
      modelPath,
      modelType:
        process.env.LEARNING_NEEDS_LLM_MODEL_TYPE === 'qwen3' ||
        process.env.LEARNING_NEEDS_LLM_MODEL_TYPE === 'qwen3.5' ||
        process.env.LEARNING_NEEDS_LLM_MODEL_TYPE === 'llama3'
          ? process.env.LEARNING_NEEDS_LLM_MODEL_TYPE
          : 'qwen3.5',
      numVariants: 5,
      temperature: 0.4,
      maxTokens: 256,
    });
    learningNeedsLlmProvider = provider;
    learningNeedsLlmInitPromise = provider
      .initialize()
      .then(() => undefined)
      .catch((err) => {
        logger.warn(
          { err },
          'Failed to initialize learning-needs LLM provider',
        );
        learningNeedsLlmProvider = null;
      })
      .finally(() => {
        learningNeedsLlmInitPromise = null;
      });
  }
  await learningNeedsLlmInitPromise;
  return learningNeedsLlmProvider;
}

async function analyzeLearningNeedsWithLLM(
  agentFolder: string,
  baseNeeds: LearningNeed[],
): Promise<LearningNeed[]> {
  const provider = await getLearningNeedsLlmProvider();
  if (!provider) return [];
  const prompt = [
    `agent=${agentFolder}`,
    '请生成可执行的学习需求主题，中文短句，避免泛化。',
    ...baseNeeds.map((need) => `- ${need.topic}`),
  ].join('\n');
  try {
    const variants = await provider.generateVariants(prompt);
    const topics = variants
      .map((variant) => variant.replace(/^[-*0-9.\s]+/, '').trim())
      .filter((topic) => topic.length >= 6)
      .slice(0, 4);
    return topics.map((topic) => ({
      topic,
      level: 'intermediate',
      urgency: 'medium',
      estimatedTime: 1,
      resources: [],
    }));
  } catch (err) {
    logger.warn({ err }, 'Learning-needs LLM analysis failed');
    return [];
  }
}

function resolveLearningModelDecision(
  stage: 'analyze-needs' | 'reflection-generate',
  fallback: 'local' | 'rules',
): LearningModelDecision {
  const sdkRequested = process.env.LEARNING_SDK_PREFERRED !== 'false';
  const sdkAvailable =
    process.env.LEARNING_SDK_ENABLED === 'true' &&
    !!process.env.ANTHROPIC_API_KEY;
  if (!sdkRequested) {
    return {
      stage,
      primary: 'local',
      selected: fallback,
      degraded: false,
    };
  }
  if (sdkAvailable) {
    return {
      stage,
      primary: 'sdk',
      selected: 'sdk',
      degraded: false,
    };
  }
  return {
    stage,
    primary: 'sdk',
    selected: fallback,
    degraded: true,
    degradeReason: 'sdk_unavailable',
  };
}

function parseFixedTimePreference(
  value: unknown,
  fallback: string,
): { mode: 'fixed_time'; fixedTime: string } {
  if (typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    return {
      mode: 'fixed_time',
      fixedTime: value,
    };
  }
  return {
    mode: 'fixed_time',
    fixedTime: fallback,
  };
}

function getLearningAutomationTasks(agentFolder: string): {
  dailyPlan?: {
    id: string;
    status: 'active' | 'paused' | 'completed';
    next_run: string | null;
    last_run: string | null;
  };
  dailySummary?: {
    id: string;
    status: 'active' | 'paused' | 'completed';
    next_run: string | null;
    last_run: string | null;
  };
} {
  const tasks = getTasksForGroup(agentFolder) as Array<{
    id: string;
    prompt: string;
    status: 'active' | 'paused' | 'completed';
    next_run: string | null;
    last_run: string | null;
  }>;
  return {
    dailyPlan: tasks.find(
      (task) => task.prompt === LEARNING_AUTOMATION_DAILY_PLAN_PROMPT,
    ),
    dailySummary: tasks.find(
      (task) => task.prompt === LEARNING_AUTOMATION_DAILY_SUMMARY_PROMPT,
    ),
  };
}

function upsertLearningAutomationTask(input: {
  agentFolder: string;
  chatJid: string;
  prompt: string;
  scheduleType: 'cron' | 'interval' | 'once';
  scheduleValue: string;
  nextRun: string;
  existingTask?: {
    id: string;
    status: 'active' | 'paused' | 'completed';
  };
}): string {
  if (input.existingTask) {
    updateTask(input.existingTask.id, {
      status: 'active',
      schedule_type: input.scheduleType,
      schedule_value: input.scheduleValue,
      next_run: input.nextRun,
    });
    return input.existingTask.id;
  }
  return createScheduledTaskForLearning(
    input.agentFolder,
    input.chatJid,
    input.prompt,
    input.scheduleType,
    input.scheduleValue,
    input.nextRun,
  );
}

function resolveLearningSchedulePreference(
  preference: unknown,
  now: Date = new Date(),
): {
  scheduleType: 'cron' | 'interval' | 'once';
  scheduleValue: string;
  nextRun: string;
} {
  if (preference && typeof preference === 'object') {
    const raw = preference as Record<string, unknown>;
    if (raw.mode === 'interval') {
      const minutes = Number(raw.intervalMinutes);
      if (Number.isFinite(minutes) && minutes > 0) {
        const nextRun = new Date(
          now.getTime() + Math.floor(minutes) * 60 * 1000,
        );
        return {
          scheduleType: 'interval',
          scheduleValue: `${Math.floor(minutes)}m`,
          nextRun: nextRun.toISOString(),
        };
      }
    }
    if (
      raw.mode === 'cron' &&
      typeof raw.cron === 'string' &&
      raw.cron.trim()
    ) {
      const nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return {
        scheduleType: 'cron',
        scheduleValue: raw.cron.trim(),
        nextRun: nextRun.toISOString(),
      };
    }
    if (
      raw.mode === 'fixed_time' &&
      typeof raw.fixedTime === 'string' &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw.fixedTime.trim())
    ) {
      const [hourStr, minuteStr] = raw.fixedTime.trim().split(':');
      const hour = Number.parseInt(hourStr, 10);
      const minute = Number.parseInt(minuteStr, 10);
      const nextRun = new Date(now);
      nextRun.setHours(hour, minute, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      return {
        scheduleType: 'cron',
        scheduleValue: `${minute} ${hour} * * *`,
        nextRun: nextRun.toISOString(),
      };
    }
  }

  const fallback = new Date(now);
  fallback.setHours(20, 0, 0, 0);
  if (fallback <= now) {
    fallback.setDate(fallback.getDate() + 1);
  }
  return {
    scheduleType: 'cron',
    scheduleValue: '0 20 * * *',
    nextRun: fallback.toISOString(),
  };
}

function offsetSchedule(
  base: {
    scheduleType: 'cron' | 'interval' | 'once';
    scheduleValue: string;
    nextRun: string;
  },
  index: number,
  total: number,
): {
  scheduleType: 'cron' | 'interval' | 'once';
  scheduleValue: string;
  nextRun: string;
} {
  if (total <= 1 || index === 0) {
    return base;
  }
  const baseRun = new Date(base.nextRun);
  if (base.scheduleType === 'interval') {
    const minutesMatch = /^(\d+)m$/.exec(base.scheduleValue);
    const minutes = minutesMatch ? Number.parseInt(minutesMatch[1], 10) : 60;
    return {
      scheduleType: base.scheduleType,
      scheduleValue: base.scheduleValue,
      nextRun: new Date(
        baseRun.getTime() + index * minutes * 60 * 1000,
      ).toISOString(),
    };
  }
  return {
    scheduleType: base.scheduleType,
    scheduleValue: base.scheduleValue,
    nextRun: new Date(
      baseRun.getTime() + index * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

export async function orchestrateLearningIntent(input: {
  agentFolder: string;
  topic: string;
  goal?: string;
  resources?: string[];
  schedulePreference?: unknown;
  chatJid?: string;
}): Promise<LearningIntentOrchestrationResult> {
  const schedule = resolveLearningSchedulePreference(input.schedulePreference);
  const reflectionSchedule = resolveLearningSchedulePreference(
    { mode: 'fixed_time', fixedTime: '23:00' },
    new Date(),
  );
  const reflectionPrompt = '[reflection:daily] 自动反思计划';
  const groupTasks = getTasksForGroup(input.agentFolder) as Array<{
    id: string;
    prompt: string;
    schedule_type: 'cron' | 'interval' | 'once';
    schedule_value: string;
  }>;
  const existingReflection = groupTasks.find(
    (task) => task.prompt === reflectionPrompt,
  );
  const reflectionTaskId =
    existingReflection?.id ||
    createScheduledTaskForLearning(
      input.agentFolder,
      input.chatJid || '',
      reflectionPrompt,
      reflectionSchedule.scheduleType,
      reflectionSchedule.scheduleValue,
      reflectionSchedule.nextRun,
    );
  const learningTaskId = await reflectionScheduler.createLearningTask(
    input.agentFolder,
    `${input.topic}: ${input.goal || '持续学习'}`,
    input.resources,
  );
  const scheduleTaskId = createScheduledTaskForLearning(
    input.agentFolder,
    input.chatJid || '',
    `学习${input.topic} [taskId:${learningTaskId}]`,
    schedule.scheduleType,
    schedule.scheduleValue,
    schedule.nextRun,
  );
  const modelDecisions: LearningModelDecision[] = [
    resolveLearningModelDecision('analyze-needs', 'local'),
    resolveLearningModelDecision('reflection-generate', 'rules'),
  ];
  return {
    topic: input.topic,
    reflectionPlan: {
      reused: Boolean(existingReflection),
      taskId: reflectionTaskId,
      scheduleType:
        existingReflection?.schedule_type || reflectionSchedule.scheduleType,
      scheduleValue:
        existingReflection?.schedule_value || reflectionSchedule.scheduleValue,
    },
    learningTaskId,
    scheduleTaskId,
    scheduleType: schedule.scheduleType,
    scheduleValue: schedule.scheduleValue,
    nextRun: schedule.nextRun,
    modelDecisions,
  };
}

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
