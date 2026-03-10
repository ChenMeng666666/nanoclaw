#!/bin/bash
#
# 每日学习总结生成脚本
# 每天定时执行，生成详细的每日学习总结
#

set -e

LEARNING_DIR="/workspace/group/.learning-system"
LOG_FILE="$LEARNING_DIR/logs/daily-summary-$(date +%Y%m%d).log"
CONFIG_FILE="$LEARNING_DIR/config/automation.json"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    local msg="$1"
    echo -e "${GREEN}[Daily Summary]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

log_warn() {
    local msg="$1"
    echo -e "${YELLOW}[Daily Summary]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

log_error() {
    local msg="$1"
    echo -e "${RED}[Daily Summary]${NC} $(date +"%Y-%m-%d %H:%M:%S") - $msg" | tee -a "$LOG_FILE"
}

# 检查配置
check_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log_warn "配置文件不存在，使用默认配置"
        return 0
    fi

    if ! command -v jq &> /dev/null; then
        log_warn "jq 未安装，使用默认配置"
        return 0
    fi

    local enabled=$(cat "$CONFIG_FILE" | jq -r '.enabled' 2>/dev/null || echo "true")
    if [ "$enabled" = "false" ]; then
        log_warn "学习自动化已禁用，跳过每日总结"
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

# 查询当日学习任务
query_tasks() {
    local agentFolder="$1"
    local API_URL="${RUNTIME_API_URL:-http://host.docker.internal:3456}"
    local today=$(date +%Y-%m-%d)

    log_info "查询当日学习任务..."

    local response=$(curl -G "$API_URL/api/learning/tasks" \
        --data-urlencode "agentFolder=$agentFolder" \
        --data-urlencode "date=$today" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "查询学习任务失败"
        return 1
    fi

    echo "$response"
}

# 生成每日学习总结
generate_summary() {
    local agentFolder="$1"
    local tasks="$2"
    local API_URL="${RUNTIME_API_URL:-http://host.docker.internal:3456}"

    log_info "生成每日学习总结..."

    local request_body=$(jq -n \
        --arg agentFolder "$agentFolder" \
        --argjson tasks "$tasks" \
        '{agentFolder: $agentFolder, tasks: $tasks}')

    local response=$(curl -s -X POST "$API_URL/api/learning/generate-daily-summary" \
        -H "Content-Type: application/json" \
        -d "$request_body" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "每日总结生成失败"
        return 1
    fi

    log_info "每日总结生成完成"

    echo "$response"
}

# 保存总结到本地文件
save_summary() {
    local summary="$1"
    local date_str=$(date +%Y%m%d)

    local summary_file="$LEARNING_DIR/logs/daily-summary-$date_str.json"
    echo "$summary" > "$summary_file"

    log_info "每日总结已保存到：$summary_file"

    # 同时保存为 Markdown 格式
    local markdown_file="$LEARNING_DIR/logs/daily-summary-$date_str.md"
    convert_to_markdown "$summary" > "$markdown_file"
    log_info "Markdown 总结已保存到：$markdown_file"

    return 0
}

# 转换为 Markdown 格式
convert_to_markdown() {
    local summary="$1"

    cat <<EOF
# 每日学习总结 - $(echo "$summary" | jq -r '.date')

## 概述
- **Agent**: $(echo "$summary" | jq -r '.agentFolder')
- **完成任务数**: $(echo "$summary" | jq -r '.tasksCompleted')
- **总学习时间**: $(echo "$summary" | jq -r '.totalTimeSpent') 分钟
- **心情状态**: $(echo "$summary" | jq -r '.mood')

## 知识点
EOF

    local knowledge_points=$(echo "$summary" | jq -r '.knowledgePoints[]' 2>/dev/null || echo "")
    if [ -n "$knowledge_points" ]; then
        while IFS= read -r point; do
            if [ -n "$point" ]; then
                echo "- $point"
            fi
        done <<<"$knowledge_points"
    else
        echo "无"
    fi

    cat <<EOF

## 成就
EOF

    local achievements=$(echo "$summary" | jq -r '.achievements[]' 2>/dev/null || echo "")
    if [ -n "$achievements" ]; then
        while IFS= read -r achievement; do
            if [ -n "$achievement" ]; then
                echo "- $achievement"
            fi
        done <<<"$achievements"
    else
        echo "无"
    fi

    cat <<EOF

## 挑战
EOF

    local challenges=$(echo "$summary" | jq -r '.challenges[]' 2>/dev/null || echo "")
    if [ -n "$challenges" ]; then
        while IFS= read -r challenge; do
            if [ -n "$challenge" ]; then
                echo "- $challenge"
            fi
        done <<<"$challenges"
    else
        echo "无"
    fi

    cat <<EOF

## 改进点
EOF

    local improvements=$(echo "$summary" | jq -r '.improvements[]' 2>/dev/null || echo "")
    if [ -n "$improvements" ]; then
        while IFS= read -r improvement; do
            if [ -n "$improvement" ]; then
                echo "- $improvement"
            fi
        done <<<"$improvements"
    else
        echo "无"
    fi

    cat <<EOF

## 明日计划
EOF

    local tomorrow_plan=$(echo "$summary" | jq -r '.tomorrowPlan[]' 2>/dev/null || echo "")
    if [ -n "$tomorrow_plan" ]; then
        while IFS= read -r item; do
            if [ -n "$item" ]; then
                echo "- $item"
            fi
        done <<<"$tomorrow_plan"
    else
        echo "无"
    fi

    local notes=$(echo "$summary" | jq -r '.notes' 2>/dev/null || echo "")
    if [ "$notes" != "null" ] && [ -n "$notes" ]; then
        cat <<EOF

## 备注
$notes
EOF
    fi
}

# 发送通知（如果启用）
send_notification() {
    local summary="$1"

    if [ ! -f "$CONFIG_FILE" ] || ! command -v jq &> /dev/null; then
        return 0
    fi

    local notifications_enabled=$(cat "$CONFIG_FILE" | jq -r '.notifications.enabled' 2>/dev/null || echo "false")

    if [ "$notifications_enabled" = "false" ]; then
        return 0
    fi

    log_info "准备发送每日总结通知..."

    local channel=$(cat "$CONFIG_FILE" | jq -r '.notifications.channel' 2>/dev/null || echo "")
    local userId=$(cat "$CONFIG_FILE" | jq -r '.notifications.userId' 2>/dev/null || echo "")

    if [ -z "$channel" ] || [ -z "$userId" ]; then
        log_warn "通知配置不完整，跳过通知"
        return 0
    fi

    # TODO: 实现通知发送逻辑
    # 需要调用主项目的通知 API

    log_info "通知功能待实现"
}

# 主函数
main() {
    log_info "=== 每日学习总结 ==="

    # 检查配置
    if ! check_config; then
        exit 0
    fi

    # 获取 Agent 文件夹
    local agentFolder=$(get_agent_folder)

    # 查询学习任务
    local tasks=$(query_tasks "$agentFolder")
    if [ $? -ne 0 ]; then
        log_error "查询学习任务失败"
        exit 1
    fi

    # 生成总结
    local summary=$(generate_summary "$agentFolder" "$tasks")
    if [ $? -ne 0 ]; then
        log_error "生成每日总结失败"
        exit 1
    fi

    # 保存总结
    save_summary "$summary"

    # 发送通知
    send_notification "$summary"

    log_info "=== 每日总结生成完成 ==="

    return 0
}

# 执行主函数
main "$@"
