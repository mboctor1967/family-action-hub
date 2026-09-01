-- S1 — export_jobs.requested_by: uuid FK -> profiles.id  becomes  text (email).
--
-- Why: the Boctor Financials extraction requires zero references from the financials
-- table cluster into the hub cluster, so the new app can own its 14 tables outright.
-- See docs/features/2026-08-31-boctor-financials-extraction.md (S1).
--
-- Idempotent: guarded on the column still being uuid, so re-running is a no-op.
-- Safe to run while the hub is live — the column is nullable, and the deployed code
-- only reads it for ownership display. Orphaned rows are already NULL because the
-- original constraint was ON DELETE SET NULL, so the backfill loses nothing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'export_jobs'
      AND column_name = 'requested_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE export_jobs ADD COLUMN requested_by_email text;

    UPDATE export_jobs ej
       SET requested_by_email = p.email
      FROM profiles p
     WHERE ej.requested_by = p.id;

    ALTER TABLE export_jobs DROP COLUMN requested_by;
    ALTER TABLE export_jobs RENAME COLUMN requested_by_email TO requested_by;

    RAISE NOTICE 'S1 applied: export_jobs.requested_by is now text';
  ELSE
    RAISE NOTICE 'S1 already applied, skipping';
  END IF;
END $$;
