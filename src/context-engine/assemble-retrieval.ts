import type { Context } from './context-types.js';
import type { NewMessage } from '../types/core-runtime.js';
import type { Memory } from '../types/agent-memory.js';
import { ASSISTANT_NAME, MEMORY_CONFIG } from '../config.js';
import { getRecentMessagesWithinWindow } from '../db.js';
import { getMemories, incrementMemoryAccess } from '../db-agents.js';
import type { BM25Index} from '../hybrid-search.js';
import { reciprocalRankFusion } from '../hybrid-search.js';
import { generateEmbedding } from './embedding-cache.js';
import { reRankResults, selectVectorCandidates } from './rerank.js';
import {
  type QueryExpansionProvider,
  generateQueryVariants,
} from './query-expansion.js';

/**
 * 3. assemble - 构建上下文（混合检索核心）
 */
export async function assemble(
  chatJid: string,
  limit: number,
  sessionId: string | undefined,
  agentFolder: string,
  bm25Index: BM25Index,
  queryExpansionProvider: QueryExpansionProvider | null,
): Promise<Context> {
  // 获取最近消息
  const messages = getRecentMessages(chatJid, limit);
  const userJid = messages[0]?.sender;
  const effectiveSessionId = sessionId || chatJid;
  const scopedMemories = getScopedMemories(
    agentFolder,
    userJid,
    effectiveSessionId,
  );

  // 构建查询文本
  const recentContent = messages.map((m) => m.content).join(' ');
  if (!recentContent.trim()) {
    return {
      agentFolder: agentFolder,
      userJid,
      messages,
      memories: [],
      timestamp: new Date().toISOString(),
      sessionId: effectiveSessionId,
    };
  }

  // 查询扩展：生成多个查询变体
  const queryVariants = await generateQueryVariants(
    recentContent,
    queryExpansionProvider,
  );

  // 对每个查询变体执行搜索，然后合并结果
  const allBm25Results: string[] = [];
  const allVectorResults: string[] = [];
  const vectorCandidates = selectVectorCandidates(scopedMemories, limit * 2);
  const variantBatchSize = MEMORY_CONFIG.retrieval.variantBatchSize;
  for (let start = 0; start < queryVariants.length; start += variantBatchSize) {
    const variantBatch = queryVariants.slice(start, start + variantBatchSize);
    const batchResults = await Promise.all(
      variantBatch.map(async (query) => {
        const bm25Results = bm25Index.search(query, limit * 2);
        const vectorResults = await vectorSearch(
          query,
          limit * 2,
          vectorCandidates,
        );
        return { bm25Results, vectorResults };
      }),
    );
    for (const result of batchResults) {
      allBm25Results.push(...result.bm25Results);
      allVectorResults.push(...result.vectorResults);
    }
  }

  // 去重
  const uniqueBm25Results = [...new Set(allBm25Results)];
  const uniqueVectorResults = [...new Set(allVectorResults)];

  // RRF 融合
  const fusedResults = reciprocalRankFusion(
    uniqueBm25Results,
    uniqueVectorResults,
  );
  const memoryIds = reRankResults(
    fusedResults,
    recentContent,
    scopedMemories,
    limit,
  );

  // 从数据库加载记忆
  const memories = getMemoriesByIds(memoryIds, scopedMemories);

  return {
    agentFolder: agentFolder,
    userJid,
    messages,
    memories,
    timestamp: new Date().toISOString(),
    sessionId: effectiveSessionId,
  };
}

function getRecentMessages(chatJid: string, limit: number): NewMessage[] {
  const windowHours = Number(process.env.CONTEXT_RECENT_WINDOW_HOURS) || 24;
  const pageSize = Number(process.env.CONTEXT_RECENT_PAGE_SIZE) || 50;
  return getRecentMessagesWithinWindow(chatJid, {
    limit,
    pageSize,
    windowHours,
    botPrefix: ASSISTANT_NAME,
  });
}

function getScopedMemories(
  agentFolder: string,
  userJid?: string,
  sessionId?: string,
): Memory[] {
  const ordered: Memory[] = [];
  const seen = new Set<string>();
  const groups: Memory[][] = [];
  if (sessionId) {
    groups.push(
      getMemories(agentFolder, undefined, userJid, {
        scope: 'session',
        sessionId,
      }),
    );
  }
  if (userJid) {
    groups.push(
      getMemories(agentFolder, undefined, userJid, {
        scope: 'user',
      }),
    );
  }
  groups.push(
    getMemories(agentFolder, undefined, undefined, {
      scope: 'agent',
    }),
  );
  groups.push(
    getMemories(agentFolder, undefined, undefined, {
      scope: 'global',
    }),
  );
  for (const group of groups) {
    for (const memory of group) {
      if (!seen.has(memory.id)) {
        seen.add(memory.id);
        ordered.push(memory);
      }
    }
  }
  return ordered;
}

async function vectorSearch(
  query: string,
  limit: number,
  memories: Memory[],
): Promise<string[]> {
  const queryEmbedding = await generateEmbedding(query);
  if (queryEmbedding.length === 0) {
    return [];
  }

  const scored = memories
    .filter((m) => m.embedding && m.embedding.length > 0)
    .map((memory) => ({
      id: memory.id,
      score: cosineSimilarity(queryEmbedding, memory.embedding!),
    }))
    .filter(
      (item) => item.score >= MEMORY_CONFIG.retrieval.vectorSearchMinScore,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.id);
}

function cosineSimilarity(a: number[], b: number[]): number {
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

function getMemoriesByIds(ids: string[], memories: Memory[]): Memory[] {
  const memoryMap = new Map(memories.map((memory) => [memory.id, memory]));
  const orderedMemories: Memory[] = [];
  for (const id of ids) {
    const memory = memoryMap.get(id);
    if (memory) {
      orderedMemories.push(memory);
      incrementMemoryAccess(memory.id);
    }
  }
  return orderedMemories;
}
