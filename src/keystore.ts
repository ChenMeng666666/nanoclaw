/**
 * 密钥存储模块
 * 使用系统 keychain 加密存储敏感配置（如 Anthropic API Token）
 * 带加密文件 fallback 机制
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type * as keytarType from 'keytar';

import { logger } from './logger.js';
import { logCredentialAccess } from './keystore-audit.js';

const SERVICE_NAME = 'nanoclaw';
const USE_KEYTAR = process.env.USE_KEYTAR !== 'false';

// 尝试动态导入 keytar（可选依赖）
let keytar: typeof keytarType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  keytar = require('keytar');
} catch {
  logger.warn('keytar not available, using encrypted file fallback');
}

/**
 * 存储敏感配置
 * @param agentId 智能体 ID
 * @param key 密钥名称（如 'anthropic_token', 'anthropic_url'）
 * @param value 密钥值
 */
export async function storeSecret(
  agentId: string,
  key: string,
  value: string,
): Promise<void> {
  let success = false;
  let error: string | undefined;

  try {
    if (USE_KEYTAR && keytar) {
      try {
        await keytar.setPassword(`${SERVICE_NAME}-${agentId}`, key, value);
        logger.debug({ agentId, key }, 'Secret stored in keychain');
        success = true;
      } catch (err) {
        logger.warn(
          {
            agentId,
            key,
            err: err instanceof Error ? err.message : String(err),
          },
          'Keytar failed, falling back to encrypted file',
        );
        error = err instanceof Error ? err.message : String(err);
      }
    }

    if (!success) {
      // Fallback: 使用 crypto 加密存储到文件
      await storeEncryptedFile(agentId, key, value);
      success = true;
      error = undefined;
    }
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    logCredentialAccess(agentId, key, 'write', success, error);
  }
}

/**
 * 获取敏感配置
 * @param agentId 智能体 ID
 * @param key 密钥名称
 * @returns 密钥值，不存在则返回 null
 */
export async function getSecret(
  agentId: string,
  key: string,
): Promise<string | null> {
  let success = false;
  let error: string | undefined;
  let value: string | null = null;

  try {
    if (USE_KEYTAR && keytar) {
      try {
        value = await keytar.getPassword(`${SERVICE_NAME}-${agentId}`, key);
        if (value) {
          logger.debug({ agentId, key }, 'Secret retrieved from keychain');
          success = true;
        }
      } catch (err) {
        logger.warn(
          {
            agentId,
            key,
            err: err instanceof Error ? err.message : String(err),
          },
          'Keytar failed, trying encrypted file fallback',
        );
        error = err instanceof Error ? err.message : String(err);
      }
    }

    if (!success) {
      // Fallback: 从加密文件读取
      value = await getEncryptedFile(agentId, key);
      success = true;
      error = undefined;
    }

    return value;
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
    logger.error({ agentId, key, err: error }, 'Failed to get secret');
    return null;
  } finally {
    logCredentialAccess(agentId, key, 'read', success, error);
  }
}

/**
 * 删除敏感配置
 * @param agentId 智能体 ID
 * @param key 密钥名称
 */
export async function deleteSecret(
  agentId: string,
  key: string,
): Promise<void> {
  let success = false;
  let error: string | undefined;

  try {
    if (USE_KEYTAR && keytar) {
      try {
        await keytar.deletePassword(`${SERVICE_NAME}-${agentId}`, key);
        logger.debug({ agentId, key }, 'Secret deleted from keychain');
        success = true;
      } catch (err) {
        logger.warn(
          {
            agentId,
            key,
            err: err instanceof Error ? err.message : String(err),
          },
          'Keytar failed, trying encrypted file fallback',
        );
        error = err instanceof Error ? err.message : String(err);
      }
    }

    if (!success) {
      // Fallback: 删除加密文件
      await deleteEncryptedFile(agentId, key);
      success = true;
      error = undefined;
    }
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    logCredentialAccess(agentId, key, 'delete', success, error);
  }
}

/**
 * 列出所有存储的密钥
 * @param agentId 智能体 ID
 * @returns 密钥名称列表
 */
export async function listSecrets(agentId: string): Promise<string[]> {
  let success = false;
  let error: string | undefined;
  let secrets: string[] = [];

  try {
    if (USE_KEYTAR && keytar) {
      try {
        const passwords = await keytar.findCredentials(
          `${SERVICE_NAME}-${agentId}`,
        );
        secrets = passwords.map((p) => p.account);
        success = true;
      } catch (err) {
        logger.warn(
          { agentId, err: err instanceof Error ? err.message : String(err) },
          'Keytar failed, listing encrypted files instead',
        );
        error = err instanceof Error ? err.message : String(err);
      }
    }

    if (!success) {
      // Fallback: 列出加密文件
      secrets = listEncryptedFiles(agentId);
      success = true;
      error = undefined;
    }

    return secrets;
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
    logger.error({ agentId, err: error }, 'Failed to list secrets');
    return [];
  } finally {
    logCredentialAccess(agentId, 'all', 'list', success, error);
  }
}

// ===== 加密文件 Fallback 实现 =====

const ENCRYPTION_KEY = process.env.NANOCLAW_ENCRYPTION_KEY;

function getSecretsDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.config', 'nanoclaw', 'secrets');
}

function getSecretFilePath(agentId: string, key: string): string {
  const safeAgentId = agentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getSecretsDir(), `${safeAgentId}-${safeKey}.enc`);
}

async function storeEncryptedFile(
  agentId: string,
  key: string,
  value: string,
): Promise<void> {
  if (!ENCRYPTION_KEY) {
    throw new Error(
      'NANOCLAW_ENCRYPTION_KEY required for file-based secret storage. ' +
        'Set it with: export NANOCLAW_ENCRYPTION_KEY=$(openssl rand -hex 32)',
    );
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv,
  );
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const filePath = getSecretFilePath(agentId, key);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    filePath,
    JSON.stringify({ encrypted, authTag, iv: iv.toString('hex') }),
    { mode: 0o600 }, // 仅所有者可读写
  );

  logger.debug(
    { agentId, key, path: filePath },
    'Secret stored to encrypted file',
  );
}

async function getEncryptedFile(
  agentId: string,
  key: string,
): Promise<string | null> {
  const filePath = getSecretFilePath(agentId, key);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  if (!ENCRYPTION_KEY) {
    logger.error('NANOCLAW_ENCRYPTION_KEY not set, cannot decrypt secrets');
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const { encrypted, authTag, iv } = data;

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    logger.error(
      { agentId, key, err: err instanceof Error ? err.message : String(err) },
      'Failed to decrypt secret file',
    );
    return null;
  }
}

async function deleteEncryptedFile(
  agentId: string,
  key: string,
): Promise<void> {
  const filePath = getSecretFilePath(agentId, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.debug({ agentId, key }, 'Encrypted secret file deleted');
  }
}

function listEncryptedFiles(agentId: string): string[] {
  const secretsDir = getSecretsDir();
  if (!fs.existsSync(secretsDir)) {
    return [];
  }

  const safeAgentId = agentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = `${safeAgentId}-`;

  try {
    return fs
      .readdirSync(secretsDir)
      .filter((file) => file.startsWith(prefix) && file.endsWith('.enc'))
      .map((file) => file.replace(prefix, '').replace('.enc', ''));
  } catch {
    return [];
  }
}
