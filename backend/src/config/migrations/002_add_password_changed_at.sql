-- Track the last successful password change for monthly change limits.
-- Existing NULL values mean the user is allowed to change password.

ALTER TABLE utilisateurs
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP NULL;
