// Architecture blueprints — a recognisable archetype, already answered.
//
// A preset is a *posture*: how demanding the defaults are. A blueprint is a
// *shape*. `balanced` answers every decision the same way whatever you are
// building, which is the right default for a product codebase and the wrong
// place to start an event-sourced system or a fleet of functions from. Between
// "no decisions at all" and "forty questions from scratch" there was nothing;
// this is that middle step.
//
// A blueprint answers the decisions that *are* the archetype — architecture,
// design, data — plus the ones the shape forces on you: you cannot operate
// services without contract tests, traces and structured logs, so a blueprint
// that puts a network between components says so rather than leaving it to the
// posture. Everything else is deliberately left alone.
//
// A blueprint is never a scaffold you accept blind. It seeds the wizard, so
// every answer is shown again as `current` with `enter` meaning "keep it" — the
// point is to argue with a starting position instead of inventing one.
//
// Gating is part of the contract: a blueprint must not answer a question its
// own shape retires (`data-ownership` on a monolith). blueprints.test.js proves
// that for every entry, so a bad blueprint fails the suite rather than quietly
// writing an ADR about services the repository does not have.

import { DECISIONS, getDecision, getOption, isRelevant } from './catalog.js';

// Distribution is not a style choice, it is an operational bill. Every
// blueprint with more than one deployment unit pays it the same way.
const DISTRIBUTED_IMPLICATIONS = {
  'contract-testing': 'yes',
  'structured-logging': 'yes',
  metrics: 'yes',
  tracing: 'yes',
};

export const BLUEPRINTS = [
  {
    id: 'crud',
    label: 'Layered CRUD application',
    hint: 'one deployable, controllers/services/repositories, a relational database behind it — the line-of-business default',
    description:
      'The classic three-tier application: technical layers at the top of the tree, an ORM over a relational schema, exceptions for failure. Cheap to staff and cheap to reason about; it has no answer for scaling one part of the system independently.',
    answers: {
      'architecture-style': 'monolith',
      'api-style': 'rest',
      'component-structure': 'technical-layers',
      'shared-code': 'shared-library',
      'architecture-governance': 'review',
      layering: 'layered',
      ddd: 'none',
      'design-patterns': 'no',
      'dependency-injection': 'container',
      'error-handling': 'exceptions',
      persistence: 'relational',
      'event-sourcing': 'no',
      cqrs: 'no',
      migrations: 'up-down',
    },
  },
  {
    id: 'modular-monolith',
    label: 'Modular monolith',
    hint: 'one deployable, enforced module boundaries, domain-shaped tree — what the recommendations add up to',
    description:
      'Boundaries in the source tree instead of on the network: domain namespaces with code only in the leaves, fitness functions to keep them, one transaction for any state change. The cheapest structure to extract services from later, and the one this catalog recommends by default.',
    answers: {
      'architecture-style': 'modular-monolith',
      'api-style': 'rest',
      'component-structure': 'domain-leaf',
      'shared-code': 'dedicated-component',
      'architecture-governance': 'fitness-functions',
      layering: 'clean',
      ddd: 'tactical',
      'design-patterns': 'yes',
      'dependency-injection': 'manual',
      'error-handling': 'typed-errors',
      persistence: 'relational',
      'event-sourcing': 'no',
      cqrs: 'read-model-only',
      migrations: 'versioned-forward-only',
    },
  },
  {
    id: 'hexagonal',
    label: 'Domain-driven hexagonal',
    hint: 'ports and adapters around a full domain model — for complex rules that outlive their delivery mechanism',
    description:
      'A modular monolith whose centre is the domain model, not the framework: full tactical and strategic DDD, ports and adapters at every edge, typed errors as part of the model. Buys you a domain testable without infrastructure, at the cost of ceremony a CRUD screen does not repay.',
    answers: {
      'architecture-style': 'modular-monolith',
      'api-style': 'rest',
      'component-structure': 'domain-leaf',
      'shared-code': 'dedicated-component',
      'architecture-governance': 'fitness-functions',
      layering: 'hexagonal',
      ddd: 'full',
      'design-patterns': 'yes',
      'dependency-injection': 'manual',
      'error-handling': 'typed-errors',
      persistence: 'relational',
      'event-sourcing': 'no',
      cqrs: 'read-model-only',
      migrations: 'versioned-forward-only',
    },
  },
  {
    id: 'service-based',
    label: 'Service-based',
    hint: 'a handful of coarse-grained services over one shared database — distribution without the distributed data problem',
    description:
      'Domain services deployed separately and calling each other over REST, but sharing a single database, so a state change is still one ACID transaction. The pragmatic middle of Architecture: the Hard Parts — you get independent deployability and keep consistency; the schema stays a coupling point everyone shares.',
    answers: {
      'architecture-style': 'service-based',
      'inter-component-comm': 'sync-rest',
      'api-style': 'rest',
      'component-structure': 'domain-leaf',
      'shared-code': 'shared-library',
      'architecture-governance': 'fitness-functions',
      layering: 'clean',
      ddd: 'tactical',
      'design-patterns': 'yes',
      'dependency-injection': 'manual',
      'error-handling': 'typed-errors',
      persistence: 'relational',
      'data-ownership': 'shared-db',
      'event-sourcing': 'no',
      cqrs: 'read-model-only',
      // A shared database is the whole point: there is no cross-boundary
      // transaction to coordinate, and adding sagas here would be cargo cult.
      'distributed-transactions': 'none',
      migrations: 'versioned-forward-only',
      ...DISTRIBUTED_IMPLICATIONS,
    },
  },
  {
    id: 'microservices',
    label: 'Event-driven microservices',
    hint: 'one deployable per bounded context, its own database, async messaging and choreographed sagas',
    description:
      'Maximum independent deployability, paid for in network and consistency: a database per service, events rather than calls between them, eventual consistency handled by choreographed sagas. Only worth it when teams need to release without coordinating — the operational floor (contracts, traces, SLOs) is not optional.',
    answers: {
      'architecture-style': 'microservices',
      'inter-component-comm': 'async-messaging',
      'api-style': 'rest',
      'component-structure': 'domain-leaf',
      // Sharing code across services re-couples what the deployment split just
      // separated, so the shared component is a library with a version, not a
      // directory everyone imports.
      'shared-code': 'shared-library',
      'architecture-governance': 'fitness-functions',
      layering: 'hexagonal',
      ddd: 'full',
      'design-patterns': 'yes',
      'dependency-injection': 'manual',
      'error-handling': 'typed-errors',
      persistence: 'mixed',
      'data-ownership': 'db-per-service',
      'event-sourcing': 'no',
      cqrs: 'read-model-only',
      'distributed-transactions': 'saga-choreography',
      migrations: 'versioned-forward-only',
      ...DISTRIBUTED_IMPLICATIONS,
      slo: 'yes',
    },
  },
  {
    id: 'event-sourcing',
    label: 'Event sourcing and CQRS',
    hint: 'the event log is the system of record, read models are projections, writes and reads are separate stores',
    description:
      'State is derived from an append-only log of what happened, and queries are served from projections rebuilt off it. Gives you a perfect audit trail and time travel; costs you schema evolution of events, projection lag as a permanent condition, and a team that has done it before.',
    answers: {
      'architecture-style': 'service-based',
      'inter-component-comm': 'async-messaging',
      'api-style': 'rest',
      'component-structure': 'domain-leaf',
      'shared-code': 'dedicated-component',
      'architecture-governance': 'fitness-functions',
      layering: 'hexagonal',
      ddd: 'full',
      'design-patterns': 'yes',
      'dependency-injection': 'manual',
      'error-handling': 'typed-errors',
      persistence: 'mixed',
      'data-ownership': 'db-per-service',
      'event-sourcing': 'yes',
      cqrs: 'full',
      // The log is written in the same transaction as the state change; an
      // orchestrator on top of an event-sourced write side is a second source
      // of truth about the same facts.
      'distributed-transactions': 'outbox',
      // You cannot roll back a log anyone has already read from.
      migrations: 'versioned-forward-only',
      ...DISTRIBUTED_IMPLICATIONS,
    },
  },
  {
    id: 'serverless',
    label: 'Serverless functions',
    hint: 'managed runtime per function, events between them, a document store, previews per change',
    description:
      'No servers to own: functions triggered by events, a managed document store, environments created and destroyed per change. Scales to zero and to spikes without capacity planning; you pay in cold starts, vendor coupling and a debugging story that only exists if the traces do.',
    answers: {
      'architecture-style': 'serverless',
      'inter-component-comm': 'async-messaging',
      'api-style': 'rest',
      'component-structure': 'domain-flat',
      'shared-code': 'shared-library',
      'architecture-governance': 'fitness-functions',
      layering: 'hexagonal',
      ddd: 'tactical',
      'design-patterns': 'yes',
      'dependency-injection': 'manual',
      'error-handling': 'typed-errors',
      persistence: 'document',
      'data-ownership': 'db-per-service',
      'event-sourcing': 'no',
      cqrs: 'read-model-only',
      'distributed-transactions': 'saga-choreography',
      migrations: 'versioned-forward-only',
      ...DISTRIBUTED_IMPLICATIONS,
      slo: 'yes',
      // Infrastructure defined per stack is what makes a full environment per
      // pull request cheap enough to be the default.
      environments: 'ephemeral-preview',
    },
  },
];

