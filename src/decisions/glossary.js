// Glossary registry — domain and architecture terms specframe can emit.
//
// Terms are grouped: one generated file per group (docs/glossary/0010-architecture.md)
// holding a `## Term` section per selected term, matching the shape declared by
// docs/glossary/0000-template.md. Group numbers are permanent; terms are
// ordered alphabetically inside their group so the file is stable regardless of
// which decisions selected which terms.
export const GLOSSARY_GROUPS = {
  architecture: { number: '0010', title: 'Architecture' },
  data: { number: '0020', title: 'Data and consistency' },
  quality: { number: '0030', title: 'Quality and testing' },
  security: { number: '0040', title: 'Security' },
  delivery: { number: '0050', title: 'Delivery and operations' },
};

export const GLOSSARY_TERMS = {
  module: {
    group: 'architecture',
    term: 'Module',
    definition:
      'A unit of the codebase that owns a business capability and exposes a single explicit entry point. A module is a compile-time boundary, not a deployment boundary.',
    aliases: 'Package',
    context: 'Applies to the top-level structure of the codebase.',
    related: 'Component, Service, Bounded context',
  },

  service: {
    group: 'architecture',
    term: 'Service',
    definition:
      'An independently deployable unit that owns its data and is reached only through its published interface.',
    aliases: '—',
    context: 'Applies to runtime topology and ownership, not to code organisation.',
    related: 'Module, API contract, Bounded context',
  },

  'bounded-context': {
    group: 'architecture',
    term: 'Bounded context',
    definition:
      'A boundary inside which a set of domain terms has one consistent meaning. The same word may legitimately mean something different in another context.',
    aliases: '—',
    context: 'Applies to domain modelling and to deciding where a boundary belongs.',
    related: 'Ubiquitous language, Service, Aggregate',
  },

  'api-contract': {
    group: 'architecture',
    term: 'API contract',
    definition:
      'The published, versioned promise a component makes about its interface: the shapes it accepts, the shapes it returns, and the guarantees attached to them.',
    aliases: 'Interface contract',
    context: 'Applies to any interface with a consumer outside its own deployment unit.',
    related: 'Contract test, Service',
  },

  aggregate: {
    group: 'data',
    term: 'Aggregate',
    definition:
      'A cluster of objects treated as one unit for changes, with a single root through which all modification passes. The aggregate is the consistency boundary: everything inside it is consistent after each transaction.',
    aliases: '—',
    context: 'Applies to the domain model and to deciding transaction scope.',
    related: 'Bounded context, Command, Event store',
  },

  command: {
    group: 'data',
    term: 'Command',
    definition:
      'A request to change state, named in the imperative. It is validated, may be rejected, and produces events or an error — never a query result.',
    aliases: '—',
    context: 'Applies to the application layer.',
    related: 'Read model, Aggregate, Event store',
  },

  'event-store': {
    group: 'data',
    term: 'Event store',
    definition:
      'The append-only log of domain events that is the system of record. State is derived by replaying it; the log itself is never edited.',
    aliases: 'Event log',
    context: 'Applies wherever event sourcing is in use.',
    related: 'Projection, Read model, Aggregate',
  },

  projection: {
    group: 'data',
    term: 'Projection',
    definition:
      'A derived view built by folding events into a shape suited to a specific query. It is disposable and can be rebuilt from the log at any time.',
    aliases: 'Denormaliser',
    context: 'Applies to the query side of an event-sourced or CQRS system.',
    related: 'Event store, Read model, Checkpoint',
  },

  'read-model': {
    group: 'data',
    term: 'Read model',
    definition:
      'The data shape a query path reads from, modelled for its consumer rather than for storage. It is eventually consistent with the write model.',
    aliases: 'Query model',
    context: 'Applies wherever read and write paths are separated.',
    related: 'Projection, Command, Eventual consistency',
  },

  'eventual-consistency': {
    group: 'data',
    term: 'Eventual consistency',
    definition:
      'A guarantee that a derived store converges on the authoritative state after a delay, without guaranteeing when. A read taken immediately after a write may not reflect it.',
    aliases: '—',
    context: 'Applies to every derived or replicated store.',
    related: 'Read model, Projection, Saga',
  },

  saga: {
    group: 'data',
    term: 'Saga',
    definition:
      'A business process spanning several transactions, where each step has a compensating action instead of a shared rollback. It trades atomicity for availability.',
    aliases: 'Process manager',
    context: 'Applies to workflows crossing an aggregate or service boundary.',
    related: 'Outbox, Eventual consistency, Command',
  },

  outbox: {
    group: 'data',
    term: 'Outbox',
    definition:
      'A table written inside the same transaction as a state change, holding messages a separate relay later publishes. It makes "change state and announce it" atomic without a distributed transaction.',
    aliases: 'Transactional outbox',
    context: 'Applies wherever a state change must produce a message.',
    related: 'Saga, Eventual consistency',
  },

  'coverage-gate': {
    group: 'quality',
    term: 'Coverage gate',
    definition:
      'A build check that fails when the proportion of code exercised by tests falls below a threshold. It measures execution, not correctness.',
    aliases: '—',
    context: 'Applies in CI.',
    related: 'Mutation score, Contract test',
  },

  'contract-test': {
    group: 'quality',
    term: 'Contract test',
    definition:
      'A test asserting that a provider satisfies the specific subset of its interface a named consumer depends on. Owned by the consumer, executed by the provider.',
    aliases: 'Consumer-driven contract',
    context: 'Applies to cross-service integrations.',
    related: 'API contract, Coverage gate',
  },

  'mutation-score': {
    group: 'quality',
    term: 'Mutation score',
    definition:
      'The proportion of deliberately introduced faults that the test suite detects. A surviving mutant marks behaviour that runs but is never asserted on.',
    aliases: '—',
    context: 'Applies to core domain logic.',
    related: 'Coverage gate',
  },

  secret: {
    group: 'security',
    term: 'Secret',
    definition:
      'Any value whose disclosure grants access: password, token, private key, connection string, signing key. Distinguished from configuration by consequence, not by format.',
    aliases: 'Credential',
    context: 'Applies to configuration and deployment.',
    related: 'Principal, Personal data',
  },

  principal: {
    group: 'security',
    term: 'Principal',
    definition:
      'The authenticated identity acting in a request — a user, a service, or a job. Authorisation decisions are made about the principal, never about a client-supplied identifier.',
    aliases: 'Subject, actor',
    context: 'Applies at every entry point.',
    related: 'Secret',
  },

  'personal-data': {
    group: 'security',
    term: 'Personal data',
    definition:
      'Any information relating to an identifiable person, directly or in combination with other held data. Pseudonymous identifiers still count while a mapping exists.',
    aliases: 'PII',
    context: 'Applies to storage, logs, analytics, and any export.',
    related: 'Secret, Retention period',
  },

  'retention-period': {
    group: 'security',
    term: 'Retention period',
    definition:
      'The maximum time a category of data is kept, after which it is deleted or anonymised. Every personal data field has one.',
    aliases: '—',
    context: 'Applies to persisted data, backups, and logs.',
    related: 'Personal data',
  },

  environment: {
    group: 'delivery',
    term: 'Environment',
    definition:
      'A running instance of the system, distinguished from the others only by configuration and data — never by code path.',
    aliases: 'Stage',
    context: 'Applies to the deployment pipeline.',
    related: 'Release, Trunk',
  },

  release: {
    group: 'delivery',
    term: 'Release',
    definition:
      'An immutable, versioned artifact promoted between environments. The same build reaches production that was verified earlier.',
    aliases: 'Build, artifact',
    context: 'Applies to the deployment pipeline.',
    related: 'Environment, Trunk',
  },

  trunk: {
    group: 'delivery',
    term: 'Trunk',
    definition:
      'The default branch, kept releasable at every commit. Work reaches it in small increments, with unfinished behaviour held behind a flag rather than on a branch.',
    aliases: 'Main, mainline',
    context: 'Applies to version control.',
    related: 'Release, Environment',
  },

  'error-budget': {
    group: 'delivery',
    term: 'Error budget',
    definition:
      'The permitted amount of unreliability in a window — the gap between an objective\'s target and 100%. Spending it is how change is paid for; exhausting it redirects work to reliability.',
    aliases: '—',
    context: 'Applies to user-facing services with defined objectives.',
    related: 'Release, Environment',
  },
  component: {
    group: 'architecture',
    term: 'Component',
    definition:
      'The smallest named unit of the codebase that owns source code: a leaf of the namespace tree. Everything above it is a subdomain and holds no code, which is what makes a component\'s size, coupling, and owner answerable questions.',
    aliases: 'Leaf package, leaf namespace',
    context: 'Applies to code organisation, independently of how many things are deployed.',
    related: 'Module, Shared code, Afferent coupling',
  },

  'shared-code': {
    group: 'architecture',
    term: 'Shared code',
    definition:
      'Code used by more than one component, held in a component of its own rather than in a parent namespace. Shared domain logic is business logic common to some components; shared infrastructure is operational and common to all of them. The two are kept apart.',
    aliases: 'Common code',
    context: 'Applies to interfaces, abstract classes, and utilities with more than one caller.',
    related: 'Component, Module',
  },

  'afferent-coupling': {
    group: 'architecture',
    term: 'Afferent coupling',
    definition:
      'The number of other components that depend on a given component — incoming edges. High afferent coupling makes a component expensive to change, because the cost lands on its dependants.',
    aliases: 'CA, incoming coupling, fan-in',
    context: 'Measured between components, ignoring dependencies internal to one.',
    related: 'Efferent coupling, Component, Fitness function',
  },

  'efferent-coupling': {
    group: 'architecture',
    term: 'Efferent coupling',
    definition:
      'The number of other components a given component depends on — outgoing edges. High efferent coupling makes a component fragile, because it inherits every dependency\'s failure and release schedule.',
    aliases: 'CE, outgoing coupling, fan-out',
    context: 'Measured between components, ignoring dependencies internal to one.',
    related: 'Afferent coupling, Component, Fitness function',
  },

  'fitness-function': {
    group: 'quality',
    term: 'Fitness function',
    definition:
      'An automated check that an architectural characteristic still holds — component boundaries, coupling, size distribution. It runs in the pipeline like a test, and either alerts or fails the build.',
    aliases: 'Architecture test',
    context: 'Applies to structural properties, not to behaviour, which is what ordinary tests cover.',
    related: 'Statement count, Afferent coupling, Architecture story',
  },

  'statement-count': {
    group: 'quality',
    term: 'Statement count',
    definition:
      'The number of statements in a component — actions terminated by a semicolon or a newline, depending on the language. An imperfect but honest proxy for how much a component does, and the one size metric that does not depend on how a developer chose to split classes.',
    aliases: '—',
    context: 'Used to compare components against each other, not as an absolute target.',
    related: 'Component, Fitness function',
  },

  'architecture-story': {
    group: 'delivery',
    term: 'Architecture story',
    definition:
      'A backlog item for structural work, distinct from a user story and from a technical-debt ticket: decoupling X in order to better support Y, where Y is an architectural characteristic or a business need. The stated Y is what gives it a defensible priority.',
    aliases: '—',
    context: 'Applies to the backlog; it competes with features rather than waiting behind them.',
    related: 'Fitness function, Component',
  },
};
