/**
 * 多智能体架构数据库访问器
 * 包含 agents, channel_instances, user_profiles, memories, reflections,
 * learning_tasks, evolution_log 等表的 CRUD 操作
 */
import Database from 'better-sqlite3';
import {
  AgentConfig,
  ChannelInstance,
  UserProfile,
  Memory,
  Reflection,
  LearningTask,
  EvolutionEntry,
} from './types.js';
import { readEnvFile } from './env.js';
import { safeJsonParse } from './security.js';

let db: Database.Database;

/** 从 .env 文件读取默认模型，fallback 到官方默认值 */
function getDefaultModel(): string {
  const envConfig = readEnvFile(['ANTHROPIC_MODEL']);
  return envConfig.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

/** 初始化数据库引用（由主 db.ts 调用） */
export function setDatabase(database: Database.Database): void {
  db = database;
}

/** 获取数据库引用（供其他模块使用） */
export function getDatabase(): Database.Database {
  return db;
}

// ===== Agents =====

export function createAgent(agent: Omit<AgentConfig, 'isActive'>): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO agents (id, name, folder, user_name, personality, "values", appearance, anthropic_token_encrypted, anthropic_url, anthropic_model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    agent.id,
    agent.name,
    agent.folder,
    agent.userName || null,
    agent.personality || null,
    agent.values || null,
    agent.appearance || null,
    agent.credentials.anthropicToken || null,
    agent.credentials.anthropicUrl || null,
    agent.credentials.anthropicModel || getDefaultModel(),
    now,
    now,
  );
}

export function getAgentById(id: string): AgentConfig | undefined {
  const row = db
    .prepare('SELECT * FROM agents WHERE id = ? AND is_active = 1')
    .get(id) as
    | {
        id: string;
        name: string;
        folder: string;
        user_name: string | null;
        personality: string | null;
        values: string | null;
        appearance: string | null;
        anthropic_token_encrypted: string | null;
        anthropic_url: string | null;
        anthropic_model: string | null;
        is_active: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    folder: row.folder,
    userName: row.user_name || undefined,
    personality: row.personality || undefined,
    values: row.values || undefined,
    appearance: row.appearance || undefined,
    isActive: row.is_active === 1,
    credentials: {
      anthropicToken: row.anthropic_token_encrypted || undefined,
      anthropicUrl: row.anthropic_url || undefined,
      anthropicModel: row.anthropic_model || getDefaultModel(),
    },
  };
}

export function getAgentByFolder(folder: string): AgentConfig | undefined {
  const row = db
    .prepare('SELECT * FROM agents WHERE folder = ? AND is_active = 1')
    .get(folder) as
    | {
        id: string;
        name: string;
        folder: string;
        user_name: string | null;
        personality: string | null;
        values: string | null;
        appearance: string | null;
        anthropic_token_encrypted: string | null;
        anthropic_url: string | null;
        anthropic_model: string | null;
        is_active: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    folder: row.folder,
    userName: row.user_name || undefined,
    personality: row.personality || undefined,
    values: row.values || undefined,
    appearance: row.appearance || undefined,
    isActive: row.is_active === 1,
    credentials: {
      anthropicToken: row.anthropic_token_encrypted || undefined,
      anthropicUrl: row.anthropic_url || undefined,
      anthropicModel: row.anthropic_model || getDefaultModel(),
    },
  };
}

export function getAllActiveAgents(): AgentConfig[] {
  const rows = db
    .prepare(
      'SELECT * FROM agents WHERE is_active = 1 ORDER BY created_at DESC',
    )
    .all() as Array<{
    id: string;
    name: string;
    folder: string;
    user_name: string | null;
    personality: string | null;
    values: string | null;
    appearance: string | null;
    anthropic_token_encrypted: string | null;
    anthropic_url: string | null;
    anthropic_model: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    folder: row.folder,
    userName: row.user_name || undefined,
    personality: row.personality || undefined,
    values: row.values || undefined,
    appearance: row.appearance || undefined,
    isActive: row.is_active === 1,
    credentials: {
      anthropicToken: row.anthropic_token_encrypted || undefined,
      anthropicUrl: row.anthropic_url || undefined,
      anthropicModel: row.anthropic_model || getDefaultModel(),
    },
  }));
}

