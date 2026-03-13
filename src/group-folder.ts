import path from 'path';

import { DATA_DIR, GROUPS_DIR } from './config.js';

const GROUP_FOLDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RESERVED_FOLDERS = new Set(['global']);

export interface GroupFolderValidationResult {
  valid: boolean;
  code:
    | 'ok'
    | 'empty'
    | 'contains_whitespace'
    | 'invalid_pattern'
    | 'contains_separator'
    | 'contains_parent_path'
    | 'reserved_name';
}

export function validateGroupFolder(
  folder: string,
): GroupFolderValidationResult {
  if (!folder) return { valid: false, code: 'empty' };
  if (folder !== folder.trim()) {
    return { valid: false, code: 'contains_whitespace' };
  }
  if (!GROUP_FOLDER_PATTERN.test(folder)) {
    return { valid: false, code: 'invalid_pattern' };
  }
  if (folder.includes('/') || folder.includes('\\')) {
    return { valid: false, code: 'contains_separator' };
  }
  if (folder.includes('..')) {
    return { valid: false, code: 'contains_parent_path' };
  }
  if (RESERVED_FOLDERS.has(folder.toLowerCase())) {
    return { valid: false, code: 'reserved_name' };
  }
  return { valid: true, code: 'ok' };
}

export function isValidGroupFolder(folder: string): boolean {
  return validateGroupFolder(folder).valid;
}

export function assertValidGroupFolder(folder: string): void {
  const validation = validateGroupFolder(folder);
  if (!validation.valid) {
    throw new Error(
      `Invalid group folder "${folder}" (reason: ${validation.code})`,
    );
  }
}

function ensureWithinBase(baseDir: string, resolvedPath: string): void {
  const rel = path.relative(baseDir, resolvedPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes base directory: ${resolvedPath}`);
  }
}

export function resolveGroupFolderPath(folder: string): string {
  assertValidGroupFolder(folder);
  const groupPath = path.resolve(GROUPS_DIR, folder);
  ensureWithinBase(GROUPS_DIR, groupPath);
  return groupPath;
}

export function resolveGroupIpcPath(folder: string): string {
  assertValidGroupFolder(folder);
  const ipcBaseDir = path.resolve(DATA_DIR, 'ipc');
  const ipcPath = path.resolve(ipcBaseDir, folder);
  ensureWithinBase(ipcBaseDir, ipcPath);
  return ipcPath;
}
