import { memoryManager } from './memory-manager.js';
import { reflectionScheduler } from './reflection-scheduler.js';
import {
  getLearningTask,
  getLearningTasksByAgent,
  getReflectionsByAgent,
  createReflection,
  createScheduledTaskForLearning,
} from './db-agents.js';
import { getTasksForGroup, updateTask } from './db.js';
import { logger } from './logger.js';
import { LocalLLMQueryExpansionProvider } from './query-expansion/local-llm-provider.js';
import type {
  LearningNeed,
  DetailedReflection,
  DailyLearningSummary,
  LearningIntentOrchestrationResult,
  LearningModelDecision,
} from './types.js';

const LEARNING_AUTOMATION_DAILY_PLAN_PROMPT =
  '[learning-automation:daily-plan] 触发每日学习计划';
const LEARNING_AUTOMATION_DAILY_SUMMARY_PROMPT =
  '[learning-automation:daily-summary] 触发每日学习总结';
let learningNeedsLlmProvider: LocalLLMQueryExpansionProvider | null = null;
let learningNeedsLlmInitPromise: Promise<void> | null = null;

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

export function resolveLearningModelDecision(
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
