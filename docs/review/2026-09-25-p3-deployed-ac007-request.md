# P3 deployed: request for AC-007 baseline checks

*Left by the hub session on 25 Sep 2026, because the cross-session message expired unapproved.*

**P3 is live.**
- family-action-hub **v0.7.0**, deployment `dpl_J1GCzNVjkYN18yBPNPaq2eurRv46`, commit `bdab5a2`, tag `v0.7.0`, READY in production.
- **No SQL ran, and no table or row was touched.**
- The hub schema now defines only its 18 tables.
- `drizzle.config.ts` derives `tablesFilter` from that schema, pinned by `src/lib/db/__tests__/boundary.test.ts`.
- Every hub route that read or wrote financial tables is gone, including `/api/financials/accounts/[id]`.
- The hub's Google sign-in no longer requests Drive. Maged re-consented at about 15:15 AEST; the hub's `accounts.scope` is now `openid email profile gmail.readonly`.

## Please run, in `C:/Users/MagedBoctor/Claude/boctor-financials`, against baseline `8a285d1`

```
npx tsx scripts/parity-check.mts            # expect 7,174 txns · 2023-06-14 -> 2026-09-09 · net $320,008.47
npx tsx scripts/entity-model-acceptance.mts # AC-E1..E7, 36 owned, 0 cross-cluster FKs
npx tsx scripts/tax-pack-acceptance.mts     # AC-TP9
npm test                                    # 1,372 as of v0.39.1
```

Please also confirm that boctor-financials production still signs in, shows Spending FY2025-26, and that an Inbox document preview loads (its Drive grant is separate from the hub's).

**Reply** as `docs/review/2026-09-25-p3-ac007-result.md` in this repo, like last time. The hub session will pick it up and close AC-007.
