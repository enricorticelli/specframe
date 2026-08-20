// The decision catalog — the single source of truth for the guided onboarding.
//
// Every question specframe can ask lives here, grouped, with the artifacts each
// answer produces. Nothing in this file performs IO: resolve.js turns answers
// into a set of documents, render.js turns those into markdown, writer.js writes
// them. That split is what lets catalog.test.js prove the whole catalog is
// internally consistent without touching a filesystem.
//
// Shape of a decision:
//   id          stable key, used in answers, presets, --set and the manifest.
//   group       one of GROUPS below.
//   adr         permanent 4-digit ADR number. Lands in docs/adr/<adr>-<slug>.md.
//               Group ranges: 01xx architecture, 02xx design, 03xx data,
//               04xx quality, 05xx testing, 06xx security, 07xx observability,
//               08xx delivery, 09xx frontend. Steps of 10 leave room to insert.
//               Never reuse. The range is the group's position in GROUPS, so a
//               new group is appended — never inserted, which would renumber
//               every ADR after it in repositories that already have them.
//               This catalog will never use a number ≥ LOCAL_ADR_MIN (9000):
//               that band is reserved for `specframe adr new`, which records a
//               decision outside the catalog. Appending a group here can add
//               at most one range per group forever, so the gap is headroom
//               enough that the two will never collide.
//   question    asked in the wizard.
//   help        shown on `?`, and as the "why this matters" line in DECISIONS.md.
//   context     the ADR's Context section: why the decision exists at all.
//   when        optional predicate over answers so far. Returns true when the
//               question is relevant. It must return true when the answer it
//               depends on is missing — "unknown" means still relevant, so
//               skipping a gate question never silently hides its follow-ups.
//   options[]   value, label, optional hint, at most one `recommended`, plus:
//                 statement    the ADR's Decision section.
//                 consequences the ADR's Consequences section.
//                 tradeoff     one line, shown when this option appears under
//                              "Alternatives considered" in another option's ADR.
//                 emits        { rules, guidelines, runbooks, glossary } of
//                              registry slugs. An entry may be a bare slug or
//                              { slug, vars } to fill {{placeholders}}.
//
// Skipping is never an option value: an unanswered decision is simply open, and
// lands in docs/DECISIONS.md as work still to do.

import { RULES } from './rules.js';
import { GUIDELINES } from './guidelines.js';
import { RUNBOOKS } from './runbooks.js';
import { GLOSSARY_TERMS } from './glossary.js';

export const GROUPS = [
  {
    id: 'architecture',
    title: 'Architecture',
    blurb: 'Deployment units, boundaries, and how components talk.',
  },
  {
    id: 'design',
    title: 'Design and modelling',
    blurb: 'Layering, domain modelling, patterns, error handling.',
  },
  {
    id: 'data',
    title: 'Data and consistency',
    blurb: 'Persistence, event sourcing, CQRS, transactions, migrations.',
  },
  {
    id: 'quality',
    title: 'Code quality',
    blurb: 'Clean Code, SOLID, complexity budget, lint and format.',
  },
  {
    id: 'testing',
    title: 'Testing',
    blurb: 'TDD, test distribution, coverage, contracts, mutation testing.',
  },
  {
    id: 'security',
    title: 'Security and compliance',
    blurb: 'Secrets, validation, authentication, personal data, dependencies.',
  },
  {
    id: 'observability',
    title: 'Observability',
    blurb: 'Structured logs, metrics, tracing, objectives.',
  },
  {
    id: 'delivery',
    title: 'Delivery',
    blurb: 'Branching, commits, review policy, CI gates, releases, environments.',
  },
  {
    id: 'frontend',
    title: 'User interface',
    blurb: 'Rendering, composition, state, styling, accessibility, and the budget.',
  },
];

// Architecture styles with more than one deployment unit. Follow-up questions
// about distribution are gated on this.
const DISTRIBUTED_STYLES = new Set(['service-based', 'microservices', 'serverless']);

// True when the architecture is distributed, and also when it is unknown —
// see the `when` contract above.
const isDistributed = (answers) => {
  const style = answers['architecture-style'];
  return !style || DISTRIBUTED_STYLES.has(style);
};

// A repository that stores nothing durable has no storage model to choose, and
// none of the questions that only exist because there is one.
const persists = (answers) => answers.persistence !== 'none';

// Whether this repository ships a user interface at all. Everything in the
// frontend section is gated on it — and, per the `when` contract, stays
// relevant while it is unanswered.
const hasUi = (answers) => answers['ui-surface'] !== 'none';

// A content site has no session and no state worth a model, so the questions
// that only make sense for an application are retired for it.
const isApplicationUi = (answers) => {
  const surface = answers['ui-surface'];
  return !surface || surface === 'web-app';
};

const usesMessaging = (answers) => {
  const comm = answers['inter-component-comm'];
  return isDistributed(answers) && (!comm || comm === 'async-messaging' || comm === 'hybrid');
};

