// 阶段 1: Agent 独立运行单元 - 类型定义
// 来源: docs/superpowers/specs/2026-03-25-agent-independence-design.md

import z from 'zod';

// === 基础类型 ===

export type AgentType = 'system' | 'user';
export type AgentStatus = 'active' | 'paused' | 'archived';
export type AuthMode = 'proxy' | 'direct';
export type MountStrategy = 'group_inherit' | 'custom';

// === 身份模型 ===

/**
 * Agent 身份信息
 */
export interface AgentIdentity {
  name: string;
  role: string;
  systemPrompt?: string;
  description?: string;
  appearance?: {
    avatar?: string;
    quotes?: string[];
  };
}

/**
 * Agent 实体类型
 */
export interface Agent {
  id: string;
  name: string;
  role: string;
  type: AgentType;
  status: AgentStatus;
  description?: string;
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

// === 配置模型 ===

/**
 * 模型配置
 */
export interface ModelConfig {
  model: string;
  baseUrl: string;
  authMode: AuthMode;
}

/**
 * 运行时配置
 */
export interface RuntimeConfig {
  containerTimeout: number; // 容器超时时间（毫秒）
  memoryLimit: string; // 内存限制
  mountStrategy: MountStrategy; // 挂载策略
  additionalMounts: Array<{
    hostPath: string;
    containerPath?: string;
    readOnly: boolean;
  }>; // 额外挂载
}

/**
 * Agent 完整配置
 */
export interface AgentConfig {
  modelConfig: ModelConfig;
  runtimeConfig: RuntimeConfig;
}

// === 关联模型 ===

/**
 * Agent 与 Group 的关联关系
 */
export interface AgentGroupAssociation {
  id: string;
  agentId: string;
  groupFolder: string;
  isPrimary: boolean;
}

// === API 接口类型 ===

/**
 * 创建 Agent 输入类型
 */
export interface CreateAgentInput {
  name: string;
  role: string;
  type?: 'system' | 'user';
  identity: Partial<AgentIdentity>;
  config: Partial<AgentConfig>;
}

/**
 * 查询 Agent 列表输入类型
 */
export interface ListAgentsInput {
  status?: 'active' | 'paused' | 'archived';
  type?: 'system' | 'user';
}

/**
 * 更新 Agent 输入类型
 */
export interface UpdateAgentInput {
  agentId: string;
  updates: Partial<CreateAgentInput>;
}

/**
 * 删除 Agent 输入类型
 */
export interface DeleteAgentInput {
  agentId: string;
  keepWorkspace?: boolean;
}

/**
 * 运行 Agent 输入类型
 */
export interface RunAgentInput {
  agentId: string;
  prompt: string;
  contextMode?: 'isolated' | 'group';
}

// === 数据存储结构 ===

/**
 * Agent 配置文件内容 (data/agents/<id>/config.json)
 */
export interface AgentConfigFile {
  model_config: ModelConfig;
  runtime_config: RuntimeConfig;
}

/**
 * Agent 身份文件内容 (data/agents/<id>/identity.json)
 */
export interface AgentIdentityFile {
  name: string;
  role: string;
  system_prompt?: string;
  description?: string;
  appearance?: {
    avatar?: string;
    quotes?: string[];
  };
}

// === 运行时接口 ===

/**
 * 容器运行输入
 */
export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  agentId?: string;
  agentConfig?: AgentConfig;
}

/**
 * 容器运行选项
 */
export interface ContainerOptions {
  image?: string;
  command?: string[];
  env?: Record<string, string>;
  mounts?: Array<{
    source: string;
    target: string;
    type: 'bind';
    readOnly: boolean;
  }>;
  workingDir?: string;
  network?: string;
}

/**
 * 容器运行结果
 */
export interface ContainerResult {
  success: boolean;
  output?: string;
  error?: string;
  durationMs?: number;
}

// === Zod Schema 验证 ===

// 添加 Zod schemas
export const AdditionalMountSchema = z.object({
  hostPath: z.string(),
  containerPath: z.string().optional(),
  readOnly: z.boolean().default(true),
});

