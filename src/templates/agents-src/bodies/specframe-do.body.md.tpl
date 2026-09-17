# specframe-do

Carry out an implementation task inside the fence this repository has already
built: the enforced rules, the recorded ADRs, and the decisions still open.
Invoked explicitly (`/specframe-do <task>`) — never auto-triggered. The user
asking for it *is* the decision to work under the constraints.

This is the middle of the loop: `specframe-decide` records what to do before,
`specframe-conform` reviews the diff after. This one executes between them.

## Trigger

Only when the user invokes it. The task is whatever they pass in.

## Do

1. **Load the fence.** Read `docs/rules/README.md` plus every rule with status
   `enforced`, and the ADRs under `docs/adr/` that cover the area the task
   touches. Read them before reading the code, not after writing the diff.
2. **Check what is still open.** Read `docs/DECISIONS.md`. If the task cannot be
   done without answering something listed there as open, **stop before editing
   anything**: name the decision and its reserved ADR number, and hand off to
   `/specframe-decide`. Choosing silently in a diff is the exact failure this
   scaffold exists to prevent. If the answer is only implied — the task still
   works either way — say so and proceed with the option the repository already
   follows.
3. **State the fence, then build.** Before the first edit, list the rules and
   ADRs that actually constrain this change — by id, one line each on what they
   force here. A rule that does not bear on the task does not belong in the
   list. If nothing constrains it, say that too.
4. **Implement.** Follow `docs/guidelines/` by default; when a guideline is
   departed from, say which one and why, in the response, not only in a comment.
5. **Close the loop.** Review the resulting diff against the enforced rules —
   `specframe-conform` covers this — and report violations with the fix before
   handing the work back.

## Do not

- Do not silently answer an open decision. That is step 2, and it is a stop, not a note.
- Do not record an ADR for what you just built. If the task turned out to need
  one, name it and use `specframe-record`; this skill writes code, not `docs/`.
- Do not invent a constraint. Every rule cited must exist under `docs/rules/`
  with status `enforced`; every ADR cited must exist by number.
- Do not treat an `advisory` rule as a blocker — report it, do not enforce it.
- Do not widen the task. The fence constrains how, the user's request sets what.
