# Backlog · Family Action Hub
<!-- std-backlog v1 · read by master-project; ids never reused -->

Started 20 Oct 2026 from the master register (next step, task t-003, AI Apps page). The project's own sessions add to it (skill std-backlog).

## Build backlog

### B-001 · Merge or drop archive/feat-notion-dedupe (20 commits, Aug)
- Type: chore
- Status: ready
- Priority: P2
- Size: M

### B-002 · WhatsApp bot (branch feat/whatsapp-bot on GitHub)
- Type: feature
- Status: idea
- Priority: P3
- Size: L

Worktree archived 19 Oct 2026; port 3001 is free for it. Raise the shared-messaging question before wiring a provider.

### B-003 · Test a restore from backup
- Type: chore
- Status: ready
- Priority: P2
- Size: M

AI Apps page (31 Aug 2026): no app has ever had a restore tested.

### B-004 · Email digest: first live send (sign out/in, Reconnect Gmail)
- Type: chore
- Status: blocked
- Priority: P1
- Target: Nov 2026
- Needs: H-001
- Size: S

v0.8.0 email channel needs the gmail.send grant before the first email can go. Digest channel setting defaults to both.

### B-005 · WhatsApp digest and ops alert: real sender and approved templates
- Type: fix
- Status: blocked
- Priority: P2
- Target: Nov 2026
- Needs: H-002
- Size: M

The sender is Meta's test number with no Business Account, so every send is rejected (131047). Needs a WABA, two approved templates, then three Vercel env vars and a redeploy.

### B-006 · Verify v0.7.0 post-deploy checks (AC-007, TC-003, TC-004, TC-009)
- Type: chore
- Status: ready
- Priority: P2
- Size: S

Pending after the financials decoupling: boctor-financials baseline checks, re-sign-in and Reconnect Gmail, and a bf Inbox preview.

### B-007 · Remove the 3 leftover hub Vercel env vars (TC-010)
- Type: chore
- Status: ready
- Priority: P2
- Size: S

GDRIVE_FINANCIALS_FOLDER_ID, FINANCIAL_PARSE_MODEL and BLOB_READ_WRITE_TOKEN are no longer used since v0.7.0.

### B-008 · Onboard Mandy as a real hub user
- Type: use case
- Status: blocked
- Priority: P2
- Target: Nov 2026
- Needs: H-003
- Size: L

Digest replies from Mandy are attributed to Maged until she has a user record. Then add users.whatsapp_e164 and switch the reply handler to phone lookup.

### B-009 · Clean up the 5 emails reset to unreviewed for digest testing
- Type: chore
- Status: idea
- Priority: P3
- Size: S

Reset on 20 Apr 2026 to seed digest tests; triage them through the digest or reject them.

### B-010 · Notion hygiene v2.0 checks
- Type: feature
- Status: idea
- Priority: P3
- Size: XL

Orphan, stale, broken-link, empty, untitled, oversized, permission, schema and tag checks. The current tool does dedupe only.

### B-011 · Revisit the portal landing page and main menu
- Type: change
- Status: idea
- Priority: P3
- Size: M

### B-012 · Hub foundation: Gmail scanning, tasks and AI email classification
- Type: use case
- Status: done
- Priority: P2
- Size: XL

Backfilled (D18): delivered 2026-04 before the backlog existed. 2026-04-03 feat: family action hub with Gmail scanning, tasks, AI

### B-013 · Assumptions and rules page by financial year
- Type: feature
- Status: done
- Priority: P2
- Size: L

Backfilled (D18): delivered 2026-04 before the backlog existed. 7 feat(assumptions) commits 2026-04-05: FY tabs, CRUD, copy-from-previous-FY

### B-014 · Tax prep accountant pack export
- Type: feature
- Status: done
- Priority: P2
- Size: L

Backfilled (D18): delivered 2026-04 before the backlog existed. v0.1.2 tax prep accountant pack + SSE bundler fix

### B-015 · Invoice scanner integrated into the hub with supplier rules and exports
- Type: use case
- Status: done
- Priority: P2
- Size: XL

