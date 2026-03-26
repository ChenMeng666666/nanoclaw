// src/custom/agent/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  AgentModelConfigSchema,
  AgentRuntimeConfigSchema,
  AgentConfigSchema,
  AgentIdentitySchema,
} from './types.js';

describe('Agent Types', () => {
  describe('AgentModelConfigSchema', () => {
    it('should validate with minimal input', () => {
      const result = AgentModelConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should use defaults', () => {
      const result = AgentModelConfigSchema.parse({});
      expect(result.model).toBe('claude-3-sonnet-20250219');
      expect(result.base_url).toBe('https://api.anthropic.com');
      expect(result.auth_mode).toBe('proxy');
    });

    it('should accept custom values', () => {
      const result = AgentModelConfigSchema.parse({
        model: 'claude-3-opus-20250219',
        base_url: 'https://api.example.com',
        auth_mode: 'direct',
      });
      expect(result.model).toBe('claude-3-opus-20250219');
    });
  });

  describe('AgentRuntimeConfigSchema', () => {
    it('should validate with minimal input', () => {
      const result = AgentRuntimeConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should use defaults', () => {
      const result = AgentRuntimeConfigSchema.parse({});
      expect(result.container_timeout).toBe(1800000);
      expect(result.memory_limit).toBe('4g');
      expect(result.mount_strategy).toBe('group_inherit');
      expect(result.additional_mounts).toEqual([]);
    });
  });

  describe('AgentConfigSchema', () => {
    it('should validate with empty config', () => {
      const result = AgentConfigSchema.safeParse({
        model_config: {},
        runtime_config: {},
      });
      expect(result.success).toBe(true);
    });
  });

  describe('AgentIdentitySchema', () => {
    it('should validate with required fields', () => {
      const result = AgentIdentitySchema.safeParse({
        name: 'Mimi',
        role: '首席决策辅助',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional system_prompt', () => {
      const result = AgentIdentitySchema.parse({
        name: 'Mimi',
        role: '首席决策辅助',
        system_prompt: '你是米米...',
      });
      expect(result.system_prompt).toBe('你是米米...');
    });
  });
});
