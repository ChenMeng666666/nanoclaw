import { validateConfig, validateInteger } from './validators.js';

export const MEMORY_CONFIG = {
  runtime: {
    mainPipeline: validateConfig(
      process.env.MEMORY_MAIN_PIPELINE || 'context_engine',
      (v) => ['context_engine', 'memory_manager'].includes(v),
      'context_engine',
      'MEMORY_MAIN_PIPELINE',
    ) as 'context_engine' | 'memory_manager',
  },
  migration: {
    l1ToL2MinAccessCount: validateConfig(
      parseInt(process.env.MEMORY_L1_TO_L2_MIN_ACCESS_COUNT || '3', 10),
      (v) => validateInteger(v, 1, 1000),
      3,
      'MEMORY_L1_TO_L2_MIN_ACCESS_COUNT',
    ),
    l1ToL2MinIdleDays: validateConfig(
      parseInt(process.env.MEMORY_L1_TO_L2_MIN_IDLE_DAYS || '7', 10),
      (v) => validateInteger(v, 0, 3650),
      7,
      'MEMORY_L1_TO_L2_MIN_IDLE_DAYS',
    ),
    l2ToL3MinIdleDays: validateConfig(
      parseInt(process.env.MEMORY_L2_TO_L3_MIN_IDLE_DAYS || '30', 10),
      (v) => validateInteger(v, 0, 3650),
      30,
      'MEMORY_L2_TO_L3_MIN_IDLE_DAYS',
    ),
    l2ToL3MinImportance: validateConfig(
      parseFloat(process.env.MEMORY_L2_TO_L3_MIN_IMPORTANCE || '0.8'),
      (v) => typeof v === 'number' && v >= 0 && v <= 1,
      0.8,
      'MEMORY_L2_TO_L3_MIN_IMPORTANCE',
    ),
    migratedContentPrefix: process.env.MEMORY_MIGRATION_PREFIX || '',
  },
  retrieval: {
    queryVariantLimit: validateConfig(
      parseInt(process.env.MEMORY_QUERY_VARIANT_LIMIT || '5', 10),
      (v) => validateInteger(v, 1, 10),
      5,
      'MEMORY_QUERY_VARIANT_LIMIT',
    ),
    semanticDedupThreshold: validateConfig(
      parseFloat(process.env.MEMORY_SEMANTIC_DEDUP_THRESHOLD || '0.92'),
      (v) => typeof v === 'number' && v >= 0 && v <= 1,
      0.92,
      'MEMORY_SEMANTIC_DEDUP_THRESHOLD',
    ),
    conflictMergeThreshold: validateConfig(
      parseFloat(process.env.MEMORY_CONFLICT_MERGE_THRESHOLD || '0.85'),
      (v) => typeof v === 'number' && v >= 0 && v <= 1,
      0.85,
      'MEMORY_CONFLICT_MERGE_THRESHOLD',
    ),
    vectorCandidateMultiplier: validateConfig(
      parseInt(process.env.MEMORY_VECTOR_CANDIDATE_MULTIPLIER || '6', 10),
      (v) => validateInteger(v, 2, 20),
      6,
      'MEMORY_VECTOR_CANDIDATE_MULTIPLIER',
    ),
    hotCandidateRatio: validateConfig(
      parseFloat(process.env.MEMORY_HOT_CANDIDATE_RATIO || '0.8'),
      (v) => typeof v === 'number' && v >= 0.1 && v <= 1,
      0.8,
      'MEMORY_HOT_CANDIDATE_RATIO',
    ),
    hotMemoryWindowDays: validateConfig(
      parseInt(process.env.MEMORY_HOT_MEMORY_WINDOW_DAYS || '14', 10),
      (v) => validateInteger(v, 1, 3650),
      14,
      'MEMORY_HOT_MEMORY_WINDOW_DAYS',
    ),
    vectorSearchMinScore: validateConfig(
      parseFloat(process.env.MEMORY_VECTOR_SEARCH_MIN_SCORE || '0.05'),
      (v) => typeof v === 'number' && v >= -1 && v <= 1,
      0.05,
      'MEMORY_VECTOR_SEARCH_MIN_SCORE',
    ),
    variantBatchSize: validateConfig(
      parseInt(process.env.MEMORY_VARIANT_BATCH_SIZE || '2', 10),
      (v) => validateInteger(v, 1, 10),
      2,
      'MEMORY_VARIANT_BATCH_SIZE',
    ),
    queryTimeoutMs: validateConfig(
      parseInt(process.env.MEMORY_QUERY_TIMEOUT_MS || '2500', 10),
      (v) => validateInteger(v, 200, 60000),
      2500,
      'MEMORY_QUERY_TIMEOUT_MS',
    ),
    migrationBatchSize: validateConfig(
      parseInt(process.env.MEMORY_MIGRATION_BATCH_SIZE || '50', 10),
      (v) => validateInteger(v, 1, 1000),
      50,
      'MEMORY_MIGRATION_BATCH_SIZE',
    ),
    migrationConcurrency: validateConfig(
      parseInt(process.env.MEMORY_MIGRATION_CONCURRENCY || '4', 10),
      (v) => validateInteger(v, 1, 20),
      4,
      'MEMORY_MIGRATION_CONCURRENCY',
    ),
    rerankWeights: {
      fused: validateConfig(
        parseFloat(process.env.MEMORY_RERANK_WEIGHT_FUSED || '0.35'),
        (v) => typeof v === 'number' && v >= 0 && v <= 1,
        0.35,
        'MEMORY_RERANK_WEIGHT_FUSED',
      ),
      vector: validateConfig(
        parseFloat(process.env.MEMORY_RERANK_WEIGHT_VECTOR || '0.25'),
        (v) => typeof v === 'number' && v >= 0 && v <= 1,
        0.25,
        'MEMORY_RERANK_WEIGHT_VECTOR',
      ),
      bm25: validateConfig(
        parseFloat(process.env.MEMORY_RERANK_WEIGHT_BM25 || '0.15'),
        (v) => typeof v === 'number' && v >= 0 && v <= 1,
        0.15,
        'MEMORY_RERANK_WEIGHT_BM25',
      ),
      quality: validateConfig(
        parseFloat(process.env.MEMORY_RERANK_WEIGHT_QUALITY || '0.1'),
        (v) => typeof v === 'number' && v >= 0 && v <= 1,
        0.1,
        'MEMORY_RERANK_WEIGHT_QUALITY',
      ),
      timestamp: validateConfig(
        parseFloat(process.env.MEMORY_RERANK_WEIGHT_TIMESTAMP || '0.1'),
        (v) => typeof v === 'number' && v >= 0 && v <= 1,
        0.1,
        'MEMORY_RERANK_WEIGHT_TIMESTAMP',
      ),
      importance: validateConfig(
        parseFloat(process.env.MEMORY_RERANK_WEIGHT_IMPORTANCE || '0.05'),
        (v) => typeof v === 'number' && v >= 0 && v <= 1,
        0.05,
        'MEMORY_RERANK_WEIGHT_IMPORTANCE',
      ),
    },
  },
  api: {
    maxRequestBodyBytes: validateConfig(
      parseInt(process.env.MEMORY_API_MAX_BODY_BYTES || '1048576', 10),
      (v) => validateInteger(v, 1024, 10485760),
      1048576,
      'MEMORY_API_MAX_BODY_BYTES',
    ),
    maxContentLength: validateConfig(
      parseInt(process.env.MEMORY_API_MAX_CONTENT_LENGTH || '12000', 10),
      (v) => validateInteger(v, 1, 200000),
      12000,
      'MEMORY_API_MAX_CONTENT_LENGTH',
    ),
    minLimit: validateConfig(
      parseInt(process.env.MEMORY_API_MIN_LIMIT || '1', 10),
      (v) => validateInteger(v, 1, 1000),
      1,
      'MEMORY_API_MIN_LIMIT',
    ),
    maxLimit: validateConfig(
      parseInt(process.env.MEMORY_API_MAX_LIMIT || '50', 10),
      (v) => validateInteger(v, 1, 1000),
      50,
      'MEMORY_API_MAX_LIMIT',
    ),
    searchTimeoutMs: validateConfig(
      parseInt(process.env.MEMORY_API_SEARCH_TIMEOUT_MS || '2500', 10),
      (v) => validateInteger(v, 200, 60000),
      2500,
      'MEMORY_API_SEARCH_TIMEOUT_MS',
    ),
    maxConcurrentSearches: validateConfig(
      parseInt(process.env.MEMORY_API_MAX_CONCURRENT_SEARCHES || '6', 10),
      (v) => validateInteger(v, 1, 200),
      6,
      'MEMORY_API_MAX_CONCURRENT_SEARCHES',
    ),
  },
};
