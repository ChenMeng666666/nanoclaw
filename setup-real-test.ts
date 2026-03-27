#!/usr/bin/env -S npx tsx
/**
 * 配置真实用户场景测试
 */

import { initDatabase } from './src/db.js';
import { AgentAPI } from './src/custom/agent/api.js';

async function main() {
  console.log('🤖 配置真实用户场景测试...\n');

  // 初始化数据库
  initDatabase();

  // 1. 创建 Agent 米米
  console.log('1. 创建 Agent「米米」...');
  const mimi = AgentAPI.create({
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
  console.log(`   ✓ Agent 创建成功: ${mimi.name} (ID: ${mimi.id})\n`);

  // 2. 绑定到 main group
  console.log('2. 绑定 Agent 到 main group...');
  AgentAPI.bindToGroup({
    agentId: mimi.id,
    groupFolder: 'main',
    isPrimary: true
  });
  console.log('   ✓ 绑定成功\n');

  // 3. 验证
  console.log('3. 验证配置...');
  const primaryAgent = AgentAPI.getPrimaryForGroup('main');
  if (primaryAgent) {
    console.log(`   ✓ Primary Agent: ${primaryAgent.name}`);
  }
  console.log();

  console.log('✅ 真实用户场景测试配置完成！\n');
  console.log('📋 下一步：');
  console.log('   1. 启动系统: npm run dev');
  console.log('   2. 在 Telegram 中找到 @claw_test_claw_bot');
  console.log('   3. 发送 /chatid 获取你的 Chat ID');
  console.log('   4. 用 Chat ID 注册你的对话');
  console.log('   5. 开始与米米对话！\n');
}

main().catch(err => {
  console.error('配置失败:', err);
  process.exit(1);
});
