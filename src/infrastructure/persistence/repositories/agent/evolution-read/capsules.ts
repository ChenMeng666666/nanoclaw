import type { GEPCapsule } from '../../../../../types/gep.js';
import { safeJsonParse } from '../../../../../security.js';
import { getDb } from './shared.js';

type CapsuleRow = {
  id: string;
  gene_id: number;
  trigger: string;
  summary: string;
  confidence: number;
  blast_radius: string;
  outcome: string;
  env_fingerprint: string;
  success_streak: number;
  approved_at: string;
  created_at: string;
};

function mapCapsuleRow(row: CapsuleRow): GEPCapsule {
  return {
    gene_id: row.gene_id,
    trigger: safeJsonParse(row.trigger, []),
    summary: row.summary,
    confidence: row.confidence,
    blast_radius: safeJsonParse(row.blast_radius, { files: 0, lines: 0 }),
    outcome: safeJsonParse(row.outcome, { status: 'failed', score: 0 }),
    env_fingerprint: safeJsonParse(row.env_fingerprint, {
      platform: '',
      arch: '',
    }),
    success_streak: row.success_streak,
    approved_at: row.approved_at,
    type: 'Capsule' as const,
    gene: {} as any,
    schema_version: '1.0',
    asset_id: row.id,
  };
}

export function getCapsuleById(id: string): GEPCapsule | undefined {
  const row = getDb().prepare('SELECT * FROM capsules WHERE id = ?').get(id) as
    | CapsuleRow
    | undefined;
  if (!row) {
    return undefined;
  }
  return mapCapsuleRow(row);
}

export function getCapsulesByGeneId(geneId: number): GEPCapsule[] {
  const rows = getDb()
    .prepare('SELECT * FROM capsules WHERE gene_id = ? ORDER BY created_at ASC')
    .all(geneId) as CapsuleRow[];
  return rows.map(mapCapsuleRow);
}
