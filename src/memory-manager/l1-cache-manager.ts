import crypto from 'crypto';
import type { Memory } from '../types.js';
import { logger } from '../logger.js';
import {
  createMemory,
  getMemories,
  updateMemory,
  incrementMemoryAccess,
  getDuplicateMemory,
} from '../db-agents.js';
import { MemoryMetricsTracker } from './metrics.js';
import { generateEmbedding } from './embedding.js';
import { calculateQualityScore } from './ranking-utils.js';

export class L1CacheManager {
  private l1Cache = new Map<string, Memory>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private metricsTracker: MemoryMetricsTracker) {}

  async getWorkingMemory(
    agentFolder: string,
    userJid?: string,
    forceReloadFromDB: boolean = false,
  ): Promise<string> {
    const key = this.makeKey(agentFolder, userJid);

    // If forced reload or cache miss, load from DB
    if (forceReloadFromDB || !this.l1Cache.has(key)) {
      this.metricsTracker.recordCacheResult(false);
      // Load from DB
      const memories = getMemories(agentFolder, 'L1', userJid);
      if (memories.length > 0) {
        const memory = memories[0];
        this.l1Cache.set(key, memory);
        incrementMemoryAccess(memory.id);
        return memory.content;
      }
      // Not in DB, clear cache
      this.l1Cache.delete(key);
      return '';
    }

    const cached = this.l1Cache.get(key)!;
    this.metricsTracker.recordCacheResult(true);
    // Update access count
    incrementMemoryAccess(cached.id);
    return cached.content;
  }

  async setWorkingMemory(
    agentFolder: string,
    content: string,
    userJid?: string,
  ): Promise<void> {
    const key = this.makeKey(agentFolder, userJid);
    const existing = this.l1Cache.get(key);

    if (existing) {
      // Update cache
      existing.content = content;
      existing.updatedAt = new Date().toISOString();
      this.l1Cache.set(key, existing);
      // Update DB immediately
      updateMemory(existing.id, {
        content,
        updatedAt: existing.updatedAt,
      });
    } else {
      // Check for duplicate
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

      // Create new memory
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
        qualityScore: calculateQualityScore(content, {
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

    // Trigger persistence (cleanup)
    this.schedulePersist();
  }

  updateCacheEntry(memory: Memory): void {
    const key = this.makeKey(memory.agentFolder, memory.userJid);
    this.l1Cache.set(key, {
      ...memory,
      accessCount: 0,
      lastAccessedAt: new Date().toISOString(),
    });
  }

  async persistL1Memories(): Promise<void> {
    // L1 cache is already written to DB on create/update
    // Here we clean up idle cache entries
    const now = Date.now();
    const maxIdleTime = 5 * 60 * 1000; // 5 minutes

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

  invalidateCache(agentFolder: string, userJid?: string): void {
    const key = this.makeKey(agentFolder, userJid);
    this.l1Cache.delete(key);
    logger.debug({ agentFolder, userJid }, 'L1 cache invalidated');
  }

  invalidateAllCache(): void {
    this.l1Cache.clear();
    logger.debug('All L1 cache invalidated');
  }

  invalidateCacheById(id: string): void {
    for (const [key, memory] of this.l1Cache.entries()) {
      if (memory.id === id) {
        this.l1Cache.delete(key);
        break;
      }
    }
  }

  private makeKey(agentFolder: string, userJid?: string): string {
    return `${agentFolder}:${userJid || 'global'}`;
  }

  private generateMemoryId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(
      () => this.persistL1Memories(),
      5 * 60 * 1000,
    ); // 5 minutes
  }
}
