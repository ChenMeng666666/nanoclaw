import { contextEngineRegistry } from './registry.js';
import { DefaultContextEngine } from './default-engine.js';
import type { QueryExpansionProvider } from './query-expansion.js';

/**
 * 工厂函数配置选项
 */
export interface CreateEngineOptions {
  queryExpansionProvider?: QueryExpansionProvider;
}

/**
 * 工厂函数：创建默认 ContextEngine 实例
 */
export async function createDefaultContextEngine(
  agentFolder: string,
  options?: CreateEngineOptions,
): Promise<DefaultContextEngine> {
  const engine = new DefaultContextEngine();
  await engine.bootstrap(agentFolder);

  if (options?.queryExpansionProvider) {
    engine.setQueryExpansionProvider(options.queryExpansionProvider);
  }

  return engine;
}

// 自动注册默认引擎
contextEngineRegistry.register('default', createDefaultContextEngine);
