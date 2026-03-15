export type PhaseAMetricDomain = 'runtime' | 'memory' | 'evolution';

export interface PhaseAMetricDefinition {
  key: string;
  domain: PhaseAMetricDomain;
  unit: string;
  direction: 'lower_better' | 'higher_better';
  description: string;
}

export interface PhaseACoreMetricTarget {
  key: string;
  threshold: number;
  target: 'pass' | 'warning';
}

export const PHASE_A_GUARDRAILS = {
  metricsDictionary: [
    {
      key: 'runtime.startup_latency_ms',
      domain: 'runtime',
      unit: 'ms',
      direction: 'lower_better',
      description: 'Runtime API and orchestrator startup latency',
    },
    {
      key: 'runtime.error_rate',
      domain: 'runtime',
      unit: 'ratio',
      direction: 'lower_better',
      description: 'Runtime API request error ratio',
    },
    {
      key: 'runtime.rollback_recovery_seconds',
      domain: 'runtime',
      unit: 'seconds',
      direction: 'lower_better',
      description: 'Elapsed time from rollback trigger to healthy state',
    },
    {
      key: 'memory.compression_gain_ratio',
      domain: 'memory',
      unit: 'ratio',
      direction: 'higher_better',
      description: 'Token compression gain after summarize and entropy filter',
    },
    {
      key: 'memory.retrieval_latency_ms',
      domain: 'memory',
      unit: 'ms',
      direction: 'lower_better',
      description: 'Average retrieval latency for memory search',
    },
    {
      key: 'memory.search_error_rate',
      domain: 'memory',
      unit: 'ratio',
      direction: 'lower_better',
      description: 'Memory search timeout and failure ratio',
    },
    {
      key: 'evolution.promotion_rate',
      domain: 'evolution',
      unit: 'ratio',
      direction: 'higher_better',
      description: 'Promotion ratio from submitted genes to approved genes',
    },
    {
      key: 'evolution.review_error_rate',
      domain: 'evolution',
      unit: 'ratio',
      direction: 'lower_better',
      description: 'Evolution review and pipeline failure ratio',
    },
    {
      key: 'evolution.shadow_win_rate',
      domain: 'evolution',
      unit: 'ratio',
      direction: 'higher_better',
      description: 'Shadow execution win ratio before promote',
    },
  ] satisfies PhaseAMetricDefinition[],
  coreMetricTargets: [
    {
      key: 'runtime.startup_latency_ms',
      threshold: 1500,
      target: 'pass',
    },
    {
      key: 'memory.compression_gain_ratio',
      threshold: 0.2,
      target: 'pass',
    },
    {
      key: 'runtime.error_rate',
      threshold: 0.02,
      target: 'pass',
    },
    {
      key: 'runtime.rollback_recovery_seconds',
      threshold: 120,
      target: 'pass',
    },
  ] satisfies PhaseACoreMetricTarget[],
  baselineSnapshotTemplate: {
    scope: 'phase_baseline',
    compareBy: 'phase',
    requiredFields: [
      'phase',
      'capturedAt',
      'window',
      'metrics',
      'alerts',
      'rollbackReadiness',
    ],
  },
  featureFlagPolicy: {
    namingPattern: 'NC_<DOMAIN>_<ABILITY>_ENABLED',
    defaultValueStrategy: 'false_for_high_risk',
    highRiskFlags: [
      'NC_MEMORY_RELEASE_CANARY_ENABLED',
      'NC_EVOLUTION_SHADOW_ENABLED',
      'NC_EVOLUTION_PROMOTE_ENABLED',
      'NC_RUNTIME_FALLBACK_ENABLED',
    ],
  },
  releaseStages: ['canary', 'shadow', 'promote', 'fallback'],
  circuitBreakerPolicy: {
    triggerRules: [
      'runtime.error_rate > 0.05 for 5m',
      'runtime.rollback_recovery_seconds > 180',
      'memory.search_error_rate > 0.08',
    ],
    humanTakeoverRules: [
      'two consecutive breaker events in 30m',
      'security related failure detected',
    ],
    autoFallbackRules: [
      'switch release mode to stable',
      'disable canary and shadow flags',
      'record rollback operation snapshot',
    ],
  },
  phaseGatePolicy: {
    dodRequired: ['contract_ready', 'verification_passed', 'rollback_proven'],
    blockingConditions: [
      'critical_test_failed',
      'core_metrics_below_threshold',
      'rollback_path_not_verified',
    ],
    noPassNoNextPhase: true,
  },
  changeRecordTemplate: ['目标', '范围', '风险', '验证', '回退'],
} as const;
