/**
 * 饱和检测模块
 *
 * 检测学习系统的饱和状态，触发相应策略调整
 * 参考 evolver 的饱和检测机制
 */
import { logger } from './logger.js';

// ===== 类型定义 =====

/**
 * 学习结果（用于饱和检测）
 */
export interface LearningResult {
  id: string;
  taskId?: string;
  agentFolder: string;
  status: 'keep' | 'discard' | 'crash';
  createdAt: string;
  signals?: string[];
  geneId?: string;
  metricBefore?: number;
  metricAfter?: number;
}

/**
 * 饱和状态
 */
export interface SaturationState {
  consecutiveEmptyCycles: number; // 连续空循环次数
  consecutiveRepairs: number; // 连续修复次数
  consecutiveFailures: number; // 连续失败次数
  recentFailureRatio: number; // 最近失败率 (0-1)
  signals: SaturationSignalType[]; // 饱和信号
  recommendations: string[]; // 建议行动
}

/**
 * 饱和信号类型
 */
export type SaturationSignalType =
  | 'force_steady_state' // 强制进入维护模式
  | 'evolution_saturation' // 进化饱和
  | 'learning_stagnation' // 学习停滞
  | 'force_innovation'; // 强制创新

// ===== 常量定义 =====

/**
 * 饱和检测阈值
 */
export const SATURATION_THRESHOLDS = {
  /** 连续空循环次数阈值 */
  CONSECUTIVE_EMPTY_CYCLES: 5,

  /** 连续修复次数阈值 */
  CONSECUTIVE_REPAIRS: 3,

  /** 连续失败次数阈值 */
  CONSECUTIVE_FAILURES: 3,

  /** 失败率阈值 */
  FAILURE_RATIO: 0.75,

  /** 最近结果窗口大小 */
  RECENT_WINDOW_SIZE: 10,
} as const;

/**
 * 饱和信号常量
 */
export const SATURATION_SIGNALS = {
  FORCE_STEADY_STATE: 'force_steady_state' as SaturationSignalType,
  EVOLUTION_SATURATION: 'evolution_saturation' as SaturationSignalType,
  LEARNING_STAGNATION: 'learning_stagnation' as SaturationSignalType,
  FORCE_INNOVATION: 'force_innovation' as SaturationSignalType,
};

// ===== 检测函数 =====

/**
 * 检测饱和状态
 *
 * @param recentResults 最近的学习结果
 * @returns 饱和状态信息
 */
export function detectSaturation(
  recentResults: LearningResult[],
): SaturationState {
  try {
    const state: SaturationState = {
      consecutiveEmptyCycles: 0,
      consecutiveRepairs: 0,
      consecutiveFailures: 0,
      recentFailureRatio: 0,
      signals: [],
      recommendations: [],
    };

    if (recentResults.length === 0) {
      return state;
    }

    // 只取最近 N 条结果
    const windowSize = SATURATION_THRESHOLDS.RECENT_WINDOW_SIZE;
    const recentWindow = recentResults.slice(0, windowSize);

    // 计算连续空循环（状态为 discard）
    state.consecutiveEmptyCycles = countConsecutive(
      recentWindow,
      (r) => r.status === 'discard',
    );

    // 计算连续修复（状态为 crash）
    state.consecutiveFailures = countConsecutive(
      recentWindow,
      (r) => r.status === 'crash',
    );

    // 计算失败率（discard + crash）
    const failures = recentWindow.filter(
      (r) => r.status === 'discard' || r.status === 'crash',
    ).length;
    state.recentFailureRatio = failures / recentWindow.length;

    // 检测饱和信号
    detectSignals(state);

    // 生成建议
    generateRecommendations(state);

    return state;
  } catch (error) {
    logger.warn(
      { error },
      'Saturation detection failed, returning default state',
    );
    return {
      consecutiveEmptyCycles: 0,
      consecutiveRepairs: 0,
      consecutiveFailures: 0,
      recentFailureRatio: 0,
      signals: [],
      recommendations: [],
    };
  }
}

/**
 * 计算连续满足条件的次数
 */
