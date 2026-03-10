import { ChildProcess, exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { DATA_DIR, MAX_CONCURRENT_CONTAINERS } from './config.js';
import { logger } from './logger.js';

interface QueuedTask {
  id: string;
  groupJid: string;
  fn: () => Promise<void>;
}

const MAX_RETRIES = 5;
const BASE_RETRY_MS = 5000;

interface GroupState {
  active: boolean;
  idleWaiting: boolean;
  isTaskContainer: boolean;
  runningTaskId: string | null;
  pendingMessages: boolean;
  lastPipedMessageTimestamp: string | null;
  pendingTasks: QueuedTask[];
  process: ChildProcess | null;
  containerName: string | null;
  groupFolder: string | null;
  retryCount: number;
  outputSent: boolean;
  healthMonitor?: NodeJS.Timeout; // 健康监控定时器
}

export class GroupQueue {
  private groups = new Map<string, GroupState>();
  private activeCount = 0;
  private waitingGroups: string[] = [];
  private processMessagesFn: ((groupJid: string) => Promise<boolean>) | null =
    null;
  private shuttingDown = false;

  private getGroup(groupJid: string): GroupState {
    let state = this.groups.get(groupJid);
    if (!state) {
      state = {
        active: false,
        idleWaiting: false,
        isTaskContainer: false,
        runningTaskId: null,
        pendingMessages: false,
        lastPipedMessageTimestamp: null,
        pendingTasks: [],
        process: null,
        containerName: null,
        groupFolder: null,
        retryCount: 0,
        outputSent: false,
      };
      this.groups.set(groupJid, state);
    }
    return state;
  }

  setProcessMessagesFn(fn: (groupJid: string) => Promise<boolean>): void {
    this.processMessagesFn = fn;
  }

  enqueueMessageCheck(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    if (state.active) {
      state.pendingMessages = true;
      logger.debug({ groupJid }, 'Container active, message queued');
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingMessages = true;
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.debug(
        { groupJid, activeCount: this.activeCount },
        'At concurrency limit, message queued',
      );
      return;
    }

    this.runForGroup(groupJid, 'messages').catch((err) =>
      logger.error({ groupJid, err }, 'Unhandled error in runForGroup'),
    );
  }

  enqueueTask(groupJid: string, taskId: string, fn: () => Promise<void>): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // Prevent double-queuing: check both pending and currently-running task
    if (state.runningTaskId === taskId) {
      logger.debug({ groupJid, taskId }, 'Task already running, skipping');
      return;
    }
    if (state.pendingTasks.some((t) => t.id === taskId)) {
      logger.debug({ groupJid, taskId }, 'Task already queued, skipping');
      return;
    }

    if (state.active) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      if (state.idleWaiting) {
        this.closeStdin(groupJid);
      }
      logger.debug({ groupJid, taskId }, 'Container active, task queued');
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingTasks.push({ id: taskId, groupJid, fn });
      if (!this.waitingGroups.includes(groupJid)) {
        this.waitingGroups.push(groupJid);
      }
      logger.debug(
        { groupJid, taskId, activeCount: this.activeCount },
        'At concurrency limit, task queued',
      );
      return;
    }

    // Run immediately
    this.runTask(groupJid, { id: taskId, groupJid, fn }).catch((err) =>
      logger.error({ groupJid, taskId, err }, 'Unhandled error in runTask'),
    );
  }

  registerProcess(
    groupJid: string,
    proc: ChildProcess,
    containerName: string,
    groupFolder?: string,
  ): void {
    const state = this.getGroup(groupJid);
    state.process = proc;
    state.containerName = containerName;
    if (groupFolder) state.groupFolder = groupFolder;

    // 添加容器健康监控
    this.startHealthMonitor(groupJid);
  }

  /**
   * 启动容器健康监控
   */
  private startHealthMonitor(groupJid: string): void {
    const state = this.getGroup(groupJid);
    if (state.healthMonitor) {
      clearInterval(state.healthMonitor);
    }

    // 每30秒检查一次容器健康状态
    state.healthMonitor = setInterval(async () => {
      try {
        if (!state.containerName) {
          this.stopHealthMonitor(groupJid);
          return;
        }

        // 使用 docker inspect 检查容器状态
        const inspectOutput = execSync(
          `docker inspect ${state.containerName} --format='{{.State.Running}}'`
        ).toString().trim();

        if (inspectOutput !== 'true') {
          throw new Error('Container not running');
        }
      } catch (error) {
        logger.error(
          { groupJid, containerName: state.containerName, error },
          'Container health check failed'
        );

        // 容器不健康，停止监控并尝试重新启动
        this.stopHealthMonitor(groupJid);
        this.handleContainerFailure(groupJid);
      }
    }, 30000); // 每30秒检查一次
  }

  /**
   * 停止容器健康监控
   */
  private stopHealthMonitor(groupJid: string): void {
    const state = this.getGroup(groupJid);
    if (state.healthMonitor) {
      clearInterval(state.healthMonitor);
      state.healthMonitor = undefined;
    }
  }

  /**
   * 处理容器失败
   */
  private handleContainerFailure(groupJid: string): void {
    const state = this.getGroup(groupJid);

    // 清理资源
    state.active = false;
    state.process = null;
    state.containerName = null;
    state.groupFolder = null;

    if (this.activeCount > 0) {
      this.activeCount--;
    }

    // 尝试重新启动
    logger.info({ groupJid }, 'Attempting to restart container after health check failure');
    this.scheduleRetry(groupJid, state);
  }

  /**
   * Mark the container as idle-waiting (finished work, waiting for IPC input).
   * If tasks are pending, preempt the idle container immediately.
   */
  notifyIdle(groupJid: string): void {
    const state = this.getGroup(groupJid);
    state.idleWaiting = true;
    if (state.pendingTasks.length > 0) {
      this.closeStdin(groupJid);
    }
  }

  /**
   * Send a follow-up message to the active container via IPC file.
   * Returns true if the message was written, false if no active container.
   * Optionally records the last message timestamp to prevent duplicate processing.
   */
  sendMessage(
    groupJid: string,
    text: string,
    lastMessageTimestamp?: string,
  ): boolean {
    const state = this.getGroup(groupJid);
    if (!state.active || !state.groupFolder) return false;

    // 对于任务容器，我们仍然允许发送消息，但需要谨慎处理
    if (state.isTaskContainer) {
      logger.debug(
        { groupJid },
        'Task container active, marking message as pending instead of sending directly',
      );
      state.pendingMessages = true; // 标记有消息待处理
      return false; // 对于任务容器，我们选择不直接发送消息，而是让它在任务完成后处理
    }

    state.idleWaiting = false;
    if (lastMessageTimestamp)
      state.lastPipedMessageTimestamp = lastMessageTimestamp;

    const inputDir = path.join(DATA_DIR, 'ipc', state.groupFolder, 'input');
    try {
      fs.mkdirSync(inputDir, { recursive: true });
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
      const filepath = path.join(inputDir, filename);
      const tempPath = `${filepath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify({ type: 'message', text }));
      fs.renameSync(tempPath, filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Signal the active container to wind down by writing a close sentinel.
   */
  closeStdin(groupJid: string): void {
    const state = this.getGroup(groupJid);
    if (!state.active || !state.groupFolder) return;

    const inputDir = path.join(DATA_DIR, 'ipc', state.groupFolder, 'input');
    try {
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(path.join(inputDir, '_close'), '');
    } catch {
      // ignore
    }
  }

  /**
   * Mark that output has been sent to user for this group.
   * Used to prevent duplicate responses on retry.
   */
  markOutputSent(groupJid: string): void {
    const state = this.getGroup(groupJid);
    state.outputSent = true;
  }

  /**
   * Check if output has been sent to user for this group.
   * Returns true if output was sent AND the flag hasn't been reset.
   */
  hasOutputSent(groupJid: string): boolean {
    const state = this.getGroup(groupJid);
    return state.outputSent;
  }

  /**
   * Reset the outputSent flag for a group (called when processing completes successfully).
   */
  resetOutputSent(groupJid: string): void {
    const state = this.getGroup(groupJid);
    state.outputSent = false;
  }

  private async runForGroup(
    groupJid: string,
    reason: 'messages' | 'drain',
  ): Promise<void> {
    const state = this.getGroup(groupJid);
    state.active = true;
    state.idleWaiting = false;
    state.isTaskContainer = false;
    state.pendingMessages = false;
    state.outputSent = false; // Reset outputSent flag for new processing
    this.activeCount++;

    logger.debug(
      { groupJid, reason, activeCount: this.activeCount },
      'Starting container for group',
    );

    try {
      if (this.processMessagesFn) {
        const success = await this.processMessagesFn(groupJid);
        if (success) {
          state.retryCount = 0;
          state.outputSent = false; // Clear flag on success
        } else {
          // 修复：即使有输出发送，也应该允许重试
          if (state.outputSent) {
            logger.warn(
              { groupJid },
              'Processing failed but output was sent, will retry after delay'
            );
            state.outputSent = false; // Clear flag
          }
          this.scheduleRetry(groupJid, state);
        }
      }
    } catch (err) {
      // Only retry if output was not sent to user
      if (state.outputSent) {
        logger.warn(
          { groupJid, err },
          'Error processing but output was sent, skipping retry to prevent duplicates',
        );
        state.outputSent = false; // Clear flag
      } else {
        logger.error({ groupJid, err }, 'Error processing messages for group');
        this.scheduleRetry(groupJid, state);
      }
    } finally {
      state.active = false;
      state.process = null;
      state.containerName = null;
      state.groupFolder = null;
      this.activeCount--;
      this.stopHealthMonitor(groupJid); // 停止健康监控
      this.drainGroup(groupJid);
    }
  }

  private async runTask(groupJid: string, task: QueuedTask): Promise<void> {
    const state = this.getGroup(groupJid);
    state.active = true;
    state.idleWaiting = false;
    state.isTaskContainer = true;
    state.runningTaskId = task.id;
    this.activeCount++;

    logger.debug(
      { groupJid, taskId: task.id, activeCount: this.activeCount },
      'Running queued task',
    );

    try {
      await task.fn();
    } catch (err) {
      logger.error({ groupJid, taskId: task.id, err }, 'Error running task');
    } finally {
      state.active = false;
      state.isTaskContainer = false;
      state.runningTaskId = null;
      state.process = null;
      state.containerName = null;
      state.groupFolder = null;
      this.activeCount--;
      this.stopHealthMonitor(groupJid); // 停止健康监控
      this.drainGroup(groupJid);
    }
  }

  private scheduleRetry(groupJid: string, state: GroupState): void {
    state.retryCount++;
    if (state.retryCount > MAX_RETRIES) {
      logger.error(
        { groupJid, retryCount: state.retryCount },
        'Max retries exceeded, dropping messages (will retry on next incoming message)',
      );
      state.retryCount = 0;
      return;
    }

    const delayMs = BASE_RETRY_MS * Math.pow(2, state.retryCount - 1);
    logger.info(
      { groupJid, retryCount: state.retryCount, delayMs },
      'Scheduling retry with backoff',
    );
    setTimeout(() => {
      if (!this.shuttingDown) {
        this.enqueueMessageCheck(groupJid);
      }
    }, delayMs);
  }

  private drainGroup(groupJid: string): void {
    if (this.shuttingDown) return;

    const state = this.getGroup(groupJid);

    // 聊天消息优先于任务执行，确保用户可以及时得到响应
    if (state.pendingMessages) {
      this.runForGroup(groupJid, 'drain').catch((err) =>
        logger.error(
          { groupJid, err },
          'Unhandled error in runForGroup (drain)',
        ),
      );
      return;
    }

    // 然后处理任务
    if (state.pendingTasks.length > 0) {
      const task = state.pendingTasks.shift()!;
      this.runTask(groupJid, task).catch((err) =>
        logger.error(
          { groupJid, taskId: task.id, err },
          'Unhandled error in runTask (drain)',
        ),
      );
      return;
    }

    // Nothing pending for this group; check if other groups are waiting for a slot
    this.drainWaiting();
  }

  private drainWaiting(): void {
    while (
      this.waitingGroups.length > 0 &&
      this.activeCount < MAX_CONCURRENT_CONTAINERS
    ) {
      const nextJid = this.waitingGroups.shift()!;
      const state = this.getGroup(nextJid);

      // 聊天消息优先于任务执行，确保用户可以及时得到响应
      if (state.pendingMessages) {
        this.runForGroup(nextJid, 'drain').catch((err) =>
          logger.error(
            { groupJid: nextJid, err },
            'Unhandled error in runForGroup (waiting)',
          ),
        );
      } else if (state.pendingTasks.length > 0) {
        const task = state.pendingTasks.shift()!;
        this.runTask(nextJid, task).catch((err) =>
          logger.error(
            { groupJid: nextJid, taskId: task.id, err },
            'Unhandled error in runTask (waiting)',
          ),
        );
      }
      // If neither pending, skip this group
    }
  }

  async shutdown(_gracePeriodMs: number): Promise<void> {
    this.shuttingDown = true;

    // Count active containers but don't kill them — they'll finish on their own
    // via idle timeout or container timeout. The --rm flag cleans them up on exit.
    // This prevents WhatsApp reconnection restarts from killing working agents.
    const activeContainers: string[] = [];
    for (const [jid, state] of this.groups) {
      if (state.process && !state.process.killed && state.containerName) {
        activeContainers.push(state.containerName);
      }
    }

    logger.info(
      { activeCount: this.activeCount, detachedContainers: activeContainers },
      'GroupQueue shutting down (containers detached, not killed)',
    );
  }
}
