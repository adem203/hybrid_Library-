-- =========================================================
-- SCHÉMA COMPLET : Module Bibliothèque Hybride - Educated
-- =========================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- TABLE : utilisateurs
-- =========================================================
CREATE TABLE IF NOT EXISTS utilisateurs (
    id_user SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    mot_de_passe VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE', 'ADMIN', 'GUEST')),
    matricule VARCHAR(20) UNIQUE,
    est_bloque BOOLEAN DEFAULT FALSE,
    password_changed_at TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    last_logout_at TIMESTAMP NULL,
    date_creation TIMESTAMP DEFAULT NOW(),
    date_modification TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- TABLE : categories
-- =========================================================
CREATE TABLE IF NOT EXISTS categories (
    id_categorie SERIAL PRIMARY KEY,
    libelle VARCHAR(100) NOT NULL UNIQUE,
    tags TEXT,
    date_creation TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- TABLE : ressources (table parente - héritage JOINED)
-- =========================================================
CREATE TABLE IF NOT EXISTS ressources (
    id_ressource SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    auteur VARCHAR(150),
    date_publication DATE,
    description TEXT,
    image_couverture VARCHAR(500),
    id_categorie INTEGER REFERENCES categories(id_categorie) ON DELETE SET NULL,
    type_ressource VARCHAR(20) NOT NULL CHECK (type_ressource IN ('PHYSIQUE', 'NUMERIQUE')),
    date_creation TIMESTAMP DEFAULT NOW(),
    date_modification TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- TABLE : livres_physiques (hérite de ressources)
-- =========================================================
CREATE TABLE IF NOT EXISTS livres_physiques (
    id_ressource INTEGER PRIMARY KEY REFERENCES ressources(id_ressource) ON DELETE CASCADE,
    isbn VARCHAR(20) UNIQUE,
    emplacement_rayon VARCHAR(100),
    stock_total INTEGER NOT NULL DEFAULT 1 CHECK (stock_total >= 0),
    stock_disponible INTEGER NOT NULL DEFAULT 1 CHECK (stock_disponible >= 0)
);

-- =========================================================
-- TABLE : documents_numeriques (hérite de ressources)
-- =========================================================
CREATE TABLE IF NOT EXISTS documents_numeriques (
    id_ressource INTEGER PRIMARY KEY REFERENCES ressources(id_ressource) ON DELETE CASCADE,
    url_fichier VARCHAR(500) NOT NULL,
    nom_fichier VARCHAR(255) NOT NULL,
    format VARCHAR(20) NOT NULL CHECK (format IN ('PDF', 'MP4', 'DOCX', 'PPTX', 'XLSX', 'ZIP', 'AUTRE')),
    taille_ko INTEGER,
    est_telechargeable BOOLEAN DEFAULT TRUE,
    nb_consultations INTEGER DEFAULT 0,
    id_uploade_par INTEGER REFERENCES utilisateurs(id_user) ON DELETE SET NULL
);

-- =========================================================
-- TABLE : emprunts
-- =========================================================
CREATE TABLE IF NOT EXISTS emprunts (
    id_emprunt SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
    id_livre INTEGER NOT NULL REFERENCES livres_physiques(id_ressource) ON DELETE CASCADE,
    date_emprunt TIMESTAMP DEFAULT NOW(),
    date_retour_prevue DATE NOT NULL,
    date_retour_effectif TIMESTAMP,
    statut VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE'
        CHECK (statut IN ('EN_ATTENTE', 'EN_COURS', 'RETOURNE', 'EN_RETARD', 'ANNULE', 'REFUSE')),
    penalite_montant INTEGER DEFAULT 0,
    notes_biblio TEXT,
    date_creation TIMESTAMP DEFAULT NOW(),
    date_modification TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- TABLE : reservations
-- =========================================================
CREATE TABLE IF NOT EXISTS reservations (
    id_reservation SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
    id_livre INTEGER NOT NULL REFERENCES livres_physiques(id_ressource) ON DELETE CASCADE,
    date_reservation TIMESTAMP DEFAULT NOW(),
    statut VARCHAR(20) DEFAULT 'EN_ATTENTE'
        CHECK (statut IN ('EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'EXPIREE'))
);

-- =========================================================
-- TABLE : historique_lectures
-- =========================================================
CREATE TABLE IF NOT EXISTS historique_lectures (
    id SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
    id_document INTEGER NOT NULL REFERENCES documents_numeriques(id_ressource) ON DELETE CASCADE,
    date_lecture TIMESTAMP DEFAULT NOW(),
    temps_passe_secondes INTEGER DEFAULT 0,
    pages_consultees INTEGER DEFAULT 0
);

-- =========================================================
-- TABLE : password_reset_codes
-- =========================================================
CREATE TABLE IF NOT EXISTS password_reset_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- TABLE : pending_registrations (inscriptions en attente OTP)
-- =========================================================
CREATE TABLE IF NOT EXISTS pending_registrations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE', 'GUEST')),
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================================================
-- TABLE : login_otps (2FA email pour chaque connexion)
-- =========================================================
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

-- =========================================================
-- INDEX pour les recherches fréquentes
-- =========================================================
-- =========================================================
-- TABLE : support_tickets
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

CREATE INDEX IF NOT EXISTS idx_ressources_titre ON ressources USING gin(to_tsvector('french', titre));
CREATE INDEX IF NOT EXISTS idx_ressources_auteur ON ressources(auteur);
CREATE INDEX IF NOT EXISTS idx_emprunts_user ON emprunts(id_user);
CREATE INDEX IF NOT EXISTS idx_emprunts_statut ON emprunts(statut);
CREATE INDEX IF NOT EXISTS idx_emprunts_retard ON emprunts(date_retour_prevue) WHERE statut = 'EN_COURS';
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_unused ON password_reset_codes(user_id, created_at DESC) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at ON password_reset_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires_at ON pending_registrations(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_otps_user_unused ON login_otps(user_id, created_at DESC) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_login_otps_expires_at ON login_otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created ON support_tickets(id_user, date_creation DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_statut ON support_tickets(statut);

-- =========================================================
-- TABLE : notifications (admin inbox)
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
        CHECK (recipient_role IN ('ADMIN', 'BIBLIOTHECAIRE', 'ENSEIGNANT', 'ETUDIANT')),
    recipient_id    INTEGER REFERENCES utilisateurs(id_user) ON DELETE CASCADE,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    related_entity_type VARCHAR(50),
    related_entity_id   INTEGER,
    target_url      VARCHAR(255),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMP,
    CHECK (recipient_role IS NOT NULL OR recipient_id IS NOT NULL)
);

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

DO $$
DECLARE
    app_role text := 'biblio_user';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE password_reset_codes TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE password_reset_codes_id_seq TO %I', app_role);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pending_registrations TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE pending_registrations_id_seq TO %I', app_role);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE login_otps TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE login_otps_id_seq TO %I', app_role);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE support_tickets TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE support_tickets_id_ticket_seq TO %I', app_role);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notifications TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO %I', app_role);
    END IF;
END $$;

-- =========================================================
-- DONNÉES INITIALES (seed)
-- =========================================================

-- Catégories de base
INSERT INTO categories (libelle, tags) VALUES
    ('Informatique', 'programmation,algorithmes,réseau,base de données'),
    ('Mathématiques', 'algèbre,analyse,statistiques,probabilités'),
    ('Physique', 'mécanique,électromagnétisme,thermodynamique'),
    ('Chimie', 'organique,inorganique,biochimie'),
    ('Économie', 'microéconomie,macroéconomie,finance,gestion'),
    ('Droit', 'civil,commercial,pénal,administratif'),
    ('Langues', 'arabe,français,anglais,espagnol'),
    ('Sciences Humaines', 'philosophie,sociologie,psychologie,histoire')
ON CONFLICT (libelle) DO NOTHING;

-- Compte Bibliothécaire par défaut (mot de passe: Admin@123)
-- Le mot de passe sera haché à l'application, mais pour démarrer :
INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role)
VALUES (
    'Admin', 'Bibliothèque',
    'admin@educated.tn',
    '$2a$10$Y7PbeFfg/wRfLbG3HZPHAuDpgq/7Ym4GEiIWe3X0Wb7DfX2pGvmMG',
    'BIBLIOTHECAIRE'
) ON CONFLICT (email) DO NOTHING;
-- Note: Ce hash correspond au mot de passe: Admin@123
