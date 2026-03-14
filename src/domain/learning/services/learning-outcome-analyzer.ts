import { getLearningTask, getReflectionsByAgent } from '../../../db-agents.js';

export function splitToPoints(text: string): string[] {
  return text
    .split(/[\n。；;!！?？]/g)
    .map((part) => part.replace(/^[-*]\s*/, '').trim())
    .filter((part) => part.length >= 6)
    .slice(0, 20);
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
