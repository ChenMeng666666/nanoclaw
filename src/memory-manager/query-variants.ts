import { MEMORY_CONFIG } from '../config.js';

export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'you',
    'are',
    'can',
    'how',
    'what',
    'please',
    '帮我',
    '请问',
    '一下',
    '这个',
    '那个',
  ]);
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token))
    .slice(0, 10);
}

export function simplifyQuery(text: string): string {
  return text
    .replace(/\b(please|thanks|thank you|could you|would you)\b/gi, ' ')
    .replace(/(请|麻烦|帮我|可以|是否|能不能)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function replaceSynonyms(text: string): string {
  const synonyms: Record<string, string> = {
    问题: '难题',
    方法: '方案',
    使用: '采用',
    学习: '掌握',
    功能: '能力',
    系统: '架构',
    数据: '信息',
    代码: '程序',
    query: 'search',
    bug: 'issue',
  };
  let output = text;
  for (const [key, value] of Object.entries(synonyms)) {
    output = output.replace(new RegExp(`\\b${key}\\b`, 'gi'), value);
  }
  return output;
}

export function generateQueryVariants(query: string): string[] {
  const variants = new Set<string>();
  const normalized = query.trim();
  if (!normalized) {
    return [];
  }
  variants.add(normalized);
  const simplified = simplifyQuery(normalized);
  if (simplified) {
    variants.add(simplified);
  }
  const keywords = extractKeywords(normalized);
  if (keywords.length > 0) {
    variants.add(keywords.join(' '));
  }
  const synonymVariant = replaceSynonyms(normalized);
  if (synonymVariant) {
    variants.add(synonymVariant);
  }
  return [...variants].slice(0, MEMORY_CONFIG.retrieval.queryVariantLimit);
}

export function extractMatchedTerms(
  queryTerms: string[],
  content: string,
): string[] {
  const normalized = content.toLowerCase();
  return queryTerms.filter((term) => normalized.includes(term)).slice(0, 8);
}
