// src/custom/agent/db.ts
import { getDb } from '../../db.js';
import type {
  Agent,
  AgentGroupAssociation,
  CreateAgentInput,
  UpdateAgentInput,
  ListAgentsInput,
  BindAgentToGroupInput,
} from './types.js';

// 生成唯一 ID 的简单函数
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// --- Agent CRUD Operations ---

/**
 * 创建一个新的 agent
 */
export function createAgent(input: CreateAgentInput): Agent {
  const db = getDb();
  const now = new Date().toISOString();

  const agent: Agent = {
    id: generateId(),
    name: input.name,
    role: input.role,
    type: input.type || 'user',
    status: 'active',
    description: input.identity?.system_prompt || input.identity?.role,
    system_prompt: input.identity?.system_prompt,
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO agents (
      id, name, role, type, status, description, system_prompt, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agent.id,
    agent.name,
    agent.role,
    agent.type,
    agent.status,
    agent.description,
    agent.system_prompt,
    agent.created_at,
    agent.updated_at,
  );

  return agent;
}

/**
 * 根据 ID 获取 agent
 */
export function getAgentById(id: string): Agent | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as
    | Agent
    | undefined;

  return row;
}

/**
 * 更新 agent
 */
export function updateAgent(input: UpdateAgentInput): Agent | undefined {
  const db = getDb();
  const now = new Date().toISOString();

  const { agentId, updates } = input;
  const existing = getAgentById(agentId);

  if (!existing) {
    return undefined;
  }

  const updatedAgent: Agent = {
    ...existing,
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.role !== undefined ? { role: updates.role } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    ...(updates.identity?.system_prompt !== undefined
      ? { system_prompt: updates.identity.system_prompt }
      : {}),
    ...(updates.identity?.role !== undefined ? { role: updates.identity.role } : {}),
    updated_at: now,
  };

  db.prepare(`
    UPDATE agents SET
      name = ?,
      role = ?,
      type = ?,
      status = ?,
      description = ?,
      system_prompt = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    updatedAgent.name,
    updatedAgent.role,
    updatedAgent.type,
    updatedAgent.status,
    updatedAgent.description,
    updatedAgent.system_prompt,
    updatedAgent.updated_at,
    agentId,
  );

  return updatedAgent;
}

/**
 * 删除 agent
 */
export function deleteAgent({
  agentId,
  keepWorkspace = false,
}: {
  agentId: string;
  keepWorkspace?: boolean;
}): boolean {
  const db = getDb();

  // 删除关联
  db.prepare('DELETE FROM agent_group_associations WHERE agent_id = ?').run(
    agentId,
  );
  // 删除 agent
  const result = db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);

  return result.changes > 0;
}

/**
 * 列出所有 agent
 */
export function listAgents(input: ListAgentsInput = {}): Agent[] {
  const db = getDb();
  let sql = 'SELECT * FROM agents';
  const params: any[] = [];

  const conditions: string[] = [];
  if (input.status) {
    conditions.push('status = ?');
    params.push(input.status);
  }
  if (input.type) {
    conditions.push('type = ?');
    params.push(input.type);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY created_at DESC';

  return db.prepare(sql).all(...params) as Agent[];
}

// --- Agent-Group Association Operations ---

/**
 * 绑定 agent 到 group
 */
export function bindAgentToGroup(input: BindAgentToGroupInput): AgentGroupAssociation {
  const db = getDb();
  const association: AgentGroupAssociation = {
    id: generateId(),
    agent_id: input.agentId,
    group_folder: input.groupFolder,
    is_primary: input.isPrimary ? 1 : 0,
  };

  db.prepare(`
    INSERT OR REPLACE INTO agent_group_associations (
      id, agent_id, group_folder, is_primary
    ) VALUES (?, ?, ?, ?)
  `).run(
    association.id,
    association.agent_id,
    association.group_folder,
    association.is_primary,
  );

  // 如果设置为 primary，确保同一 group 的其他 association 不是 primary
  if (input.isPrimary) {
    db.prepare(`
      UPDATE agent_group_associations
      SET is_primary = 0
      WHERE group_folder = ? AND agent_id != ?
    `).run(input.groupFolder, input.agentId);
  }

  return association;
}

/**
 * 取消绑定 agent 从 group
 */
export function unbindAgentFromGroup(agentId: string, groupFolder: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM agent_group_associations
    WHERE agent_id = ? AND group_folder = ?
  `).run(agentId, groupFolder);

  return result.changes > 0;
}

/**
 * 获取 agent 的所有 group 关联
 */
export function getAgentGroups(agentId: string): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT group_folder FROM agent_group_associations
    WHERE agent_id = ?
  `).all(agentId) as Array<{ group_folder: string }>;

  return rows.map(row => row.group_folder);
}

/**
 * 获取 group 的所有 agent 关联
 */
export function getGroupAgents(groupFolder: string): Agent[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.* FROM agents a
    JOIN agent_group_associations aga ON a.id = aga.agent_id
    WHERE aga.group_folder = ?
  `).all(groupFolder) as Agent[];

  return rows;
}

/**
 * 获取 group 的主要 agent
 */
export function getPrimaryAgentForGroup(groupFolder: string): Agent | undefined {
  const db = getDb();
  const row = db.prepare(`
    SELECT a.* FROM agents a
    JOIN agent_group_associations aga ON a.id = aga.agent_id
    WHERE aga.group_folder = ? AND aga.is_primary = 1
  `).get(groupFolder) as Agent | undefined;

  return row;
}
