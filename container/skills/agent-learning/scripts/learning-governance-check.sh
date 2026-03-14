#!/bin/bash

set -e

LEARNING_DIR="${LEARNING_DIR:-/workspace/group/.learning-system}"
GATES_CONFIG_FILE="$LEARNING_DIR/config/learning-governance-gates.json"
LEGACY_GATES_CONFIG_FILE="$LEARNING_DIR/config/p3-governance-gates.json"
FALLBACK_CONFIG_FILE="${LEARNING_GOVERNANCE_FALLBACK_CONFIG:-/workspace/group/.skills/agent-learning/config/learning-governance-gates.json}"
LEGACY_FALLBACK_CONFIG_FILE="${LEGACY_LEARNING_GOVERNANCE_FALLBACK_CONFIG:-/workspace/group/.skills/agent-learning/config/p3-governance-gates.json}"
LOG_DIR="$LEARNING_DIR/logs"
REPORT_FILE="$LOG_DIR/learning-governance-check-$(date +%Y%m%d-%H%M%S).md"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[Learning Governance]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[Learning Governance]${NC} $1"
}

log_error() {
    echo -e "${RED}[Learning Governance]${NC} $1"
}

detect_agent_folder() {
    local agent_info_file="${AGENT_INFO_FILE:-/workspace/group/.agent-info}"
    if [ -f "$agent_info_file" ] && command -v jq &> /dev/null; then
        cat "$agent_info_file" | jq -r '.agentFolder // "default"'
        return 0
    fi
    echo "default"
}

resolve_config_file() {
    if [ -f "$GATES_CONFIG_FILE" ]; then
        echo "$GATES_CONFIG_FILE"
        return 0
    fi
    if [ -f "$LEGACY_GATES_CONFIG_FILE" ]; then
        echo "$LEGACY_GATES_CONFIG_FILE"
        return 0
    fi
    if [ -f "$FALLBACK_CONFIG_FILE" ]; then
        echo "$FALLBACK_CONFIG_FILE"
        return 0
    fi
    if [ -f "$LEGACY_FALLBACK_CONFIG_FILE" ]; then
        echo "$LEGACY_FALLBACK_CONFIG_FILE"
        return 0
    fi
    echo ""
}

http_check() {
    local method="$1"
    local url="$2"
    local response_file="$3"
    local auth_args=()
    if [ -n "${RUNTIME_API_KEY:-}" ]; then
        auth_args=(-H "X-API-Key: $RUNTIME_API_KEY")
    fi
    curl -s -o "$response_file" -w "%{http_code}" -X "$method" "${auth_args[@]}" "$url"
}

