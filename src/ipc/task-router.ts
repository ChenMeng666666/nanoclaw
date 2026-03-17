import { createTask, deleteTask, getTaskById, updateTask } from '../db.js';
import { isValidGroupFolder } from '../group-folder.js';
import { logger } from '../logger.js';
import { validateUserInput } from '../security.js';
import { canManageTask, canScheduleForTarget } from './auth.js';
import { computeNextRun } from './protocol.js';
import type { IpcDeps, TaskIpcPayload } from './types.js';

function parseScheduleType(
  value: string | undefined,
): 'cron' | 'interval' | 'once' | null {
  if (value === 'cron' || value === 'interval' || value === 'once') {
    return value;
  }
  return null;
}

export async function processTaskIpc(
  data: TaskIpcPayload,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        const promptValidation = validateUserInput(data.prompt);
        if (!promptValidation.valid) {
          logger.warn(
            { sourceGroup, issues: promptValidation.issues },
            'Blocked schedule_task due to unsafe prompt',
          );
          break;
        }

        const targetJid = data.targetJid;
        const targetGroupEntry = registeredGroups[targetJid];
        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }
        const targetFolder = targetGroupEntry.folder;
        if (!canScheduleForTarget(sourceGroup, isMain, targetFolder)) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = parseScheduleType(data.schedule_type);
        if (!scheduleType) {
          logger.warn(
            { scheduleType: data.schedule_type },
            'Invalid schedule type',
          );
          break;
        }

        const nextRun = computeNextRun(scheduleType, data.schedule_value);
        if (!nextRun) {
          logger.warn(
            { scheduleType, scheduleValue: data.schedule_value },
            'Invalid schedule value',
          );
          break;
        }

        const taskId =
          data.taskId ||
          `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && canManageTask(sourceGroup, isMain, task.group_folder)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && canManageTask(sourceGroup, isMain, task.group_folder)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && canManageTask(sourceGroup, isMain, task.group_folder)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'update_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (!task) {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Task not found for update',
          );
          break;
        }
        if (!canManageTask(sourceGroup, isMain, task.group_folder)) {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task update attempt',
          );
          break;
        }

        const updates: Parameters<typeof updateTask>[1] = {};
        if (data.prompt !== undefined) {
          const promptValidation = validateUserInput(data.prompt);
          if (!promptValidation.valid) {
            logger.warn(
              {
                taskId: data.taskId,
                sourceGroup,
                issues: promptValidation.issues,
              },
              'Blocked update_task due to unsafe prompt',
            );
            break;
          }
          updates.prompt = data.prompt;
        }
        if (data.schedule_type !== undefined) {
          const typedSchedule = parseScheduleType(data.schedule_type);
          if (!typedSchedule) {
            logger.warn(
              { taskId: data.taskId, scheduleType: data.schedule_type },
              'Invalid schedule type in task update',
            );
            break;
          }
          updates.schedule_type = typedSchedule;
        }
        if (data.schedule_value !== undefined) {
          updates.schedule_value = data.schedule_value;
        }

        if (
          data.schedule_type !== undefined ||
          data.schedule_value !== undefined
        ) {
          if (
            data.schedule_type !== undefined &&
            data.schedule_value === undefined
          ) {
            logger.warn(
              { taskId: data.taskId, scheduleType: data.schedule_type },
              'Task update rejected: schedule_value is required when schedule_type changes',
            );
            break;
          }
          const updatedTask = {
            ...task,
            ...updates,
          };
          const nextRun = computeNextRun(
            updatedTask.schedule_type as 'cron' | 'interval' | 'once',
            updatedTask.schedule_value,
          );
          if (!nextRun) {
            logger.warn(
              { taskId: data.taskId, value: updatedTask.schedule_value },
              'Invalid schedule value in task update',
            );
            break;
          }
          updates.next_run = nextRun;
        }

        updateTask(data.taskId, updates);
        logger.info(
          { taskId: data.taskId, sourceGroup, updates },
          'Task updated via IPC',
        );
      }
      break;

    case 'refresh_groups':
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await deps.syncGroups(true);
        const availableGroups = deps.getAvailableGroups();
        deps.writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        if (!isValidGroupFolder(data.folder)) {
          logger.warn(
            { sourceGroup, folder: data.folder },
            'Invalid register_group request - unsafe folder name',
          );
          break;
        }
        deps.registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          requiresTrigger: data.requiresTrigger,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}
