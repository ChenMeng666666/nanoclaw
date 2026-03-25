// 阶段 1: Agent 独立运行单元 - 类型定义
// 来源: docs/superpowers/specs/2026-03-25-agent-independence-design.md

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
    readonly: boolean;
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
