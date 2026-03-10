/**
 * 安全工具模块
 * 提供防止原型链攻击等安全功能
 */

import { logger } from './logger.js';

/**
 * 安全的对象创建，使用 Object.create(null) 防止原型链污染
 */
export function createSafeObject<T = Record<string, unknown>>(): T {
  return Object.create(null) as T;
}

/**
 * 安全的 JSON.parse，防止原型链攻击
 * 过滤掉 __proto__, constructor, prototype 等危险属性
 */
export function safeJsonParse(json: string): unknown {
  return JSON.parse(json, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      logger.warn({ key }, 'Blocked potentially dangerous property in JSON');
      return undefined;
    }
    return value;
  });
}

/**
 * 安全地设置对象属性，防止原型链污染
 */
export function safeSetProperty(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    logger.warn({ key }, 'Blocked attempt to set dangerous property');
    return;
  }
  obj[key] = value;
}

/**
 * 安全地合并对象，防止原型链污染
 */
export function safeMergeObjects<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  for (const [key, value] of Object.entries(source)) {
    safeSetProperty(target, key, value);
  }
  return target;
}

/**
 * 深度清理对象，移除所有危险属性
 */
export function sanitizeObject<T = unknown>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject) as T;
  }

  const result = createSafeObject<Record<string, unknown>>();
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
      result[key] = sanitizeObject(value);
    } else {
      logger.warn({ key }, 'Removed dangerous property during sanitization');
    }
  }

  return result as T;
}

/**
 * 验证用户输入是否包含潜在的恶意模式
 */
export function validateUserInput(input: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // 检查原型链攻击模式
  const protoPatterns = [
    /__proto__/,
    /constructor\s*\[/,
    /prototype\s*\[/,
  ];

  for (const pattern of protoPatterns) {
    if (pattern.test(input)) {
      issues.push(`Potential prototype pollution detected: ${pattern}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * 安全的配置加载，验证并清理配置对象
 */
export function safeLoadConfig<T>(rawConfig: unknown, validator: (config: unknown) => config is T): T | null {
  try {
    const sanitized = sanitizeObject(rawConfig);
    if (validator(sanitized)) {
      return sanitized;
    }
    logger.warn('Config validation failed after sanitization');
    return null;
  } catch (err) {
    logger.error({ err }, 'Failed to safely load config');
    return null;
  }
}
