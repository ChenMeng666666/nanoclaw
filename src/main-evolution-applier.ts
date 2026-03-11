import { evolutionManager } from './evolution-manager.js';
import { extractSignals, SignalType, Signal } from './signal-extractor.js';
import { logger } from './logger.js';
import {
  MainComponent,
  MainExperienceInput,
  EvolutionEntry,
  GEPCapsule,
  GEP_SCHEMA_VERSION,
} from './types.js';

export class MainEvolutionApplier {
  /**
   * 提交主进程经验到进化库（GEP 1.5.0 标准）
   */
  static async submitMainExperience(
    input: MainExperienceInput,
  ): Promise<number> {
    logger.debug(
      { abilityName: input.abilityName, component: input.component },
      'Submitting main project experience (GEP 1.5.0)',
    );

    // 使用 GEP 1.5.0 标准的 submitExperience 方法
    const id = await evolutionManager.submitExperience(
      input.abilityName,
      input.content,
      'main-process',
      input.description,
      input.tags,
    );

    logger.info(
      { id, abilityName: input.abilityName },
      'Main project experience submitted (GEP 1.5.0)',
    );

    return id;
  }

  /**
   * 根据信号选择合适的 Gene
   */
  static async selectGene(
    signals: Signal[],
  ): Promise<EvolutionEntry | undefined> {
    logger.debug(
      { signalCount: signals.length },
      'Main app selecting Gene (GEP 1.5.0)',
    );
    return evolutionManager.selectGene(signals);
  }

  /**
   * 从信号中应用进化策略
   */
  static async applyEvolutionFromSignals(signals: string[]): Promise<void> {
    logger.debug(
      { signals },
      'Main app applying evolution from signals (GEP 1.5.0)',
    );

    const gene = await evolutionManager.selectGene(
      signals.map((type) => ({ type: type as SignalType, confidence: 0.8 })),
    );

    if (!gene) {
      logger.debug('No suitable Gene found for signals (GEP 1.5.0)');
      return;
    }

    logger.info(
      {
        geneId: gene.id,
        abilityName: gene.abilityName,
        gdiScore: gene.gdi_score?.total,
      },
      'Applying Gene strategy (GEP 1.5.0)',
    );

    await this.applyGeneStrategy(gene);
  }

  /**
   * 应用 Gene 策略
   */
  static async applyGeneStrategy(gene: EvolutionEntry): Promise<void> {
    logger.debug(
      { abilityName: gene.abilityName, gdiScore: gene.gdi_score?.total },
      'Main app applying gene strategy (GEP 1.5.0)',
    );

    // 根据 Gene 类别选择策略
    switch (gene.category) {
      case 'repair':
        await this.applyRepairStrategy(gene);
        break;
      case 'optimize':
        await this.applyOptimizeStrategy(gene);
        break;
      case 'innovate':
        await this.applyInnovateStrategy(gene);
        break;
      default:
        logger.debug(`Unknown gene category: ${gene.category}`);
    }
  }

  /**
   * 应用修复策略
   */
  private static async applyRepairStrategy(
    gene: EvolutionEntry,
  ): Promise<void> {
    logger.info(
      { abilityName: gene.abilityName },
      'Applying repair strategy (GEP 1.5.0)',
    );
    // TODO: 实现具体的修复策略
  }

  /**
   * 应用优化策略
   */
  private static async applyOptimizeStrategy(
    gene: EvolutionEntry,
  ): Promise<void> {
    logger.info(
      { abilityName: gene.abilityName },
      'Applying optimize strategy (GEP 1.5.0)',
    );
    // TODO: 实现具体的优化策略
  }

  /**
   * 应用创新策略
   */
  private static async applyInnovateStrategy(
    gene: EvolutionEntry,
  ): Promise<void> {
    logger.info(
      { abilityName: gene.abilityName },
      'Applying innovate strategy (GEP 1.5.0)',
    );
    // TODO: 实现具体的创新策略
  }

  /**
   * 创建 Capsule（验证后的执行结果）
   */
  static async createCapsule(params: {
    geneId: number;
    trigger: string[];
    confidence: number;
    blastRadius: { files: number; lines: number };
    outcome: { status: 'success' | 'partial' | 'failed'; score: number };
  }): Promise<string> {
    logger.debug(
      { geneId: params.geneId, confidence: params.confidence },
      'Creating Capsule (GEP 1.5.0)',
    );

    const capsuleId = await evolutionManager.createCapsule(
      params.geneId,
      params.trigger,
      params.confidence,
      params.blastRadius,
      params.outcome,
    );

    logger.info(
      { capsuleId, geneId: params.geneId },
      'Capsule created successfully (GEP 1.5.0)',
    );

    return capsuleId;
  }

  /**
   * 获取 Gene 的所有 Capsules
   */
  static getCapsulesForGene(geneId: number): any[] {
    return evolutionManager.getCapsulesForGene(geneId);
  }

  /**
   * 计算 Gene 的 GDI 评分
   */
  static updateGeneGDIScore(geneId: number): void {
    const gdiScore = evolutionManager.updateGeneGDIScore(geneId);
    logger.info({ geneId, gdiScore }, 'GDI score updated (GEP 1.5.0)');
  }

  /**
   * 优化通道连接（向后兼容）
   */
  static async optimizeChannelConnection(): Promise<void> {
    logger.info('Optimizing channel connection strategy (GEP 1.5.0)');
  }

  /**
   * 优化容器性能（向后兼容）
   */
  static async optimizeContainerPerformance(): Promise<void> {
    logger.info('Optimizing container performance strategy (GEP 1.5.0)');
  }

  /**
   * 优化消息路由（向后兼容）
   */
  static async optimizeMessageRouting(): Promise<void> {
    logger.info('Optimizing message routing strategy (GEP 1.5.0)');
  }
}
