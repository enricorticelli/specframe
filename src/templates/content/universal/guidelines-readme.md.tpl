# Guidelines Index

Conventions for style, naming, and non-architectural patterns in {{projectName}}.

Guidelines prescribe how to write code. They evolve.
For non-negotiable constraints use docs/rules/.
For architectural decisions use docs/adr/.

## Status rules

Use one of these statuses:
- active
- deprecated

---

## G-001: Naming conventions

- Status: active

Names must be explicit, pronounceable, searchable. Functions: verb + object. Classes/modules: nouns. Booleans: `is/has/can/should`.

## G-002: Small functions, single purpose

- Status: active

A function does one thing. Keep parameters few. Avoid boolean flags that change behavior.

## G-003: Comments explain why, not what

- Status: active

Prefer self-explanatory code. Comment non-obvious intent or constraints. Keep comments accurate or delete them.

## G-004: Reduce nesting, watch complexity

- Status: active

Use early returns and guard clauses. Refactor when cyclomatic complexity grows.

## G-005: SOLID principles applied

- Status: active

One module, one reason to change (SRP). Extend without modifying (OCP). Subtypes honor contracts (LSP). Small, client-tailored interfaces (ISP). Depend on abstractions (DIP).

## G-006: Layering

- Status: active

Separate domain, application, infrastructure, interface. The domain must not depend on frameworks or IO. IO lives at the edges.

## G-007: Design patterns as shared vocabulary

- Status: active

Use patterns when they clarify intent. Avoid pattern-first design. Common choices: Strategy, Adapter, Facade, Repository, State.

Anti-patterns to avoid: God Object, Singleton as global state, over-engineering.

## G-008: Error handling

- Status: active

Typed errors or consistent error codes. Validate at boundaries. Helpful messages without leaking sensitive info. No silent catch-all.

## G-009: Logging

- Status: active

Structured logs with stable keys (`request_id`, `user_id`, `correlation_id`). Consistent levels: debug/info/warn/error. Add metrics on critical paths.

## G-010: Testing

- Status: active

Pyramid: many unit, some integration, few E2E. Tests are deterministic and independent. Mock only what is external or unstable.

## G-011: Performance

- Status: active

Measure before optimizing. Avoid N+1, unnecessary queries, excessive allocations in hot loops. Cache only with a clear invalidation strategy.

## G-012: Git and PRs

- Status: active

Small descriptive commits (Conventional Commits). PRs state problem, approach, trade-offs, how to test. Avoid mega-PRs.

Review checklist: readability, complexity, tests, error handling, security, migrations, docs.

## G-013: AI agents modifying this repo

- Status: active

Prefer minimal targeted changes. Match existing style and conventions. Do not add libraries without justification. No cosmetic refactors unless requested.

Before changing code: identify the correct extension point, find related tests, respect architectural boundaries.

## G-014: Final quality bar

- Status: active

Code is ready when: build passes, relevant tests green, lint/format pass, edge cases handled, no secrets exposed, docs updated if needed.

## Index

<!-- Add further NNNN-slug.md files as guidelines are extracted. -->