Backfilled (D18): delivered 2026-04 before the backlog existed. v0.1.3: invoice reader port, FY scan, CSV/Excel/ZIP export, calibration

### B-016 · Bank transaction import with fingerprinting, trends and coverage
- Type: feature
- Status: done
- Priority: P2
- Size: L

Backfilled (D18): delivered 2026-04 before the backlog existed. QIF import, fingerprinting, spending trend chart, coverage tab 2026-04-16

### B-017 · Notion duplicate finder and bulk archive tool
- Type: use case
- Status: done
- Priority: P2
- Size: XL

Backfilled (D18): delivered 2026-04 before the backlog existed. ~20 feat(notion) commits: upload, review clusters, archive with retry

### B-018 · One-click bulk email triage into tasks
- Type: feature
- Status: done
- Priority: P2
- Size: M

Backfilled (D18): delivered 2026-04 before the backlog existed. v0.2.1 simplified triage: checkbox, batch route, ?new task highlight

### B-019 · WhatsApp group bot with commands
- Type: feature
- Status: done
- Priority: P2
- Size: L

Backfilled (D18): delivered 2026-04 before the backlog existed. v0.3.0 webhook, commands, parsers, 21 tests; v0.3.1 polish

### B-020 · Public privacy and terms pages
- Type: chore
- Status: done
- Priority: P2
- Size: S

Backfilled (D18): delivered 2026-04 before the backlog existed. v0.2.2 /privacy and /terms public pages

### B-021 · Home and navigation polish: compact cards, scan-tasks links, bot card
- Type: change
- Status: done
- Priority: P2
- Size: M

Backfilled (D18): delivered 2026-04 before the backlog existed. v0.1.1 nav cleanup, v0.3.2 bot stat card, v0.3.3 scan-tasks nav

### B-022 · Daily Gmail digest on WhatsApp with reply-to-triage
- Type: use case
- Status: done
- Priority: P2
- Size: XL

Backfilled (D18): delivered 2026-04 before the backlog existed. v0.4.0: snapshots, priority scoring, reply commands, 20:00 cron

### B-023 · Scan reliability: fail loudly, alert operator, Gmail health
- Type: fix
- Status: done
- Priority: P2
- Size: M

Backfilled (D18): delivered 2026-08 before the backlog existed. v0.4.2 scan_runs errors, health fields, digest suppression and alert

### B-024 · Digest limited to emails from the last 7 days
- Type: fix
- Status: done
- Priority: P2
- Size: S

Backfilled (D18): delivered 2026-08 before the backlog existed. v0.5.0 bound daily digest to 7-day age cap

### B-025 · WhatsApp delivery reliability: templates, delivery log, health panel
- Type: fix
- Status: done
- Priority: P2
- Size: L

Backfilled (D18): delivered 2026-09 before the backlog existed. v0.6.0 approved templates, outbound log, send-now, missed-email backfill

### B-026 · Financials moved out of the hub to Boctor Financials
- Type: change
- Status: done
- Priority: P2
- Size: L

Backfilled (D18): delivered 2026-09 before the backlog existed. Extraction design Aug; v0.7.0 drops 14 tables, cards, commands, Drive scope

### B-027 · Digest delivered by email as well as WhatsApp
- Type: feature
- Status: done
- Priority: P2
- Size: M

Backfilled (D18): delivered 2026-10 before the backlog existed. v0.8.0 email channel with channel setting; v0.8.1 acceptance fix

## Human actions

### H-001 · Sign out and in, then Reconnect Gmail in the hub (for the email digest)
- Who: maged
- By: Nov 2026
- Unblocks: B-004
- Status: open

### H-002 · Set up WhatsApp Business Account in Meta and get two digest templates approved
- Who: maged
- By: Nov 2026
- Unblocks: B-005
- Status: open

### H-003 · Sign Mandy in to the hub so she gets a user record
- Who: mandy
- By: Nov 2026
- Unblocks: B-008
- Status: open
