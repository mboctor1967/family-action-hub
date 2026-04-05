---
description: Start or update the Technical Spec phase. Reads requirements and design, audits existing code to reflect actual state, presents technical decisions as structured options with recommendations, and produces API contracts, data models, and architecture decisions.
argument-hint: "<feature or app name>"
---

# Technical Spec Phase — $ARGUMENTS

## Step 1 — Read All Upstream Docs

Spawn two explorer sub-agents in parallel:

Explorer A — read documentation:
- The relevant requirements in docs/requirements/ (decisions, ACs, cross-domain impacts)
- The relevant design doc in docs/specs/ (design decisions, component breakdown)
- Any existing spec or ADR files in docs/specs/

Explorer B — read existing code:
- Existing API routes related to this feature
- Existing data models or schema files
- Existing service/repository layer
- Package versions and framework constraints

Confirm requirements and design are both SIGNED OFF before proceeding.

## Step 2 — Reconcile Existing Code with Spec

If code already exists for this feature:
- Document current state accurately — what is actually built
- Note any deviations from the design (intentional or not)
- Flag tech debt worth capturing

## Step 3 — Structured Technical Decisions

For each significant technical decision, present options with recommendation.
Same format as design decisions — never make unilateral tech choices.

  TECHNICAL DECISION: TD-001 — <decision name>

  Context: <what needs to be decided and the constraints>

  Option A — <n>
    Approach: <description>
    Pros: <performance, maintainability, dev speed>
    Cons: <drawbacks, limitations>
    Complexity: LOW | MEDIUM | HIGH
    Risk: LOW | MEDIUM | HIGH

  Option B — <n>
    ...

  Recommendation: Option <X>
  Rationale: <why this fits the stack and requirements best>

  Decision: [A] [B] [Other]

Present all technical decisions together and wait for confirmation
before writing the spec.

## Step 4 — Write / Update Spec Doc

Write or update the spec doc in docs/specs/:

---
Doc version: v0.1 (increment if updating existing)
Last updated: YYYY-MM-DD
Status: DRAFT
App version at last update: v0.x.x
---

# Technical Spec — <feature name>

## Technical Decisions Log
TD-001: <n> → Option <X> chosen. Rationale: <why>. Date: YYYY-MM-DD.

## API Contracts

### POST /api/<endpoint>
Auth required: YES | NO
Request body:
  field: type — description (required/optional)
Response 200:
  field: type — description
Errors:
  400: <reason>
  401: <reason>
  404: <reason>
  500: <reason>
AC coverage: AC-001, AC-003

## Data Models

### <ModelName>
| Field       | Type    | Required | Description          |
|-------------|---------|----------|----------------------|
| id          | uuid    | yes      | primary key          |

## Schema Changes
New tables, columns, or index changes with migration file names.

## State Management Spec
Exact shape of state for this feature.

## Error Handling Strategy
How errors are caught, logged, and surfaced to the user.

## Security Considerations
Auth requirements, input validation rules, data sensitivity classification.

## Performance Considerations
Expected load, caching strategy, query optimisation notes.

## Integration Points
Other services or APIs this feature depends on.

## Cross-App Technical Impact
Apps affected: <list> | None

## Open Technical Decisions
Any decisions still open that could block implementation.

## Step 5 — Confirm

Present:
- N API endpoints specced
- N data model changes
- N technical decisions made
- N cross-app impacts

Do not proceed to Phase 4 until I confirm: SIGNED OFF.
When signed off, update Status to SIGNED OFF and increment doc version.
