import { logger } from '../../logger.js';
import { reflectionScheduler } from '../../reflection-scheduler.js';
import { memoryManager } from '../../memory-manager.js';
import { evolutionManager } from '../../evolution-manager.js';
import { EVOLUTION_CONFIG } from '../../config.js';
import { LocalLLMQueryExpansionProvider } from '../../query-expansion/local-llm-provider.js';
import { contextEngineRegistry } from '../../context-engine/registry.js';
import { GroupQueue } from '../../group-queue.js';
import { Channel } from '../../types.js';
import { MainEvolutionApplier } from '../../main-evolution-applier.js';

export class AppLifecycleManager {
  private intervals: NodeJS.Timeout[] = [];
  private runtimeAPIServer: any = null;
  private localLLMProvider: LocalLLMQueryExpansionProvider | null = null;
  private queue: GroupQueue | null = null;
  private channels: Channel[] = [];

  constructor() {}

  public registerRuntimeAPIServer(server: any) {
    this.runtimeAPIServer = server;
  }

  public registerQueue(queue: GroupQueue) {
    this.queue = queue;
  }

  public registerChannels(channels: Channel[]) {
    this.channels = channels;
  }

  public async setupLocalLLMQueryExpansion(): Promise<void> {
    const modelPath =
      process.env.LOCAL_LLM_MODEL_PATH ||
      './model/Qwen3.5-2B_Abliterated.Q4_K_M.gguf';

    try {
      this.localLLMProvider = new LocalLLMQueryExpansionProvider({
        modelPath,
        modelType: 'qwen3.5',
        numVariants: 3,
        temperature: 0.7,
        maxTokens: 200,
      });

      await this.localLLMProvider.initialize();
      logger.info({ modelPath }, 'Local LLM query expansion initialized');

      // 设置到 context engine 注册表的全局配置
      contextEngineRegistry.setGlobalOptions({
        queryExpansionProvider: this.localLLMProvider,
      });
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), modelPath },
        'Failed to initialize local LLM, falling back to keyword query expansion',
      );
      this.localLLMProvider = null;
    }
  }

  /**
   * 在后台初始化本地 LLM，不阻塞应用启动
   */
  public setupLocalLLMQueryExpansionInBackground(): void {
    this.setupLocalLLMQueryExpansion().catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Background local LLM setup failed',
      );
    });
  }

  public startBackgroundTasks(): void {
    // 启动反思调度器（多智能体架构）
    reflectionScheduler.start();
    logger.info('Reflection scheduler started');

    const memoryPersistInterval = setInterval(
      () =>
        memoryManager
          .persistL1Memories()
          .catch((err) => logger.error({ err }, 'Memory persist task failed')),
      5 * 60 * 1000,
    );
    this.intervals.push(memoryPersistInterval);

    const memoryMigrateInterval = setInterval(
      () => {
        memoryManager
          .migrateMemories()
          .then((migratedCount) => {
            if (migratedCount > 0) {
              logger.info({ migratedCount }, 'Memory migration task completed');
            }
          })
          .catch((err) =>
            logger.error({ err }, 'Memory migration task failed'),
          );
      },
      60 * 60 * 1000,
    );
    this.intervals.push(memoryMigrateInterval);

    const evolutionMetricsInterval = setInterval(() => {
      try {
        evolutionManager.saveEcosystemMetrics();
      } catch (err) {
        logger.error({ err }, 'Evolution metrics snapshot task failed');
      }
    }, EVOLUTION_CONFIG.metricsSnapshotInterval);
    this.intervals.push(evolutionMetricsInterval);

    // 初始化主项目进化系统
    logger.info('Main evolution system initialized');
  }

  public setupErrorHandlers(): void {
    // 错误处理中集成进化系统
    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception');
      MainEvolutionApplier.submitMainExperience({
        abilityName: '错误恢复',
        content: `系统遇到未捕获异常: ${err.message}\n${err.stack}`,
        category: 'repair',
        tags: ['error', 'system'],
      }).catch((e: unknown) =>
        logger.warn({ e }, 'Failed to submit error experience'),
      );
    });

    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled rejection');
      MainEvolutionApplier.submitMainExperience({
        abilityName: 'Promise 拒绝处理',
        content: `系统遇到未处理的 Promise 拒绝: ${reason}`,
        category: 'repair',
        tags: ['error', 'promise'],
      }).catch((e: unknown) =>
        logger.warn({ e }, 'Failed to submit rejection experience'),
      );
    });
    
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  public async shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');

    // 停止调度器
    reflectionScheduler.stop();

    // 停止记忆定时任务
    this.intervals.forEach((interval) => clearInterval(interval));

    // 关闭运行时 API
    if (this.runtimeAPIServer) {
      await new Promise<void>((resolve) => {
        this.runtimeAPIServer.close(() => resolve());
      });
    }

    // 清理本地 LLM 资源
    if (this.localLLMProvider) {
      try {
        await this.localLLMProvider.destroy();
        logger.info('Local LLM provider destroyed');
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Failed to destroy local LLM provider',
        );
      }
    }

    // 持久化记忆 - ContextEngine 已在运行中持续处理
    logger.info('ContextEngine memories are persisted during runtime');

    if (this.queue) {
      await this.queue.shutdown(10000);
    }
    
    for (const ch of this.channels) await ch.disconnect();
    process.exit(0);
  }
}
