import {
  EvolutionEntry,
  EvolutionStrategy,
  StrategyConfig,
  STRATEGY_CONFIGS,
} from '../../../types.js';
import {
  getEvolutionEntriesByStatus,
  getEvolutionEntriesByCategory,
  getEvolutionEntry,
  updateEvolutionStatus,
  logAudit,
} from '../../../db-agents.js';
import {
  getRecommendedGeneCategory,
  Signal,
} from '../../../signal-extractor.js';
import { logger } from '../../../logger.js';

export interface ReviewAgent {
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

export const REVIEW_AGENTS: ReviewAgent[] = [
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

export interface SelectAndReviewDeps {
  updateGeneGDIScore: (geneId: number) => void;
}

export class SelectAndReviewUseCase {
  private strategyConfig: StrategyConfig;

  constructor(
    strategy: EvolutionStrategy,
    private readonly deps: SelectAndReviewDeps,
  ) {
    this.strategyConfig = STRATEGY_CONFIGS[strategy];
  }

  setStrategy(strategy: EvolutionStrategy): void {
    this.strategyConfig = STRATEGY_CONFIGS[strategy];
  }

  selectGene(signals: Signal[]): EvolutionEntry | undefined {
    if (signals.length === 0) {
      logger.debug('No signals provided, returning undefined');
      return undefined;
    }

    const category = this.getStrategyBasedCategory(signals);
    logger.debug(
      { category, signalCount: signals.length },
      'Selecting Gene based on signals (GEP)',
    );

    let genes = getEvolutionEntriesByStatus('promoted', 10);
    if (genes.length === 0) {
      genes = getEvolutionEntriesByStatus('stale', 10);
    }
    if (genes.length === 0) {
      genes = getEvolutionEntriesByCategory(category, 10);
    }
    if (genes.length === 0) {
      logger.debug({ category }, 'No approved genes found for category');
      return undefined;
    }

    return this.findBestMatchingGene(genes, signals);
  }

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

    if (approved) {
      this.deps.updateGeneGDIScore(id);
    }

    logger.info(
      { id, approved, reviewerId },
      `Experience ${approved ? 'approved' : 'rejected'} (GEP)`,
    );
  }

  async autoReviewPendingEntry(entry: EvolutionEntry): Promise<void> {
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

    if (passed) {
      const fullEntry = getEvolutionEntry(entry.id);
      if (fullEntry) {
        this.deps.updateGeneGDIScore(entry.id);
      }
    }

    logger.info(
      {
        entryId: entry.id,
        abilityName: entry.abilityName,
        status: finalStatus,
        totalScore,
      },
      'Entry auto-reviewed (GEP)',
    );
  }

  private getStrategyBasedCategory(
    signals: Signal[],
  ): 'repair' | 'optimize' | 'innovate' | 'learn' {
    if (this.strategyConfig.prioritizeRepair) {
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

  private async reviewByAgent(
    entry: EvolutionEntry,
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

  private calculateAverageRating(
    feedback: Array<{ rating: number }> | undefined | null,
  ): number {
    if (!feedback || !Array.isArray(feedback) || feedback.length === 0)
      return 0;
    const sum = feedback.reduce((acc, f) => acc + (f?.rating || 0), 0);
    return sum / feedback.length;
  }
}
