import crypto from 'crypto';

import { safeJsonParse } from '../../../../../security.js';
import { getEvolutionEntry } from '../evolution-read-repository.js';
import { getDb } from './shared.js';

export interface CreateGeneInput {
  abilityName: string;
  description?: string;
  sourceAgentId: string;
  content: string;
  contentEmbedding?: number[];
  tags?: string[];
  status?: 'pending' | 'reviewing' | 'approved' | 'rejected';
  category?: 'repair' | 'optimize' | 'innovate' | 'learn';
  signalsMatch?: string[];
  strategy?: string[];
  constraints?: {
    maxFiles?: number;
    forbiddenPaths?: string[];
    applicableScenarios?: string[];
  };
  validation?: string[];
}

export function createEvolutionEntry(entry: CreateGeneInput): number {
  const contentHash = crypto
    .createHash('sha256')
    .update(entry.content)
    .digest('hex');
  const result = getDb()
    .prepare(
      `
    INSERT INTO evolution_log (
      ability_name, description, source_agent_id, content, content_embedding, content_hash, tags, status,
      category, signals_match, strategy, constraints, validation, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      entry.abilityName,
      entry.description || null,
      entry.sourceAgentId,
      entry.content,
      entry.contentEmbedding ? JSON.stringify(entry.contentEmbedding) : null,
      contentHash,
      entry.tags ? JSON.stringify(entry.tags) : null,
      entry.status || 'pending',
      entry.category || 'learn',
      entry.signalsMatch ? JSON.stringify(entry.signalsMatch) : '[]',
      entry.strategy ? JSON.stringify(entry.strategy) : '[]',
      entry.constraints ? JSON.stringify(entry.constraints) : '{}',
      entry.validation ? JSON.stringify(entry.validation) : '[]',
      new Date().toISOString(),
    );
  return result.lastInsertRowid as number;
}

export function updateEvolutionStatus(
  id: number,
  status: 'pending' | 'reviewing' | 'approved' | 'rejected',
  reviewedBy?: string,
  feedback?: string,
): void {
  const fields: string[] = ['status = ?'];
  const values: unknown[] = [status];

  if (reviewedBy) {
    fields.push('reviewed_by = ?', 'reviewed_at = ?');
    values.push(reviewedBy, new Date().toISOString());
  }
  if (feedback) {
    const row = getDb()
      .prepare('SELECT feedback FROM evolution_log WHERE id = ?')
      .get(id) as { feedback: string | null } | undefined;
    const existingFeedback = safeJsonParse(row?.feedback, []) as Array<{
      agentId: string;
      comment: string;
      rating: number;
      usedAt?: string;
    }>;
    existingFeedback.push({
      agentId: reviewedBy || 'system',
      comment: feedback,
      rating: status === 'approved' ? 5 : 1,
      usedAt: new Date().toISOString(),
    });
    fields.push('feedback = ?');
    values.push(JSON.stringify(existingFeedback));
  }

  values.push(id);
  getDb()
    .prepare(`UPDATE evolution_log SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);
}

export function addEvolutionFeedback(
  id: number,
  agentId: string,
  comment: string,
  rating: number,
): void {
  const entry = getEvolutionEntry(id);
  if (!entry) return;

  const feedback = entry.feedback || [];
  feedback.push({
    agentId,
    comment,
    rating,
    usedAt: new Date().toISOString(),
  });

  getDb()
    .prepare(`UPDATE evolution_log SET feedback = ? WHERE id = ?`)
    .run(JSON.stringify(feedback), id);
}

export function updateGeneChainId(id: number, chainId: string): void {
  getDb()
    .prepare('UPDATE evolution_log SET chain_id = ? WHERE id = ?')
    .run(chainId, id);
}

export function updateGeneStatus(
  id: number,
  status: 'promoted' | 'stale' | 'archived',
): void {
  getDb()
    .prepare('UPDATE evolution_log SET ecosystem_status = ? WHERE id = ?')
    .run(status, id);
}

export function updateGeneGDIScore(id: number, gdiScore: unknown): void {
  getDb()
    .prepare('UPDATE evolution_log SET gdi_score = ? WHERE id = ?')
    .run(JSON.stringify(gdiScore), id);
}
