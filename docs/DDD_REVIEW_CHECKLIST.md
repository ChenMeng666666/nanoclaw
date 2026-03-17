# DDD Code Review Checklist

- [ ] Context boundary is explicit and unchanged by side effects.
- [ ] Domain layer contains business rules only and has no infrastructure coupling.
- [ ] Application layer orchestrates use cases and depends on domain contracts.
- [ ] Interface layer delegates to application services without domain rule duplication.
- [ ] Infrastructure layer is replaceable through application/domain contracts.
- [ ] Cross-context calls target only `application` layer exports.
- [ ] No new legacy facade entry file is introduced under `src/`.
- [ ] `npm run lint` and `npm run lint:ddd-deps` both pass.
- [ ] Tests are colocated to the nearest context and naming is consistent.
- [ ] Migration plan or architecture docs are updated when constraints evolve.
