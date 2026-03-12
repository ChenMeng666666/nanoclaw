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
import { exec } from 'child_process';
import { URL } from 'url';

import { memoryManager } from './memory-manager.js';
import { evolutionManager } from './evolution-manager.js';
import { reflectionScheduler } from './reflection-scheduler.js';
import {
  getMemories,
  createMemory,
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
import { getAllTasks, getTasksForGroup } from './db.js';
import { logger } from './logger.js';
import { safeJsonParse } from './security.js';
import { LocalLLMQueryExpansionProvider } from './query-expansion/local-llm-provider.js';
import type {
  LearningNeed,
  DailyLearningPlan,
  DetailedReflection,
  DailyLearningSummary,
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

  if (!opts.enabled) {
    logger.info('Runtime API disabled');
    // 返回一个空的 server 用于接口兼容
    return http.createServer(() => {});
  }

  // 尝试找到可用的端口
  try {
    opts.port = await findAvailablePort(opts.port, [3457, 3458, 3459]);
  } catch (err) {
    logger.error({ err }, 'Failed to find available port for Runtime API');
    throw err;
  }

  // 简单的 API Key 认证 - 生产环境必须设置环境变量
  const API_KEY = process.env.RUNTIME_API_KEY;
  if (!API_KEY) {
    logger.error('RUNTIME_API_KEY 环境变量未设置，这是一个安全隐患');
    // 在开发环境可以继续，但生产环境应该拒绝启动
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      throw new Error('RUNTIME_API_KEY 环境变量未设置');
    }
  }

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    // 认证检查
    if (req.method !== 'OPTIONS') {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey || apiKey !== API_KEY) {
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
      // ===== 记忆 API =====

      if (path === '/api/memory/search' && req.method === 'POST') {
        const body = await readJSON(req);
        const { query, agentFolder, userJid, limit = 10 } = body;

        if (!query || !agentFolder) {
          writeJSON(res, 400, { error: 'Missing query or agentFolder' });
          return;
        }

        const memories = await memoryManager.searchMemories(
          agentFolder as string,
          query as string,
          limit as number,
          userJid as string | undefined,
        );

        writeJSON(res, 200, { memories });
        return;
      }

      if (path === '/api/memory/add' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, content, level = 'L1', userJid } = body;

        if (!agentFolder || !content) {
          writeJSON(res, 400, { error: 'Missing agentFolder or content' });
          return;
        }

        await memoryManager.addMemory(
          agentFolder as string,
          content as string,
          level as 'L1' | 'L2' | 'L3',
          userJid as string | undefined,
        );

        writeJSON(res, 200, { success: true });
        return;
      }

      if (path === '/api/memory/list' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const level = url.searchParams.get('level') as
          | 'L1'
          | 'L2'
          | 'L3'
          | undefined;
        const userJid = url.searchParams.get('userJid') || undefined;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        const memories = getMemories(agentFolder, level, userJid);

        writeJSON(res, 200, { memories });
        return;
      }

      // ===== 进化库 API =====

      if (path === '/api/evolution/query' && req.method === 'POST') {
        const body = await readJSON(req);
        const { query, tags, limit = 20 } = body;

        const entries = await evolutionManager.queryExperience(
          query as string,
          tags as string[] | undefined,
          limit as number,
        );

        writeJSON(res, 200, { entries });
        return;
      }

      if (path === '/api/evolution/submit' && req.method === 'POST') {
        const body = await readJSON(req);
        const { abilityName, content, sourceAgentId, description, tags } = body;

        if (!abilityName || !content || !sourceAgentId) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        const id = await evolutionManager.submitExperience(
          abilityName as string,
          content as string,
          sourceAgentId as string,
          description as string | undefined,
          tags as string[] | undefined,
        );

        writeJSON(res, 200, { id, status: 'submitted' });
        return;
      }

      if (path === '/api/evolution/feedback' && req.method === 'POST') {
        const body = await readJSON(req);
        const { id, agentId, comment, rating } = body;

        if (!id || !agentId || !comment || !rating) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        await evolutionManager.submitFeedback(
          id as number,
          agentId as string,
          comment as string,
          rating as number,
        );

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

        writeJSON(res, 200, { needs });
        return;
      }

      if (
        path === '/api/learning/generate-daily-plan' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, learningNeeds, scheduleConfig } = body;

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
          estimatedTime: needs.reduce((sum, need) => sum + need.estimatedTime, 0),
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
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        learningAutomationState.add(String(agentFolder));
        writeJSON(res, 200, { status: 'started' });
        return;
      }

      if (path === '/api/learning/automation/stop' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        learningAutomationState.delete(String(agentFolder));
        writeJSON(res, 200, { status: 'stopped' });
        return;
      }

      if (path === '/api/learning/automation/status' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        writeJSON(res, 200, {
          status: learningAutomationState.has(agentFolder)
            ? 'running'
            : 'stopped',
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
          chatJid, // 可选，用于创建定时任务
        } = body;

        if (!agentFolder || !topic || !goal) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        // 创建主学习任务
        const id = await reflectionScheduler.createLearningTask(
          agentFolder as string,
          `${topic}: ${goal}`,
          resources as string[] | undefined,
        );

        // 将计划信息存储到记忆系统（作为 L2 短期记忆）
        await memoryManager.addMemory(
          agentFolder as string,
          `学习计划：${topic} - ${goal}，预计${estimatedDuration || '未指定'}，阶段：${JSON.stringify(phases)}`,
          'L2',
          undefined,
        );

        // 为每个阶段创建定时任务（自动调度学习）
        const scheduledTaskIds: string[] = [];
        if (phases && Array.isArray(phases) && phases.length > 0) {
          const now = new Date();
          // 默认每天晚上 8 点执行学习
          const defaultScheduleTime = '20:00';

          for (let i = 0; i < phases.length; i++) {
            const phase = phases[i];
            const phaseName = phase.name || `阶段${i + 1}`;
            // 每个阶段间隔 1 天，从明天开始
            const phaseDate = new Date(now);
            phaseDate.setDate(phaseDate.getDate() + i + 1);
            const nextRun =
              phaseDate.toISOString().split('T')[0] +
              'T' +
              defaultScheduleTime +
              ':00';

            const taskId = createScheduledTaskForLearning(
              agentFolder as string,
              (chatJid as string) || '',
              `学习${topic} - ${phaseName}`,
              'daily',
              defaultScheduleTime,
              nextRun,
            );
            scheduledTaskIds.push(taskId);
          }
        }

        writeJSON(res, 200, {
          id,
          topic,
          goal,
          phases,
          status: 'created',
          scheduledTaskIds,
          message:
            scheduledTaskIds.length > 0
              ? `已创建学习计划并自动安排${scheduledTaskIds.length}个定时学习任务`
              : '已创建学习计划',
        });
        return;
      }

      if (path === '/api/learning/task/complete' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, taskId, phaseName, reflection, timeSpent } = body;

        if (!agentFolder || !taskId) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        // 触发完整的学习任务完成流程（包括反思和进化提交）
        await reflectionScheduler.completeLearningTask(taskId as string);

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
          taskId,
          status: 'completed',
          reflection: reflection || null,
        });
        return;
      }

      if (path === '/api/learning/task/start' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, taskId, phaseName } = body;

        if (!agentFolder || !taskId) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return;
        }

        updateLearningTask(taskId as string, {
          status: 'in_progress',
        });

        // 记录开始学习到记忆系统
        await memoryManager.addMemory(
          agentFolder as string,
          `开始学习任务：${phaseName || taskId}`,
          'L1',
          undefined,
        );

        writeJSON(res, 200, {
          taskId,
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

        // TODO: 需要传递 agent 对象，这里简化处理
        writeJSON(res, 200, { status: 'triggered' });
        return;
      }

      // ===== 学习结果 API =====

      if (path === '/api/learning/result' && req.method === 'POST') {
        const body = await readJSON(req);
        const {
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
        } = body;

        if (!agentFolder || !status) {
          writeJSON(res, 400, { error: 'Missing agentFolder or status' });
          return;
        }

        const id = createLearningResult({
          taskId: taskId as string | undefined,
          agentFolder: agentFolder as string,
          metricBefore: metricBefore as number | undefined,
          metricAfter: metricAfter as number | undefined,
          metricName: metricName as string | undefined,
          status: status as 'keep' | 'discard' | 'crash',
          description: description as string | undefined,
          signals: signals as string[] | undefined,
          geneId: geneId as string | undefined,
          blastRadius: blastRadius as
            | { files: number; lines: number }
            | undefined,
        });

        writeJSON(res, 200, { id, status: 'recorded' });
        return;
      }

      if (path === '/api/learning/results' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);

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
        const limit = parseInt(url.searchParams.get('limit') || '10', 10);

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
        const { signals, category } = body;

        // 动态导入信号提取模块
        const { getRecommendedGeneCategory } =
          await import('./signal-extractor.js');
        const { getEvolutionEntriesByCategory } =
          await import('./db-agents.js');

        // 如果没有指定类别，根据信号推荐
        const geneCategory =
          (category as string) || getRecommendedGeneCategory(signals as any[]);

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
      writeJSON(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error({ path, method: req.method, err }, 'Runtime API error');
      writeJSON(res, 500, {
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
      if (line.includes('困难') || line.includes('问题') || line.includes('改进')) {
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
  const llmNeeds = await analyzeLearningNeedsWithLLM(agentFolder, needs);
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
      ? points.filter((p) => p.includes('困难') || p.includes('问题')).slice(0, 3)
      : ['尚无任务反思，建议先完成任务并触发反思'],
    solutions: points
      .filter((p) => p.includes('解决') || p.includes('改进') || p.includes('优化'))
      .slice(0, 3),
    suggestions: [
      task.status === 'completed' ? '将本次经验同步到进化库' : '先推进任务到 completed',
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
  const taskType = ['hourly', 'daily', 'weekly', 'monthly', 'task'].includes(type)
    ? (type as 'hourly' | 'daily' | 'weekly' | 'monthly' | 'task')
    : 'task';
  const tasks = getLearningTasksByAgent(agentFolder).slice(0, 20);
  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const recentMemories = await memoryManager.searchMemories(
    agentFolder,
    '学习 任务 进展',
    5,
  );

  const content = [
    `反思类型：${taskType}`,
    `已完成任务：${completedCount}，失败任务：${failedCount}`,
    `重点观察：${recentMemories
      .map((memory) => memory.content.slice(0, 30))
      .join('；') || '暂无近期学习记忆'}`,
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
    keyInsights: [`完成率：${tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100)}%`],
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
    providedTasks && providedTasks.length > 0
      ? providedTasks
      : tasksCompleted;
  const reflections = getReflectionsByAgent(agentFolder, 'daily').slice(0, 3);
  const memories = await memoryManager.searchMemories(agentFolder, '学习 总结', 8);
  const knowledgePoints = new Set<string>();
  for (const memory of memories) {
    splitToPoints(memory.content).forEach((point) => knowledgePoints.add(point));
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
        logger.warn({ err }, 'Failed to initialize learning-needs LLM provider');
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

function readJSON(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(safeJsonParse(body) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function writeJSON(
  res: http.ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
