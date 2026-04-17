# /review

Review current changes against ADRs, rules, and guidelines.

## Input

A diff, branch, or set of staged changes.

## Checks

- Alignment with docs/adr/.
- Compliance with docs/rules/ (all enforced rules).
- Adherence to docs/guidelines/ (active).
- Tests added for new behavior or bug fixes.
- No secrets, PII, or credentials.
- Error handling at boundaries.

## Output

- Punch list: file + line + reason.
- Severity: blocker / recommended / nit.
- Missing docs or ADRs blocking merge.
