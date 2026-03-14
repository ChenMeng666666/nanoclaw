import { logger } from '../logger.js';
import { generateEmbedding as generateEmbeddingFromProvider } from '../embedding-providers/registry.js';

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
