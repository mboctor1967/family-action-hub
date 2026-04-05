---
description: Start or update the Requirements phase. Reads existing requirements if present, elicits gaps via structured options with recommendations, produces MoSCoW-prioritised acceptance criteria in Given/When/Then format, validates assumptions, and checks cross-app impact.
argument-hint: "<feature or app name>"
---

# Requirements Phase — $ARGUMENTS

## Step 1 — Discover What Already Exists

Spawn an explorer sub-agent to find:
- Existing requirements docs for this feature or app
- Related user stories, tickets, or notes anywhere in the repo
- Existing test plans (which often imply requirements)
- Any partially built features that reveal implicit requirements

Read everything found before writing a single line.

## Step 2 — Cross-App Impact Check

Before scoping requirements, ask:
Could this feature affect any other app in the group?
- Shared database tables or models?
- Shared API endpoints?
- Shared auth or permissions?
- Shared UI components?

If yes: flag the affected apps and note that their requirements
docs will also need updating. Do not proceed without confirming scope.

## Step 3 — Structured Requirements Elicitation

For each significant requirement area, do NOT simply ask open questions.
Instead, present structured options with a recommendation:

Format for each decision point:

  REQUIREMENT AREA: <name>
  
  Context: <one sentence explaining what decision needs to be made>
  
  Option A — <name>
    What: <description>
    Pros: <benefits>
    Cons: <drawbacks>
    Risk: LOW | MEDIUM | HIGH
  
  Option B — <name>
    What: <description>
    Pros: <benefits>
    Cons: <drawbacks>
    Risk: LOW | MEDIUM | HIGH
  
  Option C — <name> (if relevant)
    ...
  
  Recommendation: Option <X> because <concise rationale>
  
  Decision needed: [A] [B] [C] [Other — describe]

Present all decision points together, wait for responses, then
proceed to write acceptance criteria only after decisions are confirmed.

## Step 4 — Assumption Validation

For each assumption implied by the requirements, surface it explicitly:

  ASSUMPTION: <statement of the assumption>
  If wrong, impact: <what breaks or changes>
  Validation needed: YES | NO
  How to validate: <method>

Do not let assumptions stay buried. Flag every one.

## Step 5 — Edge Case Prompting

At the end of elicitation (not during — to avoid noise), run through
this checklist and flag any that apply to this feature:

  [ ] What happens with no data / empty state?
  [ ] What happens at maximum scale or volume?
  [ ] What happens when a network request fails mid-flow?
  [ ] What happens when the user is not authenticated?
  [ ] What happens on a slow or offline connection?
  [ ] What happens if a dependency (external API, DB) is unavailable?
  [ ] What is the behaviour on mobile vs desktop?
  [ ] What if two users act simultaneously on the same data?

Flag the ones that apply. Add them as requirements or out-of-scope
decisions — do not silently ignore them.

## Step 6 — Write / Update Requirements Doc

Write or update /apps/<app>/docs/requirements.md:

---
Doc version: v0.1 (increment if updating existing doc)
Last updated: YYYY-MM-DD
Status: DRAFT
App version at last update: v0.x.x
---

# Requirements — <feature name>

## Goal
One paragraph: what problem does this solve and for whom.

## User Stories
US-001: As a <role>, I want <action> so that <benefit>.
US-002: ...

## Decisions Made
Record every Option A/B/C decision made in Step 3:
DEC-001: <area> → chose Option <X>. Rationale: <why>.

## Acceptance Criteria
Use Given / When / Then format. Each must be independently testable.

AC-001 [MUST] — <name>
  Given: <precondition>
  When: <action or event>
  Then: <expected outcome>
  Priority: MUST | SHOULD | COULD | WON'T
  Risk: LOW | MEDIUM | HIGH

AC-002 [SHOULD] — <name>
  Given: ...
  When: ...
  Then: ...

## Edge Cases In Scope
List edge cases confirmed as in scope, each with an AC reference.

## Out of Scope
- <explicit exclusion> (reason: <why excluded>)

## Assumptions
ASSUMPTION-001: <statement>
  Impact if wrong: <description>
  Validated: YES | NO | PENDING

## Dependencies
- <other features, services, or teams this depends on>

## Cross-App Impact
- <app name>: <what is affected and how>
  OR: None identified.

## Open Questions
Q-001: <question> — Owner: <who needs to answer> — Due: <date>

## Step 7 — Confirm

Present a summary:
- N user stories
- N acceptance criteria (N MUST, N SHOULD, N COULD)
- N assumptions flagged (N validated, N pending)
- N cross-app impacts
- N open questions

Do not proceed to Phase 2 until I confirm: SIGNED OFF.
When signed off, update Status to SIGNED OFF and increment doc version.
