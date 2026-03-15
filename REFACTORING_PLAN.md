# Refactoring Plan

## Phase 1: Types & Config Splitting
- [x] Split `types.ts` into `src/types/*.ts` modules
- [x] Split `config.ts` into `src/config/*.ts` modules
- [x] Maintain backward compatibility in `types.ts` and `config.ts`
- [x] Verify typecheck and tests pass

## Phase 2: Database Layer Slimming
- [x] Extract repository implementations to `src/infrastructure/persistence/repositories/`
- [x] Create facade pattern for database access
- [x] Reduce `src/db.ts` size to < 400 lines
- [x] Verify database functionality and migrations

## Phase 3: Runtime API Decomposition
- [x] Move handlers to `src/interfaces/http/handlers/`
- [x] Implement proper routing and middleware structure
- [x] Ensure `src/runtime-api.ts` acts as a clean entry point
- [x] Verify API endpoints and rate limiting

## Phase 4: Evolution System Integration
- [x] Integrate `select-gene` endpoint with evolution manager
- [x] Implement parameter validation and safety checks
- [x] Ensure compatibility with existing GDI scoring
- [x] Verify evolution workflows

## Phase 5: Bootstrap & Lifecycle Management
- [x] Refactor `src/index.ts` to delegate initialization to `Bootstrap` class
- [x] Implement `SignalConfigLoader` for external configuration
- [x] Establish clean application lifecycle hooks
- [x] Verify startup and shutdown sequences
