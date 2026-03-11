# Task Templates

Ready-to-use templates for task management files.

## tasks/todo.md

```markdown
# Task: [Title]

## Plan
- [ ] Step 1: [Description]
- [ ] Step 2: [Description]
- [ ] Step 3: [Description]
- [ ] Verification: [How to prove it works]
- [ ] **Code Review**: [If applicable, specify review agents: Quality, Security, Performance, Architecture]

## Progress Notes
<!-- Add timestamped notes as you work -->

## Parallel Tasks (when applicable)
- [ ] [Task 1] - [Estimated time]
- [ ] [Task 2] - [Estimated time]
- [ ] [Task 3] - [Estimated time]

## Code Review Summary
**Agents Used**: [List of agents]
**Overall Score**: [0-10]
**Critical Issues**: [List]
**High Priority**: [List]
**Medium Priority**: [List]

## Review
<!-- Summary when complete: what changed, what was learned -->
```

## Example: Feature Implementation with Code Review

```markdown
# Task: Add user authentication

## Plan
- [ ] Research existing auth patterns in codebase (Explore subagent)
- [ ] Design session management approach (Plan subagent)
- [ ] Implement login endpoint
- [ ] Implement logout endpoint
- [ ] Add session middleware
- [ ] Write tests
- [ ] **Code Review**: Trigger multi-agent review (Quality, Security, Architecture)
- [ ] Verification: Manual test + all tests pass

## Progress Notes
2024-01-15 10:00 - Found existing JWT utilities in lib/auth.ts
2024-01-15 11:30 - Login endpoint complete, tested with curl

## Code Review Summary
**Agents**: Explore, CodeReview-Quality, CodeReview-Security, CodeReview-Architecture
**Overall Score**: 8/10
**Critical Issues**: None
**High Priority**: Add more edge case tests
**Medium Priority**: Improve error handling

## Review
Added JWT-based auth with 24h expiry. Reused existing token utilities.
Tests cover happy path and invalid credentials.
Code review completed successfully with minor suggestions.
```

## Example: Refactor with Parallel Execution

```markdown
# Task: Refactor API layer to use fetch

## Plan
- [ ] Parallel: Explore existing patterns + Identify all affected files
- [ ] Parallel: Research fetch API best practices
- [ ] Implement fetch wrapper
- [ ] Update API calls (5 files)
- [ ] **Code Review**: Multi-agent review for breaking changes
- [ ] Run tests + verify functionality unchanged

## Progress Notes
2024-01-18 09:00 - Subagents exploring patterns and fetch best practices
2024-01-18 09:30 - Implementation complete
2024-01-18 09:45 - Code review triggered (security + architecture agents)
2024-01-18 10:15 - All reviews completed, no critical issues

## Code Review Summary
**Agents**: Explore, CodeReview-Security, CodeReview-Architecture
**Overall Score**: 9/10
**Critical Issues**: None
**High Priority**: Add request timeout
**Medium Priority**: Improve error message formatting

## Review
Refactor completed successfully in ~90 minutes (parallel execution saved 25 minutes).
Breaking changes identified and handled properly.
Code review found and fixed potential security issue with error handling.
```

## Example: Bug Fix

```markdown
# Task: Fix memory leak in WebSocket handler

## Plan
- [ ] Reproduce the issue locally
- [ ] Identify leak source with profiler
- [ ] Implement fix
- [ ] Verification: Memory stable over 1000 connections

## Progress Notes
2024-01-15 14:00 - Reproduced: memory grows 10MB/min under load
2024-01-15 14:30 - Found: event listeners not cleaned up on disconnect
2024-01-15 14:45 - Fix implemented, tested
2024-01-15 15:00 - Verification complete: memory stable at ~50MB

## Review
Root cause: Missing removeEventListener in cleanup. Added proper cleanup
in disconnect handler. Memory now stable at ~50MB under same load.
Code review not needed for this localized fix.
```
