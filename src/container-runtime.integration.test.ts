import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';

import {
  ensureContainerRuntimeRunning,
  cleanupOrphans,
  CONTAINER_RUNTIME_BIN,
} from './container-runtime.js';

function hasRuntime(): boolean {
  try {
    execSync(`${CONTAINER_RUNTIME_BIN} info`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('container runtime integration', () => {
  it('probes runtime availability using real CLI', () => {
    if (hasRuntime()) {
      expect(() => ensureContainerRuntimeRunning()).not.toThrow();
      return;
    }
    expect(() => ensureContainerRuntimeRunning()).toThrow(
      'Container runtime is required but failed to start',
    );
  });

  it('runs orphan cleanup command path without crashing', () => {
    expect(() => cleanupOrphans()).not.toThrow();
  });
});
