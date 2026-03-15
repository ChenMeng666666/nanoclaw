import type { Memory } from '../types.js';
import { MEMORY_CONFIG } from '../config.js';

export function calculateImportance(content: string, level: string): number {
  // 基于内容长度和层级计算初始重要性
  const baseImportance = level === 'L1' ? 0.5 : level === 'L2' ? 0.7 : 0.9;
  const lengthFactor = Math.min(content.length / 1000, 1) * 0.1;
  return Math.min(baseImportance + lengthFactor, 1.0);
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function calculateQualityScore(
  content: string,
  metadata?: {
    sourceType?: Memory['sourceType'];
    scope?: Memory['scope'];
    tags?: string[];
    messageType?: Memory['messageType'];
  },
): number {
  const lengthSignal = Math.min(content.trim().length / 600, 1);
  const structuredSignal = /[`#:\-\n]/.test(content) ? 0.12 : 0;
  const sourceSignal =
    metadata?.sourceType === 'summary'
      ? 0.12
      : metadata?.sourceType === 'extracted'
        ? 0.08
        : 0.05;
  const scopeSignal =
    metadata?.scope === 'session'
      ? 0.07
      : metadata?.scope === 'user'
        ? 0.1
        : metadata?.scope === 'global'
          ? 0.09
          : 0.06;
  const tagSignal = Math.min((metadata?.tags?.length || 0) * 0.03, 0.12);
  const messageSignal = metadata?.messageType === 'code' ? 0.08 : 0.04;
  return clamp01(
    0.38 +
      lengthSignal * 0.23 +
      structuredSignal +
      sourceSignal +
      scopeSignal +
      tagSignal +
      messageSignal,
  );
}

export function resolveTimestampWeight(memory: Memory): number {
  if (typeof memory.timestampWeight === 'number') {
    return clamp01(memory.timestampWeight);
  }
  const updatedAt = new Date(memory.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) {
    return 0.5;
  }
  const days = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
  if (days <= 1) return 1;
  if (days <= 7) return 0.8;
  if (days <= 30) return 0.55;
  return 0.35;
}

export function safeMax(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.max(...values);
}

export function normalizeWeights(
  weights: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(weights);
  const sum = entries.reduce((acc, [, value]) => acc + value, 0);
  if (sum <= 0) {
    return {
      fused: 1 / 6,
      vector: 1 / 6,
      bm25: 1 / 6,
      quality: 1 / 6,
      timestamp: 1 / 6,
      importance: 1 / 6,
    };
  }
  return Object.fromEntries(
    entries.map(([key, value]) => [key, value / sum]),
  ) as Record<string, number>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankMemoryHotness(memory: Memory): number {
  const anchor = memory.lastAccessedAt || memory.updatedAt;
  const timestamp = new Date(anchor).getTime();
  const recencyScore = Number.isNaN(timestamp)
    ? 0
    : Math.max(
        0,
        1 -
          (Date.now() - timestamp) /
            (MEMORY_CONFIG.retrieval.hotMemoryWindowDays * 24 * 60 * 60 * 1000),
      );
  return (
    (memory.accessCount || 0) * 0.4 +
    (memory.importance || 0) * 0.25 +
    (memory.qualityScore || 0) * 0.2 +
    recencyScore * 0.15
  );
}

export function isHotMemory(memory: Memory): boolean {
  if (memory.level === 'L1') {
    return true;
  }
  if (memory.level === 'L2' && memory.accessCount >= 2) {
    return true;
  }
  const anchor = memory.lastAccessedAt || memory.updatedAt;
  const timestamp = new Date(anchor).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }
  const hotWindowMs =
    MEMORY_CONFIG.retrieval.hotMemoryWindowDays * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp <= hotWindowMs;
}

export function selectVectorCandidates(
  memories: Memory[],
  limit: number,
): Memory[] {
  if (memories.length <= limit) {
    return memories;
  }
  const candidateLimit = Math.min(
    memories.length,
    Math.max(limit * MEMORY_CONFIG.retrieval.vectorCandidateMultiplier, limit),
  );
  const hotTarget = Math.max(
    1,
    Math.floor(candidateLimit * MEMORY_CONFIG.retrieval.hotCandidateRatio),
  );
  const coldTarget = Math.max(0, candidateLimit - hotTarget);
  const hot = memories
    .filter((memory) => isHotMemory(memory))
    .sort((a, b) => rankMemoryHotness(b) - rankMemoryHotness(a))
    .slice(0, hotTarget);
  const hotIds = new Set(hot.map((memory) => memory.id));
  const cold = memories
    .filter((memory) => !hotIds.has(memory.id))
    .sort((a, b) => rankMemoryHotness(b) - rankMemoryHotness(a))
    .slice(0, coldTarget);
  return [...hot, ...cold];
}
