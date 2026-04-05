const express = require('express');
const router = express.Router();
const statsController = require('./stats.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isBibliothecaire, requireRole } = require('../../middleware/roles.middleware');

// Dashboard et stats globales (bibliothécaire)
router.get('/dashboard', authMiddleware, isBibliothecaire, statsController.getDashboard);
router.get('/emprunts', authMiddleware, isBibliothecaire, statsController.getStatsEmprunts);
router.get('/ressources-populaires', authMiddleware, isBibliothecaire, statsController.getRessourcesPopulaires);
router.get('/repartition', authMiddleware, isBibliothecaire, statsController.getRepartition);

// Stats enseignant (ses propres cours)
router.get('/mes-cours', authMiddleware, requireRole('ENSEIGNANT', 'BIBLIOTHECAIRE', 'ADMIN'), statsController.getMesCours);

module.exports = router;