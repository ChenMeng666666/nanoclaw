#!/usr/bin/env -S npx tsx
/**
 * 注册你的真实对话
 */

import { initDatabase, setRegisteredGroup } from './src/db.js';
import { RegisteredGroup } from './src/types.js';

initDatabase();

// 你的真实 Chat ID
const YOUR_CHAT_ID = 'tg:1043758083';

const yourGroup: RegisteredGroup = {
  name: '我的真实对话',
  folder: 'main',
  trigger: '@米米',
  added_at: new Date().toISOString(),
  isMain: true,
  requiresTrigger: false
};

setRegisteredGroup(YOUR_CHAT_ID, yourGroup);
console.log('✅ 成功注册你的真实对话！\n');

console.log('🎯 你的配置：');
console.log('   Chat ID: ', YOUR_CHAT_ID);
console.log('   Name:     我的真实对话');
console.log('   Folder:   main');
console.log('   Is Main:  true');
console.log();

console.log('📋 下一步：');
console.log('   1. 启动系统: npm run dev');
console.log('   2. 在 Telegram 中找到 @claw_test_claw_bot');
console.log('   3. 发送消息与米米对话！');
console.log();

console.log('💬 测试消息建议：');
console.log('   "米米，我今天好烦"');
console.log('   "我要不要辞掉这份工作？"');
console.log('   "可是我怕找不到更好的"');
console.log();
