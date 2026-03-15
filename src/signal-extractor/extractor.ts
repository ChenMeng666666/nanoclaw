import { logger } from '../logger.js';
import type { Signal, SignalExtractionOptions, SignalType } from './signal-types.js';
import { SIGNAL_PATTERNS } from './patterns.js';
import {
  detectLanguage,
  extractSnippet,
  adjustConfidence,
  deduplicateSignals,
} from './utils.js';

/**
 * 从内容中提取信号
 *
 * @param options 提取选项
 * @returns 提取的信号数组，按优先级排序（actionable 优先）
 */
export function extractSignals(options: SignalExtractionOptions): Signal[] {
  try {
    const { content, memorySnippet, recentEvents } = options;
    const language = options.language || detectLanguage(content);

    const signals: Signal[] = [];

    // 遍历所有信号类型
    for (const [signalType, langPatterns] of Object.entries(SIGNAL_PATTERNS)) {
      const patterns = langPatterns[language] || langPatterns['en'];

      for (const pattern of patterns.patterns) {
        const matches = content.matchAll(pattern);

        for (const match of matches) {
          signals.push({
            type: signalType as SignalType,
            confidence: adjustConfidence(patterns.weight, 1),
            snippet: extractSnippet(content, match),
            metadata: {
              language,
              actionable: patterns.actionable,
            },
          });
        }
      }
    }

    // 上下文增强：检查记忆摘要
    if (memorySnippet) {
      // 如果记忆中提到相关主题，增强相关信号
      const memorySignals = extractSignals({
        content: memorySnippet,
        language,
      });

      for (const ms of memorySignals) {
        const existing = signals.find((s) => s.type === ms.type);
        if (existing) {
          existing.confidence = adjustConfidence(existing.confidence, 1, 0.1);
        }
      }
    }

    // 上下文增强：检查最近事件
    if (recentEvents && recentEvents.length > 0) {
      // 如果最近有相关进化事件，增强学习相关信号
      const hasRecentLearning = recentEvents.some(
        (e) => e.tags?.includes('learning') || e.tags?.includes('skill'),
      );

      if (hasRecentLearning) {
        for (const s of signals) {
          if (
            s.type === 'learning_opportunity' ||
            s.type === 'capability_gap'
          ) {
            s.confidence = adjustConfidence(s.confidence, 1, 0.15);
          }
        }
      }
    }

    // 去重
    const deduplicated = deduplicateSignals(signals);

    // 排序：actionable 优先，然后按置信度降序
    deduplicated.sort((a, b) => {
      const aActionable = a.metadata?.actionable ?? false;
      const bActionable = b.metadata?.actionable ?? false;

      if (aActionable !== bActionable) {
        return aActionable ? -1 : 1;
      }

      return b.confidence - a.confidence;
    });

    return deduplicated;
  } catch (error) {
    logger.warn({ error }, 'Signal extraction failed, returning empty array');
    return [];
  }
}
