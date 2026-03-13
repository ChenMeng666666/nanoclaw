/**
 * 安全告警模块
 * 负责处理安全事件的检测、记录和通知
 */

import { logger } from './logger.js';

/**
 * 安全事件类型
 */
export type SecurityEventType =
  | 'prompt_injection'
  | 'sensitive_data_leak'
  | 'dangerous_operation'
  | 'unauthorized_access'
  | 'skill_verification_failed'
  | 'rate_limit_exceeded'
  | 'credential_scan'
  | 'network_security'
  | 'vulnerability_detected';

/**
 * 安全事件级别
 */
export type SecurityEventLevel = 'info' | 'warning' | 'error' | 'critical';

/**
 * 安全事件接口
 */
export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: SecurityEventType;
  level: SecurityEventLevel;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  handled: boolean;
  handledAt?: string;
}

export interface MarkHandledResult {
  success: boolean;
  eventId: string;
  handler?: string;
  action?: string;
  evidence?: string;
  persisted: boolean;
}

/**
 * 安全告警管理器
 */
class SecurityAlertManager {
  private events: SecurityEvent[] = [];
  private maxEvents: number = 1000;
  private listeners: Map<
    SecurityEventType,
    Array<(event: SecurityEvent) => void>
  > = new Map();

  /**
   * 记录安全事件
   */
  logEvent(
    type: SecurityEventType,
    level: SecurityEventLevel,
    source: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): SecurityEvent {
    const event: SecurityEvent = {
      id: generateEventId(),
      timestamp: new Date().toISOString(),
      type,
      level,
      source,
      message,
      metadata,
      handled: false,
    };

    // 记录事件
    this.events.push(event);

    // 限制事件数量
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // 日志记录
    const logMethod =
      level === 'critical' || level === 'error'
        ? 'error'
        : level === 'warning'
          ? 'warn'
          : 'info';
    logger[logMethod]({ event }, `Security event: ${message}`);

    // 通知监听器
    this.notifyListeners(event);

    return event;
  }

  /**
   * 添加事件监听器
   */
  addListener(
    type: SecurityEventType,
    callback: (event: SecurityEvent) => void,
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  /**
   * 移除事件监听器
   */
  removeListener(
    type: SecurityEventType,
    callback: (event: SecurityEvent) => void,
  ): void {
    if (this.listeners.has(type)) {
      const callbacks = this.listeners.get(type)!;
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(event: SecurityEvent): void {
    // 通知特定类型的监听器
    if (this.listeners.has(event.type)) {
      this.listeners.get(event.type)!.forEach((callback) => {
        try {
          callback(event);
        } catch (err) {
          logger.error({ err, event }, 'Error in security event listener');
        }
      });
    }
  }

  /**
   * 获取所有未处理的事件
   */
  getUnhandledEvents(): SecurityEvent[] {
    return this.events.filter((event) => !event.handled);
  }

  /**
   * 获取特定类型的事件
   */
  getEventsByType(type: SecurityEventType): SecurityEvent[] {
    return this.events.filter((event) => event.type === type);
  }

  /**
   * 获取特定级别的事件
   */
  getEventsByLevel(level: SecurityEventLevel): SecurityEvent[] {
    return this.events.filter((event) => event.level === level);
  }

  /**
   * 标记事件为已处理
   */
  markEventAsHandled(
    eventId: string,
    context?: {
      handler?: string;
      action?: string;
      evidence?: string;
    },
  ): boolean {
    return this.markEventAsHandledDetailed(eventId, context).success;
  }

  markEventAsHandledDetailed(
    eventId: string,
    context?: {
      handler?: string;
      action?: string;
      evidence?: string;
    },
  ): MarkHandledResult {
    const event = this.events.find((e) => e.id === eventId);
    if (event) {
      event.handled = true;
      event.handledAt = new Date().toISOString();
      event.metadata = {
        ...event.metadata,
        handledBy: context?.handler ?? 'system',
        handledAction: context?.action ?? 'mark_handled',
        handledEvidence: context?.evidence ?? 'n/a',
      };
      return {
        success: true,
        eventId,
        handler: context?.handler ?? 'system',
        action: context?.action ?? 'mark_handled',
        evidence: context?.evidence ?? 'n/a',
        persisted: true,
      };
    }
    return {
      success: false,
      eventId,
      persisted: false,
    };
  }

  /**
   * 获取事件统计
   */
  getStatistics(): {
    total: number;
    unhandled: number;
    byType: Record<SecurityEventType, number>;
    byLevel: Record<SecurityEventLevel, number>;
  } {
    const stats = {
      total: this.events.length,
      unhandled: this.getUnhandledEvents().length,
      byType: {} as Record<SecurityEventType, number>,
      byLevel: {} as Record<SecurityEventLevel, number>,
    };

    // 初始化类型计数
    const eventTypes: SecurityEventType[] = [
      'prompt_injection',
      'sensitive_data_leak',
      'dangerous_operation',
      'unauthorized_access',
      'skill_verification_failed',
      'rate_limit_exceeded',
      'credential_scan',
      'network_security',
      'vulnerability_detected',
    ];
    eventTypes.forEach((type) => {
      stats.byType[type] = 0;
    });

    // 初始化级别计数
    const eventLevels: SecurityEventLevel[] = [
      'info',
      'warning',
      'error',
      'critical',
    ];
    eventLevels.forEach((level) => {
      stats.byLevel[level] = 0;
    });

    // 统计
    this.events.forEach((event) => {
      stats.byType[event.type]++;
      stats.byLevel[event.level]++;
    });

    return stats;
  }

  /**
   * 清理旧事件
   */
  cleanupOldEvents(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    this.events = this.events.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime();
      return now - eventTime <= maxAgeMs;
    });
  }
}

/**
 * 生成事件ID
 */
function generateEventId(): string {
  return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 导出单例实例
export const securityAlertManager = new SecurityAlertManager();

// 便捷方法
export function logSecurityEvent(
  type: SecurityEventType,
  level: SecurityEventLevel,
  source: string,
  message: string,
  metadata?: Record<string, unknown>,
): SecurityEvent {
  return securityAlertManager.logEvent(type, level, source, message, metadata);
}

export default securityAlertManager;
