import { getDb } from './shared.js';

export function createCapsule(capsule: {
  id: string;
  geneId: number;
  trigger: string[];
  summary: string;
  confidence: number;
  blastRadius: { files: number; lines: number };
  outcome: { status: 'success' | 'partial' | 'failed'; score: number };
  envFingerprint: {
    platform: string;
    arch: string;
    runtime?: string;
    dependencies?: string[];
  };
  successStreak: number;
  approvedAt: string;
}): void {
  getDb()
    .prepare(
      `
    INSERT INTO capsules (
      id, gene_id, trigger, summary, confidence, blast_radius, outcome, env_fingerprint,
      success_streak, approved_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      capsule.id,
      capsule.geneId,
      JSON.stringify(capsule.trigger),
      capsule.summary,
      capsule.confidence,
      JSON.stringify(capsule.blastRadius),
      JSON.stringify(capsule.outcome),
      JSON.stringify(capsule.envFingerprint),
      capsule.successStreak,
      capsule.approvedAt,
      new Date().toISOString(),
    );
}

export function updateCapsuleSuccessStreak(
  id: string,
  successStreak: number,
): void {
  getDb()
    .prepare('UPDATE capsules SET success_streak = ? WHERE id = ?')
    .run(successStreak, id);
}
