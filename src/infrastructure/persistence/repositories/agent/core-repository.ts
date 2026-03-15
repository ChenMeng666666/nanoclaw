import Database from 'better-sqlite3';
import type {
  AgentConfig,
  ChannelInstance,
  UserProfile,
} from '../../../../types.js';
import { readEnvFile } from '../../../../env.js';
import { safeJsonParse } from '../../../../security.js';
import { getDatabase as getPersistenceDatabase } from '../../sqlite/transaction-manager.js';

const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const database = getPersistenceDatabase() as unknown as Record<
      string,
      unknown
    >;
    const value = database[property as keyof typeof database];
    if (typeof value === 'function') {
      return value.bind(database);
    }
    return value;
  },
});

function getDefaultModel(): string {
  const envConfig = readEnvFile(['ANTHROPIC_MODEL']);
  return envConfig.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

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
