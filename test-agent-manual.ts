#!/usr/bin/env -S npx tsx
/**
 * Agent系统手动测试脚本
 * 演示如何使用Agent API进行各种操作
 */

import { initDatabase } from './src/db.js';
import { AgentAPI } from './src/custom/agent/api.js';

console.log('🤖 Agent系统手动测试\n');

// 初始化数据库
console.log('0. 初始化数据库');
initDatabase();
console.log('   ✓ 数据库初始化成功');
console.log();

// 测试1: 创建一个新Agent
console.log('1. 创建新Agent - 米米（Mimi）');
const mimi = AgentAPI.create({
  name: '米米',
  role: '首席决策辅助',
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
console.log(`   ✓ Agent创建成功: ${mimi.name} (ID: ${mimi.id})`);
console.log();

// 测试2: 列出所有Agents
console.log('2. 列出所有Agents');
const allAgents = AgentAPI.list();
console.log(`   ✓ 共有 ${allAgents.length} 个Agent:`);
allAgents.forEach((agent, index) => {
  console.log(`     ${index + 1}. ${agent.name} - ${agent.role} (${agent.status})`);
});
console.log();

// 测试3: 根据ID获取Agent
console.log('3. 根据ID获取Agent');
const fetchedAgent = AgentAPI.getById(mimi.id);
if (fetchedAgent) {
  console.log(`   ✓ 获取成功: ${fetchedAgent.name}`);
  console.log(`     System Prompt长度: ${fetchedAgent.system_prompt?.length || 0} 字符`);
} else {
  console.log('   ✗ 获取失败');
}
console.log();

// 测试4: 更新Agent
console.log('4. 更新Agent信息');
const updatedAgent = AgentAPI.update({
  agentId: mimi.id,
  updates: {
    name: '米米姐',
    identity: {
      role: '首席决策辅助 & 精神领袖'
    }
  }
});
if (updatedAgent) {
  console.log(`   ✓ 更新成功: ${updatedAgent.name} - ${updatedAgent.role}`);
} else {
  console.log('   ✗ 更新失败');
}
console.log();

// 测试5: 绑定到Group
console.log('5. 绑定Agent到Group (main)');
AgentAPI.bindToGroup({
  agentId: mimi.id,
  groupFolder: 'main',
  isPrimary: true
});
console.log('   ✓ 绑定成功');

const groups = AgentAPI.getAgentGroups(mimi.id);
console.log(`   Agent所属Groups: ${groups.join(', ')}`);

const isPrimary = AgentAPI.isPrimaryAgent(mimi.id, 'main');
console.log(`   是否是main的主Agent: ${isPrimary ? '是' : '否'}`);
console.log();

// 测试6: 创建另一个Agent
console.log('6. 创建第二个Agent - 小小');
const xiaoxiao = AgentAPI.create({
  name: '小小',
  role: '技术助手',
  type: 'user',
  identity: {
    name: 'Xiaoxiao',
    role: '技术助手',
    system_prompt: '你是小小，一个专注于技术问题的助手。'
  }
});
console.log(`   ✓ Agent创建成功: ${xiaoxiao.name} (ID: ${xiaoxiao.id})`);
console.log();

// 测试7: 查询Group的Agents
console.log('7. 查询main group的所有Agents');
const mainAgents = AgentAPI.getGroupAgents('main');
console.log(`   main group有 ${mainAgents.length} 个Agent:`);
mainAgents.forEach(agent => {
  console.log(`     - ${agent.name}`);
});

const primaryAgent = AgentAPI.getPrimaryForGroup('main');
if (primaryAgent) {
  console.log(`   主Agent: ${primaryAgent.name}`);
}
console.log();

// 测试8: 解除绑定
console.log('8. 测试解除绑定和删除');
AgentAPI.unbindFromGroup(xiaoxiao.id, 'main');
console.log('   ✓ 小小已从main解除绑定');

AgentAPI.delete({ agentId: xiaoxiao.id });
console.log('   ✓ 小小已删除');

const remainingAgents = AgentAPI.list();
console.log(`   剩余Agents: ${remainingAgents.length}`);
console.log();

console.log('✅ 测试完成！\n');
console.log('提示: 你可以通过修改这个脚本来测试更多功能');
console.log('或直接在代码中使用 AgentAPI 类');
