# Agent 独立运行单元 - 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Agent 作为独立运行单元，包括身份模型、配置模型和运行模型

**Architecture:** 采用部分集成方案（方案 B），在现有架构基础上引入 agent 抽象，使用 `// [CUSTOM]` 标记确保非侵入式扩展

**Tech Stack:** TypeScript, better-sqlite3, Zod

---

## 文件结构预览

**新建文件：**
- `src/custom/agent/types.ts` - Agent 类型定义
- `src/custom/agent/db.ts` - Agent 数据库操作
- `src/custom/agent/config.ts` - Agent 配置管理
- `src/custom/agent/api.ts` - Agent API 接口
- `src/custom/agent/ipc.ts` - Agent IPC 接口
- `src/custom/agent/types.test.ts` - 类型测试
- `src/custom/agent/db.test.ts` - 数据库测试
- `src/custom/agent/config.test.ts` - 配置测试

**修改文件：**
- `src/db.ts:85` - 新增 agent 相关表和迁移
- `src/types.ts:108` - 新增 agent 类型
- `src/container-runner.ts:1` - 添加 agent 支持
- `src/index.ts:1` - 添加 agent 消息路由
- `src/ipc.ts:1` - 添加 agent IPC 处理

---

## Task 1: 类型定义

**Files:**
- Create: `src/custom/agent/types.ts`
- Test: `src/custom/agent/types.test.ts`
- Modify: `src/types.ts:108`

- [ ] **Step 1.1: 创建类型定义文件**

```typescript
// src/custom/agent/types.ts
import { z } from 'zod';

// Agent 核心类型
export interface Agent {
  id: string;
  name: string;
  role: string;
  type: 'system' | 'user';
  status: 'active' | 'paused' | 'archived';
  description?: string;
  system_prompt?: string;
  created_at: string;
  updated_at: string;
}

// Agent 身份信息（存储在 identity.json）
export interface AgentIdentity {
  name: string;
  role: string;
  system_prompt?: string;
}

// Agent 模型配置
export interface AgentModelConfig {
  model: string;
  base_url: string;
  auth_mode: 'proxy' | 'direct';
}

// Agent 运行配置
export interface AgentRuntimeConfig {
  container_timeout: number;
  memory_limit: string;
  mount_strategy: 'group_inherit' | 'custom';
  additional_mounts: Array<{
    hostPath: string;
    containerPath?: string;
    readonly?: boolean;
  }>;
}

// Agent 完整配置（存储在 config.json）
export interface AgentConfig {
  model_config: AgentModelConfig;
  runtime_config: AgentRuntimeConfig;
}

// Agent 与 Group 关联
export interface AgentGroupAssociation {
  id: string;
  agent_id: string;
  group_folder: string;
  is_primary: boolean;
}

// Zod schemas for validation
export const AgentModelConfigSchema = z.object({
  model: z.string().default('claude-3-sonnet-20250219'),
  base_url: z.string().url().default('https://api.anthropic.com'),
  auth_mode: z.enum(['proxy', 'direct']).default('proxy'),
});

export const AgentRuntimeConfigSchema = z.object({
  container_timeout: z.number().int().positive().default(1800000),
  memory_limit: z.string().default('4g'),
  mount_strategy: z.enum(['group_inherit', 'custom']).default('group_inherit'),
  additional_mounts: z.array(z.object({
    hostPath: z.string(),
    containerPath: z.string().optional(),
    readonly: z.boolean().optional(),
  })).default([]),
});

export const AgentConfigSchema = z.object({
  model_config: AgentModelConfigSchema,
  runtime_config: AgentRuntimeConfigSchema,
});

export const AgentIdentitySchema = z.object({
  name: z.string(),
  role: z.string(),
  system_prompt: z.string().optional(),
});

// API 输入类型
export interface CreateAgentInput {
  name: string;
  role: string;
  type?: 'system' | 'user';
  identity?: Partial<AgentIdentity>;
  config?: Partial<AgentConfig>;
}

export interface ListAgentsInput {
  status?: 'active' | 'paused' | 'archived';
  type?: 'system' | 'user';
}

export interface UpdateAgentInput {
  agentId: string;
  updates: Partial<CreateAgentInput>;
}

export interface DeleteAgentInput {
  agentId: string;
  keepWorkspace?: boolean;
}

export interface RunAgentInput {
  agentId: string;
  prompt: string;
  contextMode?: 'isolated' | 'group';
}

export interface BindAgentToGroupInput {
  agentId: string;
  groupFolder: string;
  isPrimary?: boolean;
}
```

- [ ] **Step 1.2: 在 src/types.ts 中导入并导出 agent 类型**

在 `src/types.ts` 文件末尾添加：

```typescript
// [CUSTOM: agent-types] 开始

// Agent types
export type {
  Agent,
  AgentIdentity,
  AgentModelConfig,
  AgentRuntimeConfig,
  AgentConfig,
  AgentGroupAssociation,
  CreateAgentInput,
  ListAgentsInput,
  UpdateAgentInput,
  DeleteAgentInput,
  RunAgentInput,
  BindAgentToGroupInput,
} from './custom/agent/types.js';

// [CUSTOM] 结束
```

- [ ] **Step 1.3: 创建类型测试文件**

