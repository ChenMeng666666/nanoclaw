#!/usr/bin/env -S npx tsx
/**
 * 仅测试 Telegram 连接 - 不需要 Docker
 */

import { Bot } from 'grammy';
import fs from 'fs';
import path from 'path';

// 直接从 .env 读取
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
  console.error('❌ TELEGRAM_BOT_TOKEN 未设置');
  process.exit(1);
}

const bot = new Bot(token);

console.log('🚀 启动 Telegram Bot 测试...');
console.log('📱 在 Telegram 中与 @claw_test_claw_bot 对话\n');

// Handle /chatid command
bot.command('chatid', async (ctx) => {
  const chatId = ctx.chat?.id;
  const chatType = ctx.chat?.type;
  const chatName = ctx.chat?.title || ctx.chat?.first_name || 'Unknown';

  console.log(`📥 收到 /chatid 请求`);
  console.log(`   Chat ID: ${chatId}`);
  console.log(`   Type: ${chatType}`);
  console.log(`   Name: ${chatName}`);

  if (chatId) {
    await ctx.reply(`Chat ID: tg:${chatId}`);
    console.log(`   ✓ 已回复 Chat ID\n`);
  }
});

// Handle /start command
bot.command('start', async (ctx) => {
  console.log(`📥 收到 /start 请求`);
  await ctx.reply('你好！我是米米的助手。请发送 /chatid 获取你的聊天 ID。');
  console.log(`   ✓ 已回复欢迎消息\n`);
});

// Handle all text messages
bot.on('message:text', async (ctx) => {
  const text = ctx.message?.text || '';
  const fromName = ctx.from?.first_name || ctx.from?.username || 'Unknown';
  const chatId = ctx.chat?.id;

  console.log(`📥 收到消息 (from: ${fromName}, chat: ${chatId}):`);
  console.log(`   "${text}"`);

  if (!text.startsWith('/')) {
    await ctx.reply(`收到你的消息了！请发送 /chatid 获取聊天 ID，然后按照 REAL_WORLD_TEST.md 的步骤继续测试。`);
    console.log(`   ✓ 已回复提示消息\n`);
  }
});

// Start the bot
console.log('🔗 正在连接 Telegram...');
bot.start().then(() => {
  console.log('✅ Telegram Bot 已连接！');
  console.log('📋 请在 Telegram 中操作：');
  console.log('   1. 打开 @claw_test_claw_bot');
  console.log('   2. 发送 /chatid');
  console.log('   3. 复制返回的 Chat ID');
  console.log('   4. 在这里按 Ctrl+C 停止');
  console.log('   5. 按照 REAL_WORLD_TEST.md 的步骤继续\n');
}).catch(err => {
  console.error('❌ 连接失败:', err);
  process.exit(1);
});

// Handle interrupt
process.on('SIGINT', async () => {
  console.log('\n\n👋 正在停止...');
  await bot.stop();
  console.log('✅ 已停止');
  process.exit(0);
});
