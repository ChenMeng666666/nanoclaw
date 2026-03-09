import type { ContextEngine } from './interface.js';

type ContextEngineFactory = (agentFolder: string) => Promise<ContextEngine>;

/**
 * ContextEngine 注册表
 *
 * 支持注册多个 ContextEngine 实现，每个 agent 文件夹使用独立的引擎实例
 */
export class ContextEngineRegistry {
  private engines: Map<string, ContextEngine> = new Map();
  private factories: Map<string, ContextEngineFactory> = new Map();
  private defaultEngine: string = 'default';

  /**
   * 注册 ContextEngine 工厂
   * @param name - 引擎名称
   * @param factory - 工厂函数
   */
  register(name: string, factory: ContextEngineFactory): void {
    this.factories.set(name, factory);
  }

  /**
   * 获取或创建 ContextEngine 实例
   * @param agentFolder - Agent 文件夹路径
   * @returns ContextEngine 实例
   */
  async getEngine(agentFolder: string): Promise<ContextEngine> {
    // 检查是否已有缓存的引擎实例
    if (this.engines.has(agentFolder)) {
      return this.engines.get(agentFolder)!;
    }

    // 使用默认引擎工厂创建新实例
    const factory = this.factories.get(this.defaultEngine);
    if (!factory) {
      throw new Error('No default ContextEngine registered');
    }

    const engine = await factory(agentFolder);
    this.engines.set(agentFolder, engine);
    return engine;
  }

  /**
   * 设置默认使用的引擎
   * @param name - 引擎名称
   */
  useDefaultEngine(name: string): void {
    this.defaultEngine = name;
  }

  /**
   * 清除缓存的引擎实例（用于测试或重新加载）
   * @param agentFolder - 可选，指定清除哪个 agent 的实例
   */
  clear(agentFolder?: string): void {
    if (agentFolder) {
      this.engines.delete(agentFolder);
    } else {
      this.engines.clear();
    }
  }
}

export const contextEngineRegistry = new ContextEngineRegistry();
