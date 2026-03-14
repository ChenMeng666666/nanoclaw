import crypto from 'crypto';
import { logger } from '../logger.js';
import { MEMORY_CONFIG } from '../config.js';

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
  constructor() {}

  generateVariants(query: string): string[] {
    return generateKeywordVariants(query);
  }
}

/**
 * 基于关键词的查询扩展（回退方案）
 */
export function generateKeywordVariants(text: string): string[] {
  const variants: string[] = [text]; // 原始查询

  // 1. 关键词提取和重组
  const keywords = extractKeywords(text);
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
  const simplified = simplifyQuery(text);
  if (
    simplified &&
    simplified.length > 10 &&
    simplified !== text &&
    !variants.includes(simplified)
  ) {
    variants.push(simplified);
  }

  // 3. 同义词替换（简单的同义词词典）
  const synonyms = replaceSynonyms(text);
  if (synonyms !== text && !variants.includes(synonyms)) {
    variants.push(synonyms);
  }

  // 限制变体数量
  return variants.slice(0, MEMORY_CONFIG.retrieval.queryVariantLimit);
}

/**
 * 提取关键词
 */
export function extractKeywords(text: string): string[] {
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
export function simplifyQuery(text: string): string {
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
export function replaceSynonyms(text: string): string {
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
    const replacement = selectDeterministicSynonym(word, synList);
    result = result.replace(regex, replacement);
  }

  return result;
}

function selectDeterministicSynonym(
  word: string,
  candidates: string[],
): string {
  if (candidates.length === 0) {
    return word;
  }
  const hash = crypto.createHash('sha256').update(word).digest();
  const index = hash[0] % candidates.length;
  return candidates[index];
}

/**
 * 生成查询变体 (Facade for Engine)
 * 如果有 LLM 提供者，优先使用 LLM；否则使用基于关键词的方法
 */
export async function generateQueryVariants(
  text: string,
  provider: QueryExpansionProvider | null,
): Promise<string[]> {
  // 如果有 LLM 提供者，优先使用 LLM
  if (provider) {
    try {
      const llmVariants = provider.generateVariants(text);
      const resolvedVariants =
        llmVariants instanceof Promise ? await llmVariants : llmVariants;

      if (resolvedVariants && resolvedVariants.length > 0) {
        return [text, ...resolvedVariants].slice(
          0,
          MEMORY_CONFIG.retrieval.queryVariantLimit,
        );
      }
    } catch (err) {
      logger.warn(
        { err },
        'LLM query expansion failed, falling back to keyword method',
      );
    }
  }

  // 回退到基于关键词的方法
  return generateKeywordVariants(text);
}
