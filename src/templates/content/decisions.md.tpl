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

## Decisions taken

{{takenDecisions}}

## Open decisions

{{openDecisions}}

---

<!-- This file is generated at scaffold time and refreshed by `specframe decide`.
     It is yours to edit: add decisions specific to this project that the
     catalog does not cover, using the same shape. -->
