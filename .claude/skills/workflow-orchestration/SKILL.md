---
name: workflow-orchestration
description: |
  Disciplined task execution with planning, verification, and self-improvement loops.
  Use when starting non-trivial tasks (3+ steps), fixing bugs, building features,
  refactoring code, or when rigorous execution with quality gates is needed.
  Includes subagent delegation, lessons tracking, and staff-engineer-level verification.
  NEW: Multi-agent code review, parallel execution, and enhanced quality gates.
license: MIT
metadata:
  author: vxcozy
  version: "2.0.0"
---

# Workflow Orchestration 2.0

Apply these practices for disciplined, high-quality task execution.

## Quick Reference

| Practice | When to Apply |
|----------|---------------|
| Plan Mode | Any task with 3+ steps or architectural decisions |
| Subagents | Research, exploration, parallel analysis, code review |
| Lessons | After ANY user correction |
| Verification | Before marking any task complete |
| Elegance Check | Non-trivial changes only |
| Multi-Agent Review | Any code change touching core logic or 3+ files |
| Parallel Execution | Independent tasks that can run concurrently |

## 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- **Code Review Requirement**: Any change touching 3+ files or modifying core logic requires plan mode with code review plan

## 2. Subagent Strategy 2.0

Keep the main context window clean:

- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

**Subagent Types & Specializations**:

| Subagent Type | Purpose |
|---------------|---------|
| **Explore** | Fast codebase exploration (files, patterns, dependencies) |
| **Plan** | Architecture and implementation planning |
| **Verify** | Verification and validation tasks |
| **CodeReview-Quality** | Code quality, readability, maintainability review |
| **CodeReview-Security** | Security vulnerability review |
| **CodeReview-Performance** | Performance impact assessment |
| **CodeReview-Architecture** | Architecture and design pattern review |
| **Test** | Test case generation and execution |

**Subagent Execution Strategy**:
- **Parallel**: Multiple independent subagents can run at the same time
- **Sequential**: Dependent subagents run in order
- **Hybrid**: Mix of parallel and sequential execution

## 3. Multi-Agent Code Review Protocol

**For ANY non-trivial change**:

### 3.1 Review Trigger Conditions

Trigger multi-agent code review when:
- Change touches 3+ files
- Modifies core system logic
- Introduces new dependencies
- Changes public APIs
- Performance-sensitive code
- Security-related changes

### 3.2 Review Workflow

```
Implementation Complete
        │
        ▼
   [Automated Checks]
   - Tests pass
   - Type checks
   - Linting
        │
        ▼
   [Explore Agent]
   - Check existing patterns
   - Find similar implementations
   - Identify anti-patterns
        │
        ▼
   [Parallel Review Agents]
   ├─ CodeReview-Quality
   ├─ CodeReview-Security
   ├─ CodeReview-Performance
   └─ CodeReview-Architecture
        │
        ▼
   [Synthesize Results]
   - Combine all reviews
   - Prioritize issues
   - Generate actionable feedback
        │
        ▼
   [Apply Fixes]
   - Address critical issues
   - Optional: Improve non-critical
        │
        ▼
   [Final Verification]
   - Tests still pass
   - All reviews satisfied
```

### 3.3 Review Agent Roles & Checklists

#### CodeReview-Quality
- [ ] Follows existing code patterns
- [ ] Readable and maintainable
- [ ] No unnecessary complexity
- [ ] Proper error handling
- [ ] Clear comments where needed
- [ ] Consistent naming conventions

#### CodeReview-Security
- [ ] No injection vulnerabilities
- [ ] Proper input validation
- [ ] No hardcoded secrets
- [ ] Secure authentication/authorization
- [ ] No unsafe file operations
- [ ] Secure IPC handling

#### CodeReview-Performance
- [ ] No N+1 query patterns
- [ ] Efficient algorithms
- [ ] Minimal memory usage
- [ ] No unnecessary computations
- [ ] Cache where appropriate

#### CodeReview-Architecture
- [ ] Single Responsibility Principle
- [ ] Proper separation of concerns
- [ ] No tight coupling
- [ ] Extensible design
- [ ] Consistent with existing architecture

## 4. Self-Improvement Loop

After ANY correction from the user:

1. Update `tasks/lessons.md` with the pattern
2. Write rules that prevent the same mistake
3. Review lessons at session start
4. **Share patterns with code review** - Add review agents learn from previous mistakes

See [references/lessons-format.md](references/lessons-format.md) for the template.

## 5. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate corrections
- **Multi-agent code review completed (when applicable)

**Verification Methods by Task Type**:

| Task Type | Minimum Verification |
|-----------|---------------------|
| Bug fix | Reproduce → Fix → Verify fixed |
| Feature | Tests pass + manual demo |
| Refactor | Behavior unchanged + tests pass |
| Performance | Before/after metrics |
| Security | Specific vulnerability addressed |
| Core Logic | Multi-agent code review |

## 6. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes—don't over-engineer
- **Review agents check for elegance as part of quality review

## 7. Autonomous Bug Fixing

- When given a bug report: Just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests—then resolve them
- Zero context switching required from the user
- **Use Verify subagent for root cause analysis

## Task Management Protocol 2.0

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Parallel Execution**: Use subagents for parallel tasks
6. **Multi-Agent Review**: Code review when needed
7. **Document Results**: Add review to `tasks/todo.md`
8. **Capture Lessons**: Update `tasks/lessons.md` after corrections

See [references/task-templates.md](references/task-templates.md) for file templates.

## Core Principles 2.0

- **Simplicity First**: Make every change as simple as possible
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards
- **Minimal Impact**: Only touch what's necessary. Avoid introducing bugs
- **Quality Through Review**: Use multi-agent review for quality assurance
- **Continuous Learning**: Lessons from mistakes, review agents get smarter
- **Parallel Execution**: Where possible, use parallel subagents for efficiency

## Decision Trees 2.0

### Should I Enter Plan Mode?

```
Task received
    │
    ├─ Is it a single-line fix? → No plan needed
    │
    ├─ Are there 3+ steps? → Enter plan mode
    │
    ├─ Does it involve architecture? → Enter plan mode
    │
    ├─ Am I uncertain about approach? → Enter plan mode
    │
    ├─ Will it touch 3+ files? → Enter plan mode + code review plan
    │
    └─ Otherwise → Proceed directly
```

### Should I Use Multi-Agent Code Review?

```
Implementation complete
    │
    ├─ Touches core logic? → Yes: Trigger review
    │
    ├─ Modifies 3+ files? → Yes: Trigger review
    │
    ├─ Security-related? → Yes: Trigger review
    │
    ├─ Performance-sensitive? → Yes: Trigger review
    │
    └─ Otherwise → Optional: Consider lightweight review
```

### Should I Use Parallel Subagents?

```
Have multiple tasks
    │
    ├─ Are they independent? → Yes: Run in parallel
    │
    ├─ Can they be split? → Yes: Split and parallelize
    │
    ├─ Will save >2 minutes? → Yes: Use parallel
    │
    └─ Otherwise → Run sequentially
```
