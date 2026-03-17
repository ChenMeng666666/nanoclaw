import { memoryApplicationService as memoryManager } from '../../../contexts/memory/application/memory-application-service.js';
import {
  getLearningTasksByAgent,
  getReflectionsByAgent,
  createReflection,
} from '../../../db-agents.js';
import type { DetailedReflection } from '../../../types/agent-memory.js';
import type { DailyLearningSummary } from '../../../types/evolution.js';
import {
  extractKnowledgePoints,
  splitToPoints,
} from './learning-outcome-analyzer.js';

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
