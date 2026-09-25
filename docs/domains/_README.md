# Per-domain backlogs

Each domain of the Family Action Hub has its own backlog file. **Each branch touches exactly one domain. Each merge-to-master ships one domain's work.** (See memory: `feedback_single_domain_branches.md`.)

## Domains

| Domain | File | Path in codebase |
|---|---|---|
| Tasks | [tasks.md](tasks.md) | `src/app/(dashboard)/tasks/*`, `src/app/api/tasks/*`, `src/components/tasks/*` |
| Scan (Gmail) | [scan.md](scan.md) | `src/app/(dashboard)/scan/*`, `src/app/api/scan/*`, `src/lib/scan/*` |
| Notion | [notion.md](notion.md) | `src/app/(dashboard)/notion/*`, `src/app/api/notion/*`, `src/components/notion/*` |
| Settings | [settings.md](settings.md) | `src/app/(dashboard)/settings/*`, `src/app/api/settings/*`, `src/components/settings/*` |
| WhatsApp | [whatsapp.md](whatsapp.md) | `src/app/api/whatsapp/*`, `src/lib/whatsapp/*`. Work on normal feature branches; the old `family-action-hub-whatsapp` worktree is stale and must not be used |
| Home/Shell | [home-shell.md](home-shell.md) | `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/ui/*`, `src/components/layout/*` |

**Financials and Invoices are no longer hub domains.** They moved to the separate **boctor-financials** app (canonical checkout `C:/Users/MagedBoctor/Claude/boctor-financials`) and were removed from the hub in P3 (v0.7.0). Their old backlogs are in `docs/archive/financials/`. The hub still shares the Neon database with boctor-financials; `drizzle.config.ts` restricts the hub to its own 18 tables.

## File structure

Each domain file follows the same layout:

- **Shipped** — what's live (one-liners, newest on top)
- **In-flight** — active branches + their state
- **Queued (next)** — what to ship next, ranked
- **Deferred** — intentionally parked, with reason
- **Gaps / rough edges** — known issues not yet queued

## Branch discipline

- Branch names: `feat/<domain>/<name>`, `fix/<domain>/<name>`, `chore/<domain>/<name>`
- Commits cite the domain in the scope: `feat(scan): ...`, `fix(whatsapp): ...`
- Cross-domain work: decompose into multiple branches before writing code
- Shared schema changes (`src/lib/db/schema.ts`): land in a separate `schema/<name>` branch that merges first
- At release gate: each domain gets its own version bump + CHANGELOG entry + commit + Vercel deploy

## Source of truth

- **Ship history:** `docs/CHANGELOG.md`
- **Memory:** `C:\Users\MagedBoctor\.claude\projects\C--Users-MagedBoctor-Claude-family-action-hub\memory\*.md`
- **Per-feature specs (when MED/HIGH tier):** `docs/features/YYYY-MM-DD-<name>.md`
- **Agent workflow specs/plans:** `docs/superpowers/{specs,plans}/` (gitignored — local only)
