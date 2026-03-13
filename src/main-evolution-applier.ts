import { evolutionManager } from './evolution-manager.js';
import { extractSignals, SignalType, Signal } from './signal-extractor.js';
import { logger } from './logger.js';
import { isCommandAllowed } from './config.js';
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
      case 'learn':
        await this.applyLearnStrategy(gene);
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
    await this.executeGeneStrategy(gene, 'repair', {
      baseScore: 0.82,
      blastRadius: { files: 1, lines: 40 },
    });
  }

  /**
   * 应用优化策略
   */
  private static async applyOptimizeStrategy(
    gene: EvolutionEntry,
  ): Promise<void> {
    await this.executeGeneStrategy(gene, 'optimize', {
      baseScore: 0.78,
      blastRadius: { files: 2, lines: 80 },
    });
  }

  /**
   * 应用创新策略
   */
  private static async applyInnovateStrategy(
    gene: EvolutionEntry,
  ): Promise<void> {
    await this.executeGeneStrategy(gene, 'innovate', {
      baseScore: 0.72,
      blastRadius: { files: 3, lines: 120 },
    });
  }

  private static async applyLearnStrategy(gene: EvolutionEntry): Promise<void> {
    await this.executeGeneStrategy(gene, 'learn', {
      baseScore: 0.7,
      blastRadius: { files: 1, lines: 60 },
    });
  }

  private static async executeGeneStrategy(
    gene: EvolutionEntry,
    category: 'repair' | 'optimize' | 'innovate' | 'learn',
    defaults: {
      baseScore: number;
      blastRadius: { files: number; lines: number };
    },
  ): Promise<void> {
    logger.info(
      { geneId: gene.id, abilityName: gene.abilityName, category },
      'Applying main evolution strategy (GEP 1.5.0)',
    );

    const preconditions = (gene.preconditions || [])
      .map((item) => item.trim())
      .filter(Boolean);
    const unmetPreconditions = this.getUnmetPreconditions(preconditions);
    if (unmetPreconditions.length > 0) {
      evolutionManager.createValidationReport(
        gene.id,
        [],
        false,
        { category, unmetPreconditions },
        `Unmet preconditions: ${unmetPreconditions.join(', ')}`,
      );
      logger.warn(
        { geneId: gene.id, unmetPreconditions },
        'Skip applying gene strategy due to unmet preconditions',
      );
      return;
    }

    const commands = this.getValidationCommands(gene);
    if (commands.length === 0) {
      evolutionManager.createValidationReport(
        gene.id,
        [],
        false,
        { category },
        'No validation commands available',
      );
      logger.warn({ geneId: gene.id }, 'No validation commands for gene');
      return;
    }

    const unsafeCommands = commands.filter(
      (command) => !isCommandAllowed(command),
    );
    if (unsafeCommands.length > 0) {
      const safeCommands = commands.filter((command) =>
        isCommandAllowed(command),
      );
      evolutionManager.createValidationReport(
        gene.id,
        safeCommands,
        false,
        { category, unsafeCommands },
        `Unsafe validation commands: ${unsafeCommands.join(', ')}`,
      );
      logger.warn(
        { geneId: gene.id, unsafeCommands },
        'Gene strategy blocked by command safety policy',
      );
      return;
    }

    evolutionManager.createValidationReport(gene.id, commands, true, {
      category,
      dryRun: true,
      commandCount: commands.length,
      preconditionsChecked: preconditions.length,
    });

    const confidence = this.getConfidenceFromGene(gene, defaults.baseScore);
    const blastRadius = this.getBlastRadius(gene, defaults.blastRadius);
    const outcomeScore = Number(
      Math.min(1, confidence * 0.6 + defaults.baseScore * 0.4).toFixed(2),
    );

    await this.createCapsule({
      geneId: gene.id,
      trigger: gene.signalsMatch?.length ? gene.signalsMatch : [category],
      confidence,
      blastRadius,
      outcome: { status: 'success', score: outcomeScore },
    });

    this.updateGeneGDIScore(gene.id);
  }

  private static getValidationCommands(gene: EvolutionEntry): string[] {
    const rawCommands = [
      ...(gene.validation_commands || []),
      ...(gene.validation || []),
      ...(gene.strategy || []),
    ];
    return Array.from(
      new Set(
        rawCommands
          .map((command) => command.trim())
          .filter((command) => command),
      ),
    );
  }

  private static getUnmetPreconditions(preconditions: string[]): string[] {
    const unmet: string[] = [];
    for (const precondition of preconditions) {
      if (precondition.startsWith('env:')) {
        const envName = precondition.slice(4).trim();
        if (!envName || !process.env[envName]) {
          unmet.push(precondition);
        }
        continue;
      }
      if (precondition.startsWith('platform:')) {
        const expectedPlatform = precondition.slice(9).trim();
        if (!expectedPlatform || process.platform !== expectedPlatform) {
          unmet.push(precondition);
        }
      }
    }
    return unmet;
  }

  private static getConfidenceFromGene(
    gene: EvolutionEntry,
    fallback: number,
  ): number {
    const normalized = (gene.gdi_score?.total ?? 0) / 10;
    if (Number.isFinite(normalized) && normalized > 0) {
      return Number(Math.max(0.1, Math.min(1, normalized)).toFixed(2));
    }
    return fallback;
  }

  private static getBlastRadius(
    gene: EvolutionEntry,
    fallback: { files: number; lines: number },
  ): { files: number; lines: number } {
    const summary = gene.summary?.toLowerCase() || '';
    if (summary.includes('major') || summary.includes('broad')) {
      return {
        files: Math.max(fallback.files, 3),
        lines: Math.max(fallback.lines, 120),
      };
    }
    return fallback;
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
