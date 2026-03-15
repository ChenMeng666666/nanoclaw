/**
 * ContextEngineRegistry 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ContextEngineRegistry } from '../registry.js';
import { createDefaultContextEngine } from '../providers.js';
import type { ContextEngine } from '../interface.js';
import type { Context, CompactResult, TurnResult } from '../types.js';
import type { NewMessage } from '../../types.js';
import { _initTestDatabase } from '../../db.js';

// 测试用的 Mock ContextEngine
class MockContextEngine implements ContextEngine {
  public bootstrapped = false;
  public ingestedCount = 0;
  public assembledCount = 0;

  async bootstrap(agentFolder: string): Promise<void> {
    this.bootstrapped = true;
  }

  async ingest(message: NewMessage, context: Context): Promise<any[]> {
    this.ingestedCount++;
    return [];
  }

  async assemble(chatJid: string, limit: number): Promise<Context> {
    this.assembledCount++;
    return {
      agentFolder: '',
      messages: [],
      memories: [],
      timestamp: new Date().toISOString(),
    };
  }

  async compact(session: any): Promise<CompactResult> {
    return {
      summary: '',
      preservedMemories: [],
      discardedCount: 0,
    };
  }

  async afterTurn(result: TurnResult): Promise<void> {}
}

describe('ContextEngineRegistry', () => {
  let registry: ContextEngineRegistry;

  beforeEach(() => {
    _initTestDatabase();
    registry = new ContextEngineRegistry();
  });

  it('should register a ContextEngine factory', () => {
    const factory = async (agentFolder: string): Promise<ContextEngine> => {
      return new MockContextEngine();
    };

    expect(() => registry.register('mock', factory)).not.toThrow();
  });

  it('should create engine instance when requested', async () => {
    const engineToCreate = new MockContextEngine();
    const factory = async (agentFolder: string): Promise<ContextEngine> => {
      await engineToCreate.bootstrap(agentFolder);
      return engineToCreate;
    };

    registry.register('mock', factory);
    registry.useDefaultEngine('mock');

    const engine = await registry.getEngine('test-agent');
    expect(engine).toBeDefined();
    expect((engine as MockContextEngine).bootstrapped).toBe(true);
  });

  it('should cache engine instances', async () => {
    let createCount = 0;
    const factory = async (agentFolder: string): Promise<ContextEngine> => {
      createCount++;
      return new MockContextEngine();
    };

    registry.register('mock', factory);
    registry.useDefaultEngine('mock');

    await registry.getEngine('test-agent');
    await registry.getEngine('test-agent');

    expect(createCount).toBe(1); // 应该只创建一次
  });

  it('should throw error if no default engine registered', async () => {
    await expect(registry.getEngine('test-agent')).rejects.toThrow(
      'No default ContextEngine registered',
    );
  });

  it('should clear cached instances', async () => {
    let createCount = 0;
    const factory = async (agentFolder: string): Promise<ContextEngine> => {
      createCount++;
      return new MockContextEngine();
    };

    registry.register('mock', factory);
    registry.useDefaultEngine('mock');

    await registry.getEngine('test-agent');
    registry.clear('test-agent');
    await registry.getEngine('test-agent');

    expect(createCount).toBe(2); // 应该创建两次
  });

  it('should support multiple engines for different agents', async () => {
    const factory = async (agentFolder: string): Promise<ContextEngine> => {
      return new MockContextEngine();
    };

    registry.register('mock', factory);
    registry.useDefaultEngine('mock');

    const engine1 = await registry.getEngine('agent-1');
    const engine2 = await registry.getEngine('agent-2');

    expect(engine1).toBeDefined();
    expect(engine2).toBeDefined();
    expect(engine1).not.toBe(engine2); // 不同 agent 应该有不同的实例
  });

  it('should bootstrap the default engine factory', async () => {
    registry.register('default-real', createDefaultContextEngine);
    registry.useDefaultEngine('default-real');

    const engine = await registry.getEngine('agent-real-bootstrap');
    const context = await engine.assemble('tg:100200300', 3);

    expect(context.agentFolder).toBe('agent-real-bootstrap');
    expect(Array.isArray(context.messages)).toBe(true);
    expect(Array.isArray(context.memories)).toBe(true);
  });
});
