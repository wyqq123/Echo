-- Scope legacy theme primary keys per user so multiple accounts can share the same client id (e.g. "health").
UPDATE "FocusTheme"
SET "id" = "user_id" || '::' || "id"
WHERE strpos("id", '::') = 0;
