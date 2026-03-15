import { MainComponent, type EvolutionEntry } from '../types/evolution.js';
import { logger } from '../logger.js';
import type { Signal, SignalType } from './signal-types.js';
import { extractSignals } from './extractor.js';
import { detectLanguage, extractSnippet, deduplicateSignals } from './utils.js';

/**
 * 主项目组件信号提取
 */
export function extractMainSignals(options: {
  content: string;
  component?: MainComponent;
  memorySnippet?: string;
  recentEvents?: EvolutionEntry[];
}): Signal[] {
  try {
    const { content, component, memorySnippet, recentEvents } = options;
    const language = detectLanguage(content);

    const signals: Signal[] = [];

    // 先使用通用信号提取
    // Construct SignalExtractionOptions from options
    const generalSignals = extractSignals({
      content,
      memorySnippet,
      recentEvents,
      language,
    });
    signals.push(...generalSignals);

    // 组件特定信号增强
    if (component) {
      const componentSignals = extractComponentSpecificSignals(
        content,
        component,
        language,
      );
      signals.push(...componentSignals);
    }

    // 去重和排序
    const deduplicated = deduplicateSignals(signals);

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
    logger.warn(
      { error },
      'Main project signal extraction failed, returning empty array',
    );
    return [];
  }
}

/**
 * 提取组件特定信号
 */
function extractComponentSpecificSignals(
  content: string,
  component: MainComponent,
  language: string,
): Signal[] {
  const signals: Signal[] = [];

  // 组件特定的信号模式
  const componentPatterns: Record<
    MainComponent,
    Array<{
      type: SignalType;
      patterns: RegExp[];
      weight: number;
      actionable: boolean;
    }>
  > = {
    [MainComponent.CHANNELS]: [
      {
        type: 'performance_issue',
        patterns: [
          /channel.*(connect|connection|disconnect|timeout)/i,
          /(send|receive).*message.*(fail|error|timeout)/i,
        ],
        weight: 0.85,
        actionable: true,
      },
    ],
    [MainComponent.CONTAINER]: [
      {
        type: 'recurring_error',
        patterns: [
          /container.*(start|spawn|run|exit).*(fail|error|crash)/i,
          /container.*(timeout|hang|unresponsive)/i,
        ],
        weight: 0.9,
        actionable: true,
      },
    ],
    [MainComponent.ROUTER]: [
      {
        type: 'performance_issue',
        patterns: [
          /(route|routing).*(fail|error|timeout)/i,
          /message.*route.*(fail|error)/i,
        ],
        weight: 0.8,
        actionable: true,
      },
    ],
    [MainComponent.DATABASE]: [
      {
        type: 'recurring_error',
        patterns: [
          /(db|database|sql).*(error|fail|timeout)/i,
          /(query|transaction).*(fail|error)/i,
        ],
        weight: 0.95,
        actionable: true,
      },
    ],
    [MainComponent.QUEUE]: [
      {
        type: 'performance_issue',
        patterns: [
          /queue.*(overflow|timeout|block)/i,
          /message.*queue.*(delay|timeout)/i,
        ],
        weight: 0.8,
        actionable: true,
      },
    ],
  };

  const patterns = componentPatterns[component] || [];

  for (const patternInfo of patterns) {
    for (const pattern of patternInfo.patterns) {
      const matches = content.matchAll(pattern);

      for (const match of matches) {
        signals.push({
          type: patternInfo.type,
          confidence: patternInfo.weight,
          snippet: extractSnippet(content, match),
          metadata: {
            language,
            actionable: patternInfo.actionable,
            component,
          },
        });
      }
    }
  }

  return signals;
}
