#!/bin/bash
#
# 反思调度管理脚本
# 管理反思 cron 任务的设置和状态
#

set -e

LEARNING_DIR="/workspace/group/.learning-system"
CRON_FILE="$LEARNING_DIR/cron/learning-crontab"
CONFIG_FILE="$LEARNING_DIR/config/automation.json"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[Reflection Scheduler]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[Reflection Scheduler]${NC} $1"
}

log_error() {
    echo -e "${RED}[Reflection Scheduler]${NC} $1"
}

# 读取配置文件中的时间设置
read_config() {
    local daily_summary_time="23:00"

    if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
        daily_summary_time=$(cat "$CONFIG_FILE" | jq -r '.dailySummaryTime' 2>/dev/null || echo "23:00")
    fi

    echo "$daily_summary_time"
}

# 生成 cron 配置
generate_cron_config() {
    local daily_summary_time=$(read_config)
    local summary_hour=$(echo "$daily_summary_time" | cut -d':' -f1)
    local summary_min=$(echo "$daily_summary_time" | cut -d':' -f2)

    cat > "$CRON_FILE" <<EOF
# 反思定时任务
# 每小时反思
0 * * * * bash $LEARNING_DIR/scripts/trigger-reflection.sh hourly

# 每日反思
${summary_min} ${summary_hour} * * * bash $LEARNING_DIR/scripts/trigger-reflection.sh daily

# 每周反思 (周日)
${summary_min} ${summary_hour} * * 0 bash $LEARNING_DIR/scripts/trigger-reflection.sh weekly

# 每月反思 (1号)
${summary_min} ${summary_hour} 1 * * bash $LEARNING_DIR/scripts/trigger-reflection.sh monthly

# 每年反思 (1月1号)
${summary_min} ${summary_hour} 1 1 * bash $LEARNING_DIR/scripts/trigger-reflection.sh yearly
EOF

    log_info "已生成 cron 配置：$CRON_FILE"
}

# 加载 cron 任务
load_cron() {
    if [ ! -f "$CRON_FILE" ]; then
        generate_cron_config
    fi

    # 检查是否已加载 cron 任务
    local current_crontab=$(crontab -l 2>/dev/null || echo "")
    local has_reflection_cron=$(grep -F "$LEARNING_DIR/scripts/trigger-reflection.sh" <<<"$current_crontab")

    if [ -z "$has_reflection_cron" ]; then
        # 合并并加载 cron 任务
        if [ -n "$current_crontab" ]; then
            cat <(echo "$current_crontab") "$CRON_FILE" | crontab -
        else
            crontab "$CRON_FILE"
        fi
        log_info "反思 cron 任务已加载"
    else
        log_info "反思 cron 任务已存在"
    fi
}

# 移除 cron 任务
remove_cron() {
    local current_crontab=$(crontab -l 2>/dev/null || echo "")
    local new_crontab=$(grep -v -F "$LEARNING_DIR/scripts/trigger-reflection.sh" <<<"$current_crontab")

    if [ "$(echo -e "$current_crontab" | grep -c .)" -ne "$(echo -e "$new_crontab" | grep -c .)" ]; then
        echo -e "$new_crontab" | crontab - 2>/dev/null || true
        log_info "反思 cron 任务已移除"
    else
        log_info "没有需要移除的反思 cron 任务"
    fi
}

# 显示当前 cron 配置
show_cron() {
    local current_crontab=$(crontab -l 2>/dev/null || echo "")
    local reflection_crontab=$(grep -F "$LEARNING_DIR/scripts/trigger-reflection.sh" <<<"$current_crontab")

    if [ -n "$reflection_crontab" ]; then
        log_info "当前反思 cron 任务："
        echo "$reflection_crontab"
    else
        log_warn "没有找到反思 cron 任务"
    fi
}

# 检查状态
check_status() {
    local current_crontab=$(crontab -l 2>/dev/null || echo "")
    local has_reflection_cron=$(grep -F "$LEARNING_DIR/scripts/trigger-reflection.sh" <<<"$current_crontab")

    if [ -n "$has_reflection_cron" ]; then
        log_info "反思调度正在运行"
        show_cron
        return 0
    else
        log_info "反思调度未运行"
        return 1
    fi
}

# 显示帮助
show_help() {
    cat <<EOF
反思调度管理脚本

使用方式:
  $0 generate  - 生成 cron 配置
  $0 load      - 加载 cron 任务
  $0 remove    - 移除 cron 任务
  $0 show      - 显示当前 cron 配置
  $0 status    - 检查运行状态
  $0 help      - 显示此帮助信息

功能:
  - 管理反思定时任务 (cron)
  - 支持多种频率：hourly/daily/weekly/monthly/yearly
  - 从配置文件读取时间设置

配置文件:
  $CONFIG_FILE
EOF
}

# 主函数
main() {
    case "$1" in
        "generate")
            generate_cron_config
            ;;
        "load")
            load_cron
            ;;
        "remove")
            remove_cron
            ;;
        "show")
            show_cron
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