export function updateAgent(
  id: string,
  updates: Partial<
    Pick<
      AgentConfig,
      'userName' | 'personality' | 'values' | 'appearance' | 'credentials'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.userName !== undefined) {
    fields.push('user_name = ?');
    values.push(updates.userName);
  }
  if (updates.personality !== undefined) {
    fields.push('personality = ?');
    values.push(updates.personality);
  }
  if (updates.values !== undefined) {
    fields.push('"values" = ?');
    values.push(updates.values);
  }
  if (updates.appearance !== undefined) {
    fields.push('appearance = ?');
    values.push(updates.appearance);
  }
  if (updates.credentials !== undefined) {
    if (updates.credentials.anthropicToken !== undefined) {
      fields.push('anthropic_token_encrypted = ?');
      values.push(updates.credentials.anthropicToken);
    }
    if (updates.credentials.anthropicUrl !== undefined) {
      fields.push('anthropic_url = ?');
      values.push(updates.credentials.anthropicUrl);
    }
    if (updates.credentials.anthropicModel !== undefined) {
      fields.push('anthropic_model = ?');
      values.push(updates.credentials.anthropicModel);
    }
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );
}

export function deactivateAgent(id: string): void {
  db.prepare(
    `UPDATE agents SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), new Date().toISOString(), id);
}

// ===== Channel Instances =====

export function createChannelInstance(
  instance: Omit<ChannelInstance, 'isActive'>,
): void {
  db.prepare(
    `
    INSERT INTO channel_instances (id, agent_id, channel_type, bot_id, jid, name, config, mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    instance.id,
    instance.agentId,
    instance.channelType,
    instance.botId,
    instance.jid,
    instance.name || null,
    instance.config ? JSON.stringify(instance.config) : null,
    instance.mode || 'both',
    new Date().toISOString(),
  );
}

export function getChannelInstanceById(
  id: string,
): ChannelInstance | undefined {
  const row = db
    .prepare('SELECT * FROM channel_instances WHERE id = ? AND is_active = 1')
    .get(id) as
    | {
        id: string;
        agent_id: string;
        channel_type: string;
        bot_id: string;
        jid: string;
        name: string | null;
        config: string | null;
        mode: string;
        is_active: number;
        created_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    agentId: row.agent_id,
    channelType: row.channel_type,
    botId: row.bot_id,
    jid: row.jid,
    name: row.name || undefined,
    config: safeJsonParse(row.config, undefined),
    mode: row.mode as 'dm' | 'group' | 'both',
    isActive: row.is_active === 1,
  };
}

export function getChannelInstanceByJid(
  jid: string,
): ChannelInstance | undefined {
  const row = db
    .prepare('SELECT * FROM channel_instances WHERE jid = ? AND is_active = 1')
    .get(jid) as
    | {
        id: string;
        agent_id: string;
        channel_type: string;
        bot_id: string;
        jid: string;
        name: string | null;
        config: string | null;
        mode: string;
        is_active: number;
        created_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    agentId: row.agent_id,
    channelType: row.channel_type,
    botId: row.bot_id,
    jid: row.jid,
    name: row.name || undefined,
    config: safeJsonParse(row.config, undefined),
    mode: row.mode as 'dm' | 'group' | 'both',
    isActive: row.is_active === 1,
  };
}

export function getChannelInstancesForAgent(
  agentId: string,
): ChannelInstance[] {
  const rows = db
    .prepare(
      'SELECT * FROM channel_instances WHERE agent_id = ? AND is_active = 1 ORDER BY created_at DESC',
    )
    .all(agentId) as Array<{
    id: string;
    agent_id: string;
    channel_type: string;
    bot_id: string;
    jid: string;
    name: string | null;
    config: string | null;
    mode: string;
    is_active: number;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    channelType: row.channel_type,
    botId: row.bot_id,
    jid: row.jid,
    name: row.name || undefined,
    config: safeJsonParse(row.config, undefined),
    mode: row.mode as 'dm' | 'group' | 'both',
    isActive: row.is_active === 1,
  }));
}

