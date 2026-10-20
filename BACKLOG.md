# Backlog · Family Action Hub
<!-- std-backlog v1 · read by master-project; ids never reused -->

Started 20 Oct 2026 from the master register (next step, task t-003, AI Apps page). The project's own sessions add to it (skill std-backlog).

## Build backlog

### B-001 · Merge or drop archive/feat-notion-dedupe (20 commits, Aug)
- Type: chore
- Status: ready
- Priority: P2

### B-002 · WhatsApp bot (branch feat/whatsapp-bot on GitHub)
- Type: feature
- Status: idea
- Priority: P3

Worktree archived 19 Oct 2026; port 3001 is free for it. Raise the shared-messaging question before wiring a provider.

### B-003 · Test a restore from backup
- Type: chore
- Status: ready
- Priority: P2

AI Apps page (31 Aug 2026): no app has ever had a restore tested.

### B-004 · Email digest: first live send (sign out/in, Reconnect Gmail)
- Type: chore
- Status: blocked
- Priority: P1
- Target: Nov 2026
- Needs: H-001

v0.8.0 email channel needs the gmail.send grant before the first email can go. Digest channel setting defaults to both.

### B-005 · WhatsApp digest and ops alert: real sender and approved templates
- Type: fix
- Status: blocked
- Priority: P2
- Target: Nov 2026
- Needs: H-002

The sender is Meta's test number with no Business Account, so every send is rejected (131047). Needs a WABA, two approved templates, then three Vercel env vars and a redeploy.

### B-006 · Verify v0.7.0 post-deploy checks (AC-007, TC-003, TC-004, TC-009)
- Type: chore
- Status: ready
- Priority: P2

Pending after the financials decoupling: boctor-financials baseline checks, re-sign-in and Reconnect Gmail, and a bf Inbox preview.

### B-007 · Remove the 3 leftover hub Vercel env vars (TC-010)
- Type: chore
- Status: ready
- Priority: P2

GDRIVE_FINANCIALS_FOLDER_ID, FINANCIAL_PARSE_MODEL and BLOB_READ_WRITE_TOKEN are no longer used since v0.7.0.

### B-008 · Onboard Mandy as a real hub user
- Type: use case
- Status: blocked
- Priority: P2
- Target: Nov 2026
- Needs: H-003

Digest replies from Mandy are attributed to Maged until she has a user record. Then add users.whatsapp_e164 and switch the reply handler to phone lookup.

### B-009 · Clean up the 5 emails reset to unreviewed for digest testing
- Type: chore
- Status: idea
- Priority: P3

Reset on 20 Apr 2026 to seed digest tests; triage them through the digest or reject them.

### B-010 · Notion hygiene v2.0 checks
- Type: feature
- Status: idea
- Priority: P3

Orphan, stale, broken-link, empty, untitled, oversized, permission, schema and tag checks. The current tool does dedupe only.

### B-011 · Revisit the portal landing page and main menu
- Type: change
- Status: idea
- Priority: P3

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