export const DECISIONS = [
  // ---------------------------------------------------------------- architecture
  {
    id: 'architecture-style',
    group: 'architecture',
    adr: '0100',
    slug: 'architecture-style',
    title: 'Architecture style',
    question: 'Which architecture style do you adopt?',
    help: 'Decides how many things you deploy, and therefore how much of your complexity is in the network rather than in the code.',
    context:
      'The number and granularity of deployment units shapes every later decision: transaction scope, failure modes, testing strategy, and the operational cost of a release. It is the most expensive decision to reverse, so it is recorded first.',
    options: [
      {
        value: 'monolith',
        label: 'Monolith',
        hint: 'one deployable, one codebase, no internal boundaries enforced',
        statement: 'Build and deploy the system as a single unit, without enforced internal module boundaries.',
        consequences: [
          'Local reasoning and refactoring stay cheap; a change can cross the whole system in one commit.',
          'One transaction covers any state change, so there is no distributed consistency problem to solve.',
          'Scaling is all-or-nothing, and structure erodes unless review actively defends it.',
        ],
        tradeoff: 'Cheapest to build and operate, but nothing prevents the structure from eroding into a single tangle.',
        // Deliberately emits nothing: choosing a plain monolith imposes no
        // constraint the other decisions do not already cover. Persistence
        // conventions belong to the `persistence` decision, which supplies the
        // variables that document needs.
        emits: {},
      },
      {
        value: 'modular-monolith',
        label: 'Modular monolith',
        hint: 'one deployable, explicit module boundaries',
        recommended: true,
        statement:
          'Build and deploy the system as a single unit, split into modules with explicit, enforced boundaries and no cross-module internal access.',
        consequences: [
          'Keeps a single transaction and a single deploy while making boundaries real and reviewable.',
          'A module can later be extracted into a service without a rewrite, because its surface is already explicit.',
          'Boundaries only hold while the import rules are enforced in CI — nothing physical stops a shortcut.',
        ],
        tradeoff: 'Requires enforcing boundaries that the runtime does not, which is discipline rather than architecture.',
        emits: {
          rules: ['module-boundaries'],
          guidelines: ['module-layout'],
          glossary: ['module'],
        },
      },
      {
        value: 'service-based',
        label: 'Service-based',
        hint: 'a few coarse services, often a shared database',
        statement:
          'Split the system into a small number of coarse-grained, independently deployable services aligned to business capabilities.',
        consequences: [
          'Independent deploy and scaling per service, with far fewer moving parts than fine-grained services.',
          'Cross-service calls become failure modes: every one needs a timeout and a fallback.',
          'Some consistency is now eventual, and some workflows need explicit coordination.',
        ],
        tradeoff: 'Most of the independence of microservices at a fraction of the operational cost, but boundaries are coarse and harder to move later.',
        emits: {
          rules: [
            'timeouts-and-backoff',
            'no-breaking-api-change-without-version',
            'namespace-matches-deployment-unit',
          ],
          guidelines: ['service-boundaries'],
          runbooks: ['service-degradation'],
          glossary: ['service', 'api-contract'],
        },
      },
      {
        value: 'microservices',
        label: 'Microservices',
        hint: 'many fine-grained services, one database each',
        statement:
          'Split the system into fine-grained services, each owning its data and deployed independently.',
        consequences: [
          'Teams deploy and scale independently, and a failure can be contained to one capability.',
          'Requires real investment in platform work: service discovery, tracing, contract testing, and deployment automation are no longer optional.',
          'Any workflow crossing services is eventually consistent and needs explicit compensation.',
        ],
        tradeoff: 'Maximum independence, paid for with distributed-systems complexity in every feature that crosses a boundary.',
        emits: {
          rules: [
            'timeouts-and-backoff',
            'no-cross-service-db',
            'service-owns-its-data',
            'no-breaking-api-change-without-version',
            'namespace-matches-deployment-unit',
          ],
          guidelines: ['service-boundaries'],
          runbooks: ['service-degradation'],
          glossary: ['service', 'api-contract', 'bounded-context'],
        },
      },
      {
        value: 'serverless',
        label: 'Serverless / functions',
        hint: 'managed runtime, per-trigger functions',
        statement:
          'Deploy the system as event-triggered functions on a managed runtime, with no long-lived processes of our own.',
        consequences: [
          'No server operations, and cost tracks usage rather than provisioned capacity.',
          'Cold starts, execution limits, and retry-on-failure semantics become design constraints in every handler.',
          'Local reproduction is harder, so domain logic must be kept out of the handler to stay testable.',
        ],
        tradeoff: 'Removes infrastructure work at the cost of platform constraints leaking into application design.',
        emits: {
          rules: ['timeouts-and-backoff', 'namespace-matches-deployment-unit'],
          guidelines: ['serverless-function-design', 'service-boundaries'],
          runbooks: ['service-degradation'],
          glossary: ['service'],
        },
      },
    ],
  },

  {
    id: 'inter-component-comm',
    group: 'architecture',
    adr: '0110',
    slug: 'inter-component-communication',
    title: 'Inter-component communication',
    question: 'How do components communicate with each other?',
    help: 'Synchronous calls couple availability; asynchronous ones trade that for eventual consistency. This decides which problem you get.',
    context:
      'With more than one deployment unit, the transport between them determines the failure modes: a synchronous chain fails together, while an asynchronous one stays available but converges late.',
    when: isDistributed,
    options: [
      {
        value: 'sync-rest',
        label: 'Synchronous HTTP/REST',
        statement: 'Components call each other synchronously over HTTP.',
        consequences: [
          'Simplest to build, debug, and trace: the call stack is the request.',
          'Availability multiplies down the chain — every dependency is a hard dependency during the call.',
          'Latency accumulates hop by hop, so chains must be kept short.',
        ],
        tradeoff: 'Easiest to reason about, but couples the availability of every component in a call chain.',
        emits: { rules: ['timeouts-and-backoff'] },
      },
      {
        value: 'grpc',
        label: 'gRPC',
        statement: 'Components call each other synchronously over gRPC with schema-defined contracts.',
        consequences: [
          'Contracts are explicit and generated, so drift between client and server is caught at build time.',
          'Lower overhead and native streaming compared with JSON over HTTP.',
          'Same availability coupling as any synchronous call, plus tooling that is less browser-friendly.',
        ],
        tradeoff: 'Strong typed contracts, but adds a schema toolchain and stays availability-coupled.',
        emits: { rules: ['timeouts-and-backoff'], guidelines: ['grpc-conventions'] },
      },
      {
        value: 'async-messaging',
        label: 'Asynchronous messaging',
        statement: 'Components communicate by publishing and consuming messages through a broker.',
        consequences: [
          'A consumer being down stops nothing: the producer keeps working and the backlog drains later.',
          'All cross-component state becomes eventually consistent, and consumers must be idempotent.',
          'Debugging moves from a stack trace to correlated traces and queue inspection.',
        ],
        tradeoff: 'Best availability decoupling, at the cost of eventual consistency everywhere and harder debugging.',
        emits: {
          guidelines: ['async-messaging'],
          runbooks: ['replay-failed-messages'],
          glossary: ['eventual-consistency'],
        },
      },
      {
        value: 'hybrid',
        label: 'Hybrid',
        hint: 'synchronous for queries, messaging for state changes',
        recommended: true,
        statement:
          'Use synchronous calls for queries that need an immediate answer, and asynchronous messages for state changes and cross-component effects.',
        consequences: [
          'Reads stay simple and immediate while writes stop coupling availability.',
          'Two transports to operate, monitor, and reason about.',
          'Requires an explicit convention for which path a given interaction uses, or the split becomes arbitrary.',
        ],
        tradeoff: 'Fits the two interaction shapes properly, but doubles the transport surface to operate.',
        emits: {
          rules: ['timeouts-and-backoff'],
          guidelines: ['async-messaging'],
          runbooks: ['replay-failed-messages'],
          glossary: ['eventual-consistency'],
        },
      },
    ],
  },

  {
    id: 'api-style',
    group: 'architecture',
    adr: '0120',
    slug: 'api-style',
    title: 'External API style',
    question: 'What style is the externally consumed API?',
    help: 'Sets the shape of the contract clients depend on, and who controls query cost.',
    context:
      'The external interface is the part of the system that is hardest to change, because its consumers deploy on their own schedule. Its style determines how additive change and deprecation work.',
    options: [
      {
        value: 'rest',
        label: 'REST over HTTP',
        recommended: true,
        statement: 'Expose resource-oriented HTTP endpoints with conventional methods and status codes.',
        consequences: [
          'Universally understood, cacheable at the HTTP layer, debuggable with ordinary tools.',
          'Clients often need several round trips, or endpoints grow bespoke shapes for specific screens.',
        ],
        tradeoff: 'Most interoperable and easiest to cache, but leads to chatty clients or screen-specific endpoints.',
        emits: {
          guidelines: ['api-design-rest'],
          rules: ['no-breaking-api-change-without-version'],
          glossary: ['api-contract'],
        },
      },
      {
        value: 'graphql',
        label: 'GraphQL',
        statement: 'Expose a single GraphQL schema and let clients select the shape they need.',
        consequences: [
          'Clients fetch exactly what they need in one round trip, and the schema is self-documenting.',
          'Query cost moves to the server: depth, complexity, and N+1 access all need explicit guards.',
          'HTTP-level caching no longer applies; caching has to be solved in the resolver layer.',
        ],
        tradeoff: 'Removes over-fetching, but hands query cost to the server and gives up HTTP caching.',
        emits: { guidelines: ['api-design-graphql'], glossary: ['api-contract'] },
      },
      {
        value: 'grpc',
        label: 'gRPC',
        statement: 'Expose gRPC services defined by protobuf schemas.',
        consequences: [
          'Generated clients and a machine-checked contract in every language you generate for.',
          'Efficient on the wire, with first-class streaming.',
          'Needs a proxy for browsers and is harder to inspect with generic HTTP tooling.',
        ],
        tradeoff: 'Best performance and typing, worst reach for browser and third-party consumers.',
        emits: {
          guidelines: ['grpc-conventions'],
          rules: ['no-breaking-api-change-without-version'],
          glossary: ['api-contract'],
        },
      },
      {
        value: 'trpc',
        label: 'Typed RPC (tRPC or equivalent)',
        hint: 'shared types, single-language stack',
        statement: 'Expose typed procedure calls sharing types directly with a single-language client.',
        consequences: [
          'End-to-end type safety with no schema or code-generation step.',
          'Only works for clients in the same language and repository; not a public API.',
        ],
        tradeoff: 'Fastest to build inside one stack, but not an option for external or polyglot consumers.',
        emits: { glossary: ['api-contract'] },
      },
    ],
  },

  {
    id: 'component-structure',
    group: 'architecture',
    adr: '0130',
    slug: 'component-structure',
    title: 'Component structure',
    question: 'How is the source tree organised?',
    help: 'Decides whether a directory path tells you what the system does, or which framework it uses.',
    context:
      'The namespace tree is the only structure a reader, a reviewer, and a tool can all see without running anything. Whether it expresses business domains or technical roles decides whether a feature lives in one place or crosses the whole tree — and whether "component" is defined precisely enough to be measured at all.',
    options: [
      {
        value: 'domain-leaf',
        label: 'Domain namespaces, code only in leaves',
        hint: 'app.customer.billing.payment — intermediate nodes are subdomains and hold no code',
        recommended: true,
        statement:
          'Name namespaces after business domains and subdomains, and keep all source code in leaf nodes. An intermediate node is a container: extending it means moving its code down into a leaf of its own, in the same change.',
        consequences: [
          '"Component" gets a mechanical definition, so its size, its coupling, and its owner become answerable without a debate each time.',
          'A feature\'s change surface is one path in the tree — which is also what an agent needs in order to place a change correctly.',
          'Every extension of the tree forces a placement decision up front, which is friction exactly when someone would rather not think about it.',
        ],
        tradeoff: 'The only option under which component metrics mean anything, paid for with a placement decision on every new namespace.',
        emits: {
          rules: [
            'no-source-in-non-leaf-namespace',
            'approved-domains-only',
            'declared-component-dependencies',
          ],
          guidelines: ['component-naming'],
          glossary: ['component'],
        },
      },
      {
        value: 'domain-flat',
        label: 'Domain namespaces, no leaf constraint',
        hint: 'organised by domain, but a node may hold both code and children',
        statement:
          'Name namespaces after business domains, and allow a node to hold source code as well as child namespaces.',
        consequences: [
          'The tree still describes the business, and a feature still lives mostly in one place.',
          'Code in intermediate nodes belongs to no component, so size and coupling per component can only be estimated.',
          'The question "is this a component or a subdomain?" returns on every review.',
        ],
        tradeoff: 'Keeps the domain-first tree with less ceremony, but gives up the ability to measure a component.',
        emits: {
          rules: ['approved-domains-only', 'declared-component-dependencies'],
          guidelines: ['component-naming'],
          glossary: ['component'],
        },
      },
      {
        value: 'technical-layers',
        label: 'Technical layers at the top',
        hint: 'controllers/ services/ repositories/',
        statement:
          'Organise the top of the tree by technical role, with domain concepts appearing below it.',
        consequences: [
          'Familiar from most framework tutorials, and it is always obvious where a new class of a known kind goes.',
          'Every feature crosses the whole tree, so no directory tells a reader what the system does.',
          'Nothing owns a capability, which leaves nothing to extract when part of the system has to move.',
        ],
        tradeoff: 'Lowest thinking cost per file, at the price of a structure that says nothing about the business and cannot be decomposed later.',
        // Deliberately emits nothing: the component rules and guidelines all
        // presuppose that a namespace names a domain. Emitting them here would
        // hand the repository documents contradicting its own tree.
        emits: {},
      },
    ],
  },

  {
    id: 'shared-code',
    group: 'architecture',
    adr: '0140',
    slug: 'shared-code',
    title: 'Shared code placement',
    question: 'Where does code shared by several components live?',
    help: 'Decides whether sharing is something you can count, or something that accumulates in the middle of the tree.',
    context:
      'Interfaces, abstract classes, and utilities used by more than one component have to live somewhere. The instinctive answer is the nearest parent namespace — which is the one placement that makes the share invisible and the parent impossible to extract.',
    options: [
      {
        value: 'dedicated-component',
        label: 'A shared component of its own',
        hint: 'customer.billing.sharedcode — a suffix reserved for this and nothing else',
        recommended: true,
        statement:
          'Put shared code in its own leaf component, under a suffix reserved for that purpose and used for nothing else.',
        consequences: [
          'The reserved suffix makes the share countable: what percentage of the codebase is shared, and across how many components.',
          'Shared code has an owner and a coupling budget like any other component.',
          'It is one more component for every domain that shares anything, and the suffix has to be defended in review.',
        ],
        tradeoff: 'The only placement that makes sharing measurable, at the cost of extra components and a naming convention to uphold.',
        emits: {
          guidelines: ['shared-code-placement'],
          glossary: ['shared-code'],
        },
      },
      {
        value: 'shared-library',
        label: 'A versioned shared library',
        hint: 'published as a dependency, consumed like any third-party package',
        statement:
          'Publish shared code as a versioned library and consume it as a dependency.',
        consequences: [
          'The boundary is enforced by the packaging system rather than by review, and consumers upgrade on their own schedule.',
          'Every change becomes a release plus an upgrade in each consumer, which is slow while the interfaces are still moving.',
          'Version skew becomes possible: two components can be running different shared behaviour at the same time.',
        ],
        tradeoff: 'The strongest boundary and independent upgrades, paid for with release overhead and version skew.',
        emits: {
          guidelines: ['shared-code-placement'],
          glossary: ['shared-code'],
        },
      },
      {
        value: 'duplicate',
        label: 'Do not share — duplicate',
        statement:
          'Share nothing between components: each keeps its own copy and is free to let it diverge.',
        consequences: [
          'Components stay independent, and a change to one cannot break another.',
          'A fix has to be applied in every copy, and the copies drift silently in the meantime.',
        ],
        tradeoff: 'Maximum independence between components, paid for with every fix applied several times over.',
        emits: {},
      },
    ],
  },

  {
    id: 'architecture-governance',
    group: 'architecture',
    adr: '0150',
    slug: 'architecture-governance',
    title: 'Structural governance',
    question: 'How is structural erosion detected?',
    help: 'Decides whether the structure recorded above describes the repository, or only the day it was scaffolded.',
    context:
      'Structure degrades one justified exception at a time, and nothing in an ordinary build notices. Whether that erosion becomes visible while reversing it is still cheap depends entirely on something running on every change.',
    options: [
      {
        value: 'fitness-functions',
        label: 'Automated fitness functions in CI',
        hint: 'structural checks block; metric checks alert',
        recommended: true,
        statement:
          'Run structural checks in the pipeline: component inventory, namespace constraints, forbidden dependencies, size distribution, and coupling. The binary structural checks fail the build; the metric ones alert without blocking.',
        consequences: [
          'Introduced on a clean codebase the checks start green and act as a ratchet: the structure can hold or improve, but not quietly degrade.',
          'The component inventory makes every new component a visible decision rather than a side effect of a merge.',
          'Metric checks need a population of components before their thresholds carry information, so they alert rather than block and their numbers are set later.',
        ],
        tradeoff: 'The only option that catches erosion while reversing it is still cheap, at the cost of pipeline work and tolerance for alerts that are sometimes noise.',
        emits: {
          guidelines: ['component-sizing', 'coupling-budget', 'architecture-stories'],
          glossary: [
            'fitness-function',
            'statement-count',
            'afferent-coupling',
            'efferent-coupling',
            'architecture-story',
          ],
        },
      },
      {
        value: 'review',
        label: 'Code review against written constraints',
        statement:
          'Rely on code review, with the structural constraints written down so review has something specific to check against.',
        consequences: [
          'Nothing to build, and a reviewer can weigh an exception no automated check could judge.',
          'Coverage depends on who reviews and how much time they have — and slow drift is exactly what review is worst at seeing.',
        ],
        tradeoff: 'Free to start and able to judge exceptions, but blind to erosion that arrives a little at a time.',
        emits: {
          guidelines: ['component-sizing', 'coupling-budget', 'architecture-stories'],
          glossary: [
            'statement-count',
            'afferent-coupling',
            'efferent-coupling',
            'architecture-story',
          ],
        },
      },
      {
        value: 'none',
        label: 'No structural governance',
        statement: 'Do not govern structure; leave it to individual judgement on each change.',
        consequences: [
          'Nothing to maintain, and nothing to argue with.',
          'Structural decay surfaces when a change turns out to be expensive, which is after the cheap window for fixing it has closed.',
        ],
        tradeoff: 'No cost now, with the whole cost arriving later as work nobody planned for.',
        emits: {},
      },
    ],
  },

  // --------------------------------------------------------------------- design
  {
    id: 'layering',
    group: 'design',
    adr: '0200',
    slug: 'layering',
    title: 'Layering approach',
    question: 'How is the code layered?',
    help: 'Decides whether business rules can be tested and changed without the framework around them.',
    context:
      'Where dependencies are allowed to point determines what can be tested in isolation and what has to change when infrastructure does.',
    options: [
      {
        value: 'clean',
        label: 'Clean architecture',
        hint: 'entities, use cases, adapters; dependencies point inward',
        recommended: true,
        statement:
          'Organise code into entities, use cases, and adapters, with all dependencies pointing inward. The domain declares the interfaces it needs and infrastructure implements them.',
        consequences: [
          'Business rules are testable with no database, broker, or HTTP server involved.',
          'Infrastructure can be replaced without touching the rules it serves.',
          'More indirection and more files for a given feature, which is real cost on small systems.',
        ],
        tradeoff: 'Maximum isolation of business rules, paid for in indirection.',
        emits: {
          rules: ['domain-free-of-infrastructure'],
          guidelines: ['layering'],
        },
      },
      {
        value: 'hexagonal',
        label: 'Hexagonal (ports and adapters)',
        statement:
          'Define the application as a core with explicit ports, and connect every external concern through an adapter implementing a port.',
        consequences: [
          'Every external interaction has one named seam, which makes test doubles obvious.',
          'Driving and driven sides are symmetric, so the core has no notion of being called by HTTP or by a queue.',
          'Requires discipline in naming ports, or the adapter layer becomes a dumping ground.',
        ],
        tradeoff: 'The clearest seams for testing, but the port vocabulary has to be maintained deliberately.',
        emits: { rules: ['domain-free-of-infrastructure'], guidelines: ['layering'] },
      },
      {
        value: 'onion',
        label: 'Onion',
        statement: 'Arrange concentric layers around a domain core, with each layer depending only inward.',
        consequences: [
          'A single, easily explained dependency rule.',
          'Layer responsibilities blur over time unless the boundaries are checked automatically.',
        ],
        tradeoff: 'Simple to explain, weaker at naming the seams than ports and adapters.',
        emits: { rules: ['domain-free-of-infrastructure'], guidelines: ['layering'] },
      },
      {
        value: 'layered',
        label: 'Classic layered',
        hint: 'presentation, business, data access',
        statement: 'Use conventional presentation, business, and data-access layers, each depending on the one below.',
        consequences: [
          'Familiar to almost every developer, and cheap to start.',
          'Business logic depends on data access, so testing the rules means having a database or mocking the ORM.',
        ],
        tradeoff: 'Lowest learning cost, but couples business rules to persistence.',
        emits: { guidelines: ['layering'] },
      },
      {
        value: 'none',
        label: 'No enforced layering',
        statement: 'Do not impose a layering scheme; organise by feature and keep files close to where they are used.',
        consequences: [
          'Minimal ceremony, which suits small or short-lived codebases.',
          'No structural defence against IO leaking into business logic.',
        ],
        tradeoff: 'Fastest for small systems, with no protection as the system grows.',
        emits: {},
      },
    ],
  },

  {
    id: 'ddd',
    group: 'design',
    adr: '0210',
    slug: 'domain-driven-design',
    title: 'Domain-driven design',
    question: 'Do you adopt domain-driven design?',
    help: 'Decides whether the code speaks the business\'s language and where consistency boundaries are drawn.',
    context:
      'Domain complexity has to live somewhere. DDD puts it in an explicit model with an agreed vocabulary; without it, that complexity distributes itself across the code as implicit rules.',
    options: [
      {
        value: 'full',
        label: 'Full DDD',
        hint: 'strategic and tactical: bounded contexts, ubiquitous language, aggregates',
        statement:
          'Adopt DDD strategically and tactically: identify bounded contexts, maintain a ubiquitous language, and model with aggregates, entities, and value objects.',
        consequences: [
          'Code, tests, and conversation share one vocabulary, which removes a whole class of misunderstanding.',
          'Aggregate boundaries give a principled answer to transaction scope and, later, to service boundaries.',
          'Requires sustained access to domain experts; without it the model becomes invented rather than discovered.',
        ],
        tradeoff: 'Highest fidelity to the business, and the largest investment in modelling and vocabulary upkeep.',
        emits: {
          guidelines: ['ddd-tactical-patterns', 'ubiquitous-language'],
          glossary: ['bounded-context', 'aggregate', 'command'],
        },
      },
      {
        value: 'tactical',
        label: 'Tactical patterns only',
        hint: 'aggregates and value objects, no strategic mapping',
        recommended: true,
        statement:
          'Use DDD tactical patterns — aggregates, entities, value objects, repositories — without formal context mapping.',
        consequences: [
          'Gets the practical benefits: explicit consistency boundaries and domain types instead of primitives.',
          'Avoids the upfront cost of strategic design workshops.',
          'Without context mapping, term collisions between areas are found late.',
        ],
        tradeoff: 'Most of the modelling value for a fraction of the process, at the cost of vocabulary drift between areas.',
        emits: {
          guidelines: ['ddd-tactical-patterns'],
          glossary: ['aggregate', 'command'],
        },
      },
      {
        value: 'none',
        label: 'No DDD',
        statement: 'Model data and behaviour pragmatically, without adopting DDD patterns or vocabulary.',
        consequences: [
          'Less ceremony and fewer concepts to learn.',
          'Consistency boundaries stay implicit, which becomes expensive once workflows span several entities.',
        ],
        tradeoff: 'Appropriate when the domain is thin; costly when it turns out not to be.',
        emits: {},
      },
    ],
  },

  {
    id: 'design-patterns',
    group: 'design',
    adr: '0220',
    slug: 'design-patterns',
    title: 'Design patterns',
    question: 'Do you use design patterns as shared vocabulary?',
    help: 'Naming a structure makes review shorter; applying patterns speculatively makes code longer.',
    context:
      'Patterns are a naming convention for recurring structures. The decision is whether the team commits to that vocabulary, not whether the structures exist.',
    options: [
      {
        value: 'yes',
        label: 'Yes, as vocabulary',
        recommended: true,
        statement:
          'Use the classic pattern names when a structure genuinely matches one, and name it in the code. Do not design pattern-first.',
        consequences: [
          'Review and onboarding get shorter: one word replaces a paragraph of explanation.',
          'Requires judgement about when a pattern is genuinely present rather than imposed.',
        ],
        tradeoff: 'Shared vocabulary at the cost of a real risk of over-application.',
        emits: { guidelines: ['design-patterns-vocabulary'] },
      },
      {
        value: 'no',
        label: 'No, prefer plain structures',
        statement: 'Prefer the simplest direct structure and describe designs in domain terms rather than pattern names.',
        consequences: [
          'Less indirection, and no temptation to reach for a pattern before the need is clear.',
          'Recurring structures get described from scratch each time they are discussed.',
        ],
        tradeoff: 'Keeps code direct, loses a compact shared vocabulary.',
        emits: {},
      },
    ],
  },

  {
    id: 'dependency-injection',
    group: 'design',
    adr: '0230',
    slug: 'dependency-injection',
    title: 'Dependency injection',
    question: 'How are dependencies wired?',
    help: 'Decides how visible a component\'s coupling is, and how easily it can be substituted in tests.',
    context:
      'Every component needs collaborators. How they arrive determines whether coupling is visible in the signature or hidden in the body.',
    options: [
      {
        value: 'container',
        label: 'DI container',
        statement: 'Wire dependencies through a container that resolves the object graph from declared registrations.',
        consequences: [
          'Wiring is centralised and lifetimes are managed in one place.',
          'The graph becomes implicit: resolution failures surface at runtime, and the container is another thing to learn.',
        ],
        tradeoff: 'Scales to large graphs, at the cost of runtime resolution and a framework dependency.',
        emits: {
          guidelines: [{ slug: 'dependency-injection', vars: { style: 'Register dependencies with the container and resolve only at the composition root.' } }],
        },
      },
      {
        value: 'manual',
        label: 'Manual constructor injection',
        hint: 'compose the graph explicitly at the entry point',
        recommended: true,
        statement: 'Pass dependencies as constructor or function parameters and compose the graph explicitly at the entry point.',
        consequences: [
          'Coupling is visible in every signature, and wiring errors are compile-time or immediate.',
          'No framework involved, and tests substitute a dependency by passing a different value.',
          'The composition root grows and needs deliberate organisation on a large system.',
        ],
        tradeoff: 'Most explicit and easiest to test; the wiring code grows by hand.',
        emits: {
          guidelines: [{ slug: 'dependency-injection', vars: { style: 'Compose the object graph by hand at the entry point; no container.' } }],
        },
      },
      {
        value: 'none',
        label: 'Direct construction',
        statement: 'Construct dependencies where they are used, without an injection scheme.',
        consequences: [
          'Least ceremony for small programs.',
          'Substitution in tests requires module-level patching, which couples tests to implementation detail.',
        ],
        tradeoff: 'Simplest until the first thing needs replacing in a test.',
        emits: {},
      },
    ],
  },

  {
    id: 'error-handling',
    group: 'design',
    adr: '0240',
    slug: 'error-handling',
    title: 'Error handling strategy',
    question: 'How are errors represented?',
    help: 'Decides whether a caller can handle a failure or can only log it.',
    context:
      'Failures cross every layer. Representing them consistently is what allows a caller to branch on a category instead of matching on a message.',
    options: [
      {
        value: 'typed-errors',
        label: 'Typed errors / result values',
        recommended: true,
        statement:
          'Represent expected failures as typed errors or result values that appear in the signature; reserve exceptions for genuinely unexpected conditions.',
        consequences: [
          'Failure paths are visible to the caller and to the compiler where the language allows it.',
          'More explicit plumbing than letting exceptions propagate.',
        ],
        tradeoff: 'Makes failure part of the contract, at the cost of more explicit code on every call.',
        emits: { guidelines: ['error-handling'] },
      },
      {
        value: 'error-codes',
        label: 'Stable error codes',
        statement: 'Raise errors carrying a stable code from a documented catalogue, with a human-readable message alongside.',
        consequences: [
          'Clients and support can branch on a code that survives message rewording and translation.',
          'The catalogue has to be maintained, and drifts if new codes are added ad hoc.',
        ],
        tradeoff: 'Best for external consumers; needs an owned catalogue to stay coherent.',
        emits: { guidelines: ['error-handling'] },
      },
      {
        value: 'exceptions',
        label: 'Idiomatic exceptions',
        statement: 'Use the language\'s exception mechanism, with a small hierarchy of domain exceptions handled at the boundary.',
        consequences: [
          'Least ceremony on the happy path, and idiomatic in most languages.',
          'Failure modes are invisible in signatures, so callers discover them at runtime.',
        ],
        tradeoff: 'Cleanest happy path, weakest contract about what can fail.',
        emits: { guidelines: ['error-handling'] },
      },
    ],
  },

  // ----------------------------------------------------------------------- data
  {
    id: 'persistence',
    group: 'data',
    adr: '0300',
    slug: 'persistence',
    title: 'Primary persistence',
    question: 'What is the primary persistence model?',
    help: 'Decides which queries are cheap, and where consistency guarantees come from.',
    context:
      'The storage model determines which access patterns are natural and which require workarounds, and it is usually the hardest infrastructure choice to reverse once data has accumulated.',
    options: [
      {
        value: 'relational',
        label: 'Relational',
        recommended: true,
        statement: 'Use a relational database as the primary store, with an explicit schema and transactional guarantees.',
        consequences: [
          'Transactions, constraints, and ad-hoc queries come from the engine rather than from application code.',
          'The schema must be migrated deliberately as the model evolves.',
        ],
        tradeoff: 'Strongest guarantees and query flexibility; schema change is a managed process.',
        emits: {
          guidelines: [{ slug: 'persistence-conventions', vars: { style: 'Model an explicit relational schema; let constraints and transactions live in the database.' } }],
        },
      },
      {
        value: 'document',
        label: 'Document',
        statement: 'Use a document store as the primary persistence, keeping each aggregate in one document.',
        consequences: [
          'Storing and loading an aggregate is one operation with no join.',
          'Cross-document consistency and ad-hoc reporting queries become application concerns.',
        ],
        tradeoff: 'Natural fit for aggregate-shaped data; weaker at relationships and reporting.',
        emits: {
          guidelines: [{ slug: 'persistence-conventions', vars: { style: 'Keep one aggregate per document; do not model joins across documents.' } }],
        },
      },
      {
        value: 'key-value',
        label: 'Key-value',
        statement: 'Use a key-value store as the primary persistence, with access by known key.',
        consequences: [
          'Predictable latency and simple horizontal scaling.',
          'Any access pattern other than by key must be maintained as a secondary index by the application.',
        ],
        tradeoff: 'Fastest and simplest at scale, only if every read is by key.',
        emits: {
          guidelines: [{ slug: 'persistence-conventions', vars: { style: 'Design the key space first; every read is by key, and secondary indexes are maintained explicitly.' } }],
        },
      },
      {
        value: 'mixed',
        label: 'Mixed (polyglot)',
        statement: 'Use more than one storage technology, choosing per capability, with one clearly authoritative store per piece of state.',
        consequences: [
          'Each access pattern gets a store that suits it.',
          'More infrastructure to operate, and every duplication of state needs an owner and a synchronisation path.',
        ],
        tradeoff: 'Best fit per use case, most operational surface and the highest risk of divergent copies.',
        emits: {
          guidelines: [{ slug: 'persistence-conventions', vars: { style: 'Name the authoritative store for every piece of state, and derive the rest from it.' } }],
          glossary: ['eventual-consistency'],
        },
      },
      {
        value: 'none',
        label: 'No persistence here',
        hint: 'this repository stores nothing durable of its own',
        statement:
          'Store nothing durable in this repository. Whatever state it needs belongs to a service it calls, to the build that produced it, or to the client.',
        consequences: [
          'Every question that only exists because data is owned — ownership, event sourcing, read models, migrations — is retired rather than answered nominally.',
          'There is no schema to migrate and no backup to own, so deployment is a file copy and a rollback is the previous one.',
          'The first feature that has to remember something reopens this decision, and it should: a store acquired quietly is how a site ends up with a database nobody planned.',
        ],
        tradeoff: 'Nothing to operate and nothing to migrate; the moment something must be remembered, this decision comes back.',
        emits: {},
      },
    ],
  },

  {
    id: 'data-ownership',
    group: 'data',
    adr: '0310',
    slug: 'data-ownership',
    title: 'Data ownership across services',
    question: 'How is data owned across services?',
    help: 'The single decision that determines whether services can actually be deployed independently.',
    context:
      'Independent deployment is possible only when services do not share a schema. Whatever the intention, a shared database makes the boundary decorative.',
    when: (answers) => isDistributed(answers) && persists(answers),
    options: [
      {
        value: 'db-per-service',
        label: 'Database per service',
        recommended: true,
        statement: 'Each service owns a private schema that no other service may read or write directly.',
        consequences: [
          'Each service migrates and scales its storage independently.',
          'Data needed by several services is obtained through APIs or replicated by events, and is eventually consistent.',
          'Queries that would have been a join become an orchestration or a maintained projection.',
        ],
        tradeoff: 'The only ownership model that makes independent deployment real; joins across boundaries stop being free.',
        emits: {
          rules: ['no-cross-service-db', 'service-owns-its-data'],
          glossary: ['eventual-consistency'],
        },
      },
      {
        value: 'shared-db',
        label: 'Shared database',
        statement: 'Services share a database, with table ownership documented rather than enforced.',
        consequences: [
          'Joins and transactions across capabilities stay available.',
          'A schema change becomes a coordinated release across every service that reads the table.',
          'Services are independently deployable in name only.',
        ],
        tradeoff: 'Keeps queries and transactions simple, and gives up the independence that motivated splitting.',
        emits: { rules: ['forward-only-migrations'] },
      },
    ],
  },

  {
    id: 'event-sourcing',
    group: 'data',
    adr: '0320',
    slug: 'event-sourcing',
    title: 'Event sourcing',
    question: 'Do you use event sourcing?',
    help: 'Storing every change instead of the current state buys a complete history and costs you queryability.',
    context:
      'Persisting current state discards how it was reached. Event sourcing keeps the full sequence as the system of record and derives state from it, which is powerful and materially more expensive.',
    when: persists,
    options: [
      {
        value: 'yes',
        label: 'Yes, events are the system of record',
        statement:
          'Persist state changes as an append-only sequence of domain events. Current state is derived by replaying them, and read models are projections that can be rebuilt at any time.',
        consequences: [
          'Complete, auditable history: any past state can be reconstructed, and new read models can be backfilled from day one.',
          'Event schemas are permanent — every shape needs a versioning and upcasting strategy.',
          'Reads require a projection, and projections lag behind writes.',
          'Onboarding is slower: the model is unfamiliar to most developers.',
        ],
        tradeoff: 'Unmatched auditability and temporal query power, paid for with permanent schemas and no ad-hoc queries.',
        emits: {
          rules: ['events-are-immutable'],
          guidelines: ['event-design-and-versioning', 'projection-rebuilds'],
          runbooks: ['rebuild-projections'],
          glossary: ['event-store', 'projection', 'read-model'],
        },
      },
      {
        value: 'no',
        label: 'No, store current state',
        recommended: true,
        statement: 'Persist current state directly. Where history matters, keep a purpose-built audit log alongside it.',
        consequences: [
          'Reads are direct queries, and the model is familiar to everyone.',
          'History is limited to what the audit log deliberately captures.',
        ],
        tradeoff: 'Simplest and most queryable; past states are gone unless something explicitly recorded them.',
        emits: {},
      },
    ],
  },

  {
    id: 'cqrs',
    group: 'data',
    adr: '0330',
    slug: 'cqrs',
    title: 'Command-query separation of models',
    question: 'Do you separate read and write models (CQRS)?',
    help: 'Separating the paths lets each be shaped for its job; it also means reads are behind writes.',
    context:
      'Reads and writes have different shapes, different volumes, and different consistency needs. Serving both from one model is simple until one of those diverges enough to hurt.',
    when: persists,
    options: [
      {
        value: 'full',
        label: 'Full CQRS',
        hint: 'separate models and separate stores',
        statement:
          'Separate command and query responsibilities into distinct models with distinct stores, kept in sync by events.',
        consequences: [
          'Each side is modelled and scaled for its own access pattern.',
          'Reads are eventually consistent, and the interface has to expose that honestly.',
          'Two models to keep coherent, and a synchronisation path to operate.',
        ],
        tradeoff: 'Maximum flexibility per side, with eventual consistency and duplicated modelling as the price.',
        emits: {
          rules: ['no-writes-through-read-models'],
          guidelines: ['command-query-separation'],
          glossary: ['read-model', 'command', 'eventual-consistency'],
        },
      },
      {
        value: 'read-model-only',
        label: 'Separate read models, one store',
        hint: 'purpose-built queries, no second database',
        recommended: true,
        statement:
          'Keep one authoritative store, but model queries separately from commands — dedicated query objects and view shapes rather than reusing write entities.',
        consequences: [
          'Query shapes fit their consumers without introducing a second store or eventual consistency.',
          'Reads and writes still contend on the same store, so extreme read scale needs another answer later.',
        ],
        tradeoff: 'Most of the modelling benefit with none of the consistency cost; no independent read scaling.',
        emits: {
          guidelines: ['command-query-separation'],
          glossary: ['read-model'],
        },
      },
      {
        value: 'no',
        label: 'No, one model for both',
        statement: 'Use a single model for reads and writes.',
        consequences: [
          'Least code and one place to change when the model evolves.',
          'Query needs distort the write model over time, or vice versa.',
        ],
        tradeoff: 'Simplest by a wide margin; the single model degrades as read and write needs diverge.',
        emits: {},
      },
    ],
  },

  {
    id: 'distributed-transactions',
    group: 'data',
    adr: '0340',
    slug: 'distributed-transactions',
    title: 'Consistency across boundaries',
    question: 'How do you keep state consistent across boundaries?',
    help: 'Once a workflow crosses a boundary there is no shared transaction. This decides what replaces it.',
    context:
      'A change spanning two owners cannot be atomic. What remains is a choice about where the coordination lives and how partial failure is repaired.',
    when: (answers) => isDistributed(answers) && persists(answers),
    options: [
      {
        value: 'outbox',
        label: 'Transactional outbox',
        hint: 'atomic state change plus message, no orchestration',
        recommended: true,
        statement:
          'Write outbound messages to an outbox table in the same transaction as the state change, and publish them from a relay.',
        consequences: [
          'A state change and its announcement can no longer disagree, without a distributed transaction.',
          'Delivery is at-least-once, so every consumer must be idempotent.',
          'Adds an outbox table and a relay process to operate.',
        ],
        tradeoff: 'Solves the lost-message problem with minimal machinery; does not coordinate multi-step workflows.',
        emits: {
          rules: ['outbox-for-cross-service-writes'],
          runbooks: ['replay-failed-messages'],
          glossary: ['outbox', 'eventual-consistency'],
        },
      },
      {
        value: 'saga-orchestration',
        label: 'Orchestrated saga',
        hint: 'a coordinator drives the steps',
        statement:
          'Model cross-boundary workflows as sagas driven by an explicit coordinator that invokes each step and its compensation.',
        consequences: [
          'The workflow exists in one readable place, and its state is inspectable when it stalls.',
          'The coordinator is a dependency of the whole process and needs its own availability story.',
        ],
        tradeoff: 'Clearest view of a multi-step process, at the cost of a central component the process depends on.',
        emits: {
          rules: ['outbox-for-cross-service-writes'],
          guidelines: ['saga-design'],
          glossary: ['saga', 'outbox', 'eventual-consistency'],
        },
      },
      {
        value: 'saga-choreography',
        label: 'Choreographed saga',
        hint: 'each participant reacts to events',
        statement:
          'Let each participant react to events and emit its own, with compensation handled locally by each step.',
        consequences: [
          'No central coordinator, so participants stay loosely coupled.',
          'The overall workflow exists nowhere explicitly, which makes it hard to see and harder to debug.',
        ],
        tradeoff: 'Loosest coupling; the process becomes emergent and difficult to reason about end to end.',
        emits: {
          rules: ['outbox-for-cross-service-writes'],
          guidelines: ['saga-design'],
          glossary: ['saga', 'outbox', 'eventual-consistency'],
        },
      },
      {
        value: 'none',
        label: 'Avoid cross-boundary transactions',
        statement:
          'Design boundaries so that no workflow needs to change state on both sides of one, and revisit the boundary when one does.',
        consequences: [
          'No coordination machinery at all.',
          'Constrains how boundaries may be drawn, and does not survive a requirement that genuinely spans two owners.',
        ],
        tradeoff: 'By far the simplest, and only viable while boundaries can absorb the constraint.',
        emits: {},
      },
    ],
  },

  {
    id: 'migrations',
    group: 'data',
    adr: '0350',
    slug: 'schema-migrations',
    title: 'Schema migration policy',
    question: 'How are schema changes managed?',
    help: 'Decides whether a deploy can be rolled back after the schema has moved.',
    context:
      'Schema and code are deployed on different mechanisms but must agree at every moment, including during a rollback. The migration policy is what keeps that true.',
    when: persists,
    options: [
      {
        value: 'versioned-forward-only',
        label: 'Versioned, forward-only',
        hint: 'expand then contract; fix mistakes with a new migration',
        recommended: true,
        statement:
          'Every schema change is a numbered, committed migration applied in order and never edited afterwards. Changes are additive first, so old and new code both work against the live schema; removal happens in a later release.',
        consequences: [
          'A deploy can be rolled back without touching the schema, because the previous code still works against it.',
          'CI can apply the full history to an empty database and prove it reproduces the schema.',
          'A destructive change takes two releases instead of one.',
        ],
        tradeoff: 'The only policy that makes rollback safe; every removal costs an extra release.',
        emits: {
          rules: ['forward-only-migrations'],
          guidelines: ['migration-workflow'],
          runbooks: ['database-migration-failure'],
        },
      },
      {
        value: 'up-down',
        label: 'Reversible up/down migrations',
        statement: 'Each migration ships with a down script that reverses it.',
        consequences: [
          'A schema change can be reverted in place in development.',
          'Down scripts are rarely exercised and often cannot restore data the up script dropped, so they are unreliable in production.',
        ],
        tradeoff: 'Convenient locally; the reversibility guarantee is largely illusory once data exists.',
        emits: {
          guidelines: ['migration-workflow'],
          runbooks: ['database-migration-failure'],
        },
      },
      {
        value: 'none',
        label: 'No migration tooling',
        hint: 'schemaless store, or schema applied by hand',
        statement: 'Do not use migration tooling: the store is schemaless, or schema changes are applied manually and documented.',
        consequences: [
          'Nothing to set up.',
          'No record of how an environment reached its current shape, and no way to reproduce it.',
        ],
        tradeoff: 'Zero setup, zero reproducibility.',
        emits: {},
      },
    ],
  },

  // -------------------------------------------------------------------- quality
  {
    id: 'clean-code',
    group: 'quality',
    adr: '0400',
    slug: 'clean-code',
    title: 'Clean Code practices',
    question: 'Do you adopt Clean Code practices?',
    help: 'Sets the shared bar for naming, function size, comments, and nesting — the things review argues about most.',
    context:
      'Readability standards are only worth anything if they are shared. Writing them down turns a matter of taste into a reviewable expectation.',
    options: [
      {
        value: 'yes',
        label: 'Yes',
        recommended: true,
        statement:
          'Adopt Clean Code practices as active guidelines: intention-revealing names, small single-purpose functions, comments that explain why, and shallow nesting.',
        consequences: [
          'Review has a shared reference, so style feedback stops being a matter of opinion.',
          'Some changes cost more upfront, in extraction and renaming.',
          'Taken dogmatically it produces excessive fragmentation, so the guidelines stay guidelines rather than rules.',
        ],
        tradeoff: 'A shared readability bar; applied without judgement it fragments code into too many pieces.',
        emits: {
          guidelines: [
            'naming-conventions',
            'small-single-purpose-functions',
            'comments-explain-why',
            'reduce-nesting',
            'performance',
            'ai-agent-changes',
          ],
        },
      },
      {
        value: 'no',
        label: 'No explicit standard',
        statement: 'Do not adopt a named readability standard; rely on review judgement.',
        consequences: [
          'No document to maintain.',
          'Style discussions recur per pull request with no reference to settle them.',
        ],
        tradeoff: 'Nothing to maintain, and nothing to point at in review.',
        emits: {},
      },
    ],
  },

  {
    id: 'solid',
    group: 'quality',
    adr: '0410',
    slug: 'solid-principles',
    title: 'SOLID principles',
    question: 'Do you apply SOLID principles?',
    help: 'A review lens for coupling. Useful as a diagnosis, harmful as a checklist.',
    context:
      'SOLID names five recurring sources of expensive change. Adopting it explicitly gives review a vocabulary for coupling problems.',
    options: [
      {
        value: 'yes',
        label: 'Yes',
        recommended: true,
        statement: 'Apply SOLID as a design and review lens, invoked when coupling is the actual problem.',
        consequences: [
          'Gives reviewers precise language for why a change is expensive.',
          'Applied mechanically it produces interfaces with one implementation and needless indirection.',
        ],
        tradeoff: 'Sharp diagnostic vocabulary; degrades into ceremony when treated as a checklist.',
        emits: { guidelines: ['solid-principles'] },
      },
      {
        value: 'no',
        label: 'No',
        statement: 'Do not adopt SOLID as an explicit standard.',
        consequences: [
          'Avoids speculative abstraction introduced to satisfy a principle.',
          'Coupling problems get discussed case by case, without shared terms.',
        ],
        tradeoff: 'Less ceremony, weaker vocabulary for design review.',
        emits: {},
      },
    ],
  },

  {
    id: 'complexity-budget',
    group: 'quality',
    adr: '0420',
    slug: 'complexity-budget',
    title: 'Complexity budget',
    question: 'Do you enforce a complexity limit?',
    help: 'Turns "this function feels tangled" into a number CI can check.',
    context:
      'Cyclomatic complexity correlates with defect density and review effort. A published limit makes the trade-off explicit instead of per-reviewer.',
    options: [
      {
        value: 'strict',
        label: 'Strict (limit 10)',
        statement: 'Fail the build when any function exceeds a cyclomatic complexity of 10.',
        consequences: [
          'Forces early extraction and keeps functions individually testable.',
          'Some inherently branchy code — parsers, validators, state machines — needs justified exemptions.',
        ],
        tradeoff: 'Strongest pressure toward small units; needs an exemption mechanism for legitimately branchy code.',
        emits: { rules: [{ slug: 'complexity-budget', vars: { limit: '10' } }], guidelines: ['reduce-nesting'] },
      },
      {
        value: 'moderate',
        label: 'Moderate (limit 15)',
        recommended: true,
        statement: 'Fail the build when any function exceeds a cyclomatic complexity of 15.',
        consequences: [
          'Catches genuinely tangled functions while leaving ordinary branching alone.',
          'Permits some functions that are still harder to read than they need to be.',
        ],
        tradeoff: 'Catches the outliers with few false positives; tolerates mid-range complexity.',
        emits: { rules: [{ slug: 'complexity-budget', vars: { limit: '15' } }], guidelines: ['reduce-nesting'] },
      },
      {
        value: 'none',
        label: 'No limit',
        statement: 'Do not enforce a complexity limit; rely on review.',
        consequences: [
          'No exemption bureaucracy.',
          'Complexity growth is invisible until someone happens to notice it.',
        ],
        tradeoff: 'No friction, no signal.',
        emits: {},
      },
    ],
  },

  {
    id: 'lint-format',
    group: 'quality',
    adr: '0430',
    slug: 'lint-and-format',
    title: 'Lint and format enforcement',
    question: 'How are formatting and linting enforced?',
    help: 'Decides whether style is a machine\'s job or a reviewer\'s.',
    context:
      'Formatting and lint findings are mechanical. Where they are checked decides whether they consume review attention.',
    options: [
      {
        value: 'ci-enforced',
        label: 'Enforced in CI',
        recommended: true,
        statement: 'Run formatter and linter as blocking CI checks, reproducible locally with a single command.',
        consequences: [
          'Style disappears from review entirely.',
          'The whole repository must be brought into compliance once, and the ruleset needs an owner.',
        ],
        tradeoff: 'Removes an entire category of review comment; costs one large normalisation commit.',
        emits: {
          rules: ['lint-format-ci'],
          guidelines: ['quality-bar'],
        },
      },
      {
        value: 'local-only',
        label: 'Local only',
        hint: 'editor and pre-commit, not blocking',
        statement: 'Configure formatter and linter to run locally on save and pre-commit, without a blocking CI gate.',
        consequences: [
          'Immediate feedback with no pipeline time.',
          'Compliance depends on local setup, so it drifts between contributors.',
        ],
        tradeoff: 'Fast feedback, no guarantee.',
        emits: { guidelines: ['quality-bar'] },
      },
      {
        value: 'none',
        label: 'Not enforced',
        statement: 'Do not enforce automated formatting or linting.',
        consequences: [
          'No tooling to configure.',
          'Style is inconsistent and diffs carry unrelated reformatting noise.',
        ],
        tradeoff: 'Nothing to set up; noisy diffs forever.',
        emits: {},
      },
    ],
  },

  // -------------------------------------------------------------------- testing
  {
    id: 'tdd',
    group: 'testing',
    adr: '0500',
    slug: 'test-driven-development',
    title: 'Test-driven development',
    question: 'Do you practise TDD?',
    help: 'Decides whether tests specify behaviour or describe code that already exists.',
    context:
      'When tests are written relative to the code determines what they are worth: written first they specify behaviour and shape the design, written after they tend to confirm the implementation, bugs included.',
    options: [
      {
        value: 'strict',
        label: 'Strict TDD',
        hint: 'no production code before a failing test',
        statement: 'Write a failing test before any production code, for features and fixes alike. Red, green, refactor.',
        consequences: [
          'Continuous design pressure toward testable, loosely coupled units.',
          'Tests describe behaviour, so refactoring does not rewrite them.',
          'Slower at the start, and genuinely awkward for exploratory or UI-heavy work.',
        ],
        tradeoff: 'Highest design and regression value; the most demanding discipline to sustain.',
        emits: {
          rules: ['test-first', 'regression-test-for-every-fix'],
          guidelines: ['tdd-loop'],
        },
      },
      {
        value: 'pragmatic',
        label: 'Pragmatic',
        hint: 'test-first for logic and fixes, after for exploratory work',
        recommended: true,
        statement:
          'Write tests first for domain logic and for every bug fix; allow tests after the fact for exploratory or presentation code. Every change ships with tests.',
        consequences: [
          'Keeps the design benefit where logic is dense, without forcing it on spikes and UI wiring.',
          'The line between the two modes is a judgement call and needs review attention.',
        ],
        tradeoff: 'Most of the value where it counts; the boundary is a matter of judgement.',
        emits: {
          rules: ['regression-test-for-every-fix'],
          guidelines: ['tdd-loop'],
        },
      },
      {
        value: 'no',
        label: 'Tests after implementation',
        statement: 'Write tests after the implementation, focused on covering the delivered behaviour.',
        consequences: [
          'No change to how people already work.',
          'Tests tend to mirror the implementation, so they miss the cases the author had not considered and resist refactoring.',
        ],
        tradeoff: 'Zero adoption cost; the tests protect the code rather than the behaviour.',
        emits: { rules: ['regression-test-for-every-fix'] },
      },
    ],
  },

  {
    id: 'test-pyramid',
    group: 'testing',
    adr: '0510',
    slug: 'test-distribution',
    title: 'Test distribution',
    question: 'How are tests distributed across levels?',
    help: 'Decides how fast the suite is and how much of the real system it exercises.',
    context:
      'Every level trades fidelity for speed. The distribution decides how quickly a red build appears and how much confidence it carries.',
    options: [
      {
        value: 'pyramid',
        label: 'Pyramid',
        hint: 'many unit, some integration, few end-to-end',
        recommended: true,
        statement: 'Weight the suite toward unit tests, with a smaller integration layer and a few end-to-end paths.',
        consequences: [
          'Fast feedback and precise failure localisation.',
          'Integration mistakes between correctly-unit-tested parts can slip through.',
        ],
        tradeoff: 'Fastest and most diagnosable; weakest at catching wiring errors.',
        emits: {
          guidelines: [{ slug: 'testing-strategy', vars: { strategy: 'Weight the suite toward unit tests, with a smaller integration layer and a few end-to-end paths covering the critical journeys.' } }],
        },
      },
      {
        value: 'trophy',
        label: 'Testing trophy',
        hint: 'integration-heavy, unit tests for pure logic',
        statement: 'Weight the suite toward integration tests, using unit tests for pure logic and a few end-to-end paths.',
        consequences: [
          'Tests exercise components as they are actually wired, catching interface mistakes.',
          'Slower, and a failure points at a larger area.',
        ],
        tradeoff: 'Closer to real behaviour; slower and less precise when it fails.',
        emits: {
          guidelines: [{ slug: 'testing-strategy', vars: { strategy: 'Weight the suite toward integration tests that exercise real wiring, keeping unit tests for pure logic.' } }],
        },
      },
      {
        value: 'e2e-heavy',
        label: 'End-to-end first',
        statement: 'Rely primarily on end-to-end tests through the real interface, with unit tests only where logic is intricate.',
        consequences: [
          'Directly verifies what a user experiences.',
          'Slow, flakier, and expensive to diagnose; poor fit for a per-commit gate.',
        ],
        tradeoff: 'Highest fidelity, worst feedback loop.',
        emits: {
          guidelines: [{ slug: 'testing-strategy', vars: { strategy: 'Cover behaviour end to end through the real interface, adding unit tests where logic is intricate.' } }],
        },
      },
    ],
  },

  {
    id: 'coverage-gate',
    group: 'testing',
    adr: '0520',
    slug: 'coverage-gate',
    title: 'Coverage gate',
    question: 'Do you gate the build on test coverage?',
    help: 'A ratchet against untested code landing quietly. It measures execution, not correctness.',
    context:
      'Coverage cannot show that behaviour is verified, only that a line ran. As a threshold it still serves one purpose: making a reduction in tested surface a deliberate act.',
    options: [
      {
        value: 'high',
        label: 'Yes, 80%',
        statement: 'Fail the build when coverage on changed code falls below 80%.',
        consequences: [
          'Untested code cannot land unnoticed.',
          'Invites tests written to raise a number, so review still has to look at assertion quality.',
        ],
        tradeoff: 'Strong ratchet; rewards the metric rather than the intent if review does not compensate.',
        emits: {
          rules: [{ slug: 'coverage-gate', vars: { threshold: '80' } }],
          glossary: ['coverage-gate'],
        },
      },
      {
        value: 'moderate',
        label: 'Yes, 60%',
        recommended: true,
        statement: 'Fail the build when coverage on changed code falls below 60%.',
        consequences: [
          'Catches genuinely untested changes without pushing toward filler tests.',
          'Leaves room for meaningful gaps to persist.',
        ],
        tradeoff: 'A floor rather than a target; tolerates real gaps.',
        emits: {
          rules: [{ slug: 'coverage-gate', vars: { threshold: '60' } }],
          glossary: ['coverage-gate'],
        },
      },
      {
        value: 'none',
        label: 'No gate',
        statement: 'Measure and report coverage without gating the build on it.',
        consequences: [
          'No incentive to write tests for the metric\'s sake.',
          'A drop in tested surface is visible only if someone looks at the report.',
        ],
        tradeoff: 'No perverse incentive, no floor.',
        emits: {},
      },
    ],
  },

  {
    id: 'contract-testing',
    group: 'testing',
    adr: '0530',
    slug: 'contract-testing',
    title: 'Contract testing',
    question: 'Do you use consumer-driven contract tests?',
    help: 'Moves integration breakage from the consumer\'s runtime to the provider\'s build.',
    context:
      'Independently deployed components cannot be integration-tested together on every commit. Contracts give the provider a machine-checked list of what it may not break.',
    when: isDistributed,
    options: [
      {
        value: 'yes',
        label: 'Yes',
        recommended: true,
        statement:
          'Consumers publish the subset of each interface they rely on, and providers verify every published contract in their own pipeline.',
        consequences: [
          'A provider learns at build time which consumer it would break.',
          'No need to run consumers and providers together to get integration confidence.',
          'Requires a broker and contract discipline on both sides.',
        ],
        tradeoff: 'The cheapest reliable cross-boundary safety net; needs infrastructure and buy-in from both sides.',
        emits: {
          rules: ['consumer-contract-required'],
          guidelines: ['contract-tests'],
          glossary: ['contract-test'],
        },
      },
      {
        value: 'no',
        label: 'No',
        statement: 'Rely on end-to-end tests in a shared environment to catch integration problems.',
        consequences: [
          'Nothing extra to set up or maintain.',
          'Breakage is found late, in an environment shared by everyone, and often by the consumer.',
        ],
        tradeoff: 'No setup cost; failures surface at the worst possible point.',
        emits: {},
      },
    ],
  },

  {
    id: 'mutation-testing',
    group: 'testing',
    adr: '0540',
    slug: 'mutation-testing',
    title: 'Mutation testing',
    question: 'Do you run mutation testing?',
    help: 'The only cheap way to find tests that execute code without asserting anything about it.',
    context:
      'Coverage proves a line ran. Mutation testing proves something checked what it did, by introducing faults and seeing whether the suite notices.',
    options: [
      {
        value: 'yes',
        label: 'Yes, on core logic',
        statement: 'Run mutation testing on the domain layer on a schedule, and treat a surviving mutant as a missing assertion.',
        consequences: [
          'Finds tests that execute code without verifying it — invisible to coverage.',
          'Runtime is high, so it belongs on a schedule rather than on every commit, and is scoped to the domain.',
        ],
        tradeoff: 'The strongest available signal about test quality, and the most expensive to run.',
        emits: {
          guidelines: ['mutation-testing'],
          glossary: ['mutation-score'],
        },
      },
      {
        value: 'no',
        label: 'No',
        recommended: true,
        statement: 'Do not run mutation testing; rely on review to judge assertion quality.',
        consequences: [
          'No additional pipeline time or tooling.',
          'Tests that assert nothing meaningful are found only by a reader.',
        ],
        tradeoff: 'Nothing to run; test quality stays unmeasured.',
        emits: {},
      },
    ],
  },

  // ------------------------------------------------------------------- security
  {
    id: 'secret-management',
    group: 'security',
    adr: '0600',
    slug: 'secret-management',
    title: 'Secret management',
    question: 'Where do secrets come from at runtime?',
    help: 'Decides whether rotating a credential needs a deploy.',
    context:
      'Secrets must reach the process without being committed. Where they come from decides how rotation, auditing, and per-environment values work.',
    options: [
      {
        value: 'secret-manager',
        label: 'Managed secret store',
        recommended: true,
        statement: 'Load secrets at startup from a managed secret store, with per-environment values and access recorded.',
        consequences: [
          'Rotation, versioning, and access audit come from the platform.',
          'Rotation does not require a redeploy.',
          'Adds a runtime dependency and a local-development story to solve.',
        ],
        tradeoff: 'Proper rotation and audit, at the cost of another dependency at startup.',
        emits: {
          rules: ['no-secrets', { slug: 'secrets-from-managed-store', vars: { source: 'the managed secret store' } }],
          guidelines: ['secret-handling'],
          runbooks: ['rotate-credentials'],
          glossary: ['secret'],
        },
      },
      {
        value: 'env-vars',
        label: 'Environment variables',
        statement: 'Inject secrets as environment variables provided by the deployment platform, with a committed `.env.example` naming each one.',
        consequences: [
          'Works everywhere with no runtime dependency, and is trivial locally.',
          'Values are visible to anything that can read the process environment, and rotation means a redeploy.',
          'No audit trail of who read what.',
        ],
        tradeoff: 'Simplest possible mechanism; rotation and auditing are manual.',
        emits: {
          rules: ['no-secrets', { slug: 'secrets-from-managed-store', vars: { source: 'the process environment' } }],
          guidelines: ['secret-handling'],
          runbooks: ['rotate-credentials'],
          glossary: ['secret'],
        },
      },
    ],
  },

  {
    id: 'boundary-validation',
    group: 'security',
    adr: '0610',
    slug: 'boundary-validation',
    title: 'Input validation',
    question: 'How is external input validated?',
    help: 'Decides whether the core can trust its inputs.',
    context:
      'Everything entering the system from outside is untrusted. Where and how it is validated decides whether the rest of the code can assume valid data.',
    options: [
      {
        value: 'schema',
        label: 'Schema validation at the boundary',
        recommended: true,
        statement:
          'Declare a schema for every external input and validate against it at the boundary, rejecting anything that does not conform before it reaches domain code.',
        consequences: [
          'Domain code can assume valid, typed input.',
          'The schema doubles as documentation of the accepted shape.',
          'Schemas must be kept in step with the interface they describe.',
        ],
        tradeoff: 'Strongest guarantee and free documentation; one more artifact to keep current.',
        emits: {
          rules: ['validate-external-input'],
          guidelines: ['error-handling'],
        },
      },
      {
        value: 'manual',
        label: 'Manual checks',
        statement: 'Validate inputs with explicit checks written where they are used.',
        consequences: [
          'No dependency, and checks can encode domain rules a schema cannot express.',
          'Coverage is uneven, and a missed field is invisible until it causes a failure.',
        ],
        tradeoff: 'Maximum flexibility, no systematic guarantee.',
        emits: { rules: ['validate-external-input'] },
      },
    ],
  },

  {
    id: 'authn',
    group: 'security',
    adr: '0620',
    slug: 'authentication',
    title: 'Authentication model',
    question: 'How are callers authenticated?',
    help: 'Decides where identity comes from and how revocation works.',
    context:
      'Every entry point needs to know who is calling. The mechanism determines how sessions are revoked and how identity travels between components.',
    options: [
      {
        value: 'oauth2-oidc',
        label: 'OAuth 2 / OpenID Connect',
        recommended: true,
        statement: 'Delegate authentication to an OAuth 2 / OIDC provider and authorise using the tokens it issues.',
        consequences: [
          'Credential handling, multi-factor, and federation are the provider\'s problem, not ours.',
          'Standard token format that other services can verify independently.',
          'Adds an external dependency in the login path, and token lifetimes must be chosen deliberately.',
        ],
        tradeoff: 'Least credential risk carried in-house; an external dependency on the critical path.',
        emits: {
          rules: ['authn-on-every-endpoint', 'least-privilege'],
          guidelines: [{ slug: 'authn-authz-implementation', vars: { style: 'Verify the provider-issued token at the boundary and derive the principal from its claims.' } }],
          glossary: ['principal'],
        },
      },
      {
        value: 'jwt',
        label: 'Self-issued JWTs',
        statement: 'Issue signed JWTs ourselves and verify them statelessly at each entry point.',
        consequences: [
          'Verification needs no shared session store, which suits distributed components.',
          'Revocation before expiry requires a deny list, which reintroduces shared state.',
          'Key rotation and claim design become our responsibility.',
        ],
        tradeoff: 'Stateless and easy to distribute; revocation is the hard part.',
        emits: {
          rules: ['authn-on-every-endpoint', 'least-privilege'],
          guidelines: [{ slug: 'authn-authz-implementation', vars: { style: 'Verify the signature and claims at the boundary; keep token lifetimes short so revocation stays tractable.' } }],
          glossary: ['principal'],
        },
      },
      {
        value: 'sessions',
        label: 'Server-side sessions',
        statement: 'Authenticate with server-side sessions referenced by an opaque cookie.',
        consequences: [
          'Immediate revocation, and no claims exposed to the client.',
          'Requires a shared session store, which every entry point must reach.',
        ],
        tradeoff: 'Simplest correct revocation; needs shared state.',
        emits: {
          rules: ['authn-on-every-endpoint', 'least-privilege'],
          guidelines: [{ slug: 'authn-authz-implementation', vars: { style: 'Resolve the session at the boundary and pass the principal inward; never trust a client-supplied identity.' } }],
          glossary: ['principal'],
        },
      },
      {
        value: 'none',
        label: 'No authentication',
        hint: 'internal tool, or a trusted network boundary',
        statement: 'Do not authenticate callers: access is controlled entirely at the network boundary.',
        consequences: [
          'Nothing to build.',
          'Any access to the network is full access to the system, and there is no audit trail of who acted.',
        ],
        tradeoff: 'Valid only while the network boundary is genuinely the security boundary.',
        emits: {},
      },
    ],
  },

  {
    id: 'pii-logging',
    group: 'security',
    adr: '0630',
    slug: 'personal-data-in-logs',
    title: 'Personal data in logs',
    question: 'How strictly is personal data kept out of logs?',
    help: 'Logs are copied further, kept longer, and read more widely than the database they came from.',
    context:
      'Diagnostics need context, and context is where personal data leaks. Logs are also the store least covered by retention and deletion processes.',
    options: [
      {
        value: 'strict',
        label: 'Strict, with scrubbing',
        recommended: true,
        statement:
          'Never log personal data or credentials. The shared logger scrubs known-sensitive keys, and only pseudonymous identifiers are recorded.',
        consequences: [
          'Log stores stay outside the scope of personal-data handling, which simplifies retention and deletion.',
          'Debugging sometimes needs a correlation identifier to be traced back through another system.',
        ],
        tradeoff: 'Cleanest compliance position; occasionally slower debugging.',
        emits: {
          rules: ['no-pii-in-logs'],
          glossary: ['personal-data'],
        },
      },
      {
        value: 'advisory',
        label: 'Advisory',
        statement: 'Discourage logging personal data through review, without an automated scrubber.',
        consequences: [
          'Nothing to build, and full context available when debugging.',
          'Personal data reaches long-lived log stores, which brings them into scope for deletion requests.',
        ],
        tradeoff: 'Maximum debuggability; the log store becomes a compliance liability.',
        emits: { glossary: ['personal-data'] },
      },
    ],
  },

  {
    id: 'dependency-scanning',
    group: 'security',
    adr: '0640',
    slug: 'dependency-scanning',
    title: 'Dependency scanning',
    question: 'How do you handle vulnerable dependencies?',
    help: 'Most exploited vulnerabilities are already public and already fixed upstream.',
    context:
      'Third-party code is the majority of most deployments. The question is how fast a published advisory turns into an upgrade.',
    options: [
      {
        value: 'ci-blocking',
        label: 'Blocking in CI',
        recommended: true,
        statement: 'Fail the build on a known high or critical advisory. Suppressions are time-boxed and justified in the repository.',
        consequences: [
          'Upgrade time is bounded by the pipeline rather than by attention.',
          'A new advisory can block unrelated work, so the suppression path must be usable.',
        ],
        tradeoff: 'Shortest exposure window; occasionally blocks work for an unrelated reason.',
        emits: { rules: ['dependency-scan-blocking'] },
      },
      {
        value: 'advisory',
        label: 'Reported, not blocking',
        statement: 'Report advisories on a schedule and triage them as ordinary work.',
        consequences: [
          'No unrelated build failures.',
          'Exposure lasts as long as the backlog does.',
        ],
        tradeoff: 'No interruption; unbounded exposure window.',
        emits: {},
      },
      {
        value: 'none',
        label: 'Not scanned',
        statement: 'Do not scan dependencies for known vulnerabilities.',
        consequences: [
          'Nothing to configure.',
          'Vulnerable dependencies are discovered from outside, if at all.',
        ],
        tradeoff: 'No effort, no visibility.',
        emits: {},
      },
    ],
  },

  {
    id: 'compliance',
    group: 'security',
    adr: '0650',
    slug: 'compliance-regime',
    title: 'Compliance regime',
    question: 'Does a compliance regime apply?',
    help: 'Turns legal obligations into constraints the code and the review can actually check.',
    context:
      'A regulatory obligation that is not written down as a technical constraint is discovered during an audit rather than during review.',
    options: [
      {
        value: 'gdpr',
        label: 'GDPR',
        statement:
          'Treat the GDPR as binding: every personal data field has a recorded purpose, lawful basis, and retention period, and export and erasure are supported.',
        consequences: [
          'Data minimisation and retention become design constraints, which also shrinks breach impact.',
          'Adding a personal data field requires a documented purpose.',
          'Erasure and export have to work across every store, including backups and logs.',
        ],
        tradeoff: 'Legally required where it applies, and a real constraint on data design.',
        emits: {
          rules: ['gdpr-data-minimisation', 'no-pii-in-logs', 'least-privilege'],
          glossary: ['personal-data', 'retention-period'],
        },
      },
      {
        value: 'none',
        label: 'None specific',
        recommended: true,
        statement: 'No specific compliance regime applies; follow the repository\'s general security rules.',
        consequences: [
          'No compliance-specific process.',
          'If a regime later applies, retrofitting purpose and retention onto existing data is expensive.',
        ],
        tradeoff: 'No overhead now; retrofitting later is the expensive path.',
        emits: {},
      },
    ],
  },

  // -------------------------------------------------------------- observability
  {
    id: 'structured-logging',
    group: 'observability',
    adr: '0700',
    slug: 'structured-logging',
    title: 'Structured logging',
    question: 'Are logs structured?',
    help: 'Decides whether logs can be queried during an incident or only read.',
    context:
      'Logs are the first thing consulted in an incident. Their format decides whether they can be filtered and aggregated or only searched as text.',
    options: [
      {
        value: 'yes',
        label: 'Yes',
        recommended: true,
        statement: 'Emit machine-readable log records with stable field names through a single shared logger.',
        consequences: [
          'Logs can be filtered, aggregated, and alerted on.',
          'A correlation identifier ties an operation together across components.',
          'Slightly less readable when tailed raw, and the field vocabulary needs upkeep.',
        ],
        tradeoff: 'Queryable diagnostics; marginally worse to read by eye.',
        emits: {
          rules: ['structured-logs-only'],
          guidelines: ['logging'],
        },
      },
      {
        value: 'no',
        label: 'Plain text',
        statement: 'Emit human-readable text log lines.',
        consequences: [
          'Immediately readable in a terminal, with nothing to configure.',
          'Cannot be aggregated or alerted on without brittle parsing.',
        ],
        tradeoff: 'Easiest to read one line; impossible to query a million.',
        emits: {},
      },
    ],
  },

  {
    id: 'metrics',
    group: 'observability',
    adr: '0710',
    slug: 'metrics',
    title: 'Metrics',
    question: 'Do you instrument metrics?',
    help: 'Decides whether you learn about degradation from a dashboard or from a user.',
    context:
      'Logs describe individual events; metrics describe the aggregate behaviour that alerts fire on.',
    options: [
      {
        value: 'yes',
        label: 'Yes',
        recommended: true,
        statement: 'Instrument request rate, error rate, duration, and saturation, and alert on percentile latency rather than averages.',
        consequences: [
          'Degradation becomes visible before it becomes a report.',
          'Requires a metrics backend and discipline about label cardinality.',
        ],
        tradeoff: 'Early warning; another system to run, and easy to break with unbounded labels.',
        emits: { guidelines: ['metrics-conventions'] },
      },
      {
        value: 'no',
        label: 'No',
        statement: 'Do not instrument metrics; rely on logs and platform-provided signals.',
        consequences: [
          'Nothing to operate.',
          'No aggregate view, so slow degradation is invisible until someone complains.',
        ],
        tradeoff: 'No cost, no early warning.',
        emits: {},
      },
    ],
  },

  {
    id: 'tracing',
    group: 'observability',
    adr: '0720',
    slug: 'distributed-tracing',
    title: 'Distributed tracing',
    question: 'Do you use distributed tracing?',
    help: 'The only way to answer "where did the time go" across a call chain.',
    context:
      'Once a request crosses components, no single component can explain its latency. Tracing reconstructs the causal chain.',
    when: isDistributed,
    options: [
      {
        value: 'yes',
        label: 'Yes',
        recommended: true,
        statement: 'Propagate trace context across every hop, including asynchronous messages, and record one span per meaningful unit of work.',
        consequences: [
          'Cross-component latency and failure become directly visible.',
          'Requires instrumentation everywhere and a sampling policy; one un-instrumented hop breaks the chain.',
        ],
        tradeoff: 'The only complete view of a distributed request; needs consistent instrumentation to be worth anything.',
        emits: {
          rules: ['trace-context-propagation'],
          guidelines: ['tracing-conventions'],
        },
      },
      {
        value: 'no',
        label: 'No',
        statement: 'Correlate across components using a request identifier in structured logs instead of traces.',
        consequences: [
          'Much less setup, and enough to follow a request across a few hops.',
          'No timing breakdown, so latency attribution stays guesswork.',
        ],
        tradeoff: 'Cheap correlation without timing.',
        emits: {},
      },
    ],
  },

  {
    id: 'slo',
    group: 'observability',
    adr: '0730',
    slug: 'service-level-objectives',
    title: 'Service level objectives',
    question: 'Do you define SLOs and error budgets?',
    help: 'Converts "is it reliable enough" from an argument into arithmetic.',
    context:
      'Without a stated target, reliability is negotiated per incident. An objective plus a budget makes the trade-off against feature work explicit.',
    options: [
      {
        value: 'yes',
        label: 'Yes',
        statement:
          'Define objectives on the availability and latency of primary journeys, with explicit targets and windows, and use the remaining error budget to decide when reliability outranks features.',
        consequences: [
          'Prioritisation between reliability and delivery becomes a calculation rather than a debate.',
          'Alerts can fire on budget burn rate instead of on every transient blip.',
          'Requires trustworthy measurement of the indicators, and the discipline to honour the budget.',
        ],
        tradeoff: 'The clearest reliability decision-making tool; worthless unless the budget is actually respected.',
        emits: {
          guidelines: ['slo-and-error-budget'],
          runbooks: ['incident-response'],
          glossary: ['error-budget'],
        },
      },
      {
        value: 'no',
        label: 'No',
        recommended: true,
        statement: 'Do not define formal objectives; respond to incidents as they arise.',
        consequences: [
          'No measurement or process overhead.',
          'Every reliability-versus-features decision is re-argued from scratch.',
        ],
        tradeoff: 'No overhead; no shared basis for reliability decisions.',
        emits: {},
      },
    ],
  },

  // ------------------------------------------------------------------- delivery
  {
    id: 'branching',
    group: 'delivery',
    adr: '0800',
    slug: 'branching-strategy',
    title: 'Branching strategy',
    question: 'What branching strategy do you use?',
    help: 'Branch lifetime is the biggest single driver of merge pain.',
    context:
      'How long work stays off the default branch determines integration cost and how quickly a change can reach production.',
    options: [
      {
        value: 'trunk-based',
        label: 'Trunk-based',
        hint: 'short-lived branches, feature flags for unfinished work',
        recommended: true,
        statement:
          'Integrate into the default branch at least daily through short-lived branches, keeping it releasable at every commit and holding unfinished behaviour behind flags.',
        consequences: [
          'Merge conflicts stay small, and the branch is always releasable.',
          'Requires feature flags and a reliable test suite as prerequisites, not extras.',
        ],
        tradeoff: 'Lowest integration cost; depends on flags and a trustworthy pipeline.',
        emits: {
          rules: ['no-direct-push-to-main'],
          guidelines: [{ slug: 'branching-workflow', vars: { style: 'Integrate into the default branch at least daily; hold unfinished work behind a feature flag, never on a long-lived branch.' } }],
          glossary: ['trunk'],
        },
      },
      {
        value: 'github-flow',
        label: 'GitHub flow',
        hint: 'one branch per change, merged when reviewed',
        statement: 'Branch per change from the default branch, merge after review and a green build, and deploy from the default branch.',
        consequences: [
          'Simple and familiar, with one obvious integration point.',
          'Branches can quietly live for weeks unless review is fast.',
        ],
        tradeoff: 'Easiest to adopt; degrades exactly as review latency grows.',
        emits: {
          rules: ['no-direct-push-to-main'],
          guidelines: [{ slug: 'branching-workflow', vars: { style: 'One branch per change off the default branch, merged as soon as it is reviewed and green.' } }],
          glossary: ['trunk'],
        },
      },
      {
        value: 'git-flow',
        label: 'Git flow',
        hint: 'develop, release and hotfix branches',
        statement: 'Maintain long-lived `develop` and release branches alongside the default branch, with dedicated hotfix branches.',
        consequences: [
          'Explicit support for several versions in the field at once.',
          'The most merge overhead of the three, and the slowest path from commit to production.',
        ],
        tradeoff: 'Necessary for versioned, shipped software; heavy for continuously deployed services.',
        emits: {
          guidelines: [{ slug: 'branching-workflow', vars: { style: 'Feature branches merge into develop; releases are cut to a release branch and merged back after tagging.' } }],
        },
      },
    ],
  },

  {
    id: 'commit-convention',
    group: 'delivery',
    adr: '0810',
    slug: 'commit-convention',
    title: 'Commit convention',
    question: 'Do commit messages follow a convention?',
    help: 'A parseable history is what makes release notes and version bumps generatable.',
    context:
      'Commit messages are read by people during archaeology and by tools during release. A convention serves both.',
    options: [
      {
        value: 'conventional',
        label: 'Conventional Commits',
        recommended: true,
        statement: 'Use `type(scope): summary`, marking incompatible changes with `!` or a `BREAKING CHANGE:` footer.',
        consequences: [
          'Changelogs and version bumps can be generated rather than curated.',
          'The history filters by area and by kind of change.',
          'One more thing to learn, and it needs linting to stay consistent.',
        ],
        tradeoff: 'Machine-readable history; a small ongoing discipline.',
        emits: {
          rules: ['conventional-commits'],
          guidelines: ['git-and-prs'],
        },
      },
      {
        value: 'free',
        label: 'No fixed convention',
        statement: 'Require descriptive commit messages without a fixed grammar.',
        consequences: [
          'No format to learn.',
          'Release notes are written by hand, and history cannot be filtered reliably.',
        ],
        tradeoff: 'No friction; no automation.',
        emits: { guidelines: ['git-and-prs'] },
      },
    ],
  },

  {
    id: 'pr-policy',
    group: 'delivery',
    adr: '0820',
    slug: 'review-policy',
    title: 'Review policy',
    question: 'What review is required before merge?',
    help: 'Review is where context spreads. It is also the main source of delivery latency.',
    context:
      'Review trades speed for shared understanding and a second reader. How much is required is a deliberate position, not a default.',
    options: [
      {
        value: 'one-review',
        label: 'One approving review',
        recommended: true,
        statement: 'Require one approving review from someone other than the author before merge.',
        consequences: [
          'A second reader on every change, at modest latency cost.',
          'A single reviewer can become a bottleneck and a single point of missed context.',
        ],
        tradeoff: 'The usual balance point between latency and scrutiny.',
        emits: {
          rules: [{ slug: 'pr-review-required', vars: { reviewers: 'at least one' } }, 'no-direct-push-to-main'],
          guidelines: ['git-and-prs'],
        },
      },
      {
        value: 'two-reviews',
        label: 'Two approving reviews',
        statement: 'Require two approving reviews before merge.',
        consequences: [
          'More scrutiny and wider context sharing, appropriate for high-consequence code.',
          'Noticeably higher latency, and a tendency toward perfunctory second approvals.',
        ],
        tradeoff: 'More eyes; slower, with a real risk of rubber-stamping.',
        emits: {
          rules: [{ slug: 'pr-review-required', vars: { reviewers: 'at least two' } }, 'no-direct-push-to-main'],
          guidelines: ['git-and-prs'],
        },
      },
      {
        value: 'none',
        label: 'No mandatory review',
        hint: 'solo maintainer, or post-merge review',
        statement: 'Do not require review before merge; rely on automated checks and review after the fact.',
        consequences: [
          'No latency between finishing and merging.',
          'Nothing spreads context, and mistakes reach the default branch.',
        ],
        tradeoff: 'Fastest possible flow; the pipeline is the only safety net.',
        emits: {},
      },
    ],
  },

  {
    id: 'ci-gates',
    group: 'delivery',
    adr: '0830',
    slug: 'ci-gates',
    title: 'CI gates',
    question: 'What must pass before a change can merge?',
    help: 'The pipeline is the only check that never gets tired or skipped.',
    context:
      'Whatever the pipeline does not check is checked by people, inconsistently, or not at all.',
    options: [
      {
        value: 'full',
        label: 'Full gate',
        hint: 'build, tests, lint, format, dependency and secret scan',
        recommended: true,
        statement: 'Require build, tests, lint, format, dependency scan, and secret scan to pass before merge.',
        consequences: [
          'A green default branch means something specific and verifiable.',
          'Longer pipelines, which need parallelism and caching to stay usable.',
        ],
        tradeoff: 'Strongest guarantee; the pipeline itself needs maintaining.',
        emits: {
          rules: ['ci-green-before-merge'],
          runbooks: ['deploy-and-rollback'],
          glossary: ['release'],
        },
      },
      {
        value: 'minimal',
        label: 'Build and tests only',
        statement: 'Require build and tests to pass before merge; run everything else on a schedule.',
        consequences: [
          'Fast feedback on what breaks most often.',
          'Style and vulnerability findings arrive after merge, when they are more expensive to act on.',
        ],
        tradeoff: 'Fastest useful gate; defers the slower checks.',
        emits: {
          rules: ['ci-green-before-merge'],
          runbooks: ['deploy-and-rollback'],
        },
      },
      {
        value: 'none',
        label: 'No required checks',
        statement: 'Do not require any automated check before merge.',
        consequences: [
          'No pipeline to maintain.',
          'The default branch can break at any time, and nothing announces it.',
        ],
        tradeoff: 'Nothing to maintain, nothing guaranteed.',
        emits: {},
      },
    ],
  },

  {
    id: 'versioning',
    group: 'delivery',
    adr: '0840',
    slug: 'versioning-and-releases',
    title: 'Versioning and releases',
    question: 'How are versions and releases produced?',
    help: 'Decides whether a consumer can tell from a version number that something will break.',
    context:
      'A version is a compatibility promise. How it is produced decides whether that promise is reliable.',
    options: [
      {
        value: 'semver-automated',
        label: 'Semantic versioning, automated',
        hint: 'derived from commit history',
        recommended: true,
        statement: 'Derive semantic versions and release notes automatically from commit history on release.',
        consequences: [
          'Version and changelog cannot drift from what actually changed.',
          'Releasing is one action rather than a checklist.',
          'Correctness depends entirely on commit messages being honest about breaking changes.',
        ],
        tradeoff: 'Reliable and cheap, provided the commit convention is respected.',
        emits: {
          guidelines: [{ slug: 'release-and-versioning', vars: { style: 'Versions and notes are generated from commit history; mark breaking changes in the commit that makes them.' } }],
          glossary: ['release'],
        },
      },
      {
        value: 'semver-manual',
        label: 'Semantic versioning, manual',
        statement: 'Choose semantic versions and write release notes by hand at release time.',
        consequences: [
          'Full control over how a release is described.',
          'Depends on someone remembering, and drifts under time pressure.',
        ],
        tradeoff: 'Most expressive notes, least reliable process.',
        emits: {
          guidelines: [{ slug: 'release-and-versioning', vars: { style: 'Pick the semantic version deliberately at release time and write the notes by hand.' } }],
          glossary: ['release'],
        },
      },
      {
        value: 'none',
        label: 'No formal versioning',
        hint: 'continuously deployed service with no external consumers',
        statement: 'Do not version releases: deploy continuously and identify a deployment by its commit.',
        consequences: [
          'No release ceremony at all.',
          'Nothing to communicate compatibility, so this only holds while there are no external consumers.',
        ],
        tradeoff: 'Zero overhead; unworkable the moment something else depends on you.',
        emits: {},
      },
    ],
  },

  {
    id: 'environments',
    group: 'delivery',
    adr: '0850',
    slug: 'environments',
    title: 'Environments',
    question: 'What environments does a change pass through?',
    help: 'Decides where a change is verified before it reaches users.',
    context:
      'Each environment buys confidence and costs latency and money. The chain is a deliberate trade-off between the two.',
    options: [
      {
        value: 'dev-staging-prod',
        label: 'Development, staging, production',
        recommended: true,
        statement: 'Promote the same build through development, staging, and production, varying only configuration.',
        consequences: [
          'A production-like stage to verify against before users are exposed.',
          'Another environment to keep current, and a staging environment that diverges stops being useful.',
        ],
        tradeoff: 'A real rehearsal before production, at the cost of maintaining the rehearsal stage.',
        emits: {
          guidelines: [{ slug: 'environment-promotion', vars: { style: 'Build once and promote the identical artifact through development, staging, and production.' } }],
          runbooks: ['deploy-and-rollback'],
          glossary: ['environment', 'release'],
        },
      },
      {
        value: 'dev-prod',
        label: 'Development and production',
        statement: 'Deploy from development straight to production, relying on the pipeline and on progressive rollout.',
        consequences: [
          'Shortest path from commit to users, and no environment drift to manage.',
          'The pipeline and the rollout strategy carry all the risk, so both must be strong.',
        ],
        tradeoff: 'Fastest delivery; demands a genuinely trustworthy pipeline.',
        emits: {
          guidelines: [{ slug: 'environment-promotion', vars: { style: 'Deploy straight to production behind a progressive rollout; there is no staging rehearsal to fall back on.' } }],
          runbooks: ['deploy-and-rollback'],
          glossary: ['environment', 'release'],
        },
      },
      {
        value: 'ephemeral-preview',
        label: 'Ephemeral preview per change',
        statement: 'Create a disposable environment per change for review, then deploy to production on merge.',
        consequences: [
          'Every change can be exercised in isolation before it is merged.',
          'Requires fully automated provisioning and seed data, and costs per open change.',
        ],
        tradeoff: 'Best review fidelity; the most infrastructure automation to build.',
        emits: {
          guidelines: [{ slug: 'environment-promotion', vars: { style: 'Provision a disposable environment per change for review; production is deployed on merge.' } }],
          runbooks: ['deploy-and-rollback'],
          glossary: ['environment', 'release'],
        },
      },
    ],
  },

  // ------------------------------------------------------------------ frontend
  {
    id: 'ui-surface',
    group: 'frontend',
    adr: '0900',
    slug: 'user-interface-surface',
    title: 'User interface surface',
    question: 'What user interface does this repository ship?',
    help: 'Decides whether the interface questions apply here at all — and whether this repository ships code to a machine it does not own.',
    context:
      'A repository that serves a browser has a second runtime: code delivered to a device nobody here controls, over a network nobody here can assume, to a person who may not be looking at the screen. That runtime has its own failure modes, its own security boundary, and its own set of decisions. Recording whether it exists here is what makes the questions that follow either necessary or noise.',
    options: [
      {
        value: 'web-app',
        label: 'Web application',
        hint: 'interactive, session-bearing, backed by an API',
        recommended: true,
        statement:
          'This repository ships an interactive web application: sessions, client-side behaviour, and data read from an API at run time.',
        consequences: [
          'Rendering, state, styling and accessibility become recorded decisions rather than per-screen improvisation.',
          'The browser is an untrusted runtime: every authorisation decision the interface expresses must also be enforced by the API.',
          'Releases reach users through caches — a build that is broken is broken for everyone holding it until it is invalidated.',
        ],
        tradeoff: 'The full set of interface decisions applies, in exchange for a client the team actually controls.',
        emits: {
          rules: ['no-secrets-in-client-bundle'],
          runbooks: ['broken-frontend-release'],
          glossary: ['ui-component'],
        },
      },
      {
        value: 'content-site',
        label: 'Content site',
        hint: 'pages produced from content, little state beyond navigation',
        statement:
          'This repository ships a content-driven site: pages generated from content, with no long-lived client session and no state model beyond navigation.',
        consequences: [
          'Composition, styling and accessibility still apply; the questions about client state do not, and are retired.',
          'Discoverability and first paint are the properties that matter, which pushes rendering towards build time.',
          'The content source becomes a dependency of the build, so a content change is a deploy unless it is fetched at request time.',
        ],
        tradeoff: 'A much smaller set of interface decisions, at the cost of having nowhere to put genuine application behaviour later.',
        emits: {
          rules: ['no-secrets-in-client-bundle'],
          runbooks: ['broken-frontend-release'],
          glossary: ['ui-component'],
        },
      },
      {
        value: 'none',
        label: 'No user interface',
        hint: 'a service, a library, or a command-line tool',
        statement:
          'This repository ships no user interface. Any interface that consumes it lives in another repository and records its own decisions there.',
        consequences: [
          'The whole interface section is retired here, and nothing about rendering or styling is implied for consumers.',
          'The API is the entire contract with the outside world, so its versioning and its documentation carry weight they would otherwise share.',
          'An interface added here later reopens this decision rather than arriving without one.',
        ],
        tradeoff: 'Nothing to decide about the browser; the interface decisions still exist, they are just somebody else\'s.',
        emits: {},
      },
    ],
  },

  {
    id: 'rendering-strategy',
    group: 'frontend',
    adr: '0910',
    slug: 'rendering-strategy',
    title: 'Rendering strategy',
    question: 'Where is the interface rendered?',
    when: hasUi,
    help: 'Decides what arrives in the first response — markup, or a script that will go and get some.',
    context:
      'Where markup is produced settles first paint, crawlability, and how much work a device the team never sees has to do before anything is usable. It also decides where data is fetched from, and therefore which parts of the system need to be reachable from a browser at all. It is the interface decision that is most expensive to reverse, because the framework, the hosting, and the data layer are all chosen to fit it.',
    options: [
      {
        value: 'client-rendered',
        label: 'Client-rendered',
        hint: 'a shell plus scripts; the browser builds every screen',
        statement:
          'Serve a minimal document and render every screen in the browser, fetching data from the API at run time.',
        consequences: [
          'The interface deploys as static files, independently of the API, and the two can be owned by different teams.',
          'The first screen costs a script download, a parse, and at least one request before anything meaningful is visible.',
          'Anything that must be indexed or shared with a preview needs a separate answer, because the first response contains no content.',
        ],
        tradeoff: 'The simplest deployment and the cleanest split from the backend; the slowest first paint and the weakest discoverability.',
        emits: {
          guidelines: [
            { slug: 'rendering-and-caching', vars: { strategy: 'Every screen is rendered in the browser. The document is a shell; data arrives from the API after the application has started.' } },
          ],
        },
      },
      {
        value: 'server-rendered',
        label: 'Server-rendered',
        hint: 'markup produced per request, then made interactive',
        statement:
          'Render markup on the server for each request and hydrate it in the browser to make it interactive.',
        consequences: [
          'Content is present in the first response, so it is indexable, previewable, and readable before any script runs.',
          'Rendering now costs server capacity per request, and the server becomes part of the interface\'s availability.',
          'Hydration is a second cost after paint: the page can be visible and not yet operable, which is worse than either state alone.',
        ],
        tradeoff: 'The best first impression for content that changes per request; a server to run and a hydration cost to manage.',
        emits: {
          guidelines: [
            { slug: 'rendering-and-caching', vars: { strategy: 'Markup is produced on the server for each request and hydrated in the browser. Anything personal to the request is rendered per request and never cached in a shared cache.' } },
          ],
          glossary: ['hydration'],
        },
      },
      {
        value: 'static',
        label: 'Statically generated',
        hint: 'pages produced at build time and served from a CDN',
        statement:
          'Generate pages at build time and serve them as files, rebuilding when the content that produced them changes.',
        consequences: [
          'Serving is a file read from a CDN: the fastest and cheapest response available, with no runtime to fail.',
          'Content freshness is bounded by build frequency, so a change is a deploy unless a revalidation mechanism is added.',
          'Anything personal to the visitor has to arrive afterwards, from the client, which reintroduces a request on the pages that need it.',
        ],
        tradeoff: 'Unbeatable to serve and to operate; unsuited to anything that differs per visitor.',
        emits: {
          guidelines: [
            { slug: 'rendering-and-caching', vars: { strategy: 'Pages are generated at build time and served as files. A page that needs to differ per visitor fetches that part from the client rather than becoming dynamic.' } },
          ],
        },
      },
      {
        value: 'hybrid',
        label: 'Hybrid, decided per route',
        hint: 'static where it can be, server where it must be, client where it is genuinely interactive',
        recommended: true,
        statement:
          'Choose the rendering mode per route: static by default, server-rendered where the response depends on the request, client-rendered only for genuinely interactive regions.',
        consequences: [
          'Each route pays only the cost its content actually requires, which is the cheapest correct answer across a mixed application.',
          'The mode becomes a property of every route that someone has to know and state — an unstated route inherits whatever the framework defaults to.',
          'It commits the repository to a framework that supports all three modes, and to keeping up with how that framework expresses them.',
        ],
        tradeoff: 'The best outcome per route, paid for with a decision per route and a framework that owns the answer.',
        emits: {
          guidelines: [
            { slug: 'rendering-and-caching', vars: { strategy: 'Rendering mode is chosen per route: static unless the response depends on the request, server-rendered when it does, client-rendered only for regions that are genuinely interactive. Every route states which mode it uses.' } },
          ],
          glossary: ['hydration'],
        },
      },
    ],
  },

  {
    id: 'ui-composition',
    group: 'frontend',
    adr: '0920',
    slug: 'ui-composition',
    title: 'UI composition',
    question: 'How is the interface tree organised?',
    when: hasUi,
    help: 'Decides where a screen is assembled, and which components are allowed to reach the network.',
    context:
      'This is about the interface tree, not the source tree: ADR 0130 already decides whether directories express domains or technical roles, and this decides what a component is permitted to know. The line that matters is whether a component can fetch. Once presentation components reach the network they stop being reusable, stop being testable without a server, and start carrying feature knowledge that the next feature has to work around.',
    options: [
      {
        value: 'presentation-and-feature',
        label: 'Presentation and feature layers',
        hint: 'dumb components render props, feature components own data',
        recommended: true,
        statement:
          'Split components into a presentation layer that renders from its props and owns no data access, and a feature layer that fetches, coordinates, and composes presentation components.',
        consequences: [
          'The presentation layer is reusable across features and testable without a network or a store.',
          'Where data is fetched is a small, reviewable set of places rather than a property of the whole tree.',
          'Simple screens carry two components where one would have done, and the boundary needs defending in review.',
        ],
        tradeoff: 'The clearest rule about what may fetch; some ceremony on screens that were never going to be reused.',
        emits: {
          guidelines: ['ui-component-layering', 'forms-and-validation'],
          glossary: ['ui-component'],
        },
      },
      {
        value: 'feature-first',
        label: 'Feature-first slices',
        hint: 'each feature owns its components; a shared layer holds what is genuinely common',
        statement:
          'Group the interface by feature, with each slice owning its own components, state and data access, and a shared layer holding only what more than one slice genuinely uses.',
        consequences: [
          'A feature is added, changed, or deleted in one directory, which keeps the blast radius of a change visible.',
          'Cross-cutting components have to be promoted deliberately, and the shared layer becomes a dumping ground unless promotion is reviewed.',
          'Nothing structural stops a component inside a slice from fetching, so that rule has to be carried by review.',
        ],
        tradeoff: 'The best locality per feature; the weakest guarantee about what a component may reach.',
        emits: {
          guidelines: ['ui-component-layering', 'forms-and-validation'],
          glossary: ['ui-component'],
        },
      },
      {
        value: 'atomic',
        label: 'Atomic hierarchy',
        hint: 'primitives compose into patterns, patterns into screens',
        statement:
          'Organise components as a hierarchy of increasing composition — primitives, patterns, then screens — where a component may only compose from levels below its own.',
        consequences: [
          'Composition direction is explicit and checkable, so cycles between components cannot form.',
          'It maps cleanly onto a design system, and designers and developers can name the same thing.',
          'Which level a new component belongs to is a recurring argument, and mid-level names tend to stop meaning anything.',
        ],
        tradeoff: 'A composition rule a tool can enforce; a taxonomy that needs constant adjudication.',
        emits: {
          guidelines: ['ui-component-layering', 'forms-and-validation'],
          glossary: ['ui-component'],
        },
      },
      {
        value: 'flat',
        label: 'Flat',
        hint: 'components in one place, no layering rule',
        statement:
          'Keep components in a single place with no layering rule, and let each one fetch and hold whatever it needs.',
        consequences: [
          'Nothing to learn and nothing to argue about while the interface is small.',
          'Data access spreads to wherever it was first convenient, and extracting a reusable component later means untangling it from the network first.',
        ],
        tradeoff: 'No structure to maintain, and none to rely on once the interface outgrows one screen.',
        emits: {},
      },
    ],
  },

  {
    id: 'design-system',
    group: 'frontend',
    adr: '0930',
    slug: 'design-system-source',
    title: 'Design system source',
    question: 'Where do the base components come from?',
    when: hasUi,
    help: 'Decides whether a change to how a button behaves is one edit or a search across the tree.',
    context:
      'Every interface has a base layer — the button, the field, the dialog — whether or not anyone decided to have one. What is decided here is who owns it. Owning it costs real work in accessibility and states; adopting one costs the freedom to look unlike it. Not deciding produces the third outcome, which is several base layers that disagree, and a visual change nobody can make in one place.',
    options: [
      {
        value: 'headless-plus-tokens',
        label: 'Headless primitives, our own styling',
        hint: 'adopt the behaviour, own the appearance',
        recommended: true,
        statement:
          'Build the base layer on unstyled, accessible primitives from a maintained library, and style them with our own design tokens.',
        consequences: [
          'Keyboard interaction, focus management and assistive-technology semantics arrive already solved and already tested.',
          'The appearance stays entirely ours, and a visual change is a change to the tokens.',
          'The primitives are still a dependency with its own release cadence, and its composition model has to be learned.',
        ],
        tradeoff: 'The hard, invisible part of components is inherited and the visible part stays owned; the cost is a dependency in the middle of the interface.',
        emits: {
          rules: ['design-tokens-not-literals'],
          guidelines: [
            { slug: 'design-system-usage', vars: { source: 'Base components are built on headless primitives and styled with our design tokens. Use the base component; do not re-implement a primitive the library already provides.' } },
          ],
          glossary: ['design-token'],
        },
      },
      {
        value: 'component-library',
        label: 'Third-party component library',
        hint: 'adopt an existing styled system',
        statement:
          'Adopt a maintained, styled component library as the base layer and theme it, rather than building base components here.',
        consequences: [
          'A complete, coherent interface exists from the first week, including states nobody would have remembered to build.',
          'The library\'s opinions become the product\'s: how far it can be themed is the ceiling on how distinct the interface can look.',
          'Upgrades are the team\'s problem on the library\'s schedule, and a component that has been worked around is expensive to leave behind.',
        ],
        tradeoff: 'The fastest route to a complete interface, at the price of inheriting somebody else\'s design decisions.',
        emits: {
          rules: ['design-tokens-not-literals'],
          guidelines: [
            { slug: 'design-system-usage', vars: { source: 'Base components come from the adopted component library, themed through our tokens. Wrap a library component to adapt it; never fork one into the repository.' } },
          ],
          glossary: ['design-token'],
        },
      },
      {
        value: 'own-system',
        label: 'Our own design system',
        hint: 'base components and tokens built and maintained here',
        statement:
          'Build and maintain the base component layer and its design tokens in this repository, with no third-party component dependency.',
        consequences: [
          'Total control of appearance, behaviour and bundle weight, with nothing to upgrade on somebody else\'s schedule.',
          'Accessibility, focus management and every interaction state are now this team\'s work, permanently and in every component.',
          'It needs an owner. A design system without one becomes the oldest and least trusted code in the interface.',
        ],
        tradeoff: 'Complete control, paid for with the ongoing cost of solving problems that maintained libraries have already solved.',
        emits: {
          rules: ['design-tokens-not-literals'],
          guidelines: [
            { slug: 'design-system-usage', vars: { source: 'Base components and design tokens are owned in this repository. Every screen composes from the base layer; a screen that needs something new extends the base layer rather than styling around it.' } },
          ],
          glossary: ['design-token'],
        },
      },
      {
        value: 'none',
        label: 'No base layer',
        hint: 'each feature builds what it needs',
        statement:
          'Do not maintain a base component layer; each feature builds the elements it needs where it needs them.',
        consequences: [
          'Nothing to set up, and no shared layer to coordinate while the interface is one or two screens.',
          'The same control gets built repeatedly with different behaviour, and a change to any of it is a search across the tree.',
        ],
        tradeoff: 'No investment now; every visual and accessibility fix is repeated per copy afterwards.',
        emits: {},
      },
    ],
  },

  {
    id: 'client-state',
    group: 'frontend',
    adr: '0940',
    slug: 'client-and-server-state',
    title: 'Client and server state',
    question: 'How are server data and client state managed?',
    when: isApplicationUi,
    help: 'Decides where the truth lives, and whether a cached copy can be edited as though it were the truth.',
    context:
      'Two different things get called state. Data fetched from an API is a cached copy of something the client does not own, and it needs a freshness policy. What is selected, expanded or half-typed is owned outright and needs nothing but a place to sit. Merging them into one store is the most common structural mistake in an interface, and the one an assistant reproduces most reliably: every read then has to know which kind it received, and a stale copy becomes indistinguishable from a decision.',
    options: [
      {
        value: 'server-cache',
        label: 'Server-state cache, local client state',
        hint: 'a query cache owns remote data; component state and the URL own the rest',
        recommended: true,
        statement:
          'Hold remote data in a dedicated server-state cache with an explicit freshness policy, and keep client state in the components that use it or in the URL.',
        consequences: [
          'Loading, error, refetch and invalidation are handled once by the cache instead of being re-implemented per screen.',
          'The distinction between fetched data and owned data is enforced by which tool holds it, not by convention.',
          'It is another dependency with its own model, and cache keys become a shared vocabulary that has to be kept consistent.',
        ],
        tradeoff: 'The clearest separation between what is cached and what is owned, at the cost of a library everyone has to learn.',
        emits: {
          guidelines: [
            { slug: 'client-state-management', vars: { model: 'Remote data lives in the server-state cache under an explicit key and freshness policy. Client state lives in the component that uses it, or in the URL when it must survive a reload.' } },
            'loading-and-error-states',
          ],
          glossary: ['server-state', 'client-state'],
        },
      },
      {
        value: 'server-owned',
        label: 'Server-owned data',
        hint: 'loaders or server components fetch; the client keeps only what is ephemeral',
        statement:
          'Fetch data on the server through route loaders or server components, and keep only ephemeral interaction state in the browser.',
        consequences: [
          'There is no client cache to invalidate: a navigation or a submission is what makes data current.',
          'Far less data-handling code ships to the browser, and the data layer stays out of components entirely.',
          'It binds the interface to a framework\'s data conventions, and genuinely optimistic interactions need a deliberate escape hatch.',
        ],
        tradeoff: 'The least client state of any option; the tightest coupling to one framework\'s way of loading data.',
        emits: {
          guidelines: [
            { slug: 'client-state-management', vars: { model: 'Data is fetched on the server by the route that needs it. The browser holds only ephemeral interaction state; anything that must survive a reload goes in the URL or back to the server.' } },
            'loading-and-error-states',
          ],
          glossary: ['server-state', 'client-state'],
        },
      },
      {
        value: 'global-store',
        label: 'One global store',
        hint: 'a single store holds fetched data and interface state alike',
        statement:
          'Hold both fetched data and interface state in a single global store, updated through explicit actions.',
        consequences: [
          'One place to inspect, one way to change anything, and a change history that is easy to trace.',
          'Fetched data loses its freshness semantics: nothing distinguishes a stale copy from a value someone set.',
          'Every screen contributes to a store that outlives it, and state that should have been local becomes global by default.',
        ],
        tradeoff: 'Maximum traceability; the cost is treating a cache as though it were the source of truth.',
        emits: {
          guidelines: [
            { slug: 'client-state-management', vars: { model: 'A single global store holds application state. Fetched data is stored with the metadata that says when it was retrieved, so a stale copy is never mistaken for a value the user set.' } },
            'loading-and-error-states',
          ],
          glossary: ['server-state', 'client-state'],
        },
      },
      {
        value: 'component-local',
        label: 'Component-local',
        hint: 'each component fetches and owns what it displays',
        statement:
          'Let each component fetch and hold the data it displays, lifting state only when a sibling needs it.',
        consequences: [
          'Nothing to configure, and a component can be read and understood entirely on its own.',
          'The same resource is fetched repeatedly by different components, and two views of one record drift apart with nothing to reconcile them.',
        ],
        tradeoff: 'No machinery at all; no answer either when two parts of a screen show the same thing.',
        emits: {
          guidelines: ['loading-and-error-states'],
          glossary: ['server-state', 'client-state'],
        },
      },
    ],
  },

  {
    id: 'styling',
    group: 'frontend',
    adr: '0950',
    slug: 'styling-strategy',
    title: 'Styling strategy',
    question: 'How is the interface styled?',
    when: hasUi,
    help: 'Decides whether a visual change is one edit or an archaeology exercise.',
    context:
      'Styling is where an interface accumulates entropy fastest, because every mechanism works well enough on its own and disastrously in combination. Two systems in one interface means two cascades, two theming stories, and specificity conflicts nobody can resolve locally. This is also the decision an assistant is least likely to infer correctly from surrounding code: it will happily add whichever mechanism it saw most recently.',
    options: [
      {
        value: 'utility-classes',
        label: 'Utility classes',
        hint: 'composed from a constrained scale, in the markup',
        recommended: true,
        statement:
          'Style by composing utility classes generated from the design token scale, extracting a component when a combination repeats.',
        consequences: [
          'Values are constrained to the scale by construction, so drifting spacing and one-off colours are hard to introduce.',
          'Styles are deleted with the markup they belong to, so there is no stylesheet outliving its components.',
          'Markup carries the styling and reads densely, and the only reuse mechanism is extracting a component.',
        ],
        tradeoff: 'The strongest guarantee that values stay on the scale; the least readable markup.',
        emits: {
          rules: [
            { slug: 'one-styling-system', vars: { system: 'utility classes generated from the design token scale' } },
            'design-tokens-not-literals',
          ],
          guidelines: [
            { slug: 'styling-conventions', vars: { system: 'Styling is composed from utility classes generated from the token scale. A combination that repeats becomes a component rather than a copied class list.' } },
          ],
          glossary: ['design-token'],
        },
      },
      {
        value: 'css-modules',
        label: 'Scoped stylesheets',
        hint: 'one stylesheet per component, class names scoped at build time',
        statement:
          'Write a scoped stylesheet per component, with class names made unique at build time and values referenced from token custom properties.',
        consequences: [
          'Ordinary CSS with no runtime cost and no framework coupling, scoped so that no rule can leak into another component.',
          'The stylesheet lives next to the component and is deleted with it.',
          'Nothing constrains a value to the token scale except review, so literals creep in one at a time.',
        ],
        tradeoff: 'Plain CSS with scoping and no runtime; no constraint on the values that get written.',
        emits: {
          rules: [
            { slug: 'one-styling-system', vars: { system: 'scoped per-component stylesheets, with values referenced from design tokens' } },
            'design-tokens-not-literals',
          ],
          guidelines: [
            { slug: 'styling-conventions', vars: { system: 'Each component has one scoped stylesheet beside it. Values come from token custom properties rather than literals.' } },
          ],
          glossary: ['design-token'],
        },
      },
      {
        value: 'css-in-js',
        label: 'Styles in components',
        hint: 'styles authored in the component language',
        statement:
          'Author styles in the component language, colocated with the component and derived from its props where the design genuinely varies.',
        consequences: [
          'Styling and markup are one unit, and a variant that depends on state is expressed directly rather than through a class name.',
          'Tokens are ordinary values, so the type system can check that a colour exists before the build does.',
          'Depending on the library it costs runtime work per render, and it ties the styling to the component framework permanently.',
        ],
        tradeoff: 'The most expressive variants, with a runtime cost and the tightest coupling to the framework.',
        emits: {
          rules: [
            { slug: 'one-styling-system', vars: { system: 'styles authored in the component language, colocated with the component' } },
            'design-tokens-not-literals',
          ],
          guidelines: [
            { slug: 'styling-conventions', vars: { system: 'Styles are authored in the component language and colocated with the component. Variants are derived from props and tokens, never from a second stylesheet.' } },
          ],
          glossary: ['design-token'],
        },
      },
      {
        value: 'global-stylesheets',
        label: 'Global stylesheets by convention',
        hint: 'shared stylesheets with a naming convention for scope',
        statement:
          'Write global stylesheets and rely on a naming convention to keep rules from colliding.',
        consequences: [
          'No build step and no tooling: the stylesheets can be read, edited, and understood by anyone.',
          'Scope exists only as long as everyone follows the convention, and dead rules accumulate because nothing links a rule to the markup that needed it.',
        ],
        tradeoff: 'The simplest possible setup; the only one where deleting a rule requires proving nothing used it.',
        emits: {
          rules: [
            { slug: 'one-styling-system', vars: { system: 'global stylesheets scoped by naming convention' } },
          ],
          guidelines: [
            { slug: 'styling-conventions', vars: { system: 'Stylesheets are global and scoped by naming convention. A rule names the block it belongs to, and a rule with no markup left behind it is deleted.' } },
          ],
        },
      },
    ],
  },

  {
    id: 'accessibility',
    group: 'frontend',
    adr: '0960',
    slug: 'accessibility-baseline',
    title: 'Accessibility baseline',
    question: 'What accessibility level do you commit to?',
    when: hasUi,
    help: 'Decides whether accessibility is a constraint on new work or a remediation project later.',
    context:
      'Accessibility is a legal requirement in most markets this software is sold into, and it is the only quality attribute that is cheap while a component is being written and expensive in every other moment. Automated tooling finds roughly a third of failures, so the level committed to here decides what review has to carry. An interface generated quickly by an assistant fails in a predictable way: a clickable element that is not a button, an icon with no name, and a focus outline removed for looking untidy.',
    options: [
      {
        value: 'wcag-aa',
        label: 'WCAG 2.2 AA, gated',
        hint: 'the level regulation generally references',
        recommended: true,
        statement:
          'Commit to WCAG 2.2 level AA for every user-facing screen, checked automatically in the pipeline and by a keyboard pass in review.',
        consequences: [
          'Meets the level European and most other accessibility legislation references, so compliance is a by-product rather than a project.',
          'Keyboard operability, contrast and accessible names become acceptance criteria for every change, not a phase before launch.',
          'The automated check covers only part of it: the keyboard and screen-reader pass has to be real review work.',
        ],
        tradeoff: 'The defensible level, at the cost of a genuine review step no tool can replace.',
        emits: {
          rules: [{ slug: 'wcag-conformance', vars: { level: '2.2 level AA' } }],
          guidelines: ['accessibility-practices'],
          glossary: ['accessible-name'],
        },
      },
      {
        value: 'wcag-aaa',
        label: 'WCAG 2.2 AAA where applicable',
        hint: 'AA everywhere, AAA on the criteria that apply',
        statement:
          'Commit to WCAG 2.2 level AA throughout and to level AAA for the criteria that apply to this content, checked in the pipeline and in review.',
        consequences: [
          'The strongest commitment available, appropriate where the audience is broad or the service is a public duty.',
          'Some AAA criteria constrain the design directly — contrast, reading level, and the absence of timing — which has to be agreed with design rather than discovered in review.',
          'AAA is not achievable for all content, so the scope has to be stated per criterion or the commitment is not honest.',
        ],
        tradeoff: 'The furthest reach; the design freedom given up is real and has to be agreed up front.',
        emits: {
          rules: [{ slug: 'wcag-conformance', vars: { level: '2.2 level AA, and level AAA for the criteria that apply to this content' } }],
          guidelines: ['accessibility-practices'],
          glossary: ['accessible-name'],
        },
      },
      {
        value: 'best-effort',
        label: 'Practices without a gate',
        hint: 'follow the practices, do not block a release on them',
        statement:
          'Follow accessibility practices as a matter of course, without a conformance level or a blocking check.',
        consequences: [
          'The common failures are avoided by anyone who knows about them, at no process cost.',
          'There is no level to point at when a customer or a regulator asks, and nothing stops a regression from shipping.',
        ],
        tradeoff: 'Most of the practice, none of the evidence.',
        emits: {
          guidelines: ['accessibility-practices'],
          glossary: ['accessible-name'],
        },
      },
      {
        value: 'none',
        label: 'Not addressed',
        statement: 'Do not commit to an accessibility level, and do not check for accessibility failures.',
        consequences: [
          'Nothing to learn and nothing to check while the interface is being built.',
          'Every screen becomes remediation work the moment accessibility is required, and remediation costs several times what the constraint would have.',
        ],
        tradeoff: 'No cost now; the largest deferred cost of any decision in this section.',
        emits: {},
      },
    ],
  },

  {
    id: 'i18n',
    group: 'frontend',
    adr: '0970',
    slug: 'internationalisation',
    title: 'Internationalisation',
    question: 'Is the interface internationalised?',
    when: hasUi,
    help: 'Decides whether adding a second language is a feature or a rewrite of every screen.',
    context:
      'Internationalisation is not a feature that can be added later at its own cost: the work is proportional to the number of screens that exist when it starts, and it touches every one of them. The decision is not which languages to ship — it is whether user-facing text is addressed by key from the first component or hardcoded into it. Formatting is half the problem and the half that is usually forgotten: dates, numbers, currencies, sort order and text direction are locale decisions long before translation is.',
    options: [
      {
        value: 'from-the-start',
        label: 'Prepared from the start',
        hint: 'every string by key, one locale shipped today',
        recommended: true,
        statement:
          'Address every user-facing string by key and format every date, number and currency through the locale, while shipping a single locale for now.',
        consequences: [
          'A second language becomes a translation job rather than a pass over every component in the repository.',
          'Formatting bugs that only appear in another region are prevented rather than found later by a user in it.',
          'It costs an indirection on every string from the first day, for a benefit that may arrive much later or not at all.',
        ],
        tradeoff: 'The cheapest possible future translation, paid for with an indirection on text that may never be translated.',
        emits: {
          rules: ['no-untyped-user-facing-text'],
          guidelines: ['i18n-workflow'],
          glossary: ['locale'],
        },
      },
      {
        value: 'multi-locale',
        label: 'Multiple locales in production',
        hint: 'several languages shipped, with a translation workflow',
        statement:
          'Ship several locales, with a translation workflow that keeps catalogues current and a defined behaviour for missing keys.',
        consequences: [
          'Language becomes a property of the session, and every layout has to tolerate strings a third longer and a reading direction it did not assume.',
          'Translation becomes part of the definition of done: a feature is not finished when its strings exist only in the default locale.',
          'A missing translation needs a stated behaviour — fall back, or show the key — because silently showing English is a decision either way.',
        ],
        tradeoff: 'Reaches every market it ships to, with translation permanently inside the delivery loop.',
        emits: {
          rules: ['no-untyped-user-facing-text'],
          guidelines: ['i18n-workflow'],
          glossary: ['locale'],
        },
      },
      {
        value: 'single-locale',
        label: 'One language, inline',
        hint: 'strings written where they are displayed',
        statement:
          'Write user-facing text directly in the components, in one language, with no translation layer.',
        consequences: [
          'The text a component displays is visible in the component, which is the shortest path from a copy change to a deploy.',
          'Adding a language later means touching every screen that exists at that point, and the formatting assumptions are the part nobody finds.',
        ],
        tradeoff: 'Nothing to set up and nothing to indirect through; a second language costs a pass over the entire interface.',
        emits: {},
      },
    ],
  },

  {
    id: 'ui-testing',
    group: 'frontend',
    adr: '0980',
    slug: 'user-interface-testing',
    title: 'User interface testing',
    question: 'How is the interface tested?',
    when: hasUi,
    help: 'Decides what a green build proves about the screens a user actually sees.',
    context:
      'ADR 0510 distributes tests for the system as a whole; the interface needs its own answer because its failure modes are different. A screen breaks by rendering the wrong state, losing focus, or not being operable — not by returning the wrong value. The trade is between tests that run in milliseconds against a simulated document and tests that run in a real browser and are the only ones that prove the assembled application works.',
    options: [
      {
        value: 'component-and-flow',
        label: 'Component tests plus critical flows',
        hint: 'behaviour at the component level, a handful of browser tests end to end',
        recommended: true,
        statement:
          'Test component behaviour against a simulated document, and cover the few flows that carry the product end to end in a real browser.',
        consequences: [
          'Fast feedback on the behaviour of individual screens, with proof that the assembled application still works where it matters most.',
          'Which flows count as critical is an explicit, short list that has to be maintained as the product changes.',
          'Failures between components that are not on a critical flow are still found by a person first.',
        ],
        tradeoff: 'The best ratio of confidence to runtime; a small set of slow tests to keep honest.',
        emits: {
          guidelines: [
            { slug: 'ui-testing-strategy', vars: { mix: 'Component behaviour is tested against a simulated document; the flows that carry the product are covered end to end in a real browser.' } },
          ],
        },
      },
      {
        value: 'end-to-end-heavy',
        label: 'Mostly end to end',
        hint: 'browser tests through the real application',
        statement:
          'Cover the interface primarily with browser tests exercising the real application against a running backend or a stubbed transport.',
        consequences: [
          'What is verified is what a user does, including the wiring between components that unit-level tests never see.',
          'The suite is slow and sensitive to timing, so flakiness becomes a standing maintenance cost and a reason people stop trusting red.',
          'A failure points at a screen rather than at a cause, so diagnosis is longer.',
        ],
        tradeoff: 'The most faithful verification available, with the slowest and most fragile suite.',
        emits: {
          guidelines: [
            { slug: 'ui-testing-strategy', vars: { mix: 'The interface is covered primarily by browser tests through the real application. Every test is stable by construction: no fixed waits, and network stubbed at the transport boundary.' } },
          ],
        },
      },
      {
        value: 'component-only',
        label: 'Component tests only',
        hint: 'no browser suite',
        statement:
          'Test components against a simulated document and rely on manual checks for the assembled application.',
        consequences: [
          'The whole suite runs in seconds, so it stays in the inner development loop.',
          'Nothing verifies routing, the real network, or the build output — the failures that only appear once the parts are assembled.',
        ],
        tradeoff: 'The fastest suite; no evidence the application works assembled.',
        emits: {
          guidelines: [
            { slug: 'ui-testing-strategy', vars: { mix: 'Components are tested against a simulated document. There is no browser suite, so anything that only fails once assembled is found by a person.' } },
          ],
        },
      },
      {
        value: 'component-flow-and-visual',
        label: 'Component, flow and visual regression',
        hint: 'the above plus rendered-image comparison',
        statement:
          'Test component behaviour and critical flows as above, and additionally compare rendered images of key components and screens against approved references.',
        consequences: [
          'Catches the regressions no assertion describes: a shifted layout, a lost style, a broken state.',
          'It is the only practical protection for a design system, where an unnoticed visual change propagates everywhere at once.',
          'References have to be reviewed and approved on every intentional change, and rendering differences between environments produce failures that are not defects.',
        ],
        tradeoff: 'The only way to catch visual regressions; a review step and an infrastructure sensitivity to carry.',
        emits: {
          guidelines: [
            { slug: 'ui-testing-strategy', vars: { mix: 'Component behaviour and critical flows are tested as above, and key components and screens are additionally compared against approved rendered references. A reference is updated only as part of an intentional change.' } },
          ],
        },
      },
    ],
  },

  {
    id: 'frontend-performance',
    group: 'frontend',
    adr: '0990',
    slug: 'frontend-performance-budget',
    title: 'Frontend performance budget',
    question: 'Is there a frontend performance budget?',
    when: hasUi,
    help: 'Turns "the app feels slow now" into a number that fails a build the day it is exceeded.',
    context:
      'Interface weight only ever grows, and it grows in increments too small to argue about: a date library here, an analytics tag there, one more provider around the tree. Nobody makes the interface slow; a hundred reasonable additions do. A budget is the only mechanism that turns that accumulation into a conversation at the moment the weight is added, when reversing it is still one revert rather than a project.',
    options: [
      {
        value: 'field-and-bundle',
        label: 'Field metrics and a bundle gate',
        hint: 'Core Web Vitals measured on real sessions, bundle size checked in CI',
        recommended: true,
        statement:
          'Set a target for the Core Web Vitals at a percentile of real traffic, and fail the build when a change pushes the delivered bundle past its budget.',
        consequences: [
          'The build gate catches the cause at the pull request, while the field metrics say whether it matters to real users on real devices.',
          'A budget increase becomes a recorded decision instead of an edited threshold.',
          'It needs real-user measurement collected and watched, which is another pipeline and another dashboard with an owner.',
        ],
        tradeoff: 'Catches regressions at the change and validates them against real users; two mechanisms to maintain.',
        emits: {
          rules: [{ slug: 'frontend-performance-budget', vars: { budget: 'the Core Web Vitals targets at the agreed percentile, and the delivered bundle size limit' } }],
          guidelines: ['frontend-performance-practices'],
          runbooks: ['frontend-performance-regression'],
          glossary: ['core-web-vitals'],
        },
      },
      {
        value: 'bundle-only',
        label: 'Bundle size gate only',
        hint: 'a CI check on what is shipped',
        statement:
          'Fail the build when a change pushes the delivered bundle past its budget, without measuring the experience in the field.',
        consequences: [
          'The cheapest possible gate: one check, deterministic, and it names the change that caused the growth.',
          'Bundle size is a proxy — an interface can pass it and still be slow because of what it does after loading.',
        ],
        tradeoff: 'Almost free and blocks the most common regression; measures the payload rather than the experience.',
        emits: {
          rules: [{ slug: 'frontend-performance-budget', vars: { budget: 'the delivered bundle size limit' } }],
          guidelines: ['frontend-performance-practices'],
          runbooks: ['frontend-performance-regression'],
        },
      },
      {
        value: 'none',
        label: 'No budget',
        statement: 'Do not set a performance budget; address performance when it is reported as a problem.',
        consequences: [
          'No threshold to agree on and no build to unblock when a legitimate change exceeds it.',
          'By the time slowness is reported, the cause is spread across dozens of individually reasonable changes and no single revert fixes it.',
        ],
        tradeoff: 'Nothing to maintain; no way to attribute the regression when it arrives.',
        emits: {
          guidelines: ['frontend-performance-practices'],
          glossary: ['core-web-vitals'],
        },
      },
    ],
  },
];

