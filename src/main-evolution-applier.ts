import { evolutionManager } from './evolution-manager.js';
import { extractSignals, SignalType } from './signal-extractor.js';
import { logger } from './logger.js';
import { MainComponent, MainExperienceInput, EvolutionEntry } from './types.js';

export class MainEvolutionApplier {
  static async submitMainExperience(
    input: MainExperienceInput,
  ): Promise<number> {
    logger.debug(
      { abilityName: input.abilityName, component: input.component },
      'Submitting main project experience',
    );

    return evolutionManager.submitMainExperience(input);
  }

  static async applyEvolutionFromSignals(signals: string[]): Promise<void> {
    logger.debug({ signals }, 'Main app applying evolution from signals');

    const gene = await evolutionManager.selectGene(
      signals.map((type) => ({ type: type as SignalType, confidence: 0.8 })),
    );

    if (!gene) {
      logger.debug('No suitable Gene found for signals');
      return;
    }

    await this.applyGeneStrategy(gene);
  }

  static async applyGeneStrategy(gene: any): Promise<void> {
    logger.debug(
      { abilityName: gene.abilityName },
      'Main app applying gene strategy',
    );

    switch (gene.abilityName.toLowerCase()) {
      case '通道连接优化':
        await this.optimizeChannelConnection();
        break;
      case '容器运行优化':
        await this.optimizeContainerPerformance();
        break;
      case '消息路由改进':
        await this.optimizeMessageRouting();
        break;
      default:
        logger.debug(`Unknown ability: ${gene.abilityName}`);
    }
  }

  static async optimizeChannelConnection(): Promise<void> {
    logger.info('Optimizing channel connection strategy');
  }

  static async optimizeContainerPerformance(): Promise<void> {
    logger.info('Optimizing container performance strategy');
  }

  static async optimizeMessageRouting(): Promise<void> {
    logger.info('Optimizing message routing strategy');
  }
}
