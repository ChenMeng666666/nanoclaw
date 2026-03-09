#!/usr/bin/env tsx
/**
 * Configure Telegram Channel for Mimi
 */
import crypto from 'crypto';
import { initDatabase } from '../src/db.js';
import { createChannelInstance, getAllActiveAgents } from '../src/db-agents.js';
import { storeSecret } from '../src/keystore.js';

async function main() {
  // 检查加密密钥
  if (!process.env.NANOCLAW_ENCRYPTION_KEY) {
    console.error('错误：NANOCLAW_ENCRYPTION_KEY 未设置');
    console.log('请运行：export NANOCLAW_ENCRYPTION_KEY=$(openssl rand -hex 32)');
    process.exit(1);
  }

  console.log('[配置] 初始化数据库...');
  initDatabase();

  // 获取所有 agent
  const agents = getAllActiveAgents();
  console.log('\n[配置] 现有 agent 列表:');
  agents.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent.name} (folder: ${agent.folder}, id: ${agent.id})`);
  });

  // 找到 mimi
  const mimi = agents.find(a => a.folder === 'mimi');
  if (!mimi) {
    console.error('\n错误：找不到 mimi agent');
    process.exit(1);
  }

  console.log(`\n[配置] 找到 mimi agent: ${mimi.name}`);

  // Telegram bot token
  const botToken = '8766436330:AAHiyVvXAYkXQa5XqaVr7ZVxGQDMgt6OI8U';
  const jid = `tg:${botToken.split(':')[0]}`; // tg:8766436330

  console.log(`[配置] Bot Token: ${botToken.substring(0, 15)}...`);
  console.log(`[配置] JID: ${jid}`);

  // 创建通道实例
  const channelId = `ch_${crypto.randomBytes(8).toString('hex')}`;

  console.log('\n[配置] 创建 Telegram 通道实例...');
  createChannelInstance({
    id: channelId,
    agentId: mimi.id,
    channelType: 'telegram',
    botId: botToken,
    jid: jid,
    name: 'Mimi Bot',
    mode: 'both',
  });

  // 存储 bot token 到 keychain
  await storeSecret(`channel:${channelId}`, 'telegram_token', botToken);
  console.log('[配置] Bot token 已加密存储到 keychain');

  console.log('\n✅ Telegram 通道配置完成！');
  console.log(`  - Agent: ${mimi.name} (${mimi.folder})`);
  console.log(`  - Channel ID: ${channelId}`);
  console.log(`  - Bot: @${botToken.split(':')[0]}_bot`);
  console.log(`  - JID: ${jid}`);
  console.log('\n运行 `npm run build` 后重启服务生效');
}

main().catch(err => {
  console.error('配置失败:', err);
  process.exit(1);
});
