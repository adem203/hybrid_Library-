const express = require('express');
const router = express.Router();
const supportController = require('./support.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { requireRole, isAdmin } = require('../../middleware/roles.middleware');

router.post('/tickets', authMiddleware, requireRole('ETUDIANT', 'ENSEIGNANT'), supportController.createTicket);
router.get('/my-tickets', authMiddleware, requireRole('ETUDIANT', 'ENSEIGNANT'), supportController.getMyTickets);

// Admin endpoints
router.get('/admin/tickets', authMiddleware, isAdmin, supportController.getAllTicketsAdmin);
router.get('/admin/tickets/:id', authMiddleware, isAdmin, supportController.getTicketByIdAdmin);
router.patch('/admin/tickets/:id/reply', authMiddleware, isAdmin, supportController.replyToTicketAdmin);
router.patch('/admin/tickets/:id/status', authMiddleware, isAdmin, supportController.updateTicketStatusAdmin);

module.exports = router;
