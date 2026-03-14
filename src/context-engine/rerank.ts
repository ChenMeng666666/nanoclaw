import { Memory } from '../types.js';
import { MEMORY_CONFIG } from '../config.js';

/**
 * 结果重排序
 * 基于内容相关性对 RRF 结果进行二次排序，同时考虑时间戳权重和重要性
 */
export function reRankResults(
  results: any[],
  query: string,
  memories: Memory[],
  limit: number,
): string[] {
  const memoryMap = new Map<string, Memory>();
  for (const memory of memories) {
    memoryMap.set(memory.id, memory);
  }

  // 对结果进行二次排序：结合 RRF 分数、内容相似度、时间戳权重和重要性
  const scoredResults = results.map((result) => {
    const memory = memoryMap.get(result.id);
    if (!memory) {
      return { ...result, finalScore: result.fusedScore };
    }

    // 计算内容相似度（简单的词重叠分数）
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const contentWords = new Set(memory.content.toLowerCase().split(/\s+/));
    const overlap = [...queryWords].filter((word) =>
      contentWords.has(word),
    ).length;
    const overlapScore =
      overlap / Math.sqrt(queryWords.size * contentWords.size);

    // 获取时间戳权重（如果记忆中没有，使用默认值）
    const timestampWeight = memory.timestampWeight || 0.5;

    // 获取重要性（如果记忆中没有，使用默认值）
    const importance = memory.importance || 0.5;

    // 结合分数：
    // - 40% RRF 分数（原始搜索相关性）
    // - 25% 内容重叠分数（查询词匹配）
    // - 20% 时间戳权重（新鲜度）
    // - 15% 重要性（记忆的重要程度）
    const finalScore =
      result.fusedScore * 0.4 +
      overlapScore * 0.25 +
      timestampWeight * 0.2 +
      importance * 0.15;

    return { ...result, finalScore, memory };
  });

  // 按最终分数排序并返回前 N 个
  return scoredResults
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit)
    .map((result) => result.id);
}

export function selectVectorCandidates(memories: Memory[], limit: number): Memory[] {
  if (memories.length <= limit) {
    return memories;
  }
  const candidateLimit = Math.min(
    memories.length,
    Math.max(
      limit * MEMORY_CONFIG.retrieval.vectorCandidateMultiplier,
      limit,
    ),
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

export function rankMemoryHotness(memory: Memory): number {
  const anchor = memory.lastAccessedAt || memory.updatedAt;
  const timestamp = new Date(anchor).getTime();
  const recencyScore = Number.isNaN(timestamp)
    ? 0
    : Math.max(
        0,
        1 -
          (Date.now() - timestamp) /
            (MEMORY_CONFIG.retrieval.hotMemoryWindowDays *
              24 *
              60 *
              60 *
              1000),
      );
  return (
    (memory.accessCount || 0) * 0.4 +
    (memory.importance || 0) * 0.25 +
    (memory.qualityScore || 0) * 0.2 +
    recencyScore * 0.15
  );
}
