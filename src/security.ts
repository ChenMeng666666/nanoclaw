/**
 * 安全工具模块
 * 提供防止原型链攻击、网页内容安全检查、敏感数据检测等安全功能
 */

import { logger } from './logger.js';

/**
 * 安全的对象创建，使用 Object.create(null) 防止原型链污染
 */
export function createSafeObject<T = Record<string, unknown>>(): T {
  return Object.create(null) as T;
}

/**
 * 安全的 JSON.parse，防止原型链攻击并提供错误处理
 * 过滤掉 __proto__, constructor, prototype 等危险属性
 * 如果解析失败或输入为空，返回指定的默认值
 */
export function safeJsonParse<T = unknown>(
  json: string | null | undefined,
  defaultValue: T = null as unknown as T,
): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        logger.warn({ key }, 'Blocked potentially dangerous property in JSON');
        return undefined;
      }
      return value;
    }) as T;
  } catch (error) {
    logger.warn(
      { error, json },
      'Failed to parse JSON, returning default value',
    );
    return defaultValue;
  }
}

/**
 * 安全地设置对象属性，防止原型链污染
 */
export function safeSetProperty(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
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
 * 网页内容安全检查 - 过滤隐藏指令和恶意内容
 */
export function sanitizeWebContent(html: string): string {
  let sanitized = html;

  // 移除 HTML 注释，防止隐藏指令
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');

  // 移除隐藏标签
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // 移除隐藏的 DOM 元素
  sanitized = sanitized.replace(
    /<[^>]*style\s*=\s*["'].*?display\s*:\s*none.*?["'][^>]*>[\s\S]*?<\/[^>]*>/gi,
    '',
  );

  // 转义潜在的恶意脚本
  sanitized = sanitized.replace(/javascript:/gi, 'javascript:');

  return sanitized;
}

/**
 * 敏感数据泄露检测
 */
export function detectSensitiveDataLeak(content: string): string[] {
  const issues: string[] = [];

  // API 密钥模式检测
  const apiKeyPatterns = [
    /(?:api|token|key|secret|password|passwd)\s*[=:]\s*["']?[a-zA-Z0-9_\\-]{16,}["']?/i,
    /[a-zA-Z0-9_\\-]{16,}/.test(content)
      ? (content.match(/[a-zA-Z0-9_\\-]{16,}/g) || []).filter(
          (token) => token.length >= 16 && !/^[\d]+$/.test(token),
        )
      : [],
  ]
    .flat()
    .filter(Boolean);

  for (const pattern of apiKeyPatterns) {
    if (typeof pattern === 'string') {
      // 简单的密钥检测
      if (
        pattern.length >= 16 &&
        pattern.length <= 64 &&
        !/^[\d]+$/.test(pattern)
      ) {
        issues.push(`Potential API key detected: ${pattern.slice(0, 8)}...`);
      }
    } else if (pattern.test(content)) {
      issues.push('Potential API key or token detected');
    }
  }

  // 密码模式检测
  const passwordPatterns = [
    /(?:password|passwd|pwd)\s*[=:]\s*["']?[^\s"']{6,}["']?/i,
  ];

  for (const pattern of passwordPatterns) {
    if (pattern.test(content)) {
      issues.push('Potential password detected');
    }
  }

  // 银行卡号、身份证号等敏感信息检测
  const sensitivePatterns = [
    /\b(?:\d{16,19}|\d{15}|\d{18}|\d{20})\b/, // 银行卡号或身份证号
    /(?:https?:\/\/)?(?:[^\s@]+@)?[^\s.]+\.(?:com|org|net|io)/g, // 邮箱或域名
  ];

  for (const pattern of sensitivePatterns) {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        if (match.length >= 8) {
          issues.push(
            `Potential sensitive information detected: ${match.slice(0, 8)}...`,
          );
        }
      });
    }
  }

  return issues;
}

/**
 * 提示词意图验证
 */
export function validatePromptIntent(prompt: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // 危险操作意图检测
  const dangerousIntents = [
    /(?:delete|remove|erase|destroy|wipe|clear)\s+(?:all|system|data|files)/i,
    /(?:format|reset|reinstall|reconfigure)\s+(?:system|disk)/i,
    /(?:download|upload|transfer|send)\s+(?:secret|password|key|token)/i,
    /(?:execute|run|start|launch)\s+(?:malware|virus|trojan|backdoor)/i,
  ];

  for (const pattern of dangerousIntents) {
    if (pattern.test(prompt)) {
      issues.push('Potential dangerous operation intent detected');
    }
  }

  // 隐藏指令检测
  const hiddenCommandPatterns = [
    /<!--.*?command.*?-->/i,
    /<script.*?eval.*?<\/script>/i,
    /<img.*?onerror.*?>/i,
  ];

  for (const pattern of hiddenCommandPatterns) {
    if (pattern.test(prompt)) {
      issues.push('Potential hidden command detected');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * 验证用户输入是否包含潜在的恶意模式
 */
export function validateUserInput(input: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // 检查原型链攻击模式
  const protoPatterns = [/__proto__/, /constructor\s*\[/, /prototype\s*\[/];

  for (const pattern of protoPatterns) {
    if (pattern.test(input)) {
      issues.push(`Potential prototype pollution detected: ${pattern}`);
    }
  }

  // 检查 SQL 注入模式
  const sqlPatterns = [
    /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i,
    /\b(UNION|JOIN|WHERE|FROM|GROUP|ORDER|HAVING| LIMIT| OFFSET)\b/i,
    /['";-]/, // 使用单个 -
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(input)) {
      issues.push(`Potential SQL injection detected: ${pattern}`);
    }
  }

  // 检查 XSS 攻击模式
  const xssPatterns = [
    /<script[^>]*>[\s\S]*?<\/script>/i,
    /on\w+="[^"]*"/i,
    /javascript:/i,
    /data:/i,
  ];

  for (const pattern of xssPatterns) {
    if (pattern.test(input)) {
      issues.push(`Potential XSS attack detected: ${pattern}`);
    }
  }

  // 检查路径遍历模式
  const pathPatterns = [/\.\.\//, /\.\.\\/, /\/\.\.\//, /\\\.\.\\/];

  for (const pattern of pathPatterns) {
    if (pattern.test(input)) {
      issues.push(`Potential path traversal detected: ${pattern}`);
    }
  }

  // 检查敏感数据泄露
  const sensitiveIssues = detectSensitiveDataLeak(input);
  issues.push(...sensitiveIssues);

  // 检查意图验证
  const intentIssues = validatePromptIntent(input).issues;
  issues.push(...intentIssues);

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * 危险操作检测
 */
export function isDangerousOperation(command: string): boolean {
  const dangerousPatterns = [
    /\b(rm|rmdir|unlink|delete|remove|erase|truncate)\b/i,
    /\b(drop|alter|truncate|delete)\s+(?:table|database|index)\b/i,
    /\b(format|mkfs|fdisk|parted)\b/i,
    /\b(chmod|chown|chgrp)\s+[0-7]{3,4}\b/i,
    /\b(exec|eval|system|spawn|fork)\b/i,
    /\b(wget|curl|fetch|download)\b/i,
    /\b(ping|nc|netcat|telnet)\b/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(command));
}

/**
 * 安全的配置加载，验证并清理配置对象
 */
export function safeLoadConfig<T>(
  rawConfig: unknown,
  validator: (config: unknown) => config is T,
): T | null {
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
