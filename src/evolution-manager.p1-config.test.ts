import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./embedding-providers/registry.js', () => ({
  generateEmbedding: vi.fn(async () => [0.93, 0.367]),
}));

import { _initTestDatabase } from './db.js';
import {
  createEvolutionEntry,
  getEvolutionEntriesByStatus,
} from './db-agents.js';
import { evolutionManager } from './evolution-manager.js';
import { EVOLUTION_CONFIG } from './config.js';

describe('EvolutionManager P1 config consumption', () => {
  const originalDuplicateThreshold = { ...EVOLUTION_CONFIG.duplicateThreshold };
  const originalGdiPromotionThreshold = EVOLUTION_CONFIG.gdiPromotionThreshold;

  beforeEach(() => {
    _initTestDatabase();
  });

  afterEach(() => {
    EVOLUTION_CONFIG.duplicateThreshold.sameAuthor =
      originalDuplicateThreshold.sameAuthor;
    EVOLUTION_CONFIG.duplicateThreshold.differentAuthor =
      originalDuplicateThreshold.differentAuthor;
    EVOLUTION_CONFIG.gdiPromotionThreshold = originalGdiPromotionThreshold;
  });

  it('consumes duplicate threshold from config for same and different authors', async () => {
    EVOLUTION_CONFIG.duplicateThreshold.sameAuthor = 0.92;
    EVOLUTION_CONFIG.duplicateThreshold.differentAuthor = 0.95;
    createEvolutionEntry({
      abilityName: 'duplicate-threshold-check',
      sourceAgentId: 'author-a',
      content: 'seed content',
      contentEmbedding: [1, 0],
      status: 'approved',
    });

    const sameAuthorResult = await evolutionManager.checkDuplicateSignal(
      'similar content',
      'author-a',
    );
    const differentAuthorResult = await evolutionManager.checkDuplicateSignal(
      'similar content',
      'author-b',
    );

    expect(sameAuthorResult.isDuplicate).toBe(true);
    expect(differentAuthorResult.isDuplicate).toBe(false);
  });

  it('uses gdi promotion threshold config when updating ecosystem status', () => {
    EVOLUTION_CONFIG.gdiPromotionThreshold = 25;
    const geneId = createEvolutionEntry({
      abilityName: 'gdi-threshold-check',
      sourceAgentId: 'agent-a',
      content: 'short',
      status: 'approved',
      category: 'learn',
    });

    const promotedBefore = getEvolutionEntriesByStatus('promoted', 10);
    expect(promotedBefore.some((item) => item.id === geneId)).toBe(false);

    evolutionManager.updateGeneGDIScore(geneId);

    const promotedAfter = getEvolutionEntriesByStatus('promoted', 10);
    expect(promotedAfter.some((item) => item.id === geneId)).toBe(true);
  });
});
