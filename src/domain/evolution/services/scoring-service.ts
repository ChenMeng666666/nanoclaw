import { EVOLUTION_CONFIG } from '../../../config.js';
import type { EvolutionEntry, GDIScore } from '../../../types.js';

export interface PromotionDecision {
  shouldPromote: boolean;
  mode: 'cold_start' | 'standard';
  reasonCodes: string[];
}

export class EvolutionScoringService {
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

  resolveEcosystemStatus(
    gene: EvolutionEntry,
    gdiScore: GDIScore,
  ): 'promoted' | 'stale' | 'archived' {
    const daysSinceCreation = this.getDaysSinceCreation(gene.createdAt);
    const promotionThreshold = this.resolveGdiPromotionThreshold();
    const staleThreshold = Math.max(1, Math.min(10, promotionThreshold * 0.5));

    if (gdiScore.total >= promotionThreshold && daysSinceCreation < 30) {
      return 'promoted';
    }
    if (gdiScore.total >= staleThreshold && daysSinceCreation < 90) {
      return 'stale';
    }
    return 'archived';
  }

  shouldPromoteToCapsule(
    successCount: number,
    successStreak: number,
    confidence: number,
    outcomeStatus: string,
    existingCapsuleCount: number,
  ): PromotionDecision {
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

  private calculateIntrinsicQuality(gene: EvolutionEntry): number {
    let score = 0;
    if (gene.content.length > 200) score += 2;
    if (gene.content.length > 500) score += 2;
    if (gene.content.length > 1000) score += 2;
    if (gene.content.includes('```') || gene.content.includes('function'))
      score += 2;
    if (gene.description && gene.description.length > 50) score += 1;
    if (gene.tags && gene.tags.length > 0) score += 1;
    return Math.min(score, 10);
  }

  private calculateUsageMetrics(gene: EvolutionEntry): number {
    let score = 0;
    const avgFeedback = this.calculateAverageRating(gene.feedback);
    score += avgFeedback;
    if (gene.feedback && gene.feedback.length > 0) score += 1;
    if (gene.feedback && gene.feedback.length > 5) score += 2;
    if (gene.feedback && gene.feedback.length > 10) score += 3;
    return Math.min(score, 10);
  }

  private calculateSocialSignals(gene: EvolutionEntry): number {
    let score = 5;
    if (gene.feedback && Array.isArray(gene.feedback)) {
      const highRatings = gene.feedback.filter((f) => f?.rating >= 4).length;
      if (highRatings > 0) score += 1;
      if (highRatings > 3) score += 2;
      if (highRatings > 5) score += 3;
    }
    return Math.min(score, 10);
  }

  private calculateFreshness(gene: EvolutionEntry): number {
    const daysSinceCreation = this.getDaysSinceCreation(gene.createdAt);
    if (daysSinceCreation < 7) return 10;
    if (daysSinceCreation < 30) return 8;
    if (daysSinceCreation < 90) return 6;
    if (daysSinceCreation < 180) return 4;
    if (daysSinceCreation < 365) return 2;
    return 1;
  }

  private getDaysSinceCreation(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  private calculateAverageRating(
    feedback: Array<{ rating: number }> | undefined | null,
  ): number {
    if (!feedback || !Array.isArray(feedback) || feedback.length === 0)
      return 0;
    const sum = feedback.reduce((acc, f) => acc + (f?.rating || 0), 0);
    return sum / feedback.length;
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
}
