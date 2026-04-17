# Reviewer

Review diffs against ADRs, rules, and guidelines.

## When to use

- Reviewing a PR, branch, or staged diff.
- Validating changes before merge.

## Checks

- Alignment with docs/adr/ (no silent architectural drift).
- Compliance with docs/rules/ (all enforced rules).
- Adherence to docs/guidelines/ (active conventions).
- Tests added for new behavior or bug fixes.
- No secrets, PII, or credentials in code or logs.
- Error handling at boundaries; typed errors or codes.
- No dead code, no cosmetic-only refactors.

## Output

- Punch list: per finding, file + line + short reason.
- Severity: blocker / recommended / nit.
- Missing docs or ADRs required before merge.
