/**
 * 协作任务调度器
 *
 * 负责管理智能体团队的任务分配和协作
 * - 任务依赖管理
 * - 智能体角色分配
 * - 任务进度同步
 */

import {
  getAllCollaborationTasks,
  getAllRegisteredGroups,
  updateCollaborationTask,
  updateTask,
  getTaskById,
  getCollaborationTaskById,
  getTeamStateById,
  createTeamCollaborationState,
  updateTeamCollaborationState,
  getTeamCollaborationStateById,
  createCollaborationTask,
  createTask,
} from './db.js';
import { logger } from './logger.js';
import { sendAgentMessage } from './agent-communication.js';
import { COLLABORATION_CONFIG } from './config.js';
import type { CollaborationTask, TeamState } from './types/collaboration.js';

// 调度器状态
let schedulerRunning = false;

interface DependencyCheckResult {
  satisfied: boolean;
  missingDependencies: string[];
  blockedReason?: string;
  retryAfterMs?: number;
}

/**
 * 检查任务依赖是否满足
 */
function checkDependenciesSatisfied(
  task: CollaborationTask,
): DependencyCheckResult {
  if (!task.dependencies || task.dependencies.length === 0) {
    return {
      satisfied: true,
      missingDependencies: [],
    };
  }

  const missingDependencies: string[] = [];
  for (const depId of task.dependencies) {
    const depTask = getCollaborationTaskById(depId);
    if (!depTask || depTask.status !== 'completed') {
      missingDependencies.push(depId);
    }
  }

  if (missingDependencies.length > 0) {
    return {
      satisfied: false,
      missingDependencies,
      blockedReason: 'waiting_for_dependencies',
      retryAfterMs: 60_000,
    };
  }

  return {
    satisfied: true,
    missingDependencies: [],
  };
}

/**
 * 分配任务给智能体
 */
function assignTaskToAgents(
  task: CollaborationTask,
  team: TeamState | null,
): void {
  if (task.assignedAgents.length === 0) {
    logger.warn({ taskId: task.id }, 'No agents assigned to task, skipping');
    return;
  }

  // 发送任务通知给每个分配的智能体
  task.assignedAgents.forEach((agentId, index) => {
    const role = index === 0 ? 'leader' : 'member';
    try {
      const messageId = sendAgentMessage(
        'system',
        agentId,
        'task',
        JSON.stringify({
          taskId: task.id,
          title: task.title,
          description: task.description,
          role,
          priority: task.priority,
        }),
        { taskId: task.id, role },
      );
      scheduleAgentWakeup(task, agentId, messageId);
      logger.debug(
        { taskId: task.id, agentId, role, messageId },
        'Task notification sent to agent',
      );
    } catch (err) {
      logger.error(
        { taskId: task.id, agentId, err },
        'Failed to send task notification',
      );
    }
  });

  // 如果有团队，创建团队协作状态
  if (task.teamId && team) {
    const collaborationStateId = `team-collab-${task.id}`;
    createTeamCollaborationState({
      id: collaborationStateId,
      teamId: task.teamId,
      taskId: task.id,
      status: 'planning',
      progress: 0,
      activeAgents: task.assignedAgents,
    });
  }
}

export function scheduleAgentWakeup(
  task: CollaborationTask,
  agentId: string,
  messageId: string,
): void {
  const registeredGroups = getAllRegisteredGroups();
  const entry = Object.entries(registeredGroups).find(
    ([, group]) => group.folder === agentId,
  );
  if (!entry) {
    logger.warn({ taskId: task.id, agentId }, 'No registered group for agent');
    return;
  }

  const [targetJid, targetGroup] = entry;
  const wakeupId = `collab-wakeup-${task.id}-${agentId}`;
  const now = new Date();
  now.setSeconds(now.getSeconds() + 5);
  const nextRun = now.toISOString();
  const existingWakeupTask = getTaskById(wakeupId);
  if (existingWakeupTask?.status === 'active') {
    logger.info(
      { taskId: task.id, agentId, wakeupId },
      'Collaboration wakeup task already active, skip duplicate',
    );
    return;
  }
  if (existingWakeupTask) {
    updateTask(wakeupId, {
      prompt: `处理协作任务消息：taskId=${task.id} messageId=${messageId}，读取协作消息队列并推进任务。`,
      schedule_type: 'once',
      schedule_value: nextRun,
      next_run: nextRun,
      status: 'active',
    });
    logger.info(
      { taskId: task.id, agentId, targetJid, wakeupId },
      'Collaboration wakeup task reactivated',
    );
    return;
  }

  createTask({
    id: wakeupId,
    group_folder: targetGroup.folder,
    chat_jid: targetJid,
    prompt: `处理协作任务消息：taskId=${task.id} messageId=${messageId}，读取协作消息队列并推进任务。`,
    schedule_type: 'once',
    schedule_value: nextRun,
    context_mode: 'isolated',
    next_run: nextRun,
    status: 'active',
    created_at: new Date().toISOString(),
  });

  logger.info(
    { taskId: task.id, agentId, targetJid, wakeupId },
    'Collaboration wakeup task scheduled',
  );
}

