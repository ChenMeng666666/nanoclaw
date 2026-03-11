#!/usr/bin/env node

/**
 * 最小化的测试脚本，用于快速验证系统是否正常工作
 * 主要用于开发和调试阶段的快速验证
 */

import {
  initDatabase,
} from '../src/db.js';
import { MemoryManager } from '../src/memory-manager.js';
import { logger } from '../src/logger.js';
import { TestDataFactory, TestDatabaseHelper, TestAssertions } from './test-utils.js';

// 最小化测试配置
const MINIMAL_GROUP_FOLDER = 'minimal-test';

async function runMinimalTest() {
  logger.info('=== 运行最小化测试 ===');

  try {
    // 初始化数据库
    logger.debug('初始化数据库');
    initDatabase();

    // 创建测试 agent
    logger.debug('创建测试 agent');
    const testAgent = TestDataFactory.createTestAgent(MINIMAL_GROUP_FOLDER, 'minimal-test-agent');
    await TestDatabaseHelper.setupTestAgent(testAgent);

    // 初始化管理器
    const memoryManager = new MemoryManager();

    // 测试1：简单记忆操作
    logger.debug('1. 测试记忆管理');
    await memoryManager.addMemory(
      MINIMAL_GROUP_FOLDER,
      '测试记忆：NanoClaw系统正常工作',
      'L2'
    );

    // 验证记忆是否存储
    logger.debug('2. 验证存储');
    const memories = await memoryManager.searchMemories(
      MINIMAL_GROUP_FOLDER,
      '测试',
      5
    );

    if (memories.length === 0) {
      throw new Error('记忆存储失败');
    }

    // 清理测试数据
    logger.debug('3. 清理测试数据');
    await TestDatabaseHelper.cleanupTestAgent(testAgent.id);

    logger.info('=== 测试成功 ===');
    logger.info(`测试信息：`);
    logger.info(`- 记忆数量：${memories.length}`);

  } catch (error) {
    logger.error('=== 测试失败 ===');
    logger.error(error);

    // 尝试清理部分数据
    try {
      await TestDatabaseHelper.cleanupTestAgent('minimal-test-agent');
    } catch (cleanupError) {
      logger.error(`清理任务失败：${(cleanupError as Error).message}`);
    }

    process.exit(1);
  }
}

// 运行最小化测试
runMinimalTest().then(() => {
  logger.info('所有测试完成');
  process.exit(0);
}).catch(() => {
  process.exit(1);
});
