#!/usr/bin/env node
/**
 * 最小化的测试脚本，用于快速验证系统是否正常工作
 * 主要用于开发和调试阶段的快速验证
 */
import { initDatabase, createTask, getTaskById, deleteTask, } from '../src/db';
import { MemoryManager } from '../src/memory-manager';
import { EvolutionManager } from '../src/evolution-manager';
import { logger } from '../src/logger';
// 最小化测试配置
const MINIMAL_GROUP_FOLDER = 'minimal-test';
async function runMinimalTest() {
    logger.info('=== 运行最小化测试 ===');
    try {
        // 初始化数据库
        logger.debug('初始化数据库');
        initDatabase();
        // 初始化管理器
        const memoryManager = new MemoryManager();
        const evolutionManager = new EvolutionManager();
        // 测试1：简单记忆操作
        logger.debug('1. 测试记忆管理');
        await memoryManager.addMemory(MINIMAL_GROUP_FOLDER, '测试记忆：NanoClaw系统正常工作', 'L2');
        // 测试2：简单进化操作
        logger.debug('2. 测试进化系统');
        const experienceId = await evolutionManager.submitExperience('minimal-test', '测试NanoClaw系统的基础功能', 'minimal-test-agent');
        // 测试3：简单任务操作
        logger.debug('3. 测试定时任务');
        const task = {
            id: 'minimal-test-task',
            group_folder: MINIMAL_GROUP_FOLDER,
            chat_jid: 'minimal:123456',
            prompt: '测试简单任务',
            schedule_type: 'once',
            schedule_value: '',
            context_mode: 'isolated',
            next_run: new Date(Date.now() + 60000).toISOString(), // 1分钟后执行
            status: 'active',
            created_at: new Date().toISOString(),
        };
        createTask(task);
        // 验证任务创建
        const createdTask = getTaskById(task.id);
        if (!createdTask) {
            throw new Error('任务创建失败');
        }
        // 验证任务属性
        if (createdTask.prompt !== task.prompt) {
            throw new Error('任务属性验证失败');
        }
        // 验证记忆和经验是否存储
        logger.debug('4. 验证存储');
        const memories = await memoryManager.searchMemories(MINIMAL_GROUP_FOLDER, '测试', 5);
        if (memories.length === 0) {
            throw new Error('记忆存储失败');
        }
        const experiences = await evolutionManager.queryExperience('测试');
        if (experiences.length === 0) {
            throw new Error('经验存储失败');
        }
        // 清理测试数据
        logger.debug('5. 清理测试数据');
        deleteTask(task.id);
        logger.info('=== 测试成功 ===');
        logger.info(`测试信息：`);
        logger.info(`- 记忆数量：${memories.length}`);
        logger.info(`- 经验数量：${experiences.length}`);
        logger.info(`- 经验ID：${experienceId}`);
        logger.info(`- 任务ID：${task.id}`);
    }
    catch (error) {
        logger.error('=== 测试失败 ===');
        logger.error(error);
        // 尝试清理部分数据
        try {
            deleteTask('minimal-test-task');
        }
        catch (cleanupError) {
            logger.error('清理任务失败：', cleanupError);
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
//# sourceMappingURL=minimal-test.js.map