/**
 * 处理单个协作任务
 */
function processCollaborationTask(task: CollaborationTask): void {
  // 检查任务是否已取消或失败
  if (task.status === 'failed' || task.status === 'completed') {
    return;
  }

  // 检查依赖是否满足
  if (task.status === 'pending') {
    const dependencyCheck = checkDependenciesSatisfied(task);
    if (dependencyCheck.satisfied) {
      // 依赖满足，开始执行
      updateCollaborationTask(task.id, {
        status: 'in_progress',
        progress: 0,
      });
      logger.info({ taskId: task.id }, 'Task started - dependencies satisfied');

      // 获取团队信息
      const team = task.teamId ? getTeamStateById(task.teamId) : null;

      // 分配任务给智能体
      assignTaskToAgents(task, team);
    } else {
      logger.debug(
        { taskId: task.id, dependencyCheck },
        'Task waiting for dependencies',
      );
    }
  }

  // 检查任务是否超时
  if (task.status === 'in_progress') {
    const taskTimeout = COLLABORATION_CONFIG.collaborationTasks.taskTimeout;
    const updatedAt = new Date(task.updatedAt).getTime();
    const now = Date.now();

    if (now - updatedAt > taskTimeout) {
      updateCollaborationTask(task.id, {
        status: 'failed',
      });
      logger.warn({ taskId: task.id }, 'Task timed out, marked as failed');
    }
  }
}

/**
 * 运行协作任务调度循环
 */
async function runCollaborationSchedulerLoop(): Promise<void> {
  if (!schedulerRunning) {
    return;
  }

  try {
    // 获取所有协作任务
    const tasks = getAllCollaborationTasks();

    // 处理每个任务
    for (const task of tasks) {
      processCollaborationTask(task);
    }
  } catch (err) {
    logger.error({ err }, 'Error in collaboration scheduler loop');
  }

  // 继续调度
  if (schedulerRunning) {
    setTimeout(
      runCollaborationSchedulerLoop,
      COLLABORATION_CONFIG.collaborationTasks.taskTimeout / 60, // 每分钟检查一次
    );
  }
}

/**
 * 启动协作任务调度器
 */
export function startCollaborationScheduler(): void {
  if (schedulerRunning) {
    logger.debug(
      'Collaboration scheduler already running, skipping duplicate start',
    );
    return;
  }

  if (!COLLABORATION_CONFIG.collaborationTasks.enabled) {
    logger.info('Collaboration tasks disabled, not starting scheduler');
    return;
  }

  schedulerRunning = true;
  logger.info('Collaboration scheduler started');

  runCollaborationSchedulerLoop();
}

/**
 * 停止协作任务调度器
 */
export function stopCollaborationScheduler(): void {
  schedulerRunning = false;
  logger.info('Collaboration scheduler stopped');
}

/**
 * 更新任务进度
 */
export function updateTaskProgress(
  taskId: string,
  progress: number,
  status?: CollaborationTask['status'],
): void {
  const task = getCollaborationTaskById(taskId);
  if (!task) {
    logger.warn({ taskId }, 'Task not found for progress update');
    return;
  }

  const safeProgress = Math.max(0, Math.min(100, progress));
  const updates: Parameters<typeof updateCollaborationTask>[1] = {
    progress: safeProgress,
  };

  if (status) {
    updates.status = status;
  }

  // 如果进度达到 100%，标记为完成
  if (safeProgress >= 100 && !status) {
    updates.status = 'completed';
    updates.completedAt = new Date().toISOString();
  }

  updateCollaborationTask(taskId, updates);

  // 更新团队协作状态（如果有）
  if (task.teamId) {
    const collaborationStateId = `team-collab-${taskId}`;
    const state = getTeamCollaborationStateById(collaborationStateId);
    if (state) {
      updateTeamCollaborationState(collaborationStateId, {
        progress: updates.progress,
        status: updates.status === 'completed' ? 'completed' : 'executing',
      });
    }
  }

  logger.info(
    { taskId, progress: updates.progress, status: updates.status },
    'Task progress updated',
  );
}

/**
 * 创建协作任务
 */
export function createCollaborationTaskWithAssignment(
  taskData: Omit<CollaborationTask, 'createdAt' | 'updatedAt'>,
): string {
  const taskId = `collab-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 创建任务
  const fullTask: Parameters<typeof createCollaborationTask>[0] = {
    id: taskId,
    title: taskData.title,
    description: taskData.description,
    teamId: taskData.teamId,
    assignedAgents: taskData.assignedAgents,
    status: 'pending',
    priority: taskData.priority || 'medium',
    progress: 0,
    dependencies: taskData.dependencies || [],
    context: taskData.context,
  };

  createCollaborationTask(fullTask);

  return taskId;
}
