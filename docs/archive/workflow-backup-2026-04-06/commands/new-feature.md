---
description: The single entry point for all new work. Assesses feature size and complexity, recommends the appropriate discipline tier (HIGH / MEDIUM / LOW), confirms with the user, then routes to the correct workflow. Always start here — never jump directly to a phase command or tier command.
argument-hint: "<feature or change description>"
---

# New Work — Sizing Assessment — $ARGUMENTS

Before committing to any workflow, we size the work correctly.
Over-engineering a button fix wastes time.
Under-engineering a cross-app feature creates debt and risk.

---

## Step 1 — Discover Context

Spawn an explorer sub-agent to quickly assess:
- Does any existing doc mention this feature? (requirements, spec, plan)
- How many files will likely need to change? (rough estimate)
- Does this touch the database schema?
- Does this add new API endpoints?
- Does this affect more than one app in the group?
- Does this introduce new UI components?
- Is this fixing a known bug or adding new behaviour?

Report back before sizing. Do not guess — read the codebase.

---

## Step 2 — Apply Sizing Criteria

Score the feature against these criteria:

  SCHEMA CHANGES         Yes = +2   No = 0
  NEW API ENDPOINTS      Yes = +2   No = 0
  NEW UI COMPONENTS      Yes = +1   No = 0
  CROSS-APP IMPACT       Yes = +2   No = 0
  ESTIMATED FILES        > 5 = +2   2–5 = +1   1–2 = 0
  NEW USER BEHAVIOUR     Yes = +1   No = 0
  ACs EXPECTED           > 4 = +2   2–4 = +1   0–1 = 0
  IS A BUG FIX           Yes = -2   No = 0

  Score 7+   → Tier 1 — HIGH    → /project:new-feature-high
  Score 3–6  → Tier 2 — MEDIUM  → /project:quick-feature
  Score 0–2  → Tier 3 — LOW     → /project:hotfix

Calculate the score and present it.

---

## Step 3 — Present Sizing Recommendation

Present the assessment in this format:

  Feature: $ARGUMENTS
  
  SIZING SCORE: N
  
  Criteria that contributed:
  + Schema changes: Yes (+2)
  + New API endpoints: Yes (+2)
  + Cross-app impact: No (0)
  ...
  
  RECOMMENDED TIER: <1 | 2 | 3>
  
  ──────────────────────────────────────────
  Tier 1 — HIGH    /project:new-feature-high
  Full 9-phase SDLC. Full documentation. Full sub-agent
  orchestration. Three-audience release notes. MINOR version bump.
  
  Use when: new epics, cross-app features, schema changes,
  multiple new components, or anything with 5+ ACs.
  
  Estimated effort: > 1 day
  ──────────────────────────────────────────
  Tier 2 — MEDIUM  /project:quick-feature
  5-phase streamlined workflow. Combined requirements + design.
  Lightweight spec. Sub-agents still used. Still gated before commit.
  
  Use when: self-contained feature, no schema changes, single app,
  2–4 ACs, familiar pattern in the codebase.
  
  Estimated effort: 2–8 hours
  ──────────────────────────────────────────
  Tier 3 — LOW     /project:hotfix
  3-step minimal workflow. Fix + test + release note.
  No new docs. Patch version bump only.
  
  Use when: bug fix, UI tweak, copy change, 1–2 files, no new
  behaviour introduced.
  
  Estimated effort: < 2 hours
  ──────────────────────────────────────────
  
  My recommendation: Tier <N> — <reason in one sentence>
  
  Confirm tier to proceed: [1] [2] [3]
  Or: describe why you think a different tier is more appropriate.

---

## Step 4 — Route to the Right Workflow

Once tier is confirmed:

  Tier 1 → proceed with /project:new-feature-high $ARGUMENTS
  Tier 2 → proceed with /project:quick-feature $ARGUMENTS
  Tier 3 → proceed with /project:hotfix $ARGUMENTS

Do not begin any phase until the tier is confirmed by the user.

---

## Override Rules

If the user overrides the recommendation:
- Accept the override without argument
- Note the override in the first doc created:
  "Tier override: scored Tier N, user selected Tier M"
- If downgrading (e.g. Tier 1 → Tier 2), flag any specific risks
  that the lighter process will not cover
- If upgrading (e.g. Tier 3 → Tier 2), proceed normally

The user always has the final say on tier selection.
