-- =========================================================
-- Migration 005 : support tickets etudiants
-- =========================================================

CREATE TABLE IF NOT EXISTS support_tickets (
    id_ticket SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
    sujet VARCHAR(255) NOT NULL,
    type_probleme VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    related_text VARCHAR(255),
    statut VARCHAR(50) NOT NULL DEFAULT 'EN_ATTENTE'
        CHECK (statut IN ('EN_ATTENTE', 'REPONDU', 'FERME')),
    reponse_admin TEXT,
    date_creation TIMESTAMP DEFAULT NOW(),
    date_reponse TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created
    ON support_tickets(id_user, date_creation DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_statut
    ON support_tickets(statut);

DO $$
DECLARE
    app_role text := 'biblio_user';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE support_tickets TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE support_tickets_id_ticket_seq TO %I', app_role);
    END IF;
END $$;
