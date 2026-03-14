/**
 * Container Runner for NanoClaw
 * Spawns agent execution in containers and handles IPC
 *
 * Refactored in Phase 7 to delegate to infrastructure modules.
 */

export {
  ContainerInput,
  ContainerOutput,
  AvailableGroup,
} from './domain/container/types.js';

export { runContainerAgent } from './infrastructure/container/container-process-runner.js';
export {
  writeTasksSnapshot,
  writeGroupsSnapshot,
} from './infrastructure/ipc/snapshot-writer.js';
