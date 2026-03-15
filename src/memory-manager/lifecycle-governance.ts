import type { Memory, MemoryMetadataInput } from './memory-types.js';
import { MEMORY_CONFIG } from '../config.js';
import { updateMemory, getMemories } from '../db-agents.js';
import {
  calculateQualityScore,
  clamp01,
  cosineSimilarity,
} from './ranking-utils.js';
import { extractKeywords, extractMatchedTerms } from './query-variants.js';

export function mergeTags(
  existing?: string[],
  incoming?: string[],
): string[] | undefined {
  const merged = [
    ...new Set([...(existing || []), ...(incoming || [])]),
  ].filter((item) => item.trim().length > 0);
  return merged.length > 0 ? merged : undefined;
}

export function mergeLifecycleContent(
  existingContent: string,
  incomingContent: string,
  isConflict: boolean,
): string {
  if (existingContent.includes(incomingContent)) {
    return existingContent;
  }
  if (incomingContent.includes(existingContent)) {
    return incomingContent;
  }
  if (isConflict) {
    return `${existingContent}\n冲突补充：${incomingContent}`;
  }
  return `${existingContent}\n补充：${incomingContent}`;
}

export function detectLifecycleConflict(
  existingContent: string,
  incomingContent: string,
): boolean {
  const negatives = ['不', '不是', '不能', '没', 'never', 'not', 'no'];
  const hasNegative = (text: string) =>
    negatives.some((token) => text.includes(token));
  const existingNeg = hasNegative(existingContent.toLowerCase());
  const incomingNeg = hasNegative(incomingContent.toLowerCase());
  if (existingNeg === incomingNeg) {
    return false;
  }
  const overlap = extractMatchedTerms(
    extractKeywords(existingContent),
    incomingContent,
  );
  return overlap.length >= 2;
}

export function findLifecycleMergeTarget(
  agentFolder: string,
  incomingContent: string,
  incomingEmbedding: number[],
  level: 'L1' | 'L2' | 'L3',
  userJid?: string,
  metadata?: MemoryMetadataInput,
): (Memory & { isConflict: boolean }) | null {
  const candidates = getMemories(agentFolder, level, userJid, {
    scope: metadata?.scope,
    sessionId: metadata?.sessionId,
  });
  let bestCandidate: (Memory & { isConflict: boolean }) | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    if (
      !candidate.embedding ||
      candidate.embedding.length !== incomingEmbedding.length
    ) {
      continue;
    }
    const similarity = cosineSimilarity(incomingEmbedding, candidate.embedding);
    const isConflict = detectLifecycleConflict(
      candidate.content.toLowerCase(),
      incomingContent.toLowerCase(),
    );
    const threshold = isConflict
      ? MEMORY_CONFIG.retrieval.conflictMergeThreshold
      : MEMORY_CONFIG.retrieval.semanticDedupThreshold;
    if (similarity >= threshold && similarity > bestScore) {
      bestCandidate = { ...candidate, isConflict };
      bestScore = similarity;
    }
  }
  return bestCandidate;
}

export function applyLifecycleGovernance(memory: Memory): void {
  const now = Date.now();
  const lastAccess = memory.lastAccessedAt
    ? new Date(memory.lastAccessedAt).getTime()
    : new Date(memory.updatedAt).getTime();
  if (Number.isNaN(lastAccess)) {
    return;
  }
  const daysSinceAccess = Math.max(
    0,
    (now - lastAccess) / (1000 * 60 * 60 * 24),
  );
  const decay = Math.exp(-daysSinceAccess / 90);
  const reinforce = Math.min(1, memory.accessCount / 12);
  const nextImportance = clamp01(memory.importance * decay + reinforce * 0.2);
  const baseQuality =
    memory.qualityScore ??
    calculateQualityScore(memory.content, {
      sourceType: memory.sourceType,
      scope: memory.scope,
      tags: memory.tags,
      messageType: memory.messageType,
    });
  const nextQuality = clamp01(baseQuality * decay + reinforce * 0.25);
  if (
    Math.abs(nextImportance - memory.importance) >= 0.02 ||
    Math.abs(nextQuality - (memory.qualityScore ?? baseQuality)) >= 0.02
  ) {
    updateMemory(memory.id, {
      importance: nextImportance,
      qualityScore: nextQuality,
    });
  }
}
