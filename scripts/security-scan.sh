#!/bin/bash

# NanoClaw Security Scan Script
# 安全扫描脚本

set -e

echo "=== NanoClaw Security Scan ==="
echo ""

# 检查 Node.js 依赖的安全漏洞
echo "[1/5] Checking npm dependencies for vulnerabilities..."
if npm audit --audit-level=moderate; then
  echo "✅ No moderate or higher vulnerabilities found"
else
  echo "⚠️  Found potential vulnerabilities - review npm audit output"
fi
echo ""

# 检查代码中的敏感信息
echo "[2/5] Checking for secrets in source code..."
SECRET_PATTERNS=(
  'sk_live_[a-zA-Z0-9]{24,}'
  'sk_test_[a-zA-Z0-9]{24,}'
  'pk_live_[a-zA-Z0-9]{24,}'
  'pk_test_[a-zA-Z0-9]{24,}'
  'xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-z0-9]{32}'
  'api[_-]?key[_-]?[a-z0-9]{16,}'
  'password[_-]?[a-z0-9]{8,}'
)

FOUND_SECRETS=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  if grep -rE "$pattern" src/ --include="*.ts" --include="*.js" --include="*.json"; then
    FOUND_SECRETS=1
    echo "⚠️  Found potential secret pattern: $pattern"
  fi
done

if [ $FOUND_SECRETS -eq 0 ]; then
  echo "✅ No obvious secrets found in source code"
fi
echo ""

# 检查 Docker 配置
echo "[3/5] Checking container security..."
if [ -f "container/Dockerfile" ]; then
  if ! grep -q "USER.*:" container/Dockerfile; then
    echo "⚠️  Dockerfile may not specify non-root user"
  else
    echo "✅ Dockerfile specifies non-root user"
  fi
fi
echo ""

# 检查文件权限
echo "[4/5] Checking file permissions..."
if stat -f "%OLp" .env 2>/dev/null | grep -q "600\|640"; then
  echo "✅ .env has proper permissions"
elif [ -f .env ]; then
  echo "⚠️  .env file may have insecure permissions"
fi

if [ -d groups/ ]; then
  echo "✅ Groups directory exists"
fi
echo ""

# 运行 TypeScript 类型检查
echo "[5/5] Running TypeScript type check..."
if npm run typecheck; then
  echo "✅ TypeScript check passed"
else
  echo "⚠️  TypeScript check failed"
fi
echo ""

echo "=== Security Scan Complete ==="
echo "Review all warnings above and address as needed."