export function deactivateChannelInstance(id: string): void {
  db.prepare(`UPDATE channel_instances SET is_active = 0 WHERE id = ?`).run(id);
}

// ===== User Profiles =====

export function createOrUpdateUserProfile(
  profile: Omit<UserProfile, 'createdAt'>,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO user_profiles (id, channel_instance_id, user_jid, name, preferences, memory_summary, last_interaction, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      preferences = excluded.preferences,
      memory_summary = excluded.memory_summary,
      last_interaction = excluded.last_interaction
  `,
  ).run(
    profile.id,
    profile.channelInstanceId,
    profile.userJid,
    profile.name || null,
    profile.preferences ? JSON.stringify(profile.preferences) : null,
    profile.memorySummary || null,
    profile.lastInteraction,
    now,
  );
}

export function getUserProfile(
  channelInstanceId: string,
  userJid: string,
): UserProfile | undefined {
  const row = db
    .prepare(
      'SELECT * FROM user_profiles WHERE channel_instance_id = ? AND user_jid = ?',
    )
    .get(channelInstanceId, userJid) as
    | {
        id: string;
        channel_instance_id: string;
        user_jid: string;
        name: string | null;
        preferences: string | null;
        memory_summary: string | null;
        last_interaction: string;
        created_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    channelInstanceId: row.channel_instance_id,
    userJid: row.user_jid,
    name: row.name || undefined,
    preferences: safeJsonParse(row.preferences, undefined),
    memorySummary: row.memory_summary || undefined,
    lastInteraction: row.last_interaction,
    createdAt: row.created_at,
  };
}

// ===== Memories =====

export function createMemory(
  memory: Omit<Memory, 'accessCount' | 'lastAccessedAt'>,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO memories (id, agent_folder, user_jid, level, content, embedding, importance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    memory.id,
    memory.agentFolder,
    memory.userJid || null,
    memory.level,
    memory.content,
    memory.embedding ? JSON.stringify(memory.embedding) : null,
    memory.importance || 0.5,
    now,
    now,
  );
}

export function getMemories(
  agentFolder: string,
  level?: 'L1' | 'L2' | 'L3',
  userJid?: string,
): Memory[] {
  let sql = 'SELECT * FROM memories WHERE agent_folder = ?';
  const params: unknown[] = [agentFolder];

  if (level) {
    sql += ' AND level = ?';
    params.push(level);
  }
  if (userJid) {
    sql += ' AND (user_jid = ? OR user_jid IS NULL)';
    params.push(userJid);
  }

  sql += ' ORDER BY importance DESC, access_count DESC';

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string;
    agent_folder: string;
    user_jid: string | null;
    level: string;
    content: string;
    embedding: string | null;
    importance: number;
    access_count: number;
    last_accessed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    agentFolder: row.agent_folder,
    userJid: row.user_jid || undefined,
    level: row.level as 'L1' | 'L2' | 'L3',
    content: row.content,
    embedding: safeJsonParse(row.embedding, undefined),
    importance: row.importance,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * 获取特定用户的记忆（支持多级记忆）
 */
export function getUserMemories(
  agentFolder: string,
  userJid: string,
  levels?: ('L1' | 'L2' | 'L3')[],
): Memory[] {
  let sql =
    'SELECT * FROM memories WHERE agent_folder = ? AND (user_jid = ? OR user_jid IS NULL)';
  const params: unknown[] = [agentFolder, userJid];

  if (levels && levels.length > 0) {
    const placeholders = levels.map(() => '?').join(',');
    sql += ` AND level IN (${placeholders})`;
    params.push(...levels);
  }

  sql += ' ORDER BY level, importance DESC, access_count DESC';

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string;
    agent_folder: string;
    user_jid: string | null;
    level: string;
    content: string;
    embedding: string | null;
    importance: number;
    access_count: number;
    last_accessed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    agentFolder: row.agent_folder,
    userJid: row.user_jid || undefined,
    level: row.level as 'L1' | 'L2' | 'L3',
    content: row.content,
    embedding: safeJsonParse(row.embedding, undefined),
    importance: row.importance,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateMemory(
  id: string,
  updates: Partial<
    Pick<Memory, 'content' | 'importance' | 'embedding' | 'level'>
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.importance !== undefined) {
    fields.push('importance = ?');
    values.push(updates.importance);
  }
  if (updates.embedding !== undefined) {
    fields.push('embedding = ?');
    values.push(JSON.stringify(updates.embedding));
  }
  if (updates.level !== undefined) {
    fields.push('level = ?');
    values.push(updates.level);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );
}

export function incrementMemoryAccess(memoryId: string): void {
  db.prepare(
    `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), memoryId);
}

