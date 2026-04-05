const express = require('express');
const router = express.Router();
const documentsController = require('./documents.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isBibliothecaire, requireRole } = require('../../middleware/roles.middleware');
const { uploadDocument } = require('../../middleware/upload.middleware');

// Accessible à tous les connectés
router.get('/historique/mes-lectures', authMiddleware, documentsController.getMesLectures);
router.get('/', authMiddleware, documentsController.getAllDocuments);
router.get('/:id', authMiddleware, documentsController.getDocumentById);
router.get('/:id/stream', authMiddleware, documentsController.streamDocument);
router.get('/:id/download', authMiddleware, documentsController.downloadDocument);

// Upload : Enseignant, Bibliothécaire, Admin
router.post('/upload', authMiddleware, requireRole('ENSEIGNANT', 'BIBLIOTHECAIRE', 'ADMIN'), uploadDocument, documentsController.uploadDocument);

// Suppression : Bibliothécaire seulement
router.delete('/:id', authMiddleware, isBibliothecaire, documentsController.deleteDocument);

module.exports = router;