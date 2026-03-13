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
  createEvolutionEntry,
  getEvolutionEntry,
  getApprovedEvolutionEntries,
  getEvolutionEntriesByCategory,
  getEvolutionEntriesByStatus,
  getEvolutionEntryByAssetId,
  updateEvolutionStatus,
  updateGeneStatus,
  updateGeneChainId,
  updateGeneGDIScore,
  addEvolutionFeedback,
  logAudit,
  CreateGeneInput,
  getDuplicateEvolutionEntry,
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
  GEP_SCHEMA_VERSION,
  generateAssetId,
  GDIScore,
  DuplicateCheckResult,
  EcosystemMetrics,
  EvolutionStrategy,
  STRATEGY_CONFIGS,
  StrategyConfig,
} from './types.js';
import { logger } from './logger.js';
import {
  extractSignals,
  getRecommendedGeneCategory,
  Signal,
} from './signal-extractor.js';
import { EVOLUTION_CONFIG, isCommandAllowed } from './config.js';

// ===== 配置和常量 =====

// 验证命令白名单
const ALLOWED_COMMAND_PREFIXES = EVOLUTION_CONFIG.allowedCommandPrefixes;

// 禁止的 shell 操作符
const FORBIDDEN_OPERATORS = EVOLUTION_CONFIG.forbiddenOperators;

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

/**
 * 审核代理类型
 */
interface ReviewAgent {
  id: string;
  name: string;
  expertise:
    | 'safety'
    | 'effectiveness'
    | 'reusability'
    | 'clarity'
    | 'completeness';
  weight: number;
}

/**
 * 审核代理配置
 */
const REVIEW_AGENTS: ReviewAgent[] = [
  {
    id: 'reviewer-safety',
    name: '安全审核员',
    expertise: 'safety',
    weight: 0.25,
  },
  {
    id: 'reviewer-effectiveness',
    name: '有效性审核员',
    expertise: 'effectiveness',
    weight: 0.25,
  },
  {
    id: 'reviewer-reusability',
    name: '可复用性审核员',
    expertise: 'reusability',
    weight: 0.2,
  },
  {
    id: 'reviewer-clarity',
    name: '清晰度审核员',
    expertise: 'clarity',
    weight: 0.15,
  },
  {
    id: 'reviewer-completeness',
    name: '完整性审核员',
    expertise: 'completeness',
    weight: 0.15,
  },
];

// ===== 进化系统类 =====

/**
 * 进化系统类 (符合 GEP 标准)
 */
export class EvolutionManager {
  private config: ReviewConfig;
  private strategyConfig: StrategyConfig;

  constructor(config: Partial<ReviewConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.strategyConfig = STRATEGY_CONFIGS[this.config.strategy];
  }

