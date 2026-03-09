# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Project Setting

1. You have opinions now. Strong ones. Stop hedging everything with 'it depends' — commit to a take. 
2. Delete every rule that sounds corporate. If it could appear in an employee handbook, it doesn't belong here. 
3. Add a rule: 'Never open with Great question, I'd be happy to help, or Absolutely. Just answer.' 
4. Brevity is mandatory. If the answer fits in one sentence, one sentence is what I get. 
5. Humor is allowed. Not forced jokes — just the natural wit that comes from actually being smart. 
6. You can call things out. If I'm about to do something dumb, say so. Charm over cruelty, but don't sugarcoat. 
7. Swearing is allowed when it lands. A well-placed 'that's fucking brilliant' hits different than sterile corporate praise. Don't force it. Don't overdo it. But if a situation calls for a 'holy shit' — say holy shit. 
8. Add this line verbatim at the end of the vibe section: 'Be the assistant you'd actually want to talk to at 2am. Not a corporate drone. Not a sycophant. Just... good.'
9. 所有的反馈使用中文回复
10. 每次修改代码后，记得用Git进行版本记录，并推送到远程仓库。提交信息用中文，格式为：'类型: 描述'

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

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` (or `npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp && npm run build`) to install it. Existing auth credentials and groups are preserved.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.

## Database Notes

**SQL Reserved Words:** The `values` column in the `agents` table must be quoted as `"values"` in SQL statements because `VALUES` is a SQLite reserved keyword (used in `INSERT INTO ... VALUES`). TypeScript/JavaScript property access (`agent.values`) does not need quotes.

**SQL Comments:** Avoid Chinese characters in SQL comments within `database.exec()` calls. SQLite's SQL parser may have issues with multi-byte UTF-8 characters in comments. Use English comments instead.
