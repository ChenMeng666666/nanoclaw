/**
 * Reflection Scheduler
 * Handles the scheduling of reflection and learning tasks using cron jobs.
 * Delegates execution to ReflectionExecutor.
 */
import cron from 'node-cron';
import { logger } from '../../logger.js';
import { reflectionExecutor } from '../learning/reflection-executor.js';

export class ReflectionScheduler {
  private running = false;
  private cronTasks: Array<{ stop: () => void; destroy?: () => void }> = [];

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {
      logger.warn('Reflection scheduler already running');
      return;
    }

    this.running = true;
    logger.info('Reflection scheduler started');

    this.registerCronTask('0 * * * *', () => {
      reflectionExecutor.triggerReflectionsForAllAgents('hourly');
    });

    this.registerCronTask('0 23 * * *', () => {
      reflectionExecutor.triggerReflectionsForAllAgents('daily');
    });

    this.registerCronTask('30 23 * * *', async () => {
      logger.info('Starting scheduled memory consolidation');
      await reflectionExecutor.consolidateMemoriesForAllAgents();
      logger.info('Scheduled memory consolidation completed');
    });

    this.registerCronTask('0 20 * * 0', async () => {
      await reflectionExecutor.checkLearningProgressForAllAgents();
    });
    this.registerCronTask('0 23 * * 0', () => {
      reflectionExecutor.triggerReflectionsForAllAgents('weekly');
    });

    this.registerCronTask('0 23 28-31 * *', () => {
      const today = new Date();
      const lastDay = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
      ).getDate();
      if (today.getDate() === lastDay) {
        reflectionExecutor.triggerReflectionsForAllAgents('monthly');
      }
    });

    this.registerCronTask('0 23 31 12 *', () => {
      reflectionExecutor.triggerReflectionsForAllAgents('yearly');
    });
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    for (const task of this.cronTasks) {
      task.stop();
      task.destroy?.();
    }
    this.cronTasks = [];
    this.running = false;
    logger.info('Reflection scheduler stopped');
  }

  private registerCronTask(
    expression: string,
    task: () => void | Promise<void>,
  ): void {
    const scheduledTask = cron.schedule(expression, () => {
      Promise.resolve(task()).catch((err) => {
        logger.error({ expression, err }, 'Reflection cron task failed');
      });
    });
    this.cronTasks.push(scheduledTask);
  }
}

// Singleton export
export const reflectionScheduler = new ReflectionScheduler();
