-- Repair rows migrated under the old backfill where duration stayed NULL (JSON had no duration).
-- GET still merges from this column when payload omits duration; this aligns DB with that contract.
UPDATE "Task"
SET "duration" = 30
WHERE "duration" IS NULL;
