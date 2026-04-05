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
    role VARCHAR(30) NOT NULL CHECK (role IN ('ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE', 'ADMIN')),
    est_bloque BOOLEAN DEFAULT FALSE,
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
-- INDEX pour les recherches fréquentes
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_ressources_titre ON ressources USING gin(to_tsvector('french', titre));
CREATE INDEX IF NOT EXISTS idx_ressources_auteur ON ressources(auteur);
CREATE INDEX IF NOT EXISTS idx_emprunts_user ON emprunts(id_user);
CREATE INDEX IF NOT EXISTS idx_emprunts_statut ON emprunts(statut);
CREATE INDEX IF NOT EXISTS idx_emprunts_retard ON emprunts(date_retour_prevue) WHERE statut = 'EN_COURS';

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