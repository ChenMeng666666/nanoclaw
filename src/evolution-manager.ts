/**
 * 进化系统 (符合 GEP 1.5.0 标准)
 *
 * 实现完整的 Genome Evolution Protocol (GEP) 协议：
 * - GEPAsset: 基础资产接口
 * - GEPGene: 符合 GEP 标准的 Gene 结构
 * - GEPCapsule: 验证后的执行结果胶囊
 * - GDIScore: 全球期望指数评分
 * - 信号去重机制 (防止微编辑 farming)
 * - 验证命令安全机制
 * - 三阶段进化策略 (Repair → Optimize → Innovate)
 * - 能力链概念 (Chain ID)
 * - 生态系统指标
 */
import crypto from 'crypto';
import os from 'os';
import { generateEmbedding } from './embedding-providers/registry.js';
import {
  getEvolutionEntry,
  getApprovedEvolutionEntries,
  getEvolutionEntryByAssetId,
  updateEvolutionStatus,
  updateGeneStatus,
  updateGeneChainId,
  updateGeneGDIScore,
  addEvolutionFeedback,
  logAudit,
  CreateGeneInput,
  getDatabase,
  createCapsule,
  getCapsuleById,
  getCapsulesByGeneId,
  createAbilityChain,
  getAbilityChain,
  updateAbilityChain,
  addGeneToChain,
  addCapsuleToChain,
  createValidationReport,
  getValidationReportsByGeneId,
  createEcosystemMetrics,
  getEcosystemMetrics,
} from './db-agents.js';
import {
  EvolutionEntry,
  Gene,
  MainExperienceInput,
  GDIScore,
  DuplicateCheckResult,
  EcosystemMetrics,
  EvolutionStrategy,
  STRATEGY_CONFIGS,
  StrategyConfig,
  generateAssetId,
} from './types.js';
import { logger } from './logger.js';
import {
  extractSignals,
  getRecommendedGeneCategory,
  Signal,
} from './signal-extractor.js';
import { EVOLUTION_CONFIG } from './config.js';
import { EvolutionScoringService } from './domain/evolution/services/scoring-service.js';
import { CommandSafetyService } from './domain/evolution/services/command-safety-service.js';
import { SubmitExperienceUseCase } from './application/evolution/use-cases/submit-experience.js';
import { SelectAndReviewUseCase } from './application/evolution/use-cases/select-and-review.js';

/**
 * 审核配置
 */
export interface ReviewConfig {
  autoApproveThreshold: number;
  requireUserReview: boolean;
  seniorAgentIds?: string[];
  strategy: EvolutionStrategy;
}

export interface EvolutionDashboardSnapshot {
  timestamp: string;
  shannonDiversity: number;
  avgGDIScore: number;
  totalGenes: number;
  totalCapsules: number;
  promotedGenes: number;
  staleGenes: number;
  archivedGenes: number;
}

export interface EvolutionDashboardMetrics {
  generatedAt: string;
  summary: {
    shannonDiversity: number;
    avgGDIScore: number;
    totalGenes: number;
    totalCapsules: number;
    promotedGenes: number;
    staleGenes: number;
    archivedGenes: number;
    promotionRate: number;
  };
  timeline: EvolutionDashboardSnapshot[];
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ReviewConfig = {
  autoApproveThreshold: EVOLUTION_CONFIG.autoApproveThreshold,
  requireUserReview: EVOLUTION_CONFIG.requireUserReview,
  seniorAgentIds: [],
  strategy: EVOLUTION_CONFIG.strategy,
};

// ===== 进化系统类 =====

/**
 * 进化系统类 (符合 GEP 标准)
 */
export class EvolutionManager {
  private config: ReviewConfig;
  private strategyConfig: StrategyConfig;
  private scoringService: EvolutionScoringService;
  private commandSafetyService: CommandSafetyService;
  private submitExperienceUseCase: SubmitExperienceUseCase;
  private selectAndReviewUseCase: SelectAndReviewUseCase;

