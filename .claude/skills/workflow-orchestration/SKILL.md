---
name: workflow-orchestration
description: |
  Disciplined task execution with planning, verification, and self-improvement loops.
  Use when starting non-trivial tasks (3+ steps), fixing bugs, building features,
  refactoring code, or when rigorous execution with quality gates is needed.
  Includes subagent delegation, lessons tracking, staff-engineer-level verification,
  multi-agent code review, risk management, rollback strategies, and
  integration with evolution system (search evolution library, learn, execute,
  upload experience, trigger review).
license: MIT
metadata:
  author: vxcozy
  version: "3.1.0"
  evolutionIntegration: true
---

# Workflow Orchestration 3.0

Apply these practices for disciplined, high-quality task execution with risk management and continuous improvement.

## Quick Reference

| Practice | When to Apply |
|----------|---------------|
| **Evolution Integration** | Search evolution library, learn, execute, upload experience, trigger review |
| Plan Mode | Any task with 3+ steps or architectural decisions |
| Risk Assessment | Before starting any non-trivial task |
| Subagents | Research, exploration, parallel analysis, code review |
| Lessons | After ANY user correction or task completion |
| Verification | Before marking any task complete |
| Elegance Check | Non-trivial changes only |
| Multi-Agent Review | Any code change touching core logic or 3+ files |
| Parallel Execution | Independent tasks that can run concurrently |
| Rollback Plan | Any change that could impact production |
| Documentation Update | Any feature, API, or behavior change |
| Performance Benchmark | Performance-sensitive changes |
| Progressive Rollout | High-risk changes |

| Practice | When to Apply |
|----------|---------------|
| Plan Mode | Any task with 3+ steps or architectural decisions |
| Risk Assessment | Before starting any non-trivial task |
| Subagents | Research, exploration, parallel analysis, code review |
| Lessons | After ANY user correction or task completion |
| Verification | Before marking any task complete |
| Elegance Check | Non-trivial changes only |
| Multi-Agent Review | Any code change touching core logic or 3+ files |
| Parallel Execution | Independent tasks that can run concurrently |
| Rollback Plan | Any change that could impact production |
| Documentation Update | Any feature, API, or behavior change |
| Performance Benchmark | Performance-sensitive changes |
| Progressive Rollout | High-risk changes |

## 1. Plan Mode Default + Risk Assessment

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- **Code Review Requirement**: Any change touching 3+ files or modifying core logic requires plan mode with code review plan
- **Risk Assessment Requirement**: Mandatory for any task with potential impact

### 1.1 Risk Assessment Protocol

**Risk Categories**:
- **Critical**: Could cause data loss, downtime, or security breach
- **High**: Could cause significant user impact or require rollback
- **Medium**: Could cause minor issues but recoverable
- **Low**: Minimal impact, easy to fix

**Risk Assessment Checklist**:
- [ ] Identify potential failure points
- [ ] Assess impact severity
- [ ] Define mitigation strategies
- [ ] Create rollback plan
- [ ] Set up monitoring/alerting
- [ ] Define success/failure criteria

### 1.2 Rollback Strategy

**When to prepare rollback**:
- Any change touching core logic
- Database schema changes
- API breaking changes
- Performance optimizations
- Security-related changes

**Rollback Plan Elements**:
1. **Pre-Change State Capture**:
   - Backup relevant data
   - Record current versions
   - Capture configuration state

2. **Rollback Triggers**:
   - Explicit failure criteria
   - Monitoring alerts
   - User reported issues
   - Test failures

3. **Rollback Steps**:
   - Step-by-step rollback procedure
   - Dependencies to roll back
   - Verification after rollback

## 2. Subagent Strategy 3.0

Keep the main context window clean:

- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

**Subagent Types & Specializations**:

| Subagent Type | Purpose |
|---------------|---------|
| **Explore** | Fast codebase exploration (files, patterns, dependencies) |
| **Risk** | Risk assessment and mitigation planning |
| **Plan** | Architecture and implementation planning |
| **Verify** | Verification and validation tasks |
| **Test** | Test case generation and execution |
| **Benchmark** | Performance benchmarking and analysis |
| **CodeReview-Quality** | Code quality, readability, maintainability review |
| **CodeReview-Security** | Security vulnerability review |
| **CodeReview-Performance** | Performance impact assessment |
| **CodeReview-Architecture** | Architecture and design pattern review |
| **DocGen** | Documentation generation and update |

