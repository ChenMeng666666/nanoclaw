// src/custom/agent/types.ts
import { z } from 'zod';

// Agent 核心类型
export interface Agent {
  id: string;
  name: string;
  role: string;
  type: 'system' | 'user';
  status: 'active' | 'paused' | 'archived';
  description?: string;
  system_prompt?: string;
  created_at: string;
  updated_at: string;
}

// Agent 身份信息（存储在 identity.json）
export interface AgentIdentity {
  name: string;
  role: string;
  system_prompt?: string;
}

// Agent 模型配置
export interface AgentModelConfig {
  model: string;
  base_url: string;
  auth_mode: 'proxy' | 'direct';
}

// Agent 运行配置
export interface AgentRuntimeConfig {
  container_timeout: number;
  memory_limit: string;
  mount_strategy: 'group_inherit' | 'custom';
  additional_mounts: Array<{
    hostPath: string;
    containerPath?: string;
    readonly?: boolean;
  }>;
}

// Agent 完整配置（存储在 config.json）
export interface AgentConfig {
  model_config: AgentModelConfig;
  runtime_config: AgentRuntimeConfig;
}

// Agent 与 Group 关联
export interface AgentGroupAssociation {
  id: string;
  agent_id: string;
  group_folder: string;
  is_primary: boolean;
}

// Zod schemas for validation
export const AgentModelConfigSchema = z.object({
  model: z.string().default('claude-3-sonnet-20250219'),
  base_url: z.string().url().default('https://api.anthropic.com'),
  auth_mode: z.enum(['proxy', 'direct']).default('proxy'),
});

export const AgentRuntimeConfigSchema = z.object({
  container_timeout: z.number().int().positive().default(1800000),
  memory_limit: z.string().default('4g'),
  mount_strategy: z.enum(['group_inherit', 'custom']).default('group_inherit'),
  additional_mounts: z.array(z.object({
    hostPath: z.string(),
    containerPath: z.string().optional(),
    readonly: z.boolean().optional(),
  })).default([]),
});

export const AgentConfigSchema = z.object({
  model_config: AgentModelConfigSchema,
  runtime_config: AgentRuntimeConfigSchema,
});

export const AgentIdentitySchema = z.object({
  name: z.string(),
  role: z.string(),
  system_prompt: z.string().optional(),
});

// API 输入类型
export interface CreateAgentInput {
  name: string;
  role: string;
  type?: 'system' | 'user';
  identity?: Partial<AgentIdentity>;
  config?: Partial<AgentConfig>;
}

export interface ListAgentsInput {
  status?: 'active' | 'paused' | 'archived';
  type?: 'system' | 'user';
}

export interface UpdateAgentInput {
  agentId: string;
  updates: Partial<CreateAgentInput>;
}

export interface DeleteAgentInput {
  agentId: string;
  keepWorkspace?: boolean;
}

export interface RunAgentInput {
  agentId: string;
  prompt: string;
  contextMode?: 'isolated' | 'group';
}

export interface BindAgentToGroupInput {
  agentId: string;
  groupFolder: string;
  isPrimary?: boolean;
}
