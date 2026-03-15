  /**
   * 主项目提交经验到进化库
   */
  async submitMainExperience(input: MainExperienceInput): Promise<number> {
    logger.info(
      { abilityName: input.abilityName, component: input.component, contentLength: input.content.length },
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
      signalsMatch: signals.map(s => s.type),
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
        component: input.component
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