**Subagent Execution Strategy**:
- **Parallel**: Multiple independent subagents can run at the same time
- **Sequential**: Dependent subagents run in order
- **Hybrid**: Mix of parallel and sequential execution
- **Risk-First**: Risk assessment runs before other agents

## 3. Multi-Agent Code Review Protocol 2.0

**For ANY non-trivial change**:

### 3.1 Review Trigger Conditions

Trigger multi-agent code review when:
- Change touches 3+ files
- Modifies core system logic
- Introduces new dependencies
- Changes public APIs
- Performance-sensitive code
- Security-related changes
- **High or critical risk identified**

### 3.2 Review Workflow (Enhanced)

```
Implementation Complete
        │
        ▼
   [Automated Checks]
   - Tests pass
   - Type checks
   - Linting
   - Security scans (if available)
        │
        ▼
   [Risk Agent] (if not already done)
   - Re-assess risk level
   - Verify rollback plan
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
   [DocGen Agent]
   - Generate/update documentation
   - Update API docs
   - Add usage examples
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
   [Verification & Rollback Prep]
   - Tests still pass
   - All reviews satisfied
   - Rollback plan ready
        │
        ▼
   [Final Verification]
   - All checks passed
   - Documentation updated
   - Ready for deployment
```

### 3.3 Review Agent Roles & Checklists (Enhanced)

#### CodeReview-Quality
- [ ] Follows existing code patterns
- [ ] Readable and maintainable
- [ ] No unnecessary complexity
- [ ] Proper error handling
- [ ] Clear comments where needed
- [ ] Consistent naming conventions
- [ ] **Tests added/updated**
- [ ] **Edge cases handled**

#### CodeReview-Security
- [ ] No injection vulnerabilities
- [ ] Proper input validation
- [ ] No hardcoded secrets
- [ ] Secure authentication/authorization
- [ ] No unsafe file operations
- [ ] Secure IPC handling
- [ ] **Least privilege principle applied**
- [ ] **Audit logging present**

#### CodeReview-Performance
- [ ] No N+1 query patterns
- [ ] Efficient algorithms
- [ ] Minimal memory usage
- [ ] No unnecessary computations
- [ ] Cache where appropriate
- [ ] **Benchmark results provided**
- [ ] **Performance impact assessed**

#### CodeReview-Architecture
- [ ] Single Responsibility Principle
- [ ] Proper separation of concerns
- [ ] No tight coupling
- [ ] Extensible design
- [ ] Consistent with existing architecture
- [ ] **Backward compatibility considered**
- [ ] **Migration path defined**

## 4. Documentation Update Protocol

**Mandatory documentation updates for**:
- New features
- API changes
- Behavior changes
- Configuration changes
- Database schema changes

**Documentation Checklist**:
- [ ] API documentation updated
- [ ] Usage examples added
- [ ] Migration guide provided (if breaking changes)
- [ ] Configuration options documented
- [ ] Troubleshooting section updated
- [ ] CHANGELOG entry added

## 5. Performance Benchmark Protocol

**When to benchmark**:
- Performance-sensitive changes
- Algorithm changes
- Database query changes
- New features with potential impact

**Benchmark Elements**:
1. **Baseline Measurement**:
   - Before changes performance metrics
   - Control group results

2. **Test Scenarios**:
   - Typical usage patterns
   - Edge cases
   - Load testing

3. **Comparison Metrics**:
   - Latency (p50, p95, p99)
   - Throughput
   - Memory usage
   - CPU usage

4. **Success Criteria**:
   - No regression >5% (configurable)
   - Improvements documented
   - Trade-offs recorded

## 6. Progressive Rollout Strategy

**For high-risk changes**:

**Rollout Stages**:
1. **Canary (5-10% traffic)**:
   - Monitor closely
   - Quick rollback trigger
   - Short duration (hours)

2. **Partial (25-50% traffic)**:
   - Longer duration (days)
   - Gather more data
   - Watch for edge cases

3. **Full (100% traffic)**:
   - Confirm stability
   - Keep monitoring
   - Document rollback still available

**Monitoring During Rollout**:
- Error rates
- Performance metrics
- User feedback
- System health

## 7. Self-Improvement Loop 2.0

**Trigger conditions**:
- User corrects your work
- Tests reveal missed edge case
- Review feedback received
- Same mistake made twice
- **Task completion (successful or not)**
- **Rollback executed**

**Enhanced lesson quality checklist**:
- [ ] Mistake is specific, not vague
- [ ] Pattern identifies root cause
- [ ] Rule is actionable and testable
- [ ] Applied section is concrete
- [ ] **Impact documented**
- [ ] **Prevention measures added**
- [ ] **Share patterns with code review** - Add review agents learn from previous mistakes

