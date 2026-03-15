/**
 * 嵌入提供者注册表 - 管理和切换不同的嵌入实现
 */

import {
  type EmbeddingProvider,
  type EmbeddingConfig,
  DEFAULT_EMBEDDING_CONFIG,
} from './interface.js';
import { LocalEmbeddingProvider } from './local-provider.js';

/**
 * 嵌入提供者类型
 */
export enum EmbeddingProviderType {
  LOCAL = 'local',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  COHERE = 'cohere',
  HUGGING_FACE = 'hugging_face',
}

/**
 * 嵌入提供者配置
 */
export interface EmbeddingProviderConfig {
  type: EmbeddingProviderType;
  config: EmbeddingConfig;
}

/**
 * 默认提供者配置
 */
export const DEFAULT_PROVIDER_CONFIG: EmbeddingProviderConfig = {
  type: EmbeddingProviderType.LOCAL,
  config: DEFAULT_EMBEDDING_CONFIG,
};

/**
 * 嵌入提供者工厂
 */
class EmbeddingProviderFactory {
  private providers: Map<EmbeddingProviderType, new () => EmbeddingProvider> =
    new Map();
  private instance: EmbeddingProvider | null = null;
  private currentConfig: EmbeddingProviderConfig = DEFAULT_PROVIDER_CONFIG;

  constructor() {
    // 注册默认提供者
    this.registerProvider(EmbeddingProviderType.LOCAL, LocalEmbeddingProvider);
  }

  /**
   * 注册新的提供者
   */
  registerProvider(
    type: EmbeddingProviderType,
    providerClass: new () => EmbeddingProvider,
  ): void {
    this.providers.set(type, providerClass);
  }

  /**
   * 获取提供者实例
   */
  async getProvider(
    config?: Partial<EmbeddingProviderConfig>,
  ): Promise<EmbeddingProvider> {
    const effectiveConfig: EmbeddingProviderConfig = {
      ...this.currentConfig,
      ...config,
      config: {
        ...this.currentConfig.config,
        ...config?.config,
      },
    };

    // 如果配置没有变化，返回现有实例
    if (
      this.instance &&
      this.isSameConfig(this.currentConfig, effectiveConfig)
    ) {
      return this.instance;
    }

    // 清理旧实例
    if (this.instance) {
      await this.instance.destroy();
    }

    // 创建新实例
    const ProviderClass = this.providers.get(effectiveConfig.type);
    if (!ProviderClass) {
      throw new Error(
        `Unsupported embedding provider type: ${effectiveConfig.type}`,
      );
    }

    this.instance = new ProviderClass();
    await this.instance.initialize(effectiveConfig.config);
    this.currentConfig = effectiveConfig;

    return this.instance;
  }

  /**
   * 检查配置是否相同
   */
  private isSameConfig(
    config1: EmbeddingProviderConfig,
    config2: EmbeddingProviderConfig,
  ): boolean {
    if (config1.type !== config2.type) {
      return false;
    }

    // 比较配置的所有字段
    return JSON.stringify(config1.config) === JSON.stringify(config2.config);
  }
}

// 单例导出
export const embeddingProviderFactory = new EmbeddingProviderFactory();

/**
 * 便捷方法：获取嵌入提供者
 */
export async function getEmbeddingProvider(
  config?: Partial<EmbeddingProviderConfig>,
): Promise<EmbeddingProvider> {
  return embeddingProviderFactory.getProvider(config);
}

/**
 * 便捷方法：生成文本嵌入
 */
export async function generateEmbedding(
  text: string,
  config?: Partial<EmbeddingProviderConfig>,
): Promise<number[]> {
  const provider = await getEmbeddingProvider(config);
  return provider.generateEmbedding(text);
}

/**
 * 便捷方法：批量生成嵌入
 */
export async function generateBatchEmbeddings(
  texts: string[],
  config?: Partial<EmbeddingProviderConfig>,
): Promise<number[][]> {
  const provider = await getEmbeddingProvider(config);
  return provider.generateBatchEmbeddings(texts);
}
