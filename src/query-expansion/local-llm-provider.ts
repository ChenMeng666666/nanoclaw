/**
 * 本地 LLM 查询扩展提供者
 * 使用 node-llama-cpp 3.x + GGUF 模型进行查询扩展
 *
 * 注意：这个模块是可选的，不强制依赖 node-llama-cpp
 * 用户可以选择安装 node-llama-cpp 来启用本地 LLM 查询扩展
 */

import type { QueryExpansionProvider } from '../context-engine/query-expansion.js';
import { logger } from '../logger.js';
import fs from 'fs';

/**
 * 本地 LLM 提供者配置
 */
export interface LocalLLMConfig {
  modelPath: string;
  modelType?: 'qwen3' | 'qwen3.5' | 'llama3' | 'other';
  temperature?: number;
  maxTokens?: number;
  numVariants?: number;
}

/**
 * 本地 LLM 查询扩展提供者
 *
 * 使用说明：
 * 1. 首先安装 node-llama-cpp: npm install node-llama-cpp
 * 2. 下载 GGUF 格式的模型（如 Qwen3.5-2B-Q4_K_M.gguf）
 * 3. 初始化并设置到 DefaultContextEngine
 *
 * 示例：
 * ```typescript
 * import { LocalLLMQueryExpansionProvider } from './query-expansion/local-llm-provider.js';
 *
 * const provider = new LocalLLMQueryExpansionProvider({
 *   modelPath: './models/Qwen3.5-2B-Q4_K_M.gguf',
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
  private model: any = null; // 加载的模型
  private context: any = null; // 上下文
  private chatSession: any = null; // 聊天会话
  private isInitialized = false;

  constructor(config: LocalLLMConfig) {
    this.config = {
      numVariants: 3,
      temperature: 0.7,
      maxTokens: 200,
      modelType: 'qwen3.5',
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
      const {
        getLlama,
        LlamaChatSession,
        QwenChatWrapper,
        Llama3ChatWrapper,
        GeneralChatWrapper,
      } = await import('node-llama-cpp');

      logger.info(
        { modelPath: this.config.modelPath, modelType: this.config.modelType },
        'Initializing local LLM provider',
      );

      // 获取 Llama 实例
      this.llama = await getLlama();

      // 加载模型（直接加载，不预先检查文件存在）
      this.model = await this.llama.loadModel({
        modelPath: this.config.modelPath,
      });

      // 创建上下文
      this.context = await this.model.createContext();

      // 创建聊天会话
      this.chatSession = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        chatWrapper:
          this.config.modelType === 'qwen3' ||
          this.config.modelType === 'qwen3.5'
            ? new QwenChatWrapper()
            : this.config.modelType === 'llama3'
              ? new Llama3ChatWrapper()
              : new GeneralChatWrapper(),
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
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          modelPath: this.config.modelPath,
        },
        'Failed to initialize local LLM',
      );
      throw err;
    }
  }

  /**
   * 生成查询变体
   */
  async generateVariants(query: string): Promise<string[]> {
    if (!this.context) {
      // 如果没有初始化，返回空数组（会回退到关键词方法）
      return [];
    }

    try {
      // 使用本地 LLM 生成查询变体
      const prompt = this.buildPrompt(query);

      // 每次都创建新的聊天会话以避免历史增长问题
      const {
        LlamaChatSession,
        QwenChatWrapper,
        Llama3ChatWrapper,
        GeneralChatWrapper,
      } = await import('node-llama-cpp');
      const chatSession = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        chatWrapper:
          this.config.modelType === 'qwen3' ||
          this.config.modelType === 'qwen3.5'
            ? new QwenChatWrapper()
            : this.config.modelType === 'llama3'
              ? new Llama3ChatWrapper()
              : new GeneralChatWrapper(),
      });

      // 发送消息
      const response = await chatSession.prompt(prompt, {
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
   * 辅助方法：清理单个资源
   */
  private async disposeResource(resource: any, name: string): Promise<void> {
    if (!resource) return;
    try {
      await resource.dispose();
    } catch (err) {
      logger.warn({ err }, `Failed to dispose ${name}`);
    }
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    await this.disposeResource(this.context, 'context');
    this.context = null;
    await this.disposeResource(this.model, 'model');
    this.model = null;
    await this.disposeResource(this.llama, 'llama');
    this.llama = null;

    this.isInitialized = false;
    logger.info('Local LLM provider destroyed');
  }

  /**
   * 构建提示词
   */
  private buildPrompt(query: string): string {
    return `You are a query expansion assistant. Your task is to generate ${this.config.numVariants} different query variations for semantic search.

Original query: "${query}"

Generate ${this.config.numVariants} alternative queries that capture the same intent. Focus on:
1. Synonym replacement
2. Phrase rephrasing
3. Adding related concepts
4. Removing redundant words

Return ONLY the queries, one per line, without numbering or extra text.`;
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(response: string): string[] {
    const lines = response
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    return lines.slice(0, this.config.numVariants!);
  }
}
