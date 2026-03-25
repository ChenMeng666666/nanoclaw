import { describe, it, expect, beforeEach } from 'vitest';
import { AgentConfig, getAgentConfig, setAgentConfig, validateAgentConfig } from './config';

describe('Agent Configuration', () => {
  describe('validateAgentConfig', () => {
    it('should validate valid config', () => {
      const config: AgentConfig = {
        name: 'test-agent',
        model: 'claude-3-sonnet-20250219',
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 60000,
        memorySize: 100,
        reflectionEnabled: true,
        autoSave: true,
        logLevel: 'info'
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate config with default values', () => {
      const config: AgentConfig = {
        name: 'test-agent',
        model: 'claude-3-sonnet-20250219'
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should reject config without name', () => {
      const config: any = {
        model: 'claude-3-sonnet-20250219'
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name');
    });

    it('should reject config without model', () => {
      const config: any = {
        name: 'test-agent'
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('model');
    });

    it('should reject config with invalid temperature', () => {
      const config: any = {
        name: 'test-agent',
        model: 'claude-3-sonnet-20250219',
        temperature: 2.0
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('temperature');
    });

    it('should reject config with invalid maxTokens', () => {
      const config: any = {
        name: 'test-agent',
        model: 'claude-3-sonnet-20250219',
        maxTokens: 0
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('maxTokens');
    });

    it('should reject config with invalid timeout', () => {
      const config: any = {
        name: 'test-agent',
        model: 'claude-3-sonnet-20250219',
        timeout: -1000
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('timeout');
    });

    it('should reject config with invalid logLevel', () => {
      const config: any = {
        name: 'test-agent',
        model: 'claude-3-sonnet-20250219',
        logLevel: 'invalid'
      };

      const result = validateAgentConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('logLevel');
    });
  });

  describe('AgentConfig methods', () => {
    let config: AgentConfig;

    beforeEach(() => {
      config = {
        name: 'test-agent',
        model: 'claude-3-sonnet-20250219'
      };
    });

    it('should create config instance', () => {
      const agentConfig = new AgentConfig(config);
      expect(agentConfig).toBeInstanceOf(AgentConfig);
      expect(agentConfig.get('name')).toBe(config.name);
      expect(agentConfig.get('model')).toBe(config.model);
    });

    it('should get config values', () => {
      const agentConfig = new AgentConfig(config);
      expect(agentConfig.get('name')).toBe(config.name);
      expect(agentConfig.get('model')).toBe(config.model);
      expect(agentConfig.get('temperature')).toBe(0.7); // default
    });

    it('should set config values', () => {
      const agentConfig = new AgentConfig(config);
      agentConfig.set('temperature', 0.5);
      expect(agentConfig.get('temperature')).toBe(0.5);
    });

    it('should set multiple config values', () => {
      const agentConfig = new AgentConfig(config);
      agentConfig.setAll({
        temperature: 0.5,
        maxTokens: 5000,
        logLevel: 'debug'
      });

      expect(agentConfig.get('temperature')).toBe(0.5);
      expect(agentConfig.get('maxTokens')).toBe(5000);
      expect(agentConfig.get('logLevel')).toBe('debug');
    });

    it('should get all config values', () => {
      const agentConfig = new AgentConfig(config);
      const allConfig = agentConfig.getAll();
      expect(allConfig).toEqual(expect.objectContaining({
        name: config.name,
        model: config.model
      }));
    });

    it('should validate config instance', () => {
      const agentConfig = new AgentConfig(config);
      const validation = agentConfig.validate();
      expect(validation.valid).toBe(true);
    });

    it('should convert to JSON', () => {
      const agentConfig = new AgentConfig(config);
      const json = agentConfig.toJSON();
      expect(json).toEqual(expect.objectContaining({
        name: config.name,
        model: config.model
      }));
    });
  });

  describe('Global config management', () => {
    it('should get agent config', () => {
      // First set config before getting
      const initialConfig: AgentConfig = {
        name: 'test-agent',
        model: 'claude-3-sonnet-20250219'
      };
      setAgentConfig('test-agent', initialConfig);

      const config = getAgentConfig('test-agent');
      expect(config).toBeDefined();
    });

    it('should set agent config', () => {
      const config: AgentConfig = {
        name: 'new-agent',
        model: 'claude-3-sonnet-20250219',
        temperature: 0.8
      };

      const result = setAgentConfig('new-agent', config);
      expect(result).toBe(true);

      const retrieved = getAgentConfig('new-agent');
      expect(retrieved).toEqual(expect.objectContaining({
        name: 'new-agent',
        model: 'claude-3-sonnet-20250219',
        temperature: 0.8
      }));
    });

    it('should set config with defaults', () => {
      const config: Partial<AgentConfig> = {
        name: 'agent-with-defaults',
        model: 'claude-3-sonnet-20250219'
      };

      setAgentConfig('agent-with-defaults', config as AgentConfig);
      const retrieved = getAgentConfig('agent-with-defaults');

      expect(retrieved.temperature).toBe(0.7);
      expect(retrieved.maxTokens).toBe(4000);
      expect(retrieved.timeout).toBe(60000);
    });

    it('should validate config before setting', () => {
      const invalidConfig: any = {
        name: 'invalid-agent',
        model: 'claude-3-sonnet-20250219',
        temperature: 2.0
      };

      const result = setAgentConfig('invalid-agent', invalidConfig);
      expect(result).toBe(false);

      const retrieved = getAgentConfig('invalid-agent');
      expect(retrieved).toBeUndefined();
    });
  });
});
