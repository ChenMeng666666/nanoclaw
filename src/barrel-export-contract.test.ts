import { describe, it, expect } from 'vitest';

function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

describe('barrel export contract', () => {
  it('shared/kernel export surface is stable', async () => {
    const module = (await import('./shared/kernel/index.js')) as Record<
      string,
      unknown
    >;
    expect(sortedKeys(module)).toMatchSnapshot();
  });

  it('shared/config export surface is stable', async () => {
    const module = (await import('./shared/config/index.js')) as Record<
      string,
      unknown
    >;
    expect(sortedKeys(module)).toMatchSnapshot();
  });

  it('platform/integration export surface is stable', async () => {
    const module = (await import('./platform/integration/index.js')) as Record<
      string,
      unknown
    >;
    expect(sortedKeys(module)).toMatchSnapshot();
  });

  it('platform/persistence export surface is stable', async () => {
    const module = (await import('./platform/persistence/index.js')) as Record<
      string,
      unknown
    >;
    expect(sortedKeys(module)).toMatchSnapshot();

    const sqliteNamespace = module.sqlite as Record<string, unknown>;
    expect(sortedKeys(sqliteNamespace)).toMatchSnapshot();
  });
});
