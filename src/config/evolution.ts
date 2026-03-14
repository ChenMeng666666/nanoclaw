import path from 'path';

import { validateBoolean, validateConfig } from './validators.js';

const EVOLUTION_STRATEGIES = [
  'balanced',
  'repair',
  'optimize',
  'innovate',
  'repair-only',
] as const;

export const EVOLUTION_CONFIG = {
  strategy: validateConfig(
    process.env.EVOLUTION_STRATEGY || 'balanced',
    (v) =>
      EVOLUTION_STRATEGIES.includes(v as (typeof EVOLUTION_STRATEGIES)[number]),
    'balanced' as const,
    'EVOLUTION_STRATEGY',
  ) as (typeof EVOLUTION_STRATEGIES)[number],
  autoApproveThreshold: validateConfig(
    parseFloat(process.env.EVOLUTION_AUTO_APPROVE_THRESHOLD || '0.9'),
    (v) => typeof v === 'number' && v >= 0 && v <= 1,
    0.9,
    'EVOLUTION_AUTO_APPROVE_THRESHOLD',
  ),
  requireUserReview: validateConfig(
    (process.env.EVOLUTION_REQUIRE_USER_REVIEW || 'false') === 'true',
    validateBoolean,
    false,
    'EVOLUTION_REQUIRE_USER_REVIEW',
  ),
  allowedCommandPrefixes: [
    'node',
    'npm',
    'npx',
    'tsx',
    'vitest',
    'jest',
    'eslint',
  ],
  forbiddenOperators: ['&&', '||', ';', '|', '>', '<', '`', '$('],
  duplicateThreshold: {
    sameAuthor: 0.92,
    differentAuthor: 0.95,
  },
  capsulePromotion: {
    minSuccessCount: 3,
    minSuccessStreak: 3,
    minConfidence: 0.5,
  },
  gdiPromotionThreshold: 25,
  metricsSnapshotInterval: 60000 * 60,
  validationTimeout: 60000 * 5,
};

export function isCommandAllowed(command: string): boolean {
  const trimmedCommand = command.trim();
  if (!trimmedCommand) return false;
  if (trimmedCommand.length > 300) return false;
  if (/[\u0000-\u001F]/.test(trimmedCommand)) return false;

  const hasForbiddenOperator = EVOLUTION_CONFIG.forbiddenOperators.some((op) =>
    trimmedCommand.includes(op),
  );
  if (hasForbiddenOperator) return false;

  const tokens = trimmedCommand.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const baseCommand = tokens[0];
  const hasAllowedPrefix =
    EVOLUTION_CONFIG.allowedCommandPrefixes.includes(baseCommand);
  if (!hasAllowedPrefix) return false;

  for (const token of tokens.slice(1)) {
    if (token.length > 120) return false;
    if (token.includes('..')) return false;
    if (path.isAbsolute(token)) return false;
    if (token.startsWith('~')) return false;
    if (token.includes('\\')) return false;
  }

  return true;
}
