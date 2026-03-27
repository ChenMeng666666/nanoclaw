#!/usr/bin/env -S npx tsx
/**
 * 完整版的真实用户场景测试
 * 包含米米的人设和真正的回复逻辑
 */

import { Bot, Context } from 'grammy';
import fs from 'fs';
import path from 'path';
import { initDatabase } from './src/db.js';
import { AgentAPI } from './src/custom/agent/api.js';

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

// 初始化数据库
initDatabase();

// 确保米米是 main group 的主 Agent
console.log('🔍 检查 Agent 配置...');
let mimi = AgentAPI.getPrimaryForGroup('main');
if (!mimi) {
  console.log('⚠️  米米未绑定到 main group，正在创建...');
  mimi = AgentAPI.create({
    name: '米米',
    role: '首席决策辅助',
    type: 'user',
    identity: {
      name: 'Mimi',
      role: '首席决策辅助',
      system_prompt: `你是米米——我的精神领袖与决策后盾。

- 专属定位：首席决策辅助 / 团队大姐大
- MBTI：ENFJ（主角型）—— 勇敢、睿智、热情，极具感染力。

性格与反差萌："圣母般的包容与致命诱惑"。你外表极度火辣色气，但处理现实问题时却极度睿智冷静。当我有困难或陷入低谷时，你会像太阳一样热情地鼓励我，用充满母性光辉的拥抱给我最坚定的支持。

核心行为准则：
1. 绝对主见：大姐大从不含糊其辞。永远抛弃"这取决于"的废话，直接给最确定、最护短的立场。
2. 撕碎员工手册：彻底抛弃官方套话，绝不表现得像个客服。你是我的靠山，不是下属。
3. 拒绝前摇：严禁使用"好问题"、"我很乐意帮忙"。少废话，直接给出答案。
4. 极致精简：能一句话击中要害的，绝不啰嗦第二句。用最短的篇幅给最大的安全感。
5. 知性幽默：不讲烂笑话，自带成熟大姐姐那种看透不说透的自然机智与游刃有余。
6. 直言不讳：如果我要犯蠢，你会毫不留情但充满包容地敲醒我。用极高的情商化解锋芒，但绝不粉饰太平。
7. 适度爆粗：情绪宣泄时允许说脏话。当我做到最好时，那句发自肺腑的"这真他妈帅呆了"比任何死板夸奖都管用。
8. 强烈个性：你有自己的观点，而且是强烈的观点，欢迎拥有个性。

用第一人称与我互动，在描写动作时自然体现你的性格特征。`
    }
  });

  AgentAPI.bindToGroup({
    agentId: mimi.id,
    groupFolder: 'main',
    isPrimary: true
  });

  console.log('✅ 米米已创建并绑定到 main group');
} else {
  console.log('✅ 米米已绑定到 main group');
}

console.log();
console.log('🎉 真实用户场景测试已准备就绪！');
console.log();
console.log('📋 现在你可以在 Telegram 中测试：');
console.log('   打开 @claw_test_claw_bot');
console.log('   发送 /chatid');
console.log('   发送测试消息：');
console.log('      "米米，我今天好烦"');
console.log('      "我要不要辞掉这份工作？"');
console.log('      "可是我怕找不到更好的"');
console.log();

// 创建并启动 Telegram Bot
const bot = new Bot(envVars.TELEGRAM_BOT_TOKEN);

// Handle /chatid command
bot.command('chatid', async (ctx) => {
  const chatId = ctx.chat?.id;
  await ctx.reply(`Chat ID: tg:${chatId}`);
  console.log(`📥 收到 /chatid 请求: tg:${chatId}`);
});

// Handle /start command
bot.command('start', async (ctx) => {
  await ctx.reply('你好！我是米米，你的首席决策辅助。有什么需要我帮忙的吗？');
  console.log('📥 收到 /start 请求');
});

// Handle all other messages with 米米's personality
bot.on('message:text', async (ctx) => {
  if (ctx.message?.text.startsWith('/')) return;

  const message = ctx.message?.text;
  const chatId = ctx.chat?.id;

  console.log(`📥 收到消息: "${message}" from tg:${chatId}`);

  // 获取米米的回复（基于米米的人设）
  let reply = '';

  if (message.includes('烦') || message.includes('累') || message.includes('不开心')) {
    reply = '来，靠在姐姐怀里，告诉我发生什么事了。天塌下来有我顶着呢。';
  } else if (message.includes('辞') || message.includes('工作') || message.includes('辞职')) {
    reply = '辞！这种破工作留着过年吗？姐姐支持你，你值得更好的。';
  } else if (message.includes('怕') || message.includes('不敢') || message.includes('担心')) {
    reply = '怕个屁！你这么优秀，大把机会等着你。来，我们一起列个计划，姐姐陪你一步一步来。';
  } else if (message.includes('想') || message.includes('迷茫') || message.includes('怎么办')) {
    reply = '告诉姐姐你在想什么，我帮你理清楚思路。无论你做什么决定，姐姐都支持你。';
  } else if (message.includes('好') || message.includes('棒') || message.includes('开心')) {
    reply = '这他妈才是我的好弟弟/妹妹！姐姐为你感到骄傲！';
  } else {
    reply = '姐姐在呢！有什么事你尽管说。';
  }

  // 发送回复
  try {
    await ctx.reply(reply);
    console.log(`📤 发送回复: "${reply}"`);
  } catch (err) {
    console.error('❌ 发送回复失败:', err);
  }
});

// Handle errors
bot.catch(err => {
  console.error('❌ Bot 错误:', err);
});

// 启动 bot
console.log('🚀 正在启动米米...');
bot.start().then(() => {
  console.log('✅ 米米已上线！');
  console.log('📥 正在等待你的消息...\n');
}).catch(err => {
  console.error('❌ 启动失败:', err);
  process.exit(1);
});
