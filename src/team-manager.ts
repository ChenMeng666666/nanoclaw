/**
 * 智能体团队管理器
 *
 * 负责智能体团队的创建、管理和协作模式
 * - 团队创建和解散
 * - 智能体角色分配
 * - 团队状态同步
 */

import {
  createTeamState,
  getTeamStateById,
  getAllTeamStates,
  updateTeamState,
  deleteTeamState,
} from './db.js';
import { sendAgentMessage } from './agent-communication.js';
import { logger } from './logger.js';
import { COLLABORATION_CONFIG } from './config.js';
import type { TeamState, TeamCollaborationState } from './types.js';

/**
 * 生成团队 ID
 */
function generateTeamId(): string {
  return `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 生成团队协作状态 ID
 */
function generateTeamCollaborationStateId(): string {
  return `team-collab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 创建团队
 */
export function createTeam(
  name: string,
  description?: string,
  members?: string[],
  collaborationMode?: 'hierarchical' | 'peer-to-peer' | 'swarm',
): string {
  const teamId = generateTeamId();

  createTeamState({
    id: teamId,
    name,
    description,
    members: members || [],
    leaderId: members?.[0],
    collaborationMode,
  });

  logger.info(
    { teamId, name, memberCount: members?.length || 0 },
    'Team created',
  );
  return teamId;
}

/**
 * 解散团队
 */
export function dissolveTeam(teamId: string): void {
  const team = getTeamStateById(teamId);
  if (!team) {
    logger.warn({ teamId }, 'Team not found');
    return;
  }

  deleteTeamState(teamId);
  logger.info({ teamId }, 'Team dissolved');
}

/**
 * 添加成员到团队
 */
export function addMemberToTeam(teamId: string, agentId: string): void {
  const team = getTeamStateById(teamId);
  if (!team) {
    logger.warn({ teamId }, 'Team not found');
    return;
  }

  if (team.members.includes(agentId)) {
    logger.debug({ teamId, agentId }, 'Agent already in team');
    return;
  }

  const newMembers = [...team.members, agentId];
  updateTeamState(teamId, {
    members: newMembers,
  });

  logger.info({ teamId, agentId }, 'Agent added to team');
}

/**
 * 从团队中移除成员
 */
export function removeMemberFromTeam(teamId: string, agentId: string): void {
  const team = getTeamStateById(teamId);
  if (!team) {
    logger.warn({ teamId }, 'Team not found');
    return;
  }

  if (!team.members.includes(agentId)) {
    logger.debug({ teamId, agentId }, 'Agent not in team');
    return;
  }

  const newMembers = team.members.filter((id) => id !== agentId);
  const updates: Parameters<typeof updateTeamState>[1] = {
    members: newMembers,
  };

  // 如果领导者被移除，选择新领导者
  if (team.leaderId === agentId && newMembers.length > 0) {
    updates.leaderId = newMembers[0];
  }

  updateTeamState(teamId, updates);
  logger.info({ teamId, agentId }, 'Agent removed from team');
}

/**
 * 分配团队角色
 */
export function assignTeamRole(
  teamId: string,
  agentId: string,
  role: 'leader' | 'member' | 'reviewer',
): void {
  const team = getTeamStateById(teamId);
  if (!team) {
    logger.warn({ teamId }, 'Team not found');
    return;
  }

  if (!team.members.includes(agentId)) {
    logger.warn({ teamId, agentId }, 'Agent not in team');
    return;
  }

  if (role === 'leader') {
    updateTeamState(teamId, {
      leaderId: agentId,
    });
    logger.info({ teamId, agentId }, 'Agent assigned as leader');
  }

  // 发送角色分配通知
  sendAgentMessage(
    'system',
    agentId,
    'notification',
    `你已被分配到团队 "${team.name}" 担任 ${role} 角色`,
    {
      teamId,
      role,
      teamName: team.name,
    },
  );
}

/**
 * 获取团队成员信息
 */
export function getTeamMembers(teamId: string): string[] {
  const team = getTeamStateById(teamId);
  return team ? team.members : [];
}

/**
 * 获取团队协作模式
 */
export function getCollaborationMode(
  teamId: string,
): TeamState['collaborationMode'] | null {
  const team = getTeamStateById(teamId);
  return team ? team.collaborationMode : null;
}

/**
 * 设置团队协作模式
 */
export function setCollaborationMode(
  teamId: string,
  mode: TeamState['collaborationMode'],
): void {
  const team = getTeamStateById(teamId);
  if (!team) {
    logger.warn({ teamId }, 'Team not found');
    return;
  }

  updateTeamState(teamId, {
    collaborationMode: mode,
  });

  logger.info({ teamId, mode }, 'Collaboration mode updated');
}

/**
 * 获取所有活跃团队
 */
export function getActiveTeams(): TeamState[] {
  return getAllTeamStates().filter((team) => team.status === 'active');
}

/**
 * 同步团队状态
 */
export function syncTeamState(teamId: string): void {
  const team = getTeamStateById(teamId);
  if (!team) {
    logger.warn({ teamId }, 'Team not found');
    return;
  }

  // 发送团队状态通知给所有成员
  team.members.forEach((agentId) => {
    sendAgentMessage(
      'system',
      agentId,
      'notification',
      JSON.stringify({
        type: 'teamState',
        id: team.id,
        name: team.name,
        description: team.description,
        members: team.members,
        leaderId: team.leaderId,
        collaborationMode: team.collaborationMode,
      }),
      {
        teamId: team.id,
        sync: true,
      },
    );
  });

  logger.debug({ teamId }, 'Team state synced');
}

/**
 * 检查团队状态和成员活跃性
 */
export function checkTeamHealth(teamId: string): {
  isHealthy: boolean;
  activeMembers: number;
  totalMembers: number;
  issues: string[];
} {
  const team = getTeamStateById(teamId);
  if (!team) {
    return {
      isHealthy: false,
      activeMembers: 0,
      totalMembers: 0,
      issues: ['Team not found'],
    };
  }

  const issues: string[] = [];
  const totalMembers = team.members.length;

  if (totalMembers < 2) {
    issues.push('Team has less than 2 members');
  }

  if (team.leaderId && !team.members.includes(team.leaderId)) {
    issues.push('Team leader not in members list');
  }

  return {
    isHealthy: issues.length === 0,
    activeMembers: totalMembers,
    totalMembers,
    issues,
  };
}

/**
 * 获取团队统计信息
 */
export function getTeamStatistics(): Array<{
  teamId: string;
  name: string;
  memberCount: number;
  collaborationMode: TeamState['collaborationMode'];
  leaderId?: string;
  status: string;
}> {
  return getAllTeamStates().map((team) => ({
    teamId: team.id,
    name: team.name,
    memberCount: team.members.length,
    collaborationMode: team.collaborationMode,
    leaderId: team.leaderId,
    status: team.status,
  }));
}
