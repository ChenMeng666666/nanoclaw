import { getTasksForGroup, updateTask } from '../../../db.js';
import { createScheduledTaskForLearning } from '../../../db-agents.js';
import { reflectionExecutor } from '../../../application/learning/reflection-executor.js';
import { resolveLearningModelDecision } from './learning-needs-analyzer.js';
import type {
  LearningIntentOrchestrationResult,
  LearningModelDecision,
} from '../../../types/agent-memory.js';

const LEARNING_AUTOMATION_DAILY_PLAN_PROMPT =
  '[learning-automation:daily-plan] 触发每日学习计划';
const LEARNING_AUTOMATION_DAILY_SUMMARY_PROMPT =
  '[learning-automation:daily-summary] 触发每日学习总结';

export function parseFixedTimePreference(
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

export function getLearningAutomationTasks(agentFolder: string): {
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

export function upsertLearningAutomationTask(input: {
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

export function resolveLearningSchedulePreference(
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

export function offsetSchedule(
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
  const learningTaskId = await reflectionExecutor.createLearningTask(
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
