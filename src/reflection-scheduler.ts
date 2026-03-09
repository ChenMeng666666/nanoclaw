/**
 * 反思和总结调度器
 * 实现定时反思：hourly/daily/weekly/monthly/task
 * 与记忆和进化机制联动
 */
import crypto from 'crypto';
import cron from 'node-cron';

import {
  createReflection,
  getLearningTask,
  updateLearningTask,
  createLearningTask,
  getDatabase,
} from './db-agents.js';
import { getAllActiveAgents } from './db-agents.js';
import { AgentConfig, LearningTask } from './types.js';
import { logger } from './logger.js';
import { memoryManager } from './memory-manager.js';

/**
 * 反思调度器类
 */
export class ReflectionScheduler {
  private running = false;

  /**
   * 启动调度器
   */
  start(): void {
    if (this.running) {
      logger.warn('Reflection scheduler already running');
      return;
    }

    this.running = true;
    logger.info('Reflection scheduler started');

    // 每小时反思
    cron.schedule('0 * * * *', () => {
      this.triggerReflectionsForAllAgents('hourly');
    });

    // 每天 23:00 反思
    cron.schedule('0 23 * * *', () => {
      this.triggerReflectionsForAllAgents('daily');
    });

    // 每周日 23:00 反思

    // 每周日 20:00 检查学习进度并触发反思
    cron.schedule('0 20 * * 0', async () => {
      await this.checkLearningProgressForAllAgents();
    });
    cron.schedule('0 23 * * 0', () => {
      this.triggerReflectionsForAllAgents('weekly');
    });

    // 每月末 23:00 反思（使用 28-31 日覆盖所有月份）
    cron.schedule('0 23 28-31 * *', () => {
      // 检查是否是当月最后一天
      const today = new Date();
      const lastDay = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
      ).getDate();
      if (today.getDate() === lastDay) {
        this.triggerReflectionsForAllAgents('monthly');
      }
    });
  }

  /**
   * 停止调度器
   */
  stop(): void {
    this.running = false;
    logger.info('Reflection scheduler stopped');
  }

  /**
   * 触发单个智能体的反思
   */
  async triggerReflection(
    agent: AgentConfig,
    type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'task',
    triggeredBy?: string,
  ): Promise<void> {
    logger.info(
      { agent: agent.name, type, triggeredBy },
      'Triggering reflection',
    );

    // 创建反思记录
    const content = await this.generateReflectionContent(agent, type);
    const reflectionId = createReflection({
      agentFolder: agent.folder,
      type,
      content,
      triggeredBy,
    });

    // 将反思内容添加到长期记忆
    await memoryManager.addMemory(agent.folder, content, 'L3', undefined);

    logger.info(
      { agent: agent.name, type, reflectionId },
      'Reflection created',
    );
  }

  /**
   * 完成任务并触发反思
   */
  async completeLearningTask(taskId: string): Promise<void> {
    const task = getLearningTask(taskId);
    if (!task) {
      logger.warn({ taskId }, 'Learning task not found');
      return;
    }

    // 创建任务完成后的反思
    const reflectionContent = await this.generateTaskReflection(task);
    const reflectionId = createReflection({
      agentFolder: task.agentFolder,
      type: 'task',
      content: reflectionContent,
      triggeredBy: taskId,
    });

    // 更新任务状态
    updateLearningTask(taskId, {
      status: 'completed',
      reflectionId,
      completedAt: new Date().toISOString(),
    });

    // 将反思添加到记忆
    await memoryManager.addMemory(task.agentFolder, reflectionContent, 'L3');

    // 检查是否需要提交到进化系统
    const evolutionWorthy = await this.evaluateForEvolution(
      task,
      reflectionContent,
    );
    if (evolutionWorthy) {
      logger.info(
        { taskId, taskName: task.description },
        'Task experience worthy of evolution, TODO: submit to evolution system',
      );
      // TODO: 调用进化系统 API
    }

    logger.info(
      { taskId, reflectionId },
      'Learning task completed and reflection created',
    );
  }

  /**
   * 创建学习任务
   */
  async createLearningTask(
    agentFolder: string,
    description: string,
    resources?: string[],
  ): Promise<string> {
    const taskId = crypto.randomUUID();
    createLearningTask({
      id: taskId,
      agentFolder,
      description,
      status: 'pending',
      resources,
      createdAt: new Date().toISOString(),
    });

    logger.info({ taskId, agentFolder, description }, 'Learning task created');

    return taskId;
  }

  // ===== 私有方法 =====

  private triggerReflectionsForAllAgents(
    type: 'hourly' | 'daily' | 'weekly' | 'monthly',
  ): void {
    const agents = getAllActiveAgents();
    for (const agent of agents) {
      this.triggerReflection(agent, type).catch((err) => {
        logger.error(
          { agent: agent.name, type, err },
          'Failed to trigger reflection',
        );
      });
    }
  }

  private async generateReflectionContent(
    agent: AgentConfig,
    type: string,
  ): Promise<string> {
    const now = new Date();
    const timeLabels: Record<string, string> = {
      hourly: '过去 1 小时',
      daily: '过去 24 小时',
      weekly: '过去 7 天',
      monthly: '过去 30 天',
    };

    const timeLabel = timeLabels[type] || type;

    // 获取相关记忆
    const memories = await memoryManager.searchMemories(
      agent.folder,
      `recent ${type} activities`,
      20,
    );

    return `# ${type.charAt(0).toUpperCase() + type.slice(1)} Reflection - ${agent.name}

## 时间范围
${timeLabel} (${now.toISOString()})

## 关键记忆
${memories.map((m) => `- ${m.content.slice(0, 200)}`).join('\n')}

## 反思总结
${this.generateReflectionInsights(agent, type, memories)}

## 改进方向
${this.generateImprovementSuggestions(agent, type)}
`;
  }

  private generateReflectionInsights(
    agent: AgentConfig,
    type: string,
    memories: any[],
  ): string {
    // 基于记忆内容生成反思洞察
    if (memories.length === 0) {
      return '暂无足够的记忆数据进行深度反思。';
    }

    const insights: string[] = [];

    // 分析记忆模式
    const userInteractions = memories.filter((m) => m.userJid).length;
    const taskCompletions = memories.filter(
      (m) => m.content.includes('completed') || m.content.includes('finished'),
    ).length;

    if (userInteractions > 0) {
      insights.push(`- 与 ${userInteractions} 位用户进行了互动`);
    }
    if (taskCompletions > 0) {
      insights.push(`- 完成了 ${taskCompletions} 项任务`);
    }

    return insights.join('\n') || '- 暂无特别洞察';
  }

  private generateImprovementSuggestions(
    agent: AgentConfig,
    type: string,
  ): string {
    // 生成改进建议
    const suggestions: string[] = [];

    if (type === 'daily') {
      suggestions.push('- 回顾今天最有价值的学习或发现');
      suggestions.push('- 思考如何优化响应速度和准确性');
    } else if (type === 'weekly') {
      suggestions.push('- 总结本周完成的主要成就');
      suggestions.push('- 识别需要改进的工作流程');
    } else if (type === 'monthly') {
      suggestions.push('- 回顾本月的成长和进步');
      suggestions.push('- 设定下月的发展目标');
    }

    return suggestions.join('\n') || '- 持续改进，保持学习';
  }

  private async generateTaskReflection(task: LearningTask): Promise<string> {
    return `# 任务完成反思

## 任务描述
${task.description}

## 任务状态
${task.status}

## 学习资源
${task.resources?.map((r) => `- ${r}`).join('\n') || '无'}

## 反思
任务已完成。关键学习点和经验已记录到长期记忆中。
`;
  }

  private async evaluateForEvolution(
    task: LearningTask,
    reflectionContent: string,
  ): Promise<boolean> {
    // 评估标准：
    // 1. 任务完成且产生有价值的反思
    // 2. 内容长度足够（> 100 字符）
    // 3. 包含可复用的经验或模式

    if (task.status !== 'completed') return false;
    if (reflectionContent.length < 100) return false;

    // 检查是否包含经验模式关键词
    const experienceKeywords = [
      '经验',
      '方法',
      '技巧',
      '模式',
      '最佳实践',
      'learned',
      'discovered',
      'found',
      'technique',
      'pattern',
    ];

    const lowerContent = reflectionContent.toLowerCase();
    return experienceKeywords.some((kw) =>
      lowerContent.includes(kw.toLowerCase()),
    );
  }

  /**
   * 检查所有智能体的学习进度并触发反思
   */
  private async checkLearningProgressForAllAgents(): Promise<void> {
    const agents = getAllActiveAgents();

    for (const agent of agents) {
      await this.checkLearningProgress(agent);
    }
  }

  /**
   * 检查单个智能体的学习进度
   */
  private async checkLearningProgress(agent: AgentConfig): Promise<void> {
    // 获取该智能体所有正在进行中的学习任务
    const db = getDatabase();
    const tasks = db
      .prepare(
        'SELECT * FROM learning_tasks WHERE agent_folder = ? AND status = ?',
      )
      .all(agent.folder, 'in_progress') as Array<{
      id: string;
      agent_folder: string;
      description: string;
      status: string;
      created_at: string;
    }>;

    if (tasks.length === 0) {
      // 没有进行中的任务，检查是否有待处理的任务
      const pendingTasks = db
        .prepare(
          'SELECT * FROM learning_tasks WHERE agent_folder = ? AND status = ?',
        )
        .all(agent.folder, 'pending') as Array<{ id: string }>;

      if (pendingTasks.length > 0) {
        logger.info(
          { agent: agent.name, pendingCount: pendingTasks.length },
          'Agent has pending learning tasks',
        );
        // 可以添加逻辑：如果有待处理任务，生成提醒
        await memoryManager.addMemory(
          agent.folder,
          `你有${pendingTasks.length}个待处理的学习任务，建议开始执行。`,
          'L2',
          undefined,
        );
      }
      return;
    }

    // 有进行中的任务，生成进度反思
    logger.info(
      { agent: agent.name, taskCount: tasks.length },
      'Checking learning progress',
    );

    const progressContent = `# 学习进度检查

## 检查时间
${new Date().toISOString()}

## 进行中的学习任务
${tasks
  .map(
    (t, i) => `
### 任务 ${i + 1}
- **描述**: ${t.description}
- **开始时间**: ${t.created_at}
- **状态**: 进行中
`,
  )
  .join('\n')}

## 建议
请检查以上学习任务的进度，如有需要可以：
1. 继续执行当前任务
2. 完成任务并记录反思
3. 调整学习计划

---
*此反思由系统自动生成，每周日检查一次*
`;

    // 创建反思记录
    const reflectionId = createReflection({
      agentFolder: agent.folder,
      type: 'weekly',
      content: progressContent,
      triggeredBy: 'learning_progress_check',
    });

    // 添加到短期记忆
    await memoryManager.addMemory(
      agent.folder,
      progressContent,
      'L2',
      undefined,
    );

    logger.info(
      { agent: agent.name, reflectionId },
      'Learning progress reflection created',
    );
  }
}

// 单例导出
export const reflectionScheduler = new ReflectionScheduler();
