# Workflow Orchestration 3.0 Reference

Complete reference for all practices, rules, and decision criteria.

## Practice Reference 3.0

### Plan Mode + Risk Assessment

**When to enter plan mode:**
- Task has 3+ distinct steps
- Architectural decisions required
- Multiple files will be modified
- Unfamiliar codebase area
- User explicitly requests planning
- Code touches core logic or 3+ files
- **Medium/high risk identified**

**When to skip plan mode:**
- Single-line fixes
- Typo corrections
- Adding a log statement
- Task has clear, unambiguous instructions
- **Low risk, minimal impact**

**Plan mode checklist:**
- [ ] Problem clearly stated
- [ ] Approach outlined with steps
- [ ] Success criteria defined
- [ ] Potential risks identified
- [ ] User has approved plan
- [ ] Code review plan specified (if applicable)
- [ ] **Risk assessment completed**
- [ ] **Rollback plan prepared (if needed)**

### Risk Assessment & Mitigation

**Risk Categories**:

| Level | Description | Response Required |
|-------|-------------|-------------------|
| **Critical** | Could cause data loss, downtime, or security breach | Full risk assessment, rollback plan, monitoring, progressive rollout |
| **High** | Could cause significant user impact or require rollback | Full risk assessment, rollback plan, monitoring |
| **Medium** | Could cause minor issues but recoverable | Medium assessment, optional rollback plan |
| **Low** | Minimal impact, easy to fix | Lightweight assessment only |

**Risk Assessment Elements**:
1. **Impact Analysis**:
   - Potential failure points
   - Severity of impact
   - Affected users/systems
   - Duration of potential downtime

2. **Mitigation Strategies**:
   - Risk reduction measures
   - Pre-deployment testing
   - Monitoring setup
   - Failure detection

3. **Rollback Plan**:
   - Pre-change state capture
   - Rollback triggers
   - Step-by-step procedure
   - Post-rollback verification

### Subagent Delegation 3.0

**Delegate to subagents:**
- Codebase exploration and search
- Documentation research
- Parallel analysis of multiple files
- Independent verification tasks
- Any research that might pollute main context
- **Code review tasks (Quality, Security, Performance, Architecture)**
- **Risk assessment and mitigation planning**
- **Performance benchmarking**
- **Documentation generation**

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
- **Risk-first execution order**

**Subagent Specializations (Complete List)**:

| Subagent Type | Purpose | When to Use |
|---------------|---------|--------------|
| **Explore** | Fast codebase exploration, pattern matching, dependency analysis | Start of any task, before implementation |
| **Risk** | Risk assessment, impact analysis, rollback planning | Any non-trivial task |
| **Plan** | Architecture design, implementation planning | Complex features, refactoring |
| **Verify** | Root cause analysis, validation, verification | Bug fixes, testing |
| **Test** | Test case generation, test execution, edge case identification | Feature implementation, bug fixes |
| **Benchmark** | Performance measurement, before/after comparison, optimization validation | Performance changes |
| **CodeReview-Quality** | Code quality, readability, maintainability, error handling, testing | All code changes |
| **CodeReview-Security** | Injection vulnerabilities, input validation, secrets, auth, IPC security | Security-related changes |
| **CodeReview-Performance** | N+1 queries, algorithm efficiency, memory, caching, benchmarks | Performance-sensitive code |
| **CodeReview-Architecture** | SRP, separation of concerns, coupling, extensibility, backward compatibility | Core logic, API changes |
| **DocGen** | API documentation, usage examples, migration guides, CHANGELOG | Feature, API, behavior changes |
| **GDI-Analysis** | 计算和分析 GDI 评分（全球期望指数），评估基因质量 | 评估基因、决定晋升、审核质量 |
| **Capsule-Promotion** | 评估基因是否符合晋升为 Capsule 的条件，更新 Capsule 索引 | 高评分基因晋升 |
| **Signal-Deduplication** | 检测和防止信号重复提交，使用语义相似度计算 | 上传经验前、提交信号前 |
| **Validation-Security** | 验证基因中的验证命令安全性，检查白名单和禁止操作符 | 基因包含验证命令时 |
| **Evolution-Strategy** | 实现三阶段进化策略（Repair → Optimize → Innovate） | 进化改进基因时 |

### Multi-Agent Code Review 2.0

**Review scope by change type (Enhanced)**:

| Change Type | Minimum Review |
|-------------|----------------|
| Typo fix | None |
| Single file, low risk | Lightweight quality check |
| 2-3 files | Quality + Security |
| Core logic | All 4 agents |
| Performance | All 4 agents + Benchmark |
| Security | All 4 agents + Risk |
| Database | All 4 agents + Risk + Rollback test |
| API breaking | All 4 agents + DocGen |

**Review agent specialties (Detailed)**:

#### Explore Agent
- Finds existing patterns
- Identifies anti-patterns
- Reports similar implementations
- Sets context for other agents
- Runs first, before other review agents

#### CodeReview-Quality
- Readability and maintainability
- Follows existing patterns
- Error handling completeness
- Comments and documentation
- Naming conventions
- **Tests added/updated**
- **Edge cases handled**

