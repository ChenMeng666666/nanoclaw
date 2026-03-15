import Database from 'better-sqlite3';
import type { RegisteredGroup } from '../../../types.js';
import { isValidGroupFolder } from '../../../group-folder.js';
import { logger } from '../../../logger.js';
import { safeJsonParse } from '../../../security.js';

export function getRouterState(
  database: Database.Database,
  key: string,
): string | undefined {
  const row = database
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(
  database: Database.Database,
  key: string,
  value: string,
): void {
  database
    .prepare('INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)')
    .run(key, value);
}

export function getSession(
  database: Database.Database,
  groupFolder: string,
): string | undefined {
  const row = database
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(
  database: Database.Database,
  groupFolder: string,
  sessionId: string,
): void {
  database
    .prepare(
      'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
    )
    .run(groupFolder, sessionId);
}

export function getAllSessions(
  database: Database.Database,
): Record<string, string> {
  const rows = database
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.group_folder] = row.session_id;
  }
  return result;
}

export function getRegisteredGroup(
  database: Database.Database,
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  const row = database
    .prepare('SELECT * FROM registered_groups WHERE jid = ?')
    .get(jid) as
    | {
        jid: string;
        name: string;
        folder: string;
        trigger_pattern: string;
        added_at: string;
        container_config: string | null;
        requires_trigger: number | null;
        is_main: number | null;
      }
    | undefined;
  if (!row) return undefined;
  if (!isValidGroupFolder(row.folder)) {
    logger.warn(
      { jid: row.jid, folder: row.folder },
      'Skipping registered group with invalid folder',
    );
    return undefined;
  }
  return {
    jid: row.jid,
    name: row.name,
    folder: row.folder,
    trigger: row.trigger_pattern,
    added_at: row.added_at,
    containerConfig: row.container_config
      ? safeJsonParse(row.container_config, undefined)
      : undefined,
    requiresTrigger:
      row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    isMain: row.is_main === 1 ? true : undefined,
  };
}

export function setRegisteredGroup(
  database: Database.Database,
  jid: string,
  group: RegisteredGroup,
): void {
  if (!isValidGroupFolder(group.folder)) {
    throw new Error(`Invalid group folder "${group.folder}" for JID ${jid}`);
  }
  database
    .prepare(
      `INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, is_main)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      jid,
      group.name,
      group.folder,
      group.trigger,
      group.added_at,
      group.containerConfig ? JSON.stringify(group.containerConfig) : null,
      group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
      group.isMain ? 1 : 0,
    );
}

export function getAllRegisteredGroups(
  database: Database.Database,
): Record<string, RegisteredGroup> {
  const rows = database
    .prepare('SELECT * FROM registered_groups')
    .all() as Array<{
    jid: string;
    name: string;
    folder: string;
    trigger_pattern: string;
    added_at: string;
    container_config: string | null;
    requires_trigger: number | null;
    is_main: number | null;
  }>;
  const result: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    if (!isValidGroupFolder(row.folder)) {
      logger.warn(
        { jid: row.jid, folder: row.folder },
        'Skipping registered group with invalid folder',
      );
      continue;
    }
    result[row.jid] = {
      name: row.name,
      folder: row.folder,
      trigger: row.trigger_pattern,
      added_at: row.added_at,
      containerConfig: row.container_config
        ? safeJsonParse(row.container_config, undefined)
        : undefined,
      requiresTrigger:
        row.requires_trigger === null ? undefined : row.requires_trigger === 1,
      isMain: row.is_main === 1 ? true : undefined,
    };
  }
  return result;
}
