import { describe, it, expect } from 'vitest';
import {
  Agent,
  AgentType,
  AgentStatus,
  AgentIdentity,
  ModelConfig,
  RuntimeConfig,
  AgentConfig,
  AgentGroupAssociation,
  CreateAgentInput,
  UpdateAgentInput,
} from './types.js';

describe('Agent Types', () => {
  describe('Agent Type', () => {
    it('should allow creating an Agent object', () => {
      const agent: Agent = {
        id: 'test-agent-id',
        name: 'Test Agent',
        role: 'Test Role',
        type: 'user',
        status: 'active',
        description: 'A test agent',
        systemPrompt: 'You are a test agent.',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      expect(agent).toBeTypeOf('object');
      expect(agent.id).toBe('test-agent-id');
    });
  });

  describe('AgentIdentity Type', () => {
    it('should allow creating an AgentIdentity object', () => {
      const identity: AgentIdentity = {
        name: 'Mimi',
        role: '首席决策辅助 / 团队大姐大',
        systemPrompt: '你是米米（Mimi），我的精神领袖与决策后盾...',
      };
      expect(identity).toBeTypeOf('object');
      expect(identity.name).toBe('Mimi');
    });
  });

  describe('ModelConfig Type', () => {
    it('should allow creating a ModelConfig object with proxy auth', () => {
      const modelConfig: ModelConfig = {
        model: 'claude-3-sonnet-20250219',
        baseUrl: 'https://api.anthropic.com',
        authMode: 'proxy',
      };
      expect(modelConfig).toBeTypeOf('object');
      expect(modelConfig.authMode).toBe('proxy');
    });

    it('should allow creating a ModelConfig object with direct auth', () => {
      const modelConfig: ModelConfig = {
        model: 'claude-3-sonnet-20250219',
        baseUrl: 'https://api.anthropic.com',
        authMode: 'direct',
      };
      expect(modelConfig.authMode).toBe('direct');
    });
  });

  describe('RuntimeConfig Type', () => {
    it('should allow creating a RuntimeConfig object with default values', () => {
      const runtimeConfig: RuntimeConfig = {
        containerTimeout: 1800000,
        memoryLimit: '4g',
        mountStrategy: 'group_inherit',
        additionalMounts: [],
      };
      expect(runtimeConfig).toBeTypeOf('object');
      expect(runtimeConfig.mountStrategy).toBe('group_inherit');
    });

    it('should allow creating a RuntimeConfig object with custom mount strategy', () => {
      const runtimeConfig: RuntimeConfig = {
        containerTimeout: 3600000,
        memoryLimit: '8g',
        mountStrategy: 'custom',
        additionalMounts: [
          {
            hostPath: '/test/path',
            containerPath: '/workspace/test',
            readonly: true,
          },
        ],
      };
      expect(runtimeConfig.mountStrategy).toBe('custom');
    });
  });

  describe('AgentConfig Type', () => {
    it('should allow creating a complete AgentConfig object', () => {
      const agentConfig: AgentConfig = {
        modelConfig: {
          model: 'claude-3-sonnet-20250219',
          baseUrl: 'https://api.anthropic.com',
          authMode: 'proxy',
        },
        runtimeConfig: {
          containerTimeout: 1800000,
          memoryLimit: '4g',
          mountStrategy: 'group_inherit',
          additionalMounts: [],
        },
      };
      expect(agentConfig).toBeTypeOf('object');
      expect(agentConfig.modelConfig).toBeDefined();
      expect(agentConfig.runtimeConfig).toBeDefined();
    });
  });

  describe('AgentGroupAssociation Type', () => {
    it('should allow creating an AgentGroupAssociation object', () => {
      const association: AgentGroupAssociation = {
        id: 'assoc-id',
        agentId: 'agent-id',
        groupFolder: 'test-group',
        isPrimary: true,
      };
      expect(association).toBeTypeOf('object');
      expect(association.isPrimary).toBe(true);
    });
  });

  describe('CreateAgentInput Type', () => {
    it('should allow creating a CreateAgentInput object', () => {
      const input: CreateAgentInput = {
        name: 'New Agent',
        role: 'New Role',
        type: 'user',
        identity: {
          name: 'New Agent',
          role: 'New Role',
        },
        config: {
          modelConfig: {
            model: 'claude-3-sonnet-20250219',
            baseUrl: 'https://api.anthropic.com',
            authMode: 'proxy',
          },
          runtimeConfig: {
            containerTimeout: 1800000,
            memoryLimit: '4g',
            mountStrategy: 'group_inherit',
            additionalMounts: [],
          },
        },
      };
      expect(input).toBeTypeOf('object');
      expect(input.type).toBe('user');
    });
  });

  describe('UpdateAgentInput Type', () => {
    it('should allow creating an UpdateAgentInput object with partial updates', () => {
      const input: UpdateAgentInput = {
        agentId: 'agent-id',
        updates: {
          name: 'Updated Name',
        },
      };
      expect(input).toBeTypeOf('object');
      expect(input.updates.name).toBe('Updated Name');
    });
  });

  describe('Enum Types', () => {
    it('should allow AgentType values', () => {
      const systemType: AgentType = 'system';
      const userType: AgentType = 'user';
      expect(systemType).toBe('system');
      expect(userType).toBe('user');
    });

    it('should allow AgentStatus values', () => {
      const active: AgentStatus = 'active';
      const paused: AgentStatus = 'paused';
      const archived: AgentStatus = 'archived';
      expect(active).toBe('active');
      expect(paused).toBe('paused');
      expect(archived).toBe('archived');
    });
  });
});
