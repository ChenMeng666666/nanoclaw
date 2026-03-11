/**
 * 多智能体架构类型定义
 *
 * GEP 协议版本: 1.5.0
 * 实现完整的 Genome Evolution Protocol (GEP) 标准
 * - GEPAsset: 基础资产接口
 * - GEPGene: 符合 GEP 标准的 Gene 结构
 * - GEPCapsule: 验证后的执行结果胶囊
 * - GDIScore: 全球期望指数评分
 * - AbilityChain: 能力链概念
 * - ValidationReport: 验证报告
 * - EcosystemMetrics: 生态系统指标
 */

import crypto from 'crypto';

// GEP 协议版本
export const GEP_SCHEMA_VERSION = '1.5.0';

// ===== GEP 协议标准类型（新增）=====

// 基础 GEP 资产接口
export interface GEPAsset {
  type: 'Gene' | 'Capsule' | 'EvolutionEvent';
  schema_version: string;
  asset_id: string; // sha256:<hex>
  model_name?: string; // 生成该资产的 LLM 模型
}

// asset_id 生成函数
export function generateAssetId(content: string): string {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `sha256:${hash}`;
}

// 增强的 Gene 结构（符合 GEP 标准）
export interface GEPGene extends GEPAsset {
  type: 'Gene';
  category: 'repair' | 'optimize' | 'innovate';
  signals_match: string[];
  summary: string;
  preconditions: string[];
  validation_commands: string[];
  chain_id?: string;
  gdi_score?: GDIScore;
  status: 'promoted' | 'stale' | 'archived';

  // 数据库字段
  id: number;
  ability_name: string;
  description?: string;
  source_agent_id: string;
  content: string;
  content_embedding?: number[];
  tags: string[];
  feedback: Array<{
    agent_id: string;
    comment: string;
    rating: number;
    used_at?: string;
  }>;
  created_at: string;
}

// Capsule 类型（符合 GEP 标准）
export interface GEPCapsule extends GEPAsset {
  type: 'Capsule';
  trigger: string[];
  gene: string; // Gene 的 asset_id
  summary: string;
  confidence: number; // 0-1
  blast_radius: {
    files: number;
    lines: number;
  };
  outcome: {
    status: 'success' | 'partial' | 'failed';
    score: number;
  };
  env_fingerprint: {
    platform: string;
    arch: string;
    runtime?: string;
    dependencies?: string[];
  };
  success_streak: number;
  gene_id: number; // 数据库中的 Gene ID
  approved_at: string;
}

// GDI 评分（全球期望指数）
export interface GDIScore {
  intrinsicQuality: number; // 0-10 (35%)
  usageMetrics: number; // 0-10 (30%)
  socialSignals: number; // 0-10 (20%)
  freshness: number; // 0-10 (15%)
  total: number; // 总分 (0-10)
}

// 能力链
export interface AbilityChain {
  chain_id: string;
  genes: string[]; // Gene asset_id 列表，按顺序
  capsules: string[]; // Capsule asset_id 列表
  description?: string;
  created_at: string;
  updated_at: string;
}

// 验证报告
export interface ValidationReport {
  id: number;
  gene_id: number;
  timestamp: string;
  commands: string[];
  success: boolean;
  environment: {
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  test_results?: Record<string, unknown>;
  error?: string;
}

// 相似度检查结果
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarity: number;
  reason?: string;
  existingAssetId?: string;
}

// 生态系统指标
export interface EcosystemMetrics {
  shannonDiversity: number;
  fitnessLandscape: Array<{ timestamp: string; avgSuccess: number }>;
  symbioticRelationships: Array<{
    geneA: number;
    geneB: number;
    cooccurrence: number;
  }>;
  macroEvolutionEvents: Array<{
    type: 'cambrian_explosion' | 'mass_extinction';
    timestamp: string;
    description: string;
    geneCount: number;
  }>;
  negentropyReduction: number; // 通过复用减少的重复工作量
  totalGenes: number;
  totalCapsules: number;
  promotedGenes: number;
  staleGenes: number;
  archivedGenes: number;
  avgGDIScore: number;
}

// 进化策略类型
export type EvolutionStrategy =
  | 'balanced'
  | 'repair'
  | 'optimize'
  | 'innovate'
  | 'repair-only';

// 策略配置
export interface StrategyConfig {
  name: EvolutionStrategy;
  prioritizeRepair: boolean;
  explorationRate: number; // 0-1
  riskTolerance: 'low' | 'medium' | 'high';
}

// 策略配置常量
export const STRATEGY_CONFIGS: Record<EvolutionStrategy, StrategyConfig> = {
  balanced: {
    name: 'balanced',
    prioritizeRepair: false,
    explorationRate: 0.3,
    riskTolerance: 'medium',
  },
  repair: {
    name: 'repair',
    prioritizeRepair: true,
    explorationRate: 0.1,
    riskTolerance: 'low',
  },
  optimize: {
    name: 'optimize',
    prioritizeRepair: false,
    explorationRate: 0.2,
    riskTolerance: 'medium',
  },
  innovate: {
    name: 'innovate',
    prioritizeRepair: false,
    explorationRate: 0.5,
    riskTolerance: 'high',
  },
  'repair-only': {
    name: 'repair-only',
    prioritizeRepair: true,
    explorationRate: 0,
    riskTolerance: 'low',
  },
};

// ===== 核心类型（现有，向后兼容）=====

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
 * 学习需求
 */
export interface LearningNeed {
  topic: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  urgency: 'high' | 'medium' | 'low';
  estimatedTime: number; // 小时
  resources?: string[];
}

/**
 * 每日学习计划
 */
export interface DailyLearningPlan {
  id: string;
  date: string;
  agentFolder: string;
  tasks: LearningTask[];
  estimatedTime: number;
  priority: 'high' | 'medium' | 'low';
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
 * 详细反思（扩展现有 Reflection 类型）
 */
export interface DetailedReflection extends Reflection {
  taskId?: string;
  completionTime?: string;
  actualDuration?: number; // 分钟
  knowledgeGained?: string[];
  difficulties?: string[];
  solutions?: string[];
  suggestions?: string[];
  keyInsights?: string[];
  nextSteps?: string[];
  rating?: 1 | 2 | 3 | 4 | 5;
}

/**
 * 每日学习总结
 */
export interface DailyLearningSummary {
  id: string;
  date: string;
  agentFolder: string;
  tasksCompleted: number;
  totalTimeSpent: number; // 分钟
  knowledgePoints: string[];
  achievements: string[];
  challenges: string[];
  improvements: string[];
  tomorrowPlan: string[];
  mood: 'great' | 'good' | 'average' | 'bad';
  notes?: string;
}

/**
 * 学习自动化配置
 */
export interface LearningAutomationConfig {
  enabled: boolean;
  dailyPlanTime: string;
  dailySummaryTime: string;
  reflections: {
    hourly: boolean;
    daily: boolean;
    weekly: boolean;
    monthly: boolean;
    yearly: boolean;
  };
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
