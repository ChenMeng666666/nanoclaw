/**
 * Simple Telegram Channel for NanoClaw
 * Minimal implementation for testing
 */

import { Bot, Context, InlineKeyboard } from 'grammy';
import {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
  NewMessage,
} from '../types.js';
import { logger } from '../logger.js';
import { registerChannel } from './registry.js';
import fs from 'fs';
import path from 'path';

interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private bot: Bot;
  private onMessage: OnInboundMessage;
  private onChatMetadata: OnChatMetadata;
  private registeredGroups: () => Record<string, RegisteredGroup>;
  private started = false;

  constructor(opts: TelegramChannelOpts) {
    this.onMessage = opts.onMessage;
    this.onChatMetadata = opts.onChatMetadata;
    this.registeredGroups = opts.registeredGroups;

    // 直接从 .env 文件读取
    const envPath = path.join(process.cwd(), '.env');
    let token: string | undefined;
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        if (line.startsWith('TELEGRAM_BOT_TOKEN=')) {
          token = line.slice('TELEGRAM_BOT_TOKEN='.length).trim();
          break;
        }
      }
    }

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN not set');
    }

    this.bot = new Bot(token);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle /chatid command (without slash prefix)
    this.bot.command('chatid', async (ctx) => {
      const chatId = ctx.chat?.id;
      if (chatId) {
        await ctx.reply(`Chat ID: tg:${chatId}`);
      }
    });

    // Handle /start command
    this.bot.command('start', async (ctx) => {
      await ctx.reply('你好！我是米米的助手。请发送 /chatid 获取你的聊天 ID。');
    });

    // Handle all text messages
    this.bot.on('message:text', async (ctx) => {
      const chatId = ctx.chat?.id;
      const messageId = ctx.message?.message_id;
      const fromId = ctx.from?.id;
      const fromName = ctx.from?.first_name || ctx.from?.username || 'Unknown';
      const text = ctx.message?.text || '';
      const timestamp = new Date(ctx.message?.date * 1000).toISOString();

      if (!chatId || !messageId || !fromId) {
        return;
      }

      const jid = `tg:${chatId}`;

      // Notify chat metadata
      this.onChatMetadata(
        jid,
        timestamp,
        ctx.chat?.title,
        'telegram',
        ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup',
      );

      // Create message object
      const msg: NewMessage = {
        id: `tg:${messageId}`,
        chat_jid: jid,
        sender: `tg:${fromId}`,
        sender_name: fromName,
        content: text,
        timestamp: timestamp,
        is_from_me: false,
        is_bot_message: false,
      };

      this.onMessage(jid, msg);
    });
  }

  async connect(): Promise<void> {
    if (this.started) return;
    logger.info('Starting Telegram bot...');
    await this.bot.start();
    this.started = true;
    logger.info('Telegram bot connected');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!jid.startsWith('tg:')) {
      throw new Error(`Invalid Telegram JID: ${jid}`);
    }

    const chatId = Number(jid.slice(3));
    logger.debug({ jid, text: text.length }, 'Sending Telegram message');

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
      });
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
      throw err;
    }
  }

  isConnected(): boolean {
    return this.started;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (!this.started) return;
    logger.info('Stopping Telegram bot...');
    await this.bot.stop();
    this.started = false;
    logger.info('Telegram bot disconnected');
  }
}

// Register the channel - always register, check token in factory
registerChannel('telegram', (opts) => {
  try {
    return new TelegramChannel(opts);
  } catch (err) {
    logger.error({ err }, 'Failed to create Telegram channel');
    return null;
  }
});
