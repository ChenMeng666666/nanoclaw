/**
 * 进化系统
 * 实现共享经验库：上传 → 审核 → 查询 → 使用反馈 → 修改 → 再审核
 *
 * Gene 结构支持：
 * - category: 行动类别（repair/optimize/innovate/learn）
 * - signalsMatch: 匹配的信号类型
 * - strategy: 执行策略
 * - constraints: 执行约束
 * - validation: 验证命令
 */
import { generateEmbedding } from './embedding-providers/registry.js';
import {
  createEvolutionEntry,
  getEvolutionEntry,
  getApprovedEvolutionEntries,
  getEvolutionEntriesByCategory,
  updateEvolutionStatus,
  addEvolutionFeedback,
  logAudit,
  CreateGeneInput,
} from './db-agents.js';
import { EvolutionEntry, Gene, MainExperienceInput } from './types.js';
import { logger } from './logger.js';
import {
  extractSignals,
  getRecommendedGeneCategory,
  Signal,
} from './signal-extractor.js';
import { getDatabase } from './db-agents.js';

/**
 * 审核配置
 */
export interface ReviewConfig {
  autoApproveThreshold: number; // 自动通过的置信度阈值 (0.9)
  requireUserReview: boolean; // 是否需要用户终审
  seniorAgentIds?: string[]; // 高级 agent ID 列表
}

/**
 * 进化系统配置
 */
const DEFAULT_CONFIG: ReviewConfig = {
  autoApproveThreshold: 0.9,
  requireUserReview: false,
  seniorAgentIds: [],
};

/**
 * 审核代理类型
 */
interface ReviewAgent {
  id: string;
  name: string;
  expertise:
    | 'safety'
    | 'effectiveness'
    | 'reusability'
    | 'clarity'
    | 'completeness';
  weight: number;
}

/**
 * 审核代理配置
 */
const REVIEW_AGENTS: ReviewAgent[] = [
  {
    id: 'reviewer-safety',
    name: '安全审核员',
    expertise: 'safety',
    weight: 0.25,
  },
  {
    id: 'reviewer-effectiveness',
    name: '有效性审核员',
    expertise: 'effectiveness',
    weight: 0.25,
  },
  {
    id: 'reviewer-reusability',
    name: '可复用性审核员',
    expertise: 'reusability',
    weight: 0.2,
  },
  {
    id: 'reviewer-clarity',
    name: '清晰度审核员',
    expertise: 'clarity',
    weight: 0.15,
  },
  {
    id: 'reviewer-completeness',
    name: '完整性审核员',
    expertise: 'completeness',
    weight: 0.15,
  },
];

/**
 * 进化系统类
 */
export class EvolutionManager {
  private config: ReviewConfig;