  /**
   * 更新进化策略
   */
  setStrategy(strategy: EvolutionStrategy): void {
    this.config.strategy = strategy;
    this.strategyConfig = STRATEGY_CONFIGS[strategy];
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
    logger.info(
      { abilityName, sourceAgentId, contentLength: content.length },
      'Submitting experience to evolution (GEP)',
    );

    // 检查重复提交
    const contentHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
    const duplicate = getDuplicateEvolutionEntry(abilityName, contentHash, 24);
    if (duplicate) {
      logger.info(
        { duplicateId: duplicate.id, abilityName },
        'Duplicate experience submission detected',
      );
      return duplicate.id;
    }

    // 从内容中提取信号
    const signals = extractSignals({ content });
    const category = this.getStrategyBasedCategory(signals);

    // 生成向量嵌入
    const embedding = await generateEmbedding(content);

    // 生成 asset_id (GEP 标准)
    const assetId = generateAssetId(content);

    // 检查信号去重
    const duplicateCheck = await this.checkDuplicateSignal(
      content,
      sourceAgentId,
    );
    if (duplicateCheck.isDuplicate) {
      logger.warn(
        {
          abilityName,
          similarity: duplicateCheck.similarity,
          reason: duplicateCheck.reason,
        },
        'Signal duplicate detected, rejecting submission',
      );
      throw new Error(`Duplicate signal detected: ${duplicateCheck.reason}`);
    }

    // 自动初审：基于规则和内容质量
    const autoReview = await this.autoReviewEntry({
      abilityName,
      content,
      description: description || '',
      tags: tags || [],
    });

    // 决定初始状态
    let status: 'pending' | 'approved' = 'pending';
    if (
      autoReview.confidence > this.config.autoApproveThreshold &&
      !this.config.requireUserReview
    ) {
      status = 'approved';
      logger.info(
        { abilityName, confidence: autoReview.confidence },
        'Experience auto-approved (GEP)',
      );
    }

    // 创建条目（符合 GEP 标准的 Gene 结构）
    const id = createEvolutionEntry({
      abilityName,
      description,
      sourceAgentId,
      content,
      contentEmbedding: embedding,
      tags: tags || [],
      status,
      category,
      signalsMatch: signals.map((s) => s.type),
    });

    // 更新 GEP 标准字段
    const db = getDatabase();
    db.prepare(
      `
      UPDATE evolution_log
      SET schema_version = ?, asset_id = ?, summary = ?,
          preconditions = ?, validation_commands = ?, ecosystem_status = ?
      WHERE id = ?
    `,
    ).run(
      GEP_SCHEMA_VERSION,
      assetId,
      description || abilityName,
      JSON.stringify([]),
      JSON.stringify([]),
      'stale',
      id,
    );

    // 记录审计日志
    logAudit({
      agentFolder: sourceAgentId,
      action: 'create',
      entityType: 'gene',
      entityId: String(id),
      details: {
        abilityName,
        status,
        category,
        signalCount: signals.length,
        assetId,
      },
    });

    // 提交后立即触发审核，不等待定时任务
    if (status === 'pending') {
      logger.info(
        { id, abilityName },
        'Experience submitted, triggering immediate review (GEP)',
      );
      const fullEntry = getEvolutionEntry(id);
      if (fullEntry) {
        await this.autoReviewPendingEntry(fullEntry);
      }
    } else {
      logger.info(
        { id, abilityName },
        'Experience auto-approved and added to evolution library (GEP)',
      );
    }

    return id;
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
    logger.info(
      {
        abilityName: input.abilityName,
        category: input.category,
        sourceAgentId: input.sourceAgentId,
      },
      'Submitting Gene to evolution (GEP)',
    );

    // 检查重复提交
    const contentHash = crypto
      .createHash('sha256')
      .update(input.content)
      .digest('hex');
    const duplicate = getDuplicateEvolutionEntry(
      input.abilityName,
      contentHash,
      24,
    );
    if (duplicate) {
      logger.info(
        { duplicateId: duplicate.id, abilityName: input.abilityName },
        'Duplicate Gene submission detected',
      );
      return duplicate.id;
    }

    // 验证命令安全性
    if (input.validationCommands) {
      for (const cmd of input.validationCommands) {
        if (!this.validateCommandSafety(cmd)) {
          throw new Error(`Command not allowed: ${cmd}`);
        }
      }
    }

    // 生成向量嵌入
    const embedding = await generateEmbedding(input.content);

    // 生成 asset_id (GEP 标准)
    const assetId = generateAssetId(input.content);

    // 检查信号去重
    const duplicateCheck = await this.checkDuplicateSignal(
      input.content,
      input.sourceAgentId,
    );
    if (duplicateCheck.isDuplicate) {
      throw new Error(`Duplicate signal detected: ${duplicateCheck.reason}`);
    }

    // 自动初审
    const autoReview = await this.autoReviewEntry({
      abilityName: input.abilityName,
      content: input.content,
      description: input.description || '',
      tags: input.tags || [],
    });

    // 决定初始状态
    let status: 'pending' | 'approved' = 'pending';
    if (
      autoReview.confidence > this.config.autoApproveThreshold &&
      !this.config.requireUserReview
    ) {
      status = 'approved';
    }

    // 创建条目
    const id = createEvolutionEntry({
      ...input,
      contentEmbedding: embedding,
      status,
    });

    // 更新 GEP 标准字段
    const db = getDatabase();
    db.prepare(
      `
      UPDATE evolution_log
      SET schema_version = ?, asset_id = ?, summary = ?,
          preconditions = ?, validation_commands = ?, chain_id = ?, ecosystem_status = ?
      WHERE id = ?
    `,
    ).run(
      GEP_SCHEMA_VERSION,
      assetId,
      input.summary || input.abilityName,
      JSON.stringify(input.preconditions || []),
      JSON.stringify(input.validationCommands || []),
      input.chainId || null,
      'stale',
      id,
    );

    // 记录审计日志
    logAudit({
      agentFolder: input.sourceAgentId,
      action: 'create',
      entityType: 'gene',
      entityId: String(id),
      details: {
        abilityName: input.abilityName,
        status,
        category: input.category,
        signalCount: input.signalsMatch?.length || 0,
        assetId,
      },
    });

    // 如果有 chain_id，添加到能力链
    if (input.chainId) {
      addGeneToChain(input.chainId, assetId);
    }

    // 提交后立即触发审核
    if (status === 'pending') {
      logger.info(
        { id, abilityName: input.abilityName },
        'Gene submitted, triggering immediate review (GEP)',
      );
      const fullEntry = getEvolutionEntry(id);
      if (fullEntry) {
        await this.autoReviewPendingEntry(fullEntry);
      }
    } else {
      logger.info(
        { id, abilityName: input.abilityName },
        'Gene auto-approved and added to evolution library (GEP)',
      );
    }

    return id;
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
    const intrinsicQuality = this.calculateIntrinsicQuality(gene);
    const usageMetrics = this.calculateUsageMetrics(gene);
    const socialSignals = this.calculateSocialSignals(gene);
    const freshness = this.calculateFreshness(gene);

    return {
      intrinsicQuality,
      usageMetrics,
      socialSignals,
      freshness,
      total:
        intrinsicQuality * 0.35 +
        usageMetrics * 0.3 +
        socialSignals * 0.2 +
        freshness * 0.15,
    };
  }

