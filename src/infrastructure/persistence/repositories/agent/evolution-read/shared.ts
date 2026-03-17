import type { EvolutionEntry } from '../../../../../types/evolution.js';
import { safeJsonParse } from '../../../../../security.js';
import { getDatabase as getPersistenceDatabase } from '../../../sqlite/transaction-manager.js';

export function getDb(): any {
  return getPersistenceDatabase();
}

export type EvolutionLogRow = {
  id: number;
  ability_name: string;
  description: string | null;
  source_agent_id: string | null;
  content: string;
  content_embedding: string | null;
  tags: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  feedback: string | null;
  gdi_score: string | null;
  category: string | null;
  signals_match: string | null;
  strategy: string | null;
  constraints: string | null;
  validation: string | null;
  created_at: string;
  chain_id?: string | null;
  ecosystem_status?: string;
  preconditions?: string | null;
  validation_commands?: string | null;
  summary?: string | null;
};

export function mapEvolutionLogRow(row: EvolutionLogRow): EvolutionEntry {
  return {
    id: row.id,
    abilityName: row.ability_name,
    description: row.description || '',
    sourceAgentId: row.source_agent_id || '',
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status as 'pending' | 'reviewing' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    feedback: safeJsonParse(row.feedback, []),
    gdi_score: safeJsonParse(row.gdi_score, undefined),
    gdiScore: safeJsonParse(row.gdi_score, undefined),
    category:
      (row.category as 'repair' | 'optimize' | 'innovate' | 'learn') || 'learn',
    signalsMatch: safeJsonParse(row.signals_match, []),
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
    chain_id: row.chain_id || undefined,
    ecosystem_status: row.ecosystem_status as
      | 'promoted'
      | 'stale'
      | 'archived'
      | undefined,
    preconditions: [],
    validation_commands: [],
    summary: '',
  };
}
