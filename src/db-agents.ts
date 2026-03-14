/**
 * 多智能体架构数据库访问器
 * 包含 agents, channel_instances, user_profiles, memories, reflections,
 * learning_tasks, evolution_log 等表的 CRUD 操作
 */
import Database from 'better-sqlite3';
import {
  setDatabase as setPersistenceDatabase,
  getDatabase as getPersistenceDatabase,
  beginTransaction as beginSqliteTransaction,
  commit as commitSqliteTransaction,
  rollback as rollbackSqliteTransaction,
  transaction as withSqliteTransaction,
} from './infrastructure/persistence/sqlite/transaction-manager.js';

/** 初始化数据库引用（由主 db.ts 调用） */
export function setDatabase(database: Database.Database): void {
  setPersistenceDatabase(database);
}

/** 获取数据库引用（供其他模块使用） */
export function getDatabase(): Database.Database {
  return getPersistenceDatabase();
}

// ===== 事务支持 =====

/**
 * 开始事务
 */
export function beginTransaction(): void {
  beginSqliteTransaction();
}

/**
 * 提交事务
 */
export function commit(): void {
  commitSqliteTransaction();
}

/**
 * 回滚事务
 */
export function rollback(): void {
  rollbackSqliteTransaction();
}

/**
 * 事务包装函数
 */
export function transaction<T>(fn: () => T): T {
  return withSqliteTransaction(fn);
}

export {
  createAgent,
  getAgentById,
  getAgentByFolder,
  getAllActiveAgents,
  updateAgent,
  deactivateAgent,
  createChannelInstance,
  getChannelInstanceById,
  getChannelInstanceByJid,
  getChannelInstancesForAgent,
  deactivateChannelInstance,
  createOrUpdateUserProfile,
  getUserProfile,
} from './infrastructure/persistence/repositories/agent/core-repository.js';

// ===== Memories =====
export {
  createMemory,
  getMemories,
  getAllMemories,
  getUserMemories,
  getDuplicateMemory,
  updateMemory,
  incrementMemoryAccess,
  deleteMemory,
  type MemoryQueryOptions,
} from './infrastructure/persistence/repositories/agent/memory-repository.js';

// ===== Reflections =====
export {
  createReflection,
  getReflectionsByAgent,
  createLearningTask,
  getLearningTask,
  getLearningTasksByAgent,
  updateLearningTask,
} from './infrastructure/persistence/repositories/agent/learning-repository.js';

// ===== Evolution Log / Gene =====
export {
  getEvolutionEntry,
  getDuplicateEvolutionEntry,
  getApprovedEvolutionEntries,
  getEvolutionEntriesByCategory,
  getCapsuleById,
  getCapsulesByGeneId,
  getAbilityChain,
  getValidationReportsByGeneId,
  getEcosystemMetrics,
  getEvolutionEntriesByStatus,
  getEvolutionEntryByAssetId,
} from './infrastructure/persistence/repositories/agent/evolution-read-repository.js';

export {
  createEvolutionEntry,
  updateEvolutionStatus,
  addEvolutionFeedback,
  createCapsule,
  updateCapsuleSuccessStreak,
  createAbilityChain,
  updateAbilityChain,
  addGeneToChain,
  addCapsuleToChain,
  createValidationReport,
  createEcosystemMetrics,
  updateGeneChainId,
  updateGeneStatus,
  updateGeneGDIScore,
  type CreateGeneInput,
} from './infrastructure/persistence/repositories/agent/evolution-write-repository.js';
export {
  logAudit,
  createScheduledTaskForLearning,
  getAuditLogs,
  type AuditLogEntry,
} from './infrastructure/persistence/repositories/agent/audit-repository.js';

// ===== Learning Results =====
export {
  createLearningResult,
  getLearningResult,
  getLearningResultsByAgent,
  getRecentLearningResults,
  type LearningResultEntry,
} from './infrastructure/persistence/repositories/agent/learning-repository.js';
