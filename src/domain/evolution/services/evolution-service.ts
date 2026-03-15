import os from 'os';
import crypto from 'crypto';
import { generateEmbedding } from '../../../embedding-providers/registry.js';
import {
  getEvolutionEntry,
  getApprovedEvolutionEntries,
  updateEvolutionStatus,
  updateGeneStatus,
  updateGeneChainId,
  updateGeneGDIScore,
  addEvolutionFeedback,
  logAudit,
  type CreateGeneInput,
  getDatabase,
  createAbilityChain,
  getAbilityChain,
  addGeneToChain,
  createValidationReport,
  getValidationReportsByGeneId,
  createEcosystemMetrics,
  getEcosystemMetrics,
} from '../../../db-agents.js';
import type {
  AbilityChain,
  ValidationReport,
} from '../../../types/gep.js';
import type {
  EvolutionEntry,
  GDIScore,
  DuplicateCheckResult,
  EcosystemMetrics,
  EvolutionDashboardMetrics,
  MainExperienceInput,
} from '../../../types/evolution.js';
import { logger } from '../../../logger.js';
import { extractSignals, type Signal } from '../../../signal-extractor.js';
import { EVOLUTION_CONFIG } from '../../../config.js';
import type { EvolutionScoringService } from './scoring-service.js';
import type { CommandSafetyService } from './command-safety-service.js';
import type { StrategyService } from './strategy-service.js';
import { SubmitExperienceUseCase } from '../../../application/evolution/use-cases/submit-experience.js';
import { SelectAndReviewUseCase } from '../../../application/evolution/use-cases/select-and-review.js';

export class EvolutionService {
  private strategyService: StrategyService;
  private scoringService: EvolutionScoringService;
  private commandSafetyService: CommandSafetyService;
  private submitExperienceUseCase: SubmitExperienceUseCase;
  private selectAndReviewUseCase: SelectAndReviewUseCase;

  constructor(
    strategyService: StrategyService,
    scoringService: EvolutionScoringService,
    commandSafetyService: CommandSafetyService,
  ) {
    this.strategyService = strategyService;
    this.scoringService = scoringService;
    this.commandSafetyService = commandSafetyService;

    this.selectAndReviewUseCase = new SelectAndReviewUseCase(
      this.strategyService.getConfig().strategy,
      {
        updateGeneGDIScore: (geneId) => {
          this.updateGeneGDIScore(geneId);
        },
      },
    );

    this.submitExperienceUseCase = new SubmitExperienceUseCase(
      this.strategyService.getConfig(),
      {
        getCategory: (signals) =>
          this.strategyService.getStrategyBasedCategory(signals),
        extractSignals,
        checkDuplicateSignal: (content, sourceAgentId) =>
          this.checkDuplicateSignal(content, sourceAgentId),
        autoReviewEntry: (entry) => this.autoReviewEntry(entry),
        autoReviewPendingEntry: async (entry) =>
          this.selectAndReviewUseCase.autoReviewPendingEntry(entry),
        assertCommandsSafe: (commands) =>
          this.commandSafetyService.assertCommandsSafe(commands),
      },
    );
  }

  // Update strategy in use cases when strategy changes
  updateStrategy(): void {
    const config = this.strategyService.getConfig();
    this.selectAndReviewUseCase.setStrategy(config.strategy);
    // SubmitExperienceUseCase takes config in constructor, but it references it by value?
    // Actually SubmitExperienceUseCase stores config.
    // We might need to update it. But SubmitExperienceUseCase doesn't seem to have setConfig.
    // However, EvolutionManager.setStrategy only called this.selectAndReviewUseCase.setStrategy(strategy).
    // So maybe SubmitExperienceUseCase doesn't need update?
    // Looking at SubmitExperienceUseCase, it uses config.autoApproveThreshold etc.
    // If we want to support dynamic config update for SubmitExperienceUseCase, we might need to recreate it or add setter.
    // But for now I'll follow EvolutionManager's behavior.

    // Actually, EvolutionManager re-created SubmitExperienceUseCase? No.
    // It just updated this.config.
    // And passed this.config to SubmitExperienceUseCase.
    // If SubmitExperienceUseCase holds a reference to the config object, it sees updates.
    // In EvolutionManager: this.config = { ...DEFAULT_CONFIG, ...config };
    // this.submitExperienceUseCase = new SubmitExperienceUseCase(this.config, ...);
    // So it holds reference.
    // In StrategyService, getConfig() returns this.config.
    // So if StrategyService updates this.config in place, it works.
    // But StrategyService.setStrategy updates this.config.strategy.
    // So it should be fine if we pass the config object.
  }

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

