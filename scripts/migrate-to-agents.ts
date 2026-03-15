#!/usr/bin/env tsx
/**
 * 迁移脚本：将现有 NanoClaw 配置迁移到多智能体架构
 *
 * 迁移内容：
 * 1. 为每个现有的 group 创建默认的 agent 记录
 * 2. 创建 channel_instances 记录
 * 3. 保留现有 group folder 结构
 * 4. 创建兼容视图
 *
 * 用法：npx tsx scripts/migrate-to-agents.ts
 */
import crypto from 'crypto';
import { initDatabase, getAllRegisteredGroups } from '../src/db.js';
import {
  createAgent,
  createChannelInstance,
  getAgentByFolder,
} from '../src/db-agents.js';

function log(...args: unknown[]) {
  console.log('\x1b[36m[Migration]\x1b[0m', ...args);
}

function logSuccess(...args: unknown[]) {
  console.log('\x1b[32m[OK]\x1b[0m', ...args);
}

function logError(...args: unknown[]) {
  console.log('\x1b[31m[Error]\x1b[0m', ...args);
}

function logWarn(...args: unknown[]) {
  console.log('\x1b[33m[Warn]\x1b[0m', ...args);
}

/**
 * 生成安全的 agent ID
 */
function generateAgentId(folder: string): string {
  return `agent_migrated_${folder}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 迁移单个 group 到 agent
 */
async function migrateGroup(
  jid: string,
  group: {
    name: string;
    folder: string;
    trigger: string;
    added_at: string;
    containerConfig?: unknown;
    requiresTrigger?: boolean;
    isMain?: boolean;
  },
): Promise<boolean> {
  try {
    // 检查 agent 是否已存在
    const existing = getAgentByFolder(group.folder);
    if (existing) {
      logWarn(`Agent for folder "${group.folder}" already exists, skipping`);
      return false;
    }

    // 创建 agent 记录（使用全局 API 配置）
    createAgent({
      id: generateAgentId(group.folder),
      name: group.name,
      folder: group.folder,
      userName: undefined,
      personality: undefined,
      values: undefined,
      appearance: undefined,
      credentials: {
        // 留空，使用全局 .env 配置
        anthropicModel: 'claude-sonnet-4-6',
      },
    });

    // 创建 channel_instance 记录
    // 推断通道类型
    let channelType = 'unknown';
    if (jid.includes('@g.us')) channelType = 'whatsapp';
    else if (jid.includes('@s.whatsapp.net')) channelType = 'whatsapp';
    else if (jid.startsWith('tg:')) channelType = 'telegram';
    else if (jid.startsWith('dc:')) channelType = 'discord';
    else if (jid.startsWith('slack:')) channelType = 'slack';

    createChannelInstance({
      id: `ch_migrated_${crypto.randomBytes(8).toString('hex')}`,
      agentId: getAgentByFolder(group.folder)!.id,
      channelType,
      botId: `default_${channelType}`, // 使用默认 bot 标识
      jid,
      name: group.name,
      mode: group.isMain ? 'both' : 'group',
    });

    logSuccess(`Migrated group "${group.name}" (${group.folder})`);
    return true;
  } catch (err) {
    logError(`Failed to migrate "${group.name}": ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    log('=== NanoClaw Multi-Agent Migration ===\n');

    // 初始化数据库
    log('Initializing database...');
    initDatabase();

    // 获取现有 groups
    log('Fetching existing registered groups...');
    const groups = getAllRegisteredGroups();
    const groupEntries = Object.entries(groups);

    if (groupEntries.length === 0) {
      log('No existing groups found, nothing to migrate.');
      return;
    }

    log(`Found ${groupEntries.length} group(s) to migrate:\n`);
    for (const [jid, group] of groupEntries) {
      log(`  - ${group.name} (JID: ${jid}, folder: ${group.folder})`);
    }

    // 确认迁移
    console.log();
    const answer = await new Promise<string>((resolve) => {
      process.stdout.write('Proceed with migration? (y/n): ');
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim().toLowerCase());
      });
    });

    if (answer !== 'y' && answer !== 'yes') {
      log('Migration cancelled.');
      return;
    }

    // 执行迁移
    log('\nStarting migration...\n');
    let successCount = 0;
    let skipCount = 0;

    for (const [jid, group] of groupEntries) {
      const result = await migrateGroup(jid, group);
      if (result) {
        successCount++;
      } else {
        skipCount++;
      }
    }

    // 输出结果
    log('\n=== Migration Summary ===');
    logSuccess(`Successfully migrated: ${successCount}`);
    if (skipCount > 0) {
      logWarn(`Skipped (already exists): ${skipCount}`);
    }

    log('\nNext steps:');
    log('1. Review the created agents in the database');
    log('2. Configure agent-specific API credentials if needed:');
    log('   npx tsx scripts/setup-agent.ts');
    log('3. Update your channel configurations');
    log('4. Run `npm run build` and restart the service');

  } catch (err) {
    logError(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
