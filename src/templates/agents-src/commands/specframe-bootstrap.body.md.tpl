# /specframe-bootstrap

Populate the generated docs (ADR, rules, guidelines, runbook, glossary) by analyzing an existing codebase.

## When to use

Run after `specframe init` on a non-empty repository, to derive initial docs from code already in place. Also useful to catch up docs/ after a period of drift.

## What it does

Delegates the scan-and-draft work to the `bootstrapper` agent, which can run isolated from this conversation so the codebase scan doesn't fill its context. The agent decides what to draft from evidence in the code, then hands the actual writing to the `doc-writer` agent, one call per finding.

The canonical scanning/drafting procedure lives in the `bootstrapper` agent definition — do not duplicate it here.

## Steps

1. Invoke the `bootstrapper` agent.
2. Relay its report as-is: counts of ADR/rules/guidelines/runbook/glossary entries drafted, file paths touched, and open TODOs requiring human input.

## Rules

- If the agent reports TODOs, surface them to the user — don't silently resolve them.
