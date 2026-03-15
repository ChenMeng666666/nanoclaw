/**
 * 智能体间通信模块
 *
 * 提供智能体间直接通信的 API 和管理功能
 * - 智能体间消息传递
 * - 消息状态跟踪
 * - 通信授权验证
 */

import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { logger } from './logger.js';
import { safeJsonParse } from './security.js';
import type { AgentMessage } from './types/collaboration.js';

// IPC 通信目录
const IPC_BASE_DIR = path.join(DATA_DIR, 'ipc');

// 消息状态存储
const agentMessages = new Map<string, AgentMessage>();
const agentMessageVersions = new Map<string, number>();

export interface MessageStatusUpdateResult {
  success: boolean;
  messageId: string;
  previousStatus?: AgentMessage['status'];
  currentStatus?: AgentMessage['status'];
  version?: number;
  idempotent: boolean;
}

/**
 * 生成消息 ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 发送智能体间消息
 */
export function sendAgentMessage(
  fromAgentId: string,
  toAgentId: string,
  type: AgentMessage['type'],
  content: string,
  metadata?: Record<string, unknown>,
): string {
  const messageId = generateMessageId();
  const message: AgentMessage = {
    id: messageId,
    fromAgentId,
    toAgentId,
    type,
    content,
    metadata,
    timestamp: new Date().toISOString(),
    status: 'sent',
  };

  // 存储消息状态
  agentMessages.set(messageId, message);

  // 发送到目标智能体的 IPC 目录
  const targetIpcDir = path.join(IPC_BASE_DIR, toAgentId, 'agent-messages');
  fs.mkdirSync(targetIpcDir, { recursive: true });

  const messageFile = path.join(targetIpcDir, `${messageId}.json`);
  fs.writeFileSync(messageFile, JSON.stringify(message, null, 2));

  logger.info(
    {
      fromAgentId,
      toAgentId,
      messageId,
      type,
    },
    'Agent message sent',
  );

  return messageId;
}

/**
 * 接收智能体消息（从 IPC 读取）
 */
export function receiveAgentMessages(agentId: string): AgentMessage[] {
  const agentMessagesDir = path.join(IPC_BASE_DIR, agentId, 'agent-messages');
  if (!fs.existsSync(agentMessagesDir)) {
    return [];
  }

  const messages: AgentMessage[] = [];

  try {
    const messageFiles = fs
      .readdirSync(agentMessagesDir)
      .filter((f) => f.endsWith('.json'));

    for (const file of messageFiles) {
      const filePath = path.join(agentMessagesDir, file);
      try {
        const data = safeJsonParse(
          fs.readFileSync(filePath, 'utf-8'),
        ) as AgentMessage;
        messages.push(data);
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.error(
          { agentId, file, err },
          'Error reading agent message file',
        );
      }
    }
  } catch (err) {
    logger.error({ agentId, err }, 'Error reading agent messages directory');
  }

  // 更新消息状态为已送达
  messages.forEach((msg) => {
    const storedMsg = agentMessages.get(msg.id);
    if (storedMsg) {
      storedMsg.status = 'delivered';
      agentMessages.set(msg.id, storedMsg);
    }
  });

  return messages;
}

/**
 * 更新消息状态
 */
export function updateAgentMessageStatus(
  messageId: string,
  status: AgentMessage['status'],
): boolean {
  return updateAgentMessageStatusDetailed(messageId, status).success;
}

export function updateAgentMessageStatusDetailed(
  messageId: string,
  status: AgentMessage['status'],
): MessageStatusUpdateResult {
  const message = agentMessages.get(messageId);
  if (!message) {
    logger.warn({ messageId }, 'Message not found');
    return {
      success: false,
      messageId,
      idempotent: false,
    };
  }

  const previousStatus = message.status;
  const idempotent = previousStatus === status;
  const nextVersion = (agentMessageVersions.get(messageId) ?? 0) + 1;
  message.status = status;
  agentMessages.set(messageId, message);
  agentMessageVersions.set(messageId, nextVersion);

  logger.debug(
    {
      messageId,
      previousStatus,
      status,
      version: nextVersion,
      idempotent,
    },
    'Agent message status updated',
  );
  return {
    success: true,
    messageId,
    previousStatus,
    currentStatus: status,
    version: nextVersion,
    idempotent,
  };
}

/**
 * 获取消息状态
 */
export function getAgentMessageStatus(
  messageId: string,
): AgentMessage['status'] | null {
  return agentMessages.get(messageId)?.status || null;
}

/**
 * 获取智能体的消息历史
 */
export function getAgentMessageHistory(agentId: string): AgentMessage[] {
  return Array.from(agentMessages.values()).filter(
    (msg) => msg.fromAgentId === agentId || msg.toAgentId === agentId,
  );
}

/**
 * 清理旧消息（超过 24 小时）
 */
export function cleanUpOldMessages(): void {
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  for (const [messageId, message] of agentMessages.entries()) {
    const messageTime = new Date(message.timestamp).getTime();
    if (now - messageTime > TWENTY_FOUR_HOURS) {
      agentMessages.delete(messageId);
    }
  }

  logger.debug('Old messages cleaned up');
}