```typescript
// src/custom/agent/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  AgentModelConfigSchema,
  AgentRuntimeConfigSchema,
  AgentConfigSchema,
  AgentIdentitySchema,
} from './types.js';

describe('Agent Types', () => {
  describe('AgentModelConfigSchema', () => {
    it('should validate with minimal input', () => {
      const result = AgentModelConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should use defaults', () => {
      const result = AgentModelConfigSchema.parse({});
      expect(result.model).toBe('claude-3-sonnet-20250219');
      expect(result.base_url).toBe('https://api.anthropic.com');
      expect(result.auth_mode).toBe('proxy');
    });

    it('should accept custom values', () => {
      const result = AgentModelConfigSchema.parse({
        model: 'claude-3-opus-20250219',
        base_url: 'https://api.example.com',
        auth_mode: 'direct',
      });
      expect(result.model).toBe('claude-3-opus-20250219');
    });
  });

  describe('AgentRuntimeConfigSchema', () => {
    it('should validate with minimal input', () => {
      const result = AgentRuntimeConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should use defaults', () => {
      const result = AgentRuntimeConfigSchema.parse({});
      expect(result.container_timeout).toBe(1800000);
      expect(result.memory_limit).toBe('4g');
      expect(result.mount_strategy).toBe('group_inherit');
      expect(result.additional_mounts).toEqual([]);
    });
  });

  describe('AgentConfigSchema', () => {
    it('should validate with empty config', () => {
      const result = AgentConfigSchema.safeParse({
        model_config: {},
        runtime_config: {},
      });
      expect(result.success).toBe(true);
    });
  });

  describe('AgentIdentitySchema', () => {
    it('should validate with required fields', () => {
      const result = AgentIdentitySchema.safeParse({
        name: 'Mimi',
        role: '首席决策辅助',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional system_prompt', () => {
      const result = AgentIdentitySchema.parse({
        name: 'Mimi',
        role: '首席决策辅助',
        system_prompt: '你是米米...',
      });
      expect(result.system_prompt).toBe('你是米米...');
    });
  });
});
```

- [ ] **Step 1.4: 运行类型测试**

Run: `npm test src/custom/agent/types.test.ts -v`
Expected: All tests pass

- [ ] **Step 1.5: Commit**

```bash
git add src/custom/agent/types.ts src/custom/agent/types.test.ts src/types.ts
git commit -m "feat(agent): 新增 agent 类型定义"
```

---

## Task 2: 数据库层

**Files:**
- Create: `src/custom/agent/db.ts`
- Test: `src/custom/agent/db.test.ts`
- Modify: `src/db.ts:85`

- [ ] **Step 2.1: 创建数据库操作文件**

```typescript
// src/custom/agent/db.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { DATA_DIR } from '../../config.js';
import { logger } from '../../logger.js';
import {
  Agent,
  AgentIdentity,
  AgentConfig,
  AgentGroupAssociation,
  CreateAgentInput,
  ListAgentsInput,
  UpdateAgentInput,
  BindAgentToGroupInput,
  AgentConfigSchema,
  AgentIdentitySchema,
} from './types.js';

const AGENTS_DIR = path.join(DATA_DIR, 'agents');

// 确保 agents 目录存在
function ensureAgentsDir(): void {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }
}

// 获取 agent 工作区路径
function getAgentPath(agentId: string): string {
  return path.join(AGENTS_DIR, agentId);
}

// 初始化 agent 工作区
function initAgentWorkspace(agentId: string): void {
  const agentPath = getAgentPath(agentId);
  if (!fs.existsSync(agentPath)) {
    fs.mkdirSync(agentPath, { recursive: true });
    fs.mkdirSync(path.join(agentPath, 'workspace'), { recursive: true });
    fs.mkdirSync(path.join(agentPath, 'workspace', 'files'), { recursive: true });
    fs.mkdirSync(path.join(agentPath, 'workspace', 'temp'), { recursive: true });
    fs.mkdirSync(path.join(agentPath, 'logs'), { recursive: true });
  }
}

// 加载 agent 配置
export function loadAgentConfig(agentId: string): AgentConfig {
  const configPath = path.join(getAgentPath(agentId), 'config.json');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    return AgentConfigSchema.parse(JSON.parse(content));
  }
  // 返回默认配置
  return AgentConfigSchema.parse({
    model_config: {},
    runtime_config: {},
  });
}

// 保存 agent 配置
export function saveAgentConfig(agentId: string, config: Partial<AgentConfig>): void {
  ensureAgentsDir();
  initAgentWorkspace(agentId);

  const existingConfig = loadAgentConfig(agentId);
  const mergedConfig = {
    ...existingConfig,
    ...config,
    model_config: {
      ...existingConfig.model_config,
      ...config.model_config,
    },
    runtime_config: {
      ...existingConfig.runtime_config,
      ...config.runtime_config,
    },
  };

  const validatedConfig = AgentConfigSchema.parse(mergedConfig);
  const configPath = path.join(getAgentPath(agentId), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(validatedConfig, null, 2));
}

// 加载 agent 身份信息
export function loadAgentIdentity(agentId: string): AgentIdentity | null {
  const identityPath = path.join(getAgentPath(agentId), 'identity.json');
  if (fs.existsSync(identityPath)) {
    const content = fs.readFileSync(identityPath, 'utf-8');
    return AgentIdentitySchema.parse(JSON.parse(content));
  }
  return null;
}

// 保存 agent 身份信息
export function saveAgentIdentity(agentId: string, identity: Partial<AgentIdentity>): void {
  ensureAgentsDir();
  initAgentWorkspace(agentId);

  const existingIdentity = loadAgentIdentity(agentId) || { name: '', role: '' };
  const mergedIdentity = { ...existingIdentity, ...identity };
  const validatedIdentity = AgentIdentitySchema.parse(mergedIdentity);

  const identityPath = path.join(getAgentPath(agentId), 'identity.json');
  fs.writeFileSync(identityPath, JSON.stringify(validatedIdentity, null, 2));
}

// 删除 agent 工作区
export function deleteAgentWorkspace(agentId: string, keepWorkspace = false): void {
  const agentPath = getAgentPath(agentId);
  if (fs.existsSync(agentPath)) {
    if (keepWorkspace) {
      // 保留但归档
      const archivePath = path.join(AGENTS_DIR, `${agentId}-archived-${Date.now()}`);
      fs.renameSync(agentPath, archivePath);
    } else {
      // 完全删除
      fs.rmSync(agentPath, { recursive: true, force: true });
    }
  }
}

// --- 数据库操作 ---

export function initAgentTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      system_prompt TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_group_associations (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      group_folder TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_group_associations_agent_id ON agent_group_associations(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_group_associations_group_folder ON agent_group_associations(group_folder);
  `);
}

