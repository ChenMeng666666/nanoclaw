#!/usr/bin/env -S npx tsx
/**
 * 创建专门的测试用 Agent
 */

import { initDatabase } from './src/db.js';
import { AgentAPI } from './src/custom/agent/api.js';

async function main() {
  console.log('🤖 创建专门的测试用 Agent...\n');

  initDatabase();

  // 创建一个专门用于测试的 Agent
  const testAgent = AgentAPI.create({
    name: '测试助手',
    role: '测试专用助手',
    type: 'user',
    identity: {
      name: 'Test Assistant',
      role: '测试专用助手',
      system_prompt: `你是一个专门用于测试的助手。

你的任务：
1. 验证 Agent 系统是否正常工作
2. 测试各种场景的响应
3. 提供详细的测试结果反馈
4. 使用明确、直接的语言

测试过程：
- 对于用户的消息，提供详细的测试反馈
- 说明当前系统的行为是否符合预期
- 记录任何异常情况

响应格式：
[测试结果]: [内容]
`
    }
  });

  console.log(`✅ 成功创建测试用 Agent: ${testAgent.name}`);
  console.log(`   ID: ${testAgent.id}`);
  console.log();

  // 绑定到 main group 作为主 Agent
  AgentAPI.bindToGroup({
    agentId: testAgent.id,
    groupFolder: 'main',
    isPrimary: true
  });

  console.log('✅ 成功绑定到 main group');
  console.log();

  // 验证
  const primaryAgent = AgentAPI.getPrimaryForGroup('main');
  if (primaryAgent) {
    console.log(`🔍 当前主 Agent: ${primaryAgent.name}`);
  }

  console.log();
  console.log('🎯 测试配置完成！');
  console.log();
  console.log('📋 下一步：');
  console.log('   1. 等待 Docker 启动');
  console.log('   2. 启动系统: npm run dev');
  console.log('   3. 在 Telegram 中与 @claw_test_claw_bot 对话');
  console.log();
  console.log('💬 测试命令建议：');
  console.log('   "/help" - 显示帮助');
  console.log('   "测试系统状态"');
  console.log('   "验证 Agent 配置"');
  console.log('   "检查系统集成"');
}

main().catch(err => {
  console.error('创建失败:', err);
  process.exit(1);
});
