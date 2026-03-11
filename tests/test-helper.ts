import { getDatabase } from '../src/db-agents.js';
import { logger } from '../src/logger.js';

/**
 * 清理测试数据的辅助函数
 */
export function clearTestData(groupFolder: string = 'test'): void {
  logger.info(`开始清理测试数据，groupFolder: ${groupFolder}`);
  const db = getDatabase();

  try {
    // 清理任务运行日志
    db.prepare(
      `DELETE FROM task_run_logs WHERE task_id LIKE ?`
    ).run('%test%');

    // 清理定时任务
    db.prepare(
      `DELETE FROM scheduled_tasks WHERE id LIKE ? OR group_folder = ?`
    ).run('%test%', groupFolder);

    // 清理记忆
    db.prepare(
      `DELETE FROM memories WHERE agent_folder = ? OR id LIKE ?`
    ).run(groupFolder, '%test%');

    // 清理进化库条目
    db.prepare(
      `DELETE FROM evolution_log WHERE source_agent_id LIKE ? OR ability_name LIKE ?`
    ).run('%test%', '%test%');

    // 清理审计日志
    db.prepare(
      `DELETE FROM audit_log WHERE agent_folder = ? OR entity_id LIKE ?`
    ).run(groupFolder, '%test%');

    // 清理学习任务
    db.prepare(
      `DELETE FROM learning_tasks WHERE agent_folder = ? OR id LIKE ?`
    ).run(groupFolder, '%test%');

    // 清理反思
    db.prepare(
      `DELETE FROM reflections WHERE agent_folder = ?`
    ).run(groupFolder);

    // 清理用户画像
    db.prepare(
      `DELETE FROM user_profiles WHERE user_jid LIKE ?`
    ).run('%test%');

    // 清理通道实例
    db.prepare(
      `DELETE FROM channel_instances WHERE jid LIKE ? OR name LIKE ?`
    ).run('%test%', '%test%');

    // 清理智能体配置
    db.prepare(
      `DELETE FROM agents WHERE folder = ? OR name LIKE ?`
    ).run(groupFolder, '%test%');

    // 清理会话
    db.prepare(
      `DELETE FROM sessions WHERE group_folder = ?`
    ).run(groupFolder);

    // 清理已注册群组（测试用）
    db.prepare(
      `DELETE FROM registered_groups WHERE folder = ? OR name LIKE ?`
    ).run(groupFolder, '%test%');

    logger.info('测试数据清理完成');
  } catch (error) {
    logger.error(`清理测试数据失败: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * 获取数据库状态的辅助函数
 */
export function getDatabaseStats(): Record<string, number> {
  const db = getDatabase();
  const stats: Record<string, number> = {};

  const tables = [
    'scheduled_tasks',
    'task_run_logs',
    'memories',
    'evolution_log',
    'audit_log',
    'learning_tasks',
    'reflections',
    'agents',
  ];

  for (const table of tables) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      stats[table] = result.count;
    } catch {
      stats[table] = -1;
    }
  }

  return stats;
}

/**
 * 打印数据库统计
 */
export function printDatabaseStats(label: string): void {
  const stats = getDatabaseStats();
  logger.info(`=== 数据库统计 (${label}) ===`);
  for (const [table, count] of Object.entries(stats)) {
    logger.info(`  ${table}: ${count}`);
  }
}
