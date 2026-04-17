# Rules Index

Non-negotiable constraints for {{projectName}}.

Rules are imperative and short.
For conventions and style use docs/guidelines/.
For architectural decisions use docs/adr/.

## Status rules

Use one of these statuses:
- enforced
- advisory

---

## R-001: No secrets in repo

- Status: enforced

Never commit credentials, tokens, keys, or private material.

**Why:** leaked secrets are costly and often irrecoverable.

**Enforcement:** pre-commit secret scanner + CI gate.

## R-002: Credentials via env vars or secret manager

- Status: enforced

Load credentials from environment variables or a managed secret store. Do not hardcode.

**Why:** decouples deployment from source, enables rotation.

**Enforcement:** code review + manual audit.

## R-003: Input validation at boundaries

- Status: enforced

Validate all external inputs (HTTP, queue, file, CLI) before use.

**Why:** prevents injection, unexpected state, and invariant violations.

**Enforcement:** code review + tests at boundaries.

## R-004: Least privilege for roles and keys

- Status: enforced

Grant the minimum permissions required for each role, key, or token.

**Why:** limits blast radius of compromise.

**Enforcement:** manual audit on grant; review on rotation.

## R-005: Formatter and linter must pass in CI

- Status: enforced

The pipeline fails if format or lint checks do not pass.

**Why:** consistency and early defect detection.

**Enforcement:** CI gate.

## R-006: Every bug fix adds a regression test

- Status: enforced

A fix is incomplete without a test that fails before and passes after.

**Why:** prevents the bug from recurring silently.

**Enforcement:** code review.

## R-007: No credentials or PII in logs

- Status: enforced

Structured logs must not include secrets, tokens, or unnecessary personal data.

**Why:** logs aggregate into long-lived stores with broad access.

**Enforcement:** code review + log scrubbers where available.

## R-008: Timeouts and backoff for external calls

- Status: enforced

Every outbound network call has a timeout. Retries use bounded backoff.

**Why:** prevents cascading hangs and thundering herds.

**Enforcement:** code review.

## Index

<!-- Add further NNNN-slug.md files as rules are extracted. -->
