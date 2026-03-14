import type { QueryExpansionProvider } from '../../context-engine/query-expansion.js';

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

  generateVariants(_query: string): string[] {
    if (this.variants.length > 0) {
      return this.variants.slice(0, 3);
    }
    return [];
  }
}
