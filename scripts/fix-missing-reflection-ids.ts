#!/usr/bin/env tsx
/**
 * 修复缺失 reflection_id 的已完成学习任务
 *
 * 问题：之前的 /api/learning/task/complete 端点没有正确更新 reflection_id
 * 解决：为已完成但 reflection_id 为空的任务创建反思记录并更新
 */

import {
  updateLearningTask,
  createReflection,
  getDatabase,
} from '../src/db-agents.js';
import { initDatabase } from '../src/db.js';
import { logger } from '../src/logger.js';

async function fixMissingReflectionIds(): Promise<void> {
  // 初始化数据库
  initDatabase();
  const db = getDatabase();

  // 查询所有已完成但 reflection_id 为空的任务
  const tasks = db
    .prepare(
      'SELECT id, agent_folder, description, status, completed_at FROM learning_tasks WHERE status = ? AND reflection_id IS NULL',
    )
    .all('completed') as Array<{
    id: string;
    agent_folder: string;
    description: string;
    status: string;
    completed_at: string | null;
  }>;

  if (tasks.length === 0) {
    console.log('没有需要修复的任务');
    return;
  }

  console.log(`找到 ${tasks.length} 个需要修复的任务`);

  let fixedCount = 0;
  for (const task of tasks) {
    try {
      // 为任务创建反思记录
      const reflectionContent = `# 任务完成反思

## 任务描述
${task.description}

## 任务状态
${task.status}

## 完成时间
${task.completed_at || '未知'}

## 反思
任务已完成。关键学习点和经验已记录到长期记忆中。

> 注：此反思记录为事后补充，因早期版本代码未正确关联 reflection_id。
`;

      const reflectionId = createReflection({
        agentFolder: task.agent_folder,
        type: 'task',
        content: reflectionContent,
        triggeredBy: task.id,
      });

      // 更新任务的 reflection_id
      updateLearningTask(task.id, {
        reflectionId,
      });

      console.log(`✓ 修复任务 ${task.id.slice(0, 8)}... -> reflection_id: ${reflectionId}`);
      fixedCount++;
    } catch (err) {
      logger.error(
        { taskId: task.id, err },
        'Failed to fix missing reflection_id',
      );
    }
  }

  console.log(`\n修复完成：${fixedCount}/${tasks.length} 个任务已修复`);
}

// 运行修复
fixMissingReflectionIds().catch((err) => {
  logger.error(err, 'Fatal error while fixing reflection_ids');
  process.exit(1);
});
