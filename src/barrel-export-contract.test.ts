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

  it('contexts/messaging export surface is stable', async () => {
    const module = (await import('./contexts/messaging/index.js')) as Record<
      string,
      unknown
    >;
    expect(sortedKeys(module)).toMatchSnapshot();

    const domainNamespace = module.domain as Record<string, unknown>;
    const applicationNamespace = module.application as Record<string, unknown>;
    const interfacesNamespace = module.interfaces as Record<string, unknown>;
    const infrastructureNamespace = module.infrastructure as Record<
      string,
      unknown
    >;

    expect(sortedKeys(domainNamespace)).toMatchSnapshot();
    expect(sortedKeys(applicationNamespace)).toMatchSnapshot();
    expect(sortedKeys(interfacesNamespace)).toMatchSnapshot();
    expect(sortedKeys(infrastructureNamespace)).toMatchSnapshot();
  });
});
