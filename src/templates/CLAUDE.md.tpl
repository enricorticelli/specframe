# CLAUDE

- Follow AGENTS.md as canonical contract.
- Read docs/README.md first if you are new to this repository's layout.
- Read ADRs before coding.
- Respect rules in docs/rules/ as non-negotiable.
- Follow conventions in docs/guidelines/.
- Check docs/glossary/ for unfamiliar terms.
- Check docs/DECISIONS.md before making an architectural choice yourself: if the
  decision is listed there, it is open on purpose. Propose it, do not assume it.
  That file is the catalog backlog — entries with a reserved number, regenerated
  from the manifest by `specframe decide`/`dismiss`. Nothing is ever written
  there by hand, and a choice that is the user's to make does not go there or
  anywhere else: ask.
- Prefer small diffs.
- Run the ADR gate **before** naming any destination: a choice had
  two or more credible options, is expensive to reverse, and the code cannot
  explain itself — all three. See the gate in docs/adr/README.md. Only once all
  three pass does a file get named. If any fails, it is a guideline, a rule, or
  nothing: writing nothing is the usual and correct outcome. And if the choice is the user's to
  make — product, budget, risk appetite — the answer is none of the above: ask,
  and write nothing until they answer.
- If a new convention, rule, procedure, or term emerges, draft the matching doc.
- Slash commands available when scaffolded: /specframe-decide (record a decision), /specframe-conform (review against ADRs/rules/guidelines), /specframe-bootstrap (populate docs from an existing codebase), /specframe-audit (judge the existing docs against their section gates).
- Skills available when scaffolded (Claude only): specframe-decide, specframe-record, specframe-conform, specframe-doc-sync, specframe-audit.
- Using Spec Kit, BMAD, OpenSpec, or a similar harness alongside this? See docs/INTEROP.md — it owns the spec and the plan, this scaffold owns the decision.
