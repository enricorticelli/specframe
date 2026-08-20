# Decisions

The decision backlog for {{projectName}}. Everything below comes from the
specframe catalog: each entry is a choice this repository will eventually make,
whether or not it has been made yet.

An open decision is not a defect. It is a decision that has not been forced yet
— but it is one an agent will otherwise make silently, on your behalf, the first
time it writes code that depends on it.

**To record one:** run `specframe decide`, or write the ADR by hand using
`adr/0000-template.md` and the reserved number below, then tick it off here.

**Already implemented?** If this repository was built before the log existed,
most of the decisions below have answers sitting in the code. Run
`/specframe-bootstrap` with an agent that has it installed: it looks for the
evidence, records only what it can prove, cites `path:line`, and leaves the rest
open. Recording one by hand works the same way —
`specframe decide --set <id>=<value> --detected` marks the ADR as documenting an
existing implementation rather than a new choice.

**Will never apply here?** Not every decision belongs to every repository —
every frontend decision in a backend-only service, event sourcing in a plain
CRUD app. Where a gate question has a `none`-shaped option (`persistence: none`,
`ui-surface: none`), answer that instead: it retires the whole group at once
and produces a real ADR. For the cases no gate covers, dismiss the decision
directly: `specframe dismiss <id>` — optionally `--reason "..."`, and
`--group <name>` for a whole section in one call. A dismissal is a claim about
this repository's *shape*, not a way to clear the backlog: it leaves no ADR,
only the record below, and `specframe restore <id>` reopens it if that changes.

## Decisions taken

{{takenDecisions}}

## Open decisions

{{openDecisions}}

## Decisions that do not apply

{{dismissedDecisions}}

---

<!-- This file is generated at scaffold time and refreshed by `specframe decide`.
     It is yours to edit: add decisions specific to this project that the
     catalog does not cover, using the same shape. -->