  constructor(config: Partial<ReviewConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 上传经验到进化库（带自动初审）
   */
  async submitExperience(
    abilityName: string,
    content: string,
    sourceAgentId: string,
    description?: string,
    tags?: string[],
  ): Promise<number> {
    logger.info(
      { abilityName, sourceAgentId, contentLength: content.length },
      'Submitting experience to evolution',
    );

    // 从内容中提取信号
    const signals = extractSignals({ content });
    const category = getRecommendedGeneCategory(signals);

    // 生成向量嵌入
    const embedding = await generateEmbedding(content);

    // 自动初审：基于规则和内容质量
    const autoReview = await this.autoReviewEntry({
      abilityName,
      content,
      description: description || '',
      tags: tags || [],
    });

    // 决定初始状态
    let status: 'pending' | 'approved' = 'pending';
    if (
      autoReview.confidence > this.config.autoApproveThreshold &&
      !this.config.requireUserReview
    ) {
      status = 'approved';
      logger.info(
        { abilityName, confidence: autoReview.confidence },
        'Experience auto-approved',
      );
    }

    // 创建条目（包含 Gene 结构字段）
    const id = createEvolutionEntry({
      abilityName,
      description,
      sourceAgentId,
      content,
      contentEmbedding: embedding,
      tags: tags || [],
      status,
      category,
      signalsMatch: signals.map((s) => s.type),
    });

    // 记录审计日志
    logAudit({
      agentFolder: sourceAgentId,
      action: 'create',
      entityType: 'evolution',
      entityId: String(id),
      details: { abilityName, status, category, signalCount: signals.length },
    });

    if (status === 'pending') {
      logger.info({ id, abilityName }, 'Experience submitted, awaiting review');
    } else {
      logger.info(
        { id, abilityName },
        'Experience auto-approved and added to evolution library',
      );
    }

    return id;
  }

  /**
   * 提交 Gene 到进化库（完整 Gene 结构）
   */
  async submitGene(
    input: Omit<CreateGeneInput, 'contentEmbedding'>,
  ): Promise<number> {
    logger.info(
      {
        abilityName: input.abilityName,
        category: input.category,
        sourceAgentId: input.sourceAgentId,
      },
      'Submitting Gene to evolution',
    );

    // 生成向量嵌入
    const embedding = await generateEmbedding(input.content);

    // 自动初审
    const autoReview = await this.autoReviewEntry({
      abilityName: input.abilityName,
      content: input.content,
      description: input.description || '',
      tags: input.tags || [],
    });

    // 决定初始状态
    let status: 'pending' | 'approved' = 'pending';
    if (
      autoReview.confidence > this.config.autoApproveThreshold &&
      !this.config.requireUserReview
    ) {
      status = 'approved';
    }

    // 创建条目
    const id = createEvolutionEntry({
      ...input,
      contentEmbedding: embedding,
      status,
    });

    // 记录审计日志
    logAudit({
      agentFolder: input.sourceAgentId,
      action: 'create',
      entityType: 'gene',
      entityId: String(id),
      details: {
        abilityName: input.abilityName,
        status,
        category: input.category,
        signalCount: input.signalsMatch?.length || 0,
      },
    });

    return id;
  }

  /**
   * 根据信号选择合适的 Gene
   */
  async selectGene(signals: Signal[]): Promise<EvolutionEntry | undefined> {
    if (signals.length === 0) {
      logger.debug('No signals provided, returning undefined');
      return undefined;
    }

    const category = getRecommendedGeneCategory(signals);
    logger.debug(
      { category, signalCount: signals.length },
      'Selecting Gene based on signals',
    );

    // 获取该类别下的所有 approved Gene
    const genes = getEvolutionEntriesByCategory(category, 10); // 获取更多候选

    if (genes.length === 0) {
      logger.debug({ category }, 'No approved genes found for category');
      return undefined;
    }

    // 基于信号匹配度选择最佳 Gene
    return this.findBestMatchingGene(genes, signals);
  }

  /**
   * 基于信号匹配度找到最佳的 Gene
   */
  private findBestMatchingGene(
    genes: EvolutionEntry[],
    signals: Signal[],
  ): EvolutionEntry {
    // 计算每个 Gene 的匹配分数
    const scoredGenes = genes.map((gene) => {
      const score = this.calculateGeneSignalMatchScore(gene, signals);
      logger.debug(
        {
          geneId: gene.id,
          abilityName: gene.abilityName,
          score,
          signalsMatch: gene.signalsMatch,
        },
        'Gene signal match score',
      );
      return { gene, score };
    });

    // 按分数降序排序，返回最佳匹配
    scoredGenes.sort((a, b) => b.score - a.score);
    return scoredGenes[0].gene;
  }

  /**
   * 计算 Gene 与信号的匹配分数
   */
  private calculateGeneSignalMatchScore(
    gene: EvolutionEntry,
    signals: Signal[],
  ): number {
    let score = 0;
    const geneSignals = gene.signalsMatch || [];

    // 每个信号的权重
    const signalWeights: Record<string, number> = {};
    for (const signal of signals) {
      signalWeights[signal.type] = signal.confidence;
    }

    // 计算信号匹配度
    for (const geneSignal of geneSignals) {
      if (signalWeights[geneSignal]) {
        // 匹配的信号，按置信度加权
        score += signalWeights[geneSignal];
      }
    }

    // 类别匹配 bonus
    const geneCategory = gene.category;
    const recommendedCategory = getRecommendedGeneCategory(signals);
    if (geneCategory === recommendedCategory) {
      score += 0.2;
    }

    // 反馈评分 bonus
    const avgFeedback = this.calculateAverageRating(gene.feedback);
    score += avgFeedback / 10; // 最高 0.5 分的反馈 bonus

    // 归一化分数
    return Math.min(score, 1.0);
  }

  /**
   * 根据内容自动选择 Gene
   */
  async selectGeneForContent(
    content: string,
  ): Promise<EvolutionEntry | undefined> {
    const signals = extractSignals({ content });
    return this.selectGene(signals);
  }

  /**
   * 审核经验条目
   */
  async reviewExperience(
    id: number,
    reviewerId: string,
    approved: boolean,
    feedback?: string,
  ): Promise<void> {
    logger.info({ id, reviewerId, approved }, 'Reviewing experience');

    const entry = getEvolutionEntry(id);
    if (!entry) {
      logger.warn({ id }, 'Evolution entry not found');
      return;
    }

    // 更新状态
    updateEvolutionStatus(
      id,
      approved ? 'approved' : 'rejected',
      reviewerId,
      feedback,
    );

    // 记录审计日志
    logAudit({
      agentFolder: entry.sourceAgentId,
      action: 'review',
      entityType: 'evolution',
      entityId: String(id),
      details: { reviewerId, approved, feedback },
    });

    logger.info(
      { id, approved, reviewerId },
      `Experience ${approved ? 'approved' : 'rejected'}`,
    );
  }

  /**
   * 查询经验（支持向量检索和标签过滤）
   */
  async queryExperience(
    query: string,
    tags?: string[],
    limit: number = 20,
  ): Promise<EvolutionEntry[]> {
    logger.debug({ query, tags, limit }, 'Querying evolution');

    // 使用数据库检索（带标签过滤）
    const entries = getApprovedEvolutionEntries(tags, limit);

    // 如果有查询文本，按相似度排序
    if (query) {
      const queryEmbedding = await generateEmbedding(query);

      const scored = entries
        .filter((e) => e.contentEmbedding && e.contentEmbedding.length > 0)
        .map((entry) => ({
          entry,
          score: this.cosineSimilarity(queryEmbedding, entry.contentEmbedding!),
        }))
        .sort((a, b) => b.score - a.score);

      return scored.map((s) => s.entry);
    }

    return entries;
  }

  /**
   * 提交使用反馈
   */
  async submitFeedback(
    id: number,
    agentId: string,
    comment: string,
    rating: number, // 1-5 分
  ): Promise<void> {
    logger.info({ id, agentId, rating }, 'Submitting evolution feedback');

    addEvolutionFeedback(id, agentId, comment, rating);

    // 记录审计日志
    logAudit({
      action: 'feedback',
      entityType: 'evolution',
      entityId: String(id),
      details: { agentId, rating, comment },
    });

    // 检查是否需要再审核
    const entry = getEvolutionEntry(id);
    if (entry) {
      const avgRating = this.calculateAverageRating(entry.feedback);
      const feedbackCount = entry.feedback.length;

      // 如果反馈过多或评分过低，触发再审核
      if (avgRating < 3 || feedbackCount >= 10) {
        await this.triggerReReview(id, avgRating, feedbackCount);
      }
    }
  }

  /**
   * 标记经验为需要再审核
   */
  async markForReReview(id: number, reason: string): Promise<void> {
    logger.info({ id, reason }, 'Marking evolution for re-review');

    updateEvolutionStatus(id, 'reviewing', undefined, reason);

    logAudit({
      action: 're_review',
      entityType: 'evolution',
      entityId: String(id),
      details: { reason },
    });
  }

  // ===== 私有方法 =====

  private async autoReviewEntry(entry: {
    abilityName: string;
    content: string;
    description: string;
    tags: string[];
  }): Promise<{ confidence: number; issues: string[] }> {
    const issues: string[] = [];
    let confidence = 0.8; // 基础置信度

    // 规则 1: 内容长度检查
    if (entry.content.length < 50) {
      issues.push('Content too short');
      confidence -= 0.2;
    }

    // 规则 2: 能力名称检查
    if (!entry.abilityName || entry.abilityName.length < 2) {
      issues.push('Invalid ability name');
      confidence -= 0.15;
    }

    // 规则 3: 包含代码或结构化内容
    const hasCode =
      entry.content.includes('```') ||
      entry.content.includes('function') ||
      entry.content.includes('class') ||
      entry.content.includes('const ') ||
      entry.content.includes('export');
    if (hasCode) {
      confidence += 0.1; // 代码内容更可能是有效的
    }

    // 规则 4: 包含经验关键词
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
      'how to',
      'solution',
    ];
    const lowerContent = entry.content.toLowerCase();
    const hasExperience = experienceKeywords.some((kw) =>
      lowerContent.includes(kw.toLowerCase()),
    );
    if (hasExperience) {
      confidence += 0.05;
    }

    // 规则 5: 有标签
    if (entry.tags.length > 0) {
      confidence += 0.05;
    }

    // 规则 6: 有描述
    if (entry.description && entry.description.length > 20) {
      confidence += 0.05;
    }

    return {
      confidence: Math.min(Math.max(confidence, 0), 1),
      issues,
    };
  }

