import { describe, it, expect } from 'vitest';
import {
  AgentConfigSchema,
  AgentIdentitySchema,
  ModelConfigSchema,
  RuntimeConfigSchema,
  AdditionalMountSchema,
  convertToCamelCase,
  convertToSnakeCase,
  isAgentConfig,
  isAgentIdentity,
  validateAgentConfig,
  validateAgentIdentity,
  mergeAgentConfig,
} from './types';

describe('Agent Types - Schema Validation', () => {
  describe('Zod Schemas', () => {
    it('should validate ModelConfig with default values', () => {
      const config = ModelConfigSchema.parse({});
      expect(config).toEqual({
        model: 'claude-3-sonnet-20250219',
        baseUrl: 'https://api.anthropic.com',
        authMode: 'proxy',
      });
    });

    it('should validate ModelConfig with custom values', () => {
      const config = ModelConfigSchema.parse({
        model: 'claude-3-opus-20250219',
        baseUrl: 'https://api.example.com',
        authMode: 'direct',
      });
      expect(config).toEqual({
        model: 'claude-3-opus-20250219',
        baseUrl: 'https://api.example.com',
        authMode: 'direct',
      });
    });

    it('should validate RuntimeConfig with default values', () => {
      const config = RuntimeConfigSchema.parse({});
      expect(config).toEqual({
        containerTimeout: 300000,
        memoryLimit: '2GB',
        mountStrategy: 'group_inherit',
        additionalMounts: [],
      });
    });

    it('should validate RuntimeConfig with custom values', () => {
      const config = RuntimeConfigSchema.parse({
        containerTimeout: 600000,
        memoryLimit: '4GB',
        mountStrategy: 'custom',
        additionalMounts: [
          { hostPath: '/home/user/docs', containerPath: '/docs', readOnly: true },
        ],
      });
      expect(config).toEqual({
        containerTimeout: 600000,
        memoryLimit: '4GB',
        mountStrategy: 'custom',
        additionalMounts: [
          { hostPath: '/home/user/docs', containerPath: '/docs', readOnly: true },
        ],
      });
    });

    it('should validate AgentConfig with default values', () => {
      const config = AgentConfigSchema.parse({});
      expect(config.modelConfig).toEqual({
        model: 'claude-3-sonnet-20250219',
        baseUrl: 'https://api.anthropic.com',
        authMode: 'proxy',
      });
      expect(config.runtimeConfig).toEqual({
        containerTimeout: 300000,
        memoryLimit: '2GB',
        mountStrategy: 'group_inherit',
        additionalMounts: [],
      });
    });

    it('should validate AgentIdentity with required fields', () => {
      const identity = AgentIdentitySchema.parse({
        name: 'Test Agent',
        role: 'test',
      });
      expect(identity).toEqual({
        name: 'Test Agent',
        role: 'test',
      });
    });

    it('should validate AgentIdentity with all fields', () => {
      const identity = AgentIdentitySchema.parse({
        name: 'Test Agent',
        role: 'test',
        systemPrompt: 'You are a test agent.',
        description: 'This is a test agent.',
        appearance: {
          avatar: 'https://example.com/avatar.png',
          quotes: ['Quote 1', 'Quote 2'],
        },
      });
      expect(identity).toEqual({
        name: 'Test Agent',
        role: 'test',
        systemPrompt: 'You are a test agent.',
        description: 'This is a test agent.',
        appearance: {
          avatar: 'https://example.com/avatar.png',
          quotes: ['Quote 1', 'Quote 2'],
        },
      });
    });

    it('should validate AdditionalMount', () => {
      const mount = AdditionalMountSchema.parse({
        hostPath: '/home/user/files',
      });
      expect(mount).toEqual({
        hostPath: '/home/user/files',
        readOnly: true,
      });
    });

    it('should validate AdditionalMount with containerPath', () => {
      const mount = AdditionalMountSchema.parse({
        hostPath: '/home/user/files',
        containerPath: '/data',
        readOnly: false,
      });
      expect(mount).toEqual({
        hostPath: '/home/user/files',
        containerPath: '/data',
        readOnly: false,
      });
    });
  });

  describe('Conversion Functions', () => {
    it('should convert snake_case to camelCase', () => {
      const snakeCase = {
        model_config: {
          model: 'test-model',
          base_url: 'https://api.example.com',
          auth_mode: 'proxy',
        },
        runtime_config: {
          container_timeout: 300000,
          memory_limit: '2GB',
          mount_strategy: 'group_inherit',
          additional_mounts: [
            {
              host_path: '/home/user/docs',
              container_path: '/docs',
              read_only: true,
            },
          ],
        },
      };

      const camelCase = convertToCamelCase(snakeCase);
      expect(camelCase.modelConfig).toEqual({
        model: 'test-model',
        baseUrl: 'https://api.example.com',
        authMode: 'proxy',
      });
      expect(camelCase.runtimeConfig).toEqual({
        containerTimeout: 300000,
        memoryLimit: '2GB',
        mountStrategy: 'group_inherit',
        additionalMounts: [
          {
            hostPath: '/home/user/docs',
            containerPath: '/docs',
            readOnly: true,
          },
        ],
      });
    });

    it('should convert camelCase to snake_case', () => {
      const camelCase = {
        modelConfig: {
          model: 'test-model',
          baseUrl: 'https://api.example.com',
          authMode: 'proxy',
        },
        runtimeConfig: {
          containerTimeout: 300000,
          memoryLimit: '2GB',
          mountStrategy: 'group_inherit',
          additionalMounts: [
            {
              hostPath: '/home/user/docs',
              containerPath: '/docs',
              readOnly: true,
            },
          ],
        },
      };

      const snakeCase = convertToSnakeCase(camelCase);
      expect(snakeCase.model_config).toEqual({
        model: 'test-model',
        base_url: 'https://api.example.com',
        auth_mode: 'proxy',
      });
      expect(snakeCase.runtime_config).toEqual({
        container_timeout: 300000,
        memory_limit: '2GB',
        mount_strategy: 'group_inherit',
        additional_mounts: [
          {
            host_path: '/home/user/docs',
            container_path: '/docs',
            read_only: true,
          },
        ],
      });
    });
  });

  describe('Type Guards', () => {
    it('should recognize valid AgentConfig', () => {
      const config = AgentConfigSchema.parse({});
      expect(isAgentConfig(config)).toBe(true);
    });

    it('should reject invalid AgentConfig', () => {
      expect(isAgentConfig('not an object')).toBe(false);
      // 提供无效的数据类型以测试验证失败
      expect(isAgentConfig({ modelConfig: 'not an object' })).toBe(false);
    });

    it('should recognize valid AgentIdentity', () => {
      const identity = AgentIdentitySchema.parse({
        name: 'Test Agent',
        role: 'test',
      });
      expect(isAgentIdentity(identity)).toBe(true);
    });

    it('should reject invalid AgentIdentity', () => {
      expect(isAgentIdentity('not an object')).toBe(false);
      expect(isAgentIdentity({ name: 'Test' })).toBe(false);
    });
  });

  describe('Validation Functions', () => {
    it('should validate and return AgentConfig', () => {
      const config = validateAgentConfig({});
      expect(config).toEqual(AgentConfigSchema.parse({}));
    });

    it('should validate and return AgentIdentity', () => {
      const identity = validateAgentIdentity({
        name: 'Test Agent',
        role: 'test',
      });
      expect(identity).toEqual({
        name: 'Test Agent',
        role: 'test',
      });
    });
  });

  describe('Merge Config', () => {
    it('should merge user config with defaults', () => {
      const userConfig = {
        modelConfig: {
          model: 'claude-3-opus-20250219',
        },
        runtimeConfig: {
          containerTimeout: 600000,
        },
      };

      const merged = mergeAgentConfig(userConfig);
      expect(merged.modelConfig.model).toBe('claude-3-opus-20250219');
      expect(merged.modelConfig.baseUrl).toBe('https://api.anthropic.com');
      expect(merged.runtimeConfig.containerTimeout).toBe(600000);
      expect(merged.runtimeConfig.memoryLimit).toBe('2GB');
    });

    it('should handle undefined user config', () => {
      const merged = mergeAgentConfig();
      expect(merged).toEqual(AgentConfigSchema.parse({}));
    });

    it('should handle empty user config', () => {
      const merged = mergeAgentConfig({});
      expect(merged).toEqual(AgentConfigSchema.parse({}));
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty additionalMounts', () => {
      const config = RuntimeConfigSchema.parse({
        additionalMounts: [],
      });
      expect(config.additionalMounts).toEqual([]);
    });

    it('should handle memory limit formats', () => {
      const config1 = RuntimeConfigSchema.parse({ memoryLimit: '4GB' });
      const config2 = RuntimeConfigSchema.parse({ memoryLimit: '1024MB' });
      const config3 = RuntimeConfigSchema.parse({ memoryLimit: '512KB' });
      expect(config1.memoryLimit).toBe('4GB');
      expect(config2.memoryLimit).toBe('1024MB');
      expect(config3.memoryLimit).toBe('512KB');
    });

    it('should handle custom mount strategy', () => {
      const config = RuntimeConfigSchema.parse({
        mountStrategy: 'custom',
      });
      expect(config.mountStrategy).toBe('custom');
    });
  });
});
