<!-- ===================================================================== -->
<!-- [CUSTOM ARCHITECTURE PRINCIPLES] 自定义架构最高宪法 START -->
<!-- 警告：以下部分为本项目的核心工程准则，优先级高于底层默认准则 -->
<!-- ===================================================================== -->

# 🤖 核心架构准则：定制化 Agent 系统扩展指南

本文件定义了本项目的基础架构哲学与开发纪律。作为 AI 助手（Claude Code），在执行任何操作前，**必须严格遵守以下准则**。

> 📌 **当前任务与蓝图指引**：
> 本文件仅包含“永久性工程准则”。关于当前正在开发什么功能（如具体的记忆系统、通信网络等），**请务必首先读取根目录的 `ROADMAP.md` 或 `TODO.md`** 获取当前阶段的上下文。

## 1. 核心不可变与上游隔离 (Core Immutability & Isolation)
- **非侵入式扩展**：绝对禁止直接重写或大面积修改上游基础框架（如主循环、容器调度）的核心代码。所有自定义模块、插件和子系统必须存放在独立的目录（如 `src/custom/`）下。
- **无损拦截**：如果必须改变核心流程，强制使用事件监听（Event Emitters）、中间件或钩子（Hooks）模式进行拦截，而不是直接修改源码。
- **强制防冲突标记**：任何对上游原文件的必要侵入，必须使用注释包裹：`// [CUSTOM: <模块功能>] 开始` 与 `// [CUSTOM] 结束`。合并代码前需全局检索此标记。

## 2. 极简主义与轻量化基础设施 (Minimalist Infrastructure)
- **拒绝重型依赖**：强大的系统源于复杂的逻辑设计，而非臃肿的依赖。禁止随意引入重型数据库或消息中间件（如 Neo4j、Redis、Kafka）。
- **文本优先**：复杂数据（如记忆图谱、关系网络）默认使用结构化文本（Markdown/JSON）或轻量级嵌入式数据库（SQLite）持久化。
- **文件系统即通信**：系统内部模块或多 Agent 间的通信路由，优先利用操作系统的文件系统（基于目录的 Inbox/Outbox 机制）实现，而非占用网络端口。

## 3. 技能驱动哲学 (Skill-Driven Architecture)
- 拒绝将复杂的后台任务、记忆处理或外部交互硬编码进主程序循环。
- 所有的独立功能块、闲时任务、反思机制，必须封装为独立的 Skills（存放在 `.claude/skills/` 目录下），让 Agent 按需调用。

## 4. 向上知识反哺与防遗忘机制 (Upward Knowledge & Evolution)
- **强制反思与沉淀**：每次解决复杂 Bug 或完成阶段性任务后，必须将踩坑记录与解决方案结构化地写入反思日志库（如 `docs/REFLECTIONS.md`）。
- **行动前置读取**：在执行任何新的编码任务前，必须强制优先检索并阅读反思日志，确保“同样的坑绝对不踩第二次”。
- **架构日记**：所有重大的系统演进与决策论证，必须记录在 `ARCHITECTURE.md` 中。

## 5. Token 经济学与上下文修剪 (Context Pruning)
- **警惕上下文爆炸**：绝对禁止将全量历史日志直接喂给大模型。
- **强制归档机制**：当任何日志、记忆文件或反思文档长度超过 500 行时，必须触发归档操作：将其提炼为高密度的“核心原则摘要”，并将原始记录移入归档目录。主程序日常只允许读取摘要。

## 6. 数据与状态完全隔离 (State Isolation)
- 所有运行时产生的数据、图谱、通信日志、进化数据集等，必须强制存储在 `data/` 或 `volumes/` 等独立目录下。
- 这些数据目录必须被严格加入 `.gitignore`，绝对不允许与源码混淆，以防止上游同步时发生覆盖或冲突。

## 7. 严格的开发工作流 (Strict Dev Discipline)
- **禁止无计划编码 (No AI Slop)**：严禁在没有明确计划和拆解的情况下直接生成大段代码。
- **测试驱动 (TDD)**：开发核心逻辑结构（如数据路由、状态增删改查）时，无测试不编码。必须先编写失败的测试用例。
- **降维拆解**：遇到复杂系统，必须先将其拆分为微小、可独立验证的子任务再执行。

## 8. Git 与上游同步纪律 (Git & Upstream Sync Protocol)
- **双分支隔离架构**：必须严格维护隔离的 Git 工作流。
  - `upstream-sync` 分支：仅用于拉取和存放 `nanoclaw` 上游的纯净更新，严禁在此分支开发自定义功能。
  - `main` 分支（或特性分支）：用于承载我们的定制化系统。
- **合并与防覆盖检查**：在将 `upstream-sync` 合并到 `main` 之前，AI 必须全局扫描 `// [CUSTOM]` 标记区块。如果在合并中发生冲突，**自定义标记区块内的逻辑具有绝对优先保留权**。
- **AI 自动提交规范**：配合 `superpowers` 的工作流时，任何自动创建的分支或 Git Worktree 提交，必须使用清晰的语义化标签（如 `feat(mem0): ...` 或 `refactor(evomap): ...`），并在 Commit Message 中注明是否修改了上游核心文件。

<!-- ===================================================================== -->
<!--[CUSTOM ARCHITECTURE PRINCIPLES] 自定义架构最高宪法 END   -->
<!-- ===================================================================== -->

---

# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/agent-browser.md` | Browser automation tool (available to all agents via Bash) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate channel fork, not bundled in core. Run `/add-whatsapp` (or `git remote add whatsapp https://github.com/qwibitai/nanoclaw-whatsapp.git && git fetch whatsapp main && (git merge whatsapp/main || { git checkout --theirs package-lock.json && git add package-lock.json && git merge --continue; }) && npm run build`) to install it. Existing auth credentials and groups are preserved.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.
