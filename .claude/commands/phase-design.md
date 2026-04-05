---
description: Start or update the Design and UI phase. Reads requirements and existing design artifacts. Presents significant design decisions as structured options with recommendations (ADR-style). Produces a design doc covering components, data flow, and captured decisions with rationale.
argument-hint: "<feature or app name>"
---

# Design & UI Phase — $ARGUMENTS

## Step 1 — Read Upstream Docs

Spawn two explorer sub-agents in parallel:

Explorer A — read:
- /docs/requirements.md — especially decisions made and acceptance criteria
- Any existing design docs, wireframes, or Figma references in the repo

Explorer B — read the codebase:
- Current component structure (/src/components/ or equivalent)
- Existing design system, tokens, or style patterns
- Similar existing features (to understand established patterns)

Confirm requirements are SIGNED OFF before proceeding.
If not signed off, stop and flag.

## Step 2 — Assess Existing Design Artifacts

If design docs or wireframes already exist:
- Map what is decided vs what is open
- Note design decisions already reflected in built code
- Only fill gaps — do not redesign what is built and working

## Step 3 — Structured Design Decision Records

For every significant design decision, present options with a recommendation.
Do not make unilateral design decisions. Surface the trade-offs.

Format for each decision:

  DESIGN DECISION: DD-001 — <decision name>
  
  Context: <one sentence — what needs to be decided and why it matters>
  
  Option A — <n>
    Description: <what this looks like in practice>
    Pros: <user experience, dev complexity, performance>
    Cons: <drawbacks>
    Fits requirements: AC-001, AC-003 ✓ | AC-002 ✗
    Risk: LOW | MEDIUM | HIGH
  
  Option B — <n>
    Description: ...
    Pros: ...
    Cons: ...
    Fits requirements: ...
    Risk: ...
  
  Recommendation: Option <X>
  Rationale: <why this option best fits the requirements and constraints>
  
  Consequence if we choose differently: <what downstream impact this has>
  
  Decision: [A] [B] [Other]

Present all design decisions together before writing the design doc.
Wait for all decisions to be confirmed before writing.

## Step 4 — Flag Requirement Gaps

During design, flag any requirements that are ambiguous or missing.
Do not invent missing requirements — list them as open questions
for me to resolve. Design is where requirement gaps become visible.

## Step 5 — Write / Update Design Doc

Write or update /apps/<app>/docs/design.md:

---
Doc version: v0.1 (increment if updating existing)
Last updated: YYYY-MM-DD
Status: DRAFT
App version at last update: v0.x.x
---

# Design — <feature name>

## Screen / Component Breakdown
Each screen or major component with its purpose and owning AC references.

  COMPONENT: <n>
  Purpose: <what it does>
  Covers: AC-001, AC-002
  New or existing: NEW | EXTENDS <existing component>

## Data Flow
```mermaid
flowchart LR
    ...
```

## Component Hierarchy
Parent → Child relationships for new or modified components.

## Design Decisions Log
Record every DD-XXX decision confirmed in Step 3:

  DD-001: <n>
  Decision: Option <X> chosen
  Rationale: <why>
  Date confirmed: YYYY-MM-DD
  Impacts: <downstream consequences noted>

## State Management
Where state lives, how it flows, what is shared vs local.

## UI Decisions & Patterns
Non-structural decisions (spacing, interaction patterns, feedback states):
- Loading states: <approach>
- Empty states: <approach>
- Error states: <approach>
- Success feedback: <approach>

## Accessibility
WCAG requirements for this feature.
Keyboard navigation and screen reader considerations.

## Responsive Behaviour
How the UI adapts across breakpoints.

## Requirement Gaps Found During Design
RG-001: <gap description> — needs answer before implementation

## Step 6 — Confirm

Present:
- N components (N new, N extended)
- N design decisions made
- N requirement gaps found

Do not proceed to Phase 3 until I confirm: SIGNED OFF.
When signed off, update Status to SIGNED OFF and increment doc version.
