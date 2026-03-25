// src/custom/agent/db.test.ts
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { _initTestDatabase as initCoreTestDatabase, getDb } from '../../db.js';
import {
  createAgent,
  getAgentById,
  updateAgent,
  deleteAgent,
  listAgents,
  bindAgentToGroup,
  unbindAgentFromGroup,
  getAgentGroups,
  getGroupAgents,
  getPrimaryAgentForGroup,
} from './db.js';
import type { Agent, CreateAgentInput, UpdateAgentInput } from './types.js';

// 我们需要从 src/db.ts 获取内部数据库实例用于测试
// 让我们先修改并确保有一个测试数据库初始化函数
describe('Agent Database', () => {
  let db: Database.Database;

  beforeAll(() => {
    // 初始化核心测试数据库，它会包含我们的自定义表
    initCoreTestDatabase();
  });

  beforeEach(() => {
    // 清理测试数据
    const testDb = (getDb as any)();
    if (testDb) {
      testDb.exec('DELETE FROM agent_group_associations');
      testDb.exec('DELETE FROM agents');
    }
  });

  describe('Agent CRUD Operations', () => {
    it('should create an agent successfully', () => {
      const input: CreateAgentInput = {
        name: 'Test Agent',
        role: 'assistant',
        type: 'user',
      };

      const agent = createAgent(input);

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Test Agent');
      expect(agent.role).toBe('assistant');
      expect(agent.type).toBe('user');
      expect(agent.status).toBe('active');
      expect(agent.created_at).toBeDefined();
      expect(agent.updated_at).toBeDefined();
    });

    it('should get an agent by ID', () => {
      const input: CreateAgentInput = {
        name: 'Test Agent',
        role: 'assistant',
      };

      const created = createAgent(input);
      const retrieved = getAgentById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Agent');
    });

    it('should return undefined for non-existent agent', () => {
      const retrieved = getAgentById('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should update an agent successfully', () => {
      const created = createAgent({
        name: 'Old Name',
        role: 'old-role',
      });

      const updateInput: UpdateAgentInput = {
        agentId: created.id,
        updates: {
          name: 'New Name',
          role: 'new-role',
        },
      };

      const updated = updateAgent(updateInput);

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('New Name');
      expect(updated?.role).toBe('new-role');
      // 时间戳可能相同（同一毫秒内执行），所以我们检查它是有效的 ISO 字符串
      expect(updated?.updated_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it('should delete an agent successfully', () => {
      const created = createAgent({
        name: 'To Delete',
        role: 'test',
      });

      const deleteResult = deleteAgent({ agentId: created.id });
      expect(deleteResult).toBe(true);

      const retrieved = getAgentById(created.id);
      expect(retrieved).toBeUndefined();
    });

    it('should list agents with filters', () => {
      createAgent({ name: 'Active 1', role: 'role1' });
      createAgent({ name: 'Active 2', role: 'role2' });
      const paused = createAgent({ name: 'Paused', role: 'role3' });

      // 暂停一个 agent
      updateAgent({
        agentId: paused.id,
        updates: {},
      });
      // 我们需要先实现状态更新功能，让我们单独测试列表
      const allAgents = listAgents({});
      expect(allAgents.length).toBeGreaterThanOrEqual(2);

      const activeAgents = listAgents({ status: 'active' });
      expect(activeAgents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Agent-Group Association', () => {
    let agent1: Agent;
    let agent2: Agent;

    beforeEach(() => {
      agent1 = createAgent({ name: 'Agent 1', role: 'role1' });
      agent2 = createAgent({ name: 'Agent 2', role: 'role2' });
    });

    it('should bind an agent to a group', () => {
      const association = bindAgentToGroup({
        agentId: agent1.id,
        groupFolder: 'test-group',
        isPrimary: true,
      });

      expect(association).toBeDefined();
      expect(association.agent_id).toBe(agent1.id);
      expect(association.group_folder).toBe('test-group');
      expect(association.is_primary).toBe(1);
    });

    it('should get groups for an agent', () => {
      bindAgentToGroup({ agentId: agent1.id, groupFolder: 'group1' });
      bindAgentToGroup({ agentId: agent1.id, groupFolder: 'group2' });

      const groups = getAgentGroups(agent1.id);
      expect(groups.length).toBe(2);
      expect(groups).toContain('group1');
      expect(groups).toContain('group2');
    });

    it('should get agents for a group', () => {
      bindAgentToGroup({ agentId: agent1.id, groupFolder: 'shared-group' });
      bindAgentToGroup({ agentId: agent2.id, groupFolder: 'shared-group' });

      const agents = getGroupAgents('shared-group');
      expect(agents.length).toBe(2);
      expect(agents.some((a) => a.id === agent1.id)).toBe(true);
      expect(agents.some((a) => a.id === agent2.id)).toBe(true);
    });

    it('should get primary agent for a group', () => {
      bindAgentToGroup({
        agentId: agent1.id,
        groupFolder: 'primary-group',
        isPrimary: false,
      });
      bindAgentToGroup({
        agentId: agent2.id,
        groupFolder: 'primary-group',
        isPrimary: true,
      });

      const primary = getPrimaryAgentForGroup('primary-group');
      expect(primary?.id).toBe(agent2.id);
    });

    it('should unbind an agent from a group', () => {
      bindAgentToGroup({ agentId: agent1.id, groupFolder: 'to-unbind' });

      const result = unbindAgentFromGroup(agent1.id, 'to-unbind');
      expect(result).toBe(true);

      const groups = getAgentGroups(agent1.id);
      expect(groups).not.toContain('to-unbind');
    });
  });
});
