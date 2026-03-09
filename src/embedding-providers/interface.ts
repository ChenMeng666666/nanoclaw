/**
 * 嵌入提供者接口 - 抽象嵌入生成逻辑
 * 支持 OpenAI、Anthropic、本地模型等多种实现
 */

import { Memory } from '../types.js';

/**
 * 嵌入模型配置
 */
export interface EmbeddingConfig {
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  dimensions?: number;
}

/**
 * 嵌入提供者接口
 */
export interface EmbeddingProvider {
  /**
   * 初始化提供者
   */
  initialize(config: EmbeddingConfig): Promise<void>;

  /**
   * 生成文本嵌入
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * 批量生成嵌入
   */
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * 计算相似度
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number;

  /**
   * 获取模型信息
   */
  getModelInfo(): { name: string; dimensions: number; maxTokens: number };

  /**
   * 清理资源
   */
  destroy(): Promise<void>;
}

/**
 * 默认嵌入配置
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  modelName: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
};
