# DDD Dependency Graph

## Allowed Direction

`interfaces -> application -> domain`

`infrastructure -> application -> domain`

`cross-context -> target/application`

## Context-Level Graph

```text
security -> (runtime, memory, evolution, messaging)
memory -> (runtime, evolution, messaging)
evolution -> (runtime)
messaging -> (runtime)
runtime -> external clients only
```

## CI Gate

- `npm run lint`: ESLint layered rules.
- `npm run lint:ddd-deps`: static dependency direction check for `src/contexts/**`.
- CI blocks merge when either check fails.
