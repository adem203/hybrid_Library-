# Déploiement gratuit — Vercel + Render + Neon + Cloudinary

| Couche | Service | Coût |
|--------|---------|------|
| Frontend React | **Vercel** | Gratuit |
| Backend Express | **Render** (Web Service) | Gratuit (s'endort après 15 min) |
| Base PostgreSQL | **Neon** | Gratuit |
| Fichiers (images + documents) | **Cloudinary** | Gratuit |

L'ordre recommandé : **Neon → Cloudinary → Render → Vercel** (chaque étape fournit des valeurs pour la suivante).

---

## 1. Base de données — Neon

1. Créer un projet sur https://neon.tech.
2. Copier la **connection string** (`postgresql://...?sslmode=require`).
3. Charger le schéma puis les migrations depuis votre machine :
   ```bash
   psql "postgresql://...neon...?sslmode=require" -f backend/src/config/schema.sql
   ```
   Puis exécuter chaque migration (en pointant sur Neon) :
   ```bash
   # PowerShell
   $env:DATABASE_URL = "postgresql://...neon...?sslmode=require"
   node backend/src/config/run-migration-004.js
   # ... 005 à 010
   ```

## 2. Fichiers — Cloudinary

1. Créer un compte sur https://cloudinary.com.
2. Dans le **Dashboard**, récupérer : `Cloud name`, `API Key`, `API Secret`.
3. Ces 3 valeurs iront dans les variables d'environnement de Render.

> ⚠️ Limites du tier gratuit appliquées dans le code : **couvertures ≤ 5 Mo**, **documents ≤ 10 Mo**, **vidéos ≤ 100 Mo**. Pour des fichiers plus volumineux, augmenter le plan ou passer à un stockage objet dédié (voir `upload.middleware.js`).

## 3. Backend — Render

1. Pousser le repo sur GitHub.
2. https://render.com → **New → Web Service** → connecter le repo.
3. Configuration :
   - **Root Directory** : `backend`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
4. **Environment Variables** (voir `backend/.env.example`) :
   `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `NODE_ENV=production`,
   `FRONTEND_URL` (URL Vercel — à compléter après l'étape 4),
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
   `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `RESET_CODE_TTL_MINUTES`.
5. Déployer → noter l'URL `https://votre-api.onrender.com`.
6. Vérifier : ouvrir `https://votre-api.onrender.com/health` → doit renvoyer `{"status":"OK",...}`.

> ℹ️ Le tier gratuit s'endort après 15 min d'inactivité (premier appel ≈ 30 s). Les tâches `node-cron` (retards, réservations) ne s'exécutent que si le service est éveillé — pour les garder actives, pinger `/health` régulièrement (ex. https://cron-job.org gratuit).

## 4. Frontend — Vercel

1. https://vercel.com → **Add New → Project** → importer le repo.
2. Configuration :
   - **Root Directory** : `bibliotheque-frontend`
   - Framework : **Create React App** (auto-détecté)
3. **Environment Variable** :
   - `REACT_APP_API_URL = https://votre-api.onrender.com/api/v1`
4. Déployer → noter l'URL `https://mon-app.vercel.app`.
5. Retourner sur **Render** et mettre `FRONTEND_URL = https://mon-app.vercel.app`, puis redéployer le backend (pour le CORS).

---

## Récapitulatif des changements de code effectués
- `backend/src/config/db.js` — connexion via `DATABASE_URL` + SSL (Neon).
- `backend/server.js` — CORS piloté par `FRONTEND_URL`.
- `backend/src/services/storage.service.js` — nouvel envoi des fichiers vers Cloudinary.
- `backend/src/middleware/upload.middleware.js` — stockage en mémoire (plus de disque), limites adaptées au tier gratuit.
- `backend/src/modules/livres/livres.controller.js` — couvertures envoyées sur Cloudinary.
- `backend/src/modules/documents/documents.controller.js` — documents sur Cloudinary, streaming/téléchargement par proxy (contrôle d'accès + Range conservés).
- `bibliotheque-frontend/src/api/api.js` — helper `resolveAssetUrl` (URL absolue Cloudinary ou chemin relatif hérité).
- Dashboards Étudiant/Enseignant — affichage des couvertures via `resolveAssetUrl`.
- `bibliotheque-frontend/vercel.json` — fallback SPA pour React Router.
