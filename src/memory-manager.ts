/**
 * 记忆管理系统
 * 实现分层记忆架构：L1 工作记忆 → L2 短期记忆 → L3 长期记忆
 * 支持向量嵌入、语义检索、记忆迁移
 */
import crypto from 'crypto';

import {
  createMemory,
  getAllMemories,
  getMemories,
  MemoryQueryOptions,
  updateMemory,
  incrementMemoryAccess,
  deleteMemory,
  getDuplicateMemory,
} from './db-agents.js';
import { Memory } from './types.js';
import { logger } from './logger.js';
import { generateEmbedding as generateEmbeddingFromProvider } from './embedding-providers/registry.js';
import { MEMORY_CONFIG } from './config.js';
import { BM25Index, reciprocalRankFusion } from './hybrid-search.js';

interface MemoryMetadataInput {
  scope?: Memory['scope'];
  sessionId?: string;
  sourceType?: Memory['sourceType'];
  messageType?: Memory['messageType'];
  tags?: string[];
}

export interface MemorySearchExplanation {
  queryVariants: string[];
  matchedTerms: string[];
  scores: {
    bm25: number;
    vector: number;
    fused: number;
    quality: number;
    importance: number;
    timestamp: number;
    final: number;
  };
  scope?: Memory['scope'];
  level: Memory['level'];
  tags?: string[];
}

export interface MemorySearchHit {
  memory: Memory;
  explain: MemorySearchExplanation;
}

/**
 * 生成文本的向量嵌入
 * 使用可插拔的嵌入提供者系统
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    return await generateEmbeddingFromProvider(text);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to generate embedding',
    );
    return [];
  }
}

/**
 * 记忆管理器类
 */
export class MemoryManager {
  // L1 工作记忆缓存（内存中）
  private l1Cache = new Map<string, Memory>();

  // 缓存持久化定时器
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 获取工作记忆（L1）
   * 优先从缓存读取，没有则从数据库加载
   * @param forceReloadFromDB - 是否强制从数据库重新加载（刷新缓存）
   */
  async getWorkingMemory(
    agentFolder: string,
    userJid?: string,
    forceReloadFromDB: boolean = false,
  ): Promise<string> {
    const key = this.makeKey(agentFolder, userJid);

    // 如果强制刷新或缓存不存在，从数据库加载
    if (forceReloadFromDB || !this.l1Cache.has(key)) {
      // 从数据库加载
      const memories = getMemories(agentFolder, 'L1', userJid);
      if (memories.length > 0) {
        const memory = memories[0];
        this.l1Cache.set(key, memory);
        incrementMemoryAccess(memory.id);
        return memory.content;
      }
      // 数据库中没有，清除缓存
      this.l1Cache.delete(key);
      return '';
    }

    const cached = this.l1Cache.get(key)!;
    // 更新访问计数
    incrementMemoryAccess(cached.id);
    return cached.content;
  }

