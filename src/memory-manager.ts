/**
 * 记忆管理系统
 * 实现分层记忆架构：L1 工作记忆 → L2 短期记忆 → L3 长期记忆
 * 支持向量嵌入、语义检索、记忆迁移
 */
import crypto from 'crypto';

import {
  createMemory,
  getMemories,
  type MemoryQueryOptions,
  updateMemory,
  incrementMemoryAccess,
  deleteMemory,
  getDuplicateMemory,
} from './db-agents.js';
import type { Memory } from './types/agent-memory.js';
import { logger } from './logger.js';

// New imports from refactored modules
import {
  MemoryMetricsTracker,
  type MemoryDashboardMetrics,
} from './memory-manager/metrics.js';
import type {
  MemoryReleaseControl,
  UpdateReleaseControlInput,
} from './memory-manager/release-control-types.js';
import { generateEmbedding } from './memory-manager/embedding.js';
import {
  calculateQualityScore,
  calculateImportance,
} from './memory-manager/ranking-utils.js';
import {
  findLifecycleMergeTarget,
  mergeTags,
  mergeLifecycleContent,
} from './memory-manager/lifecycle-governance.js';
import { migrateMemories } from './memory-manager/migration.js';
import {
  searchMemories,
  searchMemoriesDetailed,
} from './memory-manager/retrieval.js';
import type {
  MemoryMetadataInput,
  MemorySearchHit,
  MemorySearchExplanation,
} from './memory-manager/memory-types.js';

import { L1CacheManager } from './memory-manager/l1-cache-manager.js';
import { ReleaseControlService } from './memory-manager/release-control-service.js';

// Re-export types for compatibility
export type {
  MemorySearchHit,
  MemorySearchExplanation,
  MemoryDashboardMetrics,
  MemoryReleaseControl,
  MemoryMetadataInput,
};
export { generateEmbedding };

/**
 * 记忆管理器类
 */
export class MemoryManager {
  private metricsTracker = new MemoryMetricsTracker();
  private l1CacheManager: L1CacheManager;
  private releaseControlService: ReleaseControlService;

  constructor() {
    this.l1CacheManager = new L1CacheManager(this.metricsTracker);
    this.releaseControlService = new ReleaseControlService();
  }

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
    return this.l1CacheManager.getWorkingMemory(
      agentFolder,
      userJid,
      forceReloadFromDB,
    );
  }

  getDashboardMetrics(timelineLimit: number = 24): MemoryDashboardMetrics {
    return this.metricsTracker.getDashboardMetrics(timelineLimit);
  }

  getReleaseControl(): MemoryReleaseControl {
    return this.releaseControlService.getReleaseControl();
  }

  updateReleaseControl(
    input: UpdateReleaseControlInput,
    operator: string,
    reason?: string,
  ): { operationId: string; control: MemoryReleaseControl } {
    return this.releaseControlService.updateReleaseControl(
      input,
      operator,
      reason,
    );
  }

  rollbackReleaseControl(
    operationId: string,
    operator: string,
  ): MemoryReleaseControl {
    return this.releaseControlService.rollbackReleaseControl(
      operationId,
      operator,
    );
  }

  /**
   * 设置/更新工作记忆（L1）
   */
  async setWorkingMemory(
    agentFolder: string,
    content: string,
    userJid?: string,
  ): Promise<void> {
    return this.l1CacheManager.setWorkingMemory(agentFolder, content, userJid);
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
    const importance = calculateImportance(content, level);
    const mergeTarget = findLifecycleMergeTarget(
      agentFolder,
      content,
      embedding,
      level,
      userJid,
      metadata,
    );
    if (mergeTarget) {
      const mergedTags = mergeTags(mergeTarget.tags, metadata?.tags);
      const mergedContent = mergeLifecycleContent(
        mergeTarget.content,
        content,
        mergeTarget.isConflict,
      );
      const qualityScore = calculateQualityScore(mergedContent, {
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
    const qualityScore = calculateQualityScore(content, {
      sourceType: metadata?.sourceType || 'direct',
      scope:
        metadata?.scope ||
        (metadata?.sessionId ? 'session' : userJid ? 'user' : 'agent'),
      tags: metadata?.tags,
      messageType: metadata?.messageType,
    });

    // Need to generate ID here because we use it for L1 cache update
    const memoryId = crypto.randomBytes(16).toString('hex');

    const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
      id: memoryId,
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
      this.l1CacheManager.updateCacheEntry({
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
    return migrateMemories(
      this.metricsTracker,
      (agentFolder, userJid) =>
        this.releaseControlService.resolveMigrationRules(agentFolder, userJid),
      (id) => this.l1CacheManager.invalidateCacheById(id),
    );
  }

  /**
   * 持久化 L1 缓存到数据库
   */
  async persistL1Memories(): Promise<void> {
    return this.l1CacheManager.persistL1Memories();
  }

  async searchMemories(
    agentFolder: string,
    query: string,
    limit: number = 10,
    userJid?: string,
    options?: MemoryQueryOptions,
  ): Promise<Memory[]> {
    const retrievalRollout = this.releaseControlService.resolveRetrievalRollout(
      agentFolder,
      userJid,
    );
    return searchMemories(
      agentFolder,
      query,
      limit,
      userJid,
      options,
      retrievalRollout,
      this.metricsTracker,
    );
  }

  async searchMemoriesDetailed(
    agentFolder: string,
    query: string,
    limit: number = 10,
    userJid?: string,
    options?: MemoryQueryOptions,
  ): Promise<MemorySearchHit[]> {
    const retrievalRollout = this.releaseControlService.resolveRetrievalRollout(
      agentFolder,
      userJid,
    );
    return searchMemoriesDetailed(
      agentFolder,
      query,
      limit,
      userJid,
      options,
      retrievalRollout,
      this.metricsTracker,
    );
  }

  /**
   * 删除记忆
   */
  async deleteMemory(id: string): Promise<void> {
    deleteMemory(id);
    this.l1CacheManager.invalidateCacheById(id);
    logger.info({ id }, 'Memory deleted');
  }

  /**
   * 清除指定的缓存条目
   * 当外部修改记忆时调用此方法以确保缓存一致性
   */
  invalidateCache(agentFolder: string, userJid?: string): void {
    this.l1CacheManager.invalidateCache(agentFolder, userJid);
  }

  /**
   * 清除所有缓存条目
   * 用于系统级操作后的完全刷新
   */
  invalidateAllCache(): void {
    this.l1CacheManager.invalidateAllCache();
  }
}

// 单例导出
export const memoryManager = new MemoryManager();
