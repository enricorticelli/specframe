# specframe-doc

Add a rule, guideline, runbook or glossary group to this repository's log.
Invoked explicitly (`/specframe-doc <what>`) — the counterpart to
`specframe-doc-sync`, which notices the same gaps on its own. Use this one when
you already know what you want written.

{{cliFallback}}

## Trigger

Only when the user invokes it. What they pass in is the document to add.

## Do

1. **Pick the section, and be able to defend it.** Read `docs/README.md` if the
   choice is not obvious.
   - non-negotiable constraint, with something that checks it → `rule`
   - default way of building, departures allowed with a reason → `guideline`
   - what to do when something breaks → `runbook`
   - what a word means in this domain → `glossary`
   - a choice with two or more credible options that is expensive to reverse →
     none of these. It is an ADR: stop and use `specframe-decide` (catalog) or
     `specframe-record` (project-specific).
2. **Check it does not already exist.** Read that section's `README.md` index —
   both the catalog's entries and `## Added here` — and the entries that look
   close. A second copy of a rule is worse than no rule: they drift, and the one
   nobody reads first is the one that goes stale.
3. **Allocate the file through the CLI**, never by hand:

   ```bash
   specframe doc new <rule|guideline|runbook|glossary> <slug> --title "..."
   ```

   It owns the number, writes the file from that section's template, and adds
   the index row. Doing those three by hand and forgetting one leaves the log
   inconsistent.
4. **Fill it in.** Every heading the file carries, no placeholder comments left
   behind. For a rule, `Enforcement` names what checks it — if the honest answer
   is "nothing", set `Status: advisory` rather than claiming enforcement that
   does not exist.
5. **Cite the source.** If the document exists because of a recorded decision,
   set its `Source: ADR-NNNN`. If it exists because of something in the code,
   quote the `path:line` in the body.
6. Report what was written, and its id.

## Do not

- Do not write the file yourself. `specframe doc new` allocates the number; a
  number chosen by hand collides with what the catalog reserves.
- Do not add a rule that restates a guideline more loudly. If a reviewer could
  reasonably wave a violation through, it is a guideline.
- Do not record an architectural decision here. That is `specframe-decide` or
  `specframe-record`, and this command is not a way around the ADR gate.
- Do not edit an entry the catalog generated (below the local band) to mean
  something else — it is tied to a recorded decision. Revise the decision.
