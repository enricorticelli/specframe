// Rule registry — the non-negotiable constraints specframe can emit.
//
// Each entry is plain data rendered by render.js into the shape declared by
// docs/rules/0000-template.md (statement / why / enforcement). Keeping the
// prose here rather than in .tpl files means one rule is one object: the
// catalog references it by slug, resolve.js dedupes it across decisions, and
// catalog.test.js can prove every reference resolves.
//
// `number` is permanent. It lands in the filename (docs/rules/0010-no-secrets.md),
// so a repo's rule paths stay stable as the catalog grows. Never reuse or
// renumber one — append instead.
//
// Text may contain {{placeholders}}; a catalog option supplies values with
// `{ slug, vars: { threshold: '80' } }`.
export const RULES = {
  'no-secrets': {
    number: '0010',
    title: 'No secrets in the repository',
    status: 'enforced',
    statement: 'Never commit credentials, tokens, private keys, or customer data.',
    why: 'A committed secret is compromised permanently: git history keeps it readable after the file is deleted, so the only remedy is rotating it everywhere it was trusted.',
    enforcement: 'Pre-commit secret scanner plus a blocking CI check on every branch.',
  },

  'secrets-from-managed-store': {
    number: '0020',
    title: 'Secrets come from {{source}}',
    status: 'enforced',
    statement: 'Load every credential from {{source}} at startup. Never hardcode one, and never read it from a file committed to the repository.',
    why: 'Decoupling secrets from source is what makes rotation possible without a deploy, and keeps the same artifact promotable across environments.',
    enforcement: 'Code review; a startup check fails fast when a required variable is missing.',
  },

  'validate-external-input': {
    number: '0030',
    title: 'Validate every external input at the boundary',
    status: 'enforced',
    statement: 'Validate and normalise all data crossing into the system — HTTP, queue, file, CLI, third-party response — before it reaches domain code.',
    why: 'Unvalidated input is the root of injection, corrupt persisted state, and invariants that fail far from their cause.',
    enforcement: 'Code review plus tests at each boundary covering the rejection path.',
  },

  'least-privilege': {
    number: '0040',
    title: 'Least privilege for every role, key, and token',
    status: 'enforced',
    statement: 'Grant the minimum permission a role, key, or token needs, and scope it to the resources it actually touches.',
    why: 'Permissions decide the blast radius of a compromise. Broad credentials turn a single leak into a full breach.',
    enforcement: 'Manual audit when a grant is created and again on every rotation.',
  },

  'no-pii-in-logs': {
    number: '0050',
    title: 'No credentials or personal data in logs',
    status: 'enforced',
    statement: 'Logs must not contain secrets, tokens, authentication headers, or personal data beyond a stable pseudonymous identifier.',
    why: 'Logs are aggregated into long-lived stores with far broader access than the database they came from, and they are rarely covered by deletion requests.',
    enforcement: 'Code review plus a scrubbing layer in the logger for known-sensitive keys.',
  },

  'lint-format-ci': {
    number: '0060',
    title: 'Formatter and linter pass in CI',
    status: 'enforced',
    statement: 'The pipeline fails when formatting or lint checks do not pass. Warnings that are tolerated are removed from the ruleset rather than ignored.',
    why: 'A check that can be skipped stops being a signal. Machine-enforced style also removes the whole class of review comments about it.',
    enforcement: 'Blocking CI job; `{{packageManager}} run lint` reproduces it locally.',
  },

  'regression-test-for-every-fix': {
    number: '0070',
    title: 'Every bug fix ships with a regression test',
    status: 'enforced',
    statement: 'A fix is incomplete without a test that fails before the change and passes after it.',
    why: 'Without one there is no evidence the bug is understood, and nothing stops it returning silently in a later refactor.',
    enforcement: 'Code review; the PR states which test covers the regression.',
  },

  'timeouts-and-backoff': {
    number: '0080',
    title: 'Every outbound call has a timeout and bounded retries',
    status: 'enforced',
    statement: 'Set an explicit timeout on every network call. Retries use bounded exponential backoff with jitter and a maximum attempt count.',
    why: 'A call without a timeout converts a slow dependency into an exhausted connection pool; unbounded retries convert a brief outage into a self-inflicted denial of service.',
    enforcement: 'Code review; a shared client wrapper carries the defaults.',
  },

  'no-cross-service-db': {
    number: '0090',
    title: 'No service reads another service\'s database',
    status: 'enforced',
    statement: 'A service reaches another service only through its published interface. Direct connections to a database it does not own are forbidden, including read-only ones.',
    why: 'A shared schema is a shared deploy: the moment two services read the same tables, neither can migrate independently and the service boundary is decorative.',
    enforcement: 'Code review plus per-service database credentials that cannot reach other schemas.',
  },

  'service-owns-its-data': {
    number: '0100',
    title: 'A service owns its data',
    status: 'enforced',
    statement: 'Exactly one service writes any given piece of state. Every other component obtains it through an API call or a published event.',
    why: 'Single ownership is what makes a change to storage a local decision. Two writers means no one can reason about invariants.',
    enforcement: 'Code review; ownership is recorded in the service catalog.',
  },

  'module-boundaries': {
    number: '0110',
    title: 'Modules communicate only through their public surface',
    status: 'enforced',
    statement: 'A module exposes an explicit entry point. Importing another module\'s internal files, or reaching into its persistence, is forbidden.',
    why: 'In a single deployable nothing physically prevents a shortcut, so the boundary only exists while it is enforced. Boundaries kept honest are what make later extraction cheap.',
    enforcement: 'Import-boundary lint rule in CI plus code review.',
  },

  'domain-free-of-infrastructure': {
    number: '0120',
    title: 'The domain layer does not depend on infrastructure',
    status: 'enforced',
    statement: 'Domain code must not import frameworks, ORMs, HTTP clients, or IO libraries. Dependencies point inward, and the outer layers implement interfaces the domain declares.',
    why: 'It keeps business rules testable without a running environment, and lets infrastructure be replaced without touching the rules it serves.',
    enforcement: 'Dependency-direction lint rule in CI plus code review.',
  },

  'events-are-immutable': {
    number: '0130',
    title: 'Recorded events are immutable',
    status: 'enforced',
    statement: 'An event that has been appended is never edited or deleted. Corrections are new compensating events; shape changes are new event versions.',
    why: 'The event log is the system of record. Rewriting it invalidates every projection derived from it and destroys the audit trail that motivated event sourcing.',
    enforcement: 'Append-only permissions on the event store plus code review.',
  },

  'no-writes-through-read-models': {
    number: '0140',
    title: 'Read models are never written through',
    status: 'enforced',
    statement: 'State changes go through commands on the write model. Query-side stores are derived, disposable, and rebuildable from their source.',
    why: 'A write that lands only in a projection cannot be replayed, so the next rebuild silently deletes it.',
    enforcement: 'Code review; the query side runs with read-only credentials where the store allows it.',
  },

  'forward-only-migrations': {
    number: '0150',
    title: 'Schema migrations are versioned and forward-only',
    status: 'enforced',
    statement: 'Every schema change is a numbered migration committed with the code that needs it. An applied migration is never edited; a mistake is corrected by a new migration.',
    why: 'Editing an applied migration makes environments diverge invisibly — the file no longer describes the schema anyone is running.',
    enforcement: 'CI applies migrations from scratch on every build; review rejects edits to applied files.',
  },

  'no-breaking-api-change-without-version': {
    number: '0160',
    title: 'No breaking change to a published interface without a version',
    status: 'enforced',
    statement: 'Removing a field, narrowing a type, or changing a meaning requires a new version served alongside the old one until consumers have migrated.',
    why: 'Consumers deploy on their own schedule. A breaking change without a version is an outage scheduled for someone else.',
    enforcement: 'Contract diff in CI plus code review.',
  },

  'coverage-gate': {
    number: '0170',
    title: 'Test coverage stays at or above {{threshold}}%',
    status: 'enforced',
    statement: 'The pipeline fails when line coverage on changed code falls below {{threshold}}%.',
    why: 'The number is not the goal; the ratchet is. It makes a drop in tested surface a visible, deliberate decision instead of a drift.',
    enforcement: 'Blocking CI job on the coverage report.',
  },

  'test-first': {
    number: '0180',
    title: 'Production code is written after a failing test',
    status: 'enforced',
    statement: 'Write the failing test first, make it pass with the simplest change, then refactor. This applies to features and fixes alike.',
    why: 'A test written first specifies behaviour; one written after tends to describe the implementation that already exists, including its bugs.',
    enforcement: 'Code review on commit order and test intent.',
  },

  'consumer-contract-required': {
    number: '0190',
    title: 'Cross-service integrations are covered by a contract test',
    status: 'enforced',
    statement: 'Every consumer publishes the contract it depends on, and the provider verifies all published contracts in its own pipeline.',
    why: 'It moves integration breakage from the consumer\'s runtime to the provider\'s build, which is the only place it can be fixed cheaply.',
    enforcement: 'Blocking provider-side CI job over the contract broker.',
  },

  'dependency-scan-blocking': {
    number: '0200',
    title: 'Known-vulnerable dependencies block the build',
    status: 'enforced',
    statement: 'A dependency with a known high or critical advisory fails CI. Suppressions are time-boxed and justified in the repository.',
    why: 'Most exploited vulnerabilities are already published and already fixed upstream; the gap is entirely in adoption time.',
    enforcement: 'Blocking CI job; suppressions expire and reopen the failure.',
  },

  'authn-on-every-endpoint': {
    number: '0210',
    title: 'Every endpoint is authenticated and authorised by default',
    status: 'enforced',
    statement: 'Endpoints require authentication unless explicitly marked public, and check authorisation against the acting principal rather than trusting a client-supplied identifier.',
    why: 'Default-deny is the only posture that fails safely: a forgotten annotation blocks a request instead of exposing data.',
    enforcement: 'Framework-level default plus a review checklist item on every new route.',
  },

  'gdpr-data-minimisation': {
    number: '0220',
    title: 'Collect the minimum personal data, with a recorded purpose',
    status: 'enforced',
    statement: 'Every personal data field has a documented purpose, a lawful basis, and a retention period. Data without one is not collected or is deleted.',
    why: 'Minimisation and purpose limitation are legal requirements under the GDPR, and they shrink the surface a breach can expose.',
    enforcement: 'Data-inventory review before a field is added; retention jobs verified in staging.',
  },

  'structured-logs-only': {
    number: '0230',
    title: 'Logs are structured, with stable keys',
    status: 'enforced',
    statement: 'Emit machine-readable records with stable field names. Do not interpolate variables into free-text messages.',
    why: 'Interpolated text cannot be aggregated or alerted on; stable keys are what make a log store queryable during an incident.',
    enforcement: 'Shared logger is the only permitted sink; code review rejects direct writes to stdout.',
  },

  'trace-context-propagation': {
    number: '0240',
    title: 'Trace context propagates across every hop',
    status: 'enforced',
    statement: 'Accept and forward the incoming trace context on all inbound and outbound calls, including asynchronous messages.',
    why: 'A single dropped hop breaks the causal chain, which is exactly the part of the request you need when latency is unexplained.',
    enforcement: 'Instrumented shared clients and middleware; verified by a smoke trace in staging.',
  },

  'conventional-commits': {
    number: '0250',
    title: 'Commit messages follow Conventional Commits',
    status: 'enforced',
    statement: 'Use `type(scope): summary`, with `!` or a `BREAKING CHANGE:` footer for incompatible changes.',
    why: 'A parseable history is what lets release notes, version bumps, and changelogs be generated instead of curated by hand.',
    enforcement: 'Commit-message lint in CI on the pull request.',
  },

  'pr-review-required': {
    number: '0260',
    title: 'Every change is approved by {{reviewers}} before merge',
    status: 'enforced',
    statement: 'Changes reach the default branch through a pull request with {{reviewers}} approving review. Self-approval does not count.',
    why: 'Review is where context spreads and where a second reader catches the cases the author had already assumed away.',
    enforcement: 'Branch protection on the default branch.',
  },

  'ci-green-before-merge': {
    number: '0270',
    title: 'The default branch only takes green builds',
    status: 'enforced',
    statement: 'All required checks pass before merge. A red default branch is fixed or reverted before any other work merges.',
    why: 'A broken main branch blocks everyone at once and hides new failures behind an existing one.',
    enforcement: 'Branch protection with required status checks.',
  },

  'complexity-budget': {
    number: '0280',
    title: 'Cyclomatic complexity stays at or below {{limit}}',
    status: 'enforced',
    statement: 'No function exceeds a cyclomatic complexity of {{limit}}. Extract collaborators or invert the control flow instead of raising the limit.',
    why: 'Complexity predicts defect density and review fatigue better than length does, and a hard number turns "this feels tangled" into an actionable check.',
    enforcement: 'Lint rule in CI.',
  },

  'no-direct-push-to-main': {
    number: '0290',
    title: 'No direct pushes to the default branch',
    status: 'enforced',
    statement: 'The default branch accepts merges from pull requests only. Force-pushes and branch deletion are disabled.',
    why: 'It keeps the branch releasable at every commit and makes history auditable.',
    enforcement: 'Branch protection.',
  },

  'outbox-for-cross-service-writes': {
    number: '0300',
    title: 'Cross-service effects are published through the outbox',
    status: 'enforced',
    statement: 'Write the message to an outbox table inside the same transaction as the state change, and let a relay publish it. Never publish to a broker inside a database transaction.',
    why: 'Without it, a crash between commit and publish loses the message, or a rollback after publish announces something that never happened.',
    enforcement: 'Code review; the broker client is reachable only from the relay.',
  },
};
