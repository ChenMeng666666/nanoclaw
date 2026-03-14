import os from 'os';
import path from 'path';

import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import {
  escapeRegex,
  validateBoolean,
  validateConfig,
  validateInteger,
  validatePath,
  validateString,
} from './validators.js';

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

const PROJECT_ROOT = process.cwd();
const HOME_DIR = validateConfig(
  process.env.HOME || os.homedir(),
  validatePath,
  os.homedir(),
  'HOME_DIR',
);

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
);

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
);

export const MAX_CONCURRENT_CONTAINERS = validateConfig(
  Math.max(1, parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5),
  (v) => validateInteger(v, 1, 20),
  5,
  'MAX_CONCURRENT_CONTAINERS',
);

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

export const TIMEZONE = validateConfig(
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
  (v) => validateString(v, 1, 100),
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'TIMEZONE',
);

export const RUNTIME_API_CONFIG = {
  port: parseInt(process.env.RUNTIME_API_PORT || '3456', 10),
  fallbackPorts: [3457, 3458, 3459],
  portCheckTimeout: 5000,
  trustProxy: validateConfig(
    (process.env.RUNTIME_API_TRUST_PROXY || 'false') === 'true',
    validateBoolean,
    false,
    'RUNTIME_API_TRUST_PROXY',
  ),
};

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
