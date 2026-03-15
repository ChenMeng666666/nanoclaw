/**
 * 默认 ContextEngine 实现
 *
 * 实现分层记忆架构：L1 工作记忆 → L2 短期记忆 → L3 长期记忆
 * 支持向量嵌入、BM25 + 向量混合检索、记忆迁移
 */
import type { ContextEngine, Session } from './interface.js';
import type { Context, CompactResult, TurnResult } from './context-types.js';
import type { NewMessage } from '../types/core-runtime.js';
import type { Memory } from '../types/agent-memory.js';
import { logger } from '../logger.js';
import { createMemory, getMemories } from '../db-agents.js';
import { BM25Index } from '../hybrid-search.js';
import { sharedStateManager } from './shared-state.js';
import { generateEmbedding } from './embedding-cache.js';
import {
  splitIntoMemoryChunks,
  calculateImportance,
  calculateTimestampWeight,
  extractTags,
  generateMemoryId,
} from './ingest-pipeline.js';
import { assemble } from './assemble-retrieval.js';
import {
  type QueryExpansionProvider,
  generateKeywordVariants,
} from './query-expansion.js';

/**
 * 默认 ContextEngine 实现
 */
export class DefaultContextEngine implements ContextEngine {
  private agentFolder: string = '';
  private bm25Index!: BM25Index;

  constructor() {
    // 不再在这里初始化 BM25 索引，延迟到 bootstrap 时使用共享状态管理器
  }

  /**
   * 1. bootstrap - 引擎初始化
   */
  async bootstrap(agentFolder: string): Promise<void> {
    this.agentFolder = agentFolder;
    logger.info({ agentFolder }, 'DefaultContextEngine initialized');

    // 使用共享状态管理器获取或创建 BM25 索引
    this.bm25Index = sharedStateManager.getOrCreateBM25Index(
      agentFolder,
      () => {
        const index = new BM25Index();
        // 预加载记忆到 BM25 索引
        const memories = getMemories(agentFolder);
        for (const mem of memories) {
          index.addDocument(mem.id, mem.content);
        }
        logger.debug({ agentFolder }, 'BM25 index initialized');
        return index;
      },
    );
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
    const chunks = splitIntoMemoryChunks(message.content);

    for (const chunk of chunks) {
      const content = `${message.sender_name}: ${chunk.content}`;
      const embedding = await generateEmbedding(content);

      const memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'> = {
        id: generateMemoryId(),
        agentFolder: this.agentFolder,
        userJid: message.sender,
        sessionId: context.sessionId,
        scope: context.sessionId ? 'session' : 'user',
        level: 'L2',
        content,
        embedding,
        importance: calculateImportance(chunk.content, chunk.type),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageType: chunk.type,
        timestampWeight: calculateTimestampWeight(message.timestamp),
        tags: extractTags(chunk.content),
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
        pipelineRoute: 'context_engine',
        pipelineStage: 'ingest',
        agentFolder: this.agentFolder,
        sessionId: context.sessionId,
        userJid: message.sender,
        chunkCount: chunks.length,
      },
      'Memory ingested',
    );

    return memoriesToStore;
  }

  /**
   * 3. assemble - 构建上下文（混合检索核心）
   */
  async assemble(
    chatJid: string,
    limit: number,
    sessionId?: string,
  ): Promise<Context> {
    return assemble(
      chatJid,
      limit,
      sessionId,
      this.agentFolder,
      this.bm25Index,
      this.queryExpansionProvider,
    );
  }

  /**
   * 4. compact - 压缩会话
   */
  async compact(session: Session): Promise<CompactResult> {
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
  // Note: This method is now effectively a proxy to the helper, used by KeywordQueryExpansionProvider
  // or potentially internal use if any. But assemble now uses the helper directly.
  // However, KeywordQueryExpansionProvider in query-expansion.ts calls generateKeywordVariants directly.
  // So this method might be redundant if not part of interface.
  // It is used by KeywordQueryExpansionProvider in the OLD code, but in new code KeywordQueryExpansionProvider is in query-expansion.ts and uses local helper.
  // So we can remove this if no external caller uses it.
  // Wait, `KeywordQueryExpansionProvider` was taking `defaultEngine` in constructor.
  // Now it's standalone.
  // So we can remove `generateQueryVariants` and `generateKeywordVariants` from this class.

  // But for compatibility, let's keep generateKeywordVariants if it was public?
  // It was public.
  public generateKeywordVariants(text: string): string[] {
    return generateKeywordVariants(text);
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
 * 工厂函数：创建默认 ContextEngine 实例
 */
export async function createDefaultContextEngine(
  agentFolder: string,
): Promise<DefaultContextEngine> {
  const engine = new DefaultContextEngine();
  await engine.bootstrap(agentFolder);
  return engine;
}
