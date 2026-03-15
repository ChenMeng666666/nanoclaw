import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../../../../config.js';
import { logger } from '../../../../logger.js';
import type { RegisteredGroup } from '../../../../types/core-runtime.js';

interface JsonStateMigrationHandlers {
  setRouterState: (key: string, value: string) => void;
  setSession: (groupFolder: string, sessionId: string) => void;
  setRegisteredGroup: (jid: string, group: RegisteredGroup) => void;
}

function migrateFile(filename: string): unknown {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    fs.renameSync(filePath, `${filePath}.migrated`);
    return data;
  } catch {
    return null;
  }
}

export function migrateJsonState({
  setRouterState,
  setSession,
  setRegisteredGroup,
}: JsonStateMigrationHandlers): void {
  const routerState = migrateFile('router_state.json') as {
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  } | null;
  if (routerState) {
    if (routerState.last_timestamp) {
      setRouterState('last_timestamp', routerState.last_timestamp);
    }
    if (routerState.last_agent_timestamp) {
      setRouterState(
        'last_agent_timestamp',
        JSON.stringify(routerState.last_agent_timestamp),
      );
    }
  }

  const sessions = migrateFile('sessions.json') as Record<
    string,
    string
  > | null;
  if (sessions) {
    for (const [folder, sessionId] of Object.entries(sessions)) {
      setSession(folder, sessionId);
    }
  }

  const groups = migrateFile('registered_groups.json') as Record<
    string,
    RegisteredGroup
  > | null;
  if (groups) {
    for (const [jid, group] of Object.entries(groups)) {
      try {
        setRegisteredGroup(jid, group);
      } catch (err) {
        logger.warn(
          { jid, folder: group.folder, err },
          'Skipping migrated registered group with invalid folder',
        );
      }
    }
  }
}