  constructor(config: Partial<ReviewConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.strategyConfig = STRATEGY_CONFIGS[this.config.strategy];
    this.scoringService = new EvolutionScoringService();
    this.commandSafetyService = new CommandSafetyService();
    this.selectAndReviewUseCase = new SelectAndReviewUseCase(
      this.config.strategy,
      {
        updateGeneGDIScore: (geneId) => {
          this.updateGeneGDIScore(geneId);
        },
      },
    );
    this.submitExperienceUseCase = new SubmitExperienceUseCase(this.config, {
      getCategory: (signals) => this.getStrategyBasedCategory(signals),
      extractSignals,
      checkDuplicateSignal: (content, sourceAgentId) =>
        this.checkDuplicateSignal(content, sourceAgentId),
      autoReviewEntry: (entry) => this.autoReviewEntry(entry),
      autoReviewPendingEntry: async (entry) =>
        this.selectAndReviewUseCase.autoReviewPendingEntry(entry),
      assertCommandsSafe: (commands) =>
        this.commandSafetyService.assertCommandsSafe(commands),
    });
  }

  /**
   * 更新进化策略
   */
  setStrategy(strategy: EvolutionStrategy): void {
    this.config.strategy = strategy;
    this.strategyConfig = STRATEGY_CONFIGS[strategy];
    this.selectAndReviewUseCase.setStrategy(strategy);
    logger.info({ strategy }, 'Evolution strategy updated');
  }

  /**
   * 获取当前策略配置
   */
  getStrategyConfig(): StrategyConfig {
    return this.strategyConfig;
  }

  // ===== GEP 协议：Gene 提交和审核 =====

  /**
   * 上传经验到进化库（符合 GEP 标准，带自动初审）
   */
  async submitExperience(
    abilityName: string,
    content: string,
    sourceAgentId: string,
    description?: string,
    tags?: string[],
  ): Promise<number> {
    return this.submitExperienceUseCase.submitExperience(
      abilityName,
      content,
      sourceAgentId,
      description,
      tags,
    );
  }

  /**
   * 提交 Gene 到进化库（完整 GEP Gene 结构）
   */
  async submitGene(
    input: Omit<CreateGeneInput, 'contentEmbedding'> & {
      summary?: string;
      preconditions?: string[];
      validationCommands?: string[];
      chainId?: string;
    },
  ): Promise<number> {
    return this.submitExperienceUseCase.submitGene(input);
  }

  // ===== GEP 协议：Capsule 管理 =====

  /**
   * 创建 Capsule（验证后的执行结果）
   */
  async createCapsule(
    geneId: number,
    trigger: string[],
    confidence: number,
    blastRadius: { files: number; lines: number },
    outcome: { status: 'success' | 'partial' | 'failed'; score: number },
  ): Promise<string> {
    const gene = getEvolutionEntry(geneId);
    if (!gene) {
      throw new Error(`Gene not found: ${geneId}`);
    }

    // 检查晋升条件
    const capsules = getCapsulesByGeneId(geneId);
    const successStreak = this.calculateSuccessStreak(capsules, outcome.status);

    const successfulValidationCount =
      this.calculateSuccessfulValidationCount(geneId);
    const promotionDecision = this.shouldPromoteToCapsule(
      successfulValidationCount,
      successStreak,
      confidence,
      outcome.status,
      capsules.length,
    );

    if (!promotionDecision.shouldPromote) {
      logger.warn(
        {
          geneId,
          confidence,
          outcomeStatus: outcome.status,
          successStreak,
          successfulValidationCount,
          existingCapsuleCount: capsules.length,
          promotionMode: promotionDecision.mode,
          promotionBlockReasons: promotionDecision.reasonCodes,
        },
        'Capsule promotion blocked by criteria',
      );
      throw new Error(
        `CAPSULE_PROMOTION_BLOCKED:${promotionDecision.reasonCodes.join(',')}`,
      );
    }

    // 生成 capsule asset_id
    const approvedAt = new Date().toISOString();
    const capsuleContent = JSON.stringify({
      geneId,
      trigger,
      outcome,
      approvedAt,
      nonce: crypto.randomBytes(8).toString('hex'),
    });
    const capsuleId = generateAssetId(capsuleContent);

    // 创建 Capsule
    createCapsule({
      id: capsuleId,
      geneId,
      trigger,
      summary: gene.description || gene.abilityName,
      confidence,
      blastRadius,
      outcome,
      envFingerprint: {
        platform: process.platform,
        arch: process.arch,
        runtime: `Node.js ${process.version}`,
      },
      successStreak,
      approvedAt,
    });

    // 更新 Gene 的生态系统状态
    updateGeneStatus(geneId, 'promoted');

    // 如果 Gene 有 chain_id，添加 capsule 到能力链
    const db = getDatabase();
    const geneRow = db
      .prepare('SELECT chain_id FROM evolution_log WHERE id = ?')
      .get(geneId) as { chain_id: string | null };
    if (geneRow?.chain_id) {
      addCapsuleToChain(geneRow.chain_id, capsuleId);
    }

    logger.info(
      { capsuleId, geneId, successStreak, confidence },
      'Capsule created successfully (GEP)',
    );

    return capsuleId;
  }

