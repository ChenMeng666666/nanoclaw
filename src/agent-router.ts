/**
 * 多智能体消息路由模块
 *
 * 负责：
 * 1. 根据消息 JID 查找对应的 agent
 * 2. 从 keychain 解密 agent 特定配置
 * 3. 路由消息到对应的 agent 容器
 */
import { getChannelInstanceByJid } from './db-agents.js';
import { getAgentById } from './db-agents.js';
import { getSecret } from './keystore.js';
import { getRoutingBinding } from './db-routing.js';
import { RegisteredGroup } from './types.js';
import { logger } from './logger.js';

/**
 * 消息路由结果
 */
export interface AgentRouteResult {
  agentId: string;
  agentFolder: string;
  agentName: string;
  channelInstanceId: string;
  channelType: string;
  botId: string;
  agentConfig?: {
    anthropicToken?: string;
    anthropicUrl?: string;
    anthropicModel?: string;
  };
}

/**
 * 根据消息 JID 查找对应的 agent
 *
 * 流程：
 * 1. 检查是否有 Topic 级路由绑定（优先）
 * 2. 检查是否有 per-chat bot 身份绑定（新增强）
 * 3. 查询 channel_instances 表找到对应的记录
 * 4. 查询 agents 表获取 agent 配置
 * 5. 从 keychain 解密敏感配置
 */
export async function routeMessageToAgent(
  chatJid: string,
  topicId?: string,
): Promise<AgentRouteResult | null> {
  // 1. 优先检查 Topic 级路由绑定
  if (topicId) {
    const binding = getRoutingBinding('telegram', topicId);
    if (binding) {
      logger.debug(
        { chatJid, topicId, agentId: binding.agentId },
        'Found Topic-level routing binding',
      );
      const agent = getAgentById(binding.agentId);
      if (agent && agent.isActive) {
        const anthropicToken = agent.credentials.anthropicToken
          ? await getSecret(agent.id, 'anthropic_token')
          : undefined;
        const anthropicUrl = agent.credentials.anthropicUrl
          ? await getSecret(agent.id, 'anthropic_url')
          : undefined;
        const channelInstance = getChannelInstanceByJid(chatJid);
        return {
          agentId: agent.id,
          agentFolder: agent.folder,
          agentName: agent.name,
          channelInstanceId: channelInstance?.id || '',
          channelType: channelInstance?.channelType || 'telegram',
          botId: channelInstance?.botId || '',
          agentConfig: {
            anthropicToken: anthropicToken || undefined,
            anthropicUrl: anthropicUrl || undefined,
            anthropicModel: agent.credentials.anthropicModel,
          },
        };
      }
    }
  }

  // 2. 检查 per-chat bot 身份绑定（新增强）
  const { getBotIdentityByChatJid } = await import('./db.js');
  const botIdentity = getBotIdentityByChatJid(chatJid);
  if (botIdentity) {
    logger.debug(
      { chatJid, agentId: botIdentity.agentId },
      'Found per-chat bot identity',
    );
    const agent = getAgentById(botIdentity.agentId);
    if (agent && agent.isActive) {
      const anthropicToken = agent.credentials.anthropicToken
        ? await getSecret(agent.id, 'anthropic_token')
        : undefined;
      const anthropicUrl = agent.credentials.anthropicUrl
        ? await getSecret(agent.id, 'anthropic_url')
        : undefined;
      const channelInstance = getChannelInstanceByJid(chatJid);
      return {
        agentId: agent.id,
        agentFolder: agent.folder,
        agentName: botIdentity.botName, // 使用 Bot 名称替代 Agent 名称
        channelInstanceId: channelInstance?.id || '',
        channelType: channelInstance?.channelType || 'telegram',
        botId: channelInstance?.botId || '',
        agentConfig: {
          anthropicToken: anthropicToken || undefined,
          anthropicUrl: anthropicUrl || undefined,
          anthropicModel: agent.credentials.anthropicModel,
        },
      };
    }
  }

  // 3. Fallback 到 chatJid 路由
  const channelInstance = getChannelInstanceByJid(chatJid);
  if (!channelInstance) {
    logger.debug({ chatJid }, 'No channel instance found for JID');
    return null;
  }

  // 4. 查找对应的 agent
  const agent = getAgentById(channelInstance.agentId);
  if (!agent) {
    logger.warn(
      { agentId: channelInstance.agentId, chatJid },
      'Agent not found for channel instance',
    );
    return null;
  }

  if (!agent.isActive) {
    logger.warn({ agentId: agent.id, chatJid }, 'Agent is not active');
    return null;
  }

  // 5. 从 keychain 解密敏感配置
  const anthropicToken = agent.credentials.anthropicToken
    ? await getSecret(agent.id, 'anthropic_token')
    : undefined;
  const anthropicUrl = agent.credentials.anthropicUrl
    ? await getSecret(agent.id, 'anthropic_url')
    : undefined;

  // 6. 构建路由结果
  const result: AgentRouteResult = {
    agentId: agent.id,
    agentFolder: agent.folder,
    agentName: agent.name,
    channelInstanceId: channelInstance.id,
    channelType: channelInstance.channelType,
    botId: channelInstance.botId,
    agentConfig: {
      anthropicToken: anthropicToken || undefined,
      anthropicUrl: anthropicUrl || undefined,
      anthropicModel: agent.credentials.anthropicModel,
    },
  };

  logger.debug(
    {
      chatJid,
      agentName: result.agentName,
      channelType: result.channelType,
    },
    'Message routed to agent',
  );

  return result;
}

/**
 * 构建 RegisteredGroup 对象用于容器运行器
 *
 * 将 agent 配置转换为兼容的 RegisteredGroup 格式
 */
export function buildAgentGroup(
  routeResult: AgentRouteResult,
  isMain: boolean,
): RegisteredGroup {
  return {
    name: routeResult.agentName,
    folder: routeResult.agentFolder,
    trigger: `@${routeResult.agentName}`,
    added_at: new Date().toISOString(),
    isMain,
    requiresTrigger: !isMain,
  };
}
