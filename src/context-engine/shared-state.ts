/**
 * ContextEngine 共享状态管理器
 *
 * 用于在多个 ContextEngine 实例之间共享只读配置、嵌入缓存、
 * BM25 索引等状态，减少内存占用和重复计算
 */

import type { CreateEngineOptions } from './default-engine.js';
import { BM25Index } from '../hybrid-search.js';
import { logger } from '../logger.js';

/**
 * 共享 BM25 索引缓存
 * key: agentFolder
 */
const bm25IndexCache = new Map<string, BM25Index>();

/**
 * 共享配置缓存
 * key: configId (全局配置为 'global')
 */
const configCache = new Map<string, CreateEngineOptions>();

/**
 * 统计信息
 */
const stats = {
  bm25CacheHits: 0,
  bm25CacheMisses: 0,
  configCacheHits: 0,
  configCacheMisses: 0,
  memorySaved: 0,
};

/**
 * 共享状态管理器类
 */
export class SharedStateManager {
  private static instance: SharedStateManager;

  private constructor() {
    logger.debug('SharedStateManager initialized');
  }

  static getInstance(): SharedStateManager {
    if (!SharedStateManager.instance) {
      SharedStateManager.instance = new SharedStateManager();
    }
    return SharedStateManager.instance;
  }

  /**
   * 获取或创建 BM25 索引
   * @param agentFolder - Agent 文件夹路径
   * @param initializer - 如果缓存不存在，用于初始化的函数
   */
  getOrCreateBM25Index(
    agentFolder: string,
    initializer: () => BM25Index,
  ): BM25Index {
    if (bm25IndexCache.has(agentFolder)) {
      stats.bm25CacheHits++;
      logger.debug({ agentFolder }, 'BM25 index from shared cache');
      return bm25IndexCache.get(agentFolder)!;
    }

    stats.bm25CacheMisses++;
    const index = initializer();
    bm25IndexCache.set(agentFolder, index);

    logger.debug(
      { agentFolder },
      'BM25 index created and added to shared cache',
    );

    return index;
  }

  /**
   * 清除 BM25 索引缓存
   */
  clearBM25Index(agentFolder?: string): void {
    if (agentFolder) {
      bm25IndexCache.delete(agentFolder);
      logger.debug({ agentFolder }, 'BM25 index cleared from cache');
    } else {
      const count = bm25IndexCache.size;
      bm25IndexCache.clear();
      logger.debug({ count }, 'All BM25 indexes cleared from cache');
    }
  }

  /**
   * 获取或创建共享配置
   * @param configId - 配置 ID
   * @param config - 配置内容
   */
  getOrCreateConfig(
    configId: string,
    config: CreateEngineOptions,
  ): CreateEngineOptions {
    if (configCache.has(configId)) {
      stats.configCacheHits++;
      logger.debug({ configId }, 'Config from shared cache');
      return configCache.get(configId)!;
    }

    stats.configCacheMisses++;
    configCache.set(configId, config);
    logger.debug({ configId }, 'Config added to shared cache');

    return config;
  }

  /**
   * 清除配置缓存
   */
  clearConfig(configId?: string): void {
    if (configId) {
      configCache.delete(configId);
      logger.debug({ configId }, 'Config cleared from cache');
    } else {
      const count = configCache.size;
      configCache.clear();
      logger.debug({ count }, 'All configs cleared from cache');
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...stats };
  }

  /**
   * 记录内存节省
   */
  recordMemorySaved(bytes: number): void {
    stats.memorySaved += bytes;
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    bm25IndexCache.clear();
    configCache.clear();
    logger.debug('All shared state cleared');
  }
}

// 导出单例
export const sharedStateManager = SharedStateManager.getInstance();