export function deleteMemory(id: string): void {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

// ===== Reflections =====

export function createReflection(
  reflection: Omit<Reflection, 'id' | 'createdAt'>,
): number {
  const result = db
    .prepare(
      `
    INSERT INTO reflections (agent_folder, type, content, triggered_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(
      reflection.agentFolder,
      reflection.type,
      reflection.content,
      reflection.triggeredBy || null,
      new Date().toISOString(),
    );
  return result.lastInsertRowid as number;
}

export function getReflectionsByAgent(
  agentFolder: string,
  type?: string,
): Reflection[] {
  let sql =
    'SELECT * FROM reflections WHERE agent_folder = ? ORDER BY created_at DESC';
  const params: unknown[] = [agentFolder];

  if (type) {
    sql =
      'SELECT * FROM reflections WHERE agent_folder = ? AND type = ? ORDER BY created_at DESC';
    params.push(type);
  }

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    agent_folder: string;
    type: string;
    content: string;
    triggered_by: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    agentFolder: row.agent_folder,
    type: row.type as 'hourly' | 'daily' | 'weekly' | 'monthly' | 'task',
    content: row.content,
    triggeredBy: row.triggered_by || undefined,
    createdAt: row.created_at,
  }));
}

// ===== Learning Tasks =====

export function createLearningTask(
  task: Omit<LearningTask, 'completedAt'>,
): void {
  db.prepare(
    `
    INSERT INTO learning_tasks (id, agent_folder, description, status, reflection_id, resources, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.agentFolder,
    task.description,
    task.status || 'pending',
    task.reflectionId || null,
    task.resources ? JSON.stringify(task.resources) : null,
    new Date().toISOString(),
  );
}

export function getLearningTask(id: string): LearningTask | undefined {
  const row = db
    .prepare('SELECT * FROM learning_tasks WHERE id = ?')
    .get(id) as
    | {
        id: string;
        agent_folder: string;
        description: string;
        status: string;
        reflection_id: number | null;
        resources: string | null;
        created_at: string;
        completed_at: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    agentFolder: row.agent_folder,
    description: row.description,
    status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    reflectionId: row.reflection_id || undefined,
    resources: safeJsonParse(row.resources, undefined),
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  };
}

export function getLearningTasksByAgent(agentFolder: string): LearningTask[] {
  const rows = db
    .prepare(
      'SELECT * FROM learning_tasks WHERE agent_folder = ? ORDER BY created_at DESC',
    )
    .all(agentFolder) as Array<{
    id: string;
    agent_folder: string;
    description: string;
    status: string;
    reflection_id: number | null;
    resources: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    agentFolder: row.agent_folder,
    description: row.description,
    status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    reflectionId: row.reflection_id || undefined,
    resources: safeJsonParse(row.resources, undefined),
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  }));
}

export function updateLearningTask(
  id: string,
  updates: Partial<
    Pick<LearningTask, 'status' | 'reflectionId' | 'completedAt'>
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.reflectionId !== undefined) {
    fields.push('reflection_id = ?');
    values.push(updates.reflectionId);
  }
  if (updates.completedAt !== undefined) {
    fields.push('completed_at = ?');
    values.push(updates.completedAt);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE learning_tasks SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );
}

// ===== Evolution Log / Gene =====

