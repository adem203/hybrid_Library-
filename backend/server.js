// ============================================================
// server.js - Point d'entrée principal
// Module Bibliothèque Hybride - ERP Educated
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Import des routes
const authRoutes = require('./src/modules/auth/auth.routes');
const categoriesRoutes = require('./src/modules/categories/categories.routes');
const livresRoutes = require('./src/modules/livres/livres.routes');
const documentsRoutes = require('./src/modules/documents/documents.routes');
const empruntsRoutes = require('./src/modules/emprunts/emprunts.routes');
const statsRoutes = require('./src/modules/stats/stats.routes');
const supportRoutes = require('./src/modules/support/support.routes');
const notificationsRoutes = require('./src/modules/notifications/notifications.routes');

// Import des tâches cron
const { initJobs } = require('./src/jobs/penalites.job');

const app = express();
const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────────
// Middlewares globaux
// ─────────────────────────────────────────────

// Sécurité HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Pour servir les fichiers
}));

// CORS - Autoriser le frontend
// En production, définir FRONTEND_URL (ex: https://mon-app.vercel.app).
// Plusieurs origines possibles via une liste séparée par des virgules.
// Robustesse : on ignore un éventuel slash final et on autorise
// automatiquement tous les sous-domaines *.vercel.app (déploiements preview).
const normalizeOrigin = (o) => String(o || '').trim().replace(/\/+$/, '');

const allowedOrigins = [
  'http://localhost:3000',   // React
  'http://localhost:4200',   // Angular
  'http://localhost:8080',
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(normalizeOrigin).filter(Boolean)
    : []),
];

const isAllowedOrigin = (origin) => {
  const o = normalizeOrigin(origin);
  if (allowedOrigins.includes(o)) return true;
  // Autorise le domaine de production et les previews Vercel.
  if (/^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(o)) return true;
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origine (curl, health checks, apps mobiles)
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    // Refus propre : pas d'en-têtes CORS, mais pas d'erreur 500 non plus.
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Parser JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger des requêtes
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Servir uniquement les images publiques (couvertures). Les documents passent par /api/v1/documents/:id/stream.
const uploadRoot = path.resolve(process.env.UPLOAD_PATH || './uploads');
app.use('/uploads/images', express.static(path.join(uploadRoot, 'images'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

// ─────────────────────────────────────────────
// Route de santé (health check)
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Module Bibliothèque Hybride - Educated ERP',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ─────────────────────────────────────────────
// Routes API v1
// ─────────────────────────────────────────────
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/categories`, categoriesRoutes);
app.use(`${API_PREFIX}/livres`, livresRoutes);
app.use(`${API_PREFIX}/documents`, documentsRoutes);
app.use(`${API_PREFIX}/emprunts`, empruntsRoutes);
app.use(`${API_PREFIX}/stats`, statsRoutes);
app.use(`${API_PREFIX}/support`, supportRoutes);
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);

// ─────────────────────────────────────────────
// Route 404 (route non trouvée)
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} introuvable.`,
  });
});

// ─────────────────────────────────────────────
// Gestionnaire d'erreurs global
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur.',
    ...(process.env.NODE_ENV === 'development' && { error: err.message }),
  });
});

// ─────────────────────────────────────────────
// Démarrage du serveur
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   📚 Module Bibliothèque Hybride - Educated ║');
  console.log(`║   🚀 Serveur démarré sur le port ${PORT}        ║`);
  console.log(`║   🌐 http://localhost:${PORT}/api/v1           ║`);
  console.log(`║   📦 Environnement : ${process.env.NODE_ENV}           ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');

  // Démarrer les tâches cron
  initJobs();
});

module.exports = app;
