const express = require('express');
const router = express.Router();
const empruntsController = require('./emprunts.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isBibliothecaire, requireRole } = require('../../middleware/roles.middleware');

// Routes étudiant / tous connectés
router.get('/mes-emprunts', authMiddleware, empruntsController.getMesEmprunts);
router.get('/mes-reservations', authMiddleware, empruntsController.getMesReservations);
router.post('/', authMiddleware, empruntsController.creerDemande);
router.put('/:id/annuler', authMiddleware, empruntsController.annulerEmprunt);
router.post('/reservations', authMiddleware, empruntsController.reserverLivre);
router.put('/reservations/:id/annuler', authMiddleware, empruntsController.cancelMaReservation);

// Routes bibliothécaire — RÉSERVATIONS (placer avant les routes /:id pour éviter conflit)
router.get('/reservations', authMiddleware, isBibliothecaire, empruntsController.getAllReservations);
router.put('/reservations/:id/approve', authMiddleware, isBibliothecaire, empruntsController.approveReservation);
router.put('/reservations/:id/cancel', authMiddleware, isBibliothecaire, empruntsController.cancelReservation);

// Routes bibliothécaire — EMPRUNTS
router.get('/', authMiddleware, isBibliothecaire, empruntsController.getAllEmprunts);
router.get('/retards', authMiddleware, isBibliothecaire, empruntsController.getRetards);
router.post('/admin', authMiddleware, isBibliothecaire, empruntsController.creerEmpruntAdmin);
router.put('/:id/valider', authMiddleware, isBibliothecaire, empruntsController.validerEmprunt);
router.put('/:id/refuser', authMiddleware, isBibliothecaire, empruntsController.refuserEmprunt);
router.put('/:id/retourner', authMiddleware, isBibliothecaire, empruntsController.enregistrerRetour);
router.put('/:id/prolonger', authMiddleware, isBibliothecaire, empruntsController.prolongerEmprunt);

module.exports = router;