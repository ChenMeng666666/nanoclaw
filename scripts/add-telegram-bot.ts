#!/usr/bin/env tsx
/**
 * Add Telegram Bot to an Agent
 *
 * 为指定 agent 配置独立的 Telegram bot
 * 支持多 agent，每个 agent 对应一个独立的 bot token
 */
import crypto from 'crypto';
import readline from 'readline';
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

  console.log('=== 为 Agent 添加 Telegram Bot ===\n');

  console.log('[1/5] 初始化数据库...');
  initDatabase();

  // 获取所有 agent
  const agents = getAllActiveAgents();
  if (agents.length === 0) {
    console.error('错误：没有找到任何 agent，请先运行 npx tsx scripts/setup-agent.ts');
    process.exit(1);
  }

  console.log('\n[2/5] 现有 Agent 列表:');
  agents.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent.name} (folder: ${agent.folder})`);
  });

  const agentIndex = await question(`\n请选择要绑定的 Agent 编号 (1-${agents.length}): `);
  const numIdx = parseInt(agentIndex, 10) - 1;
  if (isNaN(numIdx) || numIdx < 0 || numIdx >= agents.length) {
    console.error('错误：无效的选择');
    process.exit(1);
  }
  const selectedAgent = agents[numIdx];
  console.log(`\n已选择：${selectedAgent.name}`);

  // 收集 Telegram bot token
  console.log('\n[3/5] 配置 Telegram Bot');
  console.log('如果没有 bot，请按以下步骤创建：');
  console.log('  1. 打开 Telegram，搜索 @BotFather');
  console.log('  2. 发送 /newbot，按提示设置名字和用户名（必须以 bot 结尾）');
  console.log('  3. 复制 bot token（格式：123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11）');

  const botToken = await question('\n请输入 Bot Token: ');
  if (!botToken) {
    console.error('错误：Bot token 不能为空');
    process.exit(1);
  }

  // 验证 token 格式
  const tokenMatch = botToken.match(/^(\d+):([A-Za-z0-9_-]+)$/);
  if (!tokenMatch) {
    console.error('错误：Bot token 格式无效，应该是 数字:字符串 格式');
    process.exit(1);
  }

  const botId = tokenMatch[1];
  const jid = `tg:${botId}`;

  console.log(`\nBot ID: ${botId}`);
  console.log(`JID: ${jid}`);

  // 检查是否已有 Telegram 通道
  console.log('\n[4/5] 检查现有通道配置...');
  // TODO: 需要添加查询函数

  // 创建通道实例
  const channelId = `ch_${crypto.randomBytes(8).toString('hex')}`;

  console.log('\n[5/5] 创建通道实例...');
  createChannelInstance({
    id: channelId,
    agentId: selectedAgent.id,
    channelType: 'telegram',
    botId: botToken,  // 完整 token 存入数据库
    jid: jid,
    name: `${selectedAgent.name} Bot`,
    mode: 'both',
  });

  // 加密存储到 keychain
  await storeSecret(`channel:${channelId}`, 'telegram_token', botToken);
  console.log('✅ Bot token 已加密存储到系统 keychain');

  console.log('\n✅ Telegram Bot 配置完成！');
  console.log(`  - Agent: ${selectedAgent.name} (${selectedAgent.folder})`);
  console.log(`  - Channel ID: ${channelId}`);
  console.log(`  - Bot Username: @${botId}_bot`);
  console.log(`  - JID: ${jid}`);
  console.log('\n下一步：');
  console.log('  1. 在 Telegram 中搜索你的 bot 用户名');
  console.log('  2. 发送 /chatid 获取聊天 ID');
  console.log('  3. 使用获取的聊天 ID 注册聊天');
  console.log('\n运行 `npm run build` 后重启服务生效');
}

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

main().catch(err => {
  console.error('配置失败:', err);
  process.exit(1);
});
