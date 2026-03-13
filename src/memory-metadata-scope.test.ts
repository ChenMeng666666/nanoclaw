import { beforeEach, describe, expect, it } from 'vitest';

import { _initTestDatabase } from './db.js';
import {
  createMemory,
  createAgent,
  getMemories,
  updateMemory,
  incrementMemoryAccess,
} from './db-agents.js';
import { memoryManager } from './memory-manager.js';

describe('memory metadata and scope', () => {
  beforeEach(() => {
    _initTestDatabase();
    createAgent({
      id: 'agent-id-a',
      name: 'Agent A',
      folder: 'agent-a',
      credentials: {
        anthropicModel: 'claude-sonnet-4-6',
      },
    });
  });

  it('persists metadata and supports scope filtering', () => {
    const now = new Date().toISOString();
    createMemory({
      id: 'm-session',
      agentFolder: 'agent-a',
      userJid: 'u1',
      sessionId: 's1',
      scope: 'session',
      level: 'L2',
      content: 'session memory',
      embedding: [0.1, 0.2],
      importance: 0.8,
      messageType: 'user',
      timestampWeight: 0.9,
      tags: ['alpha', 'beta'],
      sourceType: 'direct',
      createdAt: now,
      updatedAt: now,
    });
    createMemory({
      id: 'm-agent',
      agentFolder: 'agent-a',
      scope: 'agent',
      level: 'L2',
      content: 'agent memory',
      embedding: [0.1, 0.2],
      importance: 0.6,
      sourceType: 'summary',
      createdAt: now,
      updatedAt: now,
    });

    const sessionMemories = getMemories('agent-a', undefined, 'u1', {
      scope: 'session',
      sessionId: 's1',
      sourceType: 'direct',
      messageType: 'user',
      tags: ['alpha'],
    });
    expect(sessionMemories).toHaveLength(1);
    expect(sessionMemories[0].id).toBe('m-session');
    expect(sessionMemories[0].sessionId).toBe('s1');
    expect(sessionMemories[0].scope).toBe('session');
    expect(sessionMemories[0].tags).toEqual(['alpha', 'beta']);
  });

  it('updates metadata fields and access signals', () => {
    const now = new Date().toISOString();
    createMemory({
      id: 'm-update',
      agentFolder: 'agent-a',
      userJid: 'u1',
      scope: 'user',
      level: 'L1',
      content: 'before',
      embedding: [0.2, 0.3],
      importance: 0.5,
      sourceType: 'direct',
      createdAt: now,
      updatedAt: now,
    });

    updateMemory('m-update', {
      content: 'after',
      messageType: 'code',
      timestampWeight: 0.77,
      sessionId: 's2',
      tags: ['hotfix'],
      sourceType: 'extracted',
      scope: 'session',
    });
    incrementMemoryAccess('m-update');

    const memories = getMemories('agent-a', undefined, 'u1', {
      scope: 'session',
      sessionId: 's2',
      tags: ['hotfix'],
    });
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('after');
    expect(memories[0].messageType).toBe('code');
    expect(memories[0].timestampWeight).toBe(0.77);
    expect(memories[0].sourceType).toBe('extracted');
    expect(memories[0].accessCount).toBe(1);
    expect(memories[0].lastAccessedAt).toBeTruthy();
  });

  it('infers session scope when sessionId exists without scope', async () => {
    await memoryManager.addMemory('agent-a', 'session inferred', 'L2', 'u1', {
      sessionId: 's-infer',
      sourceType: 'direct',
    });
    const memories = getMemories('agent-a', 'L2', 'u1', {
      scope: 'session',
      sessionId: 's-infer',
    });
    expect(memories.length).toBeGreaterThan(0);
    expect(memories[0].scope).toBe('session');
  });
});
