import fs from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

import { runContainerAgent, type ContainerInput } from './container-runner.js';
import { readEnvFile } from './env.js';
import type { RegisteredGroup } from './types/core-runtime.js';

function hasDocker(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasApiCredential(): boolean {
  const envFileSecrets = readEnvFile([
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
  ]);
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.CLAUDE_CODE_OAUTH_TOKEN ||
    envFileSecrets.CLAUDE_CODE_OAUTH_TOKEN ||
    envFileSecrets.ANTHROPIC_API_KEY ||
    envFileSecrets.ANTHROPIC_AUTH_TOKEN,
  );
}

describe('container runner integration', () => {
  it('runs real container flow and receives streamed output', async () => {
    if (!hasDocker() || !hasApiCredential()) {
      expect(true).toBe(true);
      return;
    }

    const runId = Date.now();
    const testGroup: RegisteredGroup = {
      name: 'Test',
      folder: `test-${runId}`,
      trigger: '@Andy',
      added_at: new Date().toISOString(),
    };

    let streamedOutputCount = 0;
    const input: ContainerInput = {
      prompt: '请回复: E2E_CONTAINER_OK',
      groupFolder: testGroup.folder,
      chatJid: `test:container-e2e:${runId}`,
      isMain: false,
    };

    const result = await runContainerAgent(
      testGroup,
      input,
      () => {},
      async (output) => {
        if (output.status === 'success' && output.result !== null) {
          streamedOutputCount += 1;
          const ipcDir = join(
            process.cwd(),
            'data',
            'ipc',
            testGroup.folder,
            'input',
          );
          fs.mkdirSync(ipcDir, { recursive: true });
          fs.writeFileSync(join(ipcDir, '_close'), '');
        }
      },
    );

    expect(result.status).toBe('success');
    expect(streamedOutputCount).toBeGreaterThan(0);
  }, 300000);
});
