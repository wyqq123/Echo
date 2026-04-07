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
  "duration" = COALESCE((payload->>'duration')::integer, "duration");

CREATE INDEX "Task_user_id_date_str_idx" ON "Task"("user_id", "date_str");
CREATE INDEX "Task_user_id_status_idx" ON "Task"("user_id", "status");
