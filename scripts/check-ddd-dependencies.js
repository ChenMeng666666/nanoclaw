import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const projectRoot = process.cwd();
const srcRoot = resolve(projectRoot, 'src');

const layerRank = {
  domain: 0,
  application: 1,
  infrastructure: 2,
  interfaces: 3,
};

const allowedCrossContextApplicationTargets = ['application/contracts', 'application/ports'];

function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const stack = [dir];
  const result = [];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const fullPath = resolve(current, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(ts|js)$/.test(entry)) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function parseImports(content) {
  const imports = [];
  const importRegex = /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportRegex = /\bexport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match = null;

  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = exportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

function getContextLayer(filePath) {
  const rel = relative(srcRoot, filePath).split(sep).join('/');
  const m = rel.match(/^contexts\/([^/]+)\/([^/]+)\//);
  if (!m) {
    return null;
  }
  return { context: m[1], layer: m[2] };
}

function normalizeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const abs = resolve(fromFile, '..', specifier);
  const rel = relative(srcRoot, abs).split(sep).join('/');
  return rel.startsWith('..') ? null : rel;
}

function validate() {
  const files = listFiles(srcRoot);
  const errors = [];

  for (const file of files) {
    const sourceMeta = getContextLayer(file);
    if (!sourceMeta) {
      continue;
    }

    const content = readFileSync(file, 'utf8');
    const imports = parseImports(content);

    for (const specifier of imports) {
      const normalized = normalizeImport(file, specifier);
      if (!normalized || !normalized.startsWith('contexts/')) {
        continue;
      }

      const targetMatch = normalized.match(/^contexts\/([^/]+)\/([^/]+)\/?(.*)$/);
      if (!targetMatch) {
        continue;
      }

      const targetContext = targetMatch[1];
      const targetLayer = targetMatch[2];
      const targetRest = targetMatch[3] || '';

      const sourceRank = layerRank[sourceMeta.layer];
      const targetRank = layerRank[targetLayer];
      if (sourceRank === undefined || targetRank === undefined) {
        continue;
      }

      if (targetRank > sourceRank) {
        errors.push(
          `${relative(projectRoot, file)} 违反分层方向：${sourceMeta.layer} 不能依赖 ${targetLayer}（${specifier}）`,
        );
      }

      if (sourceMeta.context !== targetContext) {
        const isAllowed =
          sourceMeta.layer === 'application' &&
          targetLayer === 'application' &&
          allowedCrossContextApplicationTargets.some((prefix) => targetRest.startsWith(prefix));

        if (!isAllowed) {
          errors.push(
            `${relative(projectRoot, file)} 违反上下文边界：${sourceMeta.context}/${sourceMeta.layer} 不能直接依赖 ${targetContext}/${targetLayer}（${specifier}）`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('DDD 依赖方向检查失败：');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('DDD 依赖方向检查通过');
}

validate();
