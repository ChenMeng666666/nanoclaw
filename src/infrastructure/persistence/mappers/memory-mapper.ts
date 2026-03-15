import type { Memory } from '../../../types/agent-memory.js';
import { parseObject } from './json-mapper.js';

export interface MemoryRow {
  id: string;
  agent_folder: string;
  user_jid: string | null;
  session_id: string | null;
  scope: string | null;
  level: string;
  content: string;
  embedding: string | null;
  importance: number;
  quality_score: number | null;
  access_count: number;
  last_accessed_at: string | null;
  message_type: string | null;
  timestamp_weight: number | null;
  tags: string | null;
  source_type: string | null;
  created_at: string;
  updated_at: string;
}

export function mapMemoryRow(row: MemoryRow): Memory {
  return {
    id: row.id,
    agentFolder: row.agent_folder,
    userJid: row.user_jid || undefined,
    sessionId: row.session_id || undefined,
    scope: (row.scope as Memory['scope']) || undefined,
    level: row.level as 'L1' | 'L2' | 'L3',
    content: row.content,
    embedding: parseObject(row.embedding, undefined),
    importance: row.importance,
    qualityScore:
      typeof row.quality_score === 'number' ? row.quality_score : undefined,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at || undefined,
    messageType: (row.message_type as Memory['messageType']) || undefined,
    timestampWeight:
      typeof row.timestamp_weight === 'number'
        ? row.timestamp_weight
        : undefined,
    tags: parseObject(row.tags, undefined),
    sourceType: (row.source_type as Memory['sourceType']) || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