  /**
   * 设置/更新工作记忆（L1）
   */
  async setWorkingMemory(
    agentFolder: string,
    content: string,
    userJid?: string,
  ): Promise<void> {
    const key = this.makeKey(agentFolder, userJid);
    const existing = this.l1Cache.get(key);

    if (existing) {
      // 更新缓存
      existing.content = content;
      existing.updatedAt = new Date().toISOString();
      this.l1Cache.set(key, existing);
      // 立即更新数据库，避免缓存与数据库不一致
      updateMemory(existing.id, {
        content,
        updatedAt: existing.updatedAt,
      });
    } else {
      // 检查重复记忆
      const contentHash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');
      const duplicate = getDuplicateMemory(
        agentFolder,
        contentHash,
        'L1',
        userJid,
      );
      if (duplicate) {
        logger.info(
          { duplicateId: duplicate.id, agentFolder, userJid },
          'Duplicate working memory detected, using existing',
        );
        this.l1Cache.set(key, {
          ...duplicate,
          accessCount: 0,
          lastAccessedAt: new Date().toISOString(),
        });
        incrementMemoryAccess(duplicate.id);
        return;
      }

      // 创建新记忆
      const embedding = await generateEmbedding(content);
      const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
        id: this.generateMemoryId(),
        agentFolder,
        userJid,
        scope: userJid ? 'user' : 'agent',
        level: 'L1',
        content,
        embedding,
        importance: 0.5,
        qualityScore: this.calculateQualityScore(content, {
          sourceType: 'direct',
          scope: userJid ? 'user' : 'agent',
        }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      createMemory(memory);
      this.l1Cache.set(key, {
        ...memory,
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
      });
    }

    // 触发持久化
    this.schedulePersist();
  }

  /**
   * 获取短期记忆（L2）
   */
  async getShortTermMemories(
    agentFolder: string,
    userJid?: string,
  ): Promise<Memory[]> {
    const memories = getMemories(agentFolder, 'L2', userJid);
    for (const memory of memories) {
      incrementMemoryAccess(memory.id);
    }
    return memories;
  }

  /**
   * 获取长期记忆（L3）
   */
  async getLongTermMemories(
    agentFolder: string,
    userJid?: string,
  ): Promise<Memory[]> {
    const memories = getMemories(agentFolder, 'L3', userJid);
    for (const memory of memories) {
      incrementMemoryAccess(memory.id);
    }
    return memories;
  }

  /**
   * 添加记忆到指定层级
   */
  async addMemory(
    agentFolder: string,
    content: string,
    level: 'L1' | 'L2' | 'L3' = 'L1',
    userJid?: string,
    metadata?: MemoryMetadataInput,
  ): Promise<void> {
    // 检查重复记忆
    const contentHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
    const duplicate = getDuplicateMemory(
      agentFolder,
      contentHash,
      level,
      userJid,
    );
    if (duplicate) {
      logger.info(
        { duplicateId: duplicate.id, agentFolder, level, userJid },
        'Duplicate memory detected, skipping',
      );
      // 更新访问计数而不创建新记忆
      incrementMemoryAccess(duplicate.id);
      return;
    }

    const embedding = await generateEmbedding(content);
    const importance = this.calculateImportance(content, level);
    const mergeTarget = this.findLifecycleMergeTarget(
      agentFolder,
      content,
      embedding,
      level,
      userJid,
      metadata,
    );
    if (mergeTarget) {
      const mergedTags = this.mergeTags(mergeTarget.tags, metadata?.tags);
      const mergedContent = this.mergeLifecycleContent(
        mergeTarget.content,
        content,
        mergeTarget.isConflict,
      );
      const qualityScore = this.calculateQualityScore(mergedContent, {
        sourceType: metadata?.sourceType || mergeTarget.sourceType || 'direct',
        scope: metadata?.scope || mergeTarget.scope,
        tags: mergedTags,
        messageType: metadata?.messageType,
      });
      updateMemory(mergeTarget.id, {
        content: mergedContent,
        importance: Math.min(1, Math.max(mergeTarget.importance, importance)),
        qualityScore,
        tags: mergedTags,
      });
      incrementMemoryAccess(mergeTarget.id);
      logger.info(
        {
          targetId: mergeTarget.id,
          level,
          userJid,
          isConflict: mergeTarget.isConflict,
        },
        'Memory merged by lifecycle governance',
      );
      return;
    }
    const qualityScore = this.calculateQualityScore(content, {
      sourceType: metadata?.sourceType || 'direct',
      scope:
        metadata?.scope ||
        (metadata?.sessionId ? 'session' : userJid ? 'user' : 'agent'),
      tags: metadata?.tags,
      messageType: metadata?.messageType,
    });

    const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
      id: this.generateMemoryId(),
      agentFolder,
      userJid,
      sessionId: metadata?.sessionId,
      scope:
        metadata?.scope ||
        (metadata?.sessionId ? 'session' : userJid ? 'user' : 'agent'),
      level,
      content,
      embedding,
      importance,
      qualityScore,
      messageType: metadata?.messageType,
      timestampWeight: 0.5,
      tags: metadata?.tags,
      sourceType: metadata?.sourceType || 'direct',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    createMemory(memory);

    // 如果是 L1，更新缓存
    if (level === 'L1' && userJid) {
      const key = this.makeKey(agentFolder, userJid);
      this.l1Cache.set(key, {
        ...memory,
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
      });
    }

    logger.info(
      { agentFolder, level, userJid, contentLength: content.length },
      'Memory added',
    );
  }

  /**
   * 检查并执行记忆迁移（L1→L2→L3）
   * 基于访问次数和时间衰减
   */
  async migrateMemories(): Promise<number> {
    const allMemories = [...getAllMemories('L1'), ...getAllMemories('L2')];
    let migratedCount = 0;

    for (const memory of allMemories) {
      this.applyLifecycleGovernance(memory);
      const migration = this.shouldMigrateMemory(memory);
      if (migration.should) {
        await this.migrateMemory(memory, migration.targetLevel!);
        migratedCount += 1;
      }
    }
    return migratedCount;
  }

  /**
   * 持久化 L1 缓存到数据库
   */
  async persistL1Memories(): Promise<void> {
    // L1 缓存已经在创建/更新时写入数据库
    // 这里可以清理长时间未使用的缓存
    const now = Date.now();
    const maxIdleTime = 5 * 60 * 1000; // 5 分钟

    for (const [key, memory] of this.l1Cache.entries()) {
      const lastAccess = memory.lastAccessedAt
        ? new Date(memory.lastAccessedAt).getTime()
        : 0;
      if (now - lastAccess > maxIdleTime) {
        this.l1Cache.delete(key);
      }
    }

    logger.debug('L1 memories persisted and cache cleaned');
  }

  async searchMemories(
    agentFolder: string,
    query: string,
    limit: number = 10,
    userJid?: string,
    options?: MemoryQueryOptions,
  ): Promise<Memory[]> {
    const hits = await this.searchMemoriesDetailed(
      agentFolder,
      query,
      limit,
      userJid,
      options,
    );
    return hits.map((hit) => hit.memory);
  }

  async searchMemoriesDetailed(
    agentFolder: string,
    query: string,
    limit: number = 10,
    userJid?: string,
    options?: MemoryQueryOptions,
  ): Promise<MemorySearchHit[]> {
    const memories = getMemories(agentFolder, undefined, userJid, options);
    if (memories.length === 0) {
      return [];
    }
    const queryVariants = this.generateQueryVariants(query);
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
    for (const variant of queryVariants) {
      const bm25Results = bm25Index.searchWithScores(variant, searchLimit);
      for (const item of bm25Results) {
        const current = bm25ScoreMap.get(item.id) ?? 0;
        if (item.score > current) {
          bm25ScoreMap.set(item.id, item.score);
        }
        allBm25Ids.push(item.id);
      }
      const queryEmbedding = await generateEmbedding(variant);
      if (queryEmbedding.length === 0) {
        continue;
      }
      const vectorResults = memories
        .filter(
          (m) => m.embedding && m.embedding.length === queryEmbedding.length,
        )
        .map((memory) => ({
          id: memory.id,
          score: this.cosineSimilarity(queryEmbedding, memory.embedding!),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, searchLimit);
      for (const item of vectorResults) {
        const current = vectorScoreMap.get(item.id) ?? 0;
        if (item.score > current) {
          vectorScoreMap.set(item.id, item.score);
        }
        allVectorIds.push(item.id);
      }
    }
    const uniqueBm25 = [...new Set(allBm25Ids)];
    const uniqueVector = [...new Set(allVectorIds)];
    const fusedResults = reciprocalRankFusion(uniqueBm25, uniqueVector);
    const fusedScoreMap = new Map(
      fusedResults.map((item) => [item.id, item.fusedScore]),
    );
    const maxBm25 = this.safeMax([...bm25ScoreMap.values()]);
    const maxFused = this.safeMax([...fusedScoreMap.values()]);
    const maxVector = this.safeMax([...vectorScoreMap.values()]);
    const memoryMap = new Map(memories.map((memory) => [memory.id, memory]));
    const normalizedWeights = this.normalizeWeights(
      MEMORY_CONFIG.retrieval.rerankWeights,
    );
    const queryTerms = this.extractKeywords(query);
    const scoredHits = [...new Set([...uniqueBm25, ...uniqueVector])]
      .map((id) => {
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
          this.calculateQualityScore(memory.content, {
            sourceType: memory.sourceType,
            scope: memory.scope,
            tags: memory.tags,
            messageType: memory.messageType,
          });
        const timestamp = this.resolveTimestampWeight(memory);
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
            matchedTerms: this.extractMatchedTerms(queryTerms, memory.content),
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
        } satisfies MemorySearchHit;
      })
      .filter((item): item is MemorySearchHit => Boolean(item))
      .sort((a, b) => b.explain.scores.final - a.explain.scores.final)
      .slice(0, limit);
    for (const hit of scoredHits) {
      incrementMemoryAccess(hit.memory.id);
    }
    return scoredHits;
  }

  /**
   * 删除记忆
   */
  async deleteMemory(id: string): Promise<void> {
    deleteMemory(id);
    // 清理缓存
    for (const [key, memory] of this.l1Cache.entries()) {
      if (memory.id === id) {
        this.l1Cache.delete(key);
        break;
      }
    }
    logger.info({ id }, 'Memory deleted');
  }

  // ===== 私有方法 =====

  private makeKey(agentFolder: string, userJid?: string): string {
    return `${agentFolder}:${userJid || 'global'}`;
  }

  private generateMemoryId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private calculateImportance(content: string, level: string): number {
    // 基于内容长度和层级计算初始重要性
    const baseImportance = level === 'L1' ? 0.5 : level === 'L2' ? 0.7 : 0.9;
    const lengthFactor = Math.min(content.length / 1000, 1) * 0.1;
    return Math.min(baseImportance + lengthFactor, 1.0);
  }

  private calculateQualityScore(
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
    return this.clamp01(
      0.38 +
        lengthSignal * 0.23 +
        structuredSignal +
        sourceSignal +
        scopeSignal +
        tagSignal +
        messageSignal,
    );
  }

  private resolveTimestampWeight(memory: Memory): number {
    if (typeof memory.timestampWeight === 'number') {
      return this.clamp01(memory.timestampWeight);
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

  private safeMax(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    return Math.max(...values);
  }

  private normalizeWeights(
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

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'this',
      'that',
      'you',
      'are',
      'can',
      'how',
      'what',
      'please',
      '帮我',
      '请问',
      '一下',
      '这个',
      '那个',
    ]);
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1 && !stopWords.has(token))
      .slice(0, 10);
  }

  private simplifyQuery(text: string): string {
    return text
      .replace(/\b(please|thanks|thank you|could you|would you)\b/gi, ' ')
      .replace(/(请|麻烦|帮我|可以|是否|能不能)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private replaceSynonyms(text: string): string {
    const synonyms: Record<string, string> = {
      问题: '难题',
      方法: '方案',
      使用: '采用',
      学习: '掌握',
      功能: '能力',
      系统: '架构',
      数据: '信息',
      代码: '程序',
      query: 'search',
      bug: 'issue',
    };
    let output = text;
    for (const [key, value] of Object.entries(synonyms)) {
      output = output.replace(new RegExp(`\\b${key}\\b`, 'gi'), value);
    }
    return output;
  }

  private generateQueryVariants(query: string): string[] {
    const variants = new Set<string>();
    const normalized = query.trim();
    if (!normalized) {
      return [];
    }
    variants.add(normalized);
    const simplified = this.simplifyQuery(normalized);
    if (simplified) {
      variants.add(simplified);
    }
    const keywords = this.extractKeywords(normalized);
    if (keywords.length > 0) {
      variants.add(keywords.join(' '));
    }
    const synonymVariant = this.replaceSynonyms(normalized);
    if (synonymVariant) {
      variants.add(synonymVariant);
    }
    return [...variants].slice(0, MEMORY_CONFIG.retrieval.queryVariantLimit);
  }

  private extractMatchedTerms(queryTerms: string[], content: string): string[] {
    const normalized = content.toLowerCase();
    return queryTerms.filter((term) => normalized.includes(term)).slice(0, 8);
  }

  private mergeTags(
    existing?: string[],
    incoming?: string[],
  ): string[] | undefined {
    const merged = [
      ...new Set([...(existing || []), ...(incoming || [])]),
    ].filter((item) => item.trim().length > 0);
    return merged.length > 0 ? merged : undefined;
  }

  private mergeLifecycleContent(
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

  private detectLifecycleConflict(
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
    const overlap = this.extractMatchedTerms(
      this.extractKeywords(existingContent),
      incomingContent,
    );
    return overlap.length >= 2;
  }

  private findLifecycleMergeTarget(
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
      const similarity = this.cosineSimilarity(
        incomingEmbedding,
        candidate.embedding,
      );
      const isConflict = this.detectLifecycleConflict(
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

  private applyLifecycleGovernance(memory: Memory): void {
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
    const nextImportance = this.clamp01(
      memory.importance * decay + reinforce * 0.2,
    );
    const baseQuality =
      memory.qualityScore ??
      this.calculateQualityScore(memory.content, {
        sourceType: memory.sourceType,
        scope: memory.scope,
        tags: memory.tags,
        messageType: memory.messageType,
      });
    const nextQuality = this.clamp01(baseQuality * decay + reinforce * 0.25);
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

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private shouldMigrateMemory(memory: Memory): {
    should: boolean;
    targetLevel?: 'L2' | 'L3';
  } {
    const now = Date.now();
    const lastAccess = memory.lastAccessedAt
      ? new Date(memory.lastAccessedAt).getTime()
      : 0;
    const daysSinceAccess = (now - lastAccess) / (1000 * 60 * 60 * 24);

    // 时间衰减因子（30 天半衰期）
    const decayFactor = Math.exp(-daysSinceAccess / 30);
    const qualityScore = memory.qualityScore ?? 0.5;
    const adjustedImportance =
      memory.importance * decayFactor * (0.95 + qualityScore * 0.05);

    const migrationConfig = MEMORY_CONFIG.migration;

    if (memory.level === 'L1') {
      if (
        memory.accessCount >= migrationConfig.l1ToL2MinAccessCount &&
        daysSinceAccess > migrationConfig.l1ToL2MinIdleDays
      ) {
        return { should: true, targetLevel: 'L2' };
      }
    }

    if (memory.level === 'L2') {
      if (
        daysSinceAccess > migrationConfig.l2ToL3MinIdleDays ||
        adjustedImportance > migrationConfig.l2ToL3MinImportance
      ) {
        return { should: true, targetLevel: 'L3' };
      }
    }

    return { should: false };
  }

  private async migrateMemory(
    memory: Memory,
    targetLevel: 'L2' | 'L3',
  ): Promise<void> {
    const contentPrefix = MEMORY_CONFIG.migration.migratedContentPrefix;
    const content = contentPrefix
      ? `${contentPrefix}${memory.content}`
      : memory.content;
    updateMemory(memory.id, {
      level: targetLevel,
      content,
      importance: targetLevel === 'L2' ? 0.7 : 0.9,
      qualityScore: this.clamp01(
        (memory.qualityScore ?? 0.5) + (targetLevel === 'L3' ? 0.08 : 0.04),
      ),
    });
    if (memory.level === 'L1') {
      for (const [key, cached] of this.l1Cache.entries()) {
        if (cached.id === memory.id) {
          this.l1Cache.delete(key);
          break;
        }
      }
    }
    logger.info(
      { id: memory.id, from: memory.level, to: targetLevel },
      'Memory migrated',
    );
  }

  private cosineSimilarity(a: number[], b: number[]): number {
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

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(
      () => this.persistL1Memories(),
      5 * 60 * 1000,
    ); // 5 分钟
  }

  /**
   * 清除指定的缓存条目
   * 当外部修改记忆时调用此方法以确保缓存一致性
   */
  invalidateCache(agentFolder: string, userJid?: string): void {
    const key = this.makeKey(agentFolder, userJid);
    this.l1Cache.delete(key);
    logger.debug({ agentFolder, userJid }, 'L1 cache invalidated');
  }

  /**
   * 清除所有缓存条目
   * 用于系统级操作后的完全刷新
   */
  invalidateAllCache(): void {
    this.l1Cache.clear();
    logger.debug('All L1 cache invalidated');
  }
}

// 单例导出
export const memoryManager = new MemoryManager();
