-- =========================================================
-- Migration 007 : Add GUEST role
-- =========================================================
-- Public self-registration must create only GUEST accounts.
-- STUDENT / TEACHER / ADMIN accounts are created by staff
-- via the admin user management UI.
--
-- GUEST has no access to protected dashboards. The role check
-- middleware (roles.middleware.js) does not list GUEST in any
-- protected route, so guests are denied by default.
-- =========================================================

-- Extend the role CHECK constraint on utilisateurs
ALTER TABLE utilisateurs
    DROP CONSTRAINT IF EXISTS utilisateurs_role_check;

ALTER TABLE utilisateurs
    ADD CONSTRAINT utilisateurs_role_check
    CHECK (role IN ('ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE', 'ADMIN', 'GUEST'));

-- Extend the role CHECK constraint on pending_registrations
ALTER TABLE pending_registrations
    DROP CONSTRAINT IF EXISTS pending_registrations_role_check;

ALTER TABLE pending_registrations
    ADD CONSTRAINT pending_registrations_role_check
    CHECK (role IN ('ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE', 'GUEST'));