// --- lookups ---------------------------------------------------------------

export const DECISIONS_BY_ID = new Map(DECISIONS.map((d) => [d.id, d]));

export function getDecision(id) {
  return DECISIONS_BY_ID.get(id);
}

export function getOption(decision, value) {
  return decision?.options.find((o) => o.value === value);
}

export function recommendedValue(decision) {
  return decision.options.find((o) => o.recommended)?.value;
}

export function decisionsForGroup(groupId) {
  return DECISIONS.filter((d) => d.group === groupId);
}

// A decision is askable when its gate is satisfied. See the `when` contract at
// the top of this file: an unanswered gate keeps the question relevant.
export function isRelevant(decision, answers = {}) {
  return typeof decision.when !== 'function' || decision.when(answers) === true;
}

// Registry lookups, kept here so resolve.js has one import for everything and
// catalog.test.js can validate every reference from a single place.
export const REGISTRIES = {
  rules: RULES,
  guidelines: GUIDELINES,
  runbooks: RUNBOOKS,
  glossary: GLOSSARY_TERMS,
};

// A decision outside this catalog — "which payment provider" — gets an ADR
// number from `specframe adr new`, never allocated by hand (see writer.js's
// recordLocalAdr). This band is the contract that makes that safe: the
// catalog will never place a decision here, no matter how many groups are
// appended, so a project-specific ADR can never collide with one a future
// specframe version adds. Enforced by catalog.test.js.
export const LOCAL_ADR_MIN = 9000;
export const LOCAL_ADR_STEP = 10;
