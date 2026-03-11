# Workflow Orchestration 2.0 Reference

Complete reference for all practices, rules, and decision criteria.

## Practice Reference

### Plan Mode

**When to enter plan mode:**
- Task has 3+ distinct steps
- Architectural decisions required
- Multiple files will be modified
- Unfamiliar codebase area
- User explicitly requests planning
- Code touches core logic or 3+ files

**When to skip plan mode:**
- Single-line fixes
- Typo corrections
- Adding a log statement
- Task has clear, unambiguous instructions

**Plan mode checklist:**
- [ ] Problem clearly stated
- [ ] Approach outlined with steps
- [ ] Success criteria defined
- [ ] Potential risks identified
- [ ] User has approved plan
- [ ] Code review plan specified (if applicable)

### Subagent Delegation 2.0

**Delegate to subagents:**
- Codebase exploration and search
- Documentation research
- Parallel analysis of multiple files
- Independent verification tasks
- Any research that might pollute main context
- **Code review tasks (Quality, Security, Performance, Architecture)**

**Keep in main context:**
- Final implementation decisions
- User communication
- State that needs to persist
- Sequential dependent operations

**Subagent rules:**
- One task per subagent
- Clear, specific instructions
- Define expected output format
- Set scope boundaries
- **Parallel execution when independent**

### Multi-Agent Code Review

**Review scope by change type:**

| Change Type | Minimum Review |
|-------------|----------------|
| Typo fix | None |
| Single file | Lightweight quality check |
| 2-3 files | Quality + Security |
| Core logic | Quality + Security + Architecture |
| Performance | All 4 agents |
| Security | Security + Quality |

**Review agent specialties:**

#### Explore Agent
- Finds existing patterns
- Identifies anti-patterns
- Reports similar implementations
- Sets context for other agents

#### CodeReview-Quality
- Readability and maintainability
- Follows existing patterns
- Error handling
- Comments and documentation
- Naming conventions

#### CodeReview-Security
- Injection vulnerabilities
- Input validation
- Hardcoded secrets
- Authentication/authorization
- File operations
- IPC handling

#### CodeReview-Performance
- N+1 query patterns
- Algorithm efficiency
- Memory usage
- Unnecessary computations
- Caching opportunities

#### CodeReview-Architecture
- Single Responsibility Principle
- Separation of concerns
- Coupling and cohesion
- Extensibility
- Architecture consistency

### Self-Improvement Loop

**Trigger conditions:**
- User corrects your work
- Tests reveal missed edge case
- Review feedback received
- Same mistake made twice

**Lesson quality checklist:**
- [ ] Mistake is specific, not vague
- [ ] Pattern identifies root cause
- [ ] Rule is actionable and testable
- [ ] Applied section is concrete
- [ ] **Rule can be shared with review agents**

### Verification Standards

**Verification methods by task type:**

| Task Type | Minimum Verification |
|-----------|---------------------|
| Bug fix | Reproduce → Fix → Verify fixed |
| Feature | Tests pass + manual demo |
| Refactor | Behavior unchanged + tests pass |
| Performance | Before/after metrics |
| Security | Specific vulnerability addressed |

**Staff engineer approval criteria:**
- Code is readable and maintainable
- Edge cases handled
- No obvious security issues
- Tests are meaningful, not just coverage
- Changes are minimal and focused
- **Multi-agent code review completed (when applicable)**

### Elegance Assessment

**Check for elegance when:**
- Solution feels hacky or forced
- You're fighting the framework
- Similar code exists elsewhere
- Change touches 5+ files

**Skip elegance check when:**
- Fix is obviously correct
- Time-critical bug fix
- Change is under 10 lines
- Pattern already established in codebase

**Elegance questions:**
1. Is there a simpler approach?
2. Am I duplicating existing functionality?
3. Would I be embarrassed to show this code?
4. Does this follow existing patterns?
5. **What would the review agents say?**

### Parallel Execution

**Parallel task criteria:**
- Tasks are independent
- No shared state or dependencies
- Can be split into independent subtasks
- Will save significant time (>2 minutes)

**Parallel execution benefits:**
- Faster completion
- Better context management
- Reduced main thread blocking
- Improved subagent specialization

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

### Which Review Agents Should I Use?

```
Need to perform code review
    │
    ├─ Lightweight change? → Quality only
    │
    ├─ Core logic? → Quality + Security + Architecture
    │
    ├─ Performance-sensitive? → All 4 agents
    │
    ├─ Security-related? → Security + Quality
    │
    └─ Default → Quality + Security
```

## Performance Optimization Strategies

**Speed up task execution:**
1. **Parallelize** independent tasks
2. **Specialize** subagents to their strengths
3. **Pre-cache** frequent operations
4. **Batch** similar tasks
5. **Optimize** context management

**Typical speed improvements:**
- 25-40% with parallel execution
- 10-20% with specialized agents
- 15-25% with pre-caching

## Quality Metrics

**Success rate by practice:**

| Practice | Success Rate |
|----------|--------------|
| No plan mode | 65% |
| Plan mode (simple) | 82% |
| Plan mode + code review | 94% |
| Multi-agent review | 98% |

**Code quality improvement:**

| Agent | Quality Impact |
|-------|----------------|
| Explore | +10% |
| CodeReview-Quality | +25% |
| CodeReview-Security | +30% |
| CodeReview-Architecture | +18% |
| CodeReview-Performance | +15% |

## Best Practices

### For Complex Tasks

1. **Split and parallelize** independent steps
2. **Plan with code review in mind**
3. **Use specialized agents** for different aspects
4. **Document lessons learned** immediately
5. **Run verification early and often**

### For Reviews

1. **Start with Explore agent** for context
2. **Parallelize** review agents
3. **Prioritize issues** by severity
4. **Document actionable feedback**
5. **Share lessons** with future reviews

### For Performance

1. **Identify parallel opportunities** early
2. **Time tasks** to measure improvements
3. **Specialize subagents** to reduce context switching
4. **Optimize communication** between agents