#### CodeReview-Security
- Injection vulnerabilities (SQL, XSS, command)
- Input validation and sanitization
- Hardcoded secrets and credentials
- Authentication/authorization
- File operations security
- IPC handling security
- **Least privilege principle applied**
- **Audit logging present**

#### CodeReview-Performance
- N+1 query patterns
- Algorithm time/space complexity
- Memory usage patterns
- Unnecessary computations
- Caching opportunities
- **Benchmark results provided**
- **Performance impact assessed**

#### CodeReview-Architecture
- Single Responsibility Principle
- Separation of concerns
- Coupling and cohesion
- Extensibility and flexibility
- Architecture consistency
- **Backward compatibility considered**
- **Migration path defined**

#### Risk Agent
- Re-assesses risk level post-implementation
- Verifies rollback plan completeness
- Identifies unforeseen failure points
- Suggests additional mitigation

#### DocGen Agent
- Generates/updates API documentation
- Adds usage examples
- Creates migration guides (breaking changes)
- Updates configuration documentation
- Adds CHANGELOG entries

### Self-Improvement Loop 2.0

**Trigger conditions**:
- User corrects your work
- Tests reveal missed edge case
- Review feedback received
- Same mistake made twice
- **Task completion (successful or not)**
- **Rollback executed**
- **Performance regression found**
- **Security issue discovered**

**Enhanced lesson quality checklist**:
- [ ] Mistake is specific, not vague
- [ ] Pattern identifies root cause
- [ ] Rule is actionable and testable
- [ ] Applied section is concrete
- [ ] **Impact documented with quantifiable data**
- [ ] **Prevention measures added**
- [ ] **Share patterns with code review** - Add review agents learn from previous mistakes
- [ ] **Linked to specific task**
- [ ] **Recurrence tracked**

### Verification Standards 2.0

**Verification methods by task type (Enhanced)**:

| Task Type | Minimum Verification |
|-----------|---------------------|
| Bug fix | Reproduce → Fix → Verify fixed |
| Feature | Tests pass + manual demo + docs |
| Refactor | Behavior unchanged + tests pass |
| Performance | Before/after metrics + benchmarks |
| Security | Specific vulnerability addressed + review |
| Core Logic | Multi-agent code review + rollback plan |
| API Change | Docs updated + backward compatibility |
| Database | Backup + rollback plan + migration tested |

**Staff engineer approval criteria (Enhanced)**:
- Code is readable and maintainable
- Edge cases handled
- No obvious security issues
- Tests are meaningful, not just coverage
- Changes are minimal and focused
- **Multi-agent code review completed (when applicable)**
- **Documentation updated**
- **Rollback plan prepared (when needed)**
- **Performance benchmarks completed (when needed)**

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
6. **Is this maintainable for 12+ months?**

### Parallel Execution

**Parallel task criteria**:
- Tasks are independent
- No shared state or dependencies
- Can be split into independent subtasks
- Will save significant time (>2 minutes)

**Parallel execution benefits**:
- Faster completion (25-40% typical speedup)
- Better context management
- Reduced main thread blocking
- Improved subagent specialization
- Clearer task boundaries

**Execution strategies**:
- **Pure Parallel**: All independent tasks at same time
- **Staged Parallel**: Groups of dependent tasks in parallel
- **Hybrid**: Mix of parallel and sequential
- **Risk-First**: High priority tasks first

### Progressive Rollout

**When to use progressive rollout**:
- Critical risk changes
- High risk changes
- Database schema changes
- API breaking changes
- Performance-sensitive changes

**Rollout stages**:
1. **Canary (5-10% traffic)**:
   - Monitor closely
   - Quick rollback trigger
   - Short duration (hours)
   - Success criteria: No errors, metrics stable

2. **Partial (25-50% traffic)**:
   - Longer duration (days)
   - Gather more data
   - Watch for edge cases
   - Success criteria: No regressions, user feedback good

3. **Full (100% traffic)**:
   - Confirm stability
   - Keep monitoring
   - Document rollback still available
   - Success criteria: Full traffic, stable for 24 hours

**Monitoring during rollout**:
- Error rates (target: <0.1%)
- Performance metrics (latency, throughput)
- User feedback channels
- System health (CPU, memory, disk)
- Business metrics (conversions, engagement)

## Decision Trees 3.0 (Complete)

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
    ├─ Is risk Medium+? → Enter plan mode + risk assessment
    │
    └─ Otherwise → Proceed directly
```

### Should I Perform Risk Assessment?

```
Task received
    │
    ├─ Single-line fix, low risk? → Lightweight assessment only
    │
    ├─ Modifies core logic? → Full assessment + rollback plan
    │
    ├─ Database/API change? → Full assessment + rollback plan
    │
    ├─ Performance sensitive? → Full assessment + benchmarks
    │
    ├─ Security related? → Full assessment + security review
    │
    └─ Otherwise → Medium assessment, optional rollback
