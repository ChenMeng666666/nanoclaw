#!/usr/bin/env tsx
/**
 * Setup Agent Script
 *
 * 交互式创建 NanoClaw 智能体配置
 *
 * 用法：npx tsx scripts/setup-agent.ts
 */
import * as readline from 'readline';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

import { initDatabase } from '../src/db.js';
import {
  createAgent,
  createChannelInstance,
  getAllActiveAgents,
  updateAgent,
} from '../src/db-agents.js';
import { storeSecret } from '../src/keystore.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function log(...args: unknown[]) {
  console.log('\x1b[36m[Setup Agent]\x1b[0m', ...args);
}

function logError(...args: unknown[]) {
  console.log('\x1b[31m[Error]\x1b[0m', ...args);
}

function logSuccess(...args: unknown[]) {
  console.log('\x1b[32m[Success]\x1b[0m', ...args);
}

function logWarn(...args: unknown[]) {
  console.log('\x1b[33m[Warn]\x1b[0m', ...args);
}

function generateAgentId(): string {
  return `agent_${crypto.randomBytes(8).toString('hex')}`;
}

function generateFolderName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 64);
}

/**
 * 步骤 0：选择创建新 agent 还是编辑现有 agent
 */
async function selectOrCreateAgent(): Promise<{ mode: 'new' | 'edit'; agent?: unknown }> {
  log('=== NanoClaw 智能体管理 ===\n');

  const agents = getAllActiveAgents();

  if (agents.length > 0) {
    log(`发现 ${agents.length} 个现有智能体：\n`);
    agents.forEach((agent, i) => {
      log(`  ${i + 1}. ${agent.name} (folder: ${agent.folder})`);
    });
    log('');
  }

  const choice = await question('要做什么？(1=创建新智能体，2=编辑现有智能体，回车=创建新智能体): ');

  if (choice === '2' && agents.length > 0) {
    const idx = await question(`请选择要编辑的智能体编号 (1-${agents.length}): `);
    const numIdx = parseInt(idx, 10) - 1;
    if (numIdx >= 0 && numIdx < agents.length) {
      return { mode: 'edit', agent: agents[numIdx] };
    }
    logWarn('无效选择，将创建新智能体');
  }

  return { mode: 'new' };
}

/**
 * 步骤 1：收集智能体基本信息
 */
async function collectAgentInfo(): Promise<{
  id: string;
  name: string;
  folder: string;
  identity: string;
  userName?: string;
  personality?: string;
  values?: string;
  appearance?: string;
}> {
  log('=== 创建新智能体 ===\n');

  const name = await question('智能体名字（如 "Andy"）: ');
  if (!name) {
    logError('名字不能为空');
    return collectAgentInfo();
  }

  const folder = generateFolderName(name);
  log(`工作区 folder 将设为：${folder}`);

  log('\n=== 定义你的身份 ===');
  log('请用一段话完整描述 "你是谁"，这将直接写入 CLAUDE.md');
  log('\n建议包含：');
  log('  - 你的名字/称呼');
  log('  - 性格特点');
  log('  - 价值观/原则');
  log('  - 外貌形象（可选）');
  log('  - 行为准则/说话风格');
  log('\n示例：');
  log('  "我是 Andy，一个幽默风趣的助手。我喜欢用简单的比喻解释复杂概念。"');
  log('  "我坚信诚实第一，从不撒谎。我想象自己是一个 25 岁的亚洲男生，戴黑框眼镜。"');
  log('\n提示：你的输入将完整保存到 CLAUDE.md 中');
  log('      后续只能手动编辑 groups/{folder}/CLAUDE.md 修改\n');

  const identity = await question('请输入完整的 "我是谁" 描述：');
  if (!identity) {
    logError('描述不能为空');
    return collectAgentInfo();
  }

  // 解析结构化信息用于数据库
  let userName: string | undefined;
  let personality: string | undefined;
  let values: string | undefined;
  let appearance: string | undefined;

  if (identity.includes('称呼')) {
    const match = identity.match(/称呼 [:：]\s*([^,;,.]+)/);
    if (match) userName = match[1].trim();
  }
  if (identity.includes('性格')) {
    const match = identity.match(/性格 [:：]\s*([^,.。;]+)/);
    if (match) personality = match[1].trim();
  }
  if (identity.includes('价值') || identity.includes('原则') || identity.includes('坚信')) {
    const match = identity.match(/(?:价值 | 原则 | 坚信) [:：]?\s*([^,.。;]+)/);
    if (match) values = match[1].trim();
  }
  if (identity.includes('样貌') || identity.includes('形象') || identity.includes('岁')) {
    const match = identity.match(/(?:样貌 | 形象) [:：]\s*([^,.。;]+)/);
    if (match) appearance = match[1].trim();
  }

  if (!personality && !values) {
    personality = identity;
    values = identity;
  }

  if (!userName) {
    const match = identity.match(/我是 ([^,.，。]+)/);
    if (match && match[1] !== name) {
      userName = match[1].trim();
    }
  }

  return {
    id: generateAgentId(),
    name,
    folder,
    identity,
    userName: userName || undefined,
    personality: personality || identity,
    values: values || identity,
    appearance: appearance || undefined,
  };
}

