#!/usr/bin/env node
import { initDatabase, createTask, getDueTasks, getTaskById, deleteTask, } from '../src/db';
import { runContainerAgent, writeTasksSnapshot, } from '../src/container-runner';
import { computeNextRun } from '../src/task-scheduler';
import { MemoryManager } from '../src/memory-manager';
import { EvolutionManager } from '../src/evolution-manager';
import { logger } from '../src/logger';
// 测试配置
const TEST_GROUP = {
    name: 'Test Group',
    folder: 'test',
    trigger: '@Test',
    added_at: new Date().toISOString(),
    containerConfig: undefined,
    requiresTrigger: true,
    isMain: true,
};
// 测试任务配置
const TEST_TASK = {
    id: 'test-task-1',
    group_folder: TEST_GROUP.folder,
    chat_jid: 'test:123456789',
    prompt: '测试定时任务执行：返回当前时间',
    schedule_type: 'interval',
    schedule_value: '60000', // 1分钟
    context_mode: 'isolated',
    next_run: new Date(Date.now() + 1000).toISOString(), // 1秒后执行
    status: 'active',
    created_at: new Date().toISOString(),
};
// 全局变量
let memoryManager;
let evolutionManager;
async function testCompleteAgentFlow() {
    logger.info('=== 启动NanoClaw完整流程测试 ===');
    try {
        // 1. 初始化数据库
        logger.info('1. 初始化数据库');
        initDatabase();
        // 2. 测试记忆管理
        logger.info('2. 测试记忆管理');
        memoryManager = new MemoryManager();
        await memoryManager.addMemory(TEST_GROUP.folder, '测试记忆内容：NanoClaw架构包含主进程、消息循环、容器调度', 'L2');
        // 3. 测试进化系统
        logger.info('3. 测试进化系统');
        evolutionManager = new EvolutionManager();
        const experienceId = await evolutionManager.submitExperience('agent-flow-test', '测试完整agent流程：初始化→消息→容器→响应→记忆→进化', 'test-agent');
        logger.info(`   经验已提交（ID: ${experienceId}）`);
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
        writeTasksSnapshot(TEST_GROUP.folder, TEST_GROUP.isMain, allTasks);
        logger.info(`   任务快照创建成功`);
        // 6. 直接测试容器运行
        logger.info('6. 直接测试容器运行');
        const containerInput = {
            prompt: '请返回"Hello from NanoClaw!"并记录一个测试记忆',
            sessionId: 'test-session-1',
            groupFolder: TEST_GROUP.folder,
            chatJid: TEST_TASK.chat_jid,
            isMain: TEST_GROUP.isMain,
            assistantName: 'TestAgent',
        };
        const result = await runContainerAgent(TEST_GROUP, containerInput, (proc, containerName) => logger.debug(`   容器启动：${containerName}`), async (output) => {
            if (output.result) {
                logger.info(`   智能体响应：${output.result}`);
            }
            if (output.status === 'error') {
                logger.error(`   容器错误：${output.error}`);
            }
        });
        if (result.status === 'error') {
            throw new Error(`容器执行失败：${result.error}`);
        }
        logger.info(`   容器执行成功：${result.status}`);
        // 7. 验证记忆和经验
        logger.info('7. 验证记忆和经验');
        // 验证记忆
        const memories = await memoryManager.searchMemories(TEST_GROUP.folder, '测试记忆', 5);
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
        // 验证任务删除
        const deletedTask = getTaskById(TEST_TASK.id);
        if (deletedTask) {
            throw new Error('定时任务删除失败');
        }
        logger.info('   测试数据清理成功');
        logger.info('=== 测试完成 ===');
    }
    catch (error) {
        logger.error('=== 测试失败 ===');
        logger.error(error);
        // 尝试清理数据
        try {
            deleteTask(TEST_TASK.id);
        }
        catch (cleanupError) {
            logger.error('清理测试数据失败:', cleanupError);
        }
        process.exit(1);
    }
}
// 运行测试
testCompleteAgentFlow().then(() => process.exit(0)).catch(() => process.exit(1));
//# sourceMappingURL=e2e-agent-flow.js.map