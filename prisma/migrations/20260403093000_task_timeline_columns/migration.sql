-- Add queryable task columns for timeline/state persistence.
ALTER TABLE "Task"
ADD COLUMN "title" TEXT,
ADD COLUMN "status" TEXT,
ADD COLUMN "is_anchor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "is_frozen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "date_str" TEXT,
ADD COLUMN "start_time" TEXT,
ADD COLUMN "duration" INTEGER;

-- Backfill from JSON payload where present.
UPDATE "Task"
SET
  "title" = COALESCE(payload->>'title', "title"),
  "status" = COALESCE(payload->>'status', "status"),
  "is_anchor" = COALESCE((payload->>'isAnchor')::boolean, "is_anchor"),
  "is_frozen" = COALESCE((payload->>'isFrozen')::boolean, "is_frozen"),
  "is_archived" = COALESCE((payload->>'isArchived')::boolean, "is_archived"),
  "completed" = COALESCE((payload->>'completed')::boolean, "completed"),
  "date_str" = COALESCE(payload->>'dateStr', "date_str"),
  "start_time" = COALESCE(payload->>'startTime', "start_time"),
  -- Column starts NULL; COALESCE(..., "duration") would keep NULL when JSON omits duration.
  -- Default matches server normalizeTaskForStorage (tasks.js) so denormalized column is safe for queries.
  -- Regex avoids ::integer cast errors on non-numeric JSON text.
  "duration" = GREATEST(1, COALESCE(
    CASE
      WHEN (payload->>'duration') IS NOT NULL
        AND btrim(payload->>'duration') <> ''
        AND (payload->>'duration') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN ROUND((payload->>'duration')::numeric)::integer
      ELSE NULL
    END,
    30
  ));

CREATE INDEX "Task_user_id_date_str_idx" ON "Task"("user_id", "date_str");
CREATE INDEX "Task_user_id_status_idx" ON "Task"("user_id", "status");
