const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const livresController = require('./livres.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isBibliothecaire } = require('../../middleware/roles.middleware');
const { uploadImage } = require('../../middleware/upload.middleware');

const livreValidation = [
  body('titre').trim().notEmpty().withMessage('Le titre est requis'),
  body('stock_total')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le stock doit être un entier positif'),
];

// Routes accessibles à tous les utilisateurs connectés
router.get('/search', authMiddleware, livresController.searchLivres);
router.get('/rayons', authMiddleware, livresController.getRayons);
router.get('/', authMiddleware, livresController.getAllLivres);
router.get('/:id', authMiddleware, livresController.getLivreById);

// Routes bibliothécaire seulement
router.post('/', authMiddleware, isBibliothecaire, uploadImage, livreValidation, livresController.createLivre);
router.put('/:id', authMiddleware, isBibliothecaire, uploadImage, livresController.updateLivre);
router.delete('/:id', authMiddleware, isBibliothecaire, livresController.deleteLivre);

module.exports = router;