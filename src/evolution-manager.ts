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

    const genes = getEvolutionEntriesByCategory(category, 1);

    if (genes.length === 0) {
      logger.debug({ category }, 'No approved genes found for category');
      return undefined;
    }

    // TODO: 可以基于信号匹配度选择最佳 Gene，目前返回第一个
    return genes[0];
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

    // 通知审核者（TODO: 实现 IPC 通知）
    logger.info({ id, avgRating, feedbackCount }, 'Re-review triggered');
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
}

// 单例导出
export const evolutionManager = new EvolutionManager();
