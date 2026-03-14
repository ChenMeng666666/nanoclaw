import Database from 'better-sqlite3';
import { safeJsonParse } from '../../../security.js';

export function createTeamState(
  database: Database.Database,
  team: {
    id: string;
    name: string;
    description?: string;
    members: string[];
    leaderId?: string;
    collaborationMode?: 'hierarchical' | 'peer-to-peer' | 'swarm';
  },
): void {
  database
    .prepare(
      `
    INSERT OR REPLACE INTO team_states (
      id, name, description, members, leader_id, collaboration_mode, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `,
    )
    .run(
      team.id,
      team.name,
      team.description || null,
      JSON.stringify(team.members),
      team.leaderId || null,
      team.collaborationMode || 'peer-to-peer',
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

export function getTeamStateById(database: Database.Database, id: string) {
  const row = database
    .prepare('SELECT * FROM team_states WHERE id = ?')
    .get(id) as
    | {
        id: string;
        name: string;
        description?: string;
        members: string;
        leader_id?: string;
        status: string;
        collaboration_mode: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    members: safeJsonParse(row.members) as string[],
    leaderId: row.leader_id,
    status: row.status as 'active' | 'inactive' | 'dissolved',
    collaborationMode: row.collaboration_mode as
      | 'hierarchical'
      | 'peer-to-peer'
      | 'swarm',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllTeamStates(database: Database.Database) {
  const rows = database.prepare('SELECT * FROM team_states').all() as Array<{
    id: string;
    name: string;
    description?: string;
    members: string;
    leader_id?: string;
    status: string;
    collaboration_mode: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    members: safeJsonParse(row.members) as string[],
    leaderId: row.leader_id,
    status: row.status as 'active' | 'inactive' | 'dissolved',
    collaborationMode: row.collaboration_mode as
      | 'hierarchical'
      | 'peer-to-peer'
      | 'swarm',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateTeamState(
  database: Database.Database,
  id: string,
  updates: Partial<{
    name?: string;
    description?: string;
    members?: string[];
    leaderId?: string;
    status?: 'active' | 'inactive' | 'dissolved';
    collaborationMode?: 'hierarchical' | 'peer-to-peer' | 'swarm';
  }>,
): void {
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    params.push(updates.description || null);
  }
  if (updates.members !== undefined) {
    fields.push('members = ?');
    params.push(JSON.stringify(updates.members));
  }
  if (updates.leaderId !== undefined) {
    fields.push('leader_id = ?');
    params.push(updates.leaderId || null);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    params.push(updates.status);
  }
  if (updates.collaborationMode !== undefined) {
    fields.push('collaboration_mode = ?');
    params.push(updates.collaborationMode);
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  if (fields.length > 1) {
    database
      .prepare(
        `
      UPDATE team_states
      SET ${fields.join(', ')}
      WHERE id = ?
    `,
      )
      .run(...params);
  }
}

export function deleteTeamState(database: Database.Database, id: string): void {
  database.prepare('DELETE FROM team_states WHERE id = ?').run(id);
}

export function createTeamCollaborationState(
  database: Database.Database,
  state: {
    id: string;
    teamId: string;
    taskId?: string;
    status?: 'planning' | 'executing' | 'reviewing' | 'completed';
    progress?: number;
    activeAgents: string[];
  },
): void {
  database
    .prepare(
      `
    INSERT OR REPLACE INTO team_collaboration_states (
      id, team_id, task_id, status, progress, active_agents, last_activity, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      state.id,
      state.teamId,
      state.taskId || null,
      state.status || 'planning',
      state.progress || 0,
      JSON.stringify(state.activeAgents),
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

export function getTeamCollaborationStateById(
  database: Database.Database,
  id: string,
) {
  const row = database
    .prepare('SELECT * FROM team_collaboration_states WHERE id = ?')
    .get(id) as
    | {
        id: string;
        team_id: string;
        task_id?: string;
        status: string;
        progress: number;
        active_agents: string;
        last_activity: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    teamId: row.team_id,
    taskId: row.task_id,
    status: row.status as 'planning' | 'executing' | 'reviewing' | 'completed',
    progress: row.progress,
    activeAgents: safeJsonParse(row.active_agents) as string[],
    lastActivity: row.last_activity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateTeamCollaborationState(
  database: Database.Database,
  id: string,
  updates: Partial<{
    taskId?: string;
    status?: 'planning' | 'executing' | 'reviewing' | 'completed';
    progress?: number;
    activeAgents?: string[];
    lastActivity?: string;
  }>,
): void {
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.taskId !== undefined) {
    fields.push('task_id = ?');
    params.push(updates.taskId || null);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    params.push(updates.status);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    params.push(updates.progress);
  }
  if (updates.activeAgents !== undefined) {
    fields.push('active_agents = ?');
    params.push(JSON.stringify(updates.activeAgents));
  }
  if (updates.lastActivity !== undefined) {
    fields.push('last_activity = ?');
    params.push(updates.lastActivity);
  } else {
    fields.push('last_activity = ?');
    params.push(new Date().toISOString());
  }

  fields.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  if (fields.length > 1) {
    database
      .prepare(
        `
      UPDATE team_collaboration_states
      SET ${fields.join(', ')}
      WHERE id = ?
    `,
      )
      .run(...params);
  }
}

export function deleteTeamCollaborationState(
  database: Database.Database,
  id: string,
): void {
  database
    .prepare('DELETE FROM team_collaboration_states WHERE id = ?')
    .run(id);
}