See [references/lessons-format.md](references/lessons-format.md) for the enhanced template.

## 8. Verification Before Done 2.0

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate corrections
- **Multi-agent code review completed (when applicable)**
- **Documentation updated**
- **Rollback plan prepared (when needed)**
- **Performance benchmarks completed (when needed)**

**Enhanced Verification Methods by Task Type**:

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

## 9. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes—don't over-engineer
- **Review agents check for elegance as part of quality review**
- **Consider long-term maintainability, not just short-term fix**

## 10. Autonomous Bug Fixing 2.0

- When given a bug report: Just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests—then resolve them
- Zero context switching required from the user
- **Use Verify subagent for root cause analysis**
- **Assess risk before fixing**
- **Prepare rollback if high risk**
- **Add regression test to prevent recurrence**

## Task Management Protocol 3.0

1. **Risk Assessment First**: Evaluate risk before anything else
2. **Plan First**: Write plan to `tasks/todo.md` with checkable items
3. **Rollback Plan**: Prepare if risk is medium or higher
4. **Verify Plan**: Check in before starting implementation
5. **Track Progress**: Mark items complete as you go
6. **Parallel Execution**: Use subagents for parallel tasks
7. **Multi-Agent Review**: Code review when needed
8. **Benchmark**: Performance testing when needed
9. **Update Docs**: Documentation always updated
10. **Document Results**: Add review to `tasks/todo.md`
11. **Capture Lessons**: Update `tasks/lessons.md` after corrections or completion

See [references/task-templates.md](references/task-templates.md) for enhanced file templates.

## Core Principles 3.0

- **Simplicity First**: Make every change as simple as possible
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards
- **Minimal Impact**: Only touch what's necessary. Avoid introducing bugs
- **Quality Through Review**: Use multi-agent review for quality assurance
- **Continuous Learning**: Lessons from mistakes, review agents get smarter
- **Parallel Execution**: Where possible, use parallel subagents for efficiency
- **Risk Management**: Always assess risk and have a rollback plan
- **Documentation First**: If it's not documented, it doesn't exist
- **Progressive Rollout**: High-risk changes get staged deployment

## Decision Trees 3.0

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

### Should I Perform Risk Assessment?

```
Task received
    │
    ├─ Single-line fix, low risk? → Lightweight assessment
    │
    ├─ Modifies core logic? → Full risk assessment + rollback plan
    │
    ├─ Database/API change? → Full risk assessment + rollback plan
    │
    ├─ Performance sensitive? → Full risk assessment + benchmarks
    │
    └─ Otherwise → Medium assessment, optional rollback
```

### Should I Use Multi-Agent Code Review?

```
Implementation complete
    │
    ├─ High/critical risk? → Yes: Full review + security
    │
    ├─ Touches core logic? → Yes: Full review
    │
    ├─ Modifies 3+ files? → Yes: Full review
    │
    ├─ Security-related? → Yes: Security + Quality
    │
    ├─ Performance-sensitive? → Yes: Performance + Quality
    │
    └─ Otherwise → Optional: Lightweight review
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

### Should I Do Progressive Rollout?

```
Change ready for deployment
    │
    ├─ Critical risk? → Yes: Canary + partial + full
    │
    ├─ High risk? → Yes: Canary + full
    │
    ├─ Database change? → Yes: Canary + full
    │
    ├─ API breaking change? → Yes: Canary + full
    │
    └─ Otherwise → Direct deploy, keep monitoring
```

---

## 11. 进化系统整合 (Evolution System Integration) 3.1

### 11.1 整合概述

将 workflow-orchestration 的"纪律性执行"与进化系统的"经验循环"完美结合：

```
任务接收 → 搜索进化库 → 搜索外部学习 → 执行任务 → 上传经验 → 触发审核
      ↓            ↓           ↓         ↓         ↓
  Evolution-Search   External-Learning    验证阶段   Evolution-Upload   多代理审核
```

### 11.2 新增子代理

| Subagent Type | Purpose | When to Use |
|---------------|---------|--------------|
| **Evolution-Search** | 搜索进化库，查找可复用经验 | 任务开始时，任何非 trivial 任务 |
| **External-Learning** | 搜索外部服务获取新知识 | 进化库经验不足时 |
| **Evolution-Upload** | 总结经验并上传到进化库 | 任务成功完成后 |

### 11.3 整合工作流

#### 阶段 1: 任务接收与进化库搜索

```
任务接收
    │
    ▼
