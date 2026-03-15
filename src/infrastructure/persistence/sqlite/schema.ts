import type Database from 'better-sqlite3';

export function initializeSchemaTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      user_name TEXT,
      personality TEXT,
      "values" TEXT,
      appearance TEXT,
      anthropic_token_encrypted TEXT,
      anthropic_url TEXT,
      anthropic_model TEXT DEFAULT 'claude-sonnet-4-6',
      is_active INTEGER DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_instances (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      jid TEXT NOT NULL,
      name TEXT,
      config TEXT,
      mode TEXT DEFAULT 'both',
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      channel_instance_id TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      name TEXT,
      preferences TEXT,
      memory_summary TEXT,
      last_interaction TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (channel_instance_id) REFERENCES channel_instances(id)
    );

    CREATE TABLE IF NOT EXISTS evolution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ability_name TEXT NOT NULL,
      description TEXT,
      source_agent_id TEXT,
      content TEXT,
      content_embedding BLOB,
      content_hash TEXT,
      tags TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TEXT,
      feedback TEXT,
      schema_version TEXT DEFAULT '1.5.0',
      asset_id TEXT,
      model_name TEXT,
      category TEXT DEFAULT 'learn',
      signals_match TEXT DEFAULT '[]',
      summary TEXT,
      preconditions TEXT DEFAULT '[]',
      validation_commands TEXT DEFAULT '[]',
      chain_id TEXT,
      gdi_score TEXT,
      ecosystem_status TEXT DEFAULT 'stale',
      strategy TEXT DEFAULT '[]',
      constraints TEXT DEFAULT '{}',
      validation TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capsules (
      id TEXT PRIMARY KEY,
      gene_id INTEGER NOT NULL,
      trigger TEXT DEFAULT '[]',
      summary TEXT,
      confidence REAL DEFAULT 0.0,
      blast_radius TEXT DEFAULT '{}',
      outcome TEXT DEFAULT '{}',
      env_fingerprint TEXT DEFAULT '{}',
      success_streak INTEGER DEFAULT 0,
      approved_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (gene_id) REFERENCES evolution_log(id)
    );

    CREATE TABLE IF NOT EXISTS ability_chains (
      chain_id TEXT PRIMARY KEY,
      genes TEXT DEFAULT '[]',
      capsules TEXT DEFAULT '[]',
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_flow_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      gene_id INTEGER,
      capsule_id TEXT,
      event_id TEXT,
      timestamp TEXT NOT NULL,
      success INTEGER NOT NULL,
      metrics TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS validation_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gene_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      commands TEXT DEFAULT '[]',
      success INTEGER NOT NULL,
      environment TEXT DEFAULT '{}',
      test_results TEXT,
      error TEXT,
      FOREIGN KEY (gene_id) REFERENCES evolution_log(id)
    );

    CREATE TABLE IF NOT EXISTS ecosystem_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      shannon_diversity REAL,
      avg_gdi_score REAL,
      total_genes INTEGER,
      total_capsules INTEGER,
      promoted_genes INTEGER,
      stale_genes INTEGER,
      archived_genes INTEGER
    );

    CREATE TABLE IF NOT EXISTS evolution_versions (
      id INTEGER PRIMARY KEY,
      evolution_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      content TEXT,
      change_reason TEXT,
      changed_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (evolution_id) REFERENCES evolution_log(id)
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      agent_folder TEXT NOT NULL,
      user_jid TEXT,
      session_id TEXT,
      scope TEXT DEFAULT 'agent',
      level TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      content_hash TEXT,
      importance REAL DEFAULT 0.5,
      quality_score REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT,
      message_type TEXT,
      timestamp_weight REAL,
      tags TEXT,
      source_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_folder) REFERENCES agents(folder)
    );

    CREATE TABLE IF NOT EXISTS reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_folder TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      triggered_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_folder) REFERENCES agents(folder)
    );

    CREATE TABLE IF NOT EXISTS learning_tasks (
      id TEXT PRIMARY KEY,
      agent_folder TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reflection_id INTEGER,
      resources TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (agent_folder) REFERENCES agents(folder)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_folder TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routing_bindings (
      id TEXT PRIMARY KEY,
      channel_type TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      session_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(channel_type, thread_id)
    );
    CREATE INDEX IF NOT EXISTS idx_routing_bindings_lookup
      ON routing_bindings(channel_type, thread_id);
    CREATE INDEX IF NOT EXISTS idx_routing_bindings_agent
      ON routing_bindings(agent_id);

    CREATE TABLE IF NOT EXISTS bot_identities (
      id TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      bot_name TEXT NOT NULL,
      bot_avatar TEXT,
      is_active INTEGER DEFAULT 1,
      config TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(chat_jid),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bot_identities_chat ON bot_identities(chat_jid);
    CREATE INDEX IF NOT EXISTS idx_bot_identities_agent ON bot_identities(agent_id);

    CREATE TABLE IF NOT EXISTS collaboration_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      team_id TEXT,
      assigned_agents TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      progress REAL DEFAULT 0,
      dependencies TEXT DEFAULT '[]',
      context TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_collaboration_tasks_status ON collaboration_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_collaboration_tasks_team ON collaboration_tasks(team_id);
    CREATE INDEX IF NOT EXISTS idx_collaboration_tasks_priority ON collaboration_tasks(priority);

    CREATE TABLE IF NOT EXISTS collaboration_task_assignments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'accepted',
      assigned_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (task_id) REFERENCES collaboration_tasks(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON collaboration_task_assignments(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_assignments_agent ON collaboration_task_assignments(agent_id);

    CREATE TABLE IF NOT EXISTS team_states (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      members TEXT DEFAULT '[]',
      leader_id TEXT,
      status TEXT DEFAULT 'active',
      collaboration_mode TEXT DEFAULT 'peer-to-peer',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_team_states_status ON team_states(status);
    CREATE INDEX IF NOT EXISTS idx_team_states_leader ON team_states(leader_id);

    CREATE TABLE IF NOT EXISTS team_collaboration_states (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      task_id TEXT,
      status TEXT DEFAULT 'planning',
      progress REAL DEFAULT 0,
      active_agents TEXT DEFAULT '[]',
      last_activity TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES team_states(id),
      FOREIGN KEY (task_id) REFERENCES collaboration_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_collaboration_team ON team_collaboration_states(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_collaboration_task ON team_collaboration_states(task_id);

    CREATE INDEX IF NOT EXISTS idx_memories_agent_level ON memories(agent_folder, level);
    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_jid);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
    CREATE INDEX IF NOT EXISTS idx_evolution_status ON evolution_log(status);
    CREATE INDEX IF NOT EXISTS idx_channel_instances_agent ON channel_instances(agent_id);
    CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_folder);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

    CREATE TABLE IF NOT EXISTS learning_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      agent_folder TEXT NOT NULL,
      metric_before REAL,
      metric_after REAL,
      metric_name TEXT,
      status TEXT NOT NULL,
      description TEXT,
      signals TEXT,
      gene_id TEXT,
      blast_radius TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_learning_results_agent ON learning_results(agent_folder);
    CREATE INDEX IF NOT EXISTS idx_learning_results_task ON learning_results(task_id);
    CREATE INDEX IF NOT EXISTS idx_learning_results_status ON learning_results(status);

    CREATE TABLE IF NOT EXISTS operation_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      operation_type TEXT NOT NULL,
      group_folder TEXT,
      chat_jid TEXT,
      before_state TEXT NOT NULL,
      after_state TEXT,
      timestamp TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      description TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_operation_snapshots_operation_id ON operation_snapshots(operation_id);
    CREATE INDEX IF NOT EXISTS idx_operation_snapshots_group ON operation_snapshots(group_folder);
    CREATE INDEX IF NOT EXISTS idx_operation_snapshots_status ON operation_snapshots(status);
    CREATE INDEX IF NOT EXISTS idx_operation_snapshots_time ON operation_snapshots(timestamp DESC);
  `);
}