export interface CreateGeneInput {
  abilityName: string;
  description?: string;
  sourceAgentId: string;
  content: string;
  contentEmbedding?: number[];
  tags?: string[];
  status?: 'pending' | 'reviewing' | 'approved' | 'rejected';
  // Gene structure fields
  category?: 'repair' | 'optimize' | 'innovate' | 'learn';
  signalsMatch?: string[];
  strategy?: string[];
  constraints?: {
    maxFiles?: number;
    forbiddenPaths?: string[];
    applicableScenarios?: string[];
  };
  validation?: string[];
}

export function createEvolutionEntry(entry: CreateGeneInput): number {
  const result = db
    .prepare(
      `
    INSERT INTO evolution_log (
      ability_name, description, source_agent_id, content, content_embedding, tags, status,
      category, signals_match, strategy, constraints, validation, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      entry.abilityName,
      entry.description || null,
      entry.sourceAgentId,
      entry.content,
      entry.contentEmbedding ? JSON.stringify(entry.contentEmbedding) : null,
      entry.tags ? JSON.stringify(entry.tags) : null,
      entry.status || 'pending',
      entry.category || 'learn',
      entry.signalsMatch ? JSON.stringify(entry.signalsMatch) : '[]',
      entry.strategy ? JSON.stringify(entry.strategy) : '[]',
      entry.constraints ? JSON.stringify(entry.constraints) : '{}',
      entry.validation ? JSON.stringify(entry.validation) : '[]',
      new Date().toISOString(),
    );
  return result.lastInsertRowid as number;
}

export function getEvolutionEntry(id: number): EvolutionEntry | undefined {
  const row = db.prepare('SELECT * FROM evolution_log WHERE id = ?').get(id) as
    | {
        id: number;
        ability_name: string;
        description: string | null;
        source_agent_id: string | null;
        content: string;
        content_embedding: string | null;
        tags: string | null;
        status: string;
        reviewed_by: string | null;
        reviewed_at: string | null;
        feedback: string | null;
        category: string | null;
        signals_match: string | null;
        strategy: string | null;
        constraints: string | null;
        validation: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    abilityName: row.ability_name,
    description: row.description || '',
    sourceAgentId: row.source_agent_id || '',
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status as 'pending' | 'reviewing' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    feedback: safeJsonParse(row.feedback, []),
    category:
      (row.category as 'repair' | 'optimize' | 'innovate' | 'learn') || 'learn',
    signalsMatch: safeJsonParse(row.signals_match, []),
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  };
}

export function getApprovedEvolutionEntries(
  tags?: string[],
  limit: number = 20,
): EvolutionEntry[] {
  let sql = `
    SELECT * FROM evolution_log
    WHERE status = 'approved'
  `;
  const params: unknown[] = [];

  if (tags && tags.length > 0) {
    sql += ` AND EXISTS (
      SELECT 1 FROM json_each(tags) WHERE value IN (${tags.map(() => '?').join(',')})
    )`;
    params.push(...tags);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    ability_name: string;
    description: string | null;
    source_agent_id: string | null;
    content: string;
    content_embedding: string | null;
    tags: string | null;
    status: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    feedback: string | null;
    category: string | null;
    signals_match: string | null;
    strategy: string | null;
    constraints: string | null;
    validation: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    abilityName: row.ability_name,
    description: row.description || '',
    sourceAgentId: row.source_agent_id || '',
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status as 'pending' | 'reviewing' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    feedback: safeJsonParse(row.feedback, []),
    category:
      (row.category as 'repair' | 'optimize' | 'innovate' | 'learn') || 'learn',
    signalsMatch: safeJsonParse(row.signals_match, []),
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  }));
}

/**
 * Get evolution entries by category (Gene selection)
 */
export function getEvolutionEntriesByCategory(
  category: 'repair' | 'optimize' | 'innovate' | 'learn',
  limit: number = 20,
): EvolutionEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM evolution_log WHERE status = 'approved' AND category = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(category, limit) as Array<{
    id: number;
    ability_name: string;
    description: string | null;
    source_agent_id: string | null;
    content: string;
    content_embedding: string | null;
    tags: string | null;
    status: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    feedback: string | null;
    category: string | null;
    signals_match: string | null;
    strategy: string | null;
    constraints: string | null;
    validation: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    abilityName: row.ability_name,
    description: row.description || '',
    sourceAgentId: row.source_agent_id || '',
    content: row.content,
    contentEmbedding: safeJsonParse(row.content_embedding, undefined),
    tags: safeJsonParse(row.tags, []),
    status: row.status as 'pending' | 'reviewing' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    feedback: safeJsonParse(row.feedback, []),
    category:
      (row.category as 'repair' | 'optimize' | 'innovate' | 'learn') || 'learn',
    signalsMatch: safeJsonParse(row.signals_match, []),
    strategy: safeJsonParse(row.strategy, []),
    constraints: safeJsonParse(row.constraints, {}),
    validation: safeJsonParse(row.validation, []),
    createdAt: row.created_at,
  }));
}

export function updateEvolutionStatus(
  id: number,
  status: 'pending' | 'reviewing' | 'approved' | 'rejected',
  reviewedBy?: string,
  feedback?: string,
): void {
  const fields: string[] = ['status = ?'];
  const values: unknown[] = [status];

  if (reviewedBy) {
    fields.push('reviewed_by = ?', 'reviewed_at = ?');
    values.push(reviewedBy, new Date().toISOString());
  }
  if (feedback) {
    fields.push('feedback = ?');
    // 确保反馈存储为 JSON 字符串
    values.push(JSON.stringify([{
      agentId: reviewedBy || 'system',
      comment: feedback,
      rating: status === 'approved' ? 5 : 1,
      usedAt: new Date().toISOString(),
    }]));
  }

  values.push(id);
  db.prepare(`UPDATE evolution_log SET ${fields.join(', ')} WHERE id = ?`).run(
    ...values,
  );
}

export function addEvolutionFeedback(
  id: number,
  agentId: string,
  comment: string,
  rating: number,
): void {
  const entry = getEvolutionEntry(id);
  if (!entry) return;

  const feedback = entry.feedback || [];
  feedback.push({
    agentId,
    comment,
    rating,
    usedAt: new Date().toISOString(),
  });

  db.prepare(`UPDATE evolution_log SET feedback = ? WHERE id = ?`).run(
    JSON.stringify(feedback),
    id,
  );
}

// ===== Audit Log =====

export interface AuditLogEntry {
  agentFolder?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export function logAudit(entry: AuditLogEntry): void {
  db.prepare(
    `
    INSERT INTO audit_log (agent_folder, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    entry.agentFolder || null,
    entry.action,
    entry.entityType,
    entry.entityId || null,
    entry.details ? JSON.stringify(entry.details) : null,
    new Date().toISOString(),
  );
}

// ===== Scheduled Tasks (for learning plans) =====

/**
 * 为学习计划创建定时任务
 */
export function createScheduledTaskForLearning(
  groupFolder: string,
  chatJid: string,
  prompt: string,
  scheduleType: 'daily' | 'weekly' | 'monthly',
  scheduleValue: string,
  nextRun: string,
): string {
  const id = `learning_${groupFolder}_${Date.now()}`;
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, next_run, status, created_at, context_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'isolated')
  `,
  ).run(
    id,
    groupFolder,
    chatJid || `${groupFolder}_learning`,
    prompt,
    scheduleType,
    scheduleValue,
    nextRun,
    'active',
    now,
  );

  return id;
}

export function getAuditLogs(
  agentFolder?: string,
  limit: number = 100,
): Array<AuditLogEntry & { createdAt: string }> {
  let sql = 'SELECT * FROM audit_log';
  const params: unknown[] = [];

  if (agentFolder) {
    sql += ' WHERE agent_folder = ?';
    params.push(agentFolder);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    agent_folder: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    agentFolder: row.agent_folder || undefined,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || undefined,
    details: safeJsonParse(row.details, undefined),
    createdAt: row.created_at,
  }));
}

// ===== Learning Results =====

/**
 * 学习结果类型
 */
export interface LearningResultEntry {
  id: number;
  taskId?: string;
  agentFolder: string;
  metricBefore?: number;
  metricAfter?: number;
  metricName?: string;
  status: 'keep' | 'discard' | 'crash';
  description?: string;
  signals?: string[];
  geneId?: string;
  blastRadius?: { files: number; lines: number };
  createdAt: string;
}

/**
 * 创建学习结果
 */
export function createLearningResult(
  result: Omit<LearningResultEntry, 'id' | 'createdAt'>,
): number {
  const dbResult = db
    .prepare(
      `
    INSERT INTO learning_results (
      task_id, agent_folder, metric_before, metric_after, metric_name,
      status, description, signals, gene_id, blast_radius, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      result.taskId || null,
      result.agentFolder,
      result.metricBefore ?? null,
      result.metricAfter ?? null,
      result.metricName || null,
      result.status,
      result.description || null,
      result.signals ? JSON.stringify(result.signals) : null,
      result.geneId || null,
      result.blastRadius ? JSON.stringify(result.blastRadius) : null,
      new Date().toISOString(),
    );
  return dbResult.lastInsertRowid as number;
}

