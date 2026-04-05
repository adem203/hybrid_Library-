const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const categoriesController = require('./categories.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isBibliothecaire } = require('../../middleware/roles.middleware');

const categorieValidation = [
  body('libelle').trim().notEmpty().withMessage('Le libellé est requis'),
];

router.get('/', authMiddleware, categoriesController.getAllCategories);
router.get('/:id', authMiddleware, categoriesController.getCategorieById);
router.post('/', authMiddleware, isBibliothecaire, categorieValidation, categoriesController.createCategorie);
router.put('/:id', authMiddleware, isBibliothecaire, categoriesController.updateCategorie);
router.delete('/:id', authMiddleware, isBibliothecaire, categoriesController.deleteCategorie);

module.exports = router;