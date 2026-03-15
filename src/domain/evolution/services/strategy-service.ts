import {
  type EvolutionStrategy,
  type StrategyConfig,
  STRATEGY_CONFIGS,
  type EvolutionCategory,
} from '../../../types/evolution.js';
import { logger } from '../../../logger.js';
import type { Signal } from '../../../signal-extractor.js';
import { getRecommendedGeneCategory } from '../../../signal-extractor.js';

export interface ReviewConfig {
  autoApproveThreshold: number;
  requireUserReview: boolean;
  seniorAgentIds?: string[];
  strategy: EvolutionStrategy;
}

export class StrategyService {
  private config: ReviewConfig;
  private strategyConfig: StrategyConfig;

  constructor(config: ReviewConfig) {
    this.config = config;
    this.strategyConfig = STRATEGY_CONFIGS[this.config.strategy];
  }

  setStrategy(strategy: EvolutionStrategy): void {
    this.config.strategy = strategy;
    this.strategyConfig = STRATEGY_CONFIGS[strategy];
    logger.info({ strategy }, 'Evolution strategy updated');
  }

  getStrategyConfig(): StrategyConfig {
    return this.strategyConfig;
  }

  getConfig(): ReviewConfig {
    return this.config;
  }

  getStrategyBasedCategory(signals: Signal[]): EvolutionCategory {
    if (this.strategyConfig.prioritizeRepair) {
      // Prioritize repair
      for (const signal of signals) {
        if (
          signal.type === 'recurring_error' ||
          signal.type === 'performance_issue' ||
          signal.type === 'negative_feedback'
        ) {
          return 'repair';
        }
      }
    }

    const recommended = getRecommendedGeneCategory(signals);

    // Decide whether to explore new categories based on exploration rate
    if (Math.random() < this.strategyConfig.explorationRate) {
      const categories: EvolutionCategory[] = [
        'repair',
        'optimize',
        'innovate',
        'learn',
      ];
      return categories[Math.floor(Math.random() * categories.length)];
    }

    return recommended;
  }
}
