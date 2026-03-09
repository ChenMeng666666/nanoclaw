/**
 * 本地 LLM 查询扩展提供者
 * 使用 node-llama-cpp + GGUF 模型进行查询扩展
 *
 * 注意：这个模块是可选的，不强制依赖 node-llama-cpp
 * 用户可以选择安装 node-llama-cpp 来启用本地 LLM 查询扩展
 */

import type { QueryExpansionProvider } from '../context-engine/default-engine.js';
import { logger } from '../logger.js';

/**
 * 本地 LLM 提供者配置
 */
export interface LocalLLMConfig {
  modelPath: string;
  modelType?: 'qwen3' | 'llama3' | 'other';
  temperature?: number;
  maxTokens?: number;
  numVariants?: number;
}

/**
 * 本地 LLM 查询扩展提供者
 *
 * 使用说明：
 * 1. 首先安装 node-llama-cpp: npm install node-llama-cpp
 * 2. 下载 GGUF 格式的模型（如 Qwen3-1.7B-Instruct-GGUF）
 * 3. 初始化并设置到 DefaultContextEngine
 *
 * 示例：
 * ```typescript
 * import { LocalLLMQueryExpansionProvider } from './query-expansion/local-llm-provider.js';
 *
 * const provider = new LocalLLMQueryExpansionProvider({
 *   modelPath: './models/Qwen3-1.7B-Instruct.Q4_K_M.gguf',
 *   numVariants: 3
 * });
 *
 * await provider.initialize();
 * engine.setQueryExpansionProvider(provider);
 * ```
 */
export class LocalLLMQueryExpansionProvider implements QueryExpansionProvider {
  private config: LocalLLMConfig;
  private llama: any = null; // node-llama-cpp 的实例（延迟加载）
  private isInitialized = false;

  constructor(config: LocalLLMConfig) {
    this.config = {
      numVariants: 3,
      temperature: 0.7,
      maxTokens: 200,
      modelType: 'qwen3',
      ...config,
    };
  }

  /**
   * 初始化提供者
   * 注意：这会尝试加载 node-llama-cpp，如果没有安装会抛出错误
   */
  async initialize(): Promise<void> {
    try {
      // 动态导入 node-llama-cpp，避免非必需依赖
      // @ts-ignore - node-llama-cpp 是可选依赖
      const { Llama } = await import('node-llama-cpp');

      logger.info(
        { modelPath: this.config.modelPath },
        'Initializing local LLM provider',
      );

      this.llama = new Llama({
        modelPath: this.config.modelPath,
        verbose: false,
      });

      this.isInitialized = true;
      logger.info('Local LLM provider initialized successfully');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'node-llama-cpp not installed. ' +
            'Please install it with: npm install node-llama-cpp',
        );
      }
      throw err;
    }
  }

  /**
   * 生成查询变体
   */
  generateVariants(query: string): string[] {
    if (!this.isInitialized || !this.llama) {
      // 如果没有初始化，返回空数组（会回退到关键词方法）
      return [];
    }

    try {
      // 使用本地 LLM 生成查询变体
      const prompt = this.buildPrompt(query);
      const response = this.llama.generate({
        prompt,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      });

      // 解析响应
      return this.parseResponse(response);
    } catch (err) {
      logger.warn({ err, query }, 'Failed to generate LLM query variants');
      return [];
    }
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    if (this.llama) {
      try {
        await this.llama.dispose?.();
      } catch (err) {
        logger.warn({ err }, 'Failed to dispose LLM instance');
      }
      this.llama = null;
      this.isInitialized = false;
    }
  }

  /**
   * 构建提示词
   */
  private buildPrompt(query: string): string {
    const modelType = this.config.modelType || 'qwen3';

    const instructions = `You are a query expansion assistant. Your task is to generate ${this.config.numVariants} different query variations for semantic search.

Original query: "${query}"

Generate ${this.config.numVariants} alternative queries that capture the same intent. Focus on:
1. Synonym replacement
2. Phrase rephrasing
3. Adding related concepts
4. Removing redundant words

Return ONLY the queries, one per line, without numbering or extra text.`;

    if (modelType === 'qwen3') {
      return `<|im_start|>system\n${instructions}<|im_end|>\n<|im_start|>user\n${query}<|im_end|>\n<|im_start|>assistant\n`;
    } else if (modelType === 'llama3') {
      return `<|begin_of_solution|><|start_header_id|>system<|end_header_id|>\n\n${instructions}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${query}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
    }

    // 默认提示词格式
    return `${instructions}\n\nQueries:\n`;
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(response: string): string[] {
    const lines = response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return lines.slice(0, this.config.numVariants!);
  }
}

/**
 * 模拟的本地 LLM 提供者（用于测试，不依赖 node-llama-cpp）
 */
export class MockLLMQueryExpansionProvider implements QueryExpansionProvider {
  private variants: string[] = [];

  /**
   * 添加预设的查询变体（用于测试）
   */
  addVariants(variants: string[]): void {
    this.variants = [...this.variants, ...variants];
  }

  generateVariants(query: string): string[] {
    if (this.variants.length > 0) {
      return this.variants.slice(0, 3);
    }

    // 默认返回空数组（会回退到关键词方法）
    return [];
  }
}
