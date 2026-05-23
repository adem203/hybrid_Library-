-- =========================================================
-- Migration 004 : OTP email pour register et login
-- =========================================================
-- Cree deux tables :
--   - pending_registrations : stocke les inscriptions en attente
--     de verification OTP. La ligne dans utilisateurs n'est creee
--     qu'apres validation du code.
--   - login_otps : stocke les codes OTP envoyes lors d'un login
--     valide (apres verification email + mot de passe).
-- =========================================================

CREATE TABLE IF NOT EXISTS pending_registrations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE')),
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires_at
    ON pending_registrations(expires_at);

CREATE TABLE IF NOT EXISTS login_otps (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_otps_user_unused
    ON login_otps(user_id, created_at DESC) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_login_otps_expires_at
    ON login_otps(expires_at);

-- Permissions pour le role applicatif
DO $$
DECLARE
    app_role text := 'biblio_user';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pending_registrations TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE pending_registrations_id_seq TO %I', app_role);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE login_otps TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE login_otps_id_seq TO %I', app_role);
    END IF;
END $$;
