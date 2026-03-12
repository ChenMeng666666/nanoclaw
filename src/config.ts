import os from 'os';
import path from 'path';
import { logger } from './logger.js';

import { readEnvFile } from './env.js';

// 配置验证函数
function validateConfig<T>(
  value: T,
  validator: (val: T) => boolean,
  defaultValue: T,
  configName: string,
): T {
  if (validator(value)) {
    return value;
  }
  logger.warn(
    { configName, value, defaultValue },
    'Invalid config value, using default',
  );
  return defaultValue;
}

// 整数验证
function validateInteger(
  value: string | number,
  min: number,
  max: number,
): boolean {
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max;
}

// 字符串验证
function validateString(
  value: string,
  minLength: number = 0,
  maxLength: number = 100,
): boolean {
  return (
    typeof value === 'string' &&
    value.length >= minLength &&
    value.length <= maxLength
  );
}

// 布尔值验证
function validateBoolean(value: any): boolean {
  return (
    value === true || value === false || value === 'true' || value === 'false'
  );
}

// 路径验证
function validatePath(value: string): boolean {
  return typeof value === 'string' && value.length > 0;
}

// Read config values from .env (falls back to process.env).
// Secrets are NOT read here — they stay on disk and are loaded only
// where needed (container-runner.ts) to avoid leaking to child processes.
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER']);

export const ASSISTANT_NAME = validateConfig(
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy',
  (v) => validateString(v, 1, 50),
  'Andy',
  'ASSISTANT_NAME',
);

export const ASSISTANT_HAS_OWN_NUMBER = validateConfig(
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true',
  validateBoolean,
  false,
  'ASSISTANT_HAS_OWN_NUMBER',
);

export const POLL_INTERVAL = validateConfig(
  parseInt(process.env.POLL_INTERVAL || '2000', 10),
  (v) => validateInteger(v, 500, 60000),
  2000,
  'POLL_INTERVAL',
);

export const SCHEDULER_POLL_INTERVAL = validateConfig(
  parseInt(process.env.SCHEDULER_POLL_INTERVAL || '60000', 10),
  (v) => validateInteger(v, 5000, 300000),
  60000,
  'SCHEDULER_POLL_INTERVAL',
);

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = validateConfig(
  process.env.HOME || os.homedir(),
  validatePath,
  os.homedir(),
  'HOME_DIR',
);

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = validateConfig(
  path.join(HOME_DIR, '.config', 'nanoclaw', 'mount-allowlist.json'),
  validatePath,
  path.join(os.homedir(), '.config', 'nanoclaw', 'mount-allowlist.json'),
  'MOUNT_ALLOWLIST_PATH',
);

export const SENDER_ALLOWLIST_PATH = validateConfig(
  path.join(HOME_DIR, '.config', 'nanoclaw', 'sender-allowlist.json'),
  validatePath,
  path.join(os.homedir(), '.config', 'nanoclaw', 'sender-allowlist.json'),
  'SENDER_ALLOWLIST_PATH',
);

export const STORE_DIR = validateConfig(
  path.resolve(PROJECT_ROOT, 'store'),
  validatePath,
  path.resolve(process.cwd(), 'store'),
  'STORE_DIR',
);

export const GROUPS_DIR = validateConfig(
  path.resolve(PROJECT_ROOT, 'groups'),
  validatePath,
  path.resolve(process.cwd(), 'groups'),
  'GROUPS_DIR',
);

export const DATA_DIR = validateConfig(
  path.resolve(PROJECT_ROOT, 'data'),
  validatePath,
  path.resolve(process.cwd(), 'data'),
  'DATA_DIR',
);

export const CONTAINER_IMAGE = validateConfig(
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest',
  (v) => validateString(v, 1, 200),
  'nanoclaw-agent:latest',
  'CONTAINER_IMAGE',
);

export const CONTAINER_NETWORK_MODE = validateConfig(
  process.env.CONTAINER_NETWORK_MODE || 'bridge',
  (v) => v === 'bridge' || v === 'none',
  'bridge' as const,
  'CONTAINER_NETWORK_MODE',
);

