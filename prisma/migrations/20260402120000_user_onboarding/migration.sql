-- AlterTable
ALTER TABLE "User" ADD COLUMN "display_name" TEXT,
ADD COLUMN "avatar_url" TEXT,
ADD COLUMN "role_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "field_domain" TEXT,
ADD COLUMN "onboarding_completed_at" TIMESTAMP(3);

-- Existing accounts: treat as already onboarded so they are not forced through the flow again
UPDATE "User" SET "onboarding_completed_at" = "created_at" WHERE "onboarding_completed_at" IS NULL;
