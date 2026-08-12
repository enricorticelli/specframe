# /specframe-review

Review current changes against ADRs, rules, and guidelines.

## Input

A diff, branch, or set of staged changes.

## What it does

Runs the same checklist as the `reviewer` agent, inline in this conversation rather than delegated, so you stay in the loop to follow up on individual findings. The canonical checklist and output format live in the `reviewer` agent definition — do not duplicate them here, follow that definition directly.

If a rule-compliance skill is available, it should auto-trigger before the output is finalized to verify every enforced rule in `docs/rules/`.

## Rules

- Keep this command a thin pointer — if the checklist changes, update the `reviewer` agent definition, not this file.
