import { getDatabase } from '../src/db-agents.js';
import { logger } from '../src/logger.js';
import crypto from 'crypto';

/**
 * 测试数据生成器 (GEP 1.5.0 标准)
 */
export class TestDataFactory {
  // 生成 GEP 标准的 asset_id
  static generateGEPAssetId(content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `sha256:${hash}`;
  }

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

  static createTestLearningTask(agentFolder: string, id: string = 'test-learning-task-1') {
    return {
      id,
      agent_folder: agentFolder,
      description: '测试学习任务：学习NanoClaw架构',
      status: 'pending' as const,
      reflection_id: null,
      resources: JSON.stringify({ source: 'test', difficulty: 'beginner' }),
      created_at: new Date().toISOString(),
      completed_at: null,
    };
  }

  /**
   * 创建符合 GEP 1.5.0 标准的测试进化经验
   */
  static createTestEvolutionExperience(agentId: string) {
    const content = `
在执行任务时，应该遵循以下步骤：

1. **搜索记忆**：首先从L1工作记忆、L2短期记忆和L3长期记忆中检索相关信息。使用语义搜索来找到最相关的内容，关键词包括"任务执行"、"步骤"、"方法"等。

2. **搜索进化库**：从共享经验库中查找已验证的最佳实践和方法。特别关注与当前任务类型相匹配的、审核通过的经验条目。

3. **外部学习**：如果内部知识不足，利用外部服务进行学习。这可能包括访问文档、教程、或者使用搜索工具获取最新信息。

4. **执行任务**：结合搜索到的信息，制定执行计划并按步骤完成任务。确保每一步都记录详细的过程和结果。

5. **经验总结**：任务完成后，将成功的方法、遇到的问题和解决方案整理成经验，提交到进化库进行审核。

这个流程确保了每次任务执行都能充分利用已有知识，同时不断积累和改进经验库。
    `.trim();

    const assetId = this.generateGEPAssetId(content);

    return {
      source_agent_id: agentId,
      ability_name: '测试任务执行',
      content,
      description: '测试任务的完整执行流程，包含详细的步骤说明和最佳实践',
      tags: ['测试', '任务执行', '流程', '最佳实践', '学习'],
      category: 'optimize' as const,
      status: 'pending' as const,
      reviewed_by: null,
      reviewed_at: null,
      feedback: JSON.stringify([]),
      created_at: new Date().toISOString(),
      // GEP 1.5.0 新增字段
      schema_version: '1.5.0',
      asset_id: assetId,
      signals_match: ['task_execution', 'optimization', 'learning'],
      summary: '测试任务的完整执行流程',
      preconditions: JSON.stringify(['需要基本的Node.js环境']),
      validation_commands: JSON.stringify(['npm run test:task-execution']),
      ecosystem_status: 'stale' as const,
    };
  }

  /**
   * 创建 GEP 1.5.0 标准的测试 Gene（完整结构）
   */
  static createGEPTestGene(agentId: string) {
    const content = `
## 性能优化最佳实践

### 优化方法
1. 使用连接池管理数据库连接
2. 实现缓存机制减少重复计算
3. 使用批量操作减少IO次数
4. 优化算法复杂度

### 验证命令
\`\`\`bash
npm run test:performance
node benchmarks/connection-pool.js
\`\`\`
    `.trim();

    const assetId = this.generateGEPAssetId(content);

    return {
      abilityName: '数据库连接池优化',
      category: 'optimize' as const,
      signalsMatch: ['performance', 'database', 'connection'],
      summary: '使用连接池优化数据库访问性能',
      preconditions: ['使用SQLite数据库', '有频繁的数据库访问'],
      validationCommands: ['npm run test:database', 'node tests/connection-pool.test.js'],
      sourceAgentId: agentId,
      content,
      description: '优化数据库连接管理的最佳实践',
      tags: ['性能优化', '数据库', '连接池'],
    };
  }

