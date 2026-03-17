#!/bin/bash
#
# 学习体系初始化脚本
# 用于在 agent 容器内自动检查、初始化和更新学习体系
#
# 使用方法:
#   bash /workspace/group/.learning-system/init.sh
#

set -e

LEARNING_DIR="/workspace/group/.learning-system"
CONFIG_FILE="$LEARNING_DIR/config.json"
INIT_FILE="$LEARNING_DIR/initialized"
LATEST_VERSION="1.1"

# 文件版本记录
CONFIG_VERSION_FILE="$LEARNING_DIR/config.version"
SCRIPT_VERSION_FILE="$LEARNING_DIR/scripts.version"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[Learning System]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[Learning System]${NC} $1"
}

log_error() {
    echo -e "${RED}[Learning System]${NC} $1"
}

# 计算文件的哈希值（用于检测变更）
compute_file_hash() {
    local file="$1"
    if [ -f "$file" ]; then
        if command -v sha256sum &> /dev/null; then
            sha256sum "$file" | awk '{print $1}'
        elif command -v md5sum &> /dev/null; then
            md5sum "$file" | awk '{print $1}'
        else
            ls -l "$file" | awk '{print $5, $6, $7, $8}'
        fi
    fi
}

# 保存文件版本记录
save_file_versions() {
    local src_dir="$1"
    local version_file="$2"
    local prefix="$3"

    if [ -d "$src_dir" ]; then
        > "$version_file"
        for file in "$src_dir"/*; do
            if [ -f "$file" ]; then
                local filename=$(basename "$file")
                local hash=$(compute_file_hash "$file")
                echo "$prefix:$filename:$hash" >> "$version_file"
            fi
        done
    fi
}

# 检查文件是否有变更
is_file_changed() {
    local file="$1"
    local version_file="$2"
    local prefix="$3"

    if [ ! -f "$file" ] || [ ! -f "$version_file" ]; then
        return 0  # 有变更（文件不存在）
    fi

    local filename=$(basename "$file")
    local current_hash=$(compute_file_hash "$file")
    local stored_hash=$(grep "^$prefix:$filename:" "$version_file" | cut -d: -f3- 2>/dev/null || echo "")

    [ "$current_hash" != "$stored_hash" ]
}

# 检查并初始化学习体系
init_learning_system() {
    if [ ! -d "$LEARNING_DIR" ]; then
        mkdir -p "$LEARNING_DIR"
        log_info "创建学习体系目录：$LEARNING_DIR"
    fi

    if [ ! -f "$CONFIG_FILE" ]; then
        # 创建配置文件
        cat > "$CONFIG_FILE" <<EOF
{
  "version": "$LATEST_VERSION",
  "initializedAt": "$(date -Iseconds)",
  "status": "active",
  "lastUpdated": "$(date -Iseconds)",
  "migrationHistory": []
}
EOF
        touch "$INIT_FILE"
        log_info "学习体系已初始化（版本 $LATEST_VERSION）"
    else
        check_version
    fi

    # 创建子目录
    mkdir -p "$LEARNING_DIR/plans"
    mkdir -p "$LEARNING_DIR/logs"
    mkdir -p "$LEARNING_DIR/reflections"
    mkdir -p "$LEARNING_DIR/config"
    mkdir -p "$LEARNING_DIR/cron"
    mkdir -p "$LEARNING_DIR/status"
    mkdir -p "$LEARNING_DIR/scripts"

    log_info "学习体系就绪"
}

# 检查版本并更新
check_version() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log_warn "配置文件不存在，将执行初始化"
        init_learning_system
        return
    fi

    # 检查 jq 是否可用
    if ! command -v jq &> /dev/null; then
        log_warn "jq 未安装，跳过版本检查"
        return
    fi

    CURRENT_VERSION=$(cat "$CONFIG_FILE" | jq -r '.version' 2>/dev/null || echo "0.0")

    if [ "$CURRENT_VERSION" = "null" ] || [ "$CURRENT_VERSION" = "0.0" ]; then
        log_warn "版本信息无效，将重新初始化"
        init_learning_system
        return
    fi

    if [ "$CURRENT_VERSION" != "$LATEST_VERSION" ]; then
        log_info "检测到版本更新：$CURRENT_VERSION -> $LATEST_VERSION"
        migrate_version "$CURRENT_VERSION" "$LATEST_VERSION"
    else
        log_info "学习体系已是最新版本（$CURRENT_VERSION）"
    fi
}

# 版本迁移
migrate_version() {
    local FROM_VERSION="$1"
    local TO_VERSION="$2"

    log_info "执行版本迁移：$FROM_VERSION -> $TO_VERSION"

    # 备份旧配置
    if [ -f "$CONFIG_FILE" ]; then
        cp "$CONFIG_FILE" "$CONFIG_FILE.backup.$(date +%Y%m%d%H%M%S)"
        log_info "已备份旧配置文件"
    fi

    # 记录迁移历史
    local migration_entry="${FROM_VERSION}->${TO_VERSION}"

    # 版本特定的迁移逻辑
    case "$FROM_VERSION" in
        "0.9"|"0.9.0")
            # 从 0.9 升级到 1.0 的迁移逻辑
            log_info "执行 0.9 -> 1.0 迁移..."
            # 添加新的配置项
            if command -v jq &> /dev/null; then
                jq '. + {"lastUpdated": "'"$(date -Iseconds)"'", "migrationHistory": ["0.9->1.0"]}' "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
                mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
            fi
            # 继续迁移到 1.1
            migrate_version "1.0" "$TO_VERSION"
            return
            ;;
        "1.0")
            # 从 1.0 升级到 1.1 的迁移逻辑
            log_info "执行 1.0 -> 1.1 迁移..."
            if command -v jq &> /dev/null; then
                jq '.migrationHistory = (.migrationHistory // []) + ["1.0->1.1"] | .lastUpdated = "'"$(date -Iseconds)"'"' "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
                mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
            fi
            ;;
        *)
            log_warn "未知版本 $FROM_VERSION，执行通用迁移"
            if command -v jq &> /dev/null; then
                jq '.version = "'"$TO_VERSION"'" | .lastUpdated = "'"$(date -Iseconds)"'" | .migrationHistory = (.migrationHistory // []) + ["'"$migration_entry"'"]' "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
                mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
            fi
            ;;
    esac

    # 更新版本号
    if command -v jq &> /dev/null; then
        local TEMP_FILE="$CONFIG_FILE.tmp"
        jq '.version = "'"$TO_VERSION"'" | .lastUpdated = "'"$(date -Iseconds)"'"' "$CONFIG_FILE" > "$TEMP_FILE"
        mv "$TEMP_FILE" "$CONFIG_FILE"
    else
        # 没有 jq 时，使用 sed
        sed -i.bak "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"$TO_VERSION\"/" "$CONFIG_FILE"
        rm -f "$CONFIG_FILE.bak"
    fi

    touch "$INIT_FILE"
    log_info "迁移完成，当前版本：$TO_VERSION"
}

# 检查 Runtime API 是否可用
check_runtime_api() {
    local API_URL="${RUNTIME_API_URL:-http://host.docker.internal:3456}"
    local -a CURL_ARGS=(
        -s
        --connect-timeout 5
    )

    if [ -n "${RUNTIME_API_KEY:-}" ]; then
        CURL_ARGS+=(-H "X-API-Key: ${RUNTIME_API_KEY}")
    fi

    if command -v curl &> /dev/null; then
        if curl "${CURL_ARGS[@]}" "$API_URL/api/memory/list?agentFolder=test" > /dev/null 2>&1; then
            log_info "Runtime API 可用：$API_URL"
            return 0
        else
            log_warn "Runtime API 不可用：$API_URL"
            return 1
        fi
    else
        log_warn "curl 未安装，跳过 API 检查"
        return 0
    fi
}

# 主函数
main() {
    log_info "=== 学习体系初始化检查 ==="

    # 初始化学习体系
    init_learning_system

    # 检查 Runtime API
    check_runtime_api || true

    log_info "=== 检查完成 ==="
}

# 执行主函数
main "$@"
