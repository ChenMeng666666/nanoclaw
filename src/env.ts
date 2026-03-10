import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Parse the .env file and return values for the requested keys.
 * Does NOT load anything into process.env — callers decide what to
 * do with the values. This keeps secrets out of the process environment
 * so they don't leak to child processes.
 */
export function readEnvFile(keys: string[]): Record<string, string> {
  const envFile = path.join(process.cwd(), '.env');
  let content: string;
  try {
    content = fs.readFileSync(envFile, 'utf-8');
  } catch (err) {
    logger.debug({ err }, '.env file not found, using defaults');
    return {};
  }

  const result: Record<string, string> = {};
  const wanted = new Set(keys);

  try {
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (!wanted.has(key)) continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) result[key] = value;
    }
  } catch (err) {
    logger.warn({ err }, 'Error parsing .env file, using defaults');
    return {};
  }

  // 验证读取到的配置
  const validResult: Record<string, string> = {};
  for (const [key, value] of Object.entries(result)) {
    if (validateEnvValue(key, value)) {
      validResult[key] = value;
    } else {
      logger.warn({ key, value }, 'Invalid .env value, skipping');
    }
  }

  return validResult;
}

/**
 * 验证环境变量值的基本格式
 */
function validateEnvValue(key: string, value: string): boolean {
  // 禁止空值
  if (!value || value.trim().length === 0) {
    return false;
  }

  // 基本的安全检查
  const invalidPatterns = [
    /;\s*rm\s+-rf/i,
    /;\s*curl\s+.*\|.*sh/i,
    /\$\(.*\)/,
    /`.*`/,
  ];

  return !invalidPatterns.some(pattern => pattern.test(value));
}
