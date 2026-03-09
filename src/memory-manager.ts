/**
 * 记忆管理系统
 * 实现分层记忆架构：L1 工作记忆 → L2 短期记忆 → L3 长期记忆
 * 支持向量嵌入、语义检索、记忆迁移
 */
import crypto from 'crypto';

import {
  createMemory,
  getMemories,
  updateMemory,
  incrementMemoryAccess,
  deleteMemory,
} from './db-agents.js';
import { Memory } from './types.js';
import { logger } from './logger.js';
import { generateEmbedding as generateEmbeddingFromProvider } from './embedding-providers/registry.js';

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
   */
  async getWorkingMemory(
    agentFolder: string,
    userJid?: string,
  ): Promise<string> {
    const key = this.makeKey(agentFolder, userJid);
    const cached = this.l1Cache.get(key);

    if (cached) {
      // 更新访问计数
      incrementMemoryAccess(cached.id);
      return cached.content;
    }

    // 从数据库加载
    const memories = getMemories(agentFolder, 'L1', userJid);
    if (memories.length > 0) {
      const memory = memories[0];
      this.l1Cache.set(key, memory);
      incrementMemoryAccess(memory.id);
      return memory.content;
    }

    return '';
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
    } else {
      // 创建新记忆
      const embedding = await generateEmbedding(content);
      const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
        id: this.generateMemoryId(),
        agentFolder,
        userJid,
        level: 'L1',
        content,
        embedding,
        importance: 0.5,
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
  ): Promise<void> {
    const embedding = await generateEmbedding(content);
    const importance = this.calculateImportance(content, level);

    const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
      id: this.generateMemoryId(),
      agentFolder,
      userJid,
      level,
      content,
      embedding,
      importance,
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
  async migrateMemories(): Promise<void> {
    const allMemories = [
      ...getMemories('', 'L1'),
      ...getMemories('', 'L2'),
      ...getMemories('', 'L3'),
    ];

    for (const memory of allMemories) {
      const migration = this.shouldMigrateMemory(memory);
      if (migration.should) {
        await this.migrateMemory(memory, migration.targetLevel!);
      }
    }
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

  /**
   * 语义检索记忆
   * 使用向量相似度搜索相关记忆
   */
  async searchMemories(
    agentFolder: string,
    query: string,
    limit: number = 10,
    userJid?: string,
  ): Promise<Memory[]> {
    const queryEmbedding = await generateEmbedding(query);
    const memories = getMemories(agentFolder, undefined, userJid);

    // 计算余弦相似度
    const scored = memories
      .filter((m) => m.embedding && m.embedding.length > 0)
      .map((memory) => ({
        memory,
        score: this.cosineSimilarity(queryEmbedding, memory.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => s.memory);
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
    const adjustedImportance = memory.importance * decayFactor;

    // L1 -> L2: 访问 3 次后且 7 天未访问
    if (memory.level === 'L1') {
      if (memory.accessCount >= 3 && daysSinceAccess > 7) {
        return { should: true, targetLevel: 'L2' };
      }
    }

    // L2 -> L3: 30 天未访问或重要性 > 0.8
    if (memory.level === 'L2') {
      if (daysSinceAccess > 30 || adjustedImportance > 0.8) {
        return { should: true, targetLevel: 'L3' };
      }
    }

    return { should: false };
  }

  private async migrateMemory(
    memory: Memory,
    targetLevel: 'L2' | 'L3',
  ): Promise<void> {
    updateMemory(memory.id, {
      content: `[Migrated to ${targetLevel}] ${memory.content}`,
      importance: targetLevel === 'L2' ? 0.7 : 0.9,
    });
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
}

// 单例导出
export const memoryManager = new MemoryManager();