[Evolution-Search 代理]
    ├─ 搜索进化库 (queryExperience)
    ├─ 查找相关经验
    ├─ 分析是否有可复用的方案
    └─ 生成经验搜索报告
    │
    ▼
{ 找到可用经验? }
    ├─ 是 → 使用进化库经验，跳转到阶段 2
    └─ 否 → 继续正常 workflow-orchestration 流程
```

#### 阶段 2: 使用进化库经验 + 外部学习

```
使用进化库经验
    │
    ▼
[Plan 代理]
    ├─ 基于进化库经验制定计划
    ├─ 评估经验适用性
    ├─ 确定需要调整的部分
    └─ 制定执行计划
    │
    ▼
{ 需要外部学习? }
    ├─ 是 → [External-Learning 代理]
    │       ├─ 搜索外部服务
    │       └─ 生成学习结果
    └─ 否 → 继续执行
    │
    ▼
[Risk 代理]
    ├─ 评估使用进化库经验的风险
    ├─ 识别可能的不匹配点
    └─ 制定回滚计划
```

#### 阶段 3: 执行任务 + 验证

```
执行任务
    │
    ▼
[Verify 代理]
    ├─ 验证任务结果
    ├─ 与进化库经验对比
    ├─ 评估是否改进了原有经验
    └─ 生成验证报告
    │
    ▼
[Benchmark 代理] (如果是性能敏感任务)
    ├─ 测量性能指标
    ├─ 与进化库经验对比
    └─ 确定是否有改进
    │
    ▼
[CodeReview 代理] (如果涉及代码变更)
    └─ 特别关注经验复用的实现
```

#### 阶段 4: 经验总结 + 上传进化库

```
任务完成，验证成功
    │
    ▼
[Evolution-Upload 代理]
    ├─ 总结本次执行的经验
    ├─ 与原有进化库经验对比
    ├─ 判断是否应该上传
    │   ├─ 是新类型任务? → 上传
    │   ├─ 改进了原有经验? → 上传新版本
    │   └─ 与现有经验相似? → 可选上传
    ├─ 生成完整的经验文档
    ├─ 调用 submitExperience()
    └─ 触发进化库审核
    │
    ▼
[Lessons 记录]
    ├─ 记录到 tasks/lessons.md
    ├─ 记录经验复用情况
    └─ 记录改进点
```

#### 阶段 5: 进化库审核 + 持续改进

```
经验上传到进化库
    │
    ▼
进化库自动审核
    (safety, effectiveness, reusability, clarity, completeness)
    │
    ▼
{ 需要人工审核? }
    ├─ 是 → 使用 workflow-orchestration 审核代理
    │       ├─ CodeReview-Quality → 对应 clarity/completeness
    │       ├─ CodeReview-Security → 对应 safety
    │       ├─ CodeReview-Performance → 对应 effectiveness
    │       └─ CodeReview-Architecture → 对应 reusability
    └─ 否 → 自动通过
    │
    ▼
审核完成
    │
    ▼
{ 经验被批准? }
    ├─ 是 → 经验加入进化库，可供未来使用
    └─ 否 → 记录反馈，用于改进下次经验
```

### 11.4 整合的优势

| 优势 | 说明 |
|------|------|
| **效率提升** | 经验复用避免重复发明轮子，快速启动 |
| **质量保证** | 双重审核（workflow-orchestration + 进化系统） |
| **知识积累** | 自动记录成功经验，结构化存储 |
| **风险降低** | 使用已验证方法，回滚计划就绪 |
| **持续改进** | 经验不断优化，审核代理越来越聪明 |

### 11.5 详细文档

完整的整合方案、技术实现要点、实际示例请参考：

**[references/evolution-integration.md](references/evolution-integration.md)**

包含：
- 详细的工作流描述
- 决策树整合
- 实际整合示例（bug修复、新功能实现）
- 实施建议（MVP → 深度整合 → 完全整合）
- 技术实现要点
- API 整合点
- 子代理定义

---

## 12. 总结

**workflow-orchestration 与进化系统的结合是非常必要且价值巨大的！**

1. **互补性**: workflow-orchestration 提供纪律性和流程，进化系统提供经验复用和持续学习
2. **增效**: 经验复用提高效率，减少重复工作
3. **提质**: 双重审核确保质量，经验不断优化
4. **闭环**: 执行 → 总结 → 上传 → 复用 → 改进，形成完整闭环

这两个系统的结合将大大提升开发效率和代码质量！
