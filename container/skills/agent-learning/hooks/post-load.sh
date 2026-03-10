#!/bin/bash
#
# Agent Learning Skill - Post Load Hook
# 将初始化脚本同步到容器的学习系统目录
#
# 触发时机：当 skill 被加载到容器时自动执行
# 主要功能：
#   1. 检查是否在容器内运行（/workspace 目录存在）
#   2. 创建 /workspace/group/.learning-system/ 目录
#   3. 将 scripts/init.sh 复制到学习系统目录
#   4. 如果学习系统未初始化，自动执行初始化
#   5. 如果学习系统已初始化，检查版本更新
#

set -e

LEARNING_DIR="/workspace/group/.learning-system"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$SKILL_DIR/scripts"
CONFIG_DIR="$SKILL_DIR/config"
INIT_SCRIPT_SRC="$SKILL_DIR/scripts/init.sh"
INIT_SCRIPT_DEST="$LEARNING_DIR/init.sh"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[Agent Learning]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[Agent Learning]${NC} $1"
}

# 检查是否在容器内运行
if [ ! -d "/workspace" ]; then
    # 不在容器内，跳过执行
    exit 0
fi

# 创建学习系统目录（如果不存在）
if [ ! -d "$LEARNING_DIR" ]; then
    mkdir -p "$LEARNING_DIR"
    log_info "创建学习系统目录：$LEARNING_DIR"
fi

# 同步初始化脚本
if [ -f "$INIT_SCRIPT_SRC" ]; then
    cp "$INIT_SCRIPT_SRC" "$INIT_SCRIPT_DEST"
    chmod +x "$INIT_SCRIPT_DEST"
    log_info "已同步初始化脚本到：$INIT_SCRIPT_DEST"

    # 同步所有配置文件
    if [ -d "$CONFIG_DIR" ]; then
        cp -r "$CONFIG_DIR"/* "$LEARNING_DIR/config/" 2>/dev/null || true
        log_info "已同步配置文件到：$LEARNING_DIR/config/"
    fi

    # 同步所有脚本文件
    if [ -d "$SCRIPTS_DIR" ]; then
        cp -r "$SCRIPTS_DIR"/* "$LEARNING_DIR/" 2>/dev/null || true
        chmod +x "$LEARNING_DIR"/*.sh 2>/dev/null || true
        chmod +x "$LEARNING_DIR"/scripts/*.sh 2>/dev/null || true
        log_info "已同步脚本文件到：$LEARNING_DIR/"
    fi
else
    log_warn "初始化脚本不存在：$INIT_SCRIPT_SRC"
    exit 1
fi

# 如果学习系统未初始化，自动执行初始化
if [ ! -f "$LEARNING_DIR/initialized" ]; then
    log_info "学习系统未初始化，执行自动初始化..."
    bash "$INIT_SCRIPT_DEST"
    log_info "学习系统初始化完成"
else
    log_info "学习系统已初始化，检查版本更新..."
    bash "$INIT_SCRIPT_DEST"
fi

log_info "Agent Learning Skill 加载完成"
exit 0