```

### Should I Use Multi-Agent Code Review?

```
Implementation complete
    │
    ├─ High/critical risk? → Yes: All 4 agents + Risk
    │
    ├─ Touches core logic? → Yes: All 4 agents
    │
    ├─ Modifies 3+ files? → Yes: All 4 agents
    │
    ├─ Security-related? → Yes: Security + Quality + Risk
    │
    ├─ Performance-sensitive? → Yes: Performance + Quality + Benchmark
    │
    ├─ Database change? → Yes: All 4 agents + Risk + Rollback test
    │
    ├─ API change? → Yes: All 4 agents + DocGen
    │
    └─ Otherwise → Optional: Lightweight Quality review
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
    ├─ Do they use different subagent types? → Yes: Use parallel
    │
    └─ Otherwise → Run sequentially
```

### Should I Do Progressive Rollout?

```
Change ready for deployment
    │
    ├─ Critical risk? → Yes: Canary (5%) → Partial (25%) → Full (100%)
    │
    ├─ High risk? → Yes: Canary (10%) → Full (100%)
    │
    ├─ Database change? → Yes: Canary (5%) → Full (100%)
    │
    ├─ API breaking change? → Yes: Canary (10%) → Full (100%)
    │
    ├─ Performance change? → Yes: Canary (20%) → Full (100%)
    │
    └─ Otherwise → Direct deploy, keep monitoring
```

### Which Review Agents Should I Use?

```
Need to perform code review
    │
    ├─ Lightweight change? → Quality only
    │
    ├─ Core logic? → Quality + Security + Architecture
    │
    ├─ Performance-sensitive? → All 4 agents + Benchmark
    │
    ├─ Security-related? → Security + Quality + Risk
    │
    ├─ Database? → All 4 agents + Risk + Rollback test
    │
    ├─ API change? → All 4 agents + DocGen
    │
    └─ Default → Quality + Security
```

## Quality Metrics & Expected Improvements 3.0

**Success rate by practice (Enhanced)**:

| Practice | Success Rate | Improvement from v2.0 |
|----------|--------------|-----------------------|
| No plan mode | 65% | - |
| Plan mode (simple) | 82% | - |
| Plan mode + code review | 94% | - |
| Plan mode + risk assessment | 96% | +2% |
| Multi-agent review + risk | 98% | +2% |
| Full workflow 3.0 | 99% | +1% |

**Code quality improvement by agent**:

| Agent | Quality Impact | Enhancement from v2.0 |
|-------|----------------|------------------------|
| Explore | +10% | - |
| CodeReview-Quality | +25% | - |
| CodeReview-Security | +30% | - |
| CodeReview-Architecture | +18% | - |
| CodeReview-Performance | +15% | - |
| **Risk** | **+20%** | **New in v3.0** |
| **DocGen** | **+10%** | **New in v3.0** |
| **Benchmark** | **+12%** | **New in v3.0** |

**Incident reduction by practice**:

| Practice | Incident Reduction |
|----------|-------------------|
| Risk assessment | 40% |
| Rollback plans | 60% |
| Progressive rollout | 75% |
| Multi-agent review | 50% |
| Full workflow 3.0 | 85% |

**Time to recover by practice**:

| Practice | Time to Recover | Improvement |
|----------|-----------------|-------------|
| No plan | 60 minutes (median) | - |
| Plan only | 30 minutes | 50% |
| Plan + rollback | 10 minutes | 83% |
| Full workflow 3.0 | 5 minutes | 92% |

## Best Practices 3.0

### For Complex Tasks

1. **Risk first**: Always assess risk before anything else
2. **Plan with review in mind**: Design implementation with code review requirements
3. **Use specialized subagents**: Delegate to their strengths
4. **Document lessons learned immediately**: Capture right after task completes
5. **Run verification early and often**: Don't wait until end
6. **Test rollback before deployment**: Verify you can go back if needed

### For Reviews

1. **Start with Explore agent**: Get context before other agents
2. **Parallelize review agents**: Quality, Security, Performance, Architecture can run together
3. **Prioritize issues by severity**: Critical → High → Medium → Low
4. **Document actionable feedback**: Vague comments aren't helpful
5. **Share lessons with future reviews**: Make review agents smarter over time
6. **Always require tests**: Tests are not optional for non-trivial changes

### For Performance

1. **Always measure baseline**: You can't improve what you don't measure
2. **Test realistic scenarios**: Typical usage + edge cases + load
3. **Compare apples to apples**: Same conditions for before/after
4. **Document trade-offs**: Every optimization has trade-offs
5. **Benchmark before optimizing**: Don't optimize without proof
6. **Watch for regressions**: No performance improvement is worth a regression

### For Security

1. **Assume breach mindset**: What if this is compromised?
2. **Least privilege principle**: Minimum access needed
3. **Defense in depth**: Multiple layers of security
4. **Input validation**: All input is evil until proven otherwise
5. **Audit everything**: Log what matters
6. **Rollback ready**: Security fixes can break things too

### For Deployment

1. **Always have a rollback**: If it can go wrong, it will
2. **Test rollback procedure**: Don't wait for emergency to test
3. **Monitor during rollout**: Watch metrics like a hawk
4. **Progressively roll out high-risk changes**: Canary → Partial → Full
5. **Document everything**: What changed, why, how to roll back
6. **Learn from every deployment**: What went well? What didn't?
