/**
 * Reflection Executor
 * Handles the execution of reflection and learning tasks.
 */
import crypto from 'crypto';

import {
  createReflection,
  getLearningTask,
  updateLearningTask,
  createLearningTask,
  getDatabase,
  getMemories,
  updateMemory,
  getAllActiveAgents,
} from '../../db-agents.js';
import type {
  AgentConfig,
  LearningTask,
  DetailedReflection,
  Memory,
} from '../../types/agent-memory.js';
import { logger } from '../../logger.js';
import { memoryApplicationService as memoryManager } from '../../contexts/memory/application/index.js';
import { evolutionApplicationService as evolutionManager } from '../../contexts/evolution/application/index.js';

export class ReflectionExecutor {
  /**
   * Trigger reflection for all agents by type
   */
  async triggerReflectionsForAllAgents(
    type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly',
  ): Promise<void> {
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

  /**
   * Trigger reflection for a single agent
   */
  async triggerReflection(
    agent: AgentConfig,
    type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'task',
    triggeredBy?: string,
  ): Promise<void> {
    logger.info(
      { agent: agent.name, type, triggeredBy },
      'Triggering reflection',
    );

    // Create reflection content
    const content = await this.generateReflectionContent(agent, type);
    const reflectionId = createReflection({
      agentFolder: agent.folder,
      type,
      content,
      triggeredBy,
    });

    // Add reflection content to long-term memory
    await memoryManager.addMemory(agent.folder, content, 'L3', undefined);

    logger.info(
      { agent: agent.name, type, reflectionId },
      'Reflection created',
    );
  }

  /**
   * Complete a learning task and trigger reflection
   */
  async completeLearningTask(taskId: string): Promise<void> {
    const task = getLearningTask(taskId);
    if (!task) {
      logger.warn({ taskId }, 'Learning task not found');
      return;
    }

    // Create reflection after task completion
    const reflectionContent = await this.generateTaskReflection(task);
    const reflectionId = createReflection({
      agentFolder: task.agentFolder,
      type: 'task',
      content: reflectionContent,
      triggeredBy: taskId,
    });

    // Update task status
    updateLearningTask(taskId, {
      status: 'completed',
      reflectionId,
      completedAt: new Date().toISOString(),
    });

    // Add reflection to memory
    await memoryManager.addMemory(task.agentFolder, reflectionContent, 'L3');

    // Check if it's worthy of evolution submission
    const evolutionWorthy = await this.evaluateForEvolution(
      task,
      reflectionContent,
    );
    if (evolutionWorthy) {
      logger.info(
        { taskId, taskName: task.description },
        'Task experience worthy of evolution, submitting to evolution system',
      );
      // Call Evolution System API to submit experience
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
   * Create a learning task
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

  /**
   * Consolidate memories for all agents (L1->L2->L3)
   */
  async consolidateMemoriesForAllAgents(): Promise<void> {
    const agents = getAllActiveAgents();
    for (const agent of agents) {
      await this.consolidateAgentMemories(agent);
    }
  }

  /**
   * Check learning progress for all agents and trigger reflection
   */
  async checkLearningProgressForAllAgents(): Promise<void> {
    const agents = getAllActiveAgents();
    for (const agent of agents) {
      await this.checkLearningProgress(agent);
    }
  }

  // ===== Private Methods =====

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

    // Get relevant memories
    const memories = await memoryManager.searchMemories(
      agent.folder,
      `recent ${type} activities`,
      20,
    );

    // Analyze memories
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
    memories: Memory[],
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

    // Simple keyword analysis
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

    // Simple rating logic
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
    memories: Memory[],
  ): string {
    if (memories.length === 0) {
      return '暂无足够的记忆数据进行深度反思。';
    }

    const insights: string[] = [];

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

  // Note: This method was present in original file but not used in generateReflectionContent directly?
  // Ah, it was a separate private method. Keeping it just in case.
  private generateImprovementSuggestions(
    agent: AgentConfig,
    type: string,
  ): string {
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
    if (task.status !== 'completed') return false;
    if (reflectionContent.length < 100) return false;

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

  private async consolidateAgentMemories(agent: AgentConfig): Promise<void> {
    const l2Memories = getMemories(agent.folder, 'L2');

    for (const memory of l2Memories) {
      const shouldConsolidate = this.evaluateMemoryForL3(memory);
      if (shouldConsolidate) {
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

  private evaluateMemoryForL3(memory: Memory): boolean {
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

  private async checkLearningProgress(agent: AgentConfig): Promise<void> {
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
        await memoryManager.addMemory(
          agent.folder,
          `你有${pendingTasks.length}个待处理的学习任务，建议开始执行。`,
          'L2',
          undefined,
        );
      }
      return;
    }

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

    const reflectionId = createReflection({
      agentFolder: agent.folder,
      type: 'weekly',
      content: progressContent,
      triggeredBy: 'learning_progress_check',
    });

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

// Singleton export
export const reflectionExecutor = new ReflectionExecutor();
