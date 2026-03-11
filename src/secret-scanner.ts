/**
 * 凭证泄露检测模块
 * 检测代码、日志、文件中的敏感信息泄露
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * 扫描文件中的凭证信息
 */
export function scanFileForSecrets(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf8');
    return scanContentForSecrets(content, filePath);
  } catch (err) {
    logger.warn({ filePath, err: err instanceof Error ? err.message : String(err) }, 'Failed to scan file for secrets');
    return [];
  }
}

/**
 * 扫描字符串内容中的凭证信息
 */
export function scanContentForSecrets(content: string, source: string = 'unknown'): string[] {
  const issues: string[] = [];

  // API 密钥模式检测
  const apiKeyPatterns = [
    /(?:api|token|key|secret|password|passwd)\s*[=:]\s*["']?[a-zA-Z0-9_\\-]{16,}["']?/i,
    /[a-zA-Z0-9_\\-]{16,}/.test(content) ? (content.match(/[a-zA-Z0-9_\\-]{16,}/g) || []).filter(token =>
      token.length >= 16 && !/^[\d]+$/.test(token)
    ) : [],
  ].flat().filter(Boolean);

  for (const pattern of apiKeyPatterns) {
    if (typeof pattern === 'string') {
      // 简单的密钥检测
      if (pattern.length >= 16 && pattern.length <= 64 && !/^[\d]+$/.test(pattern)) {
        issues.push(`Potential API key detected in ${source}: ${pattern.slice(0, 8)}...`);
      }
    } else if (pattern.test(content)) {
      issues.push(`Potential API key or token detected in ${source}`);
    }
  }

  // 密码模式检测
  const passwordPatterns = [
    /(?:password|passwd|pwd)\s*[=:]\s*["']?[^\s"']{6,}["']?/i,
  ];

  for (const pattern of passwordPatterns) {
    if (pattern.test(content)) {
      issues.push(`Potential password detected in ${source}`);
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
      matches.forEach(match => {
        if (match.length >= 8) {
          issues.push(`Potential sensitive information detected in ${source}: ${match.slice(0, 8)}...`);
        }
      });
    }
  }

  return issues;
}

/**
 * 扫描目录中的凭证信息
 */
export function scanDirectoryForSecrets(dirPath: string, excludePatterns: string[] = []): string[] {
  const issues: string[] = [];

  if (!fs.existsSync(dirPath)) return issues;

  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);

    // 检查是否需要排除
    if (excludePatterns.some(pattern => fullPath.match(pattern))) {
      continue;
    }

    if (file.isDirectory()) {
      // 递归扫描子目录
      issues.push(...scanDirectoryForSecrets(fullPath, excludePatterns));
    } else {
      // 只扫描文本文件
      const textExtensions = ['.js', '.ts', '.json', '.md', '.txt', '.log', '.env', '.env.*'];
      const isTextFile = textExtensions.some(ext => fullPath.endsWith(ext));

      if (isTextFile) {
        issues.push(...scanFileForSecrets(fullPath));
      }
    }
  }

  return issues;
}

/**
 * 检查环境变量中的凭证信息
 */
export function scanEnvironmentVariables(): string[] {
  const issues: string[] = [];
  const sensitiveKeys = ['API', 'TOKEN', 'KEY', 'SECRET', 'PASSWORD', 'PASSWD', 'ACCESS'];

  for (const [key, value] of Object.entries(process.env)) {
    if (sensitiveKeys.some(sensitiveKey => key.toUpperCase().includes(sensitiveKey))) {
      const valueStr = String(value || '');
      if (valueStr.length >= 8 && !/^[\s]+$/.test(valueStr)) {
        issues.push(`Potential secret detected in environment variable: ${key}`);
      }
    }
  }

  return issues;
}
