#!/usr/bin/env tsx
/**
 * NanoClaw 数据恢复工具
 * 支持从压缩包恢复、增量恢复选项、数据验证
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.resolve(PROJECT_ROOT, 'backups');
const DB_PATH = path.resolve(PROJECT_ROOT, 'nanoclaw.db');
const MESSAGES_DB_PATH = path.resolve(PROJECT_ROOT, 'store', 'messages.db');
const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');

interface RestoreOptions {
  force?: boolean;
  verify?: boolean;
  dryRun?: boolean;
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

function listBackups(): string[] {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  const items = fs.readdirSync(BACKUP_DIR);
  const backups: string[] = [];

  for (const item of items) {
    const itemPath = path.resolve(BACKUP_DIR, item);
    const stat = fs.statSync(itemPath);
    if (stat.isFile() && item.endsWith('.tar.gz')) {
      backups.push(item);
    }
  }

  // 按时间排序（最新的在前面）
  return backups.sort().reverse();
}

function extractBackup(tarPath: string, extractDir: string): void {
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`cd "${extractDir}" && tar -xzf "${tarPath}"`, { stdio: 'inherit' });
}

import crypto from 'crypto';

function loadMetadata(backupDir: string): BackupMetadata | null {
  const metadataPath = path.join(backupDir, 'backup-metadata.json');

  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content) as BackupMetadata;
  } catch {
    return null;
  }
}

function verifyChecksum(backupDir: string, metadata: BackupMetadata): boolean {
  const dbPath = path.join(backupDir, 'nanoclaw.db');

  if (!fs.existsSync(dbPath)) {
    return false;
  }

  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(dbPath);
  hash.update(data);
  const actualChecksum = hash.digest('hex');

  return actualChecksum === metadata.checksum;
}

function restoreSQLite(backupDbPath: string, targetPath: string): void {
  const directory = path.dirname(targetPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.copyFileSync(backupDbPath, targetPath);
  console.log(`  ✓ Restored ${path.basename(targetPath)}`);
}

function restoreDirectory(sourceDir: string, targetDir: string): number {
  if (!fs.existsSync(sourceDir)) {
    console.log(`  ⚠ Source directory ${sourceDir} not found, skipping`);
    return 0;
  }

  let count = 0;

  function restoreRecursive(src: string, dest: string): void {
    const stat = fs.statSync(src);

    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const items = fs.readdirSync(src);
      for (const item of items) {
        restoreRecursive(path.join(src, item), path.join(dest, item));
      }
    } else {
      fs.copyFileSync(src, dest);
      count++;
    }
  }

  restoreRecursive(sourceDir, targetDir);
  return count;
}

function performDryRun(backupDir: string, metadata: BackupMetadata): void {
  console.log('\n🔍 Dry run summary:');
  console.log('');

  // 检查需要恢复的文件
  const files = metadata.files || [];

  console.log('📊 Databases to restore:');
  files.filter((f) => f.endsWith('.db')).forEach((file) => {
    const srcPath = path.join(backupDir, file);
    const destPath = path.resolve(PROJECT_ROOT, file);
    console.log(`  - ${file}`);

    if (fs.existsSync(destPath)) {
      const destSize = fs.statSync(destPath).size;
      const srcSize = fs.statSync(srcPath).size;
      console.log(`    Current: ${(destSize / 1024).toFixed(1)} KB, Restore: ${(srcSize / 1024).toFixed(1)} KB`);
    } else {
      console.log(`    New file`);
    }
  });

  console.log('\n📁 Directories to restore:');
  const directories = new Set<string>();
  files.forEach((file) => {
    const dir = path.dirname(file);
    if (dir && dir !== '.') {
      directories.add(dir);
    }
  });

  directories.forEach((dir) => {
    console.log(`  - ${dir}`);
  });

  console.log(`\n📄 Total files: ${files.length}`);

  if (metadata.type === 'incremental') {
    console.log('⚠️  This is an incremental backup. You must restore the full backup first.');
  }
}

export async function restore(backupName: string, options: RestoreOptions = {}): Promise<void> {
  const extractTempDir = path.resolve(BACKUP_DIR, '.temp-restore');

  try {
    // 检查备份是否存在
    const backupPath = findBackupPath(backupName);
    if (!backupPath) {
      console.log('❌ Backup not found');
      console.log('  Available backups:');
      const backups = listBackups();
      backups.forEach((b) => {
        console.log(`    - ${b}`);
      });
      process.exit(1);
    }

    console.log(`\n🚀 Starting NanoClaw restore...`);
    console.log(`   Backup: ${backupName}`);
    console.log(`   Path: ${backupPath}`);
    console.log(`   Options: ${options.dryRun ? 'dry run' : 'restore'}`);
    console.log(`            ${options.force ? 'force overwrite' : 'safe'}`);
    console.log('');

    // 解压备份
    console.log('📦 Extracting backup...');
    fs.mkdirSync(extractTempDir, { recursive: true });
    extractBackup(backupPath, extractTempDir);

    // 获取解压后的目录
    const extractedItems = fs.readdirSync(extractTempDir);
    if (extractedItems.length === 0) {
      console.log('❌ Backup archive is empty');
      process.exit(1);
    }

    const backupDir = path.join(extractTempDir, extractedItems[0]);

    // 检查元数据
    console.log('📝 Reading backup metadata...');
    const metadata = loadMetadata(backupDir);
    if (!metadata) {
      console.log('❌ Invalid backup format (no metadata)');
      process.exit(1);
    }

    console.log(`  ✓ Version: ${metadata.version}`);
    console.log(`  ✓ Type: ${metadata.type}`);
    console.log(`  ✓ Created: ${metadata.timestamp}`);
    console.log(`  ✓ Files: ${metadata.files?.length || 0}`);
    if (metadata.description) {
      console.log(`  ✓ Description: ${metadata.description}`);
    }

    // 验证备份完整性
    if (options.verify !== false) {
      console.log('\n🔍 Verifying backup integrity...');
      if (!verifyChecksum(backupDir, metadata)) {
        console.log('❌ Backup checksum mismatch, possible corruption');
        process.exit(1);
      }
      console.log('  ✓ Checksum verified');
    }

    // 执行 dry run
    if (options.dryRun) {
      performDryRun(backupDir, metadata);
      return;
    }

    // 检查是否可以覆盖
    if (!options.force) {
      checkForExistingFiles();
    }

    // 实际恢复
    const totalFiles = metadata.files?.length || 0;
    console.log(`\n📋 Restoring ${totalFiles} files...`);

    // 恢复主数据库
    if (metadata.files?.includes('nanoclaw.db')) {
      const sourcePath = path.join(backupDir, 'nanoclaw.db');
      const targetPath = DB_PATH;
      restoreSQLite(sourcePath, targetPath);
    }

    // 恢复消息数据库
    if (metadata.files?.includes('store/messages.db')) {
      const sourcePath = path.join(backupDir, 'store', 'messages.db');
      const targetPath = MESSAGES_DB_PATH;
      restoreSQLite(sourcePath, targetPath);
    }

    // 恢复 groups 目录
    const groupsSource = path.join(backupDir, 'groups');
    if (fs.existsSync(groupsSource)) {
      console.log('\n👥 Restoring groups directory...');
      const count = restoreDirectory(groupsSource, GROUPS_DIR);
      console.log(`  ✓ Restored ${count} files to groups/`);
    }

    // 恢复 store 目录
    const storeSource = path.join(backupDir, 'store');
    if (fs.existsSync(storeSource)) {
      console.log('\n📁 Restoring store directory...');
      // 确保 store 目录存在
      if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
      }

      // 恢复其他文件（跳过已恢复的数据库）
      const items = fs.readdirSync(storeSource);
      for (const item of items) {
        if (item !== 'messages.db') {
          const srcPath = path.join(storeSource, item);
          const destPath = path.join(STORE_DIR, item);

          if (fs.statSync(srcPath).isDirectory()) {
            const count = restoreDirectory(srcPath, destPath);
            console.log(`  - Restored ${count} files to store/${item}/`);
          } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`  - Restored store/${item}`);
          }
        }
      }
    }

    console.log('\n✅ Restore completed successfully!');

    // 显示恢复后的状态
    if (metadata.nanoclawVersion) {
      console.log(`\nℹ️  NanoClaw version in backup: ${metadata.nanoclawVersion}`);
    }

  } finally {
    // 清理临时目录
    if (fs.existsSync(extractTempDir)) {
      fs.rmSync(extractTempDir, { recursive: true, force: true });
    }
  }
}

function findBackupPath(backupName: string): string | null {
  // 首先尝试精确匹配
  const exactPath = path.resolve(BACKUP_DIR, backupName);
  if (fs.existsSync(exactPath)) {
    return exactPath;
  }

  // 尝试匹配前缀
  const candidates = listBackups().filter((b) => b.startsWith(backupName));

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length > 1) {
    console.log('⚠️  Multiple backups matching:', backupName);
    candidates.forEach((c) => {
      console.log(`   - ${c}`);
    });
    console.log('Please specify exact backup name');
    process.exit(1);
  }

  return path.resolve(BACKUP_DIR, candidates[0]);
}

function checkForExistingFiles(): void {
  const existingFiles: string[] = [];

  if (fs.existsSync(DB_PATH)) existingFiles.push('nanoclaw.db');
  if (fs.existsSync(MESSAGES_DB_PATH)) existingFiles.push('store/messages.db');
  if (fs.existsSync(GROUPS_DIR) && fs.readdirSync(GROUPS_DIR).length > 0) {
    existingFiles.push('groups/');
  }
  if (fs.existsSync(STORE_DIR) && fs.readdirSync(STORE_DIR).length > 0) {
    existingFiles.push('store/');
  }

  if (existingFiles.length > 0) {
    console.log('⚠️  The following files/directories will be overwritten:');
    existingFiles.forEach((f) => {
      console.log(`   - ${f}`);
    });

    // 询问用户是否继续
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question('Are you sure you want to continue? (y/N): ', (answer: string) => {
        rl.close();

        if (!['y', 'Y'].includes(answer.trim())) {
          console.log('Canceled');
          process.exit(1);
        }

        resolve();
      });
    });
  }
}

// 命令行执行
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let backupName: string | null = null;
  const options: RestoreOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true;
    } else if (arg === '--verify' || arg === '-v') {
      options.verify = true;
    } else if (arg === '--list' || arg === '-l') {
      listBackupsInteractive();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      if (backupName) {
        console.log('❌ Only one backup name is allowed');
        printHelp();
        process.exit(1);
      }
      backupName = arg;
    } else {
      console.log(`❌ Invalid option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (!backupName) {
    console.log('❌ Please specify backup name');
    printHelp();
    process.exit(1);
  }

  restore(backupName, options).catch((err) => {
    console.error('❌ Restore failed:', err);
    process.exit(1);
  });
}

function printHelp(): void {
  console.log(`
NanoClaw Restore Tool

Usage:
  tsx scripts/restore.ts [options] <backup-name>

Options:
  -l, --list           List available backups
  -d, --dry-run        Perform dry run (show what will be restored)
  -f, --force          Force restore without confirmation
  -v, --verify         Verify backup integrity before restoring (default: true)
  -h, --help           Show this help message

Examples:
  tsx scripts/restore.ts --list
  tsx scripts/restore.ts nanoclaw-backup-2024-01-01T12-00-00
  tsx scripts/restore.ts --dry-run nanoclaw-backup-2024-01-01
  tsx scripts/restore.ts --force --verify nanoclaw-backup-2024-01-01

Backup format: nanoclaw-backup-YYYY-MM-DDTHH-MM-SSZ.tar.gz
`);
}

function listBackupsInteractive(): void {
  const backups = listBackups();
  console.log('📦 Available NanoClaw backups');
  console.log('');

  if (backups.length === 0) {
    console.log('No backups found');
    return;
  }

  console.log('    Name                                    Size     Type   Created');
  console.log('    --------------------------------------- -------- ------ -----------------');

  backups.forEach((backup) => {
    try {
      const path = findBackupPath(backup);
      const stat = fs.statSync(path!);

      // 提取日期
      const dateMatch = backup.match(/(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : 'Unknown';

      // 提取时间
      const timeMatch = backup.match(/T(\d{2}-\d{2}-\d{2})/);
      const time = timeMatch ? timeMatch[1] : 'Unknown';

      const sizeStr = formatSize(stat.size);
      const typeStr = 'Full'; // 目前只支持全量备份

      console.log(`    ${backup.slice(0, 39).padEnd(40)}${sizeStr.padEnd(8)}${typeStr.padEnd(6)}${date} ${time}`);
    } catch (err) {
      console.log(`    ${backup}`);
    }
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
