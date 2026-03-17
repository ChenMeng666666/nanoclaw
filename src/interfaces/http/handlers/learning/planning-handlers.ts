import type http from 'http';
import type { URL } from 'url';

import { memoryApplicationService as memoryManager } from '../../../../contexts/memory/application/memory-application-service.js';
import { reflectionExecutor } from '../../../../application/learning/reflection-executor.js';
import {
  createScheduledTaskForLearning,
  getLearningTask,
  getLearningTasksByAgent,
  updateLearningTask,
} from '../../../../db-agents.js';
import type {
  DailyLearningPlan,
  LearningNeed,
} from '../../../../types/agent-memory.js';
import {
  analyzeLearningNeeds,
  inferPlanPriority,
  normalizeLearningNeeds,
  resolveLearningModelDecision,
} from '../../../../domain/learning/services/learning-needs-analyzer.js';
import {
  orchestrateLearningIntent,
  offsetSchedule,
  resolveLearningSchedulePreference,
} from '../../../../domain/learning/services/learning-scheduler.js';
import { readJSON } from '../../../../contexts/security/interfaces/http/runtime-api-parsers/index.js';
import { writeJSON } from '../../response.js';

export function createPlanningHandlers(): {
  handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    path: string,
  ): Promise<boolean>;
} {
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
        const id = await reflectionExecutor.createLearningTask(
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
            const phaseTaskId = await reflectionExecutor.createLearningTask(
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

      if (path === '/api/learning/task/create' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, description, resources } = body;

        if (!agentFolder || !description) {
          writeJSON(res, 400, { error: 'Missing agentFolder or description' });
          return true;
        }

        const id = await reflectionExecutor.createLearningTask(
          agentFolder as string,
          description as string,
          resources as string[] | undefined,
        );

        writeJSON(res, 200, { id });
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

        await reflectionExecutor.completeLearningTask(resolvedTaskId);

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

      return false;
    },
  };
}
