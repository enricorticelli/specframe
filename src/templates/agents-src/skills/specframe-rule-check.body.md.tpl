# specframe-rule-check

Auto-trigger when reviewing a diff, PR, or set of staged changes. Verify compliance with every enforced rule in `docs/rules/`.

## Trigger

Invoke when:
- A diff or PR is under review.
- The user asks whether a change is safe to merge.
- Before a `/specframe-review` output is finalized.

## Do

1. Read `docs/rules/README.md` and every `NNNN-<slug>.md` with status `enforced`.
2. For each enforced rule, check the diff. For every violation report:
   - file and line.
   - rule ID.
   - why it violates.
   - a concrete fix.
3. Output a compact table: `R-NNN | file:line | reason | fix`.

## Do not

- Do not check `advisory` rules unless asked.
- Do not invent rules not present in `docs/rules/`.
