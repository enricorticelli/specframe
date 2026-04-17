# /specframe-bootstrap

Populate the generated docs (ADR, rules, guidelines, runbook, glossary) by analyzing an existing codebase.

## When to use

Run after `specframe init` on a non-empty repository, to derive initial docs from code already in place.

## Before starting

Read the current scaffolds to see which sections are still empty:

- docs/adr/README.md
- docs/rules/README.md
- docs/guidelines/README.md
- docs/runbook/README.md
- docs/glossary/README.md

## Steps

1. **Scan the codebase** — language, build tool, package manager, test framework, lint/format config, CI workflows, deployment scripts, env var usage, secret handling.

2. **Draft ADRs** for architectural decisions detectable from the code:
   - language/framework, persistence, integration protocols, auth approach, testing strategy.
   - One ADR per decision in `docs/adr/NNNN-<slug>.md`. Use `accepted` only if the pattern is clearly in use; otherwise `proposed`.

3. **Extract rules** from enforced constraints (lint/format in CI, secret handling, required env vars, security controls). Append to `docs/rules/README.md` or create `docs/rules/NNNN-<slug>.md`.

4. **Extract guidelines** from observed conventions (naming, folder structure, error handling, logging, test organization). Append to `docs/guidelines/README.md` or create `docs/guidelines/NNNN-<slug>.md`.

5. **Extract runbooks** from operational scripts (deploy, CI jobs, Makefile targets, rotations). One runbook per procedure in `docs/runbook/NNNN-<slug>.md`.

6. **Extract glossary terms** — core domain entities from models/types, acronyms, business-specific terms. Append to `docs/glossary/README.md`.

## Rules

- Do not invent. If a section cannot be derived from evidence, leave a short TODO.
- Cite file paths and line numbers for every draft.
- Prefer small accurate entries over long speculative ones.
- Do not modify docs the user has already written — only add missing content.

## Output

Summary listing:
- number of ADRs / rules / guidelines / runbooks / glossary entries drafted.
- file paths created or modified.
- open TODOs requiring human input.
