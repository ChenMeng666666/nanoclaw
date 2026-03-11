# Lessons Format 2.0

Enhanced template and examples for capturing learnings in `tasks/lessons.md`.

## Template

```markdown
# Lessons Learned

## [Date] - [Category]

**Mistake**: What went wrong
**Pattern**: The underlying cause or anti-pattern
**Impact**: What the actual impact was (downtime, user impact, etc.)
**Rule**: Concrete rule to prevent recurrence
**Applied**: Where this rule applies (specific files, patterns, situations)
**Prevention**: Specific steps to catch this before deployment
**Share with**: Which review agents should learn from this
```

## Categories (Enhanced)

Use these categories to organize lessons:

- **Architecture** - System design decisions
- **Testing** - Test coverage, edge cases, test gaps
- **Performance** - Speed, memory, efficiency
- **Security** - Vulnerabilities, auth issues, best practices
- **API** - Interface design, contracts, backward compatibility
- **Tooling** - Build, deploy, CI/CD
- **Communication** - Misunderstandings, unclear specs
- **Risk** - Risk assessment, mitigation, rollback
- **Deployment** - Rollout, monitoring, troubleshooting
- **Documentation** - Documentation gaps, clarity issues

## Example Lessons 2.0

```markdown
# Lessons Learned

## 2024-01-10 - Testing/Risk

**Mistake**: Deployed code that broke production because mocks hid the real API behavior
**Pattern**: Over-mocking in tests created false confidence, no integration tests
**Impact**: 15 minutes of downtime for API endpoints
**Rule**: Always include at least one integration test that hits real services
**Applied**: All API endpoints, external service integrations
**Prevention**: Add integration test requirement to risk assessment checklist
**Share with**: CodeReview-Quality, Test, Risk

---

## 2024-01-12 - Architecture/Deployment

**Mistake**: Added a feature flag that was never cleaned up, causing confusion 6 months later
**Pattern**: Technical debt accumulation through "temporary" solutions
**Impact**: Codebase clutter, developer confusion, accidental behavior
**Rule**: Every feature flag must have a removal date in the TODO and a cleanup task
**Applied**: All feature flags, A/B tests, temporary workarounds
**Prevention**: Add flag removal date to code review checklist
**Share with**: CodeReview-Architecture, DocGen

---

## 2024-01-15 - Performance/Risk

**Mistake**: N+1 query pattern caused 500ms page load
**Pattern**: Lazy loading in loops without considering query count
**Impact**: Slow page load, poor user experience, database load
**Rule**: Before any loop that touches the database, check if batch loading is possible
**Applied**: All ORM queries in loops, GraphQL resolvers
**Prevention**: Add N+1 query check to performance benchmarking checklist
**Share with**: CodeReview-Performance, Benchmark

---

## 2024-01-18 - Communication/Risk

**Mistake**: Built the wrong feature because requirements were ambiguous
**Pattern**: Assumed instead of asking for clarification
**Impact**: Wasted 3 days of development, rework needed
**Rule**: If a requirement has multiple interpretations, ask before implementing
**Applied**: All feature specs, bug reports with unclear reproduction steps
**Prevention**: Add requirement clarification step to planning phase
**Share with**: Plan, Risk

---

## 2024-01-20 - Security/Deployment

**Mistake**: Rolled out a security fix without proper rollback plan, caused login failures
**Pattern**: Security changes made without testing rollback procedure
**Impact**: 8 minutes of login failures for 20% of users
**Rule**: Every security-related change must have a tested rollback plan
**Applied**: All security patches, authentication changes, authorization changes
**Prevention**: Add rollback test requirement to security code review checklist
**Share with**: CodeReview-Security, Risk

---

## 2024-01-22 - Performance/Deployment

**Mistake**: Rolled out performance optimization without benchmarks, caused regressions
**Pattern**: "Optimization" made without measuring before and after
**Impact**: 15% increase in API latency
**Rule**: All performance-related changes must have before/after benchmarks
**Applied**: All algorithm changes, database query changes, cache changes
**Prevention**: Add benchmark requirement to performance code review checklist
**Share with**: CodeReview-Performance, Benchmark

---

## 2024-01-25 - API/Documentation

**Mistake**: Changed API without updating documentation, caused integration failures
**Pattern**: API changes made without corresponding documentation updates
**Impact**: Third-party integration failures for 2 days
**Rule**: Every API change requires corresponding documentation update
**Applied**: All API changes, breaking or non-breaking
**Prevention**: Add documentation update to API code review checklist
**Share with**: CodeReview-Architecture, DocGen

---

## 2024-01-28 - Deployment/Rollback

**Mistake**: No monitoring during deployment, didn't notice issues for 45 minutes
**Pattern**: Rolled out change without monitoring or alerting setup
**Impact**: 45 minutes of degraded performance before detection
**Rule**: Every deployment must have monitoring/alerting in place before rollout
**Applied**: All deployments, especially high-risk changes
**Prevention**: Add monitoring setup to risk assessment checklist
**Share with**: Risk, Verify

---

## 2024-01-30 - Testing/Risk

**Mistake**: Deployed database migration without testing rollback, data corruption occurred
**Pattern**: Migration rollback never tested in staging
**Impact**: 1 hour of downtime, data recovery needed from backup
**Rule**: Every database migration must have rollback tested in staging 3 times
**Applied**: All database schema changes, data migrations
**Prevention**: Add rollback test requirement to database task checklist
**Share with**: Risk, Verify, CodeReview-Security
```

## Best Practices (Enhanced)

1. **Write immediately** - Capture lessons right after the correction, not later
2. **Be specific** - Vague lessons don't prevent mistakes
3. **Include context** - Future you needs to understand why this matters
4. **Make rules actionable** - "Be more careful" is not a rule
5. **Review regularly** - Scan lessons at session start for relevant projects
6. **Quantify impact** - Document what actually happened (downtime minutes, user count)
7. **Define prevention** - Specific checks to catch this before deployment
8. **Share with agents** - Identify which review agents should learn from this
9. **Link to tasks** - Reference the task where this mistake occurred
10. **Track recurrence** - Note if this pattern repeats

## Lesson Quality Scorecard

Use this to evaluate if a lesson is high quality:

- [ ] **Specific**: Mistake is described with concrete details
- [ ] **Root Cause**: Pattern identifies the underlying cause, not just symptom
- [ ] **Impact**: Actual impact documented with quantifiable data
- [ ] **Actionable**: Rule is specific and testable
- [ ] **Preventive**: Includes steps to catch this before deployment
- [ ] **Shared**: Identifies which review agents should learn
- [ ] **Applied**: Lists specific places where this rule applies

Score: [0-7] - Score 5+ is good, 7+ is excellent!
