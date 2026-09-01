# {{projectName}} — decision log

This directory is the source of truth for how {{projectName}} is built and why.
It is written for humans and read by agents: `AGENTS.md` at the repository root
points every AI assistant here before it touches code.

## The five sections

Each section answers exactly one question. Put a document where its question
belongs, not where it feels related.

| Section | Answers | Write here when |
| --- | --- | --- |
| [`adr/`](adr/README.md) | *What did we decide, and why?* | A choice was made between real alternatives, reversing it would be expensive, and the code cannot explain itself. |
| [`rules/`](rules/README.md) | *What is non-negotiable?* | Something must always or never happen, and there is a way to check it. |
| [`guidelines/`](guidelines/README.md) | *How do we usually build this?* | There is a default way to do something, with room for judgement. |
| [`runbook/`](runbook/README.md) | *What do we do when it breaks?* | A procedure has steps, prerequisites, and a way to verify it worked. |
| [`glossary/`](glossary/README.md) | *What do words mean here?* | A term means something specific in this domain, or two terms are being confused. |

[`DECISIONS.md`](DECISIONS.md) tracks the decisions that have **not** been taken
yet — the backlog that feeds `adr/`.

## Rule, guideline, or ADR?

The three are easy to confuse, and putting a document in the wrong one is what
makes a decision log stop being useful.

- If it records a **choice between alternatives**, it is an **ADR**. It has a
  context, the option taken, its consequences, and what was rejected.
- If it is a **constraint with no acceptable exception** and something can check
  it — CI, a linter, review — it is a **rule**.
- If it is **what we do by default**, and a reviewer could reasonably accept a
  deviation, it is a **guideline**.
- If it is **none of the three**, it is code. Write nothing: that is the usual
  outcome of a change, not an omission.

A single decision usually produces all three: the ADR records the choice, and
the rules and guidelines are what that choice implies day to day. When a
document is generated from a decision, it carries a `Source: ADR-NNNN` line
linking back to it.

## How a document gets written

1. **A decision is made.** Check `DECISIONS.md` — it may already be listed there
   with a reserved ADR number.
2. **Record the ADR** in `adr/NNNN-slug.md`, following `adr/0000-template.md`.
   State the alternatives you rejected and why; that is the part nobody can
   reconstruct later.
3. **Derive the constraints.** If the decision forbids something, add a rule. If
   it establishes a default, add a guideline. Link both back to the ADR.
4. **Update the index** in the section's `README.md`.
5. **Tick it off** in `DECISIONS.md`.

## Conventions

- **Filenames** are `NNNN-slug.md`, numbered in steps of 10 so a related
  document can be inserted later without renumbering anything.
- **Numbers are permanent.** They appear in links, in commit messages, and in
  agent output. Never reuse or renumber; supersede instead.
- **Statuses** — ADRs: `proposed` · `accepted` · `superseded` · `deprecated`.
  Rules: `enforced` · `advisory`. Guidelines: `active` · `deprecated`.
- **Superseding** never deletes. Set the old document's status, link the one
  that replaces it, and leave it in place: the history is the point.
- **One concept per document.** A rule covering three things cannot be
  superseded one third at a time.

## Populating this from existing code

If the codebase predates this log, its decisions are already made — they are just
undocumented. Run `/specframe-bootstrap` with an agent that has it installed: it
walks the checklist in [`DECISIONS.md`](DECISIONS.md), looks for evidence of each
decision in the code, and records only what it can prove, with `path:line`
citations.

Decisions it cannot evidence stay open. Decisions the code follows only in places
are recorded *and* flagged as partial — which is usually the most useful thing a
first scan produces: the decision the team believes it has made and hasn't.

ADRs written this way say so. They document what the code does today, and ask you
for the original reason, which is the part the code cannot tell you.
