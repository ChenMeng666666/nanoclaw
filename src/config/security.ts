import {
  validateBoolean,
  validateConfig,
  validateInteger,
  validateString,
} from './validators.js';

export const SECURITY_CONFIG = {
  contentSecurity: {
    enableWebContentSanitization: validateConfig(
      (process.env.SECURITY_ENABLE_WEB_CONTENT_SANITIZATION || 'true') ===
        'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_WEB_CONTENT_SANITIZATION',
    ),
    enableSensitiveDataDetection: validateConfig(
      (process.env.SECURITY_ENABLE_SENSITIVE_DATA_DETECTION || 'true') ===
        'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_SENSITIVE_DATA_DETECTION',
    ),
    enableIntentValidation: validateConfig(
      (process.env.SECURITY_ENABLE_INTENT_VALIDATION || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_INTENT_VALIDATION',
    ),
  },
  dangerousOperations: {
    enableDangerousOperationCheck: validateConfig(
      (process.env.SECURITY_ENABLE_DANGEROUS_OPERATION_CHECK || 'true') ===
        'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_DANGEROUS_OPERATION_CHECK',
    ),
    requireConfirmation: validateConfig(
      (process.env.SECURITY_REQUIRE_DANGEROUS_OPERATION_CONFIRMATION ||
        'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_REQUIRE_DANGEROUS_OPERATION_CONFIRMATION',
    ),
    confirmationThreshold: validateConfig(
      parseFloat(
        process.env.SECURITY_DANGEROUS_OPERATION_CONFIRMATION_THRESHOLD ||
          '0.7',
      ),
      (v) => typeof v === 'number' && v >= 0 && v <= 1,
      0.7,
      'SECURITY_DANGEROUS_OPERATION_CONFIRMATION_THRESHOLD',
    ),
  },
  skillSecurity: {
    enableSkillVerification: validateConfig(
      (process.env.SECURITY_ENABLE_SKILL_VERIFICATION || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_SKILL_VERIFICATION',
    ),
    enableAutoUpdate: validateConfig(
      (process.env.SECURITY_ENABLE_SKILL_AUTO_UPDATE || 'false') === 'true',
      validateBoolean,
      false,
      'SECURITY_ENABLE_SKILL_AUTO_UPDATE',
    ),
    trustedSources: validateConfig(
      process.env.SECURITY_TRUSTED_SKILL_SOURCES ||
        'https://github.com/anthropics,https://gitlab.com',
      validateString,
      '',
      'SECURITY_TRUSTED_SKILL_SOURCES',
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  networkSecurity: {
    enableRateLimiting: validateConfig(
      (process.env.SECURITY_ENABLE_RATE_LIMITING || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_RATE_LIMITING',
    ),
    rateLimit: validateConfig(
      parseInt(process.env.SECURITY_RATE_LIMIT || '100', 10),
      (v) => validateInteger(v, 1, 1000),
      100,
      'SECURITY_RATE_LIMIT',
    ),
    rateLimitWindow: validateConfig(
      parseInt(process.env.SECURITY_RATE_LIMIT_WINDOW || '60000', 10),
      (v) => validateInteger(v, 1000, 3600000),
      60000,
      'SECURITY_RATE_LIMIT_WINDOW',
    ),
  },
  credentialSecurity: {
    enableCredentialScan: validateConfig(
      (process.env.SECURITY_ENABLE_CREDENTIAL_SCAN || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_CREDENTIAL_SCAN',
    ),
    forbidPlaintextCredentials: validateConfig(
      (process.env.SECURITY_FORBID_PLAINTEXT_CREDENTIALS || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_FORBID_PLAINTEXT_CREDENTIALS',
    ),
    enableCredentialAudit: validateConfig(
      (process.env.SECURITY_ENABLE_CREDENTIAL_AUDIT || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_CREDENTIAL_AUDIT',
    ),
  },
  audit: {
    enableDetailedAudit: validateConfig(
      (process.env.SECURITY_ENABLE_DETAILED_AUDIT || 'true') === 'true',
      validateBoolean,
      true,
      'SECURITY_ENABLE_DETAILED_AUDIT',
    ),
    auditLogRetentionDays: validateConfig(
      parseInt(process.env.SECURITY_AUDIT_LOG_RETENTION_DAYS || '90', 10),
      (v) => validateInteger(v, 1, 365),
      90,
      'SECURITY_AUDIT_LOG_RETENTION_DAYS',
    ),
  },
};