  /**
   * 获取 Capsule
   */
  getCapsule(capsuleId: string): any {
    return getCapsuleById(capsuleId);
  }

  /**
   * 获取 Gene 的所有 Capsules
   */
  getCapsulesForGene(geneId: number): any[] {
    return getCapsulesByGeneId(geneId);
  }

  // ===== GEP 协议：GDI 评分 =====

  /**
   * 计算 GDI 评分（全球期望指数）
   */
  calculateGDIScore(gene: EvolutionEntry): GDIScore {
    return this.scoringService.calculateGDIScore(gene);
  }

  /**
   * 更新 Gene 的 GDI 评分
   */
  updateGeneGDIScore(geneId: number): GDIScore {
    const gene = getEvolutionEntry(geneId);
    if (!gene) {
      throw new Error(`Gene not found: ${geneId}`);
    }

    const gdiScore = this.calculateGDIScore(gene);
    updateGeneGDIScore(geneId, gdiScore);

    // 更新生态系统状态
    this.updateEcosystemStatus(geneId, gdiScore);

    logger.info({ geneId, gdiScore }, 'GDI score updated (GEP)');

    return gdiScore;
  }

  // ===== 生态系统状态管理 =====

  /**
   * 更新生态系统状态
   */
  private updateEcosystemStatus(geneId: number, gdiScore: GDIScore): void {
    const gene = getEvolutionEntry(geneId);
    if (!gene) return;
    const status = this.scoringService.resolveEcosystemStatus(gene, gdiScore);
    updateGeneStatus(geneId, status);
  }

  /**
   * 计算生态系统指标
   */
  calculateEcosystemMetrics(): EcosystemMetrics {
    const db = getDatabase();

    // 获取所有 Genes
    const allGenes = db.prepare('SELECT * FROM evolution_log').all() as any[];

    // 按状态统计
    const promotedGenes = allGenes.filter(
      (g) => g.ecosystem_status === 'promoted',
    ).length;
    const staleGenes = allGenes.filter(
      (g) => g.ecosystem_status === 'stale',
    ).length;
    const archivedGenes = allGenes.filter(
      (g) => g.ecosystem_status === 'archived',
    ).length;

    // 获取所有 Capsules
    const totalCapsules = db
      .prepare('SELECT COUNT(*) as count FROM capsules')
      .get() as { count: number };

    // 计算香农多样性
    const shannonDiversity = this.calculateShannonDiversity(allGenes);

    // 计算平均 GDI 评分
    const gdiScores = allGenes
      .map((g) => {
        try {
          const parsed = JSON.parse(g.gdi_score || '{}');
          return parsed.total || 0;
        } catch {
          return 0;
        }
      })
      .filter((score) => score > 0);

    const avgGDIScore =
      gdiScores.length > 0
        ? gdiScores.reduce((a, b) => a + b, 0) / gdiScores.length
        : 0;

    return {
      shannonDiversity,
      fitnessLandscape: [],
      symbioticRelationships: [],
      macroEvolutionEvents: [],
      negentropyReduction: promotedGenes * 5,
      totalGenes: allGenes.length,
      totalCapsules: totalCapsules.count,
      promotedGenes,
      staleGenes,
      archivedGenes,
      avgGDIScore,
    };
  }

  /**
   * 计算香农多样性
   */
  private calculateShannonDiversity(genes: any[]): number {
    const categoryCounts: Record<string, number> = {};
    const total = genes.length;

    if (total === 0) return 0;

    for (const gene of genes) {
      const cat = gene.category || 'learn';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }

    let diversity = 0;
    for (const count of Object.values(categoryCounts)) {
      const p = count / total;
      diversity -= p * Math.log2(p);
    }

    return diversity;
  }

  /**
   * 保存生态系统指标快照
   */
  saveEcosystemMetrics(): void {
    const metrics = this.calculateEcosystemMetrics();
    createEcosystemMetrics({
      shannonDiversity: metrics.shannonDiversity,
      avgGDIScore: metrics.avgGDIScore,
      totalGenes: metrics.totalGenes,
      totalCapsules: metrics.totalCapsules,
      promotedGenes: metrics.promotedGenes,
      staleGenes: metrics.staleGenes,
      archivedGenes: metrics.archivedGenes,
    });
    logger.info('Ecosystem metrics snapshot saved (GEP)');
  }