  private async triggerReReview(
    id: number,
    avgRating: number,
    feedbackCount: number,
  ): Promise<void> {
    const reasons: string[] = [];

    if (avgRating < 3) {
      reasons.push(`Low average rating: ${avgRating.toFixed(2)}`);
    }

    if (feedbackCount >= 10) {
      reasons.push(`High feedback count: ${feedbackCount}`);
    }

    await this.markForReReview(id, reasons.join('; '));

    // 通知审核者（IPC 通知）
    try {
      // 发送 IPC 通知到主进程
      const notification = {
        type: 're-review',
        data: {
          id,
          avgRating,
          feedbackCount,
          reason: 'Automatic re-review triggered',
        },
      };

      logger.debug({ notification }, 'Sending IPC notification');
      // 这里可以实现具体的 IPC 通知机制，比如写入通知文件或使用事件系统
      // 目前记录到日志中
      logger.info(
        { id, avgRating, feedbackCount, notification },
        'Re-review notification sent',
      );
    } catch (error) {
      logger.error(
        { id, avgRating, feedbackCount, error },
        'Failed to send re-review notification',
      );
    }
  }

  private calculateAverageRating(
    feedback: Array<{ rating: number }> | undefined,
  ): number {
    if (!feedback || feedback.length === 0) return 0;

    const sum = feedback.reduce((acc, f) => acc + (f.rating || 0), 0);
    return sum / feedback.length;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 主项目提交经验到进化库
   */
  async submitMainExperience(input: MainExperienceInput): Promise<number> {
    logger.info(
      {
        abilityName: input.abilityName,
        component: input.component,
        contentLength: input.content.length,
      },
      'Submitting main project experience to evolution',
    );

    // 从内容中提取信号
    const signals = extractSignals({ content: input.content });
    const category = input.category || getRecommendedGeneCategory(signals);

    // 生成向量嵌入
    const embedding = await generateEmbedding(input.content);

    // 自动初审：基于内容长度、能力名称、代码内容、经验关键词等规则评分
    const autoReview = await this.autoReviewEntry({
      abilityName: input.abilityName,
      content: input.content,
      description: input.description || '',
      tags: input.tags || [],
    });

    // 决定初始状态
    let status: 'pending' | 'approved' = 'pending';
    if (
      autoReview.confidence > this.config.autoApproveThreshold &&
      !this.config.requireUserReview
    ) {
      status = 'approved';
      logger.info(
        { abilityName: input.abilityName, confidence: autoReview.confidence },
        'Main project experience auto-approved',
      );
    }

    // 创建条目（包含 Gene 结构字段）
    const id = createEvolutionEntry({
      abilityName: input.abilityName,
      description: input.description,
      sourceAgentId: 'main-process',
      content: input.content,
      contentEmbedding: embedding,
      tags: input.tags || [],
      status,
      category,
      signalsMatch: signals.map((s) => s.type),
    });

    // 记录审计日志
    logAudit({
      agentFolder: 'main-process',
      action: 'create',
      entityType: 'evolution',
      entityId: String(id),
      details: {
        abilityName: input.abilityName,
        status,
        category,
        signalCount: signals.length,
        component: input.component,
      },
    });

    if (status === 'pending') {
      logger.info(
        { id, abilityName: input.abilityName },
        'Main project experience submitted, awaiting review',
      );
    } else {
      logger.info(
        { id, abilityName: input.abilityName },
        'Main project experience auto-approved and added to evolution library',
      );
    }

    return id;
  }

  /**
   * 自动审核所有 pending 条目
   */
  async autoReviewPendingEntries(): Promise<void> {
    const db = getDatabase();
    const pendingEntries = db
      .prepare('SELECT * FROM evolution_log WHERE status = ?')
      .all('pending') as any[];

    logger.info(
      { count: pendingEntries.length },
      'Starting auto-review of pending entries',
    );

    for (const entry of pendingEntries) {
      await this.autoReviewPendingEntry(entry);
    }
  }

  /**
   * 自动审核单个待审核条目
   */
  private async autoReviewPendingEntry(entry: any): Promise<void> {
    const scores: Record<string, { score: number; comment: string }> = {};
    let totalScore = 0;

    // 每个审核代理独立评分
    for (const agent of REVIEW_AGENTS) {
      const review = await this.reviewByAgent(entry, agent);
      scores[agent.id] = review;
      totalScore += review.score * agent.weight;
    }

    // 确定审核结果
    const passed = totalScore >= 0.7; // 70 分通过
    const finalStatus = passed ? 'approved' : 'rejected';

    // 更新状态
    updateEvolutionStatus(
      entry.id,
      finalStatus,
      'auto-reviewer',
      `自动审核完成，综合评分：${(totalScore * 100).toFixed(1)}分`,
    );

    // 记录每个代理的评分（可以存储在 feedback 或单独的表中）
    logger.info(
      {
        entryId: entry.id,
        abilityName: entry.ability_name,
        status: finalStatus,
        totalScore,
      },
      'Entry auto-reviewed',
    );
  }

  /**
   * 单个审核代理的评分逻辑
   */
  private async reviewByAgent(
    entry: any,
    agent: ReviewAgent,
  ): Promise<{ score: number; comment: string }> {
    let score = 0.5; // 基础分
    let comment = '';

    switch (agent.expertise) {
      case 'safety':
        // 安全审核：检查是否包含危险内容
        const safetyIssues = this.checkSafety(entry.content);
        if (safetyIssues.length === 0) {
          score = 0.9;
          comment = '无安全问题';
        } else {
          score = 0.3;
          comment = `发现安全问题：${safetyIssues.join(', ')}`;
        }
        break;

      case 'effectiveness':
        // 有效性审核：检查内容是否实用
        if (
          entry.content.length > 200 &&
          this.hasPracticalAdvice(entry.content)
        ) {
          score = 0.85;
          comment = '内容实用有效';
        } else {
          score = 0.4;
          comment = '内容可能不够实用';
        }
        break;

      case 'reusability':
        // 可复用性审核：检查是否可推广
        if (this.hasReusablePatterns(entry.content)) {
          score = 0.8;
          comment = '包含可复用的模式';
        } else {
          score = 0.5;
          comment = '通用性一般';
        }
        break;

      case 'clarity':
        // 清晰度审核：检查表达是否清晰
        if (this.isClearlyWritten(entry.content)) {
          score = 0.85;
          comment = '表达清晰易懂';
        } else {
          score = 0.45;
          comment = '表达可能需要改进';
        }
        break;

      case 'completeness':
        // 完整性审核：检查内容是否完整
        if (this.isContentComplete(entry.content, entry.description || '')) {
          score = 0.8;
          comment = '内容完整';
        } else {
          score = 0.5;
          comment = '内容可能不够完整';
        }
        break;
    }

    return { score, comment };
  }

  // 辅助审核方法
  private checkSafety(content: string): string[] {
    const issues: string[] = [];
    // 检查是否包含危险模式
    const dangerousPatterns = [
      /rm\s+-rf/,
      /eval\s*\(/,
      /exec\s*\(/,
      /child_process/,
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        issues.push('包含潜在危险的命令');
      }
    }
    return issues;
  }

  private hasPracticalAdvice(content: string): boolean {
    const keywords = [
      '方法',
      '步骤',
      '如何',
      '技巧',
      '建议',
      '实践',
      'example',
      'how to',
      'steps',
    ];
    return keywords.some((kw) => content.toLowerCase().includes(kw));
  }

  private hasReusablePatterns(content: string): boolean {
    const keywords = [
      '模式',
      '通用',
      '模板',
      '框架',
      'structure',
      'pattern',
      'template',
      'framework',
    ];
    return keywords.some((kw) => content.toLowerCase().includes(kw));
  }

  private isClearlyWritten(content: string): boolean {
    // 简单检查：有分段、有列表、有代码块
    return (
      content.includes('\n') ||
      content.includes('```') ||
      content.includes('1.') ||
      content.includes('- ')
    );
  }

  private isContentComplete(content: string, description: string): boolean {
    return content.length > 150 && description.length > 20;
  }

  private calculateHistoricalScore(entry: any): number {
    // 计算历史条目的综合评分（基于反馈）
    if (entry.feedback && entry.feedback.length > 0) {
      const avgRating =
        entry.feedback.reduce(
          (sum: number, f: any) => sum + (f.rating || 3),
          0,
        ) / entry.feedback.length;
      return avgRating / 5; // 归一化到 0-1
    }
    return 0.7; // 默认历史分数
  }
}

// 单例导出
export const evolutionManager = new EvolutionManager();
