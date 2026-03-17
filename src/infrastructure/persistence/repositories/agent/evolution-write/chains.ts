import { getAbilityChain } from '../evolution-read-repository.js';
import { getDb } from './shared.js';

export interface AbilityChainUpdate {
  genes?: string[];
  capsules?: string[];
  description?: string;
}

export function createAbilityChain(chain: {
  chainId: string;
  genes: string[];
  capsules: string[];
  description?: string;
}): void {
  getDb()
    .prepare(
      `
    INSERT INTO ability_chains (chain_id, genes, capsules, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      chain.chainId,
      JSON.stringify(chain.genes),
      JSON.stringify(chain.capsules),
      chain.description || null,
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

export function updateAbilityChain(
  chainId: string,
  updates: AbilityChainUpdate,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.genes !== undefined) {
    fields.push('genes = ?');
    values.push(JSON.stringify(updates.genes));
  }
  if (updates.capsules !== undefined) {
    fields.push('capsules = ?');
    values.push(JSON.stringify(updates.capsules));
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(chainId);

  getDb()
    .prepare(
      `UPDATE ability_chains SET ${fields.join(', ')} WHERE chain_id = ?`,
    )
    .run(...values);
}

export function addGeneToChain(chainId: string, geneAssetId: string): void {
  const chain = getAbilityChain(chainId);
  if (!chain) {
    return;
  }
  const genes = [...new Set([...chain.genes, geneAssetId])];
  updateAbilityChain(chainId, { genes });
}

export function addCapsuleToChain(
  chainId: string,
  capsuleAssetId: string,
): void {
  const chain = getAbilityChain(chainId);
  if (!chain) {
    return;
  }
  const capsules = [...new Set([...chain.capsules, capsuleAssetId])];
  updateAbilityChain(chainId, { capsules });
}
