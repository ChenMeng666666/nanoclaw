import type { AbilityChain } from '../../../../../types/gep.js';
import { safeJsonParse } from '../../../../../security.js';
import { getDb } from './shared.js';

export function getAbilityChain(chainId: string): AbilityChain | undefined {
  const row = getDb()
    .prepare('SELECT * FROM ability_chains WHERE chain_id = ?')
    .get(chainId) as
    | {
        chain_id: string;
        genes: string;
        capsules: string;
        description: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  return {
    chain_id: row.chain_id,
    genes: safeJsonParse(row.genes, []),
    capsules: safeJsonParse(row.capsules, []),
    description: row.description || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