export const ModelConfigSchema = z.object({
  model: z.string().default('claude-3-sonnet-20250219'),
  baseUrl: z.string().url().default('https://api.anthropic.com'),
  authMode: z.enum(['proxy', 'direct']).default('proxy'),
});

export const RuntimeConfigSchema = z.object({
  containerTimeout: z.number().int().positive().default(300000), // 默认 5 分钟
  memoryLimit: z.string().default('2GB'),
  mountStrategy: z.enum(['group_inherit', 'custom']).default('group_inherit'),
  additionalMounts: z.array(AdditionalMountSchema).default([]),
});

export const AgentConfigSchema = z.object({
  modelConfig: ModelConfigSchema.default(ModelConfigSchema.parse({})),
  runtimeConfig: RuntimeConfigSchema.default(RuntimeConfigSchema.parse({})),
});

export const AgentIdentitySchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  systemPrompt: z.string().optional(),
  description: z.string().optional(),
  appearance: z.object({
    avatar: z.string().optional(),
    quotes: z.array(z.string()).optional(),
  }).optional(),
});

export const AgentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  role: z.string().min(1),
  type: z.enum(['system', 'user']).default('user'),
  status: z.enum(['active', 'paused', 'archived']).default('active'),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// === 转换函数 ===

/**
 * 将蛇形命名转换为驼峰命名
 */
function toCamelCase(str: string): string {
  // 处理特殊情况：read_only → readOnly
  if (str === 'read_only') {
    return 'readOnly';
  }
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * 将对象的键从蛇形命名转换为驼峰命名（递归处理嵌套对象和数组）
 */
export function convertToCamelCase<T>(obj: any): T {
  if (obj === null || obj === undefined) {
    return obj as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertToCamelCase) as unknown as T;
  }

  if (typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      result[camelKey] = convertToCamelCase(obj[key]);
      return result;
    }, {} as any) as T;
  }

  return obj as unknown as T;
}

/**
 * 将驼峰命名转换为蛇形命名
 */
function toSnakeCase(str: string): string {
  // 处理特殊情况：readOnly → read_only
  if (str === 'readOnly') {
    return 'read_only';
  }
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * 将对象的键从驼峰命名转换为蛇形命名（递归处理嵌套对象和数组）
 */
export function convertToSnakeCase<T>(obj: any): T {
  if (obj === null || obj === undefined) {
    return obj as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertToSnakeCase) as unknown as T;
  }

  if (typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = toSnakeCase(key);
      result[snakeKey] = convertToSnakeCase(obj[key]);
      return result;
    }, {} as any) as T;
  }

  return obj as unknown as T;
}

// === 类型守卫 ===

export function isAgentConfig(obj: any): obj is AgentConfig {
  try {
    AgentConfigSchema.parse(obj);
    return true;
  } catch {
    return false;
  }
}

export function isAgentIdentity(obj: any): obj is AgentIdentity {
  try {
    AgentIdentitySchema.parse(obj);
    return true;
  } catch {
    return false;
  }
}

// === 数据验证 ===

export function validateAgentConfig(config: any): AgentConfig {
  return AgentConfigSchema.parse(config);
}

export function validateAgentIdentity(identity: any): AgentIdentity {
  return AgentIdentitySchema.parse(identity);
}

// === 合并配置 ===

/**
 * 合并默认配置与用户配置
 */
export function mergeAgentConfig(userConfig?: Partial<AgentConfig>): AgentConfig {
  const defaultConfig = AgentConfigSchema.parse({});
  return {
    ...defaultConfig,
    ...(userConfig || {}),
    modelConfig: {
      ...defaultConfig.modelConfig,
      ...(userConfig?.modelConfig || {}),
    },
    runtimeConfig: {
      ...defaultConfig.runtimeConfig,
      ...(userConfig?.runtimeConfig || {}),
      additionalMounts: userConfig?.runtimeConfig?.additionalMounts || defaultConfig.runtimeConfig.additionalMounts,
    },
  };
}