function countConsecutive(
  results: LearningResult[],
  condition: (r: LearningResult) => boolean,
): number {
  let count = 0;
  for (const result of results) {
    if (condition(result)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * 检测饱和信号
 */
function detectSignals(state: SaturationState): void {
  // 连续空循环 -> 强制进入维护模式
  if (
    state.consecutiveEmptyCycles >=
    SATURATION_THRESHOLDS.CONSECUTIVE_EMPTY_CYCLES
  ) {
    state.signals.push(SATURATION_SIGNALS.FORCE_STEADY_STATE);
  }

  // 连续失败 -> 学习停滞
  if (state.consecutiveFailures >= SATURATION_THRESHOLDS.CONSECUTIVE_FAILURES) {
    state.signals.push(SATURATION_SIGNALS.LEARNING_STAGNATION);
  }

  // 失败率过高 -> 进化饱和
  if (state.recentFailureRatio >= SATURATION_THRESHOLDS.FAILURE_RATIO) {
    state.signals.push(SATURATION_SIGNALS.EVOLUTION_SATURATION);
  }

  // 同时触发多种饱和信号 -> 强制创新
  if (state.signals.length >= 2) {
    state.signals.push(SATURATION_SIGNALS.FORCE_INNOVATION);
  }
}

/**
 * 生成建议行动
 */
function generateRecommendations(state: SaturationState): void {
  if (state.signals.includes(SATURATION_SIGNALS.FORCE_STEADY_STATE)) {
    state.recommendations.push(
      'Switch to maintenance mode - reduce learning frequency',
    );
  }

  if (state.signals.includes(SATURATION_SIGNALS.LEARNING_STAGNATION)) {
    state.recommendations.push(
      'Review learning strategy - current approach not effective',
    );
  }

  if (state.signals.includes(SATURATION_SIGNALS.EVOLUTION_SATURATION)) {
    state.recommendations.push(
      'Consider alternative approaches or seek external knowledge',
    );
  }

  if (state.signals.includes(SATURATION_SIGNALS.FORCE_INNOVATION)) {
    state.recommendations.push(
      'Force innovation cycle - try completely new approaches',
    );
  }

  // 默认建议
  if (state.recommendations.length === 0 && state.recentFailureRatio > 0.5) {
    state.recommendations.push('Monitor closely - failure rate is elevated');
  }
}

// ===== 策略调整函数 =====

/**
 * 饱和信号对应的策略调整
 */
export interface StrategyAdjustment {
  learningFrequency: 'normal' | 'reduced' | 'paused';
  geneCategory: 'repair' | 'optimize' | 'innovate' | 'learn';
  shouldNotify: boolean;
  message?: string;
}

/**
 * 根据饱和信号获取策略调整建议
 */
export function getStrategyAdjustment(
  signals: SaturationSignalType[],
): StrategyAdjustment {
  const defaultAdjustment: StrategyAdjustment = {
    learningFrequency: 'normal',
    geneCategory: 'learn',
    shouldNotify: false,
  };

  if (signals.length === 0) {
    return defaultAdjustment;
  }

  // 强制创新
  if (signals.includes(SATURATION_SIGNALS.FORCE_INNOVATION)) {
    return {
      learningFrequency: 'normal',
      geneCategory: 'innovate',
      shouldNotify: true,
      message:
        'Multiple saturation signals detected. Forcing innovation cycle.',
    };
  }

  // 强制稳定状态
  if (signals.includes(SATURATION_SIGNALS.FORCE_STEADY_STATE)) {
    return {
      learningFrequency: 'reduced',
      geneCategory: 'optimize',
      shouldNotify: true,
      message: 'Too many empty learning cycles. Reducing frequency.',
    };
  }

  // 学习停滞
  if (signals.includes(SATURATION_SIGNALS.LEARNING_STAGNATION)) {
    return {
      learningFrequency: 'reduced',
      geneCategory: 'repair',
      shouldNotify: true,
      message: 'Learning stagnation detected. Reviewing strategy.',
    };
  }

  // 进化饱和
  if (signals.includes(SATURATION_SIGNALS.EVOLUTION_SATURATION)) {
    return {
      learningFrequency: 'paused',
      geneCategory: 'innovate',
      shouldNotify: true,
      message: 'Evolution saturation reached. Pausing to seek new approaches.',
    };
  }

  return defaultAdjustment;
}

/**
 * 检查是否应该暂停学习
 */
export function shouldPauseLearning(state: SaturationState): boolean {
  return (
    state.signals.includes(SATURATION_SIGNALS.EVOLUTION_SATURATION) ||
    state.consecutiveFailures >= SATURATION_THRESHOLDS.CONSECUTIVE_FAILURES * 2
  );
}

/**
 * 检查是否应该强制创新
 */
export function shouldForceInnovation(state: SaturationState): boolean {
  return (
    state.signals.includes(SATURATION_SIGNALS.FORCE_INNOVATION) ||
    state.consecutiveEmptyCycles >=
      SATURATION_THRESHOLDS.CONSECUTIVE_EMPTY_CYCLES * 2
  );
}

/**
 * 获取饱和状态摘要
 */
export function getSaturationSummary(state: SaturationState): string {
  if (state.signals.length === 0) {
    return 'System operating normally. No saturation detected.';
  }

  const parts: string[] = [];

  parts.push(`Signals: ${state.signals.join(', ')}`);
  parts.push(`Empty cycles: ${state.consecutiveEmptyCycles}`);
  parts.push(`Failures: ${state.consecutiveFailures}`);
  parts.push(`Failure ratio: ${(state.recentFailureRatio * 100).toFixed(1)}%`);

  if (state.recommendations.length > 0) {
    parts.push(`Recommendations: ${state.recommendations.join('; ')}`);
  }

  return parts.join(' | ');
}
