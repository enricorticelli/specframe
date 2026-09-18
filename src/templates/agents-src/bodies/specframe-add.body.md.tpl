# specframe-add-{{addSection}}

Add {{addArticle}} {{addLabel}} to this repository's log. Invoked explicitly
(`/specframe-add-{{addSection}} <what>`) — the section is already decided by the
command you reached for, so this does not ask you which one you meant.

{{cliFallback}}

## Trigger

Only when the user invokes it. What they pass in is the {{addLabel}} to add.

## Belongs here

{{addBelongs}}

If what the user described is not that, **stop and say so** rather than filing it
under the wrong heading: a document in the wrong section is found by nobody
looking for it. Point at the command that fits — {{addOthers}} — or, if it is a
choice with two or more credible options that is expensive to reverse, at
`specframe-decide` (catalog) or `specframe-record` (project-specific). This
command is not a way around the ADR gate.

## Do

1. **Check it does not already exist.** Read `{{addDir}}/README.md` — both the
   catalog's index and `## Added here` — and any entry that looks close. A
   second copy of the same thing is worse than none: two copies drift, and the
   one nobody reads first goes stale.
2. **Allocate the file through the CLI**, never by hand:

   ```bash
   specframe doc new {{addSection}} <slug> --title "..."
   ```

   It owns the number, writes `{{addDir}}/NNNN-<slug>.md` from the section's own
   template, and adds the index row. Those three by hand, forgetting one, leaves
   the log inconsistent.
3. **Fill in every heading the file carries.** No placeholder comment left
   behind, and nothing invented to fill a section — if you do not know what goes
   in one, ask.
   {{addFill}}
4. **Cite where it comes from.** A `{{addPrefix}}` that exists because of a
   recorded decision carries `Source: ADR-NNNN`. One that exists because of
   something in the code quotes the `path:line` that shows it.
5. Report the id and the path.

## Do not

- Do not write the file yourself, or pick the number. The band the catalog
  reserves is `specframe doc new`'s to hand out.
- Do not edit an entry the catalog generated — anything numbered below the local
  band is tied to a recorded decision. Change the decision, with
  `specframe revise`.
- Do not add a second entry that says what an existing one already says in other
  words. Extend the one that is there.
