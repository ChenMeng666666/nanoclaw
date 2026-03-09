#!/usr/bin/env tsx
/**
 * 数据库迁移脚本：添加 routing_bindings 表
 *
 * 用法：npx tsx scripts/migrate-add-routing-bindings.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_DIR = path.join(__dirname, '..');

function migrate(): void {
  const dbPath = path.join(STORE_DIR, 'nanoclaw.db');

  if (!fs.existsSync(dbPath)) {
    console.log('数据库不存在，跳过迁移');
    return;
  }

  const db = new Database(dbPath);

  try {
    // 检查表是否已存在
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='routing_bindings'
    `).get();

    if (tableExists) {
      console.log('routing_bindings 表已存在，跳过迁移');
      return;
    }

    // 创建表
    db.exec(`
      CREATE TABLE routing_bindings (
        id TEXT PRIMARY KEY,
        channel_type TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        session_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(channel_type, thread_id)
      )
    `);

    // 创建索引
    db.exec(`
      CREATE INDEX idx_routing_bindings_lookup
        ON routing_bindings(channel_type, thread_id)
    `);

    db.exec(`
      CREATE INDEX idx_routing_bindings_agent
        ON routing_bindings(agent_id)
    `);

    console.log('成功创建 routing_bindings 表');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