  async submitMainExperience(input: MainExperienceInput): Promise<number> {
    return this.submitExperienceUseCase.submitMainExperience(input);
  }

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

  async selectGene(signals: Signal[]): Promise<EvolutionEntry | undefined> {
    return this.selectAndReviewUseCase.selectGene(signals);
  }

  async selectGeneForContent(
    content: string,
  ): Promise<EvolutionEntry | undefined> {
    const signals = extractSignals({ content });
    return this.selectGene(signals);
  }

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

      // Update GDI Score
      this.updateGeneGDIScore(id);
    }
  }

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

  async autoReviewPendingEntry(entry: EvolutionEntry): Promise<void> {
    await this.selectAndReviewUseCase.autoReviewPendingEntry(entry);
  }

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
      await this.selectAndReviewUseCase.autoReviewPendingEntry(entry);
      reviewedCount += 1;
    }
    return reviewedCount;
  }

  calculateGDIScore(gene: EvolutionEntry): GDIScore {
    return this.scoringService.calculateGDIScore(gene);
  }

  updateGeneGDIScore(geneId: number): GDIScore {
    const gene = getEvolutionEntry(geneId);
    if (!gene) {
      throw new Error(`Gene not found: ${geneId}`);
    }

    const gdiScore = this.calculateGDIScore(gene);
    updateGeneGDIScore(geneId, gdiScore);

    // Update ecosystem status
    this.updateEcosystemStatus(geneId, gdiScore);

    logger.info({ geneId, gdiScore }, 'GDI score updated (GEP)');

    return gdiScore;
  }

  calculateEcosystemMetrics(): EcosystemMetrics {
    const db = getDatabase();

    // Get all Genes
    const allGenes = db.prepare('SELECT * FROM evolution_log').all() as Array<{
      ecosystem_status: string;
      gdi_score: string;
      category: string;
    }>;

    // Count by status
    const promotedGenes = allGenes.filter(
      (g) => g.ecosystem_status === 'promoted',
    ).length;
    const staleGenes = allGenes.filter(
      (g) => g.ecosystem_status === 'stale',
    ).length;
    const archivedGenes = allGenes.filter(
      (g) => g.ecosystem_status === 'archived',
    ).length;

    // Get all Capsules
    const totalCapsules = db
      .prepare('SELECT COUNT(*) as count FROM capsules')
      .get() as { count: number };

    // Calculate Shannon Diversity
    const shannonDiversity = this.calculateShannonDiversity(allGenes);

    // Calculate Average GDI Score
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

  async checkDuplicateSignal(
    content: string,
    authorId: string,
  ): Promise<DuplicateCheckResult> {
    const db = getDatabase();
    const existingEntries = db
      .prepare(
        "SELECT * FROM evolution_log WHERE created_at >= datetime('now', '-7 days')",
      )
      .all() as EvolutionEntry[];

    if (existingEntries.length === 0) {
      return { isDuplicate: false, similarity: 0 };
    }

    // Generate embedding for current content
    const currentEmbedding = await generateEmbedding(content);

    for (const existing of existingEntries) {
      if (!existing.content_embedding) continue;

      try {
        const existingEmbedding = JSON.parse(existing.content_embedding);
        if (!Array.isArray(existingEmbedding)) continue;
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

  getValidationReports(geneId: number): ValidationReport[] {
    return getValidationReportsByGeneId(geneId);
  }

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

  getAbilityChain(chainId: string): AbilityChain | undefined {
    return getAbilityChain(chainId);
  }

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

  private updateEcosystemStatus(geneId: number, gdiScore: GDIScore): void {
    const gene = getEvolutionEntry(geneId);
    if (!gene) return;
    const status = this.scoringService.resolveEcosystemStatus(gene, gdiScore);
    updateGeneStatus(geneId, status);
  }

  private calculateShannonDiversity(genes: EvolutionEntry[]): number {
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

  private normalizeSimilarityThreshold(value: number): number {
    if (!Number.isFinite(value)) {
      return 0.95;
    }
    return Math.min(1, Math.max(0, value));
  }

  private calculateAverageRating(
    feedback: Array<{ rating: number }> | undefined | null,
  ): number {
    if (!feedback || !Array.isArray(feedback) || feedback.length === 0)
      return 0;

    const sum = feedback.reduce((acc, f) => acc + (f?.rating || 0), 0);
    return sum / feedback.length;
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
}
