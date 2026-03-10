/**
 * 默认 ContextEngine 实现
 *
 * 实现分层记忆架构：L1 工作记忆 → L2 短期记忆 → L3 长期记忆
 * 支持向量嵌入、BM25 + 向量混合检索、记忆迁移
 */
import crypto from 'crypto';

import type { ContextEngine } from './interface.js';
import type { Context, CompactResult, TurnResult } from './types.js';
import { NewMessage, Memory } from '../types.js';
import { logger } from '../logger.js';
import {
  createMemory,
  getMemories,
  updateMemory,
  incrementMemoryAccess,
  deleteMemory,
  getUserMemories,
} from '../db-agents.js';
import {
  BM25Index,
  reciprocalRankFusion,
  fusedToIds,
} from '../hybrid-search.js';
import { generateEmbedding as generateEmbeddingFromProvider } from '../embedding-providers/registry.js';

// 嵌入缓存（避免重复计算）
const embeddingCache = new Map<string, number[]>();

/**
 * 生成文本的向量嵌入
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const cacheKey = crypto.createHash('md5').update(text).digest('hex');
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  try {
    const embedding = await generateEmbeddingFromProvider(text);
    embeddingCache.set(cacheKey, embedding);
    return embedding;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to generate embedding',
    );
    return [];
  }
}

/**
 * 默认 ContextEngine 实现
 */
export class DefaultContextEngine implements ContextEngine {
  private agentFolder: string = '';
  private bm25Index: BM25Index;
  private l1Cache = new Map<string, Memory>();

  constructor() {
    this.bm25Index = new BM25Index();
  }

  /**
   * 1. bootstrap - 引擎初始化
   */
  async bootstrap(agentFolder: string): Promise<void> {
    this.agentFolder = agentFolder;
    logger.info({ agentFolder }, 'DefaultContextEngine initialized');

    // 预加载记忆到 BM25 索引
    const memories = getMemories(agentFolder);
    for (const mem of memories) {
      this.bm25Index.addDocument(mem.id, mem.content);
    }
  }

  /**
   * 2. ingest - 新消息处理
   * 优化记忆分块逻辑：考虑对话结构，保护代码块和长文本片段的完整性
   */
  async ingest(message: NewMessage, context: Context): Promise<Memory[]> {
    const memoriesToStore: Memory[] = [];

    // 跳过系统消息和 bot 消息
    if (message.is_from_me || message.is_bot_message) {
      return memoriesToStore;
    }

    // 智能分块策略
    const chunks = this.splitIntoMemoryChunks(message.content);

    for (const chunk of chunks) {
      const content = `${message.sender_name}: ${chunk.content}`;
      const embedding = await generateEmbedding(content);

      const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
        id: this.generateMemoryId(),
        agentFolder: this.agentFolder,
        userJid: message.sender,
        level: 'L2',
        content,
        embedding,
        importance: this.calculateImportance(chunk.content, chunk.type),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageType: chunk.type,
        timestampWeight: this.calculateTimestampWeight(),
        sessionId: context.sessionId,
        tags: this.extractTags(chunk.content),
        sourceType: 'direct',
      };

      createMemory(memory);
      memoriesToStore.push({
        ...memory,
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
      });

      // 更新 BM25 索引
      this.bm25Index.addDocument(memory.id, content);
    }

    logger.info(
      {
        agentFolder: this.agentFolder,
        userJid: message.sender,
        chunkCount: chunks.length,
      },
      'Memory ingested',
    );

