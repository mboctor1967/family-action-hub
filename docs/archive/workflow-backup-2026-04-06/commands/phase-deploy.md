---
description: Prepare deployment documentation — pre-deployment checklist, env vars, migrations, rollback procedure, and smoke tests. Run this after test execution and before /project:release. The release command is the actual gate before committing and deploying.
argument-hint: "<app name>"
---

# Deployment Documentation Phase — $ARGUMENTS

This phase prepares the deployment doc.
The actual version bump, release notes, and commit/deploy gates
are all handled by /project:release — run that after this.

## Step 1 — Gather Deployment Information

Spawn an explorer sub-agent to collect:
- All new or changed environment variables (scan .env.example, config files)
- All new database migrations (scan /migrations/ or equivalent)
- All new API endpoints added in this release
- Any changes to external service integrations
- Any breaking changes to existing APIs or contracts

## Step 2 — Write / Update Deployment Doc

Write or update /apps/<app>/docs/deployment.md:

---
Doc version: v0.1 (increment if updating existing)
Last updated: YYYY-MM-DD
Status: DRAFT
App version at last update: v0.x.x
---

# Deployment — <app name>

## Pre-Deployment Checklist
- [ ] All tests passing (see test-results.md)
- [ ] Environment variables configured in Vercel project settings
- [ ] Database migrations ready to run
- [ ] Rollback plan confirmed
- [ ] /project:release gate completed

## Environment Variables
| Variable        | Required | Description           | Default | Added in  |
|-----------------|----------|-----------------------|---------|-----------|
| EXISTING_VAR    | yes      | <what it does>        | none    | v0.1.0    |
| NEW_VAR         | yes      | <what it does>        | none    | v<this>   |

## Database Migrations
Run in order before deploying:
1. <migration file> — <what it does> — Reversible: YES | NO

## Deployment Steps
1. Push to main / merge PR
2. Vercel auto-deploys (or manual trigger if needed)
3. Run database migrations in production
4. Verify environment variables are set in Vercel dashboard
5. Run smoke tests (see below)

## Smoke Tests Post-Deploy
Critical paths to verify immediately after deployment:
- [ ] <critical endpoint or user journey>
- [ ] <auth flow works>
- [ ] <key feature accessible>

## Rollback Procedure
If deployment fails or smoke tests fail:
1. Revert Vercel deployment to previous version via Vercel dashboard
2. If migrations ran: <rollback migration command or note if irreversible>
3. Notify: <who to tell>
4. Document in this file: what failed and why

## Deployment History
| Version  | Date       | Status  | Notes              |
|----------|------------|---------|--------------------|
| v0.x.x   | YYYY-MM-DD | SUCCESS |                    |

## Step 3 — Confirm

Present:
- N new environment variables
- N database migrations
- N smoke test items
- Rollback complexity: LOW | MEDIUM | HIGH

Wait for my confirmation, then run /project:release to complete
the version bump, release notes, and commit/deploy gates.
