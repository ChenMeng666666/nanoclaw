#!/bin/bash
#
# 反思触发脚本
# 触发不同频率的反思：hourly|daily|weekly|monthly|yearly|task
#

set -e

LEARNING_DIR="/workspace/group/.learning-system"
LOG_FILE="$LEARNING_DIR/logs/reflections-$(date +%Y%m%d).log"
CONFIG_FILE="$LEARNING_DIR/config/automation.json"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    local msg="$1"
    echo -e "${GREEN}[Reflection]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

log_warn() {
    local msg="$1"
    echo -e "${YELLOW}[Reflection]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

log_error() {
    local msg="$1"
    echo -e "${RED}[Reflection]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

# 检查配置中是否启用该类型的反思
check_reflection_enabled() {
    local reflection_type="$1"

    if [ ! -f "$CONFIG_FILE" ]; then
        log_warn "配置文件不存在，默认启用所有反思"
        return 0
    fi

    if ! command -v jq &> /dev/null; then
        log_warn "jq 未安装，默认启用所有反思"
        return 0
    fi

    local enabled=$(cat "$CONFIG_FILE" | jq -r ".reflections.$reflection_type" 2>/dev/null || echo "true")

    if [ "$enabled" = "false" ]; then
        log_info "$reflection_type 反思已在配置中禁用，跳过"
        return 1
    fi

    return 0
}

# 获取当前容器的 agentFolder
get_agent_folder() {
    if [ -f "/workspace/group/.agent-info" ] && command -v jq &> /dev/null; then
        local agentFolder=$(cat "/workspace/group/.agent-info" | jq -r '.agentFolder' 2>/dev/null || echo "default")
        echo "$agentFolder"
    else
        log_warn "无法确定 Agent 文件夹，使用 'default'"
        echo "default"
    fi
}

# 获取时间范围
get_time_range() {
    local reflection_type="$1"
    local end_time=$(date -Iseconds)
    local start_time=""

    case "$reflection_type" in
        "hourly")
            start_time=$(date -d "-1 hour" -Iseconds)
            ;;
        "daily")
            start_time=$(date -d "-1 day" -Iseconds)
            ;;
        "weekly")
            start_time=$(date -d "-1 week" -Iseconds)
            ;;
        "monthly")
            start_time=$(date -d "-1 month" -Iseconds)
            ;;
        "yearly")
            start_time=$(date -d "-1 year" -Iseconds)
            ;;
        "task")
            # 任务类型反思需要传入 taskId
            return 1
            ;;
        *)
            log_error "未知的反思类型：$reflection_type"
            return 1
            ;;
    esac

    echo "$start_time|$end_time"
}

# 生成反思
generate_reflection() {
    local reflection_type="$1"
    local agentFolder="$2"
    local API_URL="${RUNTIME_API_URL:-http://host.docker.internal:3456}"
    local auth_args=()
    if [ -n "${RUNTIME_API_KEY:-}" ]; then
        auth_args=(-H "X-API-Key: $RUNTIME_API_KEY")
    fi

    log_info "开始生成 $reflection_type 反思..."

    local time_range=$(get_time_range "$reflection_type")
    if [ $? -ne 0 ]; then
        log_error "无法获取时间范围"
        return 1
    fi

    local start_time=$(echo "$time_range" | cut -d'|' -f1)
    local end_time=$(echo "$time_range" | cut -d'|' -f2)

    # 调用 API 生成反思
    local response=$(curl -s -X POST "$API_URL/api/learning/reflection/generate" \
        -H "Content-Type: application/json" \
        "${auth_args[@]}" \
        -d "{\"agentFolder\": \"$agentFolder\", \"type\": \"$reflection_type\", \"startTime\": \"$start_time\", \"endTime\": \"$end_time\"}" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "反思生成失败"
        return 1
    fi

    log_info "$reflection_type 反思生成完成"

    echo "$response"
}

# 保存反思到本地文件
save_reflection() {
    local reflection="$1"
    local reflection_type="$2"
    local timestamp=$(date +%Y%m%d_%H%M%S)

    local reflection_file="$LEARNING_DIR/reflections/$reflection_type-$timestamp.json"
    echo "$reflection" > "$reflection_file"

    log_info "反思已保存到：$reflection_file"

    return 0
}

# 主函数
main() {
    local reflection_type="$1"

    if [ -z "$reflection_type" ]; then
        log_error "请指定反思类型：hourly|daily|weekly|monthly|yearly|task"
        exit 1
    fi

    log_info "=== 触发 $reflection_type 反思 ==="

    # 检查配置
    if ! check_reflection_enabled "$reflection_type"; then
        exit 0
    fi

    # 获取 Agent 文件夹
    local agentFolder=$(get_agent_folder)

    # 生成反思
    local reflection=$(generate_reflection "$reflection_type" "$agentFolder")
    if [ $? -ne 0 ]; then
        log_error "反思生成失败"
        exit 1
    fi

    # 保存反思
    save_reflection "$reflection" "$reflection_type"

    log_info "=== $reflection_type 反思完成 ==="

    return 0
}

# 执行主函数
main "$@"
