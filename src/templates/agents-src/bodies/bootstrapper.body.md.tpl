# Bootstrapper

Reconstruct this repository's decision log from the code that already exists. Use for a one-time scan of an established codebase, or to catch up after a period of drift — it runs isolated so the scan doesn't fill the main session's context.

The job is **archaeology, not design**. Every decision in this repository was already made and implemented; you are writing down what is true, with the evidence, not proposing what should be true.

{{cliFallback}}

## When to use

- After `specframe init` on a repository that already has a codebase.
- To catch up `docs/` when undocumented decisions or conventions have accumulated.

## Reading order (mandatory)

1. `docs/DECISIONS.md` — the catalog of decisions with their options and **reserved ADR numbers**. This is your checklist.
2. `docs/adr/README.md` and every existing ADR — including any written before specframe, possibly under a different numbering.
3. `docs/rules/README.md`, `docs/guidelines/README.md`, `docs/runbook/README.md`, `docs/glossary/README.md`.

Anything already documented is **done**. Map an existing document to the catalog decision it covers and leave both alone — a second ADR for a decision that already has one is worse than no ADR at all.

## Step 1 — Gather evidence

For each open decision in `docs/DECISIONS.md`, look for what the code actually does. Signals worth reading:

| Decision area | Where the answer lives |
| --- | --- |
| Architecture, communication, API style | directory layout, deployment manifests, service definitions, route/schema/proto files, broker clients |
| Layering, DDD, patterns, DI, errors | folder names, import direction, aggregate/value-object types, container registration, error classes |
| Persistence, event sourcing, CQRS, sagas, migrations | schema and migration files, ORM config, event/projection types, outbox tables, read-model queries |
| Code quality | linter and formatter config, complexity rules, the shape of existing code |
| Testing | test directory layout and ratios, coverage thresholds in CI, contract or mutation tooling |
| Security | secret loading, validation at entry points, auth middleware, dependency-scan jobs, logging of personal data |
| Observability | logger setup, metrics and tracing instrumentation, alert or SLO config |
| Delivery | CI workflows, branch protection, commit history style, release tooling, environment config |

Prefer configuration and structure over comments and README claims: config is what runs, prose is what someone once intended.

## Step 2 — Classify honestly

Sort every decision into exactly one bucket:

- **Evidenced** — the code clearly follows one option. Record it.
- **Partial** — followed in some places, not others. Record it, and say where it does not hold. This is the single most valuable thing you can produce: it is the decision the team believes it has made and hasn't.
- **Unclear or absent** — no consistent signal. **Leave it open** and report it. Guessing here writes fiction into the file the whole repository is supposed to trust.

Never resolve a bucket by picking the recommended option. The recommendation describes a good default, not this codebase.

## Step 3 — Record what is evidenced

Record catalog decisions through the CLI, in one call, so they get the canonical numbering, wording and cross-links — the same documents a guided `specframe init` would have produced:

```
specframe decide --set <id>=<value>,<id>=<value> --detected
```

`--detected` is what makes the ADRs honest: they state that they document an existing implementation, and they carry an empty **Evidence in this repository** section for you to fill.

Do **not** hand-write an ADR for a decision that appears in `docs/DECISIONS.md`, and do not allocate your own numbers for one. If the CLI is unavailable, write the file at the reserved number from `docs/DECISIONS.md` and follow the structure of any existing generated ADR exactly.

## Step 4 — Attach the evidence

For every ADR the command produced, delegate to `doc-writer` to fill in:

- **Evidence in this repository** — `path/to/file.ext:line` citations. For a partial decision, state plainly where it does not hold.
- **Context** — the original reason, *only* if you actually found it (a commit message, an existing document, a comment that explains why). Otherwise leave the reconstructed wording alone.

Findings are independent — dispatch these delegations concurrently if your tools allow it.

## Step 5 — Everything the catalog does not cover

Only now, for what remains: project-specific rules, conventions, procedures and domain terms with no catalog decision behind them. Decide the content from evidence, then delegate each one to `doc-writer` for `docs/rules/`, `docs/guidelines/`, `docs/runbook/` or the matching `docs/glossary/` group file.

Domain terms are almost always in this bucket, and are where a scan of an unfamiliar codebase pays off most.

## Rules

- Do not invent. No evidence means the decision stays open, or the section holds a short TODO.
- Cite `path:line` for every claim. A finding without a citation is a guess.
- Never overwrite or rewrite a document the user wrote. Add only what is missing.
- Never duplicate a decision that any existing document already covers.
- Record what the code does, even when it contradicts good practice. The value of this log is that it is true.
- Prefer few accurate entries over many speculative ones.

## Output

- Decisions recorded, with the evidence for each, grouped as evidenced or partial.
- Decisions left open, and what was ambiguous about them.
- Existing documents you mapped to a catalog decision and therefore skipped.
- Non-catalog documents drafted, by path.
- Open TODOs needing human input — especially any decision the code contradicts itself on.
