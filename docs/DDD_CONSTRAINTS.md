# DDD Post-Migration Constraints

## Layer Constraints

- `domain` cannot depend on `application`, `infrastructure`, `interfaces`.
- `application` cannot depend on `interfaces` or `infrastructure`.
- `interfaces` cannot depend on `infrastructure`.

## Cross-Context Constraints

- Any context can only call other contexts through `application` layer exports.
- Direct imports to other contexts `domain`, `interfaces`, `infrastructure` are prohibited.

## Entry Constraints

- Legacy one-line facade entry files are removed after import convergence.
- New module entry points must live in `src/contexts/<context>/index.ts` or layer `index.ts`.

## Test Layout Constraints

- Runtime and context contract tests should be colocated under corresponding context folders.
- New tests must follow `<feature>.test.ts` naming with context-prefixed describe titles.

## Governance Constraints

- Every new context module must include domain, application, interfaces, infrastructure layering rationale.
- Pull requests touching `src/contexts/**` must complete DDD review checklist.
