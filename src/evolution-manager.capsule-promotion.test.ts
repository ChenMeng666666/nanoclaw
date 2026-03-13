import { beforeEach, describe, expect, it } from 'vitest';

import { _initTestDatabase } from './db.js';
import {
  createCapsule as createCapsuleRecord,
  createEvolutionEntry,
  createValidationReport,
  getCapsulesByGeneId,
} from './db-agents.js';
import { evolutionManager } from './evolution-manager.js';

function seedGene(): number {
  return createEvolutionEntry({
    abilityName: 'capsule-promotion-gene',
    sourceAgentId: 'test-agent',
    content: 'capsule promotion test content',
    status: 'approved',
    category: 'repair',
    signalsMatch: ['recurring_error'],
  });
}

function seedCapsule(geneId: number, id: string): void {
  createCapsuleRecord({
    id,
    geneId,
    trigger: ['recurring_error'],
    summary: 'seed capsule',
    confidence: 0.9,
    blastRadius: { files: 1, lines: 20 },
    outcome: { status: 'success', score: 0.9 },
    envFingerprint: {
      platform: process.platform,
      arch: process.arch,
      runtime: `Node.js ${process.version}`,
    },
    successStreak: 1,
    approvedAt: new Date().toISOString(),
  });
}

function seedValidationReport(geneId: number, success: boolean): void {
  createValidationReport({
    geneId,
    commands: ['node --version'],
    success,
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
  });
}

describe('EvolutionManager capsule promotion', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('allows cold start capsule creation for first successful outcome', async () => {
    const geneId = seedGene();
    seedValidationReport(geneId, true);

    const capsuleId = await evolutionManager.createCapsule(
      geneId,
      ['recurring_error'],
      0.8,
      { files: 1, lines: 20 },
      { status: 'success', score: 0.85 },
    );

    expect(capsuleId).toBeTruthy();
    const capsules = getCapsulesByGeneId(geneId);
    expect(capsules).toHaveLength(1);
  });

  it('blocks cold start when outcome is not success', async () => {
    const geneId = seedGene();
    seedValidationReport(geneId, true);

    await expect(
      evolutionManager.createCapsule(
        geneId,
        ['recurring_error'],
        0.8,
        { files: 1, lines: 20 },
        { status: 'partial', score: 0.7 },
      ),
    ).rejects.toThrow('CAPSULE_PROMOTION_BLOCKED:OUTCOME_NOT_SUCCESS');
  });

  it('uses successful validation count instead of capsule count', async () => {
    const geneId = seedGene();
    seedValidationReport(geneId, true);
    seedCapsule(geneId, 'seed-1');
    seedCapsule(geneId, 'seed-2');
    seedCapsule(geneId, 'seed-3');

    await expect(
      evolutionManager.createCapsule(
        geneId,
        ['recurring_error'],
        0.95,
        { files: 1, lines: 20 },
        { status: 'success', score: 0.92 },
      ),
    ).rejects.toThrow('SUCCESS_COUNT_BELOW_THRESHOLD');
  });

  it('promotes in standard mode when thresholds are satisfied', async () => {
    const geneId = seedGene();
    seedValidationReport(geneId, true);
    seedValidationReport(geneId, true);
    seedValidationReport(geneId, true);
    seedCapsule(geneId, 'seed-1');
    seedCapsule(geneId, 'seed-2');
    seedCapsule(geneId, 'seed-3');

    const capsuleId = await evolutionManager.createCapsule(
      geneId,
      ['recurring_error'],
      0.95,
      { files: 1, lines: 20 },
      { status: 'success', score: 0.92 },
    );

    expect(capsuleId).toBeTruthy();
    expect(getCapsulesByGeneId(geneId)).toHaveLength(4);
  });
});