  /**
   * 计算内在质量 (35%)
   */
  private calculateIntrinsicQuality(gene: EvolutionEntry): number {
    let score = 0;

    // 内容长度
    if (gene.content.length > 200) score += 2;
    if (gene.content.length > 500) score += 2;
    if (gene.content.length > 1000) score += 2;

    // 包含代码
    if (gene.content.includes('```') || gene.content.includes('function'))
      score += 2;

    // 有描述和标签
    if (gene.description && gene.description.length > 50) score += 1;
    if (gene.tags && gene.tags.length > 0) score += 1;

    return Math.min(score, 10);
  }

  /**
   * 计算使用指标 (30%)
   */
  private calculateUsageMetrics(gene: EvolutionEntry): number {
    let score = 0;

    // 反馈评分
    const avgFeedback = this.calculateAverageRating(gene.feedback);
    score += avgFeedback; // 0-5

    // 反馈数量
    if (gene.feedback && gene.feedback.length > 0) score += 1;
    if (gene.feedback && gene.feedback.length > 5) score += 2;
    if (gene.feedback && gene.feedback.length > 10) score += 3;

    return Math.min(score, 10);
  }

  /**
   * 计算社交信号 (20%)
   */
  private calculateSocialSignals(gene: EvolutionEntry): number {
    let score = 5; // 基础分

    // 高评分反馈
    if (gene.feedback && Array.isArray(gene.feedback)) {
      const highRatings = gene.feedback.filter((f) => f?.rating >= 4).length;
      if (highRatings > 0) score += 1;
      if (highRatings > 3) score += 2;
      if (highRatings > 5) score += 3;
    }

    return Math.min(score, 10);
  }

