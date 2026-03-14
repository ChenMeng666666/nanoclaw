import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../embedding-providers/registry.js', () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

import { _initTestDatabase } from '../../db.js';
import { createAgent, getMemories } from '../../db-agents.js';
import { createDefaultContextEngine } from '../providers.js';
import {
  replaceSynonyms,
  generateKeywordVariants,
} from '../query-expansion.js';
import { MEMORY_CONFIG } from '../../config.js';

describe('default context engine behavior', () => {
  beforeEach(() => {
    _initTestDatabase();
    createAgent({
      id: 'agent-default-engine-behavior',
      name: 'Agent Default Engine Behavior',
      folder: 'agent-default-engine-behavior',
      credentials: {
        anthropicModel: 'claude-sonnet-4-6',
      },
    });
  });

  it('stores user scope when sessionId is absent', async () => {
    const engine = await createDefaultContextEngine(
      'agent-default-engine-behavior',
    );
    await engine.ingest(
      {
        id: 'm-1',
        chat_jid: 'chat-a',
        sender: 'u-1',
        sender_name: 'User One',
        content: '普通记忆内容',
        timestamp: new Date().toISOString(),
      },
      {
        agentFolder: 'agent-default-engine-behavior',
        messages: [],
        memories: [],
        timestamp: new Date().toISOString(),
      },
    );

    const memories = getMemories('agent-default-engine-behavior');
    expect(memories.length).toBeGreaterThan(0);
    expect(memories[0].scope).toBe('user');
    expect(memories[0].sessionId).toBeUndefined();
  });

  it('stores session scope when sessionId is provided', async () => {
    const engine = await createDefaultContextEngine(
      'agent-default-engine-behavior',
    );
    await engine.ingest(
      {
        id: 'm-2',
        chat_jid: 'chat-b',
        sender: 'u-2',
        sender_name: 'User Two',
        content: '会话记忆内容',
        timestamp: new Date().toISOString(),
      },
      {
        agentFolder: 'agent-default-engine-behavior',
        messages: [],
        memories: [],
        timestamp: new Date().toISOString(),
        sessionId: 'session-b',
      },
    );

    const memories = getMemories('agent-default-engine-behavior');
    expect(memories.length).toBeGreaterThan(0);
    expect(memories[0].scope).toBe('session');
    expect(memories[0].sessionId).toBe('session-b');
  });

  it('uses deterministic synonyms and configured variant limit', async () => {
    await createDefaultContextEngine('agent-default-engine-behavior');
    const base = '系统 方法 使用 代码';
    const replaced1 = replaceSynonyms(base);
    const replaced2 = replaceSynonyms(base);
    expect(replaced1).toBe(replaced2);

    const variants = generateKeywordVariants(
      '请帮我了解这个系统的功能和使用方法，包含代码示例',
    );
    expect(variants.length).toBeLessThanOrEqual(
      MEMORY_CONFIG.retrieval.queryVariantLimit,
    );
  });

  it('keeps provided sessionId as retrieval scope', async () => {
    const engine = await createDefaultContextEngine(
      'agent-default-engine-behavior',
    );
    const context = await engine.assemble('chat-c', 10, 'session-c');
    expect(context.sessionId).toBe('session-c');
  });
});
