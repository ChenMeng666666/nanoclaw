#!/usr/bin/env -S npx tsx
/**
 * 简单的 Telegram 连接测试
 */

import { Bot } from 'grammy';
import fs from 'fs';
import path from 'path';

// 读取 .env 文件
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env 文件不存在');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [key, value] = line.split('=').map(s => s.trim());
  envVars[key] = value;
}

if (!envVars.TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN 未设置');
  process.exit(1);
}

console.log('📝 环境变量：');
console.log('   TELEGRAM_BOT_TOKEN:', envVars.TELEGRAM_BOT_TOKEN);

console.log();
console.log('🚀 正在连接 Telegram...');
const bot = new Bot(envVars.TELEGRAM_BOT_TOKEN);

// 测试 getMe
console.log('🔍 测试 getMe...');
bot.api.getMe().then(me => {
  console.log('✅ 成功连接！');
  console.log('   Username:', me.username);
  console.log('   First Name:', me.first_name);
  console.log('   ID:', me.id);
}).catch(err => {
  console.error('❌ getMe 失败:', err);
  process.exit(1);
});

// Handle /start command
console.log('📡 设置 /start 处理器...');
bot.command('start', (ctx) => {
  console.log('📥 收到 /start 命令');
  return ctx.reply('你好！测试连接成功！');
});

// Handle /chatid command
console.log('📡 设置 /chatid 处理器...');
bot.command('chatid', (ctx) => {
  const chatId = ctx.chat?.id;
  console.log(`📥 收到 /chatid 命令: ${chatId}`);
  return ctx.reply(`Chat ID: tg:${chatId}`);
});

// Handle any text messages
console.log('📡 设置消息处理器...');
bot.on('message:text', (ctx) => {
  console.log(`📥 收到消息: "${ctx.message.text}"`);
  return ctx.reply(`收到: ${ctx.message.text}`);
});

console.log();
console.log('🎉 调试连接成功！');
console.log();
console.log('📋 现在你可以在 Telegram 中测试：');
console.log('   打开 @claw_test_claw_bot');
console.log('   发送 /start');
console.log('   发送 /chatid');
console.log('   发送任意消息');

// 启动 bot
console.log();
console.log('🚀 启动监听...');
bot.start().then(() => {
  console.log('✅ Bot 正在运行...');
}).catch(err => {
  console.error('❌ Bot 启动失败:', err);
  process.exit(1);
});
