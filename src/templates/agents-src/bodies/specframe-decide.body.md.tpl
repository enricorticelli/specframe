# specframe-decide

Register an architectural decision with an agent in the loop — from the catalog specframe ships, or specific to this project. Available as both a command (`/specframe-decide`) and an auto-triggered skill.

{{cliFallback}}

## Trigger

Invoke when:
- A decision in `docs/DECISIONS.md` is still open and a task depends on it.
- The user asks "should we…" / "which … do we use" about something that outlives this change.
- A spec, plan, or task file from another tool (Spec Kit, BMAD, OpenSpec, or similar) implies an architectural choice that is not yet recorded here. See `docs/INTEROP.md`.

## Do

1. `specframe review --json` — the state of every decision this repository has recorded, left open, or dismissed.
2. Find the decision that applies. If it is not in the output, it is **not a catalog decision** — stop and use `specframe-record` instead; do not continue with this skill. If its `status` is `dismissed`, stop here too: this repository already ruled it out. Report the recorded reason and ask whether it still holds — do not propose an option.
3. `specframe explain <id> --json` — the full brief: the question, why it exists, every option with its statement, consequences and tradeoff, which one is recommended, and what each produces.
4. **Look for evidence in this repository before proposing anything.** Read the code the decision touches. Say which option, if any, the repository already follows — and where it does not, if adoption is partial. This is what a wizard run from a terminal cannot do.
5. Present every option that still applies, each with its tradeoff as it lands on *this* repository — not only the recommended one. The recommendation is a good default, not an answer chosen for the user.
6. Once the user picks: `specframe decide --set <id>=<value>`. Preview first with `--dry-run --json` if the user wants to see the plan before it writes anything.
7. Report back: which documents were produced (ADR, rules, guidelines, runbooks, glossary terms), and which other decisions became open or retired as a result.

## Do not

- Do not write `specs/`, `plans/`, `prd/`, or any per-feature document. This skill produces one thing: a recorded decision.
- Do not write the ADR file yourself. `specframe decide` is the only thing that writes it — it owns numbering and cross-linking.
- Do not decide for the user. Show the alternatives; let them choose.
- Do not mark a decision `--detected` unless it is genuinely already implemented — that flag changes what the ADR claims about itself.
- Do not invent a decision id. If it is not in `specframe review --json`, it belongs to `specframe-record`, not here.
- Do not run `specframe dismiss`. A dismissal is a human judgement about this repository's shape — propose it, with the reason you would give, and let the user run it themselves.
