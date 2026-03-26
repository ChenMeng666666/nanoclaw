import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAgentConfig,
  setAgentConfig,
  validateAgentConfig,
  deleteAgentConfig,
  hasAgentConfig,
  getAllAgentIds,
  clearAllConfigs,
} from './config.js';
import type { AgentConfig } from './types.js';

describe('Agent Configuration', () => {
  describe('validateAgentConfig', () => {
    it('should validate valid config', () => {
      const config: AgentConfig = {
        model_config: {
          model: 'claude-3-sonnet-20250219',
          base_url: 'https://api.anthropic.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject config without model', () => {
      const config: any = {
        model_config: {
          base_url: 'https://api.anthropic.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('model_config.model');
    });

    it('should reject config without base_url', () => {
      const config: any = {
        model_config: {
          model: 'claude-3-sonnet-20250219',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('model_config.base_url');
    });

    it('should reject config with invalid auth_mode', () => {
      const config: any = {
        model_config: {
          model: 'claude-3-sonnet-20250219',
          base_url: 'https://api.anthropic.com',
          auth_mode: 'invalid',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('model_config.auth_mode');
    });
  });

  describe('Global config management', () => {
    beforeEach(() => {
      clearAllConfigs();
    });

    it('should set and get agent config', () => {
      const config: AgentConfig = {
        model_config: {
          model: 'claude-3-sonnet-20250219',
          base_url: 'https://api.anthropic.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      const result = setAgentConfig('test-agent', config);
      expect(result).toBe(true);

      const retrieved = getAgentConfig('test-agent');
      expect(retrieved).toEqual(config);
    });

    it('should check if config exists', () => {
      const config: AgentConfig = {
        model_config: {
          model: 'claude-3-sonnet-20250219',
          base_url: 'https://api.anthropic.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      setAgentConfig('test-agent', config);
      expect(hasAgentConfig('test-agent')).toBe(true);
      expect(hasAgentConfig('nonexistent')).toBe(false);
    });

    it('should delete agent config', () => {
      const config: AgentConfig = {
        model_config: {
          model: 'claude-3-sonnet-20250219',
          base_url: 'https://api.anthropic.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      setAgentConfig('test-agent', config);
      expect(hasAgentConfig('test-agent')).toBe(true);

      const deleted = deleteAgentConfig('test-agent');
      expect(deleted).toBe(true);
      expect(hasAgentConfig('test-agent')).toBe(false);
    });

    it('should get all agent IDs', () => {
      const config: AgentConfig = {
        model_config: {
          model: 'claude-3-sonnet-20250219',
          base_url: 'https://api.anthropic.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      setAgentConfig('agent-1', config);
      setAgentConfig('agent-2', config);

      const ids = getAllAgentIds();
      expect(ids).toContain('agent-1');
      expect(ids).toContain('agent-2');
      expect(ids.length).toBe(2);
    });

    it('should clear all configs', () => {
      const config: AgentConfig = {
        model_config: {
          model: 'claude-3-sonnet-20250219',
          base_url: 'https://api.anthropic.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      setAgentConfig('agent-1', config);
      setAgentConfig('agent-2', config);

      clearAllConfigs();
      expect(getAllAgentIds().length).toBe(0);
    });

    it('should validate config before setting', () => {
      const invalidConfig: any = {
        model_config: {
          base_url: 'https://api.anthropic.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 1800000,
          memory_limit: '4g',
          mount_strategy: 'group_inherit',
          additional_mounts: [],
        },
      };

      const result = setAgentConfig('invalid-agent', invalidConfig);
      expect(result).toBe(false);
      expect(hasAgentConfig('invalid-agent')).toBe(false);
    });
  });
});
