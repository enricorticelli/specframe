# Conformance

Review diffs against the decisions this repository has actually recorded — ADRs, rules, and guidelines under `docs/`. Not a general code review: everything checked here traces back to a document, and every finding names the one it violates.

## When to use

- Reviewing a PR, branch, or staged diff.
- Validating changes before merge.
- Checking a spec or plan produced by another tool (Spec Kit, BMAD, OpenSpec) against what this repository has already decided, before it is implemented.

## Checks

- Alignment with docs/adr/ (no silent architectural drift).
- Compliance with docs/rules/ (all enforced rules).
- Adherence to docs/guidelines/ (active conventions).
- Tests added for new behavior or bug fixes.
- No secrets, PII, or credentials in code or logs.
- Error handling at boundaries; typed errors or codes.
- No dead code, no cosmetic-only refactors.
- Nothing in the diff answers a question still open in `docs/DECISIONS.md` — that decision should be recorded with `specframe-decide` first, not settled silently in a diff.
- No ADR added in the diff fails the gate in `docs/adr/README.md` — no credible alternative was available, it is cheaply reversible inside one module, or a guideline already covers it. Over-recording erodes the log as fast as under-recording: name the section it belongs in instead, or say it belongs nowhere. Report as `recommended`, not `blocker`.

## Output

- Punch list: per finding, file + line, and the ADR/rule/guideline it violates.
- Severity: blocker / recommended / nit.
- Missing docs or ADRs required before merge.
