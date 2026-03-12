import { beforeEach, describe, expect, it, vi } from 'vitest';

import { evolutionManager } from './evolution-manager.js';
import { MainEvolutionApplier } from './main-evolution-applier.js';
import type { EvolutionEntry } from './types.js';

function createGene(overrides: Partial<EvolutionEntry> = {}): EvolutionEntry {
  return {
    id: 42,
    abilityName: 'test-gene',
    sourceAgentId: 'main-process',
    content: 'test',
    tags: ['test'],
    status: 'approved',
    feedback: [],
    createdAt: new Date().toISOString(),
    category: 'repair',
    signalsMatch: ['error'],
    validation_commands: ['node --version'],
    ...overrides,
  };
}

describe('MainEvolutionApplier', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.REQUIRED_ENV;
  });

  it('creates validation report and capsule for valid strategy', async () => {
    const createValidationReport = vi
      .spyOn(evolutionManager, 'createValidationReport')
      .mockReturnValue(1);
    const createCapsule = vi
      .spyOn(evolutionManager, 'createCapsule')
      .mockResolvedValue('cap-1');
    const updateGeneGDIScore = vi
      .spyOn(evolutionManager, 'updateGeneGDIScore')
      .mockReturnValue({
        intrinsicQuality: 1,
        usageMetrics: 1,
        socialSignals: 1,
        freshness: 1,
        total: 1,
      });

    await MainEvolutionApplier.applyGeneStrategy(createGene());

    expect(createValidationReport).toHaveBeenCalledWith(
      42,
      ['node --version'],
      true,
      expect.objectContaining({
        category: 'repair',
        dryRun: true,
      }),
    );
    expect(createCapsule).toHaveBeenCalledTimes(1);
    expect(updateGeneGDIScore).toHaveBeenCalledWith(42);
  });

  it('fails validation when preconditions are not met', async () => {
    const createValidationReport = vi
      .spyOn(evolutionManager, 'createValidationReport')
      .mockReturnValue(1);
    const createCapsule = vi
      .spyOn(evolutionManager, 'createCapsule')
      .mockResolvedValue('cap-1');

    await MainEvolutionApplier.applyGeneStrategy(
      createGene({
        preconditions: ['env:REQUIRED_ENV'],
      }),
    );

    expect(createValidationReport).toHaveBeenCalledWith(
      42,
      [],
      false,
      expect.objectContaining({
        category: 'repair',
        unmetPreconditions: ['env:REQUIRED_ENV'],
      }),
      expect.stringContaining('Unmet preconditions'),
    );
    expect(createCapsule).not.toHaveBeenCalled();
  });

  it('fails validation when commands are unsafe', async () => {
    const createValidationReport = vi
      .spyOn(evolutionManager, 'createValidationReport')
      .mockReturnValue(1);
    const createCapsule = vi
      .spyOn(evolutionManager, 'createCapsule')
      .mockResolvedValue('cap-1');

    await MainEvolutionApplier.applyGeneStrategy(
      createGene({
        validation_commands: ['rm -rf /tmp/abc'],
      }),
    );

    expect(createValidationReport).toHaveBeenCalledWith(
      42,
      [],
      false,
      expect.objectContaining({
        category: 'repair',
        unsafeCommands: ['rm -rf /tmp/abc'],
      }),
      expect.stringContaining('Unsafe validation commands'),
    );
    expect(createCapsule).not.toHaveBeenCalled();
  });

  it('applies learn category strategy', async () => {
    const createValidationReport = vi
      .spyOn(evolutionManager, 'createValidationReport')
      .mockReturnValue(1);
    vi.spyOn(evolutionManager, 'createCapsule').mockResolvedValue('cap-1');
    vi.spyOn(evolutionManager, 'updateGeneGDIScore').mockReturnValue({
      intrinsicQuality: 1,
      usageMetrics: 1,
      socialSignals: 1,
      freshness: 1,
      total: 1,
    });

    await MainEvolutionApplier.applyGeneStrategy(
      createGene({
        category: 'learn',
      }),
    );

    expect(createValidationReport).toHaveBeenCalledWith(
      42,
      ['node --version'],
      true,
      expect.objectContaining({
        category: 'learn',
        dryRun: true,
      }),
    );
  });
});
