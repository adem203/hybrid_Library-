// ============================================================
// notifications.routes.js
// Toutes les routes notifications sont protégées par JWT.
// Chaque utilisateur authentifié voit uniquement ses propres
// notifications (le contrôleur filtre côté SQL via
// recipient_role et recipient_id).
// ============================================================

const express = require('express');
const router = express.Router();

const controller = require('./notifications.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { isAuthenticated } = require('../../middleware/roles.middleware');

// Toute personne authentifiée peut consulter sa propre boîte.
router.use(authMiddleware, isAuthenticated);

router.get('/',              controller.getMyNotifications);
router.get('/unread-count',  controller.getUnreadCount);
router.patch('/mark-all-read', controller.markAllAsRead);
router.patch('/:id/read',    controller.markAsRead);

module.exports = router;
