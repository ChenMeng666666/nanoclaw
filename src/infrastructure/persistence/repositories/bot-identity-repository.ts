import type Database from 'better-sqlite3';
import { parseObject } from '../mappers/json-mapper.js';

export function createBotIdentity(
  database: Database.Database,
  identity: {
    id: string;
    chatJid: string;
    agentId: string;
    botName: string;
    botAvatar?: string;
    config?: Record<string, unknown>;
  },
): void {
  database
    .prepare(
      `
    INSERT OR REPLACE INTO bot_identities (
      id, chat_jid, agent_id, bot_name, bot_avatar, config, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `,
    )
    .run(
      identity.id,
      identity.chatJid,
      identity.agentId,
      identity.botName,
      identity.botAvatar || null,
      JSON.stringify(identity.config || {}),
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

export function getBotIdentityByChatJid(
  database: Database.Database,
  chatJid: string,
) {
  const row = database
    .prepare('SELECT * FROM bot_identities WHERE chat_jid = ?')
    .get(chatJid) as
    | {
        id: string;
        chat_jid: string;
        agent_id: string;
        bot_name: string;
        bot_avatar?: string;
        is_active: number;
        config?: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    chatJid: row.chat_jid,
    agentId: row.agent_id,
    botName: row.bot_name,
    botAvatar: row.bot_avatar,
    isActive: Boolean(row.is_active),
    config: parseObject<Record<string, unknown> | undefined>(
      row.config,
      undefined,
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllBotIdentities(database: Database.Database) {
  const rows = database.prepare('SELECT * FROM bot_identities').all() as Array<{
    id: string;
    chat_jid: string;
    agent_id: string;
    bot_name: string;
    bot_avatar?: string;
    is_active: number;
    config?: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    chatJid: row.chat_jid,
    agentId: row.agent_id,
    botName: row.bot_name,
    botAvatar: row.bot_avatar,
    isActive: Boolean(row.is_active),
    config: parseObject<Record<string, unknown> | undefined>(
      row.config,
      undefined,
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateBotIdentity(
  database: Database.Database,
  id: string,
  updates: Partial<{
    chatJid?: string;
    agentId?: string;
    botName?: string;
    botAvatar?: string;
    config?: Record<string, unknown>;
    isActive?: boolean;
  }>,
): void {
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.chatJid !== undefined) {
    fields.push('chat_jid = ?');
    params.push(updates.chatJid);
  }
  if (updates.agentId !== undefined) {
    fields.push('agent_id = ?');
    params.push(updates.agentId);
  }
  if (updates.botName !== undefined) {
    fields.push('bot_name = ?');
    params.push(updates.botName);
  }
  if (updates.botAvatar !== undefined) {
    fields.push('bot_avatar = ?');
    params.push(updates.botAvatar || null);
  }
  if (updates.config !== undefined) {
    fields.push('config = ?');
    params.push(JSON.stringify(updates.config));
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?');
    params.push(updates.isActive ? 1 : 0);
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  if (fields.length > 1) {
    database
      .prepare(
        `
      UPDATE bot_identities
      SET ${fields.join(', ')}
      WHERE id = ?
    `,
      )
      .run(...params);
  }
}

export function deleteBotIdentity(
  database: Database.Database,
  id: string,
): void {
  database.prepare('DELETE FROM bot_identities WHERE id = ?').run(id);
}
