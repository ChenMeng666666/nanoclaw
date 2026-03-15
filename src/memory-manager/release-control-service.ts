import crypto from 'crypto';
import {
  createOperationSnapshot,
  getOperationSnapshotByOperationId,
  updateOperationSnapshot,
} from '../db.js';
import { MEMORY_CONFIG } from '../config.js';
import { clamp01 } from './ranking-utils.js';
import {
  type MemoryReleaseControl,
  type UpdateReleaseControlInput,
  type RetrievalRolloutConfig,
  type MigrationRuleConfig,
  type RolloutMode,
  safeParseReleaseControl,
} from './release-control-types.js';

export class ReleaseControlService {
  private releaseControl: MemoryReleaseControl =
    this.createDefaultReleaseControl();

  getReleaseControl(): MemoryReleaseControl {
    return structuredClone(this.releaseControl);
  }

  updateReleaseControl(
    input: UpdateReleaseControlInput,
    operator: string,
    reason?: string,
  ): { operationId: string; control: MemoryReleaseControl } {
    const beforeState = this.getReleaseControl();
    const nextState = this.mergeReleaseControl(this.releaseControl, input);
    this.releaseControl = nextState;
    const operationId = crypto.randomUUID();
    createOperationSnapshot({
      operationId,
      operationType: 'memory_release_control_update',
      beforeState: JSON.stringify(beforeState),
      afterState: JSON.stringify(nextState),
      timestamp: new Date().toISOString(),
      status: 'applied',
      description: `${operator}:${reason || 'update'}`,
    });
    return {
      operationId,
      control: this.getReleaseControl(),
    };
  }

  rollbackReleaseControl(
    operationId: string,
    operator: string,
  ): MemoryReleaseControl {
    const snapshot = getOperationSnapshotByOperationId(operationId);
    if (!snapshot) {
      throw new Error(`Operation snapshot not found: ${operationId}`);
    }
    if (!snapshot.beforeState) {
      throw new Error(`Operation snapshot has no before state: ${operationId}`);
    }
    const parsed = safeParseReleaseControl(snapshot.beforeState);
    if (!parsed) {
      throw new Error(
        `Operation snapshot before state invalid: ${operationId}`,
      );
    }
    this.releaseControl = parsed;
    updateOperationSnapshot(operationId, {
      status: 'rolled_back',
      description:
        `${snapshot.description || ''};rollback_by:${operator}`.slice(0, 512),
    });
    return this.getReleaseControl();
  }

  resolveRetrievalRollout(
    agentFolder: string,
    userJid?: string,
  ): RetrievalRolloutConfig {
    const retrieval = this.releaseControl.retrieval;
    const inCanary = this.isCanaryActive(
      retrieval.mode,
      retrieval.canaryEnabled,
      retrieval.canaryPercentage,
      `${agentFolder}:${userJid || 'global'}:retrieval`,
    );
    if (!inCanary) {
      return {
        ...retrieval,
        vectorSearchMinScore: MEMORY_CONFIG.retrieval.vectorSearchMinScore,
        rerankWeights: { ...MEMORY_CONFIG.retrieval.rerankWeights },
      };
    }
    return retrieval;
  }

  resolveMigrationRules(
    agentFolder: string,
    userJid?: string,
  ): MigrationRuleConfig {
    const base: MigrationRuleConfig = {
      l1ToL2MinAccessCount: MEMORY_CONFIG.migration.l1ToL2MinAccessCount,
      l1ToL2MinIdleDays: MEMORY_CONFIG.migration.l1ToL2MinIdleDays,
      l2ToL3MinIdleDays: MEMORY_CONFIG.migration.l2ToL3MinIdleDays,
      l2ToL3MinImportance: MEMORY_CONFIG.migration.l2ToL3MinImportance,
      migratedContentPrefix: MEMORY_CONFIG.migration.migratedContentPrefix,
    };
    const migration = this.releaseControl.migration;
    const inCanary = this.isCanaryActive(
      migration.mode,
      migration.canaryEnabled,
      migration.canaryPercentage,
      `${agentFolder}:${userJid || 'global'}:migration`,
    );
    if (!inCanary) {
      return base;
    }
    return {
      ...base,
      ...migration.canaryRules,
    };
  }

  private createDefaultReleaseControl(): MemoryReleaseControl {
    return {
      retrieval: {
        mode: 'stable',
        canaryEnabled: false,
        canaryPercentage: 0,
        vectorSearchMinScore: MEMORY_CONFIG.retrieval.vectorSearchMinScore,
        lowConfidenceThreshold: 0.4,
        rerankWeights: { ...MEMORY_CONFIG.retrieval.rerankWeights },
      },
      migration: {
        mode: 'stable',
        canaryEnabled: false,
        canaryPercentage: 0,
        canaryRules: {},
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private mergeReleaseControl(
    current: MemoryReleaseControl,
    patch: UpdateReleaseControlInput,
  ): MemoryReleaseControl {
    const next: MemoryReleaseControl = {
      retrieval: {
        ...current.retrieval,
        ...(patch.retrieval || {}),
        rerankWeights: {
          ...current.retrieval.rerankWeights,
          ...(patch.retrieval?.rerankWeights || {}),
        },
      },
      migration: {
        ...current.migration,
        ...(patch.migration || {}),
        canaryRules: {
          ...current.migration.canaryRules,
          ...(patch.migration?.canaryRules || {}),
        },
      },
      updatedAt: new Date().toISOString(),
    };
    next.retrieval.canaryPercentage = this.clampPercentage(
      next.retrieval.canaryPercentage,
    );
    next.migration.canaryPercentage = this.clampPercentage(
      next.migration.canaryPercentage,
    );
    next.retrieval.lowConfidenceThreshold = clamp01(
      next.retrieval.lowConfidenceThreshold,
    );
    return next;
  }

  private clampPercentage(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private isCanaryActive(
    mode: RolloutMode,
    canaryEnabled: boolean,
    canaryPercentage: number,
    bucketKey: string,
  ): boolean {
    if (mode === 'stable') {
      return false;
    }
    if (mode === 'canary') {
      return true;
    }
    if (!canaryEnabled || canaryPercentage <= 0) {
      return false;
    }
    return this.computeBucket(bucketKey) < canaryPercentage;
  }

  private computeBucket(seed: string): number {
    const digest = crypto.createHash('sha256').update(seed).digest('hex');
    const value = parseInt(digest.slice(0, 8), 16);
    return value % 100;
  }
}
