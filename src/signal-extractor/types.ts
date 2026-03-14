import { EvolutionEntry } from '../types.js';

// ===== 信号类型定义 =====

/**
 * 信号类型枚举
 *
 * 分类：
 * - 学习相关：触发主动学习
 * - 反思相关：触发问题修复
 * - 状态相关：触发模式切换
 * - 创新相关：触发新功能开发
 */
export type SignalType =
  // 学习相关
  | 'capability_gap' // 能力缺口：发现自己某方面能力不足
  | 'learning_opportunity' // 学习机会：发现可以学习的新技能/方法
  | 'knowledge_missing' // 知识缺失：缺少必要的知识来完成任务
  // 反思相关
  | 'recurring_error' // 重复错误：同一个错误出现多次
  | 'performance_issue' // 性能问题：处理效率或质量问题
  | 'user_feedback' // 用户反馈：用户给出明确反馈
  | 'negative_feedback' // 负面反馈：用户表达不满
  | 'positive_feedback' // 正面反馈：用户表达满意
  // 状态相关
  | 'stable_plateau' // 稳定高原：连续多次表现稳定
  | 'learning_stagnation' // 学习停滞：一段时间没有进步
  | 'saturation' // 饱和：达到能力极限
  // 创新相关
  | 'feature_request' // 功能请求：用户或自己提出新功能需求
  | 'improvement_suggestion' // 改进建议：发现可以改进的地方
  | 'innovation_idea'; // 创新想法：突然的灵感或新想法

/**
 * 信号结构
 */
export interface Signal {
  type: SignalType;
  confidence: number; // 信号强度 0-1
  snippet?: string; // 触发信号的文本片段
  metadata?: Record<string, unknown>;
}

/**
 * 信号提取选项
 */
export interface SignalExtractionOptions {
  content: string; // 反思内容/对话内容
  memorySnippet?: string; // 记忆摘要
  recentEvents?: EvolutionEntry[]; // 最近进化事件
  language?: 'en' | 'zh-CN' | 'zh-TW' | 'ja'; // 语言
}

// ===== 信号模式定义 =====

/**
 * 多语言信号模式
 *
 * 每个模式包含：
 * - patterns: 匹配正则表达式数组
 * - weight: 基础权重
 * - actionable: 是否可执行（影响优先级）
 */
export interface SignalPattern {
  patterns: RegExp[];
  weight: number;
  actionable: boolean;
}
