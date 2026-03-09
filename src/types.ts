/**
 * 多智能体架构类型定义
 */

// ===== 核心类型（现有）=====

export interface AdditionalMount {
  hostPath: string;
  containerPath?: string;
  readonly?: boolean;
}

export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number;
}

/**
 * Mount Allowlist - Security configuration for additional mounts
 */
export interface MountAllowlist {
  allowedRoots: AllowedRoot[];
  blockedPatterns: string[];
  nonMainReadOnly: boolean;
}

export interface AllowedRoot {
  path: string;
  allowReadWrite: boolean;
  description?: string;
}

export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  containerConfig?: ContainerConfig;
  requiresTrigger?: boolean;
  isMain?: boolean;
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean;
  is_bot_message?: boolean;
}

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

export interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
  syncGroups?(force: boolean): Promise<void>;
}

export type OnInboundMessage = (chatJid: string, message: NewMessage) => void;
export type OnChatMetadata = (
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
) => void;

// ===== 多智能体架构新增类型 =====

/**
 * 智能体配置
 * 每个智能体有独立的名字、性格、价值观、API 配置
 */
export interface AgentConfig {
  id: string;
  name: string;
  folder: string; // 工作区 folder 名
  userName?: string; // 用户如何称呼
  personality?: string; // 性格描述
  values?: string; // 价值观
  appearance?: string; // 样貌描述
  isActive: boolean;
  credentials: {
    anthropicToken?: string; // 加密存储
    anthropicUrl?: string;
    anthropicModel: string;
  };
}

/**
 * 通道实例
 * 一个 agent 对应一个独立的 bot（如多个 Telegram bot）
 */
export interface ChannelInstance {
  id: string;
  agentId: string; // 关联的智能体（一对一）
  channelType: string; // whatsapp/telegram/slack/discord
  botId: string; // Bot ID（如 Telegram bot token 标识）
  jid: string;
  name?: string;
  config?: Record<string, any>;
  mode: 'dm' | 'group' | 'both';
  isActive: boolean;
}

/**
 * 用户画像
 * 每个通道用户的独立记忆
 */
export interface UserProfile {
  id: string;
  channelInstanceId: string;
  userJid: string;
  name?: string;
  preferences?: Record<string, any>;
  memorySummary?: string;
  lastInteraction: string;
  createdAt: string;
}

/**
 * 分层记忆
 * L1 工作记忆 → L2 短期记忆 → L3 长期记忆
 */
export interface Memory {
  id: string;
  agentFolder: string;
  userJid?: string; // 可选：绑定特定用户
  level: 'L1' | 'L2' | 'L3';
  content: string;
  embedding?: number[]; // 向量嵌入
  importance: number;
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
  // 新增元数据字段
  messageType?: 'user' | 'system' | 'bot' | 'code' | 'document'; // 消息类型
  timestampWeight?: number; // 时间戳权重（用于排序）
  sessionId?: string; // 会话ID，用于关联上下文
  tags?: string[]; // 标签，用于分类和检索
  sourceType?: 'direct' | 'extracted' | 'summary'; // 来源类型
}

/**
 * 反思和总结
 */
export interface Reflection {
  id: number;
  agentFolder: string;
  type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'task';
  content: string;
  triggeredBy?: string;
  createdAt: string;
}

/**
 * 学习任务
 */
export interface LearningTask {
  id: string;
  agentFolder: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  reflectionId?: number; // 完成后触发的反思
  resources?: string[];
  createdAt: string;
  completedAt?: string;
}

/**
 * 进化日志条目 / Gene 结构
 * 共享经验库，带审核状态
 *
 * Gene 结构扩展（参考 evolver）：
 * - category: 行动类别（repair/optimize/innovate/learn）
 * - signalsMatch: 匹配的信号类型
 * - strategy: 执行策略
 * - constraints: 执行约束
 * - validation: 验证命令
 */
export interface Gene {
  type: 'Gene';
  id: number;
  category: 'repair' | 'optimize' | 'innovate' | 'learn';
  signalsMatch: string[]; // 匹配的信号类型
  strategy: string[]; // 执行策略
  constraints: {
    maxFiles?: number;
    forbiddenPaths?: string[];
    applicableScenarios?: string[];
  };
  validation: string[]; // 验证命令

  // 原有字段
  abilityName: string;
  description?: string;
  sourceAgentId: string;
  content: string;
  contentEmbedding?: number[];
  tags: string[];
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  feedback: Array<{
    agentId: string;
    comment: string;
    rating: number;
    usedAt?: string;
  }>;
  createdAt: string;
}

/**
 * 进化日志条目（向后兼容，Gene 的简化形式）
 */
/**
 * 主项目组件标识符
 */
export enum MainComponent {
  CHANNELS = 'channels',
  CONTAINER = 'container',
  ROUTER = 'router',
  DATABASE = 'database',
  QUEUE = 'queue',
}

/**
 * 主项目经验输入
 */
export interface MainExperienceInput {
  abilityName: string;
  content: string;
  description?: string;
  tags?: string[];
  category?: 'repair' | 'optimize' | 'innovate' | 'learn';
  component?: MainComponent;
}

/**
 * 主项目进化配置
 */
export interface MainEvolutionConfig {
  enabled: boolean;
  autoApply: boolean;
  componentWhitelist: MainComponent[];
  signalThreshold: number;
}

export type EvolutionEntry = Omit<
  Gene,
  | 'type'
  | 'category'
  | 'signalsMatch'
  | 'strategy'
  | 'constraints'
  | 'validation'
> & {
  // 保留向后兼容的可选字段
  category?: 'repair' | 'optimize' | 'innovate' | 'learn';
  signalsMatch?: string[];
  strategy?: string[];
  constraints?: Gene['constraints'];
  validation?: string[];
};
