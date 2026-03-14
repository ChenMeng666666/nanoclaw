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
import {
  CreateGeneInput,
  getCapsuleById,
  getCapsulesByGeneId,
  getAbilityChain,
  getValidationReportsByGeneId,
} from './db-agents.js';
import {
  EvolutionEntry,
  MainExperienceInput,
  GDIScore,
  DuplicateCheckResult,
  EcosystemMetrics,
  EvolutionStrategy,
  StrategyConfig,
  ReviewConfig,
  EvolutionDashboardMetrics,
} from './types.js';
import { EVOLUTION_CONFIG } from './config.js';
import { EvolutionScoringService } from './domain/evolution/services/scoring-service.js';
import { CommandSafetyService } from './domain/evolution/services/command-safety-service.js';
import { StrategyService } from './domain/evolution/services/strategy-service.js';
import { CapsuleService } from './domain/evolution/services/capsule-service.js';
import { EvolutionService } from './domain/evolution/services/evolution-service.js';
import { Signal } from './signal-extractor.js';

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
  private strategyService: StrategyService;
  private scoringService: EvolutionScoringService;
  private commandSafetyService: CommandSafetyService;
  private capsuleService: CapsuleService;
  private evolutionService: EvolutionService;

  constructor(config: Partial<ReviewConfig> = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    this.strategyService = new StrategyService(finalConfig);
    this.scoringService = new EvolutionScoringService();
    this.commandSafetyService = new CommandSafetyService();
    this.capsuleService = new CapsuleService(this.scoringService);
    this.evolutionService = new EvolutionService(
      this.strategyService,
      this.scoringService,
      this.commandSafetyService,
    );
  }

  /**
   * 更新进化策略
   */
  setStrategy(strategy: EvolutionStrategy): void {
    this.strategyService.setStrategy(strategy);
    this.evolutionService.updateStrategy();
  }

  /**
   * 获取当前策略配置
   */
  getStrategyConfig(): StrategyConfig {
    return this.strategyService.getStrategyConfig();
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
    return this.evolutionService.submitExperience(
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
    return this.evolutionService.submitGene(input);
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
    return this.capsuleService.createCapsule(
      geneId,
      trigger,
      confidence,
      blastRadius,
      outcome,
    );
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
    return this.evolutionService.calculateGDIScore(gene);
  }

  /**
   * 更新 Gene 的 GDI 评分
   */
  updateGeneGDIScore(geneId: number): GDIScore {
    return this.evolutionService.updateGeneGDIScore(geneId);
  }

  // ===== 生态系统状态管理 =====

  /**
   * 计算生态系统指标
   */
  calculateEcosystemMetrics(): EcosystemMetrics {
    return this.evolutionService.calculateEcosystemMetrics();
  }

  /**
   * 保存生态系统指标快照
   */
  saveEcosystemMetrics(): void {
    this.evolutionService.saveEcosystemMetrics();
  }

  getDashboardMetrics(timelineLimit: number = 30): EvolutionDashboardMetrics {
    return this.evolutionService.getDashboardMetrics(timelineLimit);
  }

  // ===== 信号去重机制 =====

  /**
   * 检查信号是否重复
   */
  async checkDuplicateSignal(
    content: string,
    authorId: string,
  ): Promise<DuplicateCheckResult> {
    return this.evolutionService.checkDuplicateSignal(content, authorId);
  }

  // ===== 验证命令安全机制 =====

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
    return this.evolutionService.createValidationReport(
      geneId,
      commands,
      success,
      testResults,
      error,
    );
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
    return this.evolutionService.createAbilityChain(description);
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
    return this.evolutionService.linkGeneToChain(geneId, chainId);
  }

  // ===== 向后兼容的方法 =====

  /**
   * 主项目提交经验到进化库
   */
  async submitMainExperience(input: MainExperienceInput): Promise<number> {
    return this.evolutionService.submitMainExperience(input);
  }

  /**
   * 根据信号选择合适的 Gene
   */
  async selectGene(signals: Signal[]): Promise<EvolutionEntry | undefined> {
    return this.evolutionService.selectGene(signals);
  }

  /**
   * 根据内容自动选择 Gene
   */
  async selectGeneForContent(
    content: string,
  ): Promise<EvolutionEntry | undefined> {
    return this.evolutionService.selectGeneForContent(content);
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
    await this.evolutionService.reviewExperience(
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
    return this.evolutionService.queryExperience(query, tags, limit);
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
    await this.evolutionService.submitFeedback(id, agentId, comment, rating);
  }

  /**
   * 标记经验为需要再审核
   */
  async markForReReview(id: number, reason: string): Promise<void> {
    await this.evolutionService.markForReReview(id, reason);
  }

  /**
   * 自动审核所有 pending 条目
   */
  async autoReviewPendingEntries(): Promise<number> {
    return this.evolutionService.autoReviewPendingEntries();
  }

  /**
   * 自动审核单个待审核条目
   */
  async autoReviewPendingEntry(entry: EvolutionEntry): Promise<void> {
    return this.evolutionService.autoReviewPendingEntry(entry);
  }
}

// 单例导出
export const evolutionManager = new EvolutionManager();
