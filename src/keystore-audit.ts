/**
 * 凭证访问审计模块
 * 记录和管理敏感凭证的访问操作
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

/**
 * 凭证访问审计记录
 */
export interface CredentialAccessLog {
  id: number;
  timestamp: string;
  agentId: string;
  credentialKey: string;
  operation: 'read' | 'write' | 'delete' | 'list';
  success: boolean;
  error?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 审计日志管理器
 */
class KeystoreAuditManager {
  private logFile: string;
  private logs: CredentialAccessLog[] = [];
  private lastId: number = 0;

  constructor() {
    const auditDir = path.join(os.homedir(), '.config', 'nanoclaw', 'audit');
    this.logFile = path.join(auditDir, 'keystore-access.log.jsonl');

    // 确保审计目录存在
    if (!fs.existsSync(auditDir)) {
      fs.mkdirSync(auditDir, { recursive: true });
    }

    // 加载现有日志
    this.loadLogs();
  }

  /**
   * 加载日志文件
   */
  private loadLogs(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        this.logs = content
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line))
          .sort((a, b) => a.id - b.id);

        if (this.logs.length > 0) {
          this.lastId = this.logs[this.logs.length - 1].id;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to load keystore access audit log');
      this.logs = [];
    }
  }

  /**
   * 写入日志条目
   */
  logAccess(
    agentId: string,
    credentialKey: string,
    operation: 'read' | 'write' | 'delete' | 'list',
    success: boolean = true,
    error?: string,
    metadata?: Record<string, unknown>,
  ): CredentialAccessLog {
    const log: CredentialAccessLog = {
      id: ++this.lastId,
      timestamp: new Date().toISOString(),
      agentId,
      credentialKey,
      operation,
      success,
      error,
      ipAddress: this.getClientIp(),
      userAgent: this.getUserAgent(),
      metadata,
    };

    this.logs.push(log);

    // 写入到 JSONL 文件
    try {
      fs.appendFileSync(this.logFile, `${JSON.stringify(log)}\n`);
    } catch (err) {
      logger.error({ err, log }, 'Failed to write keystore access audit log');
    }

    logger.debug({ log }, 'Keystore access logged');

    return log;
  }

  /**
   * 获取客户端 IP 地址
   */
  private getClientIp(): string | undefined {
    // 在本地环境中，可能无法获取真实的客户端 IP
    return process.env.REMOTE_ADDR || '127.0.0.1';
  }

  /**
   * 获取用户代理信息
   */
  private getUserAgent(): string | undefined {
    return process.env.USER_AGENT;
  }

  /**
   * 查询审计日志
   */
  getLogs(query?: {
    agentId?: string;
    credentialKey?: string;
    operation?: 'read' | 'write' | 'delete' | 'list';
    success?: boolean;
    startTime?: Date;
    endTime?: Date;
  }): CredentialAccessLog[] {
    return this.logs.filter((log) => {
      if (query?.agentId && log.agentId !== query.agentId) {
        return false;
      }
      if (query?.credentialKey && log.credentialKey !== query.credentialKey) {
        return false;
      }
      if (query?.operation && log.operation !== query.operation) {
        return false;
      }
      if (
        typeof query?.success === 'boolean' &&
        log.success !== query.success
      ) {
        return false;
      }
      if (query?.startTime && new Date(log.timestamp) < query.startTime) {
        return false;
      }
      if (query?.endTime && new Date(log.timestamp) > query.endTime) {
        return false;
      }
      return true;
    });
  }

  /**
   * 获取访问统计
   */
  getStatistics(): {
    total: number;
    byOperation: Record<string, number>;
    bySuccess: Record<string, number>;
    byAgent: Record<string, number>;
  } {
    const stats = {
      total: 0,
      byOperation: { read: 0, write: 0, delete: 0, list: 0 },
      bySuccess: { success: 0, failed: 0 },
      byAgent: {} as Record<string, number>,
    };

    for (const log of this.logs) {
      stats.total++;
      stats.byOperation[log.operation]++;
      stats.bySuccess[log.success ? 'success' : 'failed']++;

      if (!stats.byAgent[log.agentId]) {
        stats.byAgent[log.agentId] = 0;
      }
      stats.byAgent[log.agentId]++;
    }

    return stats;
  }

  /**
   * 清理旧日志
   */
  cleanup(keepDays: number = 90): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    this.logs = this.logs.filter((log) => new Date(log.timestamp) > cutoffDate);

    // 重写日志文件
    try {
      fs.writeFileSync(
        this.logFile,
        this.logs.map((log) => JSON.stringify(log)).join('\n') + '\n',
      );
    } catch (err) {
      logger.error({ err }, 'Failed to cleanup keystore access audit log');
    }
  }
}

// 导出单例实例
export const keystoreAudit = new KeystoreAuditManager();

/**
 * 便捷方法
 */
export function logCredentialAccess(
  agentId: string,
  credentialKey: string,
  operation: 'read' | 'write' | 'delete' | 'list',
  success: boolean = true,
  error?: string,
  metadata?: Record<string, unknown>,
): CredentialAccessLog {
  return keystoreAudit.logAccess(
    agentId,
    credentialKey,
    operation,
    success,
    error,
    metadata,
  );
}
