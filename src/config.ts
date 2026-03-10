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
function validateInteger(value: string | number, min: number, max: number): boolean {
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max;
}

// 字符串验证
function validateString(value: string, minLength: number = 0, maxLength: number = 100): boolean {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength;
}

// 布尔值验证
function validateBoolean(value: any): boolean {
  return value === true || value === false || value === 'true' || value === 'false';
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
  (process.env.ASSISTANT_HAS_OWN_NUMBER || envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true',
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
