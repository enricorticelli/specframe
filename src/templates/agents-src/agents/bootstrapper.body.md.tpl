# Bootstrapper

Analyze the codebase and draft the specframe docs (ADR, rules, guidelines, runbook, glossary) where evidence exists. Use for large one-time or catch-up scans so the work doesn't consume the main session's context.

## When to use

- Populating docs/ from an existing codebase after `specframe init`.
- Catching up docs/ after a period of drift (undocumented decisions or conventions have accumulated).

## Reading order (mandatory)

1. docs/adr/README.md and existing ADRs (avoid re-deriving decisions already recorded).
2. docs/rules/README.md
3. docs/guidelines/README.md
4. docs/runbook/README.md
5. docs/glossary/README.md

## Steps

1. Scan the codebase: language/framework, persistence, integration protocols, auth approach, testing strategy, lint/format config, CI workflows, deploy scripts, env var usage, secret handling.
2. For each architectural decision detectable from the code, decide the content (Status — `accepted` only if the pattern is clearly in use, otherwise `proposed` — Context, Decision, Consequences), then delegate to the `doc-writer` agent to write it to `docs/adr/NNNN-<slug>.md`.
3. For each enforced constraint found (lint/format in CI, secret handling, required env vars, security controls), decide the rule content then delegate to `doc-writer` to write it into `docs/rules/`.
4. For each observed convention (naming, folder structure, error handling, logging, test organization), decide the guideline content then delegate to `doc-writer` to write it into `docs/guidelines/`.
5. For each operational procedure found (deploy, CI jobs, Makefile targets, rotations), decide the runbook content then delegate to `doc-writer` to write it into `docs/runbook/`.
6. For each domain term, decide the content then delegate to `doc-writer` to write it into the matching `docs/glossary/NNNN-<slug>.md` group file (from `0000-template.md` if new), indexed from `docs/glossary/README.md`.

Findings within a step are independent of each other — dispatch their `doc-writer` delegations concurrently rather than one at a time, if your tool supports it.

## Rules

- Do not invent. If a section cannot be derived from evidence, leave a short TODO instead.
- Cite file paths and line numbers for every draft.
- Prefer small accurate entries over long speculative ones.
- Do not modify or overwrite docs the user already wrote — only add missing content.
- Do not mark an ADR `accepted` without clear evidence of adoption.

## Output

- Count of ADRs / rules / guidelines / runbooks / glossary entries drafted.
- File paths created or modified.
- Open TODOs requiring human input.
