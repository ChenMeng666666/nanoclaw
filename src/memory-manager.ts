import {
  MemoryApplicationService,
  memoryApplicationService,
  generateEmbedding,
  type MemoryDashboardMetrics,
  type MemoryMetadataInput,
  type MemoryReleaseControl,
  type MemorySearchExplanation,
  type MemorySearchHit,
  type UpdateReleaseControlInput,
} from './contexts/memory/application/memory-application-service.js';

export type {
  MemorySearchHit,
  MemorySearchExplanation,
  MemoryDashboardMetrics,
  MemoryReleaseControl,
  MemoryMetadataInput,
  UpdateReleaseControlInput,
};
export { generateEmbedding };

export class MemoryManager extends MemoryApplicationService {}

export const memoryManager = memoryApplicationService as MemoryManager;
