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
app.use(cors({
  origin: [
    'http://localhost:3000',   // React
    'http://localhost:4200',   // Angular
    'http://localhost:8080',
  ],
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

// Servir les fichiers statiques (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    // Permettre la lecture inline des PDF
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
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