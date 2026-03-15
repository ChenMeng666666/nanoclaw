# Diagnostics Remediation Plan

This plan addresses the build errors and diagnostics identified in the codebase, specifically focusing on type mismatches, broken imports, and configuration issues.

> **Note**: The core `src/` directory passes `tsc` compilation. The reported diagnostics primarily stem from:
> 1. Files excluded from `tsconfig.json` (e.g., `scripts/`).
> 2. Skill templates in `.claude/skills/` that are not meant to be compiled in-place.
> 3. Stale or deleted files (`learning-legacy-handlers.ts`) lingering in the editor.

## Phase 1: Core Type System & Memory Infrastructure [P0]
**Goal**: Resolve critical type errors in the memory subsystem that block proper compilation and runtime stability.

- [x] **Fix `Memory` Type Definition**: Update `src/types/agent-memory.ts` to ensure `accessCount` and `lastAccessedAt` are correctly defined (optional vs required) to match usage in `memory-manager.ts` and `l1-cache-manager.ts`.
- [x] **Fix `memory-manager.ts` Module Resolution**: Investigate and fix the `Cannot find module './types.js'` error in `src/memory-manager.ts`. This is likely due to a circular dependency or tsconfig inclusion issue.
- [x] **Align Cache Manager Signatures**: Ensure `L1CacheManager.updateCacheEntry` accepts the `Memory` object shape being passed from `MemoryManager`, specifically handling the `Omit` and spread patterns correctly.

## Phase 2: Runtime API & Legacy Code Cleanup [P1]
**Goal**: Remove references to deleted files and ensure the Runtime API is clean.

- [ ] **Verify Removal of Legacy Handlers**: Confirm that `src/interfaces/http/handlers/learning-legacy-handlers.ts` is truly deleted and removed from all import paths (e.g., in `runtime-api-router.ts` or `index.ts`).
- [ ] **Fix Reflection Scheduler Imports**: Locate where `reflection-scheduler.ts` is being imported and ensure the path is correct (it moved to `src/application/scheduling/reflection-scheduler.ts`).

## Phase 3: Scripts & Skills Configuration [P2]
**Goal**: Ensure maintenance scripts and skill templates are correctly typed and linted without false positives.

- [ ] **Fix Scripts TS Config**: Create a `tsconfig.json` for `scripts/` or update the root config to include `scripts/validate-all-skills.ts` so that `../skills-engine/types.js` imports resolve correctly in the IDE.
- [ ] **Exclude Skill Templates from Linting**: Add `.claude/skills` and `.trae/skills` to `.eslintignore` (or `tsconfig.json` exclude) to prevent linter errors from skill template files that are not yet applied to the project.

## Phase 4: Skill Template Validation [P3]
**Goal**: Ensure skill templates are valid TypeScript even in isolation (optional but recommended).

- [ ] **Validate `add-discord` Template**: Check if `skills/add-discord/add/src/channels/discord.ts` has valid relative imports for its *target* location, or if it needs to be updated to match the new project structure (e.g., `src/config.ts` vs `../config.js`).