  getDashboardMetrics(timelineLimit: number = 30): EvolutionDashboardMetrics {
    const safeLimit = Math.max(1, Math.min(200, timelineLimit));
    const current = this.calculateEcosystemMetrics();
    const timeline = getEcosystemMetrics(safeLimit)
      .map((item) => ({
        timestamp: item.timestamp,
        shannonDiversity: item.shannonDiversity,
        avgGDIScore: item.avgGDIScore,
        totalGenes: item.totalGenes,
        totalCapsules: item.totalCapsules,
        promotedGenes: item.promotedGenes,
        staleGenes: item.staleGenes,
        archivedGenes: item.archivedGenes,
      }))
      .reverse();
    const promotionRate =
      current.totalGenes > 0 ? current.promotedGenes / current.totalGenes : 0;
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        shannonDiversity: current.shannonDiversity,
        avgGDIScore: current.avgGDIScore,
        totalGenes: current.totalGenes,
        totalCapsules: current.totalCapsules,
        promotedGenes: current.promotedGenes,
        staleGenes: current.staleGenes,
        archivedGenes: current.archivedGenes,
        promotionRate,
      },
      timeline,
    };
  }

  // ===== 信号去重机制 =====

  /**
   * 检查信号是否重复
   */
  async checkDuplicateSignal(
    content: string,
    authorId: string,
  ): Promise<DuplicateCheckResult> {
    const db = getDatabase();
    const existingEntries = db
      .prepare(
        "SELECT * FROM evolution_log WHERE created_at >= datetime('now', '-7 days')",
      )
      .all() as any[];

    if (existingEntries.length === 0) {
      return { isDuplicate: false, similarity: 0 };
    }

    // 生成当前内容的嵌入
    const currentEmbedding = await generateEmbedding(content);

    for (const existing of existingEntries) {
      if (!existing.content_embedding) continue;

      try {
        const existingEmbedding = JSON.parse(existing.content_embedding);
        const similarity = this.cosineSimilarity(
          currentEmbedding,
          existingEmbedding,
        );

        const isSameAuthor = existing.source_agent_id === authorId;
        const threshold = this.normalizeSimilarityThreshold(
          isSameAuthor
            ? EVOLUTION_CONFIG.duplicateThreshold.sameAuthor
            : EVOLUTION_CONFIG.duplicateThreshold.differentAuthor,
        );

        if (similarity >= threshold) {
          return {
            isDuplicate: true,
            similarity,
            reason: isSameAuthor
              ? 'Same author, high content similarity'
              : 'Different author, very high content similarity',
            existingAssetId: existing.asset_id,
          };
        }
      } catch {
        continue;
      }
    }

    return { isDuplicate: false, similarity: 0 };
  }

  // ===== 验证命令安全机制 =====

  /**
   * 验证命令安全性
   */
  private validateCommandSafety(command: string): boolean {
    return this.commandSafetyService.validateCommandSafety(command);
  }

  /**
   * 创建验证报告
   */
  createValidationReport(
    geneId: number,
    commands: string[],
    success: boolean,
    testResults?: Record<string, unknown>,
    error?: string,
  ): number {
    this.commandSafetyService.assertCommandsSafe(commands);

    return createValidationReport({
      geneId,
      commands,
      success,
      environment: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
      },
      testResults,
      error,
    });
  }

  /**
   * 获取 Gene 的验证报告
   */
  getValidationReports(geneId: number): any[] {
    return getValidationReportsByGeneId(geneId);
  }

  // ===== 能力链管理 =====

  /**
   * 创建能力链
   */
  createAbilityChain(description?: string): string {
    const chainId = `chain_${crypto.randomBytes(16).toString('hex')}`;
    createAbilityChain({
      chainId,
      genes: [],
      capsules: [],
      description,
    });
    logger.info({ chainId }, 'Ability chain created (GEP)');
    return chainId;
  }

  /**
   * 获取能力链
   */
  getAbilityChain(chainId: string): any {
    return getAbilityChain(chainId);
  }

  /**
   * 链接 Gene 到能力链
   */
  linkGeneToChain(geneId: number, chainId?: string): string {
    const chainIdToUse = chainId || this.createAbilityChain();

    const gene = getEvolutionEntry(geneId);
    if (!gene) {
      throw new Error(`Gene not found: ${geneId}`);
    }

    const db = getDatabase();
    const geneRow = db
      .prepare('SELECT asset_id FROM evolution_log WHERE id = ?')
      .get(geneId) as { asset_id: string | null };

    if (geneRow?.asset_id) {
      addGeneToChain(chainIdToUse, geneRow.asset_id);
    }

    updateGeneChainId(geneId, chainIdToUse);

    logger.info(
      { geneId, chainId: chainIdToUse },
      'Gene linked to ability chain (GEP)',
    );

    return chainIdToUse;
  }

  // ===== 辅助方法 =====

  /**
   * 基于当前策略获取推荐的类别
   */
  private getStrategyBasedCategory(
    signals: Signal[],
  ): 'repair' | 'optimize' | 'innovate' | 'learn' {
    if (this.strategyConfig.prioritizeRepair) {
      // 优先修复
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

    // 根据探索率决定是否探索新类别
    if (Math.random() < this.strategyConfig.explorationRate) {
      const categories: Array<'repair' | 'optimize' | 'innovate' | 'learn'> = [
        'repair',
        'optimize',
        'innovate',
        'learn',
      ];
      return categories[Math.floor(Math.random() * categories.length)];
    }

    return recommended;
  }

  /**
   * 检查是否应该晋升为 Capsule
   */
  private shouldPromoteToCapsule(
    successCount: number,
    successStreak: number,
    confidence: number,
    outcomeStatus: string,
    existingCapsuleCount: number,
  ): {
    shouldPromote: boolean;
    mode: 'cold_start' | 'standard';
    reasonCodes: string[];
  } {
    return this.scoringService.shouldPromoteToCapsule(
      successCount,
      successStreak,
      confidence,
      outcomeStatus,
      existingCapsuleCount,
    );
  }

  private calculateSuccessfulValidationCount(geneId: number): number {
    const reports = getValidationReportsByGeneId(geneId);
    return reports.filter((report) => report.success).length;
  }

  private normalizeSimilarityThreshold(value: number): number {
    if (!Number.isFinite(value)) {
      return 0.95;
    }
    return Math.min(1, Math.max(0, value));
  }

  /**
   * 计算连续成功次数
   */
  private calculateSuccessStreak(capsules: any[], newOutcome: string): number {
    let streak = 0;

    // 从最新的倒序检查
    for (let i = capsules.length - 1; i >= 0; i--) {
      const outcome = capsules[i].outcome;
      if (outcome?.status === 'success') {
        streak++;
      } else {
        break;
      }
    }

    // 加上新的结果
    if (newOutcome === 'success') {
      streak++;
    }

    return streak;
  }

  /**
   * 计算平均评分
   */
  private calculateAverageRating(
    feedback: Array<{ rating: number }> | undefined | null,
  ): number {
    if (!feedback || !Array.isArray(feedback) || feedback.length === 0)
      return 0;

    const sum = feedback.reduce((acc, f) => acc + (f?.rating || 0), 0);
    return sum / feedback.length;
  }

  /**
   * 余弦相似度计算
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ===== 向后兼容的方法 =====

  /**
   * 主项目提交经验到进化库
   */
  async submitMainExperience(input: MainExperienceInput): Promise<number> {
    return this.submitExperienceUseCase.submitMainExperience(input);
  }

  /**
   * 根据信号选择合适的 Gene
   */
  async selectGene(signals: Signal[]): Promise<EvolutionEntry | undefined> {
    return this.selectAndReviewUseCase.selectGene(signals);
  }

  /**
   * 根据内容自动选择 Gene
   */
  async selectGeneForContent(
    content: string,
  ): Promise<EvolutionEntry | undefined> {
    const signals = extractSignals({ content });
    return this.selectGene(signals);
  }

  /**
   * 审核经验条目
   */
  async reviewExperience(
    id: number,
    reviewerId: string,
    approved: boolean,
    feedback?: string,
  ): Promise<void> {
    await this.selectAndReviewUseCase.reviewExperience(
      id,
      reviewerId,
      approved,
      feedback,
    );
  }

  /**
   * 查询经验
   */
  async queryExperience(
    query: string,
    tags?: string[],
    limit: number = 20,
  ): Promise<EvolutionEntry[]> {
    logger.debug({ query, tags, limit }, 'Querying evolution (GEP)');

    const entries = getApprovedEvolutionEntries(tags, limit);

    if (query) {
      const queryEmbedding = await generateEmbedding(query);

      const scored = entries
        .filter((e) => e.contentEmbedding && e.contentEmbedding.length > 0)
        .map((entry) => ({
          entry,
          score: this.cosineSimilarity(queryEmbedding, entry.contentEmbedding!),
        }))
        .sort((a, b) => b.score - a.score);

      return scored.map((s) => s.entry);
    }

    return entries;
  }

  /**
   * 提交使用反馈
   */
  async submitFeedback(
    id: number,
    agentId: string,
    comment: string,
    rating: number,
  ): Promise<void> {
    logger.info({ id, agentId, rating }, 'Submitting evolution feedback (GEP)');

    addEvolutionFeedback(id, agentId, comment, rating);

    logAudit({
      action: 'feedback',
      entityType: 'gene',
      entityId: String(id),
      details: { agentId, rating, comment },
    });

    const entry = getEvolutionEntry(id);
    if (entry) {
      const avgRating = this.calculateAverageRating(entry.feedback);
      const feedbackCount = entry.feedback.length;

      if (avgRating < 3 || feedbackCount >= 10) {
        await this.triggerReReview(id, avgRating, feedbackCount);
      }

      // 更新 GDI 评分
      this.updateGeneGDIScore(id);
    }
  }

  /**
   * 标记经验为需要再审核
   */
  async markForReReview(id: number, reason: string): Promise<void> {
    logger.info({ id, reason }, 'Marking evolution for re-review (GEP)');

    updateEvolutionStatus(id, 'reviewing', undefined, reason);

    logAudit({
      action: 're_review',
      entityType: 'gene',
      entityId: String(id),
      details: { reason },
    });
  }

  /**
   * 自动审核所有 pending 条目
   */
  async autoReviewPendingEntries(): Promise<number> {
    const db = getDatabase();
    const pendingEntries = db
      .prepare('SELECT id FROM evolution_log WHERE status = ?')
      .all('pending') as Array<{ id: number }>;

    logger.info(
      { count: pendingEntries.length },
      'Starting auto-review of pending entries (GEP)',
    );

    let reviewedCount = 0;
    for (const { id } of pendingEntries) {
      const entry = getEvolutionEntry(id);
      if (!entry) {
        continue;
      }
      await this.autoReviewPendingEntry(entry);
      reviewedCount += 1;
    }
    return reviewedCount;
  }

  /**
   * 自动审核单个待审核条目
   */
  async autoReviewPendingEntry(entry: EvolutionEntry): Promise<void> {
    await this.selectAndReviewUseCase.autoReviewPendingEntry(entry);
  }

  // ===== 私有方法 =====

  private async autoReviewEntry(entry: {
    abilityName: string;
    content: string;
    description: string;
    tags: string[];
  }): Promise<{ confidence: number; issues: string[] }> {
    const issues: string[] = [];
    let confidence = 0.8;

    if (entry.content.length < 50) {
      issues.push('Content too short');
      confidence -= 0.2;
    }

    if (!entry.abilityName || entry.abilityName.length < 2) {
      issues.push('Invalid ability name');
      confidence -= 0.15;
    }

    const hasCode =
      entry.content.includes('```') ||
      entry.content.includes('function') ||
      entry.content.includes('class') ||
      entry.content.includes('const ') ||
      entry.content.includes('export');
    if (hasCode) {
      confidence += 0.1;
    }

    const experienceKeywords = [
      '经验',
      '方法',
      '技巧',
      '模式',
      '最佳实践',
      'learned',
      'discovered',
      'found',
      'technique',
      'pattern',
      'how to',
      'solution',
    ];
    const lowerContent = entry.content.toLowerCase();
    const hasExperience = experienceKeywords.some((kw) =>
      lowerContent.includes(kw.toLowerCase()),
    );
    if (hasExperience) {
      confidence += 0.05;
    }

    if (entry.tags.length > 0) {
      confidence += 0.05;
    }

    if (entry.description && entry.description.length > 20) {
      confidence += 0.05;
    }

    return {
      confidence: Math.min(Math.max(confidence, 0), 1),
      issues,
    };
  }

  private async triggerReReview(
    id: number,
    avgRating: number,
    feedbackCount: number,
  ): Promise<void> {
    const reasons: string[] = [];

    if (avgRating < 3) {
      reasons.push(`Low average rating: ${avgRating.toFixed(2)}`);
    }

    if (feedbackCount >= 10) {
      reasons.push(`High feedback count: ${feedbackCount}`);
    }

    await this.markForReReview(id, reasons.join('; '));

    logger.info({ id, avgRating, feedbackCount }, 'Re-review triggered (GEP)');
  }
}

// 单例导出
export const evolutionManager = new EvolutionManager();