  /**
   * 创建 GEP 1.5.0 标准的测试 Capsule
   */
  static createGEPTestCapsule(geneId: number) {
    const capsuleContent = JSON.stringify({
      geneId,
      trigger: ['performance', 'database'],
      outcome: { status: 'success', score: 0.9 }
    });
    const assetId = this.generateGEPAssetId(capsuleContent);

    return {
      id: assetId,
      geneId,
      trigger: ['performance', 'database'],
      summary: '数据库连接池优化验证成功',
      confidence: 0.92,
      blastRadius: { files: 3, lines: 150 },
      outcome: { status: 'success' as const, score: 0.9 },
      envFingerprint: {
        platform: process.platform,
        arch: process.arch,
        runtime: `Node.js ${process.version}`,
      },
      successStreak: 5,
      approvedAt: new Date().toISOString(),
    };
  }

  /**
   * 创建 GEP 1.5.0 标准的测试 GDI 评分
   */
  static createGEPTestGDIScore() {
    return {
      intrinsicQuality: 8.5,
      usageMetrics: 7.2,
      socialSignals: 6.8,
      freshness: 9.0,
      total: 7.8,
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
    db.prepare('DELETE FROM learning_tasks WHERE agent_folder IN (SELECT folder FROM agents WHERE id = ?)').run(agentId);
    db.prepare('DELETE FROM reflections WHERE agent_folder IN (SELECT folder FROM agents WHERE id = ?)').run(agentId);
    db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
  }

  static async setupTestLearningTask(taskData: any) {
    const db = getDatabase();
    db.prepare(
      `
      INSERT OR REPLACE INTO learning_tasks (id, agent_folder, description, status, reflection_id, resources, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      taskData.id,
      taskData.agent_folder,
      taskData.description,
      taskData.status,
      taskData.reflection_id,
      taskData.resources,
      taskData.created_at,
      taskData.completed_at,
    );
  }

  static async setupTestEvolutionExperience(experienceData: any) {
    const db = getDatabase();
    db.prepare(
      `
      INSERT INTO evolution_log (source_agent_id, ability_name, content, description, tags, category, status, reviewed_by, reviewed_at, feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', null, null, ?, ?)
    `,
    ).run(
      experienceData.source_agent_id,
      experienceData.ability_name,
      experienceData.content,
      experienceData.description,
      JSON.stringify(experienceData.tags),
      experienceData.category,
      experienceData.feedback || JSON.stringify([]),
      experienceData.created_at,
    );
  }

  static getLearningTaskById(id: string) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM learning_tasks WHERE id = ?').get(id);
  }

  static getEvolutionExperienceById(id: string) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM evolution_log WHERE id = ?').get(id);
  }

  static getMemoryByContent(groupFolder: string, content: string) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM memories WHERE agent_folder = ? AND content LIKE ?').get(groupFolder, `%${content}%`);
  }

  static getAgentByFolder(folder: string) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM agents WHERE folder = ?').get(folder);
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

  static assertAgentExists(folder: string) {
    const db = getDatabase();
    const agent = db.prepare('SELECT * FROM agents WHERE folder = ?').get(folder);
    if (!agent) {
      throw new Error(`Agent不存在: ${folder}`);
    }
    return agent;
  }

  static assertLearningTaskExists(taskId: string) {
    const db = getDatabase();
    const task = db.prepare('SELECT * FROM learning_tasks WHERE id = ?').get(taskId);
    if (!task) {
      throw new Error(`学习任务不存在: ${taskId}`);
    }
    return task;
  }

  static assertEvolutionExperienceExists(agentId: string, abilityName: string) {
    const db = getDatabase();
    const experience = db.prepare('SELECT * FROM evolution_log WHERE source_agent_id = ? AND ability_name = ?').get(agentId, abilityName);
    if (!experience) {
      throw new Error(`进化经验不存在: ${agentId} - ${abilityName}`);
    }
    return experience;
  }

  static assertMemoryLevel(groupFolder: string, expectedLevel: 'L1' | 'L2' | 'L3') {
    const db = getDatabase();
    const memories = db.prepare('SELECT * FROM memories WHERE agent_folder = ?').all(groupFolder);
    if (memories.length === 0) {
      throw new Error(`未找到 ${groupFolder} 的记忆`);
    }
    const hasExpectedLevel = memories.some(memory => memory.level === expectedLevel);
    if (!hasExpectedLevel) {
      throw new Error(`没有找到${expectedLevel}级别的记忆`);
    }
  }
}
