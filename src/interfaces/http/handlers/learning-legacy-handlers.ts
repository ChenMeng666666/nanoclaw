import type http from 'http';
import type { URL } from 'url';

import { memoryManager } from '../../../memory-manager.js';
import { reflectionScheduler } from '../../../reflection-scheduler.js';
import {
  createLearningResult,
  createScheduledTaskForLearning,
  getAgentByFolder,
  getLearningResultsByAgent,
  getLearningTask,
  getLearningTasksByAgent,
  getRecentLearningResults,
  updateLearningTask,
} from '../../../db-agents.js';
import { getAllTasks, getTasksForGroup, updateTask } from '../../../db.js';
import { MEMORY_CONFIG } from '../../../config.js';
import type { DailyLearningPlan, LearningNeed } from '../../../types.js';
import {
  analyzeLearningNeeds,
  inferPlanPriority,
  normalizeLearningNeeds,
  resolveLearningModelDecision,
} from '../../../domain/learning/services/learning-needs-analyzer.js';
import {
  analyzeLearningOutcome,
  extractKnowledgePoints,
} from '../../../domain/learning/services/learning-outcome-analyzer.js';
import {
  getLearningAutomationTasks,
  offsetSchedule,
  orchestrateLearningIntent,
  parseFixedTimePreference,
  resolveLearningSchedulePreference,
  upsertLearningAutomationTask,
} from '../../../domain/learning/services/learning-scheduler.js';
import {
  generateDailySummary,
  generateRuntimeReflection,
} from '../../../domain/learning/services/reflection-generator.js';
import {
  parseLearningResultStatus,
  parseOptionalBlastRadius,
  parseOptionalIntegerInRange,
  parseOptionalNumberInRange,
  parseOptionalString,
  parseOptionalStringArray,
  parseOptionalStringWithLimit,
  parseRequiredString,
  readJSON,
} from '../parsers/runtime-api-parsers.js';
import { writeJSON } from '../response.js';

const LEARNING_AUTOMATION_DAILY_PLAN_PROMPT =
  '[learning-automation:daily-plan] 触发每日学习计划';
const LEARNING_AUTOMATION_DAILY_SUMMARY_PROMPT =
  '[learning-automation:daily-summary] 触发每日学习总结';

