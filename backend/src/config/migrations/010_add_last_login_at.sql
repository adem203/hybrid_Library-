-- Add a nullable timestamp recording the last time a user completed login
-- (i.e. successfully validated the OTP in /auth/verify-login). Safe to run
-- multiple times: column add is IF NOT EXISTS, no data is rewritten.

BEGIN;

ALTER TABLE utilisateurs
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL;

COMMIT;
