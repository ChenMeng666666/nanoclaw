/**
 * BM25 实现
 * 基于 Okapi BM25 算法的文本检索
 */

/**
 * 简单的分词器
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // 替换非字母数字为空格
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * BM25 参数
 * k1: 词频饱和度参数 (通常 1.2-2.0)
 * b: 长度归一化参数 (通常 0.75)
 */
const K1 = 1.5;
const B = 0.75;

/**
 * BM25 索引
 */
export class BM25Index {
  private documents: Map<string, string> = new Map(); // id -> text
  private docLengths: Map<string, number> = new Map(); // id -> normalized length
  private termFreqs: Map<string, Map<string, number>> = new Map(); // term -> {docId -> freq}
  private docCount: number = 0;
  private avgDocLength: number = 0;

  /**
   * 添加文档到索引
   */
  addDocument(id: string, text: string): void {
    if (this.documents.has(id)) {
      this.removeDocument(id);
    }

    const tokens = tokenize(text);
    this.documents.set(id, text);
    this.docCount = this.documents.size;

    // 更新平均文档长度
    const totalLength =
      Array.from(this.docLengths.values()).reduce((a, b) => a + b, 0) +
      tokens.length;
    this.avgDocLength = totalLength / this.docCount;

    // 存储文档长度
    this.docLengths.set(id, tokens.length);

    // 更新词频索引
    const freqMap = new Map<string, number>();
    for (const token of tokens) {
      freqMap.set(token, (freqMap.get(token) || 0) + 1);
    }

    for (const [term, freq] of freqMap.entries()) {
      if (!this.termFreqs.has(term)) {
        this.termFreqs.set(term, new Map());
      }
      this.termFreqs.get(term)!.set(id, freq);
    }
  }

  /**
   * 移除文档
   */
  removeDocument(id: string): void {
    if (!this.documents.has(id)) return;

    const oldLength = this.docLengths.get(id) || 0;
    const tokens = tokenize(this.documents.get(id) || '');

    // 更新平均文档长度
    const totalLength = Array.from(this.docLengths.values()).reduce(
      (a, b) => a + b,
      0,
    );
    this.docCount = this.documents.size - 1;
    const nextTotalLength = Math.max(0, totalLength - oldLength);
    this.avgDocLength = this.docCount > 0 ? nextTotalLength / this.docCount : 0;

    // 移除文档长度
    this.docLengths.delete(id);

    // 移除词频索引
    for (const token of tokens) {
      const termMap = this.termFreqs.get(token);
      if (termMap) {
        termMap.delete(id);
        if (termMap.size === 0) {
          this.termFreqs.delete(token);
        }
      }
    }

    this.documents.delete(id);
  }

  /**
   * 搜索相关文档
   */
  search(query: string, limit: number): string[] {
    return this.searchWithScores(query, limit).map((item) => item.id);
  }

  /**
   * 搜索相关文档并返回分数
   */
  searchWithScores(query: string, limit: number): BM25Result[] {
    const queryTokens = tokenize(query);
    const scores = new Map<string, number>();

    for (const token of queryTokens) {
      const termMap = this.termFreqs.get(token);
      if (!termMap) continue;

      // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
      const df = termMap.size;
      const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, freq] of termMap.entries()) {
        const docLen = this.docLengths.get(docId) || 0;

        // BM25 score: IDF * (f * (k1 + 1)) / (f + k1 * (1 - b + b * docLen / avgDocLen))
        const numerator = freq * (K1 + 1);
        const denominator =
          freq + K1 * (1 - B + B * (docLen / this.avgDocLength));
        const score = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) || 0) + score);
      }
    }

    // 排序并返回 top K
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score], index) => ({
        id,
        score,
        rank: index + 1,
      }));
  }

  /**
   * 获取文档内容
   */
  getDocument(id: string): string | undefined {
    return this.documents.get(id);
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.documents.clear();
    this.docLengths.clear();
    this.termFreqs.clear();
    this.docCount = 0;
    this.avgDocLength = 0;
  }

  /**
   * 重建索引（用于批量更新后）
   */
  rebuild(): void {
    const oldDocs = Array.from(this.documents.entries());
    this.clear();
    for (const [id, text] of oldDocs) {
      this.addDocument(id, text);
    }
  }
}

/**
 * BM25 搜索结果
 */
export interface BM25Result {
  id: string;
  score: number;
  rank: number;
}

/**
 * 向量搜索结果
 */
export interface VectorResult {
  id: string;
  score: number;
  rank: number;
}

/**
 * 融合后的结果
 */
export interface FusedResult {
  id: string;
  bm25Rank?: number;
  vectorRank?: number;
  fusedScore: number;
}

/**
 * 倒数排名融合 (Reciprocal Rank Fusion)
 *
 * 公式：RRF = 1 / (k + rank)
 * 默认 k=60 (标准值)
 *
 * @param bm25Results - BM25 搜索结果（已按 score 排序）
 * @param vectorResults - 向量搜索结果（已按 score 排序）
 * @param k - RRF 参数，默认 60
 * @returns 融合后的结果列表
 */
export function reciprocalRankFusion(
  bm25Results: string[],
  vectorResults: string[],
  k: number = 60,
): FusedResult[] {
  const scoreMap = new Map<string, number>();

  // BM25 排名分数
  for (let i = 0; i < bm25Results.length; i++) {
    const id = bm25Results[i];
    const rank = i + 1;
    const currentScore = scoreMap.get(id) || 0;
    scoreMap.set(id, currentScore + 1 / (k + rank));
  }

  // 向量搜索排名分数
  for (let i = 0; i < vectorResults.length; i++) {
    const id = vectorResults[i];
    const rank = i + 1;
    const currentScore = scoreMap.get(id) || 0;
    scoreMap.set(id, currentScore + 1 / (k + rank));
  }

  // 转换为结果数组并排序
  const results: FusedResult[] = [];
  for (const [id, fusedScore] of scoreMap.entries()) {
    const bm25Rank = bm25Results.indexOf(id);
    const vectorRank = vectorResults.indexOf(id);
    results.push({
      id,
      bm25Rank: bm25Rank >= 0 ? bm25Rank + 1 : undefined,
      vectorRank: vectorRank >= 0 ? vectorRank + 1 : undefined,
      fusedScore,
    });
  }

  // 按融合分数降序排序
  results.sort((a, b) => b.fusedScore - a.fusedScore);
  return results;
}

/**
 * 将融合结果转换为 Memory ID 列表
 * @param fusedResults - 融合结果
 * @param limit - 最大返回数量
 * @returns Memory ID 列表
 */
export function fusedToIds(
  fusedResults: FusedResult[],
  limit: number,
): string[] {
  return fusedResults.slice(0, limit).map((r) => r.id);
}
