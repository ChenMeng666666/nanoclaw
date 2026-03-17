import type { Memory } from '../../../types/agent-memory.js';
import type { MemoryMetadataInput } from '../../../memory-manager/memory-types.js';
import {
  calculateQualityScore,
  calculateImportance,
} from '../../../memory-manager/ranking-utils.js';
import {
  findLifecycleMergeTarget,
  mergeTags,
  mergeLifecycleContent,
} from '../../../memory-manager/lifecycle-governance.js';

export interface MemoryDomainRules {
  calculateQualityScore: typeof calculateQualityScore;
  calculateImportance: typeof calculateImportance;
  findLifecycleMergeTarget: (
    agentFolder: string,
    incomingContent: string,
    incomingEmbedding: number[],
    level: 'L1' | 'L2' | 'L3',
    userJid?: string,
    metadata?: MemoryMetadataInput,
  ) => (Memory & { isConflict: boolean }) | null;
  mergeTags: typeof mergeTags;
  mergeLifecycleContent: typeof mergeLifecycleContent;
}

export const memoryDomainRules: MemoryDomainRules = {
  calculateQualityScore,
  calculateImportance,
  findLifecycleMergeTarget,
  mergeTags,
  mergeLifecycleContent,
};
