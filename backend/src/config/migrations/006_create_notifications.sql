-- =========================================================
-- Migration 006 : notifications (admin inbox)
-- =========================================================

CREATE TABLE IF NOT EXISTS notifications (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    message         TEXT         NOT NULL,
    type            VARCHAR(50)  NOT NULL
        CHECK (type IN ('BOOK_RESERVATION', 'SUPPORT_TICKET',
                        'DOCUMENT_UPLOAD',  'OVERDUE_LOAN',
                        'BOOK_LOAN_REQUEST', 'GENERAL')),
    recipient_role  VARCHAR(30)
        CHECK (recipient_role IN ('ADMIN', 'BIBLIOTHECAIRE',
                                  'ENSEIGNANT', 'ETUDIANT')),
    recipient_id    INTEGER REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    related_entity_type VARCHAR(50),
    related_entity_id   INTEGER,
    target_url      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMP,

    -- At least one of recipient_role / recipient_id must be set
    CHECK (recipient_role IS NOT NULL OR recipient_id IS NOT NULL)
);

-- Prevent duplicate notifications for the same action.
-- We COALESCE the nullable columns so ON CONFLICT actually dedups
-- (a plain UNIQUE constraint treats NULLs as distinct in PostgreSQL).
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_unique
    ON notifications (
        type,
        COALESCE(related_entity_type, ''),
        COALESCE(related_entity_id, 0),
        COALESCE(recipient_role, ''),
        COALESCE(recipient_id, 0)
    );

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role_unread
    ON notifications(recipient_role, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id_unread
    ON notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created
    ON notifications(created_at DESC);

DO $$
DECLARE
    app_role text := 'biblio_user';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notifications TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO %I', app_role);
    END IF;
END $$;