export const BLUEPRINT_IDS = BLUEPRINTS.map((blueprint) => blueprint.id);

export function getBlueprint(id) {
  return BLUEPRINTS.find((blueprint) => blueprint.id === id) ?? null;
}

export function isBlueprintId(value) {
  return getBlueprint(value) !== null;
}

// The decisions worth naming when a blueprint is echoed back — enough to
// recognise the archetype in one line, not a second copy of the review table.
const HEADLINE = ['architecture-style', 'inter-component-comm', 'layering', 'persistence', 'data-ownership'];

// "Microservices · Asynchronous messaging · Hexagonal" — built from the
// catalog's own labels, so renaming an option renames it here too.
export function blueprintHeadline(blueprint) {
  return HEADLINE.map((id) => {
    const value = blueprint.answers[id];
    if (value === undefined) return null;
    const decision = getDecision(id);
    return getOption(decision, value)?.label ?? null;
  })
    .filter(Boolean)
    .join(' · ');
}

// How many of the catalog's decisions this blueprint takes a position on,
// against how many still apply once it has. Both numbers are shown when a
// blueprint is picked: "14 of 37" is the honest description of a starting
// point, where "pre-configured" is not.
export function blueprintCoverage(blueprint) {
  const answers = blueprint.answers;
  const relevant = DECISIONS.filter((decision) => isRelevant(decision, answers));
  return {
    answered: relevant.filter((decision) => answers[decision.id] !== undefined).length,
    relevant: relevant.length,
  };
}

// Resolve a blueprint id to the same `{ mode, answers }` shape a preset
// resolves to. Unknown ids throw: a typo in `--blueprint` must not silently
// scaffold a different architecture.
export function resolveBlueprint(id) {
  const blueprint = getBlueprint(id);
  if (!blueprint) {
    throw new Error(
      `Unknown blueprint: ${id}\nAvailable blueprints: ${BLUEPRINT_IDS.join(', ')}`,
    );
  }
  return { mode: 'guided', answers: { ...blueprint.answers } };
}