/**
 * 步骤 2：配置 Anthropic API 凭证
 */
async function configureAnthropic(): Promise<{
  useGlobal: boolean;
  token?: string;
  url?: string;
  model?: string;
}> {
  log('\n=== 配置 Anthropic API ===\n');

  const useGlobal = await question('使用全局 ANTHROPIC 配置？(y/n，默认 y): ');

  if (useGlobal.toLowerCase() !== 'n') {
    log('将使用 .env 中的全局配置');
    return { useGlobal: true };
  }

  const token = await question('ANTHROPIC_AUTH_TOKEN: ');
  if (!token) {
    logError('Token 不能为空');
    return configureAnthropic();
  }

  const url = await question('ANTHROPIC_BASE_URL（可选，如使用代理）: ');
  const model = await question('ANTHROPIC_MODEL（默认 claude-sonnet-4-6）: ') || 'claude-sonnet-4-6';

  return { useGlobal: false, token, url: url || undefined, model };
}

/**
 * 步骤 3：配置通信通道
 */
async function configureChannel(agentId: string, agentName: string): Promise<{
  channelType: string;
  botId: string;
  jid: string;
  name: string | undefined;
  mode: 'dm' | 'group' | 'both';
} | null> {
  log('\n=== 配置通信通道 ===\n');
  log(`这将把通道绑定到智能体 "${agentName}"`);
  log('每个智能体对应一个独立的 bot（如 @mimi_bot）\n');

  const skip = await question('现在跳过通道配置？(y/n，通道可稍后通过 /add-telegram 等 skill 添加): ');
  if (skip.toLowerCase() === 'y') {
    return null;
  }

  log('支持的通道类型：telegram, whatsapp, slack, discord');
  const channelType = await question('通道类型：');

  if (!['telegram', 'whatsapp', 'slack', 'discord'].includes(channelType.toLowerCase())) {
    logError('不支持的通道类型');
    return configureChannel(agentId, agentName);
  }

  const botId = await question('Bot ID（如 Telegram bot token 或标识符）: ');
  if (!botId) {
    logError('Bot ID 不能为空');
    return configureChannel(agentId, agentName);
  }

  const jid = await question('通道 JID（如 tg:123456789）: ');
  if (!jid) {
    logError('JID 不能为空');
    return configureChannel(agentId, agentName);
  }

  const name = await question('显示名称（可选）: ');

  log('模式：dm(私聊) / group(群聊) / both(两者)');
  const modeInput = await question('模式（默认 both）: ') || 'both';
  const mode = (['dm', 'group', 'both'].includes(modeInput) ? modeInput : 'both') as 'dm' | 'group' | 'both';

  return {
    channelType: channelType.toLowerCase(),
    botId,
    jid,
    name: name || undefined,
    mode,
  };
}

/**
 * 步骤 4：启用高级功能（记忆、学习、进化系统）
 */
