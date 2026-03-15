import type http from 'http';
import type { URL } from 'url';

import {
  createBotIdentity,
  createCollaborationTask,
  getAllCollaborationTasks,
  getAllTeamStates,
  getBotIdentityByChatJid,
  updateCollaborationTask,
  updateTeamState,
} from '../../../db.js';
import {
  getAgentMessageStatus,
  receiveAgentMessages,
  sendAgentMessage,
} from '../../../agent-communication.js';
import { updateTaskProgress } from '../../../collaboration-scheduler.js';
import {
  addMemberToTeam,
  checkTeamHealth,
  createTeam,
  removeMemberFromTeam,
} from '../../../team-manager.js';
import { readJSON } from '../parsers/runtime-api-parsers.js';
import { writeJSON } from '../response.js';

export async function handleLearningCollaborationEndpoints(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  path: string,
): Promise<boolean> {
  if (path === '/api/collaboration/messages/send' && req.method === 'POST') {
    const body = await readJSON(req);
    const { fromAgentId, toAgentId, type, content, metadata } = body;

    if (!fromAgentId || !toAgentId || !type || !content) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    const messageId = sendAgentMessage(
      fromAgentId as string,
      toAgentId as string,
      type as any,
      content as string,
      metadata as Record<string, unknown>,
    );

    writeJSON(res, 200, { id: messageId, status: 'sent' });
    return true;
  }

  if (path === '/api/collaboration/messages/receive' && req.method === 'POST') {
    const body = await readJSON(req);
    const { agentId } = body;

    if (!agentId) {
      writeJSON(res, 400, { error: 'Missing agentId' });
      return true;
    }

    const messages = receiveAgentMessages(agentId as string);
    writeJSON(res, 200, { messages });
    return true;
  }

  if (path === '/api/collaboration/messages/status' && req.method === 'GET') {
    const messageId = url.searchParams.get('messageId');

    if (!messageId) {
      writeJSON(res, 400, { error: 'Missing messageId' });
      return true;
    }

    const status = getAgentMessageStatus(messageId);
    writeJSON(res, 200, { status });
    return true;
  }

  if (path === '/api/collaboration/tasks' && req.method === 'GET') {
    const status = url.searchParams.get('status');
    const teamId = url.searchParams.get('teamId');

    let tasks = getAllCollaborationTasks();

    if (status) {
      tasks = tasks.filter((t: { status?: string }) => t.status === status);
    }

    if (teamId) {
      tasks = tasks.filter((t: { teamId?: string }) => t.teamId === teamId);
    }

    writeJSON(res, 200, { tasks });
    return true;
  }

  if (path === '/api/collaboration/task/create' && req.method === 'POST') {
    const body = await readJSON(req);
    const {
      title,
      description,
      teamId,
      assignedAgents,
      status,
      priority,
      dependencies,
      context,
    } = body;

    if (!title || !assignedAgents) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    const taskId = `collab-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createCollaborationTask({
      id: taskId,
      title: String(title),
      description: description as string | undefined,
      teamId: teamId as string | undefined,
      assignedAgents: Array.isArray(assignedAgents) ? assignedAgents : [],
      status:
        (status as 'pending' | 'in_progress' | 'completed' | 'failed') ||
        'pending',
      priority:
        (priority as 'low' | 'medium' | 'high' | 'critical') || 'medium',
      dependencies: Array.isArray(dependencies) ? dependencies : [],
      context: context as string | undefined,
      progress: 0,
    });

    writeJSON(res, 200, { id: taskId, status: 'created' });
    return true;
  }

  if (path === '/api/collaboration/task/update' && req.method === 'POST') {
    const body = await readJSON(req);
    const { taskId, updates } = body;

    if (!taskId || !updates) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    updateCollaborationTask(
      taskId as string,
      updates as Parameters<typeof updateCollaborationTask>[1],
    );

    writeJSON(res, 200, { success: true });
    return true;
  }

  if (path === '/api/collaboration/task/progress' && req.method === 'POST') {
    const body = await readJSON(req);
    const { taskId, progress, status } = body;

    if (!taskId || progress === undefined) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    updateTaskProgress(
      taskId as string,
      Number(progress),
      status as 'pending' | 'in_progress' | 'completed' | 'failed' | undefined,
    );

    writeJSON(res, 200, { success: true });
    return true;
  }

  if (path === '/api/collaboration/teams' && req.method === 'GET') {
    const teams = getAllTeamStates();
    writeJSON(res, 200, { teams });
    return true;
  }

  if (path === '/api/collaboration/team/create' && req.method === 'POST') {
    const body = await readJSON(req);
    const { name, description, members, collaborationMode } = body;

    if (!name) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    const teamId = createTeam(
      String(name),
      description as string | undefined,
      Array.isArray(members) ? members : [],
      collaborationMode as
        | 'hierarchical'
        | 'peer-to-peer'
        | 'swarm'
        | undefined,
    );

    writeJSON(res, 200, { id: teamId, status: 'created' });
    return true;
  }

  if (path === '/api/collaboration/team/update' && req.method === 'POST') {
    const body = await readJSON(req);
    const { teamId, updates } = body;

    if (!teamId || !updates) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    updateTeamState(teamId as string, updates as any);
    writeJSON(res, 200, { success: true });
    return true;
  }

  if (path === '/api/collaboration/team/add-member' && req.method === 'POST') {
    const body = await readJSON(req);
    const { teamId, agentId } = body;

    if (!teamId || !agentId) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    addMemberToTeam(teamId as string, agentId as string);
    writeJSON(res, 200, { success: true });
    return true;
  }

  if (
    path === '/api/collaboration/team/remove-member' &&
    req.method === 'POST'
  ) {
    const body = await readJSON(req);
    const { teamId, agentId } = body;

    if (!teamId || !agentId) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    removeMemberFromTeam(teamId as string, agentId as string);
    writeJSON(res, 200, { success: true });
    return true;
  }

  if (path === '/api/collaboration/team/health' && req.method === 'GET') {
    const teamId = url.searchParams.get('teamId');

    if (!teamId) {
      writeJSON(res, 400, { error: 'Missing teamId' });
      return true;
    }

    const health = checkTeamHealth(teamId as string);
    writeJSON(res, 200, health);
    return true;
  }

  if (path === '/api/collaboration/bot-identity' && req.method === 'GET') {
    const chatJid = url.searchParams.get('chatJid');

    if (!chatJid) {
      writeJSON(res, 400, { error: 'Missing chatJid' });
      return true;
    }

    const identity = getBotIdentityByChatJid(chatJid);
    writeJSON(res, 200, { identity });
    return true;
  }

  if (
    path === '/api/collaboration/bot-identity/create' &&
    req.method === 'POST'
  ) {
    const body = await readJSON(req);
    const { chatJid, agentId, botName, botAvatar, config } = body;

    if (!chatJid || !agentId || !botName) {
      writeJSON(res, 400, { error: 'Missing required fields' });
      return true;
    }

    const identityId = `bot-identity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createBotIdentity({
      id: identityId,
      chatJid: String(chatJid),
      agentId: String(agentId),
      botName: String(botName),
      botAvatar: botAvatar as string | undefined,
      config: config as Record<string, unknown> | undefined,
    });

    writeJSON(res, 200, { id: identityId, status: 'created' });
    return true;
  }

  return false;
}
