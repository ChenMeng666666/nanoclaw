import type { EvolutionEntry } from '../../../types/evolution.js';

export function calculateShannonDiversity(genes: EvolutionEntry[]): number {
  const categoryCounts: Record<string, number> = {};
  const total = genes.length;
  if (total === 0) {
    return 0;
  }

  for (const gene of genes) {
    const category = gene.category || 'learn';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  }

  let diversity = 0;
  for (const count of Object.values(categoryCounts)) {
    const probability = count / total;
    diversity -= probability * Math.log2(probability);
  }
  return diversity;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeSimilarityThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.95;
  }
  return Math.min(1, Math.max(0, value));
}

export function calculateAverageRating(
  feedback: Array<{ rating: number }> | undefined | null,
): number {
  if (!feedback || !Array.isArray(feedback) || feedback.length === 0) {
    return 0;
  }
  const sum = feedback.reduce(
    (accumulator, item) => accumulator + (item?.rating || 0),
    0,
  );
  return sum / feedback.length;
}
