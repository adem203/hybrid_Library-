# Module Bibliotheque Hybride - Educated ERP

Backend Node.js/Express pour gerer une bibliotheque hybride (livres physiques + documents numeriques) avec authentification JWT, roles, emprunts, reservations et statistiques.

## Stack technique

- Node.js + Express
- PostgreSQL (`pg`)
- Authentification JWT (`jsonwebtoken`)
- Validation (`express-validator`)
- Upload fichiers (`multer`)
- Cron jobs (`node-cron`)

## Structure du projet

```text
backend/
  package.json
  server.js
  src/
    config/
      db.js
      schema.sql
    jobs/
      penalites.job.js
    middleware/
      auth.middleware.js
      roles.middleware.js
      upload.middleware.js
    modules/
      auth/
      categories/
      documents/
      emprunts/
      livres/
      stats/
  uploads/
```

## Prerequis

- Node.js 18+
- PostgreSQL 13+
- npm

## Installation

1. Aller dans le dossier backend:

```bash
cd backend
```

2. Installer les dependances:

```bash
npm install
```

3. Creer un fichier `.env` dans `backend/` avec les variables suivantes:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=bibliotheque
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=votre_cle_tres_secrete
JWT_EXPIRES_IN=24h

UPLOAD_PATH=./uploads
MAX_FILE_SIZE_MB=50
PENALITE_PAR_JOUR=100
```

4. Initialiser la base de donnees avec le schema:

- Executer le contenu de `backend/src/config/schema.sql` sur votre base PostgreSQL.

5. Demarrer le serveur:

```bash
npm run dev
```

## Lancement

Depuis `backend/`:

- Mode developpement: `npm run dev`
- Mode production: `npm start`

## URL et health check

- Base API: `http://localhost:5000/api/v1`
- Health check: `http://localhost:5000/health`

## Modules API principaux

Tous les endpoints sont prefixes par `/api/v1`.

- `auth`:
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/me`
  - `PUT /auth/change-password`
- `categories`:
  - CRUD des categories
- `livres`:
  - recherche, listing, creation/modification/suppression (selon role)
- `documents`:
  - listing, lecture/stream, telechargement, upload, suppression (selon role)
- `emprunts`:
  - demandes, annulation, retours, retards, reservations
- `stats`:
  - dashboard, repartitions, ressources populaires, statistiques emprunts

## Roles

Roles supportes:

- `ETUDIANT`
- `ENSEIGNANT`
- `BIBLIOTHECAIRE`
- `ADMIN`

Le controle d'acces est gere via les middlewares d'authentification et de roles.

## Fichiers uploades

Les fichiers uploades sont servis via:

- `/uploads/...`

Le dossier utilise est configure par `UPLOAD_PATH`.

## Seed initial

Le schema SQL insere:

- des categories de base
- un compte bibliothecaire par defaut:
  - email: `admin@educated.tn`
  - mot de passe: `Admin@123`

Pensez a changer ce mot de passe en environnement reel.

## Licence

Ce projet contient un fichier `LICENSE` a la racine du workspace.
