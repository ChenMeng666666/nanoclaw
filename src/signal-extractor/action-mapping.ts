import { SignalType, Signal } from './types.js';

/**
 * 获取信号的可执行性
 */
export function isActionableSignal(signalType: SignalType): boolean {
  // 预定义的可执行信号
  const actionableSignals: SignalType[] = [
    'capability_gap',
    'learning_opportunity',
    'knowledge_missing',
    'recurring_error',
    'performance_issue',
    'user_feedback',
    'negative_feedback',
    'learning_stagnation',
    'feature_request',
    'improvement_suggestion',
    'innovation_idea',
  ];

  return actionableSignals.includes(signalType);
}

/**
 * 获取信号建议的行动类别
 */
export function getSignalActionCategory(
  signalType: SignalType,
): 'learn' | 'repair' | 'optimize' | 'innovate' | 'none' {
  const categoryMap: Record<
    SignalType,
    'learn' | 'repair' | 'optimize' | 'innovate' | 'none'
  > = {
    // 学习相关 -> learn
    capability_gap: 'learn',
    learning_opportunity: 'learn',
    knowledge_missing: 'learn',

    // 反思相关 -> repair
    recurring_error: 'repair',
    performance_issue: 'optimize',
    user_feedback: 'repair',
    negative_feedback: 'repair',
    positive_feedback: 'none',

    // 状态相关
    stable_plateau: 'none',
    learning_stagnation: 'learn',
    saturation: 'innovate',

    // 创新相关
    feature_request: 'innovate',
    improvement_suggestion: 'optimize',
    innovation_idea: 'innovate',
  };

  return categoryMap[signalType] || 'none';
}

/**
 * 根据信号选择推荐的 Gene 类别
 */
export function getRecommendedGeneCategory(
  signals: Signal[],
): 'repair' | 'optimize' | 'innovate' | 'learn' {
  if (signals.length === 0) return 'learn';

  // 统计各类行动的数量和权重
  const categoryScores: Record<string, number> = {
    learn: 0,
    repair: 0,
    optimize: 0,
    innovate: 0,
  };

  for (const signal of signals) {
    const category = getSignalActionCategory(signal.type);
    if (category !== 'none') {
      categoryScores[category] += signal.confidence;
    }
  }

  // 返回得分最高的类别
  let maxCategory: 'repair' | 'optimize' | 'innovate' | 'learn' = 'learn';
  let maxScore = 0;

  for (const [category, score] of Object.entries(categoryScores)) {
    if (score > maxScore) {
      maxScore = score;
      maxCategory = category as 'repair' | 'optimize' | 'innovate' | 'learn';
    }
  }

  return maxCategory;
}
