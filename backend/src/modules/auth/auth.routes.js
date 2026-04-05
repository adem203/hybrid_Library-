const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('./auth.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isBibliothecaire } = require('../../middleware/roles.middleware');

// Validation pour register
const registerValidation = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('mot_de_passe')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('role')
    .optional()
    .isIn(['ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE'])
    .withMessage('Rôle invalide'),
];

// Validation pour login
const loginValidation = [
  body('email').isEmail().withMessage('Email invalide'),
  body('mot_de_passe').notEmpty().withMessage('Mot de passe requis'),
];

// Routes publiques
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);

// Routes protégées
router.get('/me', authMiddleware, authController.getMe);
router.put('/change-password', authMiddleware, authController.changePassword);

// Routes admin/bibliothécaire
router.get('/users', authMiddleware, isBibliothecaire, authController.getAllUsers);
router.put('/users/:id/bloquer', authMiddleware, isBibliothecaire, authController.toggleBloquerUser);

module.exports = router;