export function createLearningLegacyHandlers(): {
  handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    path: string,
  ): Promise<boolean>;
} {
  const learningAutomationState = new Set<string>();

  return {
    async handle(req, res, url, path) {
      if (path === '/api/learning/analyze-needs' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
        }

        const needs = await analyzeLearningNeeds(String(agentFolder));
        const modelDecision = resolveLearningModelDecision(
          'analyze-needs',
          'local',
        );

        writeJSON(res, 200, { needs, modelDecision });
        return true;
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
          return true;
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
        return true;
      }

      if (
        path === '/api/learning/generate-daily-plan' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, learningNeeds } = body;

        if (!agentFolder || !learningNeeds) {
          writeJSON(res, 400, { error: 'Missing required fields' });
          return true;
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
        return true;
      }

      if (path === '/api/learning/analyze-outcome' && req.method === 'POST') {
        const body = await readJSON(req);
        const { taskId } = body;

        if (!taskId) {
          writeJSON(res, 400, { error: 'Missing taskId' });
          return true;
        }

        const analysis = analyzeLearningOutcome(String(taskId));

        writeJSON(res, 200, analysis);
        return true;
      }

      if (path === '/api/learning/extract-knowledge' && req.method === 'POST') {
        const body = await readJSON(req);
        const { taskId, reflectionId } = body;

        if (!taskId && !reflectionId) {
          writeJSON(res, 400, { error: 'Missing taskId or reflectionId' });
          return true;
        }

        const knowledge = extractKnowledgePoints(
          taskId ? String(taskId) : undefined,
          reflectionId ? Number(reflectionId) : undefined,
        );

        writeJSON(res, 200, { knowledgePoints: knowledge });
        return true;
      }

      if (path === '/api/learning/automation/start' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, chatJid, dailyPlanTime, dailySummaryTime } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
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
        return true;
      }

      if (path === '/api/learning/automation/stop' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
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
        return true;
      }

      if (path === '/api/learning/automation/status' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
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
        return true;
      }

      if (
        path === '/api/learning/reflection/generate' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, type } = body;

        if (!agentFolder || !type) {
          writeJSON(res, 400, { error: 'Missing agentFolder or type' });
          return true;
        }

        const agentFolderStr = String(agentFolder);

        const reflection = await generateRuntimeReflection(
          agentFolderStr,
          String(type),
        );

        writeJSON(res, 200, reflection);
        return true;
      }

      if (
        path === '/api/learning/generate-daily-summary' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, tasks } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
        }

        const agentFolderStr = String(agentFolder);
        const taskList = Array.isArray(tasks) ? tasks : undefined;
        const summary = await generateDailySummary(agentFolderStr, taskList);

        writeJSON(res, 200, summary);
        return true;
      }

      if (path === '/api/learning/tasks' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const status = url.searchParams.get('status');

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
        }

        const tasks = getLearningTasksByAgent(agentFolder);
        const filtered = status
          ? tasks.filter((t) => t.status === status)
          : tasks;

        writeJSON(res, 200, { tasks: filtered });
        return true;
      }

      if (path === '/api/learning/task/create' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, description, resources } = body;

        if (!agentFolder || !description) {
          writeJSON(res, 400, { error: 'Missing agentFolder or description' });
          return true;
        }

        const id = await reflectionScheduler.createLearningTask(
          agentFolder as string,
          description as string,
          resources as string[] | undefined,
        );

        writeJSON(res, 200, { id });
        return true;
      }

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
          return true;
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
        return true;
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
          return true;
        }

        const task = getLearningTask(resolvedTaskId);
        if (!task) {
          writeJSON(res, 404, { error: 'Learning task not found' });
          return true;
        }
        if (task.agentFolder !== String(agentFolder)) {
          writeJSON(res, 409, {
            error: 'Learning task does not belong to agentFolder',
          });
          return true;
        }

        await reflectionScheduler.completeLearningTask(resolvedTaskId);

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
        return true;
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
          return true;
        }

        const task = getLearningTask(resolvedTaskId);
        if (!task) {
          writeJSON(res, 404, { error: 'Learning task not found' });
          return true;
        }
        if (task.agentFolder !== String(agentFolder)) {
          writeJSON(res, 409, {
            error: 'Learning task does not belong to agentFolder',
          });
          return true;
        }

        updateLearningTask(resolvedTaskId, {
          status: 'in_progress',
        });

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
        return true;
      }

      if (path === '/api/learning/plans' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
        }

        const memories = await memoryManager.searchMemories(
          agentFolder,
          '学习计划',
          20,
        );

        writeJSON(res, 200, { plans: memories });
        return true;
      }

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
        return true;
      }

      if (path === '/api/reflection/trigger' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, type, triggeredBy } = body;

        if (!agentFolder || !type) {
          writeJSON(res, 400, { error: 'Missing agentFolder or type' });
          return true;
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
          return true;
        }

        const agent = getAgentByFolder(agentFolder as string);
        if (!agent) {
          writeJSON(res, 404, { error: 'Agent not found' });
          return true;
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
        return true;
      }

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
        return true;
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
          return true;
        }

        const results = getLearningResultsByAgent(agentFolder, limit);
        writeJSON(res, 200, { results });
        return true;
      }

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
        return true;
      }

      if (path === '/api/learning/system/update' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
        }

        writeJSON(res, 200, {
          status: 'updated',
          version: '1.1',
          message: '学习体系已更新到最新版本',
          agentFolder,
        });
        return true;
      }

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
        return true;
      }

      if (path === '/api/signals/extract' && req.method === 'POST') {
        const body = await readJSON(req);
        const { content, memorySnippet, language } = body;

        if (!content) {
          writeJSON(res, 400, { error: 'Missing content' });
          return true;
        }

        const { extractSignals } = await import('../../../signal-extractor.js');
        const signals = extractSignals({
          content: content as string,
          memorySnippet: memorySnippet as string | undefined,
          language: language as 'en' | 'zh-CN' | 'zh-TW' | 'ja' | undefined,
        });

        writeJSON(res, 200, { signals });
        return true;
      }

      if (path === '/api/saturation/detect' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const limit =
          parseOptionalIntegerInRange(
            url.searchParams.get('limit'),
            'limit',
            MEMORY_CONFIG.api.minLimit,
            MEMORY_CONFIG.api.maxLimit,
          ) || 10;

        const recentResults = agentFolder
          ? getLearningResultsByAgent(agentFolder, limit)
          : getRecentLearningResults(limit);

        const { detectSaturation, getSaturationSummary } =
          await import('../../../saturation-detector.js');
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
        return true;
      }

      return false;
    },
  };
}