async function configureAdvancedFeatures(): Promise<{
  enableMemory: boolean;
  enableLearning: boolean;
  enableEvolution: boolean;
}> {
  log('\n=== 启用高级功能 ===\n');
  log('NanoClaw 提供以下高级功能：');
  log('  1. 记忆系统 - 存储和回忆用户信息、偏好、历史对话');
  log('  2. 学习系统 - 定时反思和总结，自动生成学习任务');
  log('  3. 进化系统 - 共享经验库，与其他 agent 分享有效方法');
  log('\n这些功能通过运行时 API (http://host.docker.internal:3456) 调用');
  log('agent 容器内可以使用 curl 或代码库访问这些 API\n');

  const choice = await question('要启用这些功能吗？(1=全部启用 (推荐), 2=跳过，3=自定义): ');

  if (choice === '1') {
    log('已启用全部高级功能');
    return { enableMemory: true, enableLearning: true, enableEvolution: true };
  }

  if (choice === '2') {
    log('已跳过，后续可手动配置');
    return { enableMemory: false, enableLearning: false, enableEvolution: false };
  }

  // 自定义
  const memory = await question('启用记忆系统？(y/n): ');
  const learning = await question('启用学习系统？(y/n): ');
  const evolution = await question('启用进化系统？(y/n): ');

  return {
    enableMemory: memory.toLowerCase() !== 'n',
    enableLearning: learning.toLowerCase() !== 'n',
    enableEvolution: evolution.toLowerCase() !== 'n',
  };
}

/**
 * 生成 CLAUDE.md 认知文件
 */
function generateClaudeMd(agentInfo: {
  name: string;
  identity: string;
}, advancedFeatures?: {
  enableMemory: boolean;
  enableLearning: boolean;
  enableEvolution: boolean;
  folder: string;
}): string {
  let content = `# ${agentInfo.name}

${agentInfo.identity}

## 重要约束

- **你的身份是固定的**，不能通过对话修改
- 严格遵守上述性格和价值观设定
- 每个用户有独立的记忆，不要混淆不同用户的信息
- 如需修改认知，只能手动编辑此 CLAUDE.md 文件
- 所有的反馈使用中文回复
`;

  // 如果启用了高级功能，添加 API 使用说明
  if (advancedFeatures && (advancedFeatures.enableMemory || advancedFeatures.enableLearning || advancedFeatures.enableEvolution)) {
    content += `
## 可用 API（记忆、学习、进化系统）

NanoClaw 提供运行时 API 供你使用记忆、学习和进化功能。

### 快速示例

**记住用户偏好**：
\`\`\`bash
curl -X POST http://host.docker.internal:3456/api/memory/add \\
  -H "Content-Type: application/json" \\
  -d '{"agentFolder": "${advancedFeatures.folder}", "content": "用户喜欢简洁回答", "level": "L2"}'
\`\`\`

**查询记忆**：
\`\`\`bash
curl -X POST http://host.docker.internal:3456/api/memory/search \\
  -H "Content-Type: application/json" \\
  -d '{"query": "用户偏好", "agentFolder": "${advancedFeatures.folder}", "limit": 5}'
\`\`\`

**提交经验到进化库**：
\`\`\`bash
curl -X POST http://host.docker.internal:3456/api/evolution/submit \\
  -H "Content-Type: application/json" \\
  -d '{"abilityName": "技巧名", "content": "...", "sourceAgentId": "${advancedFeatures.folder}", "tags": ["技巧"]}'
\`\`\`

### 完整文档

查看 \`container/skills/agent-memory/SKILL.md\` 获取完整 API 文档和代码示例。

### 注意事项

- **URL 配置**：容器内使用 \`http://host.docker.internal:3456\`
- **agentFolder**：必须与你的 folder 名（\`${advancedFeatures.folder}\`）一致
- **记忆层级**：L1(临时) / L2(短期) / L3(长期，带向量检索)
`;
  }

  return content;
}

/**
 * 编辑现有 agent
 */
