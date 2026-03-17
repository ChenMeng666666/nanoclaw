import type { DuplicateCheckResult } from '../../../types/evolution.js';

import {
  cosineSimilarity,
  normalizeSimilarityThreshold,
} from './evolution-service-math.js';

export interface EvolutionDuplicateCandidateRow {
  content_embedding?: string | number[] | null;
  contentEmbedding?: string | number[] | null;
  source_agent_id?: string | null;
  sourceAgentId?: string | null;
  asset_id?: string | null;
}

export function detectDuplicateSignal(
  rows: EvolutionDuplicateCandidateRow[],
  currentEmbedding: number[],
  authorId: string,
  thresholdConfig: { sameAuthor: number; differentAuthor: number },
): DuplicateCheckResult {
  for (const row of rows) {
    const rawEmbedding = row.contentEmbedding ?? row.content_embedding;
    if (!rawEmbedding) {
      continue;
    }
    try {
      const existingEmbedding = Array.isArray(rawEmbedding)
        ? rawEmbedding
        : (JSON.parse(rawEmbedding) as unknown);
      if (!Array.isArray(existingEmbedding)) {
        continue;
      }
      const similarity = cosineSimilarity(currentEmbedding, existingEmbedding);
      const sourceAuthor = row.sourceAgentId ?? row.source_agent_id;
      const isSameAuthor = sourceAuthor === authorId;
      const threshold = normalizeSimilarityThreshold(
        isSameAuthor
          ? thresholdConfig.sameAuthor
          : thresholdConfig.differentAuthor,
      );
      if (similarity >= threshold) {
        return {
          isDuplicate: true,
          similarity,
          reason: isSameAuthor
            ? 'Same author, high content similarity'
            : 'Different author, very high content similarity',
          existingAssetId: row.asset_id ?? undefined,
        };
      }
    } catch {
      continue;
    }
  }
  return { isDuplicate: false, similarity: 0 };
}
