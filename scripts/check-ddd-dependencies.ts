import fs from 'node:fs';
import path from 'node:path';

type Violation = {
  filePath: string;
  importPath: string;
  reason: string;
};

const rootDir = process.cwd();
const contextsDir = path.join(rootDir, 'src', 'contexts');
const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
const allowedExtensions = new Set(['.ts', '.mts', '.cts']);
const allowlistedFiles = new Set([
  '/src/contexts/evolution/interfaces/http/evolution-handlers.ts',
  '/src/contexts/memory/application/memory-application-service.ts',
  '/src/contexts/memory/domain/memory-domain-rules.ts',
  '/src/contexts/messaging/application/message-orchestrator.ts',
  '/src/contexts/messaging/application/message-pipeline.ts',
  '/src/contexts/messaging/application/state-recovery-service.ts',
  '/src/contexts/runtime/application/legacy-route-handler.ts',
  '/src/contexts/runtime/application/runtime-api-service.ts',
  '/src/contexts/runtime/interfaces/http/handlers/evolution-handlers.ts',
  '/src/contexts/runtime/interfaces/http/handlers/memory-handlers.ts',
]);

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    const ext = path.extname(entry.name);
    if (!allowedExtensions.has(ext)) {
      continue;
    }
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function normalizeToPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function resolveImportPath(filePath: string, importPath: string): string | null {
  if (importPath.startsWith('node:') || !importPath.includes('/contexts/')) {
    if (importPath.startsWith('.')) {
      return normalizeToPosix(path.resolve(path.dirname(filePath), importPath));
    }
    return null;
  }
  if (importPath.startsWith('.')) {
    return normalizeToPosix(path.resolve(path.dirname(filePath), importPath));
  }
  if (importPath.startsWith('src/')) {
    return normalizeToPosix(path.resolve(rootDir, importPath));
  }
  return null;
}

function parseContextLayer(normalizedPath: string): {
  context: string;
  layer: string;
} | null {
  const match = normalizedPath.match(/\/src\/contexts\/([^/]+)\/(domain|application|infrastructure|interfaces)\//);
  if (!match) {
    return null;
  }
  return { context: match[1], layer: match[2] };
}

function parseTarget(normalizedPath: string): {
  context: string;
  layer: string;
} | null {
  const match = normalizedPath.match(/\/src\/contexts\/([^/]+)\/(domain|application|infrastructure|interfaces)(?:\/|$)/);
  if (!match) {
    return null;
  }
  return { context: match[1], layer: match[2] };
}

function checkFile(filePath: string): Violation[] {
  const normalizedFilePath = normalizeToPosix(filePath);
  const projectRelative = normalizedFilePath.replace(
    normalizeToPosix(rootDir),
    '',
  );
  if (allowlistedFiles.has(projectRelative)) {
    return [];
  }
  const source = parseContextLayer(normalizedFilePath);
  if (!source) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  for (const match of content.matchAll(importPattern)) {
    const importPath = match[1];
    const resolvedPath = resolveImportPath(filePath, importPath);
    if (!resolvedPath) {
      continue;
    }
    const target = parseTarget(resolvedPath);
    if (!target) {
      continue;
    }
    if (target.context === source.context) {
      if (source.layer === 'domain' && target.layer !== 'domain') {
        violations.push({
          filePath: normalizedFilePath,
          importPath,
          reason: 'domain 层只能依赖同 context 的 domain 层',
        });
      }
      if (
        source.layer === 'application' &&
        (target.layer === 'infrastructure' || target.layer === 'interfaces')
      ) {
        violations.push({
          filePath: normalizedFilePath,
          importPath,
          reason: 'application 层禁止依赖同 context 的 infrastructure/interfaces 层',
        });
      }
      if (source.layer === 'interfaces' && target.layer === 'infrastructure') {
        violations.push({
          filePath: normalizedFilePath,
          importPath,
          reason: 'interfaces 层禁止依赖同 context 的 infrastructure 层',
        });
      }
      if (source.layer === 'infrastructure' && target.layer === 'interfaces') {
        violations.push({
          filePath: normalizedFilePath,
          importPath,
          reason: 'infrastructure 层禁止依赖同 context 的 interfaces 层',
        });
      }
      continue;
    }
    if (target.layer !== 'application') {
      violations.push({
        filePath: normalizedFilePath,
        importPath,
        reason: '跨 context 依赖仅允许指向目标 context 的 application 层',
      });
    }
  }
  return violations;
}

function main() {
  if (!fs.existsSync(contextsDir)) {
    console.log('No contexts directory found, skip DDD dependency check.');
    return;
  }
  const files = walk(contextsDir);
  const violations = files.flatMap((filePath) => checkFile(filePath));
  if (violations.length === 0) {
    console.log(`DDD dependency check passed (${files.length} files scanned).`);
    return;
  }
  console.error('DDD dependency check failed:');
  for (const item of violations) {
    console.error(`- ${item.filePath}`);
    console.error(`  import: ${item.importPath}`);
    console.error(`  reason: ${item.reason}`);
  }
  process.exit(1);
}

main();
