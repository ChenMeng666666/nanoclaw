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
import { URL } from 'url';

import { memoryManager } from './memory-manager.js';
import { evolutionManager } from './evolution-manager.js';
import { reflectionScheduler } from './reflection-scheduler.js';
import {
  getMemories,
  createMemory,
  getLearningTasksByAgent,
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

/**
 * 启动运行时 API 服务器
 */
export function startRuntimeAPI(
  options: Partial<RuntimeAPIOptions> = {},
): http.Server {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!opts.enabled) {
    logger.info('Runtime API disabled');
    // 返回一个空的 server 用于接口兼容
    return http.createServer(() => {});
  }

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

        // 模拟学习需求分析（实际需要更智能的分析）
        const needs: LearningNeed[] = [
          {
            topic: '提升情绪化对话处理能力',
            level: 'intermediate',
            urgency: 'high',
            estimatedTime: 2,
            resources: ['https://example.com/emotional-intelligence'],
          },
          {
            topic: '学习Python数据分析',
            level: 'beginner',
            urgency: 'medium',
            estimatedTime: 3,
            resources: ['https://example.com/python-data-analysis'],
          },
        ];

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

        const needs = Array.isArray(learningNeeds) ? learningNeeds : [];
        const agentFolderStr = String(agentFolder);

        // 模拟生成每日学习计划
        const plan: DailyLearningPlan = {
          id: `plan-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          agentFolder: agentFolderStr,
          tasks: needs.map((need: any, index: number) => ({
            id: `task-${Date.now()}-${index}`,
            agentFolder: agentFolderStr,
            description: need.topic || '',
            status: 'pending' as const,
            resources: need.resources,
            createdAt: new Date().toISOString(),
          })),
          estimatedTime: needs.reduce(
            (sum: number, need: any) => sum + (need.estimatedTime || 0),
            0,
          ),
          priority: 'medium' as const,
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

        // 模拟学习成果分析
        const analysis = {
          taskId,
          knowledgeGained: ['情绪识别的关键信号', '用户表达模式的观察方法'],
          difficulties: ['文字交流中难以捕捉语调'],
          solutions: ['多观察用户的表达模式'],
          suggestions: ['继续练习共情回应方法'],
        };

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

        // 模拟知识提取
        const knowledge = [
          '掌握了情绪识别的关键信号',
          '学会了如何观察用户的表达模式',
          '理解了文字交流中语调捕捉的困难',
        ];

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

        writeJSON(res, 200, { status: 'stopped' });
        return;
      }

      if (path === '/api/learning/automation/status' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return;
        }

        writeJSON(res, 200, { status: 'running' });
        return;
      }

      if (
        path === '/api/learning/reflection/generate' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, type, startTime, endTime } = body;

        if (!agentFolder || !type) {
          writeJSON(res, 400, { error: 'Missing agentFolder or type' });
          return;
        }

        const agentFolderStr = String(agentFolder);

        // 模拟生成反思
        const reflection: DetailedReflection = {
          id: Date.now(),
          agentFolder: agentFolderStr,
          type: type as any,
          content:
            '今日学习了情绪识别技巧，掌握了关键信号，但文字交流中难以捕捉语调',
          taskId: `task-${Date.now()}`,
          completionTime: new Date().toISOString(),
          actualDuration: 60,
          knowledgeGained: ['情绪识别的关键信号'],
          difficulties: ['文字交流中难以捕捉语调'],
          solutions: ['多观察用户的表达模式'],
          suggestions: ['继续练习共情回应方法'],
          keyInsights: ["用户说'真的吗'多次可能表示怀疑"],
          nextSteps: ['需要多观察用户的表达模式'],
          rating: 4,
          createdAt: new Date().toISOString(),
        };

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
        const taskList = Array.isArray(tasks) ? tasks : [];

        // 模拟生成每日总结
        const summary: DailyLearningSummary = {
          id: `summary-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          agentFolder: agentFolderStr,
          tasksCompleted: taskList.length || 2,
          totalTimeSpent: 120,
          knowledgePoints: ['情绪识别的关键信号', '用户表达模式的观察方法'],
          achievements: ['掌握了情绪识别技巧'],
          challenges: ['文字交流中难以捕捉语调'],
          improvements: ['需要多练习共情回应方法'],
          tomorrowPlan: ['学习共情回应方法'],
          mood: 'good',
          notes: '今日学习效果良好，但需要继续练习',
        };

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
    logger.error({ err }, 'Runtime API server error');
  });

  return server;
}

// ===== 辅助函数 =====

function readJSON(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
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
