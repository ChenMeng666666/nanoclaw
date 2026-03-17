import type { RegisteredGroup } from '../types/core-runtime.js';

export function canSendMessage(
  registeredGroups: Record<string, RegisteredGroup>,
  sourceGroup: string,
  isMain: boolean,
  chatJid: string,
): boolean {
  const targetGroup = registeredGroups[chatJid];
  return isMain || Boolean(targetGroup && targetGroup.folder === sourceGroup);
}

export function canScheduleForTarget(
  sourceGroup: string,
  isMain: boolean,
  targetFolder: string,
): boolean {
  return isMain || targetFolder === sourceGroup;
}

export function canManageTask(
  sourceGroup: string,
  isMain: boolean,
  taskGroupFolder: string,
): boolean {
  return isMain || taskGroupFolder === sourceGroup;
}
