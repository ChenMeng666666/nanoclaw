import { getDatabase } from '../src/db-agents.js';
import { logger } from '../src/logger.js';

/**
 * 测试数据生成器
 */
export class TestDataFactory {
  static createTestAgent(folder: string, id: string = 'test-agent') {
    const now = new Date().toISOString();
    return {
      id,
      name: 'Test Agent',
      folder,
      userName: 'Test',
      personality: '测试性格',
      values: '测试价值观',
      appearance: '测试外观',
      isActive: true,
      credentials: {
        anthropicToken: '',
        anthropicUrl: '',
        anthropicModel: 'claude-sonnet-4-6',
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  static createTestGroup(folder: string = 'test') {
    return {
      name: 'Test Group',
      folder,
      trigger: '@Test',
      added_at: new Date().toISOString(),
      containerConfig: undefined,
      requiresTrigger: true,
      isMain: true,
    };
  }

  static createTestTask(groupFolder: string, id: string = 'test-task-1') {
    return {
      id,
      group_folder: groupFolder,
      chat_jid: 'test:123456789',
      prompt: '测试定时任务执行：返回当前时间',
      schedule_type: 'interval' as const,
      schedule_value: '60000',
      context_mode: 'isolated' as const,
      next_run: new Date(Date.now() + 1000).toISOString(),
      status: 'active' as const,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * 数据库操作辅助类
 */
export class TestDatabaseHelper {
  static getDatabase() {
    return getDatabase();
  }

  static async setupTestAgent(agentData: any) {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT OR REPLACE INTO agents (id, name, folder, user_name, personality, "values", appearance, anthropic_token_encrypted, anthropic_url, anthropic_model, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      agentData.id,
      agentData.name,
      agentData.folder,
      agentData.userName,
      agentData.personality,
      agentData.values,
      agentData.appearance,
      agentData.credentials.anthropicToken,
      agentData.credentials.anthropicUrl,
      agentData.credentials.anthropicModel,
      agentData.isActive ? 1 : 0,
      agentData.createdAt || now,
      agentData.updatedAt || now,
    );
  }

  static async cleanupTestAgent(agentId: string) {
    const db = getDatabase();
    // 先删除与 agent 相关的所有数据，避免外键约束错误
    db.prepare('DELETE FROM evolution_log WHERE source_agent_id = ?').run(agentId);
    db.prepare('DELETE FROM memories WHERE agent_folder IN (SELECT folder FROM agents WHERE id = ?)').run(agentId);
    db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
  }
}

/**
 * 测试断言工具
 */
export class TestAssertions {
  static assertTaskExists(taskId: string) {
    const db = getDatabase();
    const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }
    return task;
  }

  static assertMemoryExists(groupFolder: string, content: string) {
    const db = getDatabase();
    const memory = db.prepare('SELECT * FROM memories WHERE agent_folder = ? AND content LIKE ?').get(groupFolder, `%${content}%`);
    if (!memory) {
      throw new Error(`记忆不存在: ${content}`);
    }
    return memory;
  }
}
