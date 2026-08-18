// Guideline registry — the conventions specframe can emit.
//
// Rendered by render.js into the shape declared by docs/guidelines/0000-template.md
// (scope / statement / rationale / examples). `number` is permanent and lands in
// the filename. See rules.js for the numbering contract.
//
// A guideline says how we build by default; a rule says what is never
// negotiable. If an entry here has an enforcement mechanism and no acceptable
// exception, it belongs in rules.js instead.
export const GUIDELINES = {
  'naming-conventions': {
    number: '0010',
    title: 'Naming conventions',
    scope: 'All code.',
    statement:
      'Names are explicit, pronounceable, and searchable. Functions read as verb + object; classes and modules are nouns; booleans use an `is` / `has` / `can` / `should` prefix. Abbreviate only where the short form is the domain term.',
    rationale:
      'Naming is the cheapest documentation available and the only one that cannot go stale without the compiler noticing.',
    good: 'function findOverdueInvoices(customerId)\nconst hasActiveSubscription = ...',
    avoid: 'function proc(x)\nconst flag = ...',
  },

  'small-single-purpose-functions': {
    number: '0020',
    title: 'Small functions with a single purpose',
    scope: 'All code.',
    statement:
      'A function does one thing at one level of abstraction. Keep the parameter list short, and avoid boolean parameters that switch behaviour — pass a value or split the function.',
    rationale:
      'A function you can hold in your head is one you can test at its edges and change without reading its callers.',
    good: 'render(user)\nrenderCompact(user)',
    avoid: 'render(user, { compact: true, escape: false, legacy: true })',
  },

  'comments-explain-why': {
    number: '0030',
    title: 'Comments explain why, not what',
    scope: 'All code.',
    statement:
      'Prefer code that needs no comment. Comment non-obvious intent, constraints, and the reason an unusual approach was chosen. Delete a comment rather than let it drift out of date.',
    rationale:
      'A comment restating the code duplicates a fact that will diverge; a comment recording intent carries information the code cannot.',
    good: '// The provider rate-limits per account, not per key, so a shared bucket is required.',
    avoid: '// increment the counter\ncounter += 1;',
  },

  'reduce-nesting': {
    number: '0040',
    title: 'Reduce nesting, watch complexity',
    scope: 'All code.',
    statement:
      'Use guard clauses and early returns to keep the happy path at the outermost level. When a function grows several levels of nesting, extract the inner levels rather than reformatting them.',
    rationale:
      'Nesting depth is what forces a reader to keep several conditions in mind at once, which is where misreadings come from.',
    good: 'if (!user) return null;\nif (!user.active) return null;\nreturn charge(user);',
    avoid: 'if (user) {\n  if (user.active) {\n    return charge(user);\n  }\n}',
  },

  'solid-principles': {
    number: '0050',
    title: 'SOLID principles applied',
    scope: 'Object-oriented and module-level design.',
    statement:
      'One module, one reason to change. Extend behaviour without modifying callers. Subtypes honour their supertype\'s contract. Interfaces are small and shaped by the client that uses them. Depend on abstractions, not concretions.',
    rationale:
      'Applied as a review lens rather than a checklist, these five point at the specific coupling that makes a change expensive.',
  },

  'layering': {
    number: '0060',
    title: 'Layering and dependency direction',
    scope: 'Whole codebase structure.',
    statement:
      'Separate domain, application, infrastructure, and interface concerns. Dependencies point inward: the domain declares the interfaces it needs, and outer layers implement them. IO lives at the edges. Layers live inside a component, not above it: the top of the tree names business domains, and the layer split appears within a component — `customer.billing.payment.domain`, never `domain.customer.billing`.',
    rationale:
      'It lets business rules be tested without a database, a broker, or a running server, and confines a framework change to the layer that chose the framework. Keeping the layer split below the domain split is what stops a single feature from being spread across the whole tree.',
  },

  'design-patterns-vocabulary': {
    number: '0070',
    title: 'Design patterns as shared vocabulary',
    scope: 'Design discussions and code review.',
    statement:
      'Reach for a pattern when it names a structure the code already needs — Strategy, Adapter, Facade, Repository, State, Observer. Name it in the code so the intent survives. Do not design pattern-first.',
    rationale:
      'The value is the shared name, not the structure: it turns a paragraph of explanation into one word. Applied speculatively the same patterns add indirection with no reader to benefit from it.',
    avoid: 'A God Object; a Singleton used as mutable global state; an AbstractFactoryFactory with one implementation.',
  },

  'error-handling': {
    number: '0080',
    title: 'Error handling',
    scope: 'All code.',
    statement:
      'Fail with typed errors or stable error codes, never with a bare string. Validate at the boundary so the core can assume valid input. Messages are useful to the caller without leaking internals. Never swallow an error silently.',
    rationale:
      'An error that carries its category can be handled; one that carries only a message can only be logged and re-thrown.',
    avoid: 'try { ... } catch (e) { /* ignore */ }',
  },

  'logging': {
    number: '0090',
    title: 'Logging conventions',
    scope: 'All code that emits diagnostics.',
    statement:
      'Log through the shared logger with stable keys (`request_id`, `correlation_id`, `user_id`). Use levels consistently: `debug` for development detail, `info` for state transitions, `warn` for recoverable anomalies, `error` for failed operations. Log the outcome of an operation once, at its boundary.',
    rationale:
      'Consistent keys make logs queryable; logging once per operation is what keeps them readable under load.',
  },

  'testing-strategy': {
    number: '0100',
    title: 'Testing strategy',
    scope: 'All test code.',
    statement:
      '{{strategy}} Tests are deterministic and independent of order. Mock only what is external or genuinely unstable — never your own domain code. A test names the behaviour it protects, not the function it calls.',
    rationale:
      'The distribution decides feedback speed; determinism decides whether anyone trusts a red build.',
  },

  'performance': {
    number: '0110',
    title: 'Performance work',
    scope: 'All code.',
    statement:
      'Measure before optimising, and keep the measurement. Watch for N+1 access patterns, repeated queries in a loop, and allocations on hot paths. Introduce a cache only with a stated invalidation strategy.',
    rationale:
      'Un-measured optimisation trades readability for an unverified gain, and a cache without invalidation trades a slow answer for a wrong one.',
  },

  'git-and-prs': {
    number: '0120',
    title: 'Commits and pull requests',
    scope: 'All contributions.',
    statement:
      'Small, self-describing commits. A pull request states the problem, the approach, the trade-offs, and how to verify it. Split a change that needs several paragraphs to explain.',
    rationale:
      'Review quality falls off a cliff with diff size; a described trade-off is the part that is impossible to recover from the diff later.',
  },

  'ai-agent-changes': {
    number: '0130',
    title: 'AI agents modifying this repository',
    scope: 'Any change authored or assisted by an agent.',
    statement:
      'Prefer minimal, targeted diffs. Match the surrounding style rather than an idiomatic ideal. Do not add a dependency without justification, and do not make cosmetic refactors that were not requested. Before changing code: find the right extension point, find the related tests, and respect the boundaries in docs/adr/.',
    rationale:
      'An agent can produce a large plausible diff quickly, which shifts the whole cost of the change onto review. Keeping diffs narrow keeps that cost proportional.',
  },

  'quality-bar': {
    number: '0140',
    title: 'Definition of done',
    scope: 'Every change.',
    statement:
      'A change is ready when the build passes, relevant tests are green, lint and format pass, edge cases are handled or explicitly out of scope, no secret is exposed, and the affected documents under docs/ are updated.',
    rationale:
      'A written bar is what makes "done" reviewable instead of negotiable.',
  },

  'module-layout': {
    number: '0150',
    title: 'Module layout in a modular monolith',
    scope: 'Top-level module structure.',
    statement:
      'One directory per module, named for its domain capability rather than its technical role. Each module owns its domain, application, and persistence code, and exposes a single explicit entry point. Shared code lives in a module that depends on nothing.',
    rationale:
      'Organising by capability keeps a feature\'s change surface in one place, and is what makes a module extractable later without a rewrite.',
    good: 'billing/  catalog/  identity/  shared/',
    avoid: 'controllers/  services/  models/  utils/',
  },

  'service-boundaries': {
    number: '0160',
    title: 'Drawing service boundaries',
    scope: 'Service decomposition.',
    statement:
      'A service boundary follows a business capability and its data. Prefer fewer, larger services over many chatty ones. If two services must be deployed together to ship a feature, they are one service.',
    rationale:
      'Boundaries drawn along technical layers produce distributed coupling: all the operational cost of a network with none of the independence that justifies it.',
  },

  'api-design-rest': {
    number: '0170',
    title: 'REST API conventions',
    scope: 'HTTP interfaces.',
    statement:
      'Resources are plural nouns; behaviour comes from the method, not the path. Use status codes for outcome and a consistent error body for detail. Paginate every collection from the start. Additive changes only within a version.',
    rationale:
      'Predictable shape is most of an API\'s usability, and an unpaginated collection is an outage waiting for its first large customer.',
    good: 'GET /invoices?status=overdue&limit=50',
    avoid: 'GET /getOverdueInvoices',
  },

  'api-design-graphql': {
    number: '0180',
    title: 'GraphQL conventions',
    scope: 'GraphQL schema and resolvers.',
    statement:
      'The schema is the contract: name types for the domain, not the storage. Deprecate fields with `@deprecated` rather than removing them. Guard against N+1 with batched loaders, and bound query depth and complexity.',
    rationale:
      'A GraphQL endpoint delegates query shape to the client, so cost control and deprecation discipline have to be explicit server-side.',
  },

  'grpc-conventions': {
    number: '0190',
    title: 'gRPC and protobuf conventions',
    scope: 'Service definitions.',
    statement:
      'Field numbers are permanent: never reuse one, and mark removed fields `reserved`. Prefer adding a field over changing a meaning. Keep proto files in a shared, versioned location and generate clients from them.',
    rationale:
      'Wire compatibility in protobuf rests entirely on field numbers; reusing one silently misreads old data.',
  },

  'async-messaging': {
    number: '0200',
    title: 'Asynchronous messaging conventions',
    scope: 'Producers and consumers of messages.',
    statement:
      'Consumers are idempotent and tolerate redelivery and out-of-order arrival. Every message carries an identifier, a type, a version, and its trace context. Configure a dead-letter queue before going to production.',
    rationale:
      'At-least-once delivery is the norm, not the exception. Idempotency is what turns a redelivery from a bug into a no-op.',
  },

  'ddd-tactical-patterns': {
    number: '0210',
    title: 'Tactical DDD patterns',
    scope: 'Domain model.',
    statement:
      'Model with entities, value objects, aggregates, repositories, and domain services. An aggregate is the consistency boundary: load it whole, change it through its root, and keep it small. Prefer value objects over primitives for domain concepts.',
    rationale:
      'The aggregate boundary is the design decision that determines transaction scope and, later, service boundaries.',
    good: 'order.addLine(item, Quantity.of(3))',
    avoid: 'orderRepository.updateLineQuantity(orderId, lineId, 3)',
  },

  'ubiquitous-language': {
    number: '0220',
    title: 'Ubiquitous language',
    scope: 'Domain code, tests, APIs, and conversation.',
    statement:
      'Use the domain expert\'s term in code, tests, and interfaces — one term per concept, one concept per term. When a term is contested, resolve it in docs/glossary/ and rename the code to match. Different bounded contexts may legitimately use the same word differently; say which context you mean.',
    rationale:
      'Every translation between the business term and the code term is a place where a misunderstanding can hide indefinitely.',
  },

  'dependency-injection': {
    number: '0230',
    title: 'Dependency injection',
    scope: 'Object construction and wiring.',
    statement:
      '{{style}} Construct dependencies at the edge and pass them inward. Depend on the narrow interface a component actually needs, and never reach for a global or a service locator inside domain code.',
    rationale:
      'Explicit dependencies make a component\'s real coupling visible in its signature, and make substitution in tests a matter of passing a different value.',
  },

  'event-design-and-versioning': {
    number: '0240',
    title: 'Event design and versioning',
    scope: 'Domain events in the event store.',
    statement:
      'Name events in the past tense after what happened in the domain, not after the table that changed. Include everything a consumer needs to act without a callback. Never change a published event shape: add a new version and upcast old ones on read.',
    rationale:
      'Events are permanent, so their schema is a forever-decision. Upcasting on read is what keeps a years-old event readable by today\'s code.',
    good: 'InvoiceSettled { invoiceId, amount, settledAt, version: 2 }',
    avoid: 'InvoiceUpdated { id, changedFields }',
  },

  'projection-rebuilds': {
    number: '0250',
    title: 'Projections and rebuilds',
    scope: 'Read models derived from the event log.',
    statement:
      'A projection is disposable: it can be dropped and rebuilt from the log at any time. Keep projection logic free of side effects and of calls to other services, and store an explicit checkpoint per projection.',
    rationale:
      'Rebuildability is the property that makes event sourcing worth its cost. A projection with side effects cannot be replayed, which forfeits it.',
  },

  'command-query-separation': {
    number: '0260',
    title: 'Command and query separation',
    scope: 'Application layer.',
    statement:
      'Commands change state and return nothing but an acknowledgement; queries return data and change nothing. Model each read path for its consumer rather than reusing the write model. Treat query results as eventually consistent and design the interface to say so.',
    rationale:
      'Separating the paths lets each be shaped and scaled for its own access pattern; the cost is that the read side lags, which the interface has to admit rather than hide.',
  },

  'saga-design': {
    number: '0270',
    title: 'Saga design',
    scope: 'Business processes spanning more than one service.',
    statement:
      'Break the process into steps that each have a compensating action, and make every step idempotent. Persist the saga\'s state so it can resume after a crash. Set an explicit timeout per step and decide up front what happens when it expires.',
    rationale:
      'A saga trades atomicity for availability. Compensation and timeouts are what keep the intermediate states from becoming permanently stuck.',
  },

  'migration-workflow': {
    number: '0280',
    title: 'Schema migration workflow',
    scope: 'Database schema changes.',
    statement:
      'Deploy schema changes ahead of the code that needs them, in an additive step: add the column, backfill, switch reads, then remove the old one in a later release. Each migration runs in a single transaction where the engine allows it, and is tested from an empty database in CI.',
    rationale:
      'Expand-then-contract is what makes a deploy rollbackable: at every intermediate point both the old and the new code work against the live schema.',
  },

  'tdd-loop': {
    number: '0290',
    title: 'The test-driven loop',
    scope: 'Feature and fix development.',
    statement:
      'Red, green, refactor, in small steps. Write the smallest failing test that expresses the next behaviour, make it pass plainly, then improve the design while it stays green. Tests name behaviour, not implementation, so a refactor does not rewrite them.',
    rationale:
      'The discipline\'s real output is design pressure: code that is hard to test first is usually code with too many dependencies.',
  },

  'contract-tests': {
    number: '0300',
    title: 'Consumer-driven contract tests',
    scope: 'Every cross-service integration.',
    statement:
      'The consumer declares the subset of the interface it relies on; the provider verifies all declared contracts in its own pipeline. Keep contracts narrow — only the fields actually consumed — and version them alongside the consumer.',
    rationale:
      'It gives the provider a precise, machine-checked list of what it may not break, without either side running the other\'s full test suite.',
  },

  'mutation-testing': {
    number: '0310',
    title: 'Mutation testing',
    scope: 'Core domain logic.',
    statement:
      'Run mutation testing on the domain, not the whole codebase, and treat a surviving mutant as a missing assertion. Run it on a schedule rather than on every commit.',
    rationale:
      'Coverage proves a line ran; a surviving mutant proves nothing checked what it did. Scoping it to the domain keeps the runtime affordable.',
  },

  'authn-authz-implementation': {
    number: '0320',
    title: 'Authentication and authorisation',
    scope: 'All entry points.',
    statement:
      '{{style}} Resolve the acting principal once at the boundary and pass it inward — never re-derive identity from a client-supplied field. Authorise against the resource being touched, not only the route being called.',
    rationale:
      'Route-level checks miss the case that matters most: an authenticated user acting on someone else\'s data.',
  },

  'secret-handling': {
    number: '0330',
    title: 'Handling secrets in code',
    scope: 'All code that reads configuration.',
    statement:
      'Read secrets once at startup through a single configuration module, fail fast when one is missing, and never log or serialise the value. Keep an up-to-date `.env.example` listing every required name with a placeholder value.',
    rationale:
      'One entry point makes the full set of required secrets discoverable, and failing at startup is far cheaper than failing on first use in production.',
  },

  'metrics-conventions': {
    number: '0340',
    title: 'Metrics conventions',
    scope: 'Instrumentation.',
    statement:
      'Instrument the four signals that describe user experience: request rate, error rate, duration, and saturation. Use stable metric names and a bounded label set — never label with a user or request identifier. Report latency as a histogram, and alert on percentiles rather than averages.',
    rationale:
      'Unbounded labels are the standard way to melt a metrics backend, and an average latency hides exactly the tail that users notice.',
  },

  'tracing-conventions': {
    number: '0350',
    title: 'Distributed tracing conventions',
    scope: 'All inter-component calls.',
    statement:
      'One span per meaningful unit of work, named for the operation rather than the URL. Record the outcome and the identifiers needed to correlate, and sample consistently so a trace is never half-recorded. Always propagate the incoming context.',
    rationale:
      'Traces answer "where did the time go" across a call chain, which no per-service metric can reconstruct after the fact.',
  },

  'slo-and-error-budget': {
    number: '0360',
    title: 'Objectives and error budgets',
    scope: 'User-facing services.',
    statement:
      'Define objectives on indicators users feel — availability and latency of the primary journeys — with an explicit target and window. The gap to 100% is the error budget: spend it on change, and when it is exhausted, prioritise reliability over features until it recovers.',
    rationale:
      'The budget converts reliability from an argument into arithmetic, and gives an honest answer to how fast the team may safely ship.',
  },

  'branching-workflow': {
    number: '0370',
    title: 'Branching workflow',
    scope: 'All contributions.',
    statement:
      '{{style}} Branches are short-lived and rebased or merged before they age. Feature flags carry unfinished work, not long-running branches.',
    rationale:
      'Branch lifetime is the single biggest driver of merge pain; a flag makes integration continuous while the feature stays incomplete.',
  },

  'release-and-versioning': {
    number: '0380',
    title: 'Releases and versioning',
    scope: 'Published artifacts.',
    statement:
      '{{style}} A release is cut from the default branch, tagged, and accompanied by generated notes. Breaking changes are called out explicitly, with a migration note for consumers.',
    rationale:
      'A version number is a promise about compatibility. It only carries information if breaking changes are marked honestly.',
  },

  'environment-promotion': {
    number: '0390',
    title: 'Environments and promotion',
    scope: 'Deployment pipeline.',
    statement:
      '{{style}} Build the artifact once and promote the identical build between environments — configuration varies, the artifact does not. Environments differ only in configuration and data, never in code path.',
    rationale:
      'Rebuilding per environment means production runs something no environment ever tested, and an `if (production)` branch is untested precisely where it matters.',
  },

  'serverless-function-design': {
    number: '0400',
    title: 'Serverless function design',
    scope: 'Functions-as-a-service handlers.',
    statement:
      'One function, one trigger, one responsibility. Keep the handler a thin adapter over domain code that runs anywhere. Assume cold starts and concurrent duplicate invocations: initialise lazily, and make handlers idempotent. Never hold state between invocations.',
    rationale:
      'Keeping domain logic out of the handler is what lets it be tested without the platform, and idempotency is required because retries are the platform\'s error handling.',
  },

  'persistence-conventions': {
    number: '0410',
    title: 'Persistence conventions',
    scope: 'Data access code.',
    statement:
      '{{style}} Keep queries behind repositories named for the domain operation they serve. Set explicit transaction boundaries in the application layer, never in the domain. Index for the queries you actually run, and treat an unbounded query as a bug.',
    rationale:
      'Repository boundaries keep the storage choice replaceable, and explicit transaction scope is what makes concurrent behaviour reviewable.',
  },
  'component-naming': {
    number: '0420',
    title: 'Components name what they do',
    scope: 'Component and namespace names.',
    statement:
      'A component name states its role and responsibility without further reading. When the name leaves the question open, change the name — and check whether the namespace above it is wrong too.',
    rationale:
      'The namespace path is the first thing a new colleague and an agent both read to decide where a change belongs. A name that needs explaining sends every one of those decisions somewhere else.',
    good: 'customer.billing.history\nticket.assignment.routing',
    avoid: 'ticket.manager\ncustomer.util.helper',
  },

  'shared-code-placement': {
    number: '0430',
    title: 'Shared code is a component, not a parent node',
    scope: 'Interfaces, abstract classes, and utilities used by more than one component.',
    statement:
      'Shared code goes into its own leaf component, never into the parent namespace of the components that use it. Reserve one suffix for it and use that suffix for nothing else. Keep shared domain logic — notification, formatting, validation — apart from shared infrastructure — logging, metrics, security: the first is business logic common to some components, the second is operational and common to all of them.',
    rationale:
      'A suffix used for nothing else turns sharing from a feeling into a measurement: what share of the codebase is shared, and across how many components. Approaching 40% is a cohesion problem now, not at some future extraction. And the two kinds of sharing have different futures — infrastructure travels with every deployment unit, shared domain logic has to be assigned to one.',
    good: 'customer.billing.sharedcode\nplatform.infrastructure.logging',
    avoid: 'customer.billing/  (interfaces and abstract classes, plus three child packages)',
  },

  'component-sizing': {
    number: '0440',
    title: 'Component size, and how it is judged',
    scope: 'Component granularity.',
    statement:
      'Size a component by the number of statements it holds, not by lines, files, or classes — developers structure classes differently, so only statements approximate how much a component actually does. Aim for a distribution in which no component sits far from the mean. Watch the statements-per-file ratio as well: a component of perfectly average size held in two files is hiding classes that want splitting. A large component with no discernible internal subdomains is fine as it is; one with obvious subdomains and nobody extracting them is not.',
    rationale:
      'The oversized component is almost always also the most coupled and the hardest to change on its own, which makes size a cheap proxy for a problem that is expensive to measure directly. Numeric thresholds only mean something once there are enough components to have a distribution — around ten. Below that, record the intent here and set the numbers when they carry information.',
  },

  'coupling-budget': {
    number: '0450',
    title: 'Coupling is measured in both directions',
    scope: 'Dependencies between components.',
    statement:
      'Track afferent coupling (how many components depend on this one) and efferent coupling (how many it depends on) for each component, and hold a budget on each. Start the budget at the coupling the codebase has today plus one and tighten it over time, rather than starting loose. Before merging duplicated components into one, work out the afferent coupling the merged component would carry and compare it against the sum of the originals.',
    rationale:
      'The graph of dependencies between components — ignoring everything internal to them, which may be a tangle without it mattering — is the single most informative picture of an architecture. Removing duplication is not free if what replaces it is something half the system depends on: losing the ability to reason about one component at a time costs more than the duplication bought.',
  },

  'architecture-stories': {
    number: '0460',
    title: 'Structural work is an architecture story',
    scope: 'Backlog and prioritisation.',
    statement:
      'Structural work gets its own backlog item type, distinct from both the user story and the technical-debt ticket: as an architect, I need to decouple X in order to better support Y — where Y is an architectural characteristic or a business need. An item without a stated Y is not an architecture story.',
    rationale:
      'Technical debt gets negotiated away because it names no beneficiary. An architecture story names the characteristic it buys, which gives it a priority defensible in the same conversation as a feature.',
    good: 'As an architect, I need to split the notification component so billing can be deployed without the ticket workflow.',
    avoid: 'Refactor the notification package (tech debt).',
  },

  'rendering-and-caching': {
    number: '0470',
    title: 'Rendering and caching',
    scope: 'Every route and page of the interface.',
    statement:
      '{{strategy}} A route states which of these it uses and why; a route that needs a different mode is a decision worth a sentence in its own file, not a silent exception. Data that changes per user is never cached where a shared cache can serve it to someone else.',
    rationale:
      'Where markup is produced decides first paint, crawlability, and infrastructure cost at once. Mixing modes without saying so is how a page that must be private ends up on a CDN.',
  },

  'ui-component-layering': {
    number: '0480',
    title: 'UI component layering',
    scope: 'All interface code.',
    statement:
      'A presentation component renders from its props and owns no data access. A feature component may fetch, coordinate, and hold state, and composes presentation components to display it. Nothing in the presentation layer imports an API client, a route, or a store.',
    rationale:
      'The split is what makes the visual layer reusable across features and testable without a network, and it is the line an agent crosses first when it drops a fetch call into a button.',
    good: 'features/checkout/CheckoutPanel  →  ui/Button, ui/PriceTag',
    avoid: 'ui/Button calling fetch("/api/cart")',
  },

  'design-system-usage': {
    number: '0490',
    title: 'Using the design system',
    scope: 'Every screen and component.',
    statement:
      '{{source}} Build a new base component only after establishing that the existing one cannot be composed or extended into it. A one-off variant lives with the feature that needs it, never as a fork of the base component.',
    rationale:
      'Base components are the only place where a change to spacing, focus behaviour or contrast can be made once. Every fork is a copy that will not receive the next fix.',
  },

  'client-state-management': {
    number: '0500',
    title: 'State management',
    scope: 'All interface code.',
    statement:
      '{{model}} Server state and client state are never merged into one store. State lives as close to the component that uses it as it can; state that must survive a reload or be shareable goes in the URL. Derived values are computed at render, not stored.',
    rationale:
      'Cached remote data and locally owned data have different lifecycles: one is invalidated, the other is set. Storing them together means every read has to know which kind it got.',
    good: 'const { data } = useQuery(orderKey(id))\nconst [expanded, setExpanded] = useState(false)',
    avoid: 'store.dispatch(setOrder(await fetchOrder(id)))',
  },

  'styling-conventions': {
    number: '0510',
    title: 'Styling conventions',
    scope: 'All interface code.',
    statement:
      '{{system}} Styles are colocated with the component they belong to. Layout is expressed with flow, flex and grid rather than absolute positioning; spacing between siblings belongs to the container. Responsive behaviour uses the token breakpoints, not ad-hoc widths.',
    rationale:
      'Colocated styles are deleted along with their component, which is what keeps a stylesheet from outliving the markup it was written for.',
  },

  'accessibility-practices': {
    number: '0520',
    title: 'Accessibility practices',
    scope: 'Every user-facing surface.',
    statement:
      'Use the native element before reaching for a role: a button that is a `button` is focusable, operable and announced without any help. Every control has a label, every meaningful image has alternative text, and every decorative one is hidden from assistive technology. Focus order follows reading order, and focus is moved deliberately when content is replaced. Never rely on colour alone to carry meaning.',
    rationale:
      'Most accessibility failures are not exotic: they are a `div` with a click handler, an icon with no name, and a focus outline someone removed because it looked untidy.',
    good: '<button type="button" onClick={close}>Close</button>',
    avoid: '<div class="btn" onclick="close()">✕</div>',
  },

  'i18n-workflow': {
    number: '0530',
    title: 'Internationalisation workflow',
    scope: 'All user-facing text and formatted values.',
    statement:
      'Text is referenced by key from the default locale catalogue; the key names the meaning, not the English wording. Never build a sentence by concatenating fragments — use one message with interpolation, and use the plural forms the library provides. Dates, numbers and currencies are formatted through the locale, never with a hand-written pattern. Layout tolerates strings a third longer than the original and reading direction is not assumed.',
    rationale:
      'Concatenated fragments are untranslatable in any language whose word order differs, and a layout tuned to English string lengths breaks on the first locale that is added.',
    good: 't("cart.itemsRemaining", { count })',
    avoid: 't("cart.youHave") + count + t("cart.itemsLeft")',
  },

  'ui-testing-strategy': {
    number: '0540',
    title: 'Interface testing',
    scope: 'All interface tests.',
    statement:
      '{{mix}} Tests query the way a user does — by role, label and text — never by class name or component internals. Network access is stubbed at the transport boundary rather than by mocking the components that call it, so the code under test is the code that ships.',
    rationale:
      'A test bound to markup structure fails on every refactor and passes through every behavioural regression, which is the worst of both trades.',
    good: 'screen.getByRole("button", { name: "Place order" })',
    avoid: 'wrapper.find(".btn-primary").at(2)',
  },

  'frontend-performance-practices': {
    number: '0550',
    title: 'Frontend performance',
    scope: 'All interface code.',
    statement:
      'Split at the route boundary and load below-the-fold and interaction-only code on demand. Reserve space for anything that arrives late — images, embeds, injected banners — so nothing shifts under the reader. Serve images in a modern format at the size they are displayed. Adopt a dependency only after checking what it adds to the bundle, and measure at a percentile of real sessions rather than on a developer machine.',
    rationale:
      'Interface performance is lost in small, individually reasonable increments; each of these is a decision made at the moment the weight is added, when it is still cheap.',
  },

  'forms-and-validation': {
    number: '0560',
    title: 'Forms and validation',
    scope: 'Every form in the interface.',
    statement:
      'Validation rules are declared once as a schema and used on both sides of the boundary; the client copy is there for feedback, and the server copy is the one that decides. Validate a field when it is left rather than on every keystroke, and show the error next to the field, in text, referenced by the input. Submission is disabled while in flight and the result is announced, not just rendered.',
    rationale:
      'Client validation is a courtesy that anyone can bypass. Keeping the rules in one schema is what stops the two sides from disagreeing about what a valid value is.',
  },

  'loading-and-error-states': {
    number: '0570',
    title: 'Loading, empty and error states',
    scope: 'Every view that reads remote data.',
    statement:
      'Every view that fetches declares four states: loading, empty, error, and loaded. Reserve the loaded layout while loading so nothing jumps. An error state says what failed and offers the retry; an empty state says why it is empty and what to do next. An unexpected failure is caught by an error boundary at the route, so one broken subtree does not blank the page.',
    rationale:
      'The three states that are not the happy path are the ones an agent silently omits, and they are most of what a user actually experiences when something is wrong.',
  },
};
