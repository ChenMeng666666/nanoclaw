#!/usr/bin/env tsx
/**
 * Configure Mimi's Telegram Channel
 * 为 Mimi agent 添加 Telegram 通道实例
 */

import { initDatabase } from '../src/db.js';
import {
  getAgentByFolder,
  createChannelInstance,
  getAllActiveAgents,
} from '../src/db-agents.js';

// 初始化数据库
initDatabase();

// 获取所有 agent
const agents = getAllActiveAgents();
console.log('\n=== 现有智能体 ===');
agents.forEach((agent, i) => {
  console.log(`${i + 1}. ${agent.name} (folder: ${agent.folder})`);
});

// 查找 mimi agent
const mimi = getAgentByFolder('mimi');
if (!mimi) {
  console.error('\n错误：未找到 mimi agent');
  process.exit(1);
}

console.log(`\n=== 配置 ${mimi.name} 的 Telegram 通道 ===`);
console.log(`Agent ID: ${mimi.id}`);
console.log(`Folder: ${mimi.folder}`);

// Telegram 通道配置
const channelConfig = {
  id: `ch_${Date.now()}`,
  agentId: mimi.id,
  channelType: 'telegram',
  botId: 'telegram_bot_token', // bot token 已在之前记录
  jid: 'tg:1043758083',        // Chat ID
  name: 'c',                    // Chat name
  mode: 'both' as 'dm' | 'group' | 'both',
};

console.log('\n通道配置:');
console.log(`  - Channel Type: ${channelConfig.channelType}`);
console.log(`  - JID: ${channelConfig.jid}`);
console.log(`  - Name: ${channelConfig.name}`);
console.log(`  - Mode: ${channelConfig.mode}`);

// 创建通道实例
createChannelInstance(channelConfig);

console.log('\n成功：Telegram 通道已添加到 Mimi agent');
console.log('运行 `npm run build` 后重启服务生效');
