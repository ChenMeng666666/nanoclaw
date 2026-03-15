import type Database from 'better-sqlite3';
import type {
  RegisteredGroup,
  ScheduledTask,
  TaskRunLog,
} from '../../../types/core-runtime.js';
import { getDatabase as getPersistenceDatabase } from '../sqlite/transaction-manager.js';
import * as taskRepository from '../repositories/task-repository.js';
import * as routingRepository from '../repositories/routing-repository.js';
import * as botIdentityRepository from '../repositories/bot-identity-repository.js';
import * as collaborationTaskRepository from '../repositories/collaboration-task-repository.js';
import * as teamStateRepository from '../repositories/team-state-repository.js';
import * as operationSnapshotRepository from '../repositories/operation-snapshot-repository.js';

const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const database = getPersistenceDatabase() as unknown as Record<
      string,
      unknown
    >;
    const value = database[property as keyof typeof database];
    if (typeof value === 'function') {
      return value.bind(database);
    }
    return value;
  },
});

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  taskRepository.createTask(db, task);
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return taskRepository.getTaskById(db, id);
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return taskRepository.getTasksForGroup(db, groupFolder);
}

export function getAllTasks(): ScheduledTask[] {
  return taskRepository.getAllTasks(db);
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'
    >
  >,
): void {
  taskRepository.updateTask(db, id, updates);
}

export function deleteTask(id: string): void {
  taskRepository.deleteTask(db, id);
}

export function getDueTasks(): ScheduledTask[] {
  return taskRepository.getDueTasks(db);
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  taskRepository.updateTaskAfterRun(db, id, nextRun, lastResult);
}

export function logTaskRun(log: TaskRunLog): void {
  taskRepository.logTaskRun(db, log);
}

export function getRouterState(key: string): string | undefined {
  return routingRepository.getRouterState(db, key);
}

export function setRouterState(key: string, value: string): void {
  routingRepository.setRouterState(db, key, value);
}

export function getSession(groupFolder: string): string | undefined {
  return routingRepository.getSession(db, groupFolder);
}

export function setSession(groupFolder: string, sessionId: string): void {
  routingRepository.setSession(db, groupFolder, sessionId);
}

export function getAllSessions(): Record<string, string> {
  return routingRepository.getAllSessions(db);
}

export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  return routingRepository.getRegisteredGroup(db, jid);
}

export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  routingRepository.setRegisteredGroup(db, jid, group);
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  return routingRepository.getAllRegisteredGroups(db);
}

export function beginTransaction(): void {
  db.exec('BEGIN TRANSACTION');
}

export function commit(): void {
  db.exec('COMMIT');
}

export function rollback(): void {
  db.exec('ROLLBACK');
}

export type OperationSnapshot = operationSnapshotRepository.OperationSnapshot;

export function createOperationSnapshot(
  snapshot: Omit<OperationSnapshot, 'id'>,
): number {
  return operationSnapshotRepository.createOperationSnapshot(db, snapshot);
}

export function getOperationSnapshotByOperationId(
  operationId: string,
): OperationSnapshot | undefined {
  return operationSnapshotRepository.getOperationSnapshotByOperationId(
    db,
    operationId,
  );
}

export function updateOperationSnapshot(
  operationId: string,
  updates: Partial<OperationSnapshot>,
): void {
  operationSnapshotRepository.updateOperationSnapshot(db, operationId, updates);
}

export function getOperationSnapshots(
  query: {
    status?: 'pending' | 'applied' | 'rolled_back';
    operationType?: string;
    groupFolder?: string;
    chatJid?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  } = {},
): OperationSnapshot[] {
  return operationSnapshotRepository.getOperationSnapshots(db, query);
}

export function deleteOperationSnapshot(operationId: string): void {
  operationSnapshotRepository.deleteOperationSnapshot(db, operationId);
}

export function cleanupOperationSnapshots(keepDays: number = 7): void {
  operationSnapshotRepository.cleanupOperationSnapshots(db, keepDays);
}

