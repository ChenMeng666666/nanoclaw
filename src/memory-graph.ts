/**
 * 记忆关系网络
 * 记录记忆之间的关联关系，支持查询相关记忆链
 */

import { Memory } from './types.js';

/**
 * 记忆关联类型
 */
export enum MemoryRelationType {
  REFERENCE = 'reference', // 引用关系
  SIMILAR = 'similar', // 相似关系
  PREDECESSOR = 'predecessor', // 前置关系
  SUCCESSOR = 'successor', // 后继关系
  PART_OF = 'part_of', // 部分关系
  CONTEXT = 'context', // 上下文关系
}

/**
 * 记忆关联
 */
export interface MemoryRelation {
  id: string;
  fromMemoryId: string;
  toMemoryId: string;
  type: MemoryRelationType;
  strength: number; // 关联强度 (0-1)
  createdAt: string;
  updatedAt: string;
}

/**
 * 记忆关系网络类
 */
export class MemoryGraph {
  private relations: Map<string, MemoryRelation[]> = new Map(); // memoryId -> relations
  private allRelations: Map<string, MemoryRelation> = new Map(); // id -> relation

  /**
   * 添加关联
   */
  addRelation(
    fromId: string,
    toId: string,
    type: MemoryRelationType,
    strength: number = 0.5,
  ): MemoryRelation {
    const id = this.generateRelationId(fromId, toId, type);

    const relation: MemoryRelation = {
      id,
      fromMemoryId: fromId,
      toMemoryId: toId,
      type,
      strength: Math.min(Math.max(strength, 0), 1),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 添加到双向索引
    if (!this.relations.has(fromId)) {
      this.relations.set(fromId, []);
    }
    this.relations.get(fromId)!.push(relation);

    if (!this.relations.has(toId)) {
      this.relations.set(toId, []);
    }
    // 对于非引用类型，添加反向关系
    if (type !== MemoryRelationType.REFERENCE) {
      const reverseRelation: MemoryRelation = {
        ...relation,
        id: this.generateRelationId(toId, fromId, this.getReverseType(type)),
        fromMemoryId: toId,
        toMemoryId: fromId,
        type: this.getReverseType(type),
      };
      this.relations.get(toId)!.push(reverseRelation);
      this.allRelations.set(reverseRelation.id, reverseRelation);
    } else {
      this.relations.get(toId)!.push(relation);
    }

    this.allRelations.set(id, relation);

    return relation;
  }

  /**
   * 获取记忆的所有关联
   */
  getRelations(memoryId: string): MemoryRelation[] {
    return this.relations.get(memoryId) || [];
  }

  /**
   * 根据类型获取记忆的关联
   */
  getRelationsByType(
    memoryId: string,
    type: MemoryRelationType,
  ): MemoryRelation[] {
    return this.getRelations(memoryId).filter((r) => r.type === type);
  }

  /**
   * 获取记忆的相关记忆链
   */
  getRelatedMemoryChain(
    memoryId: string,
    maxDepth: number = 3,
    types?: MemoryRelationType[],
  ): MemoryRelation[] {
    const chain: MemoryRelation[] = [];
    const visited = new Set<string>();
    this.traverseRelations(memoryId, 0, maxDepth, types, chain, visited);
    return chain;
  }

  /**
   * 根据内容相似度自动创建关联
   */
  async createSimilarityRelations(
    memories: Memory[],
    minSimilarity: number = 0.7,
  ): Promise<void> {
    // 简单实现：比较所有记忆对的向量相似度
    for (let i = 0; i < memories.length; i++) {
      const m1 = memories[i];
      if (!m1.embedding) continue;

      for (let j = i + 1; j < memories.length; j++) {
        const m2 = memories[j];
        if (!m2.embedding) continue;

        const similarity = this.cosineSimilarity(m1.embedding, m2.embedding);
        if (similarity >= minSimilarity) {
          this.addRelation(
            m1.id,
            m2.id,
            MemoryRelationType.SIMILAR,
            similarity,
          );
        }
      }
    }
  }

  /**
   * 删除关联
   */
  removeRelation(id: string): void {
    const relation = this.allRelations.get(id);
    if (!relation) return;

    // 从双向索引中删除
    const fromRelations = this.relations.get(relation.fromMemoryId);
    if (fromRelations) {
      const index = fromRelations.findIndex((r) => r.id === id);
      if (index !== -1) {
        fromRelations.splice(index, 1);
      }
    }

    const toRelations = this.relations.get(relation.toMemoryId);
    if (toRelations) {
      const index = toRelations.findIndex((r) => r.id === id);
      if (index !== -1) {
        toRelations.splice(index, 1);
      }
    }

    this.allRelations.delete(id);
  }

  /**
   * 删除记忆的所有关联
   */
  removeRelationsForMemory(memoryId: string): void {
    const relations = this.getRelations(memoryId);
    for (const relation of relations) {
      this.removeRelation(relation.id);
    }
  }

  /**
   * 清空网络
   */
  clear(): void {
    this.relations.clear();
    this.allRelations.clear();
  }

  // ===== 私有方法 =====

  private generateRelationId(
    fromId: string,
    toId: string,
    type: MemoryRelationType,
  ): string {
    return `${fromId}-${toId}-${type}-${Date.now()}`;
  }

  private getReverseType(type: MemoryRelationType): MemoryRelationType {
    switch (type) {
      case MemoryRelationType.PREDECESSOR:
        return MemoryRelationType.SUCCESSOR;
      case MemoryRelationType.SUCCESSOR:
        return MemoryRelationType.PREDECESSOR;
      case MemoryRelationType.PART_OF:
        return MemoryRelationType.PART_OF; // 部分关系是双向的
      default:
        return type;
    }
  }

  private traverseRelations(
    memoryId: string,
    currentDepth: number,
    maxDepth: number,
    types: MemoryRelationType[] | undefined,
    chain: MemoryRelation[],
    visited: Set<string>,
  ): void {
    if (currentDepth >= maxDepth || visited.has(memoryId)) {
      return;
    }

    visited.add(memoryId);

    const relations = this.getRelations(memoryId);
    for (const relation of relations) {
      if (!types || types.includes(relation.type)) {
        chain.push(relation);
        this.traverseRelations(
          relation.toMemoryId,
          currentDepth + 1,
          maxDepth,
          types,
          chain,
          visited,
        );
      }
    }
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
}

// 单例导出
export const memoryGraph = new MemoryGraph();
