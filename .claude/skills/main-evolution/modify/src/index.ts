  // 初始化主项目进化系统
  const mainEvolutionApplier = new MainEvolutionApplier();
  logger.info('Main evolution system initialized');

  // 错误处理中集成进化系统
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    mainEvolutionApplier.submitMainExperience({
      abilityName: '错误恢复',
      content: `系统遇到未捕获异常: ${err.message}\n${err.stack}`,
      category: 'repair',
      tags: ['error', 'system'],
    }).catch(e => logger.warn({ e }, 'Failed to submit error experience'));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    mainEvolutionApplier.submitMainExperience({
      abilityName: 'Promise 拒绝处理',
      content: `系统遇到未处理的 Promise 拒绝: ${reason}`,
      category: 'repair',
      tags: ['error', 'promise'],
    }).catch(e => logger.warn({ e }, 'Failed to submit rejection experience'));
  });
