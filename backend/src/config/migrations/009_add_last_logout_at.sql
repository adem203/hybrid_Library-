-- Add a nullable timestamp recording the last time a user explicitly signed out.
-- Safe to run multiple times: column add is IF NOT EXISTS, no data is rewritten.

BEGIN;

ALTER TABLE utilisateurs
ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMP NULL;

COMMIT;
