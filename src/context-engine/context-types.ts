import type { NewMessage } from '../types/core-runtime.js';
import type { Memory } from '../types/agent-memory.js';

/**
 * 上下文接口 - 传递给 agent 的完整上下文
 */
export interface Context {
  agentFolder: string;
  userJid?: string;
  messages: NewMessage[];
  memories: Memory[];
  timestamp: string;
  sessionId?: string; // 会话ID，用于关联上下文
}

/**
 * 压缩结果 - 当上下文过长时的压缩输出
 */
export interface CompactResult {
  summary: string;
  preservedMemories: Memory[];
  discardedCount: number;
}

/**
 * 对话结果 - agent 响应后的输出
 */
export interface TurnResult {
  response: string;
  newMemories?: Memory[];
  sessionId?: string;
}
