import { contextEngineRegistry } from '../../../context-engine/registry.js';
import type { ContextEngine } from '../../../context-engine/interface.js';
import type { CreateEngineOptions } from '../../../context-engine/providers.js';

export type { ContextEngine, CreateEngineOptions };

export async function getMemoryContextEngine(
  agentFolder: string,
  options?: CreateEngineOptions,
): Promise<ContextEngine> {
  return contextEngineRegistry.getEngine(agentFolder, options);
}

export { contextEngineRegistry };
