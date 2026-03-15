import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/embedding-providers/registry.js', () => ({
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
    return [0.2, 0.2, 0.2];
  }),
}));

import {
  _initTestDatabase,
  storeChatMetadata,
  storeMessageDirect,
} from '../src/db.js';
import {
  createAgent,
  getDatabase,
  getMemories,
} from '../src/db-agents.js';
import { createDefaultContextEngine } from '../src/context-engine/default-engine.js';
import { MemoryManager } from '../src/memory-manager.js';
import type { Context } from '../src/context-engine/context-types.js';

describe('e2e memory isolation', () => {
  beforeEach(() => {
    _initTestDatabase();
    createAgent({
      id: 'agent-e2e-memory',
      name: 'Agent E2E Memory',
      folder: 'agent-e2e-memory',
      credentials: {
        anthropicModel: 'claude-sonnet-4-6',
      },
    });
    const now = new Date().toISOString();
    storeChatMetadata('chat-e2e-main', now, 'chat-e2e-main', 'test', true);
    storeChatMetadata('chat-session-a', now, 'chat-session-a', 'test', true);
    storeChatMetadata('chat-session-b', now, 'chat-session-b', 'test', true);
    storeChatMetadata('chat-session-c', now, 'chat-session-c', 'test', true);
  });

  it('completes ingest -> retrieve -> migrate flow', async () => {
    const engine = await createDefaultContextEngine('agent-e2e-memory');
    const context: Context = {
      agentFolder: 'agent-e2e-memory',
      userJid: 'u-e2e',
      messages: [],
      memories: [],
      timestamp: new Date().toISOString(),
      sessionId: 'chat-e2e-main',
    };

    await engine.ingest(
      {
        id: 'msg-e2e-1',
        chat_jid: 'chat-e2e-main',
        sender: 'u-e2e',
        sender_name: 'User E2E',
        content: 'alpha project migration knowledge',
        timestamp: new Date().toISOString(),
        is_from_me: false,
      },
      context,
    );

    storeMessageDirect({
      id: 'msg-e2e-q',
      chat_jid: 'chat-e2e-main',
      sender: 'u-e2e',
      sender_name: 'User E2E',
      content: 'alpha migration',
      timestamp: new Date().toISOString(),
      is_from_me: false,
      is_bot_message: false,
    });

    const assembled = await engine.assemble('chat-e2e-main', 10);
    expect(assembled.memories.length).toBeGreaterThan(0);
    expect(
      assembled.memories.some((memory) => memory.content.includes('alpha')),
    ).toBe(true);

    const target = getMemories('agent-e2e-memory', 'L2', 'u-e2e', {
      scope: 'session',
      sessionId: 'chat-e2e-main',
    })[0];
    expect(target).toBeTruthy();

    getDatabase()
      .prepare(
        'UPDATE memories SET importance = ?, last_accessed_at = ? WHERE id = ?',
      )
      .run(0.95, new Date().toISOString(), target.id);

    const manager = new MemoryManager();
    const migrated = await manager.migrateMemories();

    expect(migrated).toBeGreaterThanOrEqual(1);
    const l3 = getMemories('agent-e2e-memory', 'L3', 'u-e2e');
    expect(l3.some((memory) => memory.id === target.id)).toBe(true);
  });

  it('isolates recall across sessions and users', async () => {
    const engine = await createDefaultContextEngine('agent-e2e-memory');
    const now = new Date().toISOString();

    await engine.ingest(
      {
        id: 'msg-s1',
        chat_jid: 'chat-session-a',
        sender: 'u-1',
        sender_name: 'User One',
        content: 'alpha private requirement',
        timestamp: now,
        is_from_me: false,
      },
      {
        agentFolder: 'agent-e2e-memory',
        userJid: 'u-1',
        messages: [],
        memories: [],
        timestamp: now,
        sessionId: 'chat-session-a',
      },
    );
    await engine.ingest(
      {
        id: 'msg-s2',
        chat_jid: 'chat-session-b',
        sender: 'u-1',
        sender_name: 'User One',
        content: 'beta hidden plan',
        timestamp: now,
        is_from_me: false,
      },
      {
        agentFolder: 'agent-e2e-memory',
        userJid: 'u-1',
        messages: [],
        memories: [],
        timestamp: now,
        sessionId: 'chat-session-b',
      },
    );
    await engine.ingest(
      {
        id: 'msg-s3',
        chat_jid: 'chat-session-c',
        sender: 'u-2',
        sender_name: 'User Two',
        content: 'gamma another user data',
        timestamp: now,
        is_from_me: false,
      },
      {
        agentFolder: 'agent-e2e-memory',
        userJid: 'u-2',
        messages: [],
        memories: [],
        timestamp: now,
        sessionId: 'chat-session-c',
      },
    );

    const manager = new MemoryManager();
    const sessionAResults = await manager.searchMemories(
      'agent-e2e-memory',
      'alpha',
      10,
      'u-1',
      {
        scope: 'session',
        sessionId: 'chat-session-a',
      },
    );
    const sessionCResults = await manager.searchMemories(
      'agent-e2e-memory',
      'gamma',
      10,
      'u-2',
      {
        scope: 'session',
        sessionId: 'chat-session-c',
      },
    );

    expect(
      sessionAResults.some((memory) => memory.content.includes('alpha')),
    ).toBe(true);
    expect(
      sessionAResults.some((memory) => memory.content.includes('beta')),
    ).toBe(false);
    expect(
      sessionAResults.some((memory) => memory.content.includes('gamma')),
    ).toBe(false);

    expect(
      sessionCResults.some((memory) => memory.content.includes('gamma')),
    ).toBe(true);
    expect(
      sessionCResults.some((memory) => memory.content.includes('alpha')),
    ).toBe(false);
  });
});
