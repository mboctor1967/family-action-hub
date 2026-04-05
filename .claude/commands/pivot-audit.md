---
description: Audit an existing project mid-development and map what already exists to the SDLC doc framework. Run this FIRST when adopting the structured approach on an existing codebase. Never run other phase commands before this.
argument-hint: "[optional: specific app name to scope the audit]"
---

# Mid-Development Pivot Audit

You are onboarding an existing in-progress project into a structured
SDLC documentation framework. Your job is to audit what already exists,
map it to the framework, and produce a gap report — without overwriting
anything that is already useful.

## Step 1 — Discover Project Structure

Spawn an `explorer` sub-agent to map the project:

Ask the explorer to find and report:
- All domains or functional areas (look for pages, API routes, component groups)
- All existing documentation files (*.md, *.txt, docs/, wiki/)
- Existing test files and coverage reports
- Existing config files (CI/CD, deployment, env examples)
- Any existing architecture diagrams or ADRs
- The current tech stack (package.json, requirements.txt, etc.)

Do not read every file yet — just catalogue what exists with paths.

## Step 2 — Map Existing Docs to Framework

Create a mapping table for the project:

| Framework Doc           | Status        | Existing file (if any)      | Quality note          |
|------------------------|---------------|-----------------------------|-----------------------|
| requirements.md        | EXISTS/PARTIAL/MISSING | <path>         | <1-line assessment>   |
| design.md              | EXISTS/PARTIAL/MISSING | <path>         |                       |
| spec.md                | EXISTS/PARTIAL/MISSING | <path>         |                       |
| implementation-plan.md | EXISTS/PARTIAL/MISSING | <path>         |                       |
| architecture.md        | EXISTS/PARTIAL/MISSING | <path>         |                       |
| test-plan.md           | EXISTS/PARTIAL/MISSING | <path>         |                       |
| test-cases.md          | EXISTS/PARTIAL/MISSING | <path>         |                       |
| test-results.md        | EXISTS/PARTIAL/MISSING | <path>         |                       |
| deployment.md          | EXISTS/PARTIAL/MISSING | <path>         |                       |
| changelog.md           | EXISTS/PARTIAL/MISSING | <path>         |                       |

## Step 3 — Identify Current Phase

Based on what exists and the state of the codebase, determine:
- What phase is the project currently in?
- What is the most recent completed phase?
- What is the next required phase?

Present this clearly:
  App: <name>
  Current phase: <phase>
  Last completed: <phase>
  Next action: <what needs to happen>

## Step 4 — Produce Gap Report

List for each app, in priority order:
1. CRITICAL gaps — missing docs that block current or next phase
2. PARTIAL docs — exist but need extending to meet the framework
3. MISSING but not blocking — can be backfilled progressively

## Step 5 — Create /docs/ Structure

If the docs/ folder structure is incomplete:
- Create docs/ subfolders as needed (requirements/, specs/, plans/, tests/, archive/)
- For each MISSING doc: create the file with framework headings only
- For each PARTIAL doc: copy existing content into the framework file,
  preserving all existing content, just adding missing sections as headings
- For each EXISTS doc: create a symlink or note pointing to existing file.
  Do NOT duplicate content.

## Step 6 — Present Action Plan

Show me a prioritised list of what to tackle next, formatted as:

  IMMEDIATE (needed to continue current work):
  1. <action> → /project:<command> <app>

  SHORT TERM (needed before next phase):
  2. <action> → /project:<command> <app>

  BACKFILL (can be done progressively):
  3. <action> → /project:<command> <app>

Wait for my confirmation before taking any action from the plan.

## Arguments
If $ARGUMENTS is provided, scope the audit to that specific app only.
Otherwise audit the entire project.