export function createAgent(db: Database.Database, input: CreateAgentInput): Agent {
  const id = randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO agents (id, name, role, type, status, description, system_prompt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.name,
    input.role,
    input.type || 'user',
    'active',
    input.identity?.name || null,
    input.identity?.system_prompt || null,
    now,
    now,
  );

  // 初始化工作区和配置
  if (input.identity) {
    saveAgentIdentity(id, input.identity);
  }
  if (input.config) {
    saveAgentConfig(id, input.config);
  }

  return getAgent(db, id)!;
}

export function getAgent(db: Database.Database, agentId: string): Agent | null {
  const stmt = db.prepare('SELECT * FROM agents WHERE id = ?');
  const row = stmt.get(agentId);
  return row ? (row as Agent) : null;
}

export function listAgents(db: Database.Database, input?: ListAgentsInput): Agent[] {
  let query = 'SELECT * FROM agents WHERE 1=1';
  const params: string[] = [];

  if (input?.status) {
    query += ' AND status = ?';
    params.push(input.status);
  }
  if (input?.type) {
    query += ' AND type = ?';
    params.push(input.type);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);
  return rows as Agent[];
}

export function updateAgent(db: Database.Database, input: UpdateAgentInput): Agent | null {
  const agent = getAgent(db, input.agentId);
  if (!agent) return null;

  const now = new Date().toISOString();
  const updates: string[] = [];
  const params: (string | null)[] = [];

  if (input.updates.name !== undefined) {
    updates.push('name = ?');
    params.push(input.updates.name);
  }
  if (input.updates.role !== undefined) {
    updates.push('role = ?');
    params.push(input.updates.role);
  }
  if (input.updates.type !== undefined) {
    updates.push('type = ?');
    params.push(input.updates.type);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(now);
    params.push(input.agentId);

    const stmt = db.prepare(`
      UPDATE agents SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
  }

  // 更新文件系统中的配置
  if (input.updates.identity) {
    saveAgentIdentity(input.agentId, input.updates.identity);
  }
  if (input.updates.config) {
    saveAgentConfig(input.agentId, input.updates.config);
  }

  return getAgent(db, input.agentId);
}

export function deleteAgent(db: Database.Database, agentId: string, keepWorkspace = false): boolean {
  const agent = getAgent(db, agentId);
  if (!agent) return false;

  // 删除关联
  db.prepare('DELETE FROM agent_group_associations WHERE agent_id = ?').run(agentId);

  // 删除 agent
  db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);

  // 删除工作区
  deleteAgentWorkspace(agentId, keepWorkspace);

  return true;
}

export function bindAgentToGroup(
  db: Database.Database,
  input: BindAgentToGroupInput,
): AgentGroupAssociation {
  const id = randomUUID();

  // 如果是 primary，先取消其他 agent 的 primary
  if (input.isPrimary) {
    db.prepare(`
      UPDATE agent_group_associations
      SET is_primary = 0
      WHERE group_folder = ?
    `).run(input.groupFolder);
  }

  // 检查是否已存在
  const existing = db.prepare(`
    SELECT * FROM agent_group_associations
    WHERE agent_id = ? AND group_folder = ?
  `).get(input.agentId, input.groupFolder);

  if (existing) {
    // 更新
    db.prepare(`
      UPDATE agent_group_associations
      SET is_primary = ?
      WHERE agent_id = ? AND group_folder = ?
    `).run(input.isPrimary ? 1 : 0, input.agentId, input.groupFolder);

    return db.prepare(`
      SELECT * FROM agent_group_associations
      WHERE agent_id = ? AND group_folder = ?
    `).get(input.agentId, input.groupFolder) as AgentGroupAssociation;
  }

  // 新建
  const stmt = db.prepare(`
    INSERT INTO agent_group_associations (id, agent_id, group_folder, is_primary)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, input.agentId, input.groupFolder, input.isPrimary ? 1 : 0);

  return db.prepare('SELECT * FROM agent_group_associations WHERE id = ?')
    .get(id) as AgentGroupAssociation;
}

export function getPrimaryAgentByGroup(
  db: Database.Database,
  groupFolder: string,
): Agent | null {
  const row = db.prepare(`
    SELECT a.* FROM agents a
    INNER JOIN agent_group_associations aga ON a.id = aga.agent_id
    WHERE aga.group_folder = ? AND aga.is_primary = 1 AND a.status = 'active'
    LIMIT 1
  `).get(groupFolder);

  return row ? (row as Agent) : null;
}

export function getAgentsByGroup(
  db: Database.Database,
  groupFolder: string,
): Agent[] {
  const rows = db.prepare(`
    SELECT a.* FROM agents a
    INNER JOIN agent_group_associations aga ON a.id = aga.agent_id
    WHERE aga.group_folder = ? AND a.status = 'active'
    ORDER BY aga.is_primary DESC, a.created_at DESC
  `).all(groupFolder);

  return rows as Agent[];
}
```

- [ ] **Step 2.2: 修改 src/db.ts 添加 agent 表初始化**

在 `src/db.ts` 的 `createSchema` 函数中，在现有表创建之后添加：

```typescript
// [CUSTOM: agent-db] 开始
import { initAgentTables } from './custom/agent/db.js';
// [CUSTOM] 结束

function createSchema(database: Database.Database): void {
  database.exec(`
    -- ... 现有表 ...
  `);

  // [CUSTOM: agent-db] 开始
  // 初始化 agent 相关表
  initAgentTables(database);
  // [CUSTOM] 结束

  // ... 现有迁移代码 ...
}
```

- [ ] **Step 2.3: 创建数据库测试文件**

```typescript
// src/custom/agent/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

import * as agentDb from './db.js';
import { DATA_DIR } from '../../config.js';

// Mock DATA_DIR
const TEST_DATA_DIR = join(tmpdir(), `nanoclaw-test-${randomUUID()}`);

describe('Agent DB', () => {
  let db: Database.Database;
  let originalDataDir: string;

  beforeEach(() => {
    originalDataDir = DATA_DIR;
    // @ts-ignore - override for test
    DATA_DIR = TEST_DATA_DIR;
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    db = new Database(':memory:');
    agentDb.initAgentTables(db);
  });

  afterEach(() => {
    db.close();
    // @ts-ignore - restore
    DATA_DIR = originalDataDir;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('createAgent', () => {
    it('should create an agent with minimal input', () => {
      const agent = agentDb.createAgent(db, {
        name: 'Mimi',
        role: '首席决策辅助',
      });

      expect(agent.id).toBeTruthy();
      expect(agent.name).toBe('Mimi');
      expect(agent.role).toBe('首席决策辅助');
      expect(agent.type).toBe('user');
      expect(agent.status).toBe('active');
    });

    it('should create a system agent', () => {
      const agent = agentDb.createAgent(db, {
        name: 'System',
        role: 'System Agent',
        type: 'system',
      });

      expect(agent.type).toBe('system');
    });
  });

  describe('getAgent', () => {
    it('should retrieve an existing agent', () => {
      const created = agentDb.createAgent(db, {
        name: 'Mimi',
        role: '首席决策辅助',
      });

      const retrieved = agentDb.getAgent(db, created.id);

      expect(retrieved).toBeTruthy();
      expect(retrieved?.name).toBe('Mimi');
    });

    it('should return null for non-existent agent', () => {
      const agent = agentDb.getAgent(db, 'non-existent');
      expect(agent).toBeNull();
    });
  });

  describe('listAgents', () => {
    it('should list all agents', () => {
      agentDb.createAgent(db, { name: 'Mimi', role: 'A' });
      agentDb.createAgent(db, { name: 'Dev', role: 'B' });

      const agents = agentDb.listAgents(db);

      expect(agents.length).toBe(2);
    });

    it('should filter by status', () => {
      agentDb.createAgent(db, { name: 'Mimi', role: 'A' });

      const activeAgents = agentDb.listAgents(db, { status: 'active' });
      expect(activeAgents.length).toBe(1);

      const pausedAgents = agentDb.listAgents(db, { status: 'paused' });
      expect(pausedAgents.length).toBe(0);
    });
  });

  describe('updateAgent', () => {
    it('should update agent fields', () => {
      const agent = agentDb.createAgent(db, { name: 'Old', role: 'Old Role' });

      const updated = agentDb.updateAgent(db, {
        agentId: agent.id,
        updates: { name: 'New', role: 'New Role' },
      });

      expect(updated).toBeTruthy();
      expect(updated?.name).toBe('New');
      expect(updated?.role).toBe('New Role');
    });
  });

  describe('bindAgentToGroup', () => {
    it('should bind agent to group', () => {
      const agent = agentDb.createAgent(db, { name: 'Mimi', role: 'A' });

      const association = agentDb.bindAgentToGroup(db, {
        agentId: agent.id,
        groupFolder: 'test-group',
        isPrimary: true,
      });

      expect(association.agent_id).toBe(agent.id);
      expect(association.group_folder).toBe('test-group');
      expect(association.is_primary).toBe(1);
    });
  });

  describe('getPrimaryAgentByGroup', () => {
    it('should get primary agent for group', () => {
      const agent1 = agentDb.createAgent(db, { name: 'Mimi', role: 'A' });
      const agent2 = agentDb.createAgent(db, { name: 'Dev', role: 'B' });

      agentDb.bindAgentToGroup(db, {
        agentId: agent1.id,
        groupFolder: 'test-group',
        isPrimary: false,
      });
      agentDb.bindAgentToGroup(db, {
        agentId: agent2.id,
        groupFolder: 'test-group',
        isPrimary: true,
      });

      const primary = agentDb.getPrimaryAgentByGroup(db, 'test-group');

      expect(primary).toBeTruthy();
      expect(primary?.id).toBe(agent2.id);
    });
  });

  describe('deleteAgent', () => {
    it('should delete an agent', () => {
      const agent = agentDb.createAgent(db, { name: 'Mimi', role: 'A' });

      const result = agentDb.deleteAgent(db, agent.id);

      expect(result).toBe(true);
      expect(agentDb.getAgent(db, agent.id)).toBeNull();
    });
  });

  describe('config and identity files', () => {
    it('should save and load config', () => {
      const agent = agentDb.createAgent(db, {
        name: 'Mimi',
        role: 'A',
        config: {
          model_config: { model: 'claude-3-opus-20250219' },
        },
      });

      const config = agentDb.loadAgentConfig(agent.id);

      expect(config.model_config.model).toBe('claude-3-opus-20250219');
    });

    it('should save and load identity', () => {
      const agent = agentDb.createAgent(db, {
        name: 'Mimi',
        role: 'A',
        identity: {
          name: 'Mimi',
          role: '首席决策辅助',
          system_prompt: '你是米米...',
        },
      });

      const identity = agentDb.loadAgentIdentity(agent.id);

      expect(identity).toBeTruthy();
      expect(identity?.name).toBe('Mimi');
      expect(identity?.system_prompt).toBe('你是米米...');
    });
  });
});
```

- [ ] **Step 2.4: 运行数据库测试**

Run: `npm test src/custom/agent/db.test.ts -v`
Expected: All tests pass

- [ ] **Step 2.5: Commit**

```bash
git add src/custom/agent/db.ts src/custom/agent/db.test.ts src/db.ts
git commit -m "feat(agent): 新增 agent 数据库操作层"
```

---

## Task 3: 配置管理

**Files:**
- Create: `src/custom/agent/config.ts`
- Test: `src/custom/agent/config.test.ts`

- [ ] **Step 3.1: 创建配置管理文件**

```typescript
// src/custom/agent/config.ts
import path from 'path';
import { DATA_DIR } from '../../config.js';
import { Agent, AgentConfig, AgentIdentity } from './types.js';
import { loadAgentConfig, loadAgentIdentity, getAgent } from './db.js';
import Database from 'better-sqlite3';

// 获取 agent 完整上下文（用于 container 运行）
export interface AgentContext {
  agent: Agent;
  identity: AgentIdentity | null;
  config: AgentConfig;
}

export function getAgentContext(
  db: Database.Database,
  agentId: string,
): AgentContext | null {
  const agent = getAgent(db, agentId);
  if (!agent) return null;

  const identity = loadAgentIdentity(agentId);
  const config = loadAgentConfig(agentId);

  return { agent, identity, config };
}

// 格式化 agent 的 system prompt
export function formatAgentSystemPrompt(context: AgentContext): string {
  const parts: string[] = [];

  if (context.identity?.system_prompt) {
    parts.push(context.identity.system_prompt);
  }

  if (context.agent.description) {
    parts.push(`\n\n## Agent 描述\n${context.agent.description}`);
  }

  return parts.join('\n');
}

// 获取 agent 工作区路径
export function getAgentWorkspacePath(agentId: string): string {
  return path.join(DATA_DIR, 'agents', agentId, 'workspace');
}

// 获取 agent 日志路径
export function getAgentLogsPath(agentId: string): string {
  return path.join(DATA_DIR, 'agents', agentId, 'logs');
}

// 创建默认 agent（用于现有 group 的首次使用）
export function createDefaultAgentForGroup(
  db: Database.Database,
  groupName: string,
  groupFolder: string,
): Agent {
  const agent = createAgent(db, {
    name: groupName,
    role: '默认协作助手',
    type: 'user',
    identity: {
      name: groupName,
      role: '默认协作助手',
    },
  });

  bindAgentToGroup(db, {
    agentId: agent.id,
    groupFolder,
    isPrimary: true,
  });

  return agent;
}

// 从现有函数导入（避免循环依赖问题）
import { createAgent, bindAgentToGroup } from './db.js';
```

- [ ] **Step 3.2: 修复循环依赖 - 重新组织 db.ts**

在 `src/custom/agent/db.ts` 末尾添加：

```typescript
// 导出给 config.ts 使用
export { createAgent, bindAgentToGroup };
```

- [ ] **Step 3.3: 创建配置测试文件**

```typescript
// src/custom/agent/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

import * as agentDb from './db.js';
import * as agentConfig from './config.js';
import { DATA_DIR } from '../../config.js';

const TEST_DATA_DIR = join(tmpdir(), `nanoclaw-test-${randomUUID()}`);

describe('Agent Config', () => {
  let db: Database.Database;
  let originalDataDir: string;

  beforeEach(() => {
    originalDataDir = DATA_DIR;
    // @ts-ignore
    DATA_DIR = TEST_DATA_DIR;
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    db = new Database(':memory:');
    agentDb.initAgentTables(db);
  });

  afterEach(() => {
    db.close();
    // @ts-ignore
    DATA_DIR = originalDataDir;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('getAgentContext', () => {
    it('should get agent context with identity and config', () => {
      const agent = agentDb.createAgent(db, {
        name: 'Mimi',
        role: '首席决策辅助',
        identity: {
          name: 'Mimi',
          role: '首席决策辅助',
          system_prompt: '你是米米...',
        },
        config: {
          model_config: { model: 'claude-3-opus-20250219' },
        },
      });

      const context = agentConfig.getAgentContext(db, agent.id);

      expect(context).toBeTruthy();
      expect(context?.agent.id).toBe(agent.id);
      expect(context?.identity?.system_prompt).toBe('你是米米...');
      expect(context?.config.model_config.model).toBe('claude-3-opus-20250219');
    });

    it('should return null for non-existent agent', () => {
      const context = agentConfig.getAgentContext(db, 'non-existent');
      expect(context).toBeNull();
    });
  });

  describe('formatAgentSystemPrompt', () => {
    it('should format system prompt from identity', () => {
      const agent = agentDb.createAgent(db, {
        name: 'Mimi',
        role: '首席决策辅助',
        identity: {
          name: 'Mimi',
          role: '首席决策辅助',
          system_prompt: '你是米米...',
        },
      });

      const context = agentConfig.getAgentContext(db, agent.id)!;
      const prompt = agentConfig.formatAgentSystemPrompt(context);

      expect(prompt).toContain('你是米米...');
    });
  });

  describe('createDefaultAgentForGroup', () => {
    it('should create default agent and bind to group', () => {
      const agent = agentConfig.createDefaultAgentForGroup(
        db,
        'Test Group',
        'test-group',
      );

      expect(agent.name).toBe('Test Group');
      expect(agent.role).toBe('默认协作助手');

      const primary = agentDb.getPrimaryAgentByGroup(db, 'test-group');
      expect(primary?.id).toBe(agent.id);
    });
  });
});
```

- [ ] **Step 3.4: 运行配置测试**

Run: `npm test src/custom/agent/config.test.ts -v`
Expected: All tests pass

- [ ] **Step 3.5: Commit**

```bash
git add src/custom/agent/config.ts src/custom/agent/config.test.ts
git commit -m "feat(agent): 新增 agent 配置管理层"
```

---

## Task 4: Container Runner 改造

**Files:**
- Modify: `src/container-runner.ts:1`

- [ ] **Step 4.1: 在 src/container-runner.ts 顶部添加导入**

```typescript
// [CUSTOM: agent-support] 开始
import type { AgentContext, AgentConfig } from './custom/agent/types.js';
import { getAgentWorkspacePath } from './custom/agent/config.js';
// [CUSTOM] 结束
```

- [ ] **Step 4.2: 扩展 ContainerInput 接口**

找到现有的 `ContainerInput` 接口，添加 agent 字段：

```typescript
interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  // [CUSTOM: agent-support] 开始
  agentId?: string;
  agentContext?: AgentContext;
  // [CUSTOM] 结束
}
```

- [ ] **Step 4.3: 添加 agent 配置处理函数**

在合适位置添加：

```typescript
// [CUSTOM: agent-support] 开始

/**
 * 使用 agent 配置构建环境变量
 */
function buildAgentEnv(config: AgentConfig): Record<string, string> {
  const env: Record<string, string> = {};

  if (config.model_config.model) {
    env.ANTHROPIC_MODEL = config.model_config.model;
  }
  if (config.model_config.base_url) {
    env.ANTHROPIC_BASE_URL = config.model_config.base_url;
  }
  if (config.model_config.auth_mode) {
    env.ANTHROPIC_AUTH_MODE = config.model_config.auth_mode;
  }

  return env;
}

/**
 * 获取 agent 工作区挂载配置
 */
function getAgentMounts(agentId?: string): Array<{ source: string; target: string; readonly?: boolean }> {
  if (!agentId) return [];

  const workspacePath = getAgentWorkspacePath(agentId);
  return [
    {
      source: workspacePath,
      target: '/workspace/agent',
      readonly: false,
    },
  ];
}

// [CUSTOM] 结束
```

- [ ] **Step 4.4: 修改 runContainerAgent 函数**

在 `runContainerAgent` 函数开头添加：

```typescript
async function runContainerAgent(input: ContainerInput): Promise<ContainerOutput> {
  // [CUSTOM: agent-support] 开始
  let agentEnv: Record<string, string> = {};
  let agentMounts: Array<{ source: string; target: string; readonly?: boolean }> = [];

  if (input.agentContext) {
    agentEnv = buildAgentEnv(input.agentContext.config);
    agentMounts = getAgentMounts(input.agentId);
  }
  // [CUSTOM] 结束

  // ... 现有代码 ...

  // 合并 agent 环境变量
  const env = {
    ...process.env,
    ...agentEnv,
    // ... 现有环境变量 ...
  };

  // 合并 agent 挂载
  const mounts = [
    // ... 现有挂载 ...
    ...agentMounts,
  ];

  // ... 剩余代码 ...
}
```

- [ ] **Step 4.5: 运行现有容器测试**

Run: `npm test src/container-runner.test.ts -v`
Expected: All tests pass

- [ ] **Step 4.6: Commit**

```bash
git add src/container-runner.ts
git commit -m "feat(agent): 改造 container-runner 支持 agent"
```

---

## Task 5: 消息路由改造

**Files:**
- Modify: `src/index.ts:1`

- [ ] **Step 5.1: 在 src/index.ts 顶部添加导入**

```typescript
// [CUSTOM: agent-support] 开始
import {
  getAgentContext,
  getPrimaryAgentByGroup,
  formatAgentSystemPrompt,
  createDefaultAgentForGroup,
} from './custom/agent/config.js';
import { getAgent, loadAgentIdentity, loadAgentConfig } from './custom/agent/db.js';
// [CUSTOM] 结束
```

- [ ] **Step 5.2: 添加 agent 辅助函数**

在合适位置添加：

```typescript
// [CUSTOM: agent-support] 开始

/**
 * 获取或创建 group 的默认 agent
 */
async function getOrCreatePrimaryAgent(groupFolder: string, groupName: string) {
  let agent = getPrimaryAgentByGroup(db, groupFolder);

  if (!agent) {
    // 自动创建默认 agent
    agent = createDefaultAgentForGroup(db, groupName, groupFolder);
  }

  return agent;
}

/**
 * 使用 agent 上下文格式化 prompt
 */
function formatPromptWithAgent(
  messages: any[],
  groupFolder: string,
  groupName: string,
) {
  const agent = getOrCreatePrimaryAgent(groupFolder, groupName);
  const agentContext = getAgentContext(db, agent.id);

  let systemPrompt = '';
  if (agentContext) {
    systemPrompt = formatAgentSystemPrompt(agentContext);
  }

  // 组合现有 prompt 和 agent system prompt
  const basePrompt = formatMessages(messages);

  if (systemPrompt) {
    return `${systemPrompt}\n\n${basePrompt}`;
  }

  return basePrompt;
}

// [CUSTOM] 结束
```

- [ ] **Step 5.3: 修改 processGroupMessages 函数**

在 `processGroupMessages` 函数中，找到调用 `formatMessages` 的位置，替换为：

```typescript
async function processGroupMessages(groupFolder: string) {
  // ... 现有代码 ...

  // [CUSTOM: agent-support] 开始
  const prompt = formatPromptWithAgent(messages, groupFolder, chat.name || groupFolder);
  // [CUSTOM] 结束

  // ... 剩余代码 ...
}
```

- [ ] **Step 5.4: 运行类型检查**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 5.5: Commit**

```bash
git add src/index.ts
git commit -m "feat(agent): 改造消息路由支持 agent"
```

---

## Task 6: IPC 接口

**Files:**
- Create: `src/custom/agent/ipc.ts`
- Modify: `src/ipc.ts:1`

- [ ] **Step 6.1: 创建 IPC 处理文件**

```typescript
// src/custom/agent/ipc.ts
import Database from 'better-sqlite3';
import {
  CreateAgentInput,
  ListAgentsInput,
  UpdateAgentInput,
  DeleteAgentInput,
  RunAgentInput,
  BindAgentToGroupInput,
} from './types.js';
import * as agentDb from './db.js';
import { getAgentContext } from './config.js';

interface IpcResult {
  success: boolean;
  data?: any;
  error?: string;
}

export function handleAgentIpc(
  db: Database.Database,
  type: string,
  payload: any,
): IpcResult {
  try {
    switch (type) {
      case 'create_agent':
        return handleCreateAgent(db, payload as CreateAgentInput);
      case 'list_agents':
        return handleListAgents(db, payload as ListAgentsInput);
      case 'update_agent':
        return handleUpdateAgent(db, payload as UpdateAgentInput);
      case 'delete_agent':
        return handleDeleteAgent(db, payload as DeleteAgentInput);
      case 'bind_agent_to_group':
        return handleBindAgentToGroup(db, payload as BindAgentToGroupInput);
      default:
        return { success: false, error: `Unknown agent IPC type: ${type}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleCreateAgent(db: Database.Database, payload: CreateAgentInput): IpcResult {
  const agent = agentDb.createAgent(db, payload);
  const context = getAgentContext(db, agent.id);
  return { success: true, data: { agent, context } };
}

function handleListAgents(db: Database.Database, payload: ListAgentsInput): IpcResult {
  const agents = agentDb.listAgents(db, payload);
  return { success: true, data: agents };
}

function handleUpdateAgent(db: Database.Database, payload: UpdateAgentInput): IpcResult {
  const agent = agentDb.updateAgent(db, payload);
  if (!agent) {
    return { success: false, error: 'Agent not found' };
  }
  const context = getAgentContext(db, agent.id);
  return { success: true, data: { agent, context } };
}

function handleDeleteAgent(db: Database.Database, payload: DeleteAgentInput): IpcResult {
  const result = agentDb.deleteAgent(db, payload.agentId, payload.keepWorkspace);
  return { success: result, data: { deleted: result } };
}

function handleBindAgentToGroup(
  db: Database.Database,
  payload: BindAgentToGroupInput,
): IpcResult {
  const association = agentDb.bindAgentToGroup(db, payload);
  return { success: true, data: association };
}
```

- [ ] **Step 6.2: 修改 src/ipc.ts 添加 agent IPC 处理**

在 `src/ipc.ts` 顶部添加导入：

```typescript
// [CUSTOM: agent-ipc] 开始
import { handleAgentIpc } from './custom/agent/ipc.js';
// [CUSTOM] 结束
```

在 IPC 处理函数中添加 agent 类型处理：

```typescript
function processIpcFile(filePath: string) {
  // ... 现有代码 ...

  // [CUSTOM: agent-ipc] 开始
  if (type.startsWith('create_agent') ||
      type.startsWith('list_agents') ||
      type.startsWith('update_agent') ||
      type.startsWith('delete_agent') ||
      type.startsWith('bind_agent_to_group')) {
    const result = handleAgentIpc(db, type, payload);
    writeIpcResult(resultPath, result);
    return;
  }
  // [CUSTOM] 结束

  // ... 剩余代码 ...
}
```

- [ ] **Step 6.3: 运行类型检查**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6.4: Commit**

```bash
git add src/custom/agent/ipc.ts src/ipc.ts
git commit -m "feat(agent): 新增 agent IPC 接口"
```

---

## Task 7: API 接口（可选）

**Files:**
- Create: `src/custom/agent/api.ts`

- [ ] **Step 7.1: 创建 API 接口文件**

```typescript
// src/custom/agent/api.ts
import Database from 'better-sqlite3';
import * as agentDb from './db.js';
import * as agentConfig from './config.js';
import {
  Agent,
  AgentContext,
  CreateAgentInput,
  ListAgentsInput,
  UpdateAgentInput,
  DeleteAgentInput,
  BindAgentToGroupInput,
} from './types.js';

// 高级 API 层（供内部使用）
export class AgentManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  createAgent(input: CreateAgentInput): { agent: Agent; context: AgentContext | null } {
    const agent = agentDb.createAgent(this.db, input);
    const context = agentConfig.getAgentContext(this.db, agent.id);
    return { agent, context };
  }

  getAgent(agentId: string): Agent | null {
    return agentDb.getAgent(this.db, agentId);
  }

  getAgentContext(agentId: string): AgentContext | null {
    return agentConfig.getAgentContext(this.db, agentId);
  }

  listAgents(input?: ListAgentsInput): Agent[] {
    return agentDb.listAgents(this.db, input);
  }

  updateAgent(input: UpdateAgentInput): { agent: Agent | null; context: AgentContext | null } {
    const agent = agentDb.updateAgent(this.db, input);
    if (!agent) return { agent: null, context: null };
    const context = agentConfig.getAgentContext(this.db, agent.id);
    return { agent, context };
  }

  deleteAgent(agentId: string, keepWorkspace = false): boolean {
    return agentDb.deleteAgent(this.db, agentId, keepWorkspace);
  }

  bindAgentToGroup(input: BindAgentToGroupInput) {
    return agentDb.bindAgentToGroup(this.db, input);
  }

  getPrimaryAgentByGroup(groupFolder: string): Agent | null {
    return agentDb.getPrimaryAgentByGroup(this.db, groupFolder);
  }

  getAgentsByGroup(groupFolder: string): Agent[] {
    return agentDb.getAgentsByGroup(this.db, groupFolder);
  }
}

// 默认管理器实例（延迟初始化）
let managerInstance: AgentManager | null = null;

export function getAgentManager(db: Database.Database): AgentManager {
  if (!managerInstance) {
    managerInstance = new AgentManager(db);
  }
  return managerInstance;
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/custom/agent/api.ts
git commit -m "feat(agent): 新增 agent API 管理层"
```

---

## Task 8: 集成测试与验证

**Files:**
- Test: 所有测试文件

- [ ] **Step 8.1: 运行所有 agent 测试**

Run: `npm test src/custom/agent/ -v`
Expected: All tests pass

- [ ] **Step 8.2: 运行完整测试套件**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 8.3: 验证类型检查**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 8.4: 验证格式化**

Run: `npm run format:check`
Expected: No formatting issues

- [ ] **Step 8.5: 创建 README**

Create: `src/custom/agent/README.md`

```markdown
# Agent 模块

这是 NanoClaw 的 Agent 独立运行单元模块。

## 目录结构

```
src/custom/agent/
├── types.ts       # 类型定义
├── db.ts          # 数据库操作
├── config.ts      # 配置管理
├── api.ts         # 高级 API
├── ipc.ts         # IPC 接口
├── types.test.ts  # 类型测试
├── db.test.ts     # 数据库测试
└── config.test.ts # 配置测试
```

## 使用

### 创建 Agent

```typescript
import { createAgent } from './custom/agent/db.js';

const agent = createAgent(db, {
  name: 'Mimi',
  role: '首席决策辅助',
  identity: {
    name: 'Mimi',
    role: '首席决策辅助',
    system_prompt: '你是米米...',
  },
  config: {
    model_config: { model: 'claude-3-opus-20250219' },
  },
});
```

### 绑定到 Group

```typescript
import { bindAgentToGroup } from './custom/agent/db.js';

bindAgentToGroup(db, {
  agentId: agent.id,
  groupFolder: 'main',
  isPrimary: true,
});
```

## IPC 接口

- `create_agent` - 创建 agent
- `list_agents` - 列出 agent
- `update_agent` - 更新 agent
- `delete_agent` - 删除 agent
- `bind_agent_to_group` - 绑定 agent 到 group
```

- [ ] **Step 8.6: Commit**

```bash
git add src/custom/agent/README.md
git commit -m "docs(agent): 添加 agent 模块 README"
```

---

## 回滚策略

### 单个任务回滚

如果某个任务失败，使用：

```bash
# 查看当前分支状态
git status

# 查看修改
git diff

# 如果需要回滚到上一个 commit
git reset --hard HEAD~1
```

### 完整回滚

如果需要完全回滚所有 agent 相关修改：

```bash
# 找到第一个 agent 相关的 commit
git log --oneline

# 回滚到该 commit 之前
git reset --hard <commit-before-agent>

# 删除自定义目录（如果需要）
rm -rf src/custom/agent
```

---

## 最终验证

完成所有任务后：

- [ ] 所有测试通过
- [ ] TypeScript 类型检查通过
- [ ] 代码格式化通过
- [ ] 可以启动 `npm run dev` 且无错误
- [ ] 现有功能正常工作

---

**Plan complete!** 现在可以选择执行方式了。
