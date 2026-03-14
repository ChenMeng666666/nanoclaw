/**
 * 信号提取模块
 *
 * 参考 evolver 的 signals.js，从反思内容/对话内容中提取信号
 * 用于触发学习、进化、饱和检测等行为
 */
export * from './signal-extractor/types.js';
export * from './signal-extractor/patterns.js';
export * from './signal-extractor/utils.js';
export * from './signal-extractor/extractor.js';
export * from './signal-extractor/action-mapping.js';
export * from './signal-extractor/main-signals.js';
