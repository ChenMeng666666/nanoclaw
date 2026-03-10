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
  getMemories,
  updateMemory,
} from './db-agents.js';
import { getAllActiveAgents } from './db-agents.js';
import { AgentConfig, LearningTask, DetailedReflection } from './types.js';
import { logger } from './logger.js';
import { memoryManager } from './memory-manager.js';
import { evolutionManager } from './evolution-manager.js';

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

    // 每天 23:00 执行记忆固化（在反思之后）
    cron.schedule('30 23 * * *', async () => {
      logger.info('Starting scheduled memory consolidation');
      await this.consolidateMemoriesForAllAgents();
      logger.info('Scheduled memory consolidation completed');
    });

    // 每天 0:00 执行进化库自动审核
    cron.schedule('0 0 * * *', async () => {
      logger.info('Starting scheduled evolution library auto-review');
      await evolutionManager.autoReviewPendingEntries();
      logger.info('Scheduled evolution library auto-review completed');
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
        'Task experience worthy of evolution, submitting to evolution system',
      );
      // 调用进化系统 API 提交经验
      const abilityName = `学习：${task.description.slice(0, 50)}`;
      const id = await evolutionManager.submitExperience(
        abilityName,
        reflectionContent,
        task.agentFolder,
        `任务完成反思：${task.description}`,
        ['learning', 'task-reflection'],
      );
      logger.info(
        { taskId, evolutionId: id },
        'Task experience submitted to evolution library',
      );
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

    // 分析记忆以提取知识、困难、解决方案等
    const analysis = this.analyzeMemoriesForReflection(memories);

    return `# ${type.charAt(0).toUpperCase() + type.slice(1)} Reflection - ${agent.name}

## 时间范围
${timeLabel} (${now.toISOString()})

## 关键记忆
${memories.map((m) => `- ${m.content.slice(0, 200)}`).join('\n')}

## 知识获取
${analysis.knowledgeGained && analysis.knowledgeGained.length > 0 ? analysis.knowledgeGained.map((kg) => `- ${kg}`).join('\n') : '- 无明显新知识获取'}

## 遇到的困难
${analysis.difficulties && analysis.difficulties.length > 0 ? analysis.difficulties.map((d) => `- ${d}`).join('\n') : '- 无明显困难'}

## 解决方案
${analysis.solutions && analysis.solutions.length > 0 ? analysis.solutions.map((s) => `- ${s}`).join('\n') : '- 无特别解决方案'}

## 关键洞见
${analysis.keyInsights && analysis.keyInsights.length > 0 ? analysis.keyInsights.map((ki) => `- ${ki}`).join('\n') : '- 无关键洞见'}

## 改进建议
${analysis.suggestions && analysis.suggestions.length > 0 ? analysis.suggestions.map((s) => `- ${s}`).join('\n') : '- 持续改进，保持学习'}

## 下一步计划
${analysis.nextSteps && analysis.nextSteps.length > 0 ? analysis.nextSteps.map((ns) => `- ${ns}`).join('\n') : '- 继续当前学习或工作'}

## 学习评分
${analysis.rating || '3'} / 5

## 整体总结
${this.generateReflectionInsights(agent, type, memories)}
`;
  }

  private analyzeMemoriesForReflection(
    memories: any[],
  ): Omit<
    DetailedReflection,
    'id' | 'agentFolder' | 'type' | 'content' | 'createdAt'
  > {
    const knowledgeGained: string[] = [];
    const difficulties: string[] = [];
    const solutions: string[] = [];
    const suggestions: string[] = [];
    const keyInsights: string[] = [];
    const nextSteps: string[] = [];
    let rating: 1 | 2 | 3 | 4 | 5 = 3;

    // 简单的关键词分析
    memories.forEach((memory) => {
      const content = memory.content.toLowerCase();

      if (
        content.includes('学会') ||
        content.includes('掌握') ||
        content.includes('学习')
      ) {
        knowledgeGained.push(memory.content);
      }

      if (
        content.includes('困难') ||
        content.includes('问题') ||
        content.includes('挑战')
      ) {
        difficulties.push(memory.content);
      }

      if (
        content.includes('解决') ||
        content.includes('方法') ||
        content.includes('方案')
      ) {
        solutions.push(memory.content);
      }

      if (
        content.includes('建议') ||
        content.includes('优化') ||
        content.includes('改进')
      ) {
        suggestions.push(memory.content);
      }

      if (
        content.includes('发现') ||
        content.includes('洞察') ||
        content.includes('理解')
      ) {
        keyInsights.push(memory.content);
      }

      if (
        content.includes('下一步') ||
        content.includes('计划') ||
        content.includes('目标')
      ) {
        nextSteps.push(memory.content);
      }
    });

    // 简单的评分逻辑
    if (knowledgeGained.length > 3) rating = 5;
    else if (knowledgeGained.length > 1) rating = 4;
    else if (difficulties.length > 2) rating = 2;
    else if (difficulties.length > 0) rating = 3;

    return {
      knowledgeGained,
      difficulties,
      solutions,
      suggestions,
      keyInsights,
      nextSteps,
      rating,
    };
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
    const analysis = {
      knowledgeGained: ['任务相关的知识要点'],
      difficulties: ['任务执行过程中遇到的困难'],
      solutions: ['解决困难的方法'],
      suggestions: ['改进建议'],
      keyInsights: ['任务中的关键洞察'],
      nextSteps: ['下一步学习计划'],
      rating: 4,
    };

    return `# 任务完成反思

## 任务描述
${task.description}

## 任务状态
${task.status}

## 学习资源
${task.resources?.map((r) => `- ${r}`).join('\n') || '无'}

## 知识获取
${analysis.knowledgeGained.map((kg) => `- ${kg}`).join('\n')}

## 遇到的困难
${analysis.difficulties.map((d) => `- ${d}`).join('\n')}

## 解决方案
${analysis.solutions.map((s) => `- ${s}`).join('\n')}

## 关键洞见
${analysis.keyInsights.map((ki) => `- ${ki}`).join('\n')}

## 改进建议
${analysis.suggestions.map((s) => `- ${s}`).join('\n')}

## 下一步计划
${analysis.nextSteps.map((ns) => `- ${ns}`).join('\n')}

## 任务评分
${analysis.rating} / 5

## 总结
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
  /**
   * 对所有智能体执行记忆固化
   */
  private async consolidateMemoriesForAllAgents(): Promise<void> {
    const agents = getAllActiveAgents();
    for (const agent of agents) {
      await this.consolidateAgentMemories(agent);
    }
  }

  /**
   * 对单个智能体执行记忆固化
   */
  private async consolidateAgentMemories(agent: AgentConfig): Promise<void> {
    // 获取该 agent 的所有 L2 记忆
    const l2Memories = getMemories(agent.folder, 'L2');

    for (const memory of l2Memories) {
      // 评估记忆价值
      const shouldConsolidate = this.evaluateMemoryForL3(memory);
      if (shouldConsolidate) {
        // 迁移到 L3
        updateMemory(memory.id, {
          level: 'L3',
          importance: Math.min(memory.importance + 0.1, 1.0),
        });
        logger.info(
          { memoryId: memory.id, agent: agent.name },
          'Memory consolidated to L3',
        );
      }
    }
  }

  /**
   * 评估记忆是否应该迁移到 L3
   */
  private evaluateMemoryForL3(memory: any): boolean {
    // 评估标准：
    // 1. 重要性 > 0.7
    // 2. 访问次数 > 2
    // 3. 内容长度 > 100
    // 4. 包含知识/经验关键词
    if (
      memory.importance > 0.7 &&
      memory.accessCount > 2 &&
      memory.content.length > 100
    ) {
      const knowledgeKeywords = [
        '学会',
        '掌握',
        '发现',
        '经验',
        '方法',
        '技巧',
        '最佳实践',
      ];
      const lowerContent = memory.content.toLowerCase();
      return knowledgeKeywords.some((kw) => lowerContent.includes(kw));
    }
    return false;
  }

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
