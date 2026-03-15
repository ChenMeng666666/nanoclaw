import type { NewMessage, Memory } from '../types.js';
import type { Context, CompactResult, TurnResult } from './types.js';

/**
 * ContextEngine 接口 - 可插拔的上下文/记忆管理引擎
 *
 * 生命周期：
 * 1. bootstrap(agentFolder) - agent 容器启动时初始化
 * 2. ingest(message, context) - 新消息到达时，决定存储哪些记忆
 * 3. assemble(chatJid, limit, sessionId?) - 构建 agent 上下文，检索相关记忆
 * 4. compact(session) - 上下文过长时压缩会话历史
 * 5. afterTurn(result) - 对话结束后处理新记忆
 */
export interface ContextEngine {
  /**
   * 引擎初始化，在 agent 容器启动时调用
   * @param agentFolder - Agent 文件夹路径
   */
  bootstrap(agentFolder: string): Promise<void>;

  /**
   * 新消息到达时调用，返回需要存储的记忆
   * @param message - 新消息
   * @param context - 当前上下文
   * @returns 需要存储的记忆列表
   */
  ingest(message: NewMessage, context: Context): Promise<Memory[]>;

  /**
   * 构建 agent 上下文，在发送 prompt 前调用
   * @param chatJid - 聊天 JID
   * @param limit - 最大消息/记忆数量
   * @param sessionId - 会话 ID（可选）
   * @returns 完整的上下文
   */
  assemble(
    chatJid: string,
    limit: number,
    sessionId?: string,
  ): Promise<Context>;

  /**
   * 压缩会话历史，当上下文过长时调用
   * @param session - 完整会话历史
   * @returns 压缩结果
   */
  compact(session: any): Promise<CompactResult>;

  /**
   * 每轮对话结束后调用
   * @param result - 对话结果
   */
  afterTurn(result: TurnResult): Promise<void>;
}

// Session 类型临时定义（避免循环依赖）
interface Session {
  messages: NewMessage[];
  memories: Memory[];
}
