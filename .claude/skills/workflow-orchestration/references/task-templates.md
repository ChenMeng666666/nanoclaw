# Task Templates 3.0

Ready-to-use templates for task management files with risk assessment and rollback planning.

## tasks/todo.md (Enhanced)

```markdown
# Task: [Title]

## Risk Assessment
- **Level**: [Low/Medium/High/Critical]
- **Description**: [Brief risk summary]
- **Impact**: [Potential impact if fails]
- **Mitigation**: [How to reduce risk]
- **Rollback Plan**: [Step-by-step rollback procedure]

## Plan
- [ ] Step 1: [Description]
- [ ] Step 2: [Description]
- [ ] Step 3: [Description]
- [ ] Verification: [How to prove it works]
- [ ] **Code Review**: [Quality, Security, Performance, Architecture]
- [ ] **Benchmark**: [If performance sensitive]
- [ ] **Documentation**: [API docs, usage examples, migration guide]
- [ ] **Rollback**: [Test rollback procedure]

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

## Benchmark Results
**Baseline**: [Before change metrics]
**After**: [After change metrics]
**Impact**: [Positive/Neutral/Negative, X% improvement/regression]

## Review
<!-- Summary when complete: what changed, what was learned -->

## Lessons Learned
<!-- Capture any mistakes or improvements -->
```

## Example: Feature Implementation with High Risk

```markdown
# Task: Add payment system integration

## Risk Assessment
- **Level**: High
- **Description**: Integrates external payment processor, could cause financial impact
- **Impact**: Payment failures, data loss, security breach
- **Mitigation**:
  - Test in staging environment
  - Implement proper error handling
  - Add transaction logging
- **Rollback Plan**:
  1. Disable new payment system flag
  2. Revert to old payment processor
  3. Verify transactions continue working

## Plan
- [ ] Research existing payment patterns (Explore agent)
- [ ] Design integration architecture (Plan agent)
- [ ] Implement payment API wrapper
- [ ] Add error handling and logging
- [ ] Write integration tests
- [ ] Test in staging environment
- [ ] Verification: Manual payment test + integration tests pass
- **Code Review**: Quality, Security, Performance, Architecture
- **Benchmark**: Check API latency and throughput
- **Documentation**: API docs, integration guide, migration steps
- **Rollback**: Test rollback procedure

## Progress Notes
2024-01-15 10:00 - Explore subagent completed, found existing patterns
2024-01-15 11:30 - Architecture design reviewed, approved
2024-01-15 14:00 - Implementation complete, integration tests pass
2024-01-15 15:00 - Staging test completed, payment successful
2024-01-15 16:00 - Rollback procedure tested, working

## Code Review Summary
**Agents Used**: Quality, Security, Performance, Architecture
**Overall Score**: 8/10
**Critical Issues**: None
**High Priority**: Add rate limiting
**Medium Priority**: Improve error message clarity

## Benchmark Results
**Baseline**: Staging payment latency average 200ms
**After**: Payment latency average 180ms (10% improvement)
**Impact**: Positive, minor improvement

## Review
Payment system integration completed successfully. All tests passed.
Code review found and fixed potential security vulnerability with input validation.
Rollback procedure tested and works within 2 minutes.
Ready for progressive rollout.
```

## Example: Database Migration with Critical Risk

```markdown
# Task: Migrate user database to new schema

## Risk Assessment
- **Level**: Critical
- **Description**: Direct database schema change, high risk of data loss
- **Impact**: User data corruption, login failures, complete outage
- **Mitigation**:
  - Full database backup before change
  - Test migration on staging database
  - Monitor closely during migration
- **Rollback Plan**:
  1. Stop all writes to affected tables
  2. Restore database from backup
  3. Replay transaction logs from backup time to migration start
  4. Verify data consistency

## Plan
- [ ] Take production database backup (verified)
- [ ] Test migration on staging database (3 times)
- [ ] Implement migration script with error handling
- [ ] Add monitoring/alerting for migration progress
- [ ] Coordinate deployment with operations team
- [ ] Execute migration during maintenance window
- [ ] Verification: All data migrated, queries working
- **Code Review**: Quality, Security, Performance, Architecture
- **Documentation**: Migration guide, schema changes, troubleshooting

## Progress Notes
2024-01-18 09:00 - Production backup completed
2024-01-18 10:00 - Staging migration test 1 passed
2024-01-18 11:30 - Staging migration test 2 passed (rollback tested)
2024-01-18 14:00 - Maintenance window scheduled for 22:00-23:00
2024-01-18 22:00 - Migration executed successfully in 32 minutes
2024-01-18 22:35 - Verification complete, all data accessible

## Review
Migration executed flawlessly during maintenance window.
All tables and relationships correctly migrated.
Rollback procedure tested and ready if needed.
No data loss, minimal downtime (~30 seconds).
```

## Example: Simple Bug Fix

```markdown
# Task: Fix memory leak in WebSocket handler

## Risk Assessment
- **Level**: Medium
- **Description**: Localized fix, could impact real-time features if fails
- **Impact**: WebSocket connections not closing properly
- **Mitigation**: Test in development environment
- **Rollback Plan**: Revert the commit

## Plan
- [ ] Reproduce the issue locally
- [ ] Identify leak source with profiler
- [ ] Implement fix
- [ ] Verification: Memory stable over 1000 connections
- **Code Review**: Quality only
- **Documentation**: Add comment explaining the fix

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
