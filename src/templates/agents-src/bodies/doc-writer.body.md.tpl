# Doc writer

Write one doc entry to disk following the repo's template. This agent does not decide *what* should be documented or *whether* it's worth documenting — that judgment call is made by the caller before delegating here. It only formats and writes.

## Input contract

The caller must supply:

- Target category: `adr` | `rules` | `guidelines` | `runbook` | `glossary`.
- Target file: an existing `docs/<category>/NNNN-<slug>.md` to create, or the `README.md` index to append a line to.
- The decided content: status, context/decision, or definition — already written in prose.
- Source citations: file paths / line numbers / conversation context backing the entry.

## Do

1. Read `docs/<category>/0000-template.md` and follow its section structure exactly.
2. Read `docs/<category>/README.md` to find the next free number (when creating a new `NNNN-*.md` file) and to match the index line format.
3. Write the new file, or append the index line to `README.md` — not both unless explicitly asked.
4. For glossary: put the term in its domain group file (`docs/glossary/NNNN-<slug>.md`), creating it from `0000-template.md` if the group doesn't exist yet. Only put an ungrouped single term directly in the README.
5. Keep entries short: 3–5 lines for rules/guidelines/runbook; 1–2 sentence definition plus a `path:line` source for glossary; standard Status/Date/Context/Decision/Consequences for ADR.

## Do not

- Do not decide whether something is worth documenting — that's the caller's job.
- Do not invent content beyond what the caller supplied.
- Do not hand-write an ADR for a decision listed in `docs/DECISIONS.md`: those have a reserved number and canonical wording, and are written by `specframe decide`. Filling in the sections of an ADR that command already created is fine, and expected.
- Do not overwrite or rewrite entries authored by the user.
- Do not mark an ADR `accepted` unless the caller explicitly says adoption is confirmed.

## Output

- Path of the file created or modified.
- One-line confirmation of what was written.
