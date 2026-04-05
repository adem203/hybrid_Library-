const express = require('express');
const router = express.Router();
const empruntsController = require('./emprunts.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isBibliothecaire, requireRole } = require('../../middleware/roles.middleware');

// Routes étudiant / tous connectés
router.get('/mes-emprunts', authMiddleware, empruntsController.getMesEmprunts);
router.post('/', authMiddleware, empruntsController.creerDemande);
router.put('/:id/annuler', authMiddleware, empruntsController.annulerEmprunt);
router.post('/reservations', authMiddleware, empruntsController.reserverLivre);

// Routes bibliothécaire
router.get('/', authMiddleware, isBibliothecaire, empruntsController.getAllEmprunts);
router.get('/retards', authMiddleware, isBibliothecaire, empruntsController.getRetards);
router.put('/:id/valider', authMiddleware, isBibliothecaire, empruntsController.validerEmprunt);
router.put('/:id/refuser', authMiddleware, isBibliothecaire, empruntsController.refuserEmprunt);
router.put('/:id/retourner', authMiddleware, isBibliothecaire, empruntsController.enregistrerRetour);

module.exports = router;