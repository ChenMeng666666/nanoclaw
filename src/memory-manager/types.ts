import { Memory } from '../types.js';

export interface MemoryMetadataInput {
  scope?: Memory['scope'];
  sessionId?: string;
  sourceType?: Memory['sourceType'];
  messageType?: Memory['messageType'];
  tags?: string[];
}

export interface MemorySearchExplanation {
  queryVariants: string[];
  matchedTerms: string[];
  scores: {
    bm25: number;
    vector: number;
    fused: number;
    quality: number;
    importance: number;
    timestamp: number;
    final: number;
  };
  scope?: Memory['scope'];
  level: Memory['level'];
  tags?: string[];
}

export interface MemorySearchHit {
  memory: Memory;
  explain: MemorySearchExplanation;
}
