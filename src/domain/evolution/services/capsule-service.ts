import crypto from 'crypto';
import { logger } from '../../../logger.js';
import {
  createCapsule,
  getCapsuleById,
  getCapsulesByGeneId,
  getEvolutionEntry,
  updateGeneStatus,
  addCapsuleToChain,
  getValidationReportsByGeneId,
} from '../../../db-agents.js';
import { generateAssetId } from '../../../types.js';
import { EvolutionScoringService } from './scoring-service.js';

export class CapsuleService {
  private scoringService: EvolutionScoringService;

  constructor(scoringService: EvolutionScoringService) {
    this.scoringService = scoringService;
  }

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

    // Check promotion conditions
    const capsules = getCapsulesByGeneId(geneId);
    const successStreak = this.calculateSuccessStreak(capsules, outcome.status);

    const successfulValidationCount =
      this.calculateSuccessfulValidationCount(geneId);

    const promotionDecision = this.scoringService.shouldPromoteToCapsule(
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

    // Generate capsule asset_id
    const approvedAt = new Date().toISOString();
    const capsuleContent = JSON.stringify({
      geneId,
      trigger,
      outcome,
      approvedAt,
      nonce: crypto.randomBytes(8).toString('hex'),
    });
    const capsuleId = generateAssetId(capsuleContent);

    // Create Capsule
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

    // Update Gene ecosystem status
    updateGeneStatus(geneId, 'promoted');

    // If Gene has chain_id, add capsule to ability chain
    if (gene.chain_id) {
      addCapsuleToChain(gene.chain_id, capsuleId);
    }

    logger.info(
      { capsuleId, geneId, successStreak, confidence },
      'Capsule created successfully (GEP)',
    );

    return capsuleId;
  }

  getCapsule(capsuleId: string): any {
    return getCapsuleById(capsuleId);
  }

  getCapsulesForGene(geneId: number): any[] {
    return getCapsulesByGeneId(geneId);
  }

  private calculateSuccessStreak(capsules: any[], newOutcome: string): number {
    let streak = 0;

    // Check from newest (reverse order)
    for (let i = capsules.length - 1; i >= 0; i--) {
      const outcome = capsules[i].outcome;
      if (outcome?.status === 'success') {
        streak++;
      } else {
        break;
      }
    }

    // Add new outcome
    if (newOutcome === 'success') {
      streak++;
    }

    return streak;
  }

  private calculateSuccessfulValidationCount(geneId: number): number {
    const reports = getValidationReportsByGeneId(geneId);
    return reports.filter((report) => report.success).length;
  }
}
