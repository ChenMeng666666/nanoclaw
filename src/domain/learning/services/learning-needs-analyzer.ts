import { memoryManager } from '../../../memory-manager.js';
import {
  getLearningTasksByAgent,
  getReflectionsByAgent,
} from '../../../db-agents.js';
import { logger } from '../../../logger.js';
import { LocalLLMQueryExpansionProvider } from '../../../query-expansion/local-llm-provider.js';
import type { LearningNeed, LearningModelDecision } from '../../../types/agent-memory.js';

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
