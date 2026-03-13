import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./embedding-providers/registry.js', () => ({
  generateEmbedding: vi.fn(async (text: string) => {
    const normalized = text.toLowerCase();
    if (normalized.includes('alpha')) {
      return [1, 0, 0];
    }
    if (normalized.includes('beta')) {
      return [0, 1, 0];
    }
    if (normalized.includes('gamma')) {
      return [0, 0, 1];
    }
    return [0.3, 0.3, 0.3];
  }),
}));

import { _initTestDatabase } from './db.js';
import {
  createAgent,
  createMemory,
  getDatabase,
  getMemories,
} from './db-agents.js';
import { MemoryManager } from './memory-manager.js';
import { MEMORY_CONFIG } from './config.js';
import { BM25Index } from './hybrid-search.js';

describe('memory test matrix', () => {
  beforeEach(() => {
    _initTestDatabase();
    createAgent({
      id: 'agent-memory-matrix',
      name: 'Agent Memory Matrix',
      folder: 'agent-memory-matrix',
      credentials: {
        anthropicModel: 'claude-sonnet-4-6',
      },
    });
  });

  it('migrates L1 and L2 memories by configured thresholds', async () => {
    const now = new Date().toISOString();
    createMemory({
      id: 'm-l1',
      agentFolder: 'agent-memory-matrix',
      userJid: 'u-matrix',
      scope: 'user',
      level: 'L1',
      content: 'alpha migration candidate',
      embedding: [1, 0, 0],
      importance: 0.5,
      sourceType: 'direct',
      createdAt: now,
      updatedAt: now,
    });
    createMemory({
      id: 'm-l2',
      agentFolder: 'agent-memory-matrix',
      userJid: 'u-matrix',
      scope: 'user',
      level: 'L2',
      content: 'beta consolidation candidate',
      embedding: [0, 1, 0],
      importance: MEMORY_CONFIG.migration.l2ToL3MinImportance + 0.05,
      sourceType: 'direct',
      createdAt: now,
      updatedAt: now,
    });

    const staleTime = new Date(
      Date.now() -
        (MEMORY_CONFIG.migration.l1ToL2MinIdleDays + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    getDatabase()
      .prepare(
        'UPDATE memories SET access_count = ?, last_accessed_at = ? WHERE id = ?',
      )
      .run(MEMORY_CONFIG.migration.l1ToL2MinAccessCount, staleTime, 'm-l1');
    getDatabase()
      .prepare('UPDATE memories SET last_accessed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), 'm-l2');

    const manager = new MemoryManager();
    const migrated = await manager.migrateMemories();

    expect(migrated).toBeGreaterThanOrEqual(2);
    const l2Memories = getMemories('agent-memory-matrix', 'L2', 'u-matrix');
    const l3Memories = getMemories('agent-memory-matrix', 'L3', 'u-matrix');
    expect(l2Memories.some((m) => m.id === 'm-l1')).toBe(true);
    expect(l3Memories.some((m) => m.id === 'm-l2')).toBe(true);
  });

  it('retrieves memories with scope and session filters', async () => {
    const now = new Date().toISOString();
    createMemory({
      id: 'm-session-a',
      agentFolder: 'agent-memory-matrix',
      userJid: 'u-matrix',
      sessionId: 'session-a',
      scope: 'session',
      level: 'L2',
      content: 'alpha session memory',
      embedding: [1, 0, 0],
      importance: 0.7,
      sourceType: 'direct',
      createdAt: now,
      updatedAt: now,
    });
    createMemory({
      id: 'm-session-b',
      agentFolder: 'agent-memory-matrix',
      userJid: 'u-matrix',
      sessionId: 'session-b',
      scope: 'session',
      level: 'L2',
      content: 'beta session memory',
      embedding: [0, 1, 0],
      importance: 0.7,
      sourceType: 'direct',
      createdAt: now,
      updatedAt: now,
    });

    const manager = new MemoryManager();
    const result = await manager.searchMemories(
      'agent-memory-matrix',
      'alpha',
      5,
      'u-matrix',
      {
        scope: 'session',
        sessionId: 'session-a',
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m-session-a');
  });

  it('deduplicates memory inserts and tracks access signal', async () => {
    const manager = new MemoryManager();
    await manager.addMemory(
      'agent-memory-matrix',
      'gamma duplicate memory',
      'L2',
      'u-matrix',
    );
    await manager.addMemory(
      'agent-memory-matrix',
      'gamma duplicate memory',
      'L2',
      'u-matrix',
    );

    const rows = getDatabase()
      .prepare(
        'SELECT id, access_count FROM memories WHERE agent_folder = ? AND level = ? AND user_jid = ?',
      )
      .all('agent-memory-matrix', 'L2', 'u-matrix') as Array<{
      id: string;
      access_count: number;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].access_count).toBeGreaterThanOrEqual(1);
  });

  it('returns explain metadata in hybrid retrieval pipeline', async () => {
    const now = new Date().toISOString();
    createMemory({
      id: 'm-explain-1',
      agentFolder: 'agent-memory-matrix',
      userJid: 'u-matrix',
      scope: 'user',
      level: 'L2',
      content: 'alpha 系统 查询扩展 方案',
      embedding: [1, 0, 0],
      importance: 0.8,
      qualityScore: 0.9,
      sourceType: 'summary',
      tags: ['alpha', 'query'],
      createdAt: now,
      updatedAt: now,
    });

    const manager = new MemoryManager();
    const hits = await manager.searchMemoriesDetailed(
      'agent-memory-matrix',
      'alpha 系统 怎么查',
      3,
      'u-matrix',
    );

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].explain.queryVariants.length).toBeGreaterThan(0);
    expect(hits[0].explain.scores.final).toBeGreaterThan(0);
    expect(Array.isArray(hits[0].explain.matchedTerms)).toBe(true);
  });

  it('merges semantically similar memories and keeps single row', async () => {
    const manager = new MemoryManager();
    await manager.addMemory(
      'agent-memory-matrix',
      'alpha cache strategy for query ranking',
      'L2',
      'u-matrix',
      {
        tags: ['cache', 'ranking'],
        sourceType: 'direct',
      },
    );
    await manager.addMemory(
      'agent-memory-matrix',
      'alpha cache strategy for query ranking detail',
      'L2',
      'u-matrix',
      {
        tags: ['cache', 'detail'],
        sourceType: 'summary',
      },
    );
    const rows = getMemories('agent-memory-matrix', 'L2', 'u-matrix');
    expect(rows).toHaveLength(1);
    expect(
      rows[0].content.includes('alpha cache strategy for query ranking'),
    ).toBe(true);
    expect(rows[0].qualityScore).toBeDefined();
  });

  it('caps hybrid candidate search limit by API max limit', async () => {
    const now = new Date().toISOString();
    createMemory({
      id: 'm-limit-1',
      agentFolder: 'agent-memory-matrix',
      userJid: 'u-matrix',
      scope: 'user',
      level: 'L2',
      content: 'alpha search candidate',
      embedding: [1, 0, 0],
      importance: 0.6,
      sourceType: 'direct',
      createdAt: now,
      updatedAt: now,
    });

    const spy = vi.spyOn(BM25Index.prototype, 'searchWithScores');
    const manager = new MemoryManager();
    await manager.searchMemoriesDetailed(
      'agent-memory-matrix',
      'alpha',
      MEMORY_CONFIG.api.maxLimit + 20,
      'u-matrix',
    );

    const calledLimits = spy.mock.calls.map((call) => call[1]);
    expect(calledLimits.every((v) => v <= MEMORY_CONFIG.api.maxLimit)).toBe(
      true,
    );
    spy.mockRestore();
  });

  it('keeps fresh L2 memory when lastAccessedAt is missing', async () => {
    const now = new Date().toISOString();
    createMemory({
      id: 'm-l2-no-last-access',
      agentFolder: 'agent-memory-matrix',
      userJid: 'u-matrix',
      scope: 'user',
      level: 'L2',
      content: 'recent low-importance memory',
      embedding: [0.2, 0.2, 0.2],
      importance: 0.1,
      qualityScore: 0.2,
      sourceType: 'direct',
      createdAt: now,
      updatedAt: now,
    });

    const manager = new MemoryManager();
    await manager.migrateMemories();

    const l2Memories = getMemories('agent-memory-matrix', 'L2', 'u-matrix');
    expect(l2Memories.some((m) => m.id === 'm-l2-no-last-access')).toBe(true);
  });
});