/**
 * 获取学习结果
 */
export function getLearningResult(id: number): LearningResultEntry | undefined {
  const row = db
    .prepare('SELECT * FROM learning_results WHERE id = ?')
    .get(id) as
    | {
        id: number;
        task_id: string | null;
        agent_folder: string;
        metric_before: number | null;
        metric_after: number | null;
        metric_name: string | null;
        status: string;
        description: string | null;
        signals: string | null;
        gene_id: string | null;
        blast_radius: string | null;
        created_at: string;
      }
    | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    taskId: row.task_id || undefined,
    agentFolder: row.agent_folder,
    metricBefore: row.metric_before ?? undefined,
    metricAfter: row.metric_after ?? undefined,
    metricName: row.metric_name || undefined,
    status: row.status as 'keep' | 'discard' | 'crash',
    description: row.description || undefined,
    signals: safeJsonParse(row.signals, undefined),
    geneId: row.gene_id || undefined,
    blastRadius: safeJsonParse(row.blast_radius, undefined),
    createdAt: row.created_at,
  };
}

/**
 * 获取 agent 的学习结果
 */
export function getLearningResultsByAgent(
  agentFolder: string,
  limit: number = 50,
): LearningResultEntry[] {
  const rows = db
    .prepare(
      'SELECT * FROM learning_results WHERE agent_folder = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(agentFolder, limit) as Array<{
    id: number;
    task_id: string | null;
    agent_folder: string;
    metric_before: number | null;
    metric_after: number | null;
    metric_name: string | null;
    status: string;
    description: string | null;
    signals: string | null;
    gene_id: string | null;
    blast_radius: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id || undefined,
    agentFolder: row.agent_folder,
    metricBefore: row.metric_before ?? undefined,
    metricAfter: row.metric_after ?? undefined,
    metricName: row.metric_name || undefined,
    status: row.status as 'keep' | 'discard' | 'crash',
    description: row.description || undefined,
    signals: safeJsonParse(row.signals, undefined),
    geneId: row.gene_id || undefined,
    blastRadius: safeJsonParse(row.blast_radius, undefined),
    createdAt: row.created_at,
  }));
}

/**
 * 获取最近的学习结果（用于饱和检测）
 */
export function getRecentLearningResults(
  limit: number = 10,
): LearningResultEntry[] {
  const rows = db
    .prepare('SELECT * FROM learning_results ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{
    id: number;
    task_id: string | null;
    agent_folder: string;
    metric_before: number | null;
    metric_after: number | null;
    metric_name: string | null;
    status: string;
    description: string | null;
    signals: string | null;
    gene_id: string | null;
    blast_radius: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id || undefined,
    agentFolder: row.agent_folder,
    metricBefore: row.metric_before ?? undefined,
    metricAfter: row.metric_after ?? undefined,
    metricName: row.metric_name || undefined,
    status: row.status as 'keep' | 'discard' | 'crash',
    description: row.description || undefined,
    signals: safeJsonParse(row.signals, undefined),
    geneId: row.gene_id || undefined,
    blastRadius: safeJsonParse(row.blast_radius, undefined),
    createdAt: row.created_at,
  }));
}