  /**
   * 计算新鲜度 (15%)
   */
  private calculateFreshness(gene: EvolutionEntry): number {
    const daysSinceCreation = this.getDaysSinceCreation(gene.createdAt);

    if (daysSinceCreation < 7) return 10;
    if (daysSinceCreation < 30) return 8;
    if (daysSinceCreation < 90) return 6;
    if (daysSinceCreation < 180) return 4;
    if (daysSinceCreation < 365) return 2;
    return 1;
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

    const daysSinceCreation = this.getDaysSinceCreation(gene.createdAt);
    const promotionThreshold = this.resolveGdiPromotionThreshold();
    const staleThreshold = Math.max(1, Math.min(10, promotionThreshold * 0.5));

    let status: 'promoted' | 'stale' | 'archived';
    if (gdiScore.total >= promotionThreshold && daysSinceCreation < 30) {
      status = 'promoted';
    } else if (gdiScore.total >= staleThreshold && daysSinceCreation < 90) {
      status = 'stale';
    } else {
      status = 'archived';
    }

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
    return isCommandAllowed(command);
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
    // 验证命令安全性
    for (const cmd of commands) {
      if (!this.validateCommandSafety(cmd)) {
        throw new Error(`Command not allowed: ${cmd}`);
      }
    }

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
    const { minSuccessCount, minSuccessStreak, minConfidence } =
      EVOLUTION_CONFIG.capsulePromotion;
    const reasonCodes: string[] = [];

    if (outcomeStatus !== 'success') {
      reasonCodes.push('OUTCOME_NOT_SUCCESS');
    }
    if (confidence < minConfidence) {
      reasonCodes.push('CONFIDENCE_BELOW_THRESHOLD');
    }

    if (existingCapsuleCount === 0) {
      if (successStreak < 1) {
        reasonCodes.push('COLD_START_REQUIRES_SUCCESS_STREAK');
      }
      return {
        shouldPromote: reasonCodes.length === 0,
        mode: 'cold_start',
        reasonCodes,
      };
    }

    if (successCount < minSuccessCount) {
      reasonCodes.push('SUCCESS_COUNT_BELOW_THRESHOLD');
    }
    if (successStreak < minSuccessStreak) {
      reasonCodes.push('SUCCESS_STREAK_BELOW_THRESHOLD');
    }

    return {
      shouldPromote: reasonCodes.length === 0,
      mode: 'standard',
      reasonCodes,
    };
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

  private resolveGdiPromotionThreshold(): number {
    const threshold = EVOLUTION_CONFIG.gdiPromotionThreshold;
    if (!Number.isFinite(threshold)) {
      return 7;
    }
    if (threshold <= 10) {
      return Math.max(0, threshold);
    }
    return Math.min(10, Math.max(0, threshold / 10));
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
   * 获取自创建以来的天数
   */
  private getDaysSinceCreation(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
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
    return this.submitExperience(
      input.abilityName,
      input.content,
      'main-process',
      input.description,
      input.tags,
    );
  }

  /**
   * 根据信号选择合适的 Gene
   */
  async selectGene(signals: Signal[]): Promise<EvolutionEntry | undefined> {
    if (signals.length === 0) {
      logger.debug('No signals provided, returning undefined');
      return undefined;
    }

    const category = this.getStrategyBasedCategory(signals);
    logger.debug(
      { category, signalCount: signals.length },
      'Selecting Gene based on signals (GEP)',
    );

    // 优先获取 promoted 状态的 Genes
    let genes = getEvolutionEntriesByStatus('promoted', 10);

    if (genes.length === 0) {
      // 如果没有 promoted，获取 stale
      genes = getEvolutionEntriesByStatus('stale', 10);
    }

    if (genes.length === 0) {
      // 最后尝试按类别获取
      genes = getEvolutionEntriesByCategory(category, 10);
    }

    if (genes.length === 0) {
      logger.debug({ category }, 'No approved genes found for category');
      return undefined;
    }

    return this.findBestMatchingGene(genes, signals);
  }

  /**
   * 基于信号匹配度找到最佳的 Gene
   */
  private findBestMatchingGene(
    genes: EvolutionEntry[],
    signals: Signal[],
  ): EvolutionEntry {
    const scoredGenes = genes.map((gene) => {
      const score = this.calculateGeneSignalMatchScore(gene, signals);
      logger.debug(
        {
          geneId: gene.id,
          abilityName: gene.abilityName,
          score,
          signalsMatch: gene.signalsMatch,
        },
        'Gene signal match score (GEP)',
      );
      return { gene, score };
    });

    scoredGenes.sort((a, b) => b.score - a.score);
    return scoredGenes[0].gene;
  }

  /**
   * 计算 Gene 与信号的匹配分数
   */
  private calculateGeneSignalMatchScore(
    gene: EvolutionEntry,
    signals: Signal[],
  ): number {
    let score = 0;
    const geneSignals = gene.signalsMatch || [];

    const signalWeights: Record<string, number> = {};
    for (const signal of signals) {
      signalWeights[signal.type] = signal.confidence;
    }

    for (const geneSignal of geneSignals) {
      if (signalWeights[geneSignal]) {
        score += signalWeights[geneSignal];
      }
    }

    const geneCategory = gene.category;
    const recommendedCategory = getRecommendedGeneCategory(signals);
    if (geneCategory === recommendedCategory) {
      score += 0.2;
    }

    const avgFeedback = this.calculateAverageRating(gene.feedback);
    score += avgFeedback / 10;

    return Math.min(score, 1.0);
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
    logger.info({ id, reviewerId, approved }, 'Reviewing experience (GEP)');

    const entry = getEvolutionEntry(id);
    if (!entry) {
      logger.warn({ id }, 'Evolution entry not found');
      return;
    }

    updateEvolutionStatus(
      id,
      approved ? 'approved' : 'rejected',
      reviewerId,
      feedback,
    );

    logAudit({
      agentFolder: entry.sourceAgentId,
      action: 'review',
      entityType: 'gene',
      entityId: String(id),
      details: { reviewerId, approved, feedback },
    });

    // 如果批准，更新 GDI 评分
    if (approved) {
      this.updateGeneGDIScore(id);
    }

    logger.info(
      { id, approved, reviewerId },
      `Experience ${approved ? 'approved' : 'rejected'} (GEP)`,
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
  async autoReviewPendingEntries(): Promise<void> {
    const db = getDatabase();
    const pendingEntries = db
      .prepare('SELECT * FROM evolution_log WHERE status = ?')
      .all('pending') as any[];

    logger.info(
      { count: pendingEntries.length },
      'Starting auto-review of pending entries (GEP)',
    );

    for (const entry of pendingEntries) {
      await this.autoReviewPendingEntry(entry);
    }
  }

  /**
   * 自动审核单个待审核条目
   */
  async autoReviewPendingEntry(entry: any): Promise<void> {
    const scores: Record<string, { score: number; comment: string }> = {};
    let totalScore = 0;

    for (const agent of REVIEW_AGENTS) {
      const review = await this.reviewByAgent(entry, agent);
      scores[agent.id] = review;
      totalScore += review.score * agent.weight;
    }

    const passed = totalScore >= 0.7;
    const finalStatus = passed ? 'approved' : 'rejected';

    updateEvolutionStatus(
      entry.id,
      finalStatus,
      'auto-reviewer',
      `自动审核完成，综合评分：${(totalScore * 100).toFixed(1)}分`,
    );

    // 如果批准，更新 GDI 评分
    if (passed) {
      const fullEntry = getEvolutionEntry(entry.id);
      if (fullEntry) {
        this.updateGeneGDIScore(entry.id);
      }
    }

    logger.info(
      {
        entryId: entry.id,
        abilityName: entry.ability_name,
        status: finalStatus,
        totalScore,
      },
      'Entry auto-reviewed (GEP)',
    );
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

  private async reviewByAgent(
    entry: any,
    agent: ReviewAgent,
  ): Promise<{ score: number; comment: string }> {
    let score = 0.5;
    let comment = '';

    switch (agent.expertise) {
      case 'safety':
        const safetyIssues = this.checkSafety(entry.content);
        if (safetyIssues.length === 0) {
          score = 0.9;
          comment = '无安全问题';
        } else {
          score = 0.3;
          comment = `发现安全问题：${safetyIssues.join(', ')}`;
        }
        break;

      case 'effectiveness':
        if (
          entry.content.length > 200 &&
          this.hasPracticalAdvice(entry.content)
        ) {
          score = 0.85;
          comment = '内容实用有效';
        } else {
          score = 0.4;
          comment = '内容可能不够实用';
        }
        break;

      case 'reusability':
        if (this.hasReusablePatterns(entry.content)) {
          score = 0.8;
          comment = '包含可复用的模式';
        } else {
          score = 0.5;
          comment = '通用性一般';
        }
        break;

      case 'clarity':
        if (this.isClearlyWritten(entry.content)) {
          score = 0.85;
          comment = '表达清晰易懂';
        } else {
          score = 0.45;
          comment = '表达可能需要改进';
        }
        break;

      case 'completeness':
        if (this.isContentComplete(entry.content, entry.description || '')) {
          score = 0.8;
          comment = '内容完整';
        } else {
          score = 0.5;
          comment = '内容可能不够完整';
        }
        break;
    }

    return { score, comment };
  }

  private checkSafety(content: string): string[] {
    const issues: string[] = [];
    const dangerousPatterns = [
      /rm\s+-rf/,
      /eval\s*\(/,
      /exec\s*\(/,
      /child_process/,
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        issues.push('包含潜在危险的命令');
      }
    }
    return issues;
  }

  private hasPracticalAdvice(content: string): boolean {
    const keywords = [
      '方法',
      '步骤',
      '如何',
      '技巧',
      '建议',
      '实践',
      'example',
      'how to',
      'steps',
    ];
    return keywords.some((kw) => content.toLowerCase().includes(kw));
  }

  private hasReusablePatterns(content: string): boolean {
    const keywords = [
      '模式',
      '通用',
      '模板',
      '框架',
      'structure',
      'pattern',
      'template',
      'framework',
    ];
    return keywords.some((kw) => content.toLowerCase().includes(kw));
  }

  private isClearlyWritten(content: string): boolean {
    return (
      content.includes('\n') ||
      content.includes('```') ||
      content.includes('1.') ||
      content.includes('- ')
    );
  }

  private isContentComplete(content: string, description: string): boolean {
    return content.length > 150 && description.length > 20;
  }
}

// 单例导出
export const evolutionManager = new EvolutionManager();