async function editAgent(agent: { id: string; name: string; folder: string }): Promise<void> {
  log(`\n=== 编辑智能体 "${agent.name}" ===\n`);

  const claudeMdPath = path.resolve(process.cwd(), 'groups', agent.folder, 'CLAUDE.md');
  let currentContent = '';
  if (fs.existsSync(claudeMdPath)) {
    currentContent = fs.readFileSync(claudeMdPath, 'utf-8');
  }

  const choice = await question('如何修改？(1=覆盖重写，2=查看当前内容，3=跳过): ');

  if (choice === '3' || !choice) {
    log('跳过编辑');
    return;
  }

  if (choice === '2') {
    log('\n当前 CLAUDE.md 内容：');
    log('---');
    log(currentContent);
    log('---\n');
    const newChoice = await question('现在要？(1=覆盖重写，3=跳过): ');
    if (newChoice === '3' || !newChoice) return;
  }

  log('\n请输入新的完整身份描述，完成后输入单独一行的 "." 结束\n');

  const lines: string[] = [];
  while (true) {
    const line = await question('> ');
    if (line === '.') break;
    lines.push(line);
  }

  const identity = lines.join('\n');

  // 更新文件
  fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
  fs.writeFileSync(claudeMdPath, generateClaudeMd({ name: agent.name, identity }));

  // 更新数据库
  updateAgent(agent.id, {
    personality: identity,
    values: identity,
  });

  logSuccess(`智能体 "${agent.name}" 已更新！`);
}

/**
 * 主函数
 */
async function main() {
  try {
    if (!process.env.NANOCLAW_ENCRYPTION_KEY) {
      logError('NANOCLAW_ENCRYPTION_KEY 未设置！');
      log('请运行：export NANOCLAW_ENCRYPTION_KEY=$(openssl rand -hex 32)');
      process.exit(1);
    }

    log('初始化数据库...');
    initDatabase();

    const selection = await selectOrCreateAgent();

    if (selection.mode === 'edit' && selection.agent) {
      await editAgent(selection.agent as { id: string; name: string; folder: string });
      log('\n运行 `npm run build` 后重启服务生效');
      return;
    }

    // 创建新 agent
    const agentInfo = await collectAgentInfo();
    const anthropicConfig = await configureAnthropic();
    const channelInfo = await configureChannel(agentInfo.id, agentInfo.name);
    const advancedFeatures = await configureAdvancedFeatures();

    log('\n创建智能体记录...');
    createAgent({
      id: agentInfo.id,
      name: agentInfo.name,
      folder: agentInfo.folder,
      userName: agentInfo.userName,
      personality: agentInfo.personality,
      values: agentInfo.values,
      appearance: agentInfo.appearance,
      credentials: {
        anthropicToken: anthropicConfig.token,
        anthropicUrl: anthropicConfig.url,
        anthropicModel: anthropicConfig.model || 'claude-sonnet-4-6',
      },
    });

    if (channelInfo) {
      log('创建通道实例...');
      createChannelInstance({
        id: `ch_${crypto.randomBytes(8).toString('hex')}`,
        agentId: agentInfo.id,
        channelType: channelInfo.channelType,
        botId: channelInfo.botId,
        jid: channelInfo.jid,
        name: channelInfo.name,
        mode: channelInfo.mode,
      });
    }

    log('生成 CLAUDE.md...');
    const groupsDir = path.resolve(process.cwd(), 'groups');
    const agentDir = path.join(groupsDir, agentInfo.folder);
    fs.mkdirSync(agentDir, { recursive: true });

    const claudeMdPath = path.join(agentDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, generateClaudeMd(agentInfo, advancedFeatures.enableMemory || advancedFeatures.enableLearning || advancedFeatures.enableEvolution
      ? { ...advancedFeatures, folder: agentInfo.folder }
      : undefined));

    if (anthropicConfig.token) {
      await storeSecret(agentInfo.id, 'anthropic_token', anthropicConfig.token);
      if (anthropicConfig.url) {
        await storeSecret(agentInfo.id, 'anthropic_url', anthropicConfig.url);
      }
      log('敏感凭证已加密存储到系统 keychain');
    }

    logSuccess(`\n智能体 "${agentInfo.name}" 创建成功！`);
    log(`  - Agent ID: ${agentInfo.id}`);
    log(`  - Folder: ${agentInfo.folder}`);
    log(`  - CLAUDE.md: ${claudeMdPath}`);
    log('  - 身份描述已完整写入 CLAUDE.md');
    if (channelInfo) {
      log(`  - 通道：${channelInfo.channelType} (${channelInfo.jid})`);
    }
    if (advancedFeatures.enableMemory || advancedFeatures.enableLearning || advancedFeatures.enableEvolution) {
      log('  - 高级功能：已启用');
      log('    查看 container/skills/agent-memory/SKILL.md 获取使用文档');
    }
    log('\n运行 `npm run build` 后重启服务生效');

  } catch (err) {
    logError(`创建失败：${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
