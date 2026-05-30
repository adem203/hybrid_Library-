const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('./auth.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isBibliothecaire } = require('../../middleware/roles.middleware');

// Validation pour register (public sign-up). The `role` field is intentionally
// not validated/accepted here: the controller forces GUEST regardless of what
// the client sends. STUDENT/TEACHER accounts are created by staff via /users.
const registerValidation = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('mot_de_passe')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères'),
];

// Validation pour login
const loginValidation = [
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('mot_de_passe').notEmpty().withMessage('Mot de passe requis'),
];

const forgotPasswordValidation = [
  body('email').isEmail().withMessage('Email invalide'),
];

const verifyResetCodeValidation = [
  body('email').isEmail().withMessage('Email invalide'),
  body('code')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Le code doit contenir 6 chiffres'),
];

const resetPasswordValidation = [
  body('email').isEmail().withMessage('Email invalide'),
  body('code')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Le code doit contenir 6 chiffres'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères'),
  body('confirmPassword').notEmpty().withMessage('La confirmation est requise'),
];

const verifyOtpValidation = [
  body('email').isEmail().withMessage('Email invalide'),
  body('code')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Le code doit contenir 6 chiffres'),
];

const resendOtpValidation = [
  body('email').isEmail().withMessage('Email invalide'),
];

const createUserValidation = [
  body('nom_complet').trim().notEmpty().withMessage('Le nom complet est requis'),
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('mot_de_passe')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('role')
    .isIn(['ETUDIANT', 'ENSEIGNANT'])
    .withMessage('Rôle invalide'),
  body('matricule')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Le matricule ne doit pas dépasser 20 caractères'),
];

const updateUserValidation = [
  body('nom_complet').trim().notEmpty().withMessage('Le nom complet est requis'),
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('role')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['ETUDIANT', 'ENSEIGNANT'])
    .withMessage('Rôle invalide'),
  body('matricule')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Le matricule ne doit pas dépasser 20 caractères'),
  body('mot_de_passe')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères'),
];

// Routes publiques
router.post('/register', registerValidation, authController.register);
router.post('/verify-registration', verifyOtpValidation, authController.verifyRegistration);
router.post('/resend-registration', resendOtpValidation, authController.resendRegistrationCode);
router.post('/login', loginValidation, authController.login);
router.post('/verify-login', verifyOtpValidation, authController.verifyLogin);
router.post('/resend-login', resendOtpValidation, authController.resendLoginCode);
router.post('/forgot-password', forgotPasswordValidation, authController.forgotPassword);
router.post('/verify-reset-code', verifyResetCodeValidation, authController.verifyResetCode);
router.post('/reset-password', resetPasswordValidation, authController.resetPassword);

// Routes protégées
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.getMe);
router.put('/me', authMiddleware, authController.updateMe);
router.put('/change-password', authMiddleware, authController.changePassword);

// Routes admin/bibliothécaire
router.get('/users', authMiddleware, isBibliothecaire, authController.getAllUsers);
router.post('/users', authMiddleware, isBibliothecaire, createUserValidation, authController.createUser);
router.put('/users/:id', authMiddleware, isBibliothecaire, updateUserValidation, authController.updateUser);
router.put('/users/:id/bloquer', authMiddleware, isBibliothecaire, authController.toggleBloquerUser);

module.exports = router;
