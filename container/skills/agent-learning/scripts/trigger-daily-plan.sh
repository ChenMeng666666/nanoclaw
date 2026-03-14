#!/bin/bash
#
# 每日学习计划触发脚本
# 每天定时执行，自动分析学习需求并生成当日学习计划
#

set -e

LEARNING_DIR="/workspace/group/.learning-system"
LOG_FILE="$LEARNING_DIR/logs/daily-plan-$(date +%Y%m%d).log"
CONFIG_FILE="$LEARNING_DIR/config/learning-automation.json"
LEGACY_CONFIG_FILE="$LEARNING_DIR/config/automation.json"
STATUS_FILE="$LEARNING_DIR/status/last-daily-plan"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    local msg="$1"
    echo -e "${GREEN}[Daily Plan]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

log_warn() {
    local msg="$1"
    echo -e "${YELLOW}[Daily Plan]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

log_error() {
    local msg="$1"
    echo -e "${RED}[Daily Plan]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

resolve_config_file() {
    if [ -f "$CONFIG_FILE" ]; then
        echo "$CONFIG_FILE"
        return 0
    fi
    if [ -f "$LEGACY_CONFIG_FILE" ]; then
        echo "$LEGACY_CONFIG_FILE"
        return 0
    fi
    echo "$CONFIG_FILE"
    return 0
}

# 检查配置
check_config() {
    local config_file
    config_file=$(resolve_config_file)
    if [ ! -f "$config_file" ]; then
        log_warn "配置文件不存在，使用默认配置"
        return 0
    fi

    if command -v jq &> /dev/null; then
        local enabled=$(cat "$config_file" | jq -r '.enabled' 2>/dev/null || echo "true")
        if [ "$enabled" = "false" ]; then
            log_warn "学习自动化已禁用，跳过每日计划"
            return 1
        fi
    fi

    return 0
}

# 检查 Runtime API 可用性
check_api() {
    local API_URL="${RUNTIME_API_URL:-http://host.docker.internal:3456}"
    local auth_args=()
    if [ -n "${RUNTIME_API_KEY:-}" ]; then
        auth_args=(-H "X-API-Key: $RUNTIME_API_KEY")
    fi

    if command -v curl &> /dev/null; then
        if curl -s --connect-timeout 5 "${auth_args[@]}" "$API_URL/api/memory/list?agentFolder=test" > /dev/null 2>&1; then
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

# 获取当前容器的 agentFolder
get_agent_folder() {
    if [ -f "/workspace/group/.agent-info" ] && command -v jq &> /dev/null; then
        local agentFolder=$(cat "/workspace/group/.agent-info" | jq -r '.agentFolder' 2>/dev/null || echo "default")
        log_info "Agent 文件夹：$agentFolder"
        echo "$agentFolder"
    else
        log_warn "无法确定 Agent 文件夹，使用 'default'"
        echo "default"
    fi
}

# 分析学习需求
analyze_needs() {
    local agentFolder="$1"
    local API_URL="${RUNTIME_API_URL:-http://host.docker.internal:3456}"
    local auth_args=()
    if [ -n "${RUNTIME_API_KEY:-}" ]; then
        auth_args=(-H "X-API-Key: $RUNTIME_API_KEY")
    fi

    log_info "分析学习需求..."

    local response=$(curl -s -X POST "$API_URL/api/learning/analyze-needs" \
        -H "Content-Type: application/json" \
        "${auth_args[@]}" \
        -d "{\"agentFolder\": \"$agentFolder\"}" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "学习需求分析失败"
        return 1
    fi

    local needs_count=$(echo "$response" | jq -r '.needs | length' 2>/dev/null || echo "0")
    log_info "发现 $needs_count 个学习需求"

    echo "$response"
}

# 生成每日学习计划
generate_plan() {
    local agentFolder="$1"
    local needs="$2"
    local API_URL="${RUNTIME_API_URL:-http://host.docker.internal:3456}"
    local auth_args=()
    if [ -n "${RUNTIME_API_KEY:-}" ]; then
        auth_args=(-H "X-API-Key: $RUNTIME_API_KEY")
    fi

    log_info "生成当日学习计划..."

    local schedule_config=""
    local schedule_file="$LEARNING_DIR/config/skill-learning-schedule.json"
    if [ ! -f "$schedule_file" ] && [ -f "$LEARNING_DIR/config/schedule.json" ]; then
        schedule_file="$LEARNING_DIR/config/schedule.json"
    fi
    if [ -f "$schedule_file" ]; then
        schedule_config=$(cat "$schedule_file")
    else
        log_warn "学习时间表配置不存在，使用默认配置"
        schedule_config='{"hourlyRotation":true,"timeSlots":[{"time":"08:00-10:00","focus":"技能学习","types":["technical_skill","soft_skill"],"priority":"high"}]}'
    fi

    local request_body=$(jq -n \
        --arg agentFolder "$agentFolder" \
        --argjson needs "$needs" \
        --argjson schedule "$schedule_config" \
        '{agentFolder: $agentFolder, learningNeeds: $needs.needs, scheduleConfig: $schedule}')

    local response=$(curl -s -X POST "$API_URL/api/learning/generate-daily-plan" \
        -H "Content-Type: application/json" \
        "${auth_args[@]}" \
        -d "$request_body" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "学习计划生成失败"
        return 1
    fi

    local tasks_count=$(echo "$response" | jq -r '.tasks | length' 2>/dev/null || echo "0")
    log_info "学习计划已生成，包含 $tasks_count 个任务"

    echo "$response"
}

# 执行学习任务
execute_plan() {
    local agentFolder="$1"
    local plan="$2"
    local API_URL="${RUNTIME_API_URL:-http://host.docker.internal:3456}"
    local auth_args=()
    if [ -n "${RUNTIME_API_KEY:-}" ]; then
        auth_args=(-H "X-API-Key: $RUNTIME_API_KEY")
    fi

    local task_count=$(echo "$plan" | jq -r '.tasks | length' 2>/dev/null || echo "0")

    if [ "$task_count" -eq 0 ]; then
        log_info "学习计划为空，跳过执行"
        return 0
    fi

    log_info "开始执行学习计划（共 $task_count 个任务）..."

    # 遍历任务并执行
    for i in $(seq 0 $((task_count - 1))); do
        local task=$(echo "$plan" | jq -r ".tasks[$i]")
        local plannedTaskId=$(echo "$task" | jq -r '.id')
        local task_label=$(echo "$task" | jq -r '.description // .topic // .id // "未命名任务"')
        local task_resources=$(echo "$task" | jq -c '.resources // []')

        log_info "执行任务 $((i + 1))/$task_count: $task_label (planTaskId=$plannedTaskId)"

        local create_payload=$(jq -n \
            --arg agentFolder "$agentFolder" \
            --arg description "$task_label" \
            --argjson resources "$task_resources" \
            '{agentFolder: $agentFolder, description: $description, resources: $resources}')
        local create_response=$(curl -s -X POST "$API_URL/api/learning/task/create" \
            -H "Content-Type: application/json" \
            "${auth_args[@]}" \
            -d "$create_payload" 2>/dev/null)
        local create_error=$(echo "$create_response" | jq -r '.error // empty' 2>/dev/null || echo "")
        if [ -n "$create_error" ]; then
            log_error "任务 $task_label 创建失败：$create_error"
            continue
        fi
        local taskId=$(echo "$create_response" | jq -r '.id // empty' 2>/dev/null || echo "")
        if [ -z "$taskId" ]; then
            log_error "任务 $task_label 创建失败：未返回 taskId"
            continue
        fi

        # 调用 API 执行任务
        local start_payload=$(jq -n \
            --arg agentFolder "$agentFolder" \
            --arg taskId "$taskId" \
            --arg phaseName "$task_label" \
            '{agentFolder: $agentFolder, taskId: $taskId, phaseName: $phaseName}')
        local exec_response=$(curl -s -X POST "$API_URL/api/learning/task/start" \
            -H "Content-Type: application/json" \
            "${auth_args[@]}" \
            -d "$start_payload" 2>/dev/null)
        local start_error=$(echo "$exec_response" | jq -r '.error // empty' 2>/dev/null || echo "")
        if [ -n "$start_error" ]; then
            log_error "任务 $task_label 开始失败：$start_error"
            continue
        fi

        log_info "任务 $task_label 开始执行"

        local complete_payload=$(jq -n \
            --arg agentFolder "$agentFolder" \
            --arg taskId "$taskId" \
            --arg phaseName "$task_label" \
            '{agentFolder: $agentFolder, taskId: $taskId, phaseName: $phaseName}')
        local complete_response=$(curl -s -X POST "$API_URL/api/learning/task/complete" \
            -H "Content-Type: application/json" \
            "${auth_args[@]}" \
            -d "$complete_payload" 2>/dev/null)
        local complete_error=$(echo "$complete_response" | jq -r '.error // empty' 2>/dev/null || echo "")
        if [ -n "$complete_error" ]; then
            log_error "任务 $task_label 完成失败：$complete_error"
            continue
        fi
        log_info "任务 $task_label 已完成"
    done

    return 0
}

# 主函数
main() {
    log_info "=== 每日学习计划触发 ==="

    # 检查配置和 API 可用性
    if ! check_config; then
        return 1
    fi

    if ! check_api; then
        return 1
    fi

    # 获取 Agent 文件夹
    local agentFolder=$(get_agent_folder)

    # 分析学习需求
    local learning_needs=$(analyze_needs "$agentFolder")
    if [ $? -ne 0 ]; then
        return 1
    fi

    # 生成学习计划
    local daily_plan=$(generate_plan "$agentFolder" "$learning_needs")
    if [ $? -ne 0 ]; then
        return 1
    fi

    # 保存学习计划到本地文件
    local plan_file="$LEARNING_DIR/plans/daily-plan-$(date +%Y%m%d).json"
    echo "$daily_plan" > "$plan_file"
    log_info "学习计划已保存到：$plan_file"

    # 执行学习任务
    execute_plan "$agentFolder" "$daily_plan"

    # 更新最后执行时间
    date -Iseconds > "$STATUS_FILE"
    log_info "每日学习计划执行完成"

    return 0
}

# 执行主函数
main "$@"

# 错误处理
if [ $? -ne 0 ]; then
    log_error "每日学习计划执行失败，错误码：$?"
    exit 1
fi
