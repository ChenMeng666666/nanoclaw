import type { Signal } from './types.js';

/**
 * 检测文本语言
 */
export function detectLanguage(text: string): 'en' | 'zh-CN' | 'zh-TW' | 'ja' {
  // 简单启发式检测
  const jaChars = text.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
  if (jaChars && jaChars.length > 10) return 'ja';

  const zhTwChars = text.match(/[繁體臺灣]/g);
  if (zhTwChars && zhTwChars.length > 0) return 'zh-TW';

  const zhChars = text.match(/[\u4E00-\u9FFF]/g);
  if (zhChars && zhChars.length > 10) return 'zh-CN';

  return 'en';
}

/**
 * 提取匹配的文本片段
 */
export function extractSnippet(
  text: string,
  match: RegExpMatchArray,
  contextLength: number = 50,
): string {
  const start = Math.max(0, (match.index || 0) - contextLength);
  const end = Math.min(
    text.length,
    (match.index || 0) + match[0].length + contextLength,
  );
  return text.slice(start, end).trim();
}

/**
 * 去重信号
 */
export function deduplicateSignals(signals: Signal[]): Signal[] {
  const seen = new Set<string>();
  const result: Signal[] = [];

  for (const signal of signals) {
    const key = signal.type;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(signal);
    } else {
      // 如果已存在，取置信度更高的
      const existing = result.find((s) => s.type === signal.type);
      if (existing && signal.confidence > existing.confidence) {
        existing.confidence = signal.confidence;
        if (signal.snippet) existing.snippet = signal.snippet;
      }
    }
  }

  return result;
}

/**
 * 计算信号置信度调整
 */
export function adjustConfidence(
  baseWeight: number,
  matchCount: number,
  contextBoost: number = 0,
): number {
  // 多次匹配增加置信度，但有上限
  const matchBoost = Math.min(matchCount * 0.1, 0.2);
  const confidence = Math.min(baseWeight + matchBoost + contextBoost, 1.0);
  return Math.round(confidence * 100) / 100;
}