export function createBotIdentity(identity: {
  id: string;
  chatJid: string;
  agentId: string;
  botName: string;
  botAvatar?: string;
  config?: Record<string, unknown>;
}): void {
  botIdentityRepository.createBotIdentity(db, identity);
}

export function getBotIdentityByChatJid(chatJid: string) {
  return botIdentityRepository.getBotIdentityByChatJid(db, chatJid);
}

export function getAllBotIdentities() {
  return botIdentityRepository.getAllBotIdentities(db);
}

export function updateBotIdentity(
  id: string,
  updates: Partial<{
    chatJid?: string;
    agentId?: string;
    botName?: string;
    botAvatar?: string;
    config?: Record<string, unknown>;
    isActive?: boolean;
  }>,
): void {
  botIdentityRepository.updateBotIdentity(db, id, updates);
}

export function deleteBotIdentity(id: string): void {
  botIdentityRepository.deleteBotIdentity(db, id);
}

export function createCollaborationTask(task: {
  id: string;
  title: string;
  description?: string;
  teamId?: string;
  assignedAgents: string[];
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  progress?: number;
  dependencies?: string[];
  context?: string;
}): void {
  collaborationTaskRepository.createCollaborationTask(db, task);
}

export function getCollaborationTaskById(id: string) {
  return collaborationTaskRepository.getCollaborationTaskById(db, id);
}

export function getAllCollaborationTasks() {
  return collaborationTaskRepository.getAllCollaborationTasks(db);
}

export function updateCollaborationTask(
  id: string,
  updates: Partial<{
    title?: string;
    description?: string;
    teamId?: string;
    assignedAgents?: string[];
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    progress?: number;
    dependencies?: string[];
    context?: string;
    completedAt?: string;
  }>,
): void {
  collaborationTaskRepository.updateCollaborationTask(db, id, updates);
}

export function deleteCollaborationTask(id: string): void {
  collaborationTaskRepository.deleteCollaborationTask(db, id);
}

export function createTeamState(team: {
  id: string;
  name: string;
  description?: string;
  members: string[];
  leaderId?: string;
  collaborationMode?: 'hierarchical' | 'peer-to-peer' | 'swarm';
}): void {
  teamStateRepository.createTeamState(db, team);
}

export function getTeamStateById(id: string) {
  return teamStateRepository.getTeamStateById(db, id);
}

export function getAllTeamStates() {
  return teamStateRepository.getAllTeamStates(db);
}

export function updateTeamState(
  id: string,
  updates: Partial<{
    name?: string;
    description?: string;
    members?: string[];
    leaderId?: string;
    status?: 'active' | 'inactive' | 'dissolved';
    collaborationMode?: 'hierarchical' | 'peer-to-peer' | 'swarm';
  }>,
): void {
  teamStateRepository.updateTeamState(db, id, updates);
}

export function deleteTeamState(id: string): void {
  teamStateRepository.deleteTeamState(db, id);
}

export function createTeamCollaborationState(state: {
  id: string;
  teamId: string;
  taskId?: string;
  status?: 'planning' | 'executing' | 'reviewing' | 'completed';
  progress?: number;
  activeAgents: string[];
}): void {
  teamStateRepository.createTeamCollaborationState(db, state);
}

export function getTeamCollaborationStateById(id: string) {
  return teamStateRepository.getTeamCollaborationStateById(db, id);
}

export function updateTeamCollaborationState(
  id: string,
  updates: Partial<{
    taskId?: string;
    status?: 'planning' | 'executing' | 'reviewing' | 'completed';
    progress?: number;
    activeAgents?: string[];
    lastActivity?: string;
  }>,
): void {
  teamStateRepository.updateTeamCollaborationState(db, id, updates);
}

export function deleteTeamCollaborationState(id: string): void {
  teamStateRepository.deleteTeamCollaborationState(db, id);
}

export function transaction<T>(fn: () => T): T {
  beginTransaction();
  try {
    const result = fn();
    commit();
    return result;
  } catch (error) {
    rollback();
    throw error;
  }
}
