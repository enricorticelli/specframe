# ADR-0001: Repository decision policy

- Status: accepted
- Date: {{initDate}}

## Context

Architectural knowledge in a repository decays in a predictable way: a choice is
made in a conversation, encoded in code, and its reasoning is lost. Six months
later nobody can say whether the shape of the code was deliberate, which makes
every change to it either reckless or paralysed.

AI agents make this sharper. An agent reading only the code will infer intent
from structure and will reproduce whatever it finds, including accidents. It has
no way to distinguish a decision from a leftover.

## Decision

This repository is decision-driven. Architectural choices are recorded as ADRs
under `docs/adr/` before or alongside the code that implements them, and the
decision log is the authoritative answer to *why* — the code is only the answer
to *what*.

Contributors, human and automated, read the relevant ADRs before proposing a
change, and record a new one when a change introduces a decision no ADR covers.

## Consequences

- The reasoning behind the codebase survives the people who were in the room.
- Agents read intent instead of reverse-engineering it from structure.
- Architectural change gets slightly slower and considerably more deliberate:
  it now requires either alignment with an existing ADR or a new one.
- The log needs upkeep. An abandoned decision log is worse than none, because it
  is believed while being wrong.

## Alternatives considered

- **No formal record** — cheapest, and the default failure mode this repository
  exists to avoid.
- **Documentation in a wiki or external tool** — better editing tools, but it
  drifts from the code and is invisible to agents working in the repository.
- **Comments in the code** — close to the implementation, but they cannot
  describe a rejected alternative or a decision that spans several files.

## Documents this decision produced

- Rules: —
- Guidelines: —
