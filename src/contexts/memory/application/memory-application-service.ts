import {
  memoryManager,
  MemoryManager,
  generateEmbedding,
  type MemoryDashboardMetrics,
  type MemoryMetadataInput,
  type MemoryReleaseControl,
  type MemorySearchExplanation,
  type MemorySearchHit,
} from '../../../memory-manager.js';

export {
  MemoryManager,
  generateEmbedding,
  type MemoryDashboardMetrics,
  type MemoryMetadataInput,
  type MemoryReleaseControl,
  type MemorySearchExplanation,
  type MemorySearchHit,
};

export const memoryApplicationService = memoryManager;
