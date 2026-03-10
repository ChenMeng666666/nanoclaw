#!/bin/bash
#
# 学习自动化管理脚本
# 启动、停止、检查学习自动化状态
# 使用方式:
#   bash /workspace/group/.learning-system/scripts/learning-automation.sh start
#   bash /workspace/group/.learning-system/scripts/learning-automation.sh stop
#   bash /workspace/group/.learning-system/scripts/learning-automation.sh status
#

set -e

LEARNING_DIR="/workspace/group/.learning-system"
CONFIG_FILE="$LEARNING_DIR/config/automation.json"
CRON_FILE="$LEARNING_DIR/cron/learning-crontab"
RUNNING_MARKER="$LEARNING_DIR/status/automation-running"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[Learning Automation]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[Learning Automation]${NC} $1"
}

log_error() {
    echo -e "${RED}[Learning Automation]${NC} $1"
}

# 检查配置是否启用学习自动化
check_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log_warn "配置文件不存在，将使用默认配置"
        return 0
    fi

    if command -v jq &> /dev/null; then
        local enabled=$(cat "$CONFIG_FILE" | jq -r '.enabled' 2>/dev/null || echo "true")
        if [ "$enabled" = "false" ]; then
            log_warn "学习自动化已在配置中禁用"
            return 1
        fi
    fi

    return 0
}

# 创建 cron 任务
create_cron_tasks() {
    # 读取配置文件获取时间设置
    local daily_plan_time="08:00"
    local daily_summary_time="23:00"

    if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
        daily_plan_time=$(cat "$CONFIG_FILE" | jq -r '.dailyPlanTime' 2>/dev/null || echo "08:00")
        daily_summary_time=$(cat "$CONFIG_FILE" | jq -r '.dailySummaryTime' 2>/dev/null || echo "23:00")
    fi

    # 解析时间格式 (HH:MM)
    local plan_hour=$(echo "$daily_plan_time" | cut -d':' -f1)
    local plan_min=$(echo "$daily_plan_time" | cut -d':' -f2)
    local summary_hour=$(echo "$daily_summary_time" | cut -d':' -f1)
    local summary_min=$(echo "$daily_summary_time" | cut -d':' -f2)

    # 创建 cron 配置
    cat > "$CRON_FILE" <<EOF
# 学习自动化定时任务
# 每日学习计划
${plan_min} ${plan_hour} * * * bash $LEARNING_DIR/scripts/trigger-daily-plan.sh

# 每日学习总结
${summary_min} ${summary_hour} * * * bash $LEARNING_DIR/scripts/generate-daily-summary.sh

# 每小时反思
0 * * * * bash $LEARNING_DIR/scripts/trigger-reflection.sh hourly

# 每日反思
0 ${summary_hour} * * * bash $LEARNING_DIR/scripts/trigger-reflection.sh daily

# 每周反思 (周日)
0 ${summary_hour} * * 0 bash $LEARNING_DIR/scripts/trigger-reflection.sh weekly

# 每月反思 (1号)
0 ${summary_hour} 1 * * bash $LEARNING_DIR/scripts/trigger-reflection.sh monthly

# 每年反思 (1月1号)
0 ${summary_hour} 1 1 * bash $LEARNING_DIR/scripts/trigger-reflection.sh yearly
EOF

    log_info "已创建 cron 配置文件：$CRON_FILE"
}

# 加载 cron 任务
load_cron_tasks() {
    if [ ! -f "$CRON_FILE" ]; then
        create_cron_tasks
    fi

    # 检查是否已加载 cron 任务
    local current_crontab=$(crontab -l 2>/dev/null || echo "")
    local has_learning_cron=$(grep -F "$LEARNING_DIR/scripts/trigger-daily-plan.sh" <<<"$current_crontab")

    if [ -z "$has_learning_cron" ]; then
        # 合并并加载 cron 任务
        if [ -n "$current_crontab" ]; then
            cat <(echo "$current_crontab") "$CRON_FILE" | crontab -
        else
            crontab "$CRON_FILE"
        fi
        log_info "Cron 任务已加载"
    else
        log_info "Cron 任务已存在"
    fi
}

# 移除 cron 任务
remove_cron_tasks() {
    local current_crontab=$(crontab -l 2>/dev/null || echo "")
    local new_crontab=$(grep -v -F "$LEARNING_DIR/scripts/" <<<"$current_crontab")

    if [ "$(echo -e "$current_crontab" | grep -c .)" -ne "$(echo -e "$new_crontab" | grep -c .)" ]; then
        echo -e "$new_crontab" | crontab - 2>/dev/null || true
        log_info "Cron 任务已移除"
    else
        log_info "没有需要移除的 cron 任务"
    fi
}

# 启动学习自动化
start_automation() {
    log_info "启动学习自动化..."

    if ! check_config; then
        return 1
    fi

    # 创建必要的目录
    mkdir -p "$LEARNING_DIR/cron"
    mkdir -p "$LEARNING_DIR/status"
    mkdir -p "$LEARNING_DIR/logs"

    # 设置 cron 任务
    create_cron_tasks
    load_cron_tasks

    # 标记为运行中
    touch "$RUNNING_MARKER"
    log_info "学习自动化已启动"

    # 立即触发一次每日学习计划
    log_info "立即触发当日学习计划..."
    bash "$LEARNING_DIR/scripts/trigger-daily-plan.sh" &

    return 0
}

# 停止学习自动化
stop_automation() {
    log_info "停止学习自动化..."

    # 移除 cron 任务
    remove_cron_tasks

    # 移除运行标记
    if [ -f "$RUNNING_MARKER" ]; then
        rm -f "$RUNNING_MARKER"
    fi

    log_info "学习自动化已停止"
    return 0
}

# 检查运行状态
check_status() {
    if [ -f "$RUNNING_MARKER" ]; then
        # 验证 cron 任务是否正在运行
        local current_crontab=$(crontab -l 2>/dev/null || echo "")
        local has_learning_cron=$(grep -F "$LEARNING_DIR/scripts/trigger-daily-plan.sh" <<<"$current_crontab")

        if [ -n "$has_learning_cron" ]; then
            log_info "学习自动化正在运行"
            return 0
        else
            log_warn "运行标记存在但 cron 任务未找到，可能是配置问题"
            rm -f "$RUNNING_MARKER"
            return 1
        fi
    else
        log_info "学习自动化未运行"
        return 1
    fi
}

# 显示帮助信息
show_help() {
    cat <<EOF
学习自动化管理脚本

使用方式:
  $0 start    - 启动学习自动化
  $0 stop     - 停止学习自动化
  $0 status   - 检查运行状态
  $0 help     - 显示此帮助信息

功能:
  - 自动管理学习定时任务 (cron)
  - 每日学习计划生成和执行
  - 自动反思调度
  - 每日学习总结

配置文件:
  $LEARNING_DIR/config/automation.json
EOF
}

# 主函数
main() {
    case "$1" in
        "start")
            start_automation
            ;;
        "stop")
            stop_automation
            ;;
        "status")
            check_status
            ;;
        "help")
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            return 1
            ;;
    esac

    return $?
}

# 执行主函数
main "$@"
