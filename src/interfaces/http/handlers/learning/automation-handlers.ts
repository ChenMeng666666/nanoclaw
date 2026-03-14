import type http from 'http';
import type { URL } from 'url';

import {
  getLearningAutomationTasks,
  offsetSchedule,
  parseFixedTimePreference,
  resolveLearningSchedulePreference,
  upsertLearningAutomationTask,
} from '../../../../domain/learning/services/learning-scheduler.js';
import { updateTask, getTasksForGroup, getAllTasks } from '../../../../db.js';
import { readJSON } from '../../parsers/runtime-api-parsers.js';
import { writeJSON } from '../../response.js';

const LEARNING_AUTOMATION_DAILY_PLAN_PROMPT =
  '[learning-automation:daily-plan] 触发每日学习计划';
const LEARNING_AUTOMATION_DAILY_SUMMARY_PROMPT =
  '[learning-automation:daily-summary] 触发每日学习总结';

export function createAutomationHandlers(): {
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

      return false;
    },
  };
}
