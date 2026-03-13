/**
 * BM25Index 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BM25Index,
  reciprocalRankFusion,
  fusedToIds,
} from '../hybrid-search.js';

describe('BM25Index', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
  });

  it('should add and search documents', () => {
    index.addDocument('doc1', 'The quick brown fox jumps over the lazy dog');
    index.addDocument('doc2', 'The lazy cat sleeps all day');
    index.addDocument('doc3', 'The brown bear is dangerous');

    const results = index.search('lazy', 5);
    expect(results.length).toBe(2);
    expect(results).toContain('doc1');
    expect(results).toContain('doc2');
  });

  it('should handle multi-term queries', () => {
    index.addDocument('doc1', 'machine learning and deep learning');
    index.addDocument('doc2', 'natural language processing');
    index.addDocument('doc3', 'machine learning for NLP');

    const results = index.search('machine learning', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toBe('doc1'); // doc1 包含两个词
  });

  it('should return empty results for unknown terms', () => {
    index.addDocument('doc1', 'the cat sat on the mat');

    const results = index.search('xyz123unknown', 5);
    expect(results).toEqual([]);
  });

  it('should respect limit parameter', () => {
    index.addDocument('doc1', 'the cat sat on the mat');
    index.addDocument('doc2', 'the dog ran in the park');
    index.addDocument('doc3', 'the bird flew over the tree');

    const results = index.search('the', 2);
    expect(results.length).toBe(2);
  });

  it('should remove documents', () => {
    index.addDocument('doc1', 'the cat sat on the mat');
    index.addDocument('doc2', 'the dog ran in the park');

    index.removeDocument('doc1');

    const results = index.search('cat', 5);
    expect(results).toEqual([]); // doc1 已删除，不应该匹配
  });

  it('should recalculate average length correctly after removal', () => {
    index.addDocument('doc1', 'alpha alpha alpha alpha alpha alpha');
    index.addDocument('doc2', 'beta');
    index.removeDocument('doc1');

    expect((index as any).docCount).toBe(1);
    expect((index as any).avgDocLength).toBe(1);
  });

  it('should update documents', () => {
    index.addDocument('doc1', 'the cat sat on the mat');
    index.addDocument('doc1', 'the dog ran in the park'); // 更新

    const catResults = index.search('cat', 5);
    const dogResults = index.search('dog', 5);

    expect(catResults).toEqual([]); // 旧内容已删除
    expect(dogResults).toContain('doc1'); // 新内容已添加
  });

  it('should clear all documents', () => {
    index.addDocument('doc1', 'the cat sat on the mat');
    index.addDocument('doc2', 'the dog ran in the park');

    index.clear();

    expect(index.search('cat', 5)).toEqual([]);
  });

  it('should handle text with punctuation', () => {
    index.addDocument('doc1', 'Hello, world! This is a test.');
    index.addDocument('doc2', 'Another test, with different words.');

    const results = index.search('test', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results).toContain('doc1');
  });

  it('should match Chinese terms', () => {
    index.addDocument('doc1', '记忆系统支持中文检索能力');
    index.addDocument('doc2', '这是另一条无关内容');

    const results = index.search('中文检索', 5);
    expect(results).toContain('doc1');
  });
});

describe('reciprocalRankFusion', () => {
  it('should fuse two result lists', () => {
    const bm25Results = ['a', 'b', 'c'];
    const vectorResults = ['b', 'c', 'a'];

    const fused = reciprocalRankFusion(bm25Results, vectorResults);

    expect(fused.length).toBe(3);
    expect(fused[0].id).toBe('b'); // b 在两个列表中排名都很高
  });

  it('should handle empty lists', () => {
    const fused = reciprocalRankFusion([], []);
    expect(fused).toEqual([]);
  });

  it('should handle partial overlap', () => {
    const bm25Results = ['a', 'b', 'c'];
    const vectorResults = ['d', 'e', 'a'];

    const fused = reciprocalRankFusion(bm25Results, vectorResults);

    expect(fused.length).toBe(5);
    expect(fused[0].id).toBe('a'); // a 在两个列表中都出现
  });

  it('should use custom k parameter', () => {
    const bm25Results = ['a', 'b'];
    const vectorResults = ['b', 'a'];

    const fused1 = reciprocalRankFusion(bm25Results, vectorResults, 10);
    const fused2 = reciprocalRankFusion(bm25Results, vectorResults, 100);

    // k 值不同会影响分数，但排名可能相同
    expect(fused1.length).toBe(2);
    expect(fused2.length).toBe(2);
  });
});

describe('fusedToIds', () => {
  it('should convert fused results to IDs', () => {
    const fusedResults = [
      { id: 'a', fusedScore: 0.05 },
      { id: 'b', fusedScore: 0.03 },
    ];

    const ids = fusedToIds(fusedResults, 5);
    expect(ids).toEqual(['a', 'b']);
  });

  it('should respect limit parameter', () => {
    const fusedResults = [
      { id: 'a', fusedScore: 0.05 },
      { id: 'b', fusedScore: 0.03 },
      { id: 'c', fusedScore: 0.02 },
    ];

    const ids = fusedToIds(fusedResults, 2);
    expect(ids).toEqual(['a', 'b']);
  });
});
