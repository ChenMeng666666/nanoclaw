#!/usr/bin/env -S npx tsx
/**
 * 测试 Telegram 渠道连接
 */

import { initDatabase } from './src/db.js';
import { Bot } from 'grammy';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🔍 测试 Telegram 渠道连接...\n');

  // 读取 .env 文件
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env 文件不存在');
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envVars: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, value] = line.split('=').map(s => s.trim());
    envVars[key] = value;
  }

  console.log('📝 环境变量：');
  console.log('   TELEGRAM_BOT_TOKEN:', envVars.TELEGRAM_BOT_TOKEN);

  if (!envVars.TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN 未设置');
    return;
  }

  console.log('\n🔗 正在连接 Telegram...');
  try {
    const bot = new Bot(envVars.TELEGRAM_BOT_TOKEN);

    // 测试 getMe
    const me = await bot.api.getMe();
    console.log('✅ 成功连接到 Telegram');
    console.log('   Bot 信息：');
    console.log(`   Username: @${me.username}`);
    console.log(`   ID: ${me.id}`);
    console.log(`   First Name: ${me.first_name}`);

    // 关闭 bot
    await bot.stop();

  } catch (error) {
    console.error('❌ 连接失败：');
    console.error(error);
  }
}

main().catch(error => {
  console.error('❌ 发生错误：');
  console.error(error);
});
