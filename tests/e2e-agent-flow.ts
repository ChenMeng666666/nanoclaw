#!/usr/bin/env node

import { join } from 'path';
import { execSync } from 'child_process';
import {
  initDatabase,
  createTask,
  getDueTasks,
  logTaskRun,
  getAllRegisteredGroups,
  getTaskById,
  deleteTask,
} from '../src/db.js';
import {
  ContainerInput,
  runContainerAgent,
  writeTasksSnapshot,
} from '../src/container-runner.js';
import { startSchedulerLoop, computeNextRun } from '../src/task-scheduler.js';
import { MemoryManager } from '../src/memory-manager.js';
import { EvolutionManager } from '../src/evolution-manager.js';
import { logger } from '../src/logger.js';
import { readEnvFile } from '../src/env.js';
import { RegisteredGroup } from '../src/types.js';
import {
  TestDataFactory,
  TestDatabaseHelper,
  TestAssertions,
} from './test-utils.js';

// 测试配置
const TEST_GROUP: RegisteredGroup = TestDataFactory.createTestGroup('test');

// 测试任务配置
const TEST_TASK = TestDataFactory.createTestTask(
  TEST_GROUP.folder,
  'test-task-1',
);

// 全局变量
let memoryManager: MemoryManager;
let evolutionManager: EvolutionManager;

async function testCompleteAgentFlow() {
  logger.info('=== 启动NanoClaw完整流程测试 ===');

  try {
    // 1. 初始化数据库
    logger.info('1. 初始化数据库');
    initDatabase();

    // 创建测试 agent
    logger.debug('创建测试 agent');
    const testAgent = TestDataFactory.createTestAgent(
      TEST_GROUP.folder,
      'test-agent',
    );
    await TestDatabaseHelper.setupTestAgent(testAgent);

    // 2. 测试记忆管理
    logger.info('2. 测试记忆管理');
    memoryManager = new MemoryManager();
    await memoryManager.addMemory(
      TEST_GROUP.folder,
      '测试记忆内容：NanoClaw架构包含主进程、消息循环、容器调度',
      'L2',
    );

    // 3. 测试进化系统
    logger.info('3. 测试进化系统');
    evolutionManager = new EvolutionManager();
    const experienceId = await evolutionManager.submitExperience(
      'agent-flow-test',
      '测试完整agent流程：初始化数据库→配置测试agent→创建记忆→提交进化经验→创建定时任务→生成任务快照→验证数据完整性→清理测试数据。这个流程涵盖了NanoClaw系统的主要功能点，验证了从数据初始化到最终清理的完整生命周期。',
      testAgent.id,
      '测试NanoClaw完整agent流程',
      ['测试', '流程验证', 'agent'],
    );
    logger.info(`   经验已提交（ID: ${experienceId}）`);

    // 手动批准经验以便查询能找到
    await evolutionManager.reviewExperience(
      experienceId,
      'test-reviewer',
      true,
      '测试用自动批准',
    );

    // 4. 测试定时任务
    logger.info('4. 测试定时任务');
    createTask(TEST_TASK);

    // 验证任务创建
    const createdTask = getTaskById(TEST_TASK.id);
    if (!createdTask) {
      throw new Error('定时任务创建失败');
    }
    logger.info(`   定时任务创建成功：${createdTask.id}`);

    // 5. 测试任务快照
    logger.info('5. 测试任务快照');
    const allTasks = [
      {
        id: TEST_TASK.id,
        groupFolder: TEST_TASK.group_folder,
        prompt: TEST_TASK.prompt,
        schedule_type: TEST_TASK.schedule_type,
        schedule_value: TEST_TASK.schedule_value,
        status: TEST_TASK.status,
        next_run: TEST_TASK.next_run,
      },
    ];
    writeTasksSnapshot(TEST_GROUP.folder, TEST_GROUP.isMain!, allTasks);
    logger.info(`   任务快照创建成功`);

    logger.info('6. 测试容器启动与消息链路');
    const hasDocker = (() => {
      try {
        execSync('docker info', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    })();
    const envFileSecrets = readEnvFile([
      'CLAUDE_CODE_OAUTH_TOKEN',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
    ]);
    const hasApiCredential = Boolean(
      process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN ||
      envFileSecrets.CLAUDE_CODE_OAUTH_TOKEN ||
      envFileSecrets.ANTHROPIC_API_KEY ||
      envFileSecrets.ANTHROPIC_AUTH_TOKEN,
    );
    if (!hasDocker || !hasApiCredential) {
      logger.warn(
        {
          hasDocker,
          hasApiCredential,
        },
        '容器链路测试已跳过，缺少Docker或模型凭证',
      );
    } else {
      let streamedOutputCount = 0;
      const containerInput: ContainerInput = {
        prompt: '请回复: E2E_CONTAINER_OK',
        groupFolder: TEST_GROUP.folder,
        chatJid: 'test:container-e2e',
        isMain: false,
      };
      const containerResult = await runContainerAgent(
        TEST_GROUP,
        containerInput,
        () => undefined,
        async (output) => {
          if (output.status === 'success' && output.result !== null) {
            streamedOutputCount += 1;
          }
        },
      );
      if (containerResult.status !== 'success') {
        throw new Error(
          `容器链路测试失败: ${containerResult.error || 'unknown error'}`,
        );
      }
      if (streamedOutputCount === 0) {
        throw new Error('容器链路测试失败: 未收到流式输出');
      }
      logger.info('   容器启动与消息链路验证成功');
    }

    // 7. 验证记忆和经验
    logger.info('7. 验证记忆和经验');

    // 验证记忆
    const memories = await memoryManager.searchMemories(
      TEST_GROUP.folder,
      '测试记忆',
      5,
    );
    logger.info(`   找到相关记忆：${memories.length}个`);
    if (memories.length === 0) {
      throw new Error('未找到测试记忆');
    }

    // 验证进化库
    const experiences = await evolutionManager.queryExperience('测试');
    logger.info(`   找到相关经验：${experiences.length}个`);
    if (experiences.length === 0) {
      throw new Error('未找到测试经验');
    }

    // 8. 验证定时任务执行
    logger.info('8. 验证定时任务执行');

    // 检查任务是否到期
    const dueTasks = getDueTasks();
    logger.info(`   当前到期任务：${dueTasks.length}个`);

    // 计算下一次执行时间
    const nextRun = computeNextRun(createdTask);
    logger.info(`   下一次执行时间：${nextRun}`);

    // 9. 测试数据清理
    logger.info('9. 测试数据清理');
    deleteTask(TEST_TASK.id);

    // 清理进化经验（需要先删除，避免外键约束）
    const db = TestDatabaseHelper.getDatabase();
    if (db) {
      db.prepare('DELETE FROM evolution_log WHERE source_agent_id = ?').run(
        testAgent.id,
      );
    }

    // 清理测试 agent
    await TestDatabaseHelper.cleanupTestAgent(testAgent.id);

    // 验证任务删除
    const deletedTask = getTaskById(TEST_TASK.id);
    if (deletedTask) {
      throw new Error('定时任务删除失败');
    }
    logger.info('   测试数据清理成功');

    logger.info('=== 测试完成 ===');
  } catch (error) {
    logger.error('=== 测试失败 ===');
    logger.error(error);

    // 尝试清理数据
    try {
      deleteTask(TEST_TASK.id);
      await TestDatabaseHelper.cleanupTestAgent('test-agent');
    } catch (cleanupError) {
      logger.error(`清理测试数据失败: ${(cleanupError as Error).message}`);
    }

    process.exit(1);
  }
}

// 运行测试
testCompleteAgentFlow()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