export const CONTAINER_ALLOW_HOST_GATEWAY = validateConfig(
  (process.env.CONTAINER_ALLOW_HOST_GATEWAY || 'true') === 'true',
  validateBoolean,
  true,
  'CONTAINER_ALLOW_HOST_GATEWAY',
);

export const CONTAINER_TIMEOUT = validateConfig(
  parseInt(process.env.CONTAINER_TIMEOUT || '1800000', 10),
  (v) => validateInteger(v, 30000, 3600000),
  1800000,
  'CONTAINER_TIMEOUT',
);

export const CONTAINER_MAX_OUTPUT_SIZE = validateConfig(
  parseInt(process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760', 10),
  (v) => validateInteger(v, 1048576, 1073741824),
  10485760,
  'CONTAINER_MAX_OUTPUT_SIZE',
); // 10MB default

export const IPC_POLL_INTERVAL = validateConfig(
  parseInt(process.env.IPC_POLL_INTERVAL || '1000', 10),
  (v) => validateInteger(v, 200, 5000),
  1000,
  'IPC_POLL_INTERVAL',
);

export const IDLE_TIMEOUT = validateConfig(
  parseInt(process.env.IDLE_TIMEOUT || '1800000', 10),
  (v) => validateInteger(v, 60000, 3600000),
  1800000,
  'IDLE_TIMEOUT',
); // 30min default — how long to keep container alive after last result

export const MAX_CONCURRENT_CONTAINERS = validateConfig(
  Math.max(1, parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5),
  (v) => validateInteger(v, 1, 20),
  5,
  'MAX_CONCURRENT_CONTAINERS',
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE = validateConfig(
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
  (v) => validateString(v, 1, 100),
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'TIMEZONE',
);

// Runtime API 配置
export const RUNTIME_API_CONFIG = {
  port: parseInt(process.env.RUNTIME_API_PORT || '3456', 10),
  fallbackPorts: [3457, 3458, 3459],
  portCheckTimeout: 5000,
};

// 配置完整性检查
export function validateAllConfig(): boolean {
  const requiredConfigs = [
    { name: 'ASSISTANT_NAME', value: ASSISTANT_NAME },
    { name: 'POLL_INTERVAL', value: POLL_INTERVAL },
    { name: 'CONTAINER_TIMEOUT', value: CONTAINER_TIMEOUT },
    { name: 'MAX_CONCURRENT_CONTAINERS', value: MAX_CONCURRENT_CONTAINERS },
  ];

  let allValid = true;
  for (const config of requiredConfigs) {
    if (!config.value) {
      logger.error({ configName: config.name }, 'Required config is missing');
      allValid = false;
    }
  }

  return allValid;
}

// ===== 安全配置 =====
export const SECURITY_CONFIG = {
  // 内容安全检查
  contentSecurity: {
    enableWebContentSanitization: validateConfig(
      (process.env.SECURITY_ENABLE_WEB_CONTENT_SANITIZATION || 'true') ===
        'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_WEB_CONTENT_SANITIZATION',
    ),
    enableSensitiveDataDetection: validateConfig(
      (process.env.SECURITY_ENABLE_SENSITIVE_DATA_DETECTION || 'true') ===
        'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_SENSITIVE_DATA_DETECTION',
    ),
    enableIntentValidation: validateConfig(
      (process.env.SECURITY_ENABLE_INTENT_VALIDATION || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_INTENT_VALIDATION',
    ),
  },

  // 危险操作防护
  dangerousOperations: {
    enableDangerousOperationCheck: validateConfig(
      (process.env.SECURITY_ENABLE_DANGEROUS_OPERATION_CHECK || 'true') ===
        'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_DANGEROUS_OPERATION_CHECK',
    ),
    requireConfirmation: validateConfig(
      (process.env.SECURITY_REQUIRE_DANGEROUS_OPERATION_CONFIRMATION ||
        'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_REQUIRE_DANGEROUS_OPERATION_CONFIRMATION',
    ),
    confirmationThreshold: validateConfig(
      parseFloat(
        process.env.SECURITY_DANGEROUS_OPERATION_CONFIRMATION_THRESHOLD ||
          '0.7',
      ),
      (v) => typeof v === 'number' && v >= 0 && v <= 1,
      0.7,
      'SECURITY_DANGEROUS_OPERATION_CONFIRMATION_THRESHOLD',
    ),
  },

  // 技能安全
  skillSecurity: {
    enableSkillVerification: validateConfig(
      (process.env.SECURITY_ENABLE_SKILL_VERIFICATION || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_SKILL_VERIFICATION',
    ),
    enableAutoUpdate: validateConfig(
      (process.env.SECURITY_ENABLE_SKILL_AUTO_UPDATE || 'false') === 'true',
      validateBoolean,
      false,
      'SECURITY_ENABLE_SKILL_AUTO_UPDATE',
    ),
    trustedSources: validateConfig(
      process.env.SECURITY_TRUSTED_SKILL_SOURCES ||
        'https://github.com/anthropics,https://gitlab.com',
      validateString,
      '',
      'SECURITY_TRUSTED_SKILL_SOURCES',
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  // 网络安全
  networkSecurity: {
    enableRateLimiting: validateConfig(
      (process.env.SECURITY_ENABLE_RATE_LIMITING || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_RATE_LIMITING',
    ),
    rateLimit: validateConfig(
      parseInt(process.env.SECURITY_RATE_LIMIT || '100', 10),
      (v) => validateInteger(v, 1, 1000),
      100,
      'SECURITY_RATE_LIMIT',
    ), // 每分钟请求数
    rateLimitWindow: validateConfig(
      parseInt(process.env.SECURITY_RATE_LIMIT_WINDOW || '60000', 10),
      (v) => validateInteger(v, 1000, 3600000),
      60000,
      'SECURITY_RATE_LIMIT_WINDOW',
    ), // 窗口大小（毫秒）
  },

  // 凭证安全
  credentialSecurity: {
    enableCredentialScan: validateConfig(
      (process.env.SECURITY_ENABLE_CREDENTIAL_SCAN || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_CREDENTIAL_SCAN',
    ),
    forbidPlaintextCredentials: validateConfig(
      (process.env.SECURITY_FORBID_PLAINTEXT_CREDENTIALS || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_FORBID_PLAINTEXT_CREDENTIALS',
    ),
    enableCredentialAudit: validateConfig(
      (process.env.SECURITY_ENABLE_CREDENTIAL_AUDIT || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_CREDENTIAL_AUDIT',
    ),
  },

  // 审计日志
  audit: {
    enableDetailedAudit: validateConfig(
      (process.env.SECURITY_ENABLE_DETAILED_AUDIT || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_DETAILED_AUDIT',
    ),
    auditLogRetentionDays: validateConfig(
      parseInt(process.env.SECURITY_AUDIT_LOG_RETENTION_DAYS || '90', 10),
      (v) => validateInteger(v, 1, 365),
      90,
      'SECURITY_AUDIT_LOG_RETENTION_DAYS',
    ),
  },
};

// ===== 协作系统配置 =====
export const COLLABORATION_CONFIG = {
  // 智能体间通信配置
  interAgentCommunication: {
    enabled: validateConfig(
      (process.env.COLLABORATION_ENABLE_INTER_AGENT_COMMUNICATION || 'true') ===
        'true',
      validateBoolean,
      true,
      'COLLABORATION_ENABLE_INTER_AGENT_COMMUNICATION',
    ),
    messageTimeout: validateConfig(
      parseInt(process.env.COLLABORATION_MESSAGE_TIMEOUT || '30000', 10),
      (v) => validateInteger(v, 1000, 300000),
      30000,
      'COLLABORATION_MESSAGE_TIMEOUT',
    ), // 消息超时（毫秒）
    maxMessageSize: validateConfig(
      parseInt(process.env.COLLABORATION_MAX_MESSAGE_SIZE || '1048576', 10),
      (v) => validateInteger(v, 1024, 10485760),
      1048576,
      'COLLABORATION_MAX_MESSAGE_SIZE',
    ), // 最大消息大小（字节）
  },

  // 协作任务配置
  collaborationTasks: {
    enabled: validateConfig(
      (process.env.COLLABORATION_ENABLE_COLLABORATION_TASKS || 'true') ===
        'true',
      validateBoolean,
      true,
      'COLLABORATION_ENABLE_COLLABORATION_TASKS',
    ),
    maxTeamSize: validateConfig(
      parseInt(process.env.COLLABORATION_MAX_TEAM_SIZE || '10', 10),
      (v) => validateInteger(v, 2, 50),
      10,
      'COLLABORATION_MAX_TEAM_SIZE',
    ), // 最大团队大小
    taskTimeout: validateConfig(
      parseInt(process.env.COLLABORATION_TASK_TIMEOUT || '1800000', 10),
      (v) => validateInteger(v, 60000, 3600000),
      1800000,
      'COLLABORATION_TASK_TIMEOUT',
    ), // 任务超时（毫秒）
  },

  // 团队协作配置
  teamCollaboration: {
    enabled: validateConfig(
      (process.env.COLLABORATION_ENABLE_TEAM_COLLABORATION || 'true') ===
        'true',
      validateBoolean,
      true,
      'COLLABORATION_ENABLE_TEAM_COLLABORATION',
    ),
    defaultCollaborationMode: validateConfig(
      process.env.COLLABORATION_DEFAULT_MODE || 'peer-to-peer',
      (v) => ['hierarchical', 'peer-to-peer', 'swarm'].includes(v),
      'peer-to-peer' as any,
      'COLLABORATION_DEFAULT_MODE',
    ),
    trustLevel: validateConfig(
      parseInt(process.env.COLLABORATION_TRUST_LEVEL || '5', 10),
      (v) => validateInteger(v, 1, 10),
      5,
      'COLLABORATION_TRUST_LEVEL',
    ), // 信任级别 (1-10)
  },
};

// ===== 进化系统配置 (符合 GEP 标准) =====

// 进化系统策略配置
export const EVOLUTION_CONFIG = {
  // 当前进化策略
  strategy: validateConfig(
    process.env.EVOLUTION_STRATEGY || 'balanced',
    (v) =>
      ['balanced', 'repair', 'optimize', 'innovate', 'repair-only'].includes(v),
    'balanced' as any,
    'EVOLUTION_STRATEGY',
  ),

  // 自动审核阈值
  autoApproveThreshold: validateConfig(
    parseFloat(process.env.EVOLUTION_AUTO_APPROVE_THRESHOLD || '0.9'),
    (v) => typeof v === 'number' && v >= 0 && v <= 1,
    0.9,
    'EVOLUTION_AUTO_APPROVE_THRESHOLD',
  ),

  // 是否需要用户终审
  requireUserReview: validateConfig(
    (process.env.EVOLUTION_REQUIRE_USER_REVIEW || 'false') === 'true',
    validateBoolean,
    false,
    'EVOLUTION_REQUIRE_USER_REVIEW',
  ),

  // 验证命令白名单
  allowedCommandPrefixes: [
    'node',
    'npm',
    'npx',
    'tsx',
    'vitest',
    'jest',
    'eslint',
  ],

  // 禁止的 shell 操作符
  forbiddenOperators: ['&&', '||', ';', '|', '>', '<', '`', '$('],

  // 信号去重阈值
  duplicateThreshold: {
    sameAuthor: 0.92,
    differentAuthor: 0.95,
  },

  // Gene → Capsule 晋升条件
  capsulePromotion: {
    minSuccessCount: 3,
    minSuccessStreak: 3,
    minConfidence: 0.5,
  },

  // GDI 自动晋升条件
  gdiPromotionThreshold: 25,

  // 生态系统指标快照间隔 (毫秒)
  metricsSnapshotInterval: 60000 * 60, // 1小时

  // 验证超时 (毫秒)
  validationTimeout: 60000 * 5, // 5分钟
};

// 验证命令安全
export function isCommandAllowed(command: string): boolean {
  const trimmedCommand = command.trim();

  // 检查白名单前缀
  const hasAllowedPrefix = EVOLUTION_CONFIG.allowedCommandPrefixes.some(
    (prefix) => trimmedCommand.startsWith(prefix),
  );
  if (!hasAllowedPrefix) return false;

  // 检查禁止的操作符
  const hasForbiddenOperator = EVOLUTION_CONFIG.forbiddenOperators.some((op) =>
    trimmedCommand.includes(op),
  );
  if (hasForbiddenOperator) return false;

  return true;
}
