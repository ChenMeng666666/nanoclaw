# DDD Context Map

## Bounded Contexts

| Context | Core Responsibility | Upstream Contexts | Downstream Contexts |
| --- | --- | --- | --- |
| runtime | Runtime API orchestration and external control plane | security, evolution, memory, messaging | external runtime clients |
| security | Authentication, throttling, request validation, execution safety | none | runtime, evolution, memory, messaging |
| memory | Memory lifecycle, retrieval, migration, metrics | security | runtime, messaging, evolution |
| evolution | Gene lifecycle, review workflow, governance metrics | security, memory | runtime, messaging |
| messaging | Channel routing, pipeline orchestration, recovery | security, memory | runtime |

## Interaction Rules

- Cross-context access must enter from target context `application` layer.
- `runtime` is orchestration-only and does not own domain rules of other contexts.
- `security` provides shared policy capabilities through application contracts.
- `interfaces` layer exposes adapters, not cross-context business orchestration.
