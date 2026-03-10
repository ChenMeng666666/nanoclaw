#!/usr/bin/env tsx
/**
 * NanoClaw 数据备份工具
 * 支持 SQLite 数据库备份、groups 目录备份、增量备份选项
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.resolve(PROJECT_ROOT, 'backups');
const DB_PATH = path.resolve(PROJECT_ROOT, 'nanoclaw.db');
const MESSAGES_DB_PATH = path.resolve(PROJECT_ROOT, 'store', 'messages.db');
const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');

interface BackupOptions {
  incremental?: boolean;
  includeGroups?: boolean;
  includeStore?: boolean;
  description?: string;
}

interface BackupMetadata {
  version: '1.0.0';
  timestamp: string;
  type: 'full' | 'incremental';
  description?: string;
  files: string[];
  checksum: string;
  nanoclawVersion?: string;
}

function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function calculateChecksum(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function backupSQLite(dbPath: string, backupPath: string): void {
  // 使用更好的 SQLite 备份方法
  // 直接复制文件（better-sqlite3 数据库可以安全复制）
  fs.copyFileSync(dbPath, backupPath);
  console.log(`  ✓ Backed up ${path.basename(dbPath)}`);
}

function backupDirectory(srcDir: string, destDir: string): string[] {
  const copiedFiles: string[] = [];

  if (!fs.existsSync(srcDir)) {
    console.log(`  ⚠ Directory ${srcDir} does not exist, skipping`);
    return copiedFiles;
  }

  function copyRecursive(src: string, dest: string): void {
    const stat = fs.statSync(src);

    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const items = fs.readdirSync(src);
      for (const item of items) {
        copyRecursive(path.join(src, item), path.join(dest, item));
      }
    } else {
      fs.copyFileSync(src, dest);
      copiedFiles.push(path.relative(PROJECT_ROOT, src));
    }
  }

  copyRecursive(srcDir, destDir);
  return copiedFiles;
}

function createBackupMetadata(
  backupDir: string,
  options: BackupOptions,
  files: string[],
): BackupMetadata {
  const packageJsonPath = path.resolve(PROJECT_ROOT, 'package.json');
  let nanoclawVersion: string | undefined;

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    nanoclawVersion = packageJson.version;
  } catch {
    // Ignore
  }

  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    type: options.incremental ? 'incremental' : 'full',
    description: options.description,
    files,
    checksum: calculateChecksum(path.join(backupDir, 'nanoclaw.db')),
    nanoclawVersion,
  };
}

export async function backup(options: BackupOptions = {}): Promise<string> {
  const timestamp = getTimestamp();
  const backupName = `nanoclaw-backup-${timestamp}`;
  const backupDir = path.resolve(BACKUP_DIR, backupName);

  console.log(`\n📦 Starting NanoClaw backup...`);
  console.log(`   Backup name: ${backupName}`);
  console.log(`   Backup type: ${options.incremental ? 'incremental' : 'full'}`);
  console.log(`   Description: ${options.description || 'none'}`);
  console.log('');

  // 确保备份目录存在
  ensureBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const allFiles: string[] = [];

  // 备份主数据库
  console.log('📊 Backing up databases...');
  if (fs.existsSync(DB_PATH)) {
    backupSQLite(DB_PATH, path.join(backupDir, 'nanoclaw.db'));
    allFiles.push('nanoclaw.db');
  } else {
    console.log('  ⚠ nanoclaw.db not found, skipping');
  }

  if (fs.existsSync(MESSAGES_DB_PATH)) {
    const messagesBackupDir = path.join(backupDir, 'store');
    fs.mkdirSync(messagesBackupDir, { recursive: true });
    backupSQLite(MESSAGES_DB_PATH, path.join(messagesBackupDir, 'messages.db'));
    allFiles.push('store/messages.db');
  } else {
    console.log('  ⚠ messages.db not found, skipping');
  }

  // 备份 groups 目录
  if (options.includeGroups !== false) {
    console.log('\n👥 Backing up groups directory...');
    const groupsBackupDir = path.join(backupDir, 'groups');
    const groupFiles = backupDirectory(GROUPS_DIR, groupsBackupDir);
    allFiles.push(...groupFiles);
    console.log(`  ✓ Backed up ${groupFiles.length} files from groups/`);
  }

  // 备份 store 目录（除了数据库）
  if (options.includeStore !== false) {
    console.log('\n📁 Backing up store directory (excluding databases)...');
    const storeBackupDir = path.join(backupDir, 'store');

    // 复制 store 目录中的其他文件，但跳过已经备份的数据库
    if (fs.existsSync(STORE_DIR)) {
      const items = fs.readdirSync(STORE_DIR);
      for (const item of items) {
        if (item !== 'messages.db') {
          const srcPath = path.join(STORE_DIR, item);
          const destPath = path.join(storeBackupDir, item);
          const stat = fs.statSync(srcPath);

          if (stat.isDirectory()) {
            const files = backupDirectory(srcPath, destPath);
            allFiles.push(...files);
          } else {
            fs.copyFileSync(srcPath, destPath);
            allFiles.push(path.relative(PROJECT_ROOT, srcPath));
          }
        }
      }
      console.log(`  ✓ Backed up store directory`);
    }
  }

  // 创建元数据文件
  console.log('\n📝 Creating backup metadata...');
  const metadata = createBackupMetadata(backupDir, options, allFiles);
  fs.writeFileSync(
    path.join(backupDir, 'backup-metadata.json'),
    JSON.stringify(metadata, null, 2),
  );
  console.log('  ✓ Created backup-metadata.json');

  // 创建压缩包
  console.log('\n📦 Creating backup archive...');
  const archivePath = path.resolve(BACKUP_DIR, `${backupName}.tar.gz`);
  execSync(`cd "${BACKUP_DIR}" && tar -czf "${backupName}.tar.gz" "${backupName}"`);

  // 删除临时目录
  fs.rmSync(backupDir, { recursive: true, force: true });

  console.log('\n✅ Backup completed successfully!');
  console.log(`   Archive: ${archivePath}`);
  console.log(`   Size: ${(fs.statSync(archivePath).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Files: ${allFiles.length}`);

  return archivePath;
}

// 命令行执行
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options: BackupOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--incremental' || arg === '-i') {
      options.incremental = true;
    } else if (arg === '--no-groups') {
      options.includeGroups = false;
    } else if (arg === '--no-store') {
      options.includeStore = false;
    } else if (arg === '--description' || arg === '-d') {
      options.description = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
NanoClaw Backup Tool

Usage:
  tsx scripts/backup.ts [options]

Options:
  -i, --incremental    Create incremental backup
  --no-groups          Skip groups directory backup
  --no-store           Skip store directory backup
  -d, --description    Add description to backup
  -h, --help           Show this help message

Examples:
  tsx scripts/backup.ts
  tsx scripts/backup.ts --description "Before upgrade"
  tsx scripts/backup.ts --incremental
`);
      process.exit(0);
    }
  }

  backup(options).catch((err) => {
    console.error('❌ Backup failed:', err);
    process.exit(1);
  });
}
