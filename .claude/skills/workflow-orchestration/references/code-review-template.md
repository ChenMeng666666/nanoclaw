# Multi-Agent Code Review Template

Standard template for multi-agent code review results.

## Review Summary

**Change**: [Brief description of what changed]
**Files**: [List of modified files]
**Review Date**: [Date]

## Review Agents

- [x] Explore - Codebase pattern analysis
- [x] CodeReview-Quality - Code quality and readability
- [x] CodeReview-Security - Security vulnerability check
- [x] CodeReview-Performance - Performance impact assessment
- [x] CodeReview-Architecture - Architecture and design review

---

## Agent Reviews

### Explore Agent - Pattern Analysis

**Existing Patterns Found**:
- [Pattern 1]
- [Pattern 2]

**Similar Implementations**:
- [File/Pattern 1]
- [File/Pattern 2]

**Potential Anti-Patterns**:
- [Anti-pattern 1]
- [Anti-pattern 2]

**Recommendations**:
- [Recommendation 1]
- [Recommendation 2]

---

### CodeReview-Quality - Quality Assessment

**Score**: [0-10]

**Checklist**:
- [x] Follows existing code patterns
- [ ] Readable and maintainable
- [x] No unnecessary complexity
- [ ] Proper error handling
- [x] Clear comments where needed
- [x] Consistent naming conventions

**Issues Found**:
1. **[Severity: Critical/High/Medium/Low]**: [Description]
   - Location: [File:Line]
   - Suggestion: [Fix suggestion]

2. **[Severity: Critical/High/Medium/Low]**: [Description]
   - Location: [File:Line]
   - Suggestion: [Fix suggestion]

**Positive Notes**:
- [Positive note 1]
- [Positive note 2]

---

### CodeReview-Security - Security Assessment

**Score**: [0-10]

**Checklist**:
- [x] No injection vulnerabilities
- [ ] Proper input validation
- [x] No hardcoded secrets
- [ ] Secure authentication/authorization
- [x] No unsafe file operations
- [x] Secure IPC handling

**Security Issues Found**:
1. **[Severity: Critical/High/Medium/Low]**: [Description]
   - Location: [File:Line]
   - Risk: [Risk explanation]
   - Mitigation: [Mitigation suggestion]

**Security Best Practices**:
- [Best practice 1]
- [Best practice 2]

---

### CodeReview-Performance - Performance Assessment

**Score**: [0-10]

**Checklist**:
- [x] No N+1 query patterns
- [ ] Efficient algorithms
- [x] Minimal memory usage
- [ ] No unnecessary computations
- [x] Cache where appropriate

**Performance Findings**:
1. **[Impact: High/Medium/Low]**: [Description]
   - Location: [File:Line]
   - Impact: [Performance impact explanation]
   - Optimization: [Optimization suggestion]

**Performance Metrics**:
- Before: [Metrics]
- After: [Metrics] (if available)

---

### CodeReview-Architecture - Architecture Assessment

**Score**: [0-10]

**Checklist**:
- [x] Single Responsibility Principle
- [ ] Proper separation of concerns
- [x] No tight coupling
- [ ] Extensible design
- [x] Consistent with existing architecture

**Architecture Findings**:
1. **[Issue]**: [Description]
   - Location: [File/Module]
   - Suggestion: [Architecture improvement]

**Architecture Alignment**:
- [x] Aligns with existing patterns
- [ ] Introduces new patterns (documented)
- [ ] Requires architecture update

---

## Synthesized Results

### Priority Issues

**Critical (Must Fix)**:
1. [Issue 1]
2. [Issue 2]

**High (Should Fix)**:
1. [Issue 1]
2. [Issue 2]

**Medium (Could Fix)**:
1. [Issue 1]
2. [Issue 2]

### Overall Assessment

**Recommendation**: [Approve / Conditionally Approve / Request Changes]

**Summary**:
[Brief summary of overall review]

**Rationale**:
[Explanation of recommendation]

### Action Items

- [ ] Fix critical issues
- [ ] Address high priority issues
- [ ] Optional: Improve medium priority issues
- [ ] Re-run automated checks
- [ ] Final verification
