/**
 * 本地嵌入提供者 - 使用 @xenova/transformers 库
 * 支持本地运行的 Sentence-BERT 模型
 */

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import crypto from 'crypto';

import type { EmbeddingProvider, EmbeddingConfig } from './interface.js';
import { DEFAULT_EMBEDDING_CONFIG } from './interface.js';
import { logger } from '../logger.js';

/**
 * 本地嵌入提供者类
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  private config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG;
  private embedder: FeatureExtractionPipeline | null = null;
  private embeddingCache = new Map<string, number[]>(); // 缓存嵌入结果

  /**
   * 初始化提供者
   */
  async initialize(config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG): Promise<void> {
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
    logger.info({ modelName: this.config.modelName }, 'Initializing local embedding provider');
    this.embedder = await pipeline('feature-extraction', this.config.modelName);
  }

  /**
   * 生成文本嵌入
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.generateCacheKey(text);

    // 检查缓存
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 生成新嵌入
    const result = await this.getEmbedder().then(async (embedder) => {
      const output = await embedder(text, {
        pooling: 'mean',
        normalize: true,
      });
      return Array.from(output.data) as number[];
    });

    // 缓存结果
    this.embeddingCache.set(cacheKey, result);

    return result;
  }

  /**
   * 批量生成嵌入
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      results.push(await this.generateEmbedding(text));
    }

    return results;
  }

  /**
   * 计算相似度
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 获取模型信息
   */
  getModelInfo(): { name: string; dimensions: number; maxTokens: number } {
    // 根据模型名返回信息
    const models: Record<string, { dimensions: number; maxTokens: number }> = {
      'Xenova/all-MiniLM-L6-v2': { dimensions: 384, maxTokens: 256 },
      'Xenova/all-MiniLM-L12-v2': { dimensions: 384, maxTokens: 256 },
      'Xenova/all-mpnet-base-v2': { dimensions: 768, maxTokens: 256 },
    };

    const modelInfo = models[this.config.modelName] || { dimensions: 384, maxTokens: 256 };

    return {
      name: this.config.modelName,
      ...modelInfo,
    };
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    this.embedder = null;
    this.embeddingCache.clear();
    logger.debug('Local embedding provider destroyed');
  }

  /**
   * 内部方法：获取或初始化嵌入模型
   */
  private async getEmbedder(): Promise<FeatureExtractionPipeline> {
    if (!this.embedder) {
      await this.initialize();
    }

    if (!this.embedder) {
      throw new Error('Failed to initialize embedding provider');
    }

    return this.embedder;
  }

  /**
   * 内部方法：生成缓存键
   */
  private generateCacheKey(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }
}
