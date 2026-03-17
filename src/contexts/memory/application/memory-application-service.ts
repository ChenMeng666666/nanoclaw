import crypto from 'crypto';

import {
  createMemory,
  getMemories,
  type MemoryQueryOptions,
  updateMemory,
  incrementMemoryAccess,
  deleteMemory,
  getDuplicateMemory,
} from '../infrastructure/persistence/memory-repository.js';
import type { Memory } from '../../../types/agent-memory.js';
import { logger } from '../../../logger.js';
import {
  calculateQualityScore,
  calculateImportance,
  findLifecycleMergeTarget,
  mergeTags,
  mergeLifecycleContent,
} from '../domain/index.js';
import {
  MemoryMetricsTracker,
  type MemoryDashboardMetrics,
} from '../infrastructure/observability/memory-metrics-tracker.js';
import type {
  MemoryReleaseControl,
  UpdateReleaseControlInput,
} from './contracts/release-control.js';
import { generateEmbedding } from '../infrastructure/adapters/embedding-adapter.js';
import { migrateMemories } from './services/memory-migration-service.js';
import {
  searchMemories,
  searchMemoriesDetailed,
} from './services/memory-retrieval-service.js';
import type {
  MemoryMetadataInput,
  MemorySearchHit,
  MemorySearchExplanation,
} from './contracts/memory-query-contracts.js';
import { L1CacheManager } from './services/l1-cache-manager.js';
import { ReleaseControlService } from './services/release-control-service.js';

export type {
  MemorySearchHit,
  MemorySearchExplanation,
  MemoryDashboardMetrics,
  MemoryReleaseControl,
  MemoryMetadataInput,
  UpdateReleaseControlInput,
};
export { generateEmbedding };

export class MemoryApplicationService {
  private metricsTracker = new MemoryMetricsTracker();
  private l1CacheManager: L1CacheManager;
  private releaseControlService: ReleaseControlService;

  constructor() {
    this.l1CacheManager = new L1CacheManager(this.metricsTracker);
    this.releaseControlService = new ReleaseControlService();
  }

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

  async setWorkingMemory(
    agentFolder: string,
    content: string,
    userJid?: string,
  ): Promise<void> {
    return this.l1CacheManager.setWorkingMemory(agentFolder, content, userJid);
  }

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

  async addMemory(
    agentFolder: string,
    content: string,
    level: 'L1' | 'L2' | 'L3' = 'L1',
    userJid?: string,
    metadata?: MemoryMetadataInput,
  ): Promise<void> {
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

  async migrateMemories(): Promise<number> {
    return migrateMemories(
      this.metricsTracker,
      (agentFolder, userJid) =>
        this.releaseControlService.resolveMigrationRules(agentFolder, userJid),
      (id) => this.l1CacheManager.invalidateCacheById(id),
    );
  }

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

  async listMemories(
    agentFolder: string,
    level?: 'L1' | 'L2' | 'L3',
    userJid?: string,
    options?: MemoryQueryOptions,
  ): Promise<Memory[]> {
    return getMemories(agentFolder, level, userJid, options);
  }

  async deleteMemory(id: string): Promise<void> {
    deleteMemory(id);
    this.l1CacheManager.invalidateCacheById(id);
    logger.info({ id }, 'Memory deleted');
  }

  invalidateCache(agentFolder: string, userJid?: string): void {
    this.l1CacheManager.invalidateCache(agentFolder, userJid);
  }

  invalidateAllCache(): void {
    this.l1CacheManager.invalidateAllCache();
  }
}

export const memoryApplicationService = new MemoryApplicationService();
