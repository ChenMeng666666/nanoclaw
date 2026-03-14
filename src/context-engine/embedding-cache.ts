import crypto from 'crypto';
import { logger } from '../logger.js';
import { generateEmbedding as generateEmbeddingFromProvider } from '../embedding-providers/registry.js';

// 嵌入缓存（避免重复计算）
const embeddingCache = new Map<
  string,
  {
    embedding: number[];
    timestamp: number;
    usageCount: number;
  }
>();

// 缓存配置
const EMBEDDING_CACHE_MAX_SIZE = 1000; // 最大缓存条目数
const EMBEDDING_CACHE_TTL = 24 * 60 * 60 * 1000; // 缓存过期时间（24小时）

/**
 * 生成文本的向量嵌入
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cacheKey = crypto.createHash('md5').update(text).digest('hex');

  // 检查缓存是否有效
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    const now = Date.now();
    if (now - cached.timestamp < EMBEDDING_CACHE_TTL) {
      // 更新使用计数
      embeddingCache.set(cacheKey, {
        ...cached,
        usageCount: cached.usageCount + 1,
      });
      return cached.embedding;
    } else {
      // 过期的缓存条目
      embeddingCache.delete(cacheKey);
    }
  }

  try {
    const embedding = await generateEmbeddingFromProvider(text);

    // 检查是否需要清理缓存
    if (embeddingCache.size >= EMBEDDING_CACHE_MAX_SIZE) {
      evictOldestCacheEntries();
    }

    // 存储到缓存
    embeddingCache.set(cacheKey, {
      embedding,
      timestamp: Date.now(),
      usageCount: 1,
    });

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
 * 清除最旧的缓存条目
 */
function evictOldestCacheEntries(): void {
  const entries = Array.from(embeddingCache.entries());
  // 按使用计数和时间戳排序：使用次数少且时间旧的先删除
  entries.sort((a, b) => {
    if (a[1].usageCount !== b[1].usageCount) {
      return a[1].usageCount - b[1].usageCount;
    }
    return a[1].timestamp - b[1].timestamp;
  });

  // 删除最旧的 10% 条目
  const numToEvict = Math.ceil(entries.length * 0.1);
  for (let i = 0; i < numToEvict; i++) {
    embeddingCache.delete(entries[i][0]);
  }

  logger.debug(
    { evicted: numToEvict, remaining: embeddingCache.size },
    'Embedding cache evicted old entries',
  );
}
