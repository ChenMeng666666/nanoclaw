import { Bot } from 'grammy';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
  ChannelInstance,
} from '../types.js';
import {
  getAllActiveAgents,
  getChannelInstancesForAgent,
  getChannelInstanceByJid,
} from '../db-agents.js';
import { createRoutingBinding, getRoutingBinding } from '../db-routing.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bots: Map<string, Bot> = new Map(); // instanceId -> Bot instance
  private opts: TelegramChannelOpts;

  constructor(opts: TelegramChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // 获取所有活跃的 agent
    const agents = getAllActiveAgents();

    // 为每个 agent 收集 telegram channel instances
    const instances: ChannelInstance[] = [];
    for (const agent of agents) {
      const agentInstances = getChannelInstancesForAgent(agent.id);
      instances.push(
        ...agentInstances.filter((i) => i.channelType === 'telegram'),
      );
    }

    if (instances.length === 0) {
      logger.warn('Telegram: No active Telegram channel instances found');
      return;
    }

    // 为每个 instance 启动独立的 bot
    for (const inst of instances) {
      const token = inst.botId; // bot_id 字段存储完整 token
      if (!token) {
        logger.warn(
          { instanceId: inst.id },
          'Telegram instance missing bot token',
        );
        continue;
      }

      // 创建并连接 bot
      const bot = new Bot(token);
      this.bots.set(inst.id, bot);

      // 为该 bot 设置消息处理器
      this.setupBotHandlers(bot, inst.agentId);

      // 启动 bot
      await new Promise<void>((resolve) => {
        bot.start({
          onStart: (botInfo) => {
            logger.info(
              {
                agentId: inst.agentId,
                username: botInfo.username,
                id: botInfo.id,
              },
              'Telegram bot connected',
            );
            console.log(
              `\n  Telegram bot (@${botInfo.username}) -> Agent: ${inst.agentId}`,
            );
            resolve();
          },
        });
      });
    }

    console.log(`  Send /chatid to any bot to get a chat's registration ID\n`);
  }

  private setupBotHandlers(bot: Bot, agentId: string): void {
    // 构建该 agent 对应的 jid 集合，用于快速查找
    const agentJids = new Set<string>();
    const instances = getChannelInstancesForAgent(agentId);
    for (const inst of instances) {
      if (inst.jid) agentJids.add(inst.jid);
    }

    logger.info(
      { agentId, jids: Array.from(agentJids) },
      'Telegram: Setting up bot handlers',
    );

    // Add global middleware to log all updates
    bot.use(async (ctx, next) => {
      logger.info(
        { type: 'update', chatId: ctx.chat?.id, from: ctx.from?.id },
        'Telegram: Update received',
      );
      await next();
    });

    bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Command to check bot status
    bot.command('ping', (ctx) => {
      ctx.reply(`${ASSISTANT_NAME} is online.`);
    });
    // Command to bind topic to agent
    bot.command('bind', (ctx) => {
      // Only work in group/supergroup
      if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        ctx.reply('This command can only be used in groups.');
        return;
      }

      // Check if it's a forum (has message_thread_id)
      const topicId = ctx.msg?.reply_to_message?.message_thread_id?.toString();
      if (!topicId) {
        ctx.reply(
          'This command must be used in a topic/thread. Please reply to a topic message.',
        );
        return;
      }

      // Parse agent name from command args
      const args = (ctx.message?.text || '').split(' ').slice(1);
      const targetAgentName = args[0]?.replace('@', '');

      if (!targetAgentName) {
        ctx.reply('Usage: /bind @agent_name');
        return;
      }

      // Find agent by name
      const agents = getAllActiveAgents();
      const targetAgent = agents.find(
        (a) => a.name.toLowerCase() === targetAgentName.toLowerCase(),
      );

      if (!targetAgent) {
        ctx.reply(`Agent "${targetAgentName}" not found.`);
        return;
      }

      // Create routing binding
      const threadId = `tg:${ctx.chat.id}:${topicId}`;
      try {
        createRoutingBinding({
          channelType: 'telegram',
          threadId,
          agentId: targetAgent.id,
        });
        ctx.reply(`Successfully bound topic to agent: ${targetAgent.name}`);
        logger.info(
          { channelType: 'telegram', threadId, agentId: targetAgent.id },
          'Created routing binding',
        );
      } catch (err) {
        ctx.reply(
          `Failed to bind topic: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const chatJid = `tg:${ctx.chat.id}`;

      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery (before agentJid check so all chats are recorded)
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        chatName,
        'telegram',
        isGroup,
      );

      // 关键检查：这个 bot 只处理它自己的 jid 消息
      // 因为每个 bot 对应一个 agent，而 agent 的 jid 列表是独立的
      if (!agentJids.has(chatJid)) {
        // 消息不属于这个 agent，忽略（但 metadata 已记录）
        return;
      }

      // 检查是否已注册（这里检查 group 是否在 registeredGroups 中）
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName, agentId },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });

      logger.info(
        { chatJid, chatName, sender: senderName, agentId },
        'Telegram message stored',
      );
    });

    // Handle non-text messages with placeholders
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;

      // 同样检查是否属于这个 agent
      if (!agentJids.has(chatJid)) return;

      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
    };

    bot.on('message:photo', (ctx) => storeNonText(ctx, '[Photo]'));
    bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
    bot.on('message:voice', (ctx) => storeNonText(ctx, '[Voice message]'));
    bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
    bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
    bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    // 根据 jid 找到对应的 channel instance，然后使用对应的 bot
    const instance = this.findInstanceForJid(jid);
    if (!instance) {
      logger.warn({ jid }, 'Telegram: No bot instance found for JID');
      return;
    }

    const bot = this.bots.get(instance.id);
    if (!bot) {
      logger.warn(
        { jid, instanceId: instance.id },
        'Telegram: Bot not connected',
      );
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      if (text.length <= MAX_LENGTH) {
        await bot.api.sendMessage(numericId, text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await bot.api.sendMessage(numericId, text.slice(i, i + MAX_LENGTH));
        }
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  private findInstanceForJid(jid: string): ChannelInstance | undefined {
    // 从数据库查找 jid 对应的 channel instance
    return getChannelInstanceByJid(jid);
  }

  isConnected(): boolean {
    return this.bots.size > 0;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    for (const [instanceId, bot] of this.bots) {
      bot.stop();
      logger.info({ instanceId }, 'Telegram bot stopped');
    }
    this.bots.clear();
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!isTyping) return;

    const instance = this.findInstanceForJid(jid);
    if (!instance) return;

    const bot = this.bots.get(instance.id);
    if (!bot) return;

    try {
      const numericId = jid.replace(/^tg:/, '');
      await bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}

registerChannel('telegram', (opts: ChannelOpts) => {
  return new TelegramChannel(opts);
});
