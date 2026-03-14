import { Memory } from '../types.js';
import {
  getMemories,
  incrementMemoryAccess,
  MemoryQueryOptions,
} from '../db-agents.js';
import { MEMORY_CONFIG } from '../config.js';
import { BM25Index, reciprocalRankFusion } from '../hybrid-search.js';
import { generateEmbedding } from './embedding.js';
import { MemorySearchHit } from './types.js';
import { RetrievalRolloutConfig } from './release-control-types.js';
import { MemoryMetricsTracker } from './metrics.js';
import {
  generateQueryVariants,
  extractKeywords,
  extractMatchedTerms,
} from './query-variants.js';
import {
  selectVectorCandidates,
  cosineSimilarity,
  safeMax,
  normalizeWeights,
  resolveTimestampWeight,
  calculateQualityScore,
} from './ranking-utils.js';

export async function searchMemoriesDetailed(
  agentFolder: string,
  query: string,
  limit: number = 10,
  userJid: string | undefined,
  options: MemoryQueryOptions | undefined,
  retrievalRollout: RetrievalRolloutConfig,
  tracker: MemoryMetricsTracker,
): Promise<MemorySearchHit[]> {
  const startedAt = Date.now();
  const memories = getMemories(agentFolder, undefined, userJid, options);
  if (memories.length === 0) {
    tracker.recordSearchMetrics(limit, 0, 0, Date.now() - startedAt);
    return [];
  }

  const queryVariants = generateQueryVariants(query);
  const searchLimit = Math.min(
    Math.max(limit * 3, limit),
    MEMORY_CONFIG.api.maxLimit,
  );
  const bm25Index = new BM25Index();
  for (const memory of memories) {
    bm25Index.addDocument(memory.id, memory.content);
  }
  const bm25ScoreMap = new Map<string, number>();
  const vectorScoreMap = new Map<string, number>();
  const allBm25Ids: string[] = [];
  const allVectorIds: string[] = [];
  const vectorCandidates = selectVectorCandidates(memories, searchLimit);
  const variantBatchSize = MEMORY_CONFIG.retrieval.variantBatchSize;
  for (let start = 0; start < queryVariants.length; start += variantBatchSize) {
    const variantBatch = queryVariants.slice(start, start + variantBatchSize);
    const batchResults = await Promise.all(
      variantBatch.map(async (variant) => {
        const bm25Results = bm25Index.searchWithScores(variant, searchLimit);
        const queryEmbedding = await generateEmbedding(variant);
        if (queryEmbedding.length === 0) {
          return {
            bm25Results,
            vectorResults: [] as Array<{ id: string; score: number }>,
          };
        }
        const vectorResults = vectorCandidates
          .filter(
            (m) => m.embedding && m.embedding.length === queryEmbedding.length,
          )
          .map((memory) => ({
            id: memory.id,
            score: cosineSimilarity(queryEmbedding, memory.embedding!),
          }))
          .filter((item) => item.score >= retrievalRollout.vectorSearchMinScore)
          .sort((a, b) => b.score - a.score)
          .slice(0, searchLimit);
        return { bm25Results, vectorResults };
      }),
    );
    for (const result of batchResults) {
      for (const item of result.bm25Results) {
        const current = bm25ScoreMap.get(item.id) ?? 0;
        if (item.score > current) {
          bm25ScoreMap.set(item.id, item.score);
        }
        allBm25Ids.push(item.id);
      }
      for (const item of result.vectorResults) {
        const current = vectorScoreMap.get(item.id) ?? 0;
        if (item.score > current) {
          vectorScoreMap.set(item.id, item.score);
        }
        allVectorIds.push(item.id);
      }
    }
  }
  const uniqueBm25 = [...new Set(allBm25Ids)];
  const uniqueVector = [...new Set(allVectorIds)];
  const fusedResults = reciprocalRankFusion(uniqueBm25, uniqueVector);
  const fusedScoreMap = new Map(
    fusedResults.map((item) => [item.id, item.fusedScore]),
  );
  const maxBm25 = safeMax([...bm25ScoreMap.values()]);
  const maxFused = safeMax([...fusedScoreMap.values()]);
  const maxVector = safeMax([...vectorScoreMap.values()]);
  const memoryMap = new Map(memories.map((memory) => [memory.id, memory]));
  const normalizedWeights = normalizeWeights(retrievalRollout.rerankWeights);
  const queryTerms = extractKeywords(query);
  const scoredHits = [...new Set([...uniqueBm25, ...uniqueVector])]
    .map((id): MemorySearchHit | null => {
      const memory = memoryMap.get(id);
      if (!memory) {
        return null;
      }
      const bm25Raw = bm25ScoreMap.get(id) ?? 0;
      const vectorRaw = vectorScoreMap.get(id) ?? 0;
      const fusedRaw = fusedScoreMap.get(id) ?? 0;
      const bm25 = maxBm25 > 0 ? bm25Raw / maxBm25 : 0;
      const vector = maxVector > 0 ? vectorRaw / maxVector : 0;
      const fused = maxFused > 0 ? fusedRaw / maxFused : 0;
      const quality =
        memory.qualityScore ??
        calculateQualityScore(memory.content, {
          sourceType: memory.sourceType,
          scope: memory.scope,
          tags: memory.tags,
          messageType: memory.messageType,
        });
      const timestamp = resolveTimestampWeight(memory);
      const importance = memory.importance || 0;
      const final =
        fused * normalizedWeights.fused +
        vector * normalizedWeights.vector +
        bm25 * normalizedWeights.bm25 +
        quality * normalizedWeights.quality +
        timestamp * normalizedWeights.timestamp +
        importance * normalizedWeights.importance;
      return {
        memory,
        explain: {
          queryVariants,
          matchedTerms: extractMatchedTerms(queryTerms, memory.content),
          scores: {
            bm25,
            vector,
            fused,
            quality,
            importance,
            timestamp,
            final,
          },
          scope: memory.scope,
          level: memory.level,
          tags: memory.tags,
        },
      };
    })
    .filter((item): item is MemorySearchHit => item !== null)
    .sort((a, b) => b.explain.scores.final - a.explain.scores.final)
    .slice(0, limit);
  const lowConfidenceHits = scoredHits.filter(
    (hit) => hit.explain.scores.final < retrievalRollout.lowConfidenceThreshold,
  ).length;
  tracker.recordSearchMetrics(
    limit,
    scoredHits.length,
    lowConfidenceHits,
    Date.now() - startedAt,
  );
  for (const hit of scoredHits) {
    incrementMemoryAccess(hit.memory.id);
  }
  return scoredHits;
}

export async function searchMemories(
  agentFolder: string,
  query: string,
  limit: number = 10,
  userJid: string | undefined,
  options: MemoryQueryOptions | undefined,
  retrievalRollout: RetrievalRolloutConfig,
  tracker: MemoryMetricsTracker,
): Promise<Memory[]> {
  const hits = await searchMemoriesDetailed(
    agentFolder,
    query,
    limit,
    userJid,
    options,
    retrievalRollout,
    tracker,
  );
  return hits.map((hit) => hit.memory);
}