run_check() {
    mkdir -p "$LOG_DIR"
    local config_file
    config_file=$(resolve_config_file)
    if [ -z "$config_file" ]; then
        log_error "找不到治理门禁配置文件"
        return 1
    fi
    if ! command -v jq &> /dev/null; then
        log_error "缺少 jq，无法执行治理门禁检查"
        return 1
    fi
    if ! command -v curl &> /dev/null; then
        log_error "缺少 curl，无法执行治理门禁检查"
        return 1
    fi

    local failed=0
    local passed=0
    local warnings=0
    local agent_folder
    agent_folder=$(detect_agent_folder)
    local api_url="${RUNTIME_API_URL:-http://host.docker.internal:3456}"

    {
        echo "# Agent Learning 治理门禁检查报告"
        echo
        echo "- 时间：$(date -Iseconds)"
        echo "- AgentFolder：$agent_folder"
        echo "- Runtime API：$api_url"
        echo "- 配置文件：$config_file"
        echo
        echo "## 1. 文件门禁"
    } > "$REPORT_FILE"

    while IFS= read -r script_name; do
        [ -z "$script_name" ] && continue
        local target="$LEARNING_DIR/scripts/$script_name"
        if [ -f "$target" ]; then
            echo "- [x] 脚本存在：$target" >> "$REPORT_FILE"
            passed=$((passed + 1))
        else
            echo "- [ ] 脚本缺失：$target" >> "$REPORT_FILE"
            failed=$((failed + 1))
        fi
    done < <(jq -r '.requiredScripts[]' "$config_file")

    while IFS= read -r cfg_name; do
        [ -z "$cfg_name" ] && continue
        local target="$LEARNING_DIR/config/$cfg_name"
        if [ -f "$target" ]; then
            echo "- [x] 配置存在：$target" >> "$REPORT_FILE"
            passed=$((passed + 1))
        else
            echo "- [ ] 配置缺失：$target" >> "$REPORT_FILE"
            failed=$((failed + 1))
        fi
    done < <(jq -r '.requiredConfigs[]' "$config_file")

    {
        echo
        echo "## 2. 调度语义门禁"
    } >> "$REPORT_FILE"

    local expected_mode
    expected_mode=$(jq -r '.requireRuntimeSchedulerMode // "runtime"' "$config_file")
    local actual_mode="${REFLECTION_SCHEDULER_MODE:-runtime}"
    if [ "$actual_mode" = "$expected_mode" ]; then
        echo "- [x] 反思调度模式符合预期：$actual_mode" >> "$REPORT_FILE"
        passed=$((passed + 1))
    else
        echo "- [ ] 反思调度模式不匹配：当前=$actual_mode，期望=$expected_mode" >> "$REPORT_FILE"
        failed=$((failed + 1))
    fi

    {
        echo
        echo "## 3. API 门禁"
    } >> "$REPORT_FILE"

    if [ "${LEARNING_GOVERNANCE_SKIP_API_CHECK:-false}" = "true" ]; then
        echo "- [!] 已跳过 API 门禁检查（LEARNING_GOVERNANCE_SKIP_API_CHECK=true）" >> "$REPORT_FILE"
        warnings=$((warnings + 1))
    else
        while IFS= read -r endpoint; do
            [ -z "$endpoint" ] && continue
            local name method path url response_file code accepted
            name=$(echo "$endpoint" | jq -r '.name')
            method=$(echo "$endpoint" | jq -r '.method')
            path=$(echo "$endpoint" | jq -r '.path')
            url="${api_url}${path}"
            if [[ "$url" == *"/api/learning/automation/status"* ]]; then
                url="${url}?agentFolder=${agent_folder}"
            fi
            if [[ "$url" == *"/api/learning/tasks"* ]]; then
                url="${url}?agentFolder=${agent_folder}"
            fi
            if [[ "$url" == *"/api/scheduled/tasks"* ]]; then
                url="${url}?groupFolder=${agent_folder}"
            fi
            response_file="$LOG_DIR/learning-governance-api-${name}.json"
            code=$(http_check "$method" "$url" "$response_file" || echo "000")
            accepted=$(jq --argjson code "$code" '.acceptHttpCodes | index($code)' "$config_file")
            if [ "$accepted" != "null" ]; then
                echo "- [x] ${name} 可达：HTTP ${code} (${url})" >> "$REPORT_FILE"
                passed=$((passed + 1))
            elif [ "$code" = "000" ]; then
                echo "- [ ] ${name} 不可达：HTTP ${code} (${url})" >> "$REPORT_FILE"
                failed=$((failed + 1))
            else
                echo "- [!] ${name} 非预期状态：HTTP ${code} (${url})" >> "$REPORT_FILE"
                warnings=$((warnings + 1))
            fi
        done < <(jq -c '.requiredApiChecks[]' "$config_file")
    fi

    {
        echo
        echo "## 4. 汇总"
        echo
        echo "- 通过：$passed"
        echo "- 警告：$warnings"
        echo "- 失败：$failed"
    } >> "$REPORT_FILE"

    if [ "$failed" -gt 0 ]; then
        log_error "治理门禁检查失败，报告：$REPORT_FILE"
        return 1
    fi

    if [ "$warnings" -gt 0 ]; then
        log_warn "治理门禁检查通过（含警告），报告：$REPORT_FILE"
        return 0
    fi

    log_info "治理门禁检查通过，报告：$REPORT_FILE"
    return 0
}

main() {
    case "${1:-check}" in
        "check")
            run_check
            ;;
        *)
            log_error "未知命令: $1"
            return 1
            ;;
    esac
}

main "$@"
