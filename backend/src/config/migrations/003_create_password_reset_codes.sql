-- Create hashed verification-code storage for forgot-password flow.
-- Run this once on an existing database before using password reset.

BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_unused
ON password_reset_codes (user_id, created_at DESC)
WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at
ON password_reset_codes (expires_at);

-- The table can be created from pgAdmin with a privileged role (for example postgres).
-- Grant the backend database role the rights it needs to write reset codes.
-- If your backend DB_USER is different, replace biblio_user with that role name.
DO $$
DECLARE
  app_role text := 'biblio_user';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE password_reset_codes TO %I',
      app_role
    );
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE password_reset_codes_id_seq TO %I',
      app_role
    );
  END IF;
END $$;

COMMIT;
