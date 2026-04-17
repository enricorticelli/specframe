# specframe

CLI minimale per generare file di contesto (AGENTS/ADR) nella cartella corrente.

## Requirements

- Node.js 18+

## Run

Da questo repository:

```bash
node ./bin/specframe.js
```

or:

```bash
npm start
```

La CLI chiede:

- `project name` (default: nome cartella corrente)
- `package manager` (`npm` o `pnpm`, default `npm`)
- `include CI` (`[Y/n]`)

## Generated files

Scrive questi file nella cartella corrente:

- AGENTS.md
- CLAUDE.md
- docs/adr/README.md
- docs/adr/0000-template.md
- .github/copilot-instructions.md
- .github/pull_request_template.md
- optional: .github/workflows/policy-check.yml

Se un file esiste gia, non viene sovrascritto.

## Logs

- `[write] <path>`: file created
- `[skip] <path>`: file already exists, skipped