    return memoriesToStore;
  }

  /**
   * 智能分块策略
   * 保护代码块、引用内容和长文本片段的完整性
   */
  private splitIntoMemoryChunks(
    content: string,
  ): Array<{ content: string; type: 'user' | 'code' | 'document' }> {
    const chunks: Array<{
      content: string;
      type: 'user' | 'code' | 'document';
    }> = [];

    // 1. 提取代码块（```代码块```）
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks: Array<{ content: string; start: number; end: number }> =
      [];
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeBlocks.push({
        content: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // 2. 处理非代码块部分
    let lastEnd = 0;
    for (const codeBlock of codeBlocks) {
      // 处理代码块前的文本
      if (codeBlock.start > lastEnd) {
        const textBefore = content.slice(lastEnd, codeBlock.start).trim();
        if (textBefore) {
          // 按句子或段落分割普通文本
          const textChunks = this.splitTextIntoChunks(textBefore);
          for (const chunk of textChunks) {
            chunks.push({ content: chunk, type: 'user' });
          }
        }
      }
      // 添加代码块
      chunks.push({ content: codeBlock.content, type: 'code' });
      lastEnd = codeBlock.end;
    }

    // 3. 处理最后一个代码块后的文本
    if (lastEnd < content.length) {
      const textAfter = content.slice(lastEnd).trim();
      if (textAfter) {
        const textChunks = this.splitTextIntoChunks(textAfter);
        for (const chunk of textChunks) {
          chunks.push({ content: chunk, type: 'user' });
        }
      }
    }

    // 4. 如果没有代码块，直接处理整个文本
    if (chunks.length === 0) {
      const textChunks = this.splitTextIntoChunks(content);
      for (const chunk of textChunks) {
        chunks.push({ content: chunk, type: 'user' });
      }
    }

    return chunks;
  }

  /**
   * 文本分块（非代码块）
   * 按句子、段落或长度分割，确保语义完整性
   */
  private splitTextIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const maxChunkSize = 300; // 最大块大小（字符）
    const sentences = text.split(/(?<=[。！？.!?])\s*/);

    let currentChunk = '';
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if (currentChunk.length + trimmed.length <= maxChunkSize) {
        currentChunk += (currentChunk ? ' ' : '') + trimmed;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        // 如果句子过长，强制分割
        if (trimmed.length > maxChunkSize) {
          const parts = this.splitLongSentence(trimmed, maxChunkSize);
          chunks.push(...parts);
        } else {
          currentChunk = trimmed;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * 分割过长的句子
   */
  private splitLongSentence(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + maxSize;
      if (end >= text.length) {
        chunks.push(text.slice(start));
        break;
      }

      // 寻找合适的分割点
      const splitPoints = [
        text.lastIndexOf('，', end),
        text.lastIndexOf('。', end),
        text.lastIndexOf('！', end),
        text.lastIndexOf('？', end),
        text.lastIndexOf('.', end),
        text.lastIndexOf('!', end),
        text.lastIndexOf('?', end),
        text.lastIndexOf(' ', end),
      ].filter((pos) => pos > start);

      if (splitPoints.length > 0) {
        end = Math.max(...splitPoints) + 1;
      } else {
        end = start + maxSize;
      }

      chunks.push(text.slice(start, end).trim());
      start = end;
    }

    return chunks;
  }

  /**
   * 基于内容类型计算重要性
   */
  private calculateImportance(content: string, type: string): number {
    let baseImportance = 0.6; // 默认 L2 记忆重要性

    // 代码块通常更重要
    if (type === 'code') {
      baseImportance = 0.85;
    }

    // 包含链接、引用或特定关键词的内容更重要
    const importantPatterns = [
      /https?:\/\/[^\s]+/g, // 链接
      /@[^\s]+/g, // 提及
      /#[\w]+/g, // 标签
      /(?:重要|关键|核心|注意|警告|紧急)/g, // 重要性关键词
    ];

    for (const pattern of importantPatterns) {
      if (pattern.test(content)) {
        baseImportance += 0.1;
        break;
      }
    }

    // 内容长度因子
    const lengthFactor = Math.min(content.length / 1000, 1) * 0.1;
    return Math.min(baseImportance + lengthFactor, 1.0);
  }

  /**
   * 计算时间戳权重（用于排序）
   * 越新的消息权重越高
   */
  private calculateTimestampWeight(): number {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    const dayInMs = 24 * hourInMs;

    // 权重随时间衰减：最近1小时 = 1.0，最近24小时 = 0.8，1周 = 0.5，更早 = 0.3
    const timePassed = now - new Date().getTime(); // 这里应该使用消息时间戳，暂时用当前时间
    if (timePassed < hourInMs) {
      return 1.0;
    } else if (timePassed < dayInMs) {
      return 0.8;
    } else if (timePassed < 7 * dayInMs) {
      return 0.5;
    } else {
      return 0.3;
    }
  }

  /**
   * 从内容中提取标签
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];

    // 提取 #标签
    const hashtagRegex = /#([\w\u4e00-\u9fff]+)/g;
    let match;
    while ((match = hashtagRegex.exec(content)) !== null) {
      tags.push(match[1]);
    }

    // 提取 @提及
    const mentionRegex = /@([^\s]+)/g;
    while ((match = mentionRegex.exec(content)) !== null) {
      tags.push(match[1]);
    }

    // 基于内容类型添加标签
    if (content.includes('```')) {
      tags.push('code');
    }
    if (/https?:\/\/[^\s]+/.test(content)) {
      tags.push('link');
    }

    return [...new Set(tags)]; // 去重
  }

  /**
   * 3. assemble - 构建上下文（混合检索核心）
   */
  async assemble(chatJid: string, limit: number): Promise<Context> {
    // 获取最近消息
    const messages = this.getRecentMessages(chatJid, limit);
    const userJid = messages[0]?.sender;

    // 构建查询文本
    const recentContent = messages.map((m) => m.content).join(' ');

    // 查询扩展：生成多个查询变体
    const queryVariants = await this.generateQueryVariants(recentContent);

    // 对每个查询变体执行搜索，然后合并结果
    const allBm25Results: string[] = [];
    const allVectorResults: string[] = [];

    for (const query of queryVariants) {
      // BM25 搜索
      const bm25Results = this.bm25Index.search(query, limit * 2);
      allBm25Results.push(...bm25Results);

      // 向量搜索
      const vectorResults = await this.vectorSearch(
        this.agentFolder,
        query,
        limit * 2,
      );
      allVectorResults.push(...vectorResults);
    }

    // 去重
    const uniqueBm25Results = [...new Set(allBm25Results)];
    const uniqueVectorResults = [...new Set(allVectorResults)];

    // RRF 融合
    const fusedResults = reciprocalRankFusion(
      uniqueBm25Results,
      uniqueVectorResults,
    );
    const memoryIds = this.reRankResults(fusedResults, recentContent, limit);

    // 从数据库加载记忆
    const memories = this.getMemoriesByIds(memoryIds);

    return {
      agentFolder: this.agentFolder,
      userJid,
      messages,
      memories,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 4. compact - 压缩会话
   */
  async compact(session: any): Promise<CompactResult> {
    // 使用简单策略：保留高重要性记忆
    const preservedMemories = (session.memories || [])
      .filter((m: Memory) => m.importance > 0.7)
      .slice(0, 10);

    const summary = `[会话摘要：保留了 ${preservedMemories.length} 条重要记忆}]`;

    return {
      summary,
      preservedMemories,
      discardedCount:
        (session.memories || []).length - preservedMemories.length,
    };
  }

  /**
   * 5. afterTurn - 对话后处理
   */
  async afterTurn(result: TurnResult): Promise<void> {
    // 存储新记忆（如果有）
    if (result.newMemories) {
      for (const memory of result.newMemories) {
        createMemory(memory);
        this.bm25Index.addDocument(memory.id, memory.content);
      }
      logger.info(
        { count: result.newMemories.length },
        'New memories stored after turn',
      );
    }
  }

  /**
   * 查询扩展提供者接口
   */
  private queryExpansionProvider: QueryExpansionProvider | null = null;

  /**
   * 生成查询变体
   * 如果有 LLM 提供者，优先使用 LLM；否则使用基于关键词的方法
   */
  private async generateQueryVariants(text: string): Promise<string[]> {
    // 如果有 LLM 提供者，优先使用 LLM
    if (this.queryExpansionProvider) {
      try {
        const llmVariants = this.queryExpansionProvider.generateVariants(text);
        const resolvedVariants =
          llmVariants instanceof Promise ? await llmVariants : llmVariants;

        if (resolvedVariants && resolvedVariants.length > 0) {
          return [text, ...resolvedVariants].slice(0, 5);
        }
      } catch (err) {
        logger.warn(
          { err },
          'LLM query expansion failed, falling back to keyword method',
        );
      }
    }

    // 回退到基于关键词的方法
    return this.generateKeywordVariants(text);
  }

  /**
   * 基于关键词的查询扩展（回退方案）
   */
  public generateKeywordVariants(text: string): string[] {
    const variants: string[] = [text]; // 原始查询

    // 1. 关键词提取和重组
    const keywords = this.extractKeywords(text);
    if (keywords.length > 1) {
      // 生成不同长度的关键词组合
      for (let i = Math.max(1, keywords.length - 1); i < keywords.length; i++) {
        const combo = keywords.slice(0, i + 1).join(' ');
        if (combo.length > 10 && !variants.includes(combo)) {
          variants.push(combo);
        }
      }
    }

    // 2. 简化查询
    const simplified = this.simplifyQuery(text);
    if (
      simplified &&
      simplified.length > 10 &&
      simplified !== text &&
      !variants.includes(simplified)
    ) {
      variants.push(simplified);
    }

    // 3. 同义词替换（简单的同义词词典）
    const synonyms = this.replaceSynonyms(text);
    if (synonyms !== text && !variants.includes(synonyms)) {
      variants.push(synonyms);
    }

    // 限制变体数量
    return variants.slice(0, 5);
  }

  /**
   * 提取关键词
   */
  public extractKeywords(text: string): string[] {
    // 简单的关键词提取：去除停用词，保留有意义的词
    const stopWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'that',
      'this',
      'is',
      'are',
      'was',
      'were',
      'it',
      'he',
      'she',
      'they',
      'we',
      'you',
      'me',
      'him',
      'her',
      'us',
      'them',
      'on',
      'in',
      'at',
      'by',
      'to',
      'from',
      'of',
      'about',
      'like',
      'as',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // 保留中文和英文单词
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word))
      .slice(0, 8); // 限制关键词数量
  }

  /**
   * 简化查询
   */
  public simplifyQuery(text: string): string {
    // 简单的查询简化：去除冗余短语，保留核心内容
    const redundantPatterns = [
      /\b(i|you|we|they|he|she|it)\s+(think|believe|know|want|need)\s+that\b/gi,
      /\b(in my opinion|in my view|i think|i believe)\b/gi,
      /\b(please|thank you|thanks|could you|would you|can you)\b/gi,
    ];

    let simplified = text;
    for (const pattern of redundantPatterns) {
      simplified = simplified.replace(pattern, '');
    }

    return simplified.trim().replace(/\s+/g, ' ');
  }

  /**
   * 同义词替换
   */
  public replaceSynonyms(text: string): string {
    // 简单的同义词词典
    const synonyms: Record<string, string[]> = {
      问题: ['疑问', '难题', '困难'],
      方法: ['方式', '办法', '途径'],
      使用: ['应用', '利用', '采用'],
      了解: ['知道', '明白', '理解'],
      学习: ['研究', '了解', '掌握'],
      功能: ['特性', '作用', '用途'],
      系统: ['体系', '平台', '架构'],
      数据: ['信息', '资料', '内容'],
      代码: ['程序', '脚本', '代码'],
    };

    let result = text;
    for (const [word, synList] of Object.entries(synonyms)) {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      // 随机选择一个同义词替换
      const replacement = synList[Math.floor(Math.random() * synList.length)];
      result = result.replace(regex, replacement);
    }

    return result;
  }

  /**
   * 结果重排序
   * 基于内容相关性对 RRF 结果进行二次排序
   */
  private reRankResults(
    results: any[],
    query: string,
    limit: number,
  ): string[] {
    // 获取所有记忆内容
    const allMemories = getMemories(this.agentFolder);
    const memoryMap = new Map<string, string>();
    for (const memory of allMemories) {
      memoryMap.set(memory.id, memory.content);
    }

    // 对结果进行二次排序：结合 RRF 分数和内容相似度
    const scoredResults = results.map((result) => {
      const memoryContent = memoryMap.get(result.id);
      if (!memoryContent) {
        return { ...result, finalScore: result.fusedScore };
      }

      // 计算内容相似度（简单的词重叠分数）
      const queryWords = new Set(query.toLowerCase().split(/\s+/));
      const contentWords = new Set(memoryContent.toLowerCase().split(/\s+/));
      const overlap = [...queryWords].filter((word) =>
        contentWords.has(word),
      ).length;
      const overlapScore =
        overlap / Math.sqrt(queryWords.size * contentWords.size);

      // 结合分数
      const finalScore = result.fusedScore * (0.7 + 0.3 * overlapScore);

      return { ...result, finalScore };
    });

    // 按最终分数排序并返回前 N 个
    return scoredResults
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit)
      .map((result) => result.id);
  }

  // ===== 私有方法 =====

  private generateMemoryId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private getRecentMessages(chatJid: string, limit: number): NewMessage[] {
    // 从上下文或数据库获取最近消息
    // 这里简化实现，实际应该从 db.ts 获取
    return [];
  }

  private async vectorSearch(
    agentFolder: string,
    query: string,
    limit: number,
  ): Promise<string[]> {
    const queryEmbedding = await generateEmbedding(query);
    const memories = getMemories(agentFolder);

    const scored = memories
      .filter((m) => m.embedding && m.embedding.length > 0)
      .map((memory) => ({
        id: memory.id,
        score: this.cosineSimilarity(queryEmbedding, memory.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => s.id);
  }

  private getMemoriesByIds(ids: string[]): Memory[] {
    const allMemories = getMemories(this.agentFolder);
    const idSet = new Set(ids);
    return allMemories.filter((m) => idSet.has(m.id));
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

  /**
   * 设置查询扩展提供者
   */
  setQueryExpansionProvider(provider: QueryExpansionProvider | null): void {
    this.queryExpansionProvider = provider;
    if (provider) {
      logger.info('Query expansion provider set');
    }
  }
}

/**
 * 查询扩展提供者接口
 * 允许不同的查询扩展实现（关键词、本地 LLM、远程 API 等）
 */
export interface QueryExpansionProvider {
  /**
   * 生成查询变体
   * @param query 原始查询
   * @returns 查询变体数组（同步或异步）
   */
  generateVariants(query: string): string[] | Promise<string[]>;

  /**
   * 初始化提供者
   */
  initialize?(): Promise<void>;

  /**
   * 清理资源
   */
  destroy?(): Promise<void>;
}

/**
 * 关键词查询扩展提供者（默认实现）
 */
export class KeywordQueryExpansionProvider implements QueryExpansionProvider {
  constructor(private defaultEngine: DefaultContextEngine) {}

  generateVariants(query: string): string[] {
    return this.defaultEngine.generateKeywordVariants(query);
  }
}

/**
 * 工厂函数配置选项
 */
export interface CreateEngineOptions {
  queryExpansionProvider?: QueryExpansionProvider;
}

import { contextEngineRegistry } from './registry.js';

/**
 * 工厂函数：创建默认 ContextEngine 实例
 */
export async function createDefaultContextEngine(
  agentFolder: string,
  options?: CreateEngineOptions,
): Promise<DefaultContextEngine> {
  const engine = new DefaultContextEngine();
  await engine.bootstrap(agentFolder);

  if (options?.queryExpansionProvider) {
    engine.setQueryExpansionProvider(options.queryExpansionProvider);
  }

  return engine;
}

// 自动注册默认引擎
contextEngineRegistry.register('default', createDefaultContextEngine);
