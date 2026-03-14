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

export type SecurityEventLevel = 'info' | 'warning' | 'error' | 'critical';

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

export interface OperationSnapshot {
  id: number;
  operationId: string;
  operationType: string;
  groupFolder?: string;
  chatJid?: string;
  beforeState: string;
  afterState?: string;
  timestamp: string;
  status: 'pending' | 'applied' | 'rolled_back';
  description?: string;
}

export interface DangerousOperationCheckResult {
  isDangerous: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  suggestions?: string[];
  requiresConfirmation: boolean;
}

export interface ContentSecurityCheckResult {
  safe: boolean;
  issues: string[];
  sanitizedContent?: string;
  riskScore: number;
}

export interface SensitiveDataDetectionResult {
  detected: boolean;
  dataTypes: string[];
  locations: Array<{
    type: string;
    position: { start: number; end: number };
    preview: string;
  }>;
}

export interface CredentialAccessAuditLog {
  id: number;
  credentialType: string;
  agentId?: string;
  accessedAt: string;
  accessedBy: string;
  operation: 'read' | 'write' | 'delete';
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

export interface RateLimitRecord {
  key: string;
  count: number;
  resetTime: number;
}

export interface SkillVerificationResult {
  verified: boolean;
  signature?: string;
  signer?: string;
  timestamp?: string;
  issues?: string[];
  warnings?: string[];
}
