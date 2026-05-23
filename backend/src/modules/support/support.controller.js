const { query } = require('../../config/db');
const { notifyAdmins, createNotification } = require('../notifications/notifications.service');

const buildSnippet = (text, max = 140) => {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const STATUS_NOTIF_META = {
  REPONDU: {
    title: 'Ticket résolu',
    message: (subject) => `Votre ticket « ${subject} » a été marqué comme résolu.`,
  },
  FERME: {
    title: 'Ticket fermé',
    message: (subject) => `Votre ticket « ${subject} » a été fermé.`,
  },
  EN_ATTENTE: {
    title: 'Ticket rouvert',
    message: (subject) => `Votre ticket « ${subject} » a été rouvert.`,
  },
};

const SUPPORT_TYPES = new Set([
  // Étudiant
  'Problème de réservation',
  'Problème d’emprunt',
  'Problème de document numérique',
  'Problème de compte',
  // Enseignant
  'Problème d’upload',
  'Problème de document',
  'Problème de statistiques',
  'Problème d’accès',
  // Commun
  'Autre',
]);

const normalizeTextField = (value) => String(value || '').trim();

const createTicket = async (req, res) => {
  const sujet = normalizeTextField(req.body.sujet);
  const typeProbleme = normalizeTextField(req.body.type_probleme);
  const message = normalizeTextField(req.body.message);
  const relatedText = normalizeTextField(req.body.related_text);

  if (!sujet) {
    return res.status(400).json({ success: false, message: 'Le sujet est requis.' });
  }
  if (!typeProbleme) {
    return res.status(400).json({ success: false, message: 'Le type de problème est requis.' });
  }
  if (!SUPPORT_TYPES.has(typeProbleme)) {
    return res.status(400).json({ success: false, message: 'Type de problème invalide.' });
  }
  if (!message) {
    return res.status(400).json({ success: false, message: 'Le message est requis.' });
  }

  try {
    const result = await query(
      `INSERT INTO support_tickets
        (id_user, sujet, type_probleme, message, related_text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
        id_ticket, id_user, sujet, type_probleme, message, related_text,
        statut, reponse_admin, date_creation, date_reponse`,
      [req.user.id_user, sujet, typeProbleme, message, relatedText || null]
    );

    const ticket = result.rows[0];
    const senderName = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() || 'Un utilisateur';
    const roleLabel = req.user.role === 'ENSEIGNANT' ? 'enseignant' : 'étudiant';

    notifyAdmins({
      title: 'Nouveau ticket de support',
      message: `${senderName} (${roleLabel}) a ouvert un ticket : « ${ticket.sujet} ».`,
      type: 'SUPPORT_TICKET',
      relatedEntityType: 'support_ticket',
      relatedEntityId: ticket.id_ticket,
      targetUrl: '/admin/support',
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Votre demande a été envoyée à l’administration.',
      data: ticket,
    });
  } catch (error) {
    console.error('Erreur createTicket:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

const getMyTickets = async (req, res) => {
  try {
    const result = await query(
      `SELECT
        id_ticket, sujet, type_probleme, related_text, statut,
        reponse_admin, date_creation, date_reponse
       FROM support_tickets
       WHERE id_user = $1
       ORDER BY date_creation DESC`,
      [req.user.id_user]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Erreur getMyTickets:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

const ALLOWED_STATUS = new Set(['EN_ATTENTE', 'REPONDU', 'FERME']);

const TICKET_WITH_USER_COLUMNS = `
  t.id_ticket, t.id_user, t.sujet, t.type_probleme, t.message, t.related_text,
  t.statut, t.reponse_admin, t.date_creation, t.date_reponse,
  u.nom AS student_nom, u.prenom AS student_prenom, u.email AS student_email,
  u.matricule AS student_matricule, u.role AS student_role
`;

const getAllTicketsAdmin = async (req, res) => {
  try {
    const result = await query(
      `SELECT ${TICKET_WITH_USER_COLUMNS}
       FROM support_tickets t
       JOIN utilisateurs u ON u.id_user = t.id_user
       ORDER BY t.date_creation DESC`
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Erreur getAllTicketsAdmin:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

const getTicketByIdAdmin = async (req, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ success: false, message: 'Identifiant de ticket invalide.' });
  }

  try {
    const result = await query(
      `SELECT ${TICKET_WITH_USER_COLUMNS}
       FROM support_tickets t
       JOIN utilisateurs u ON u.id_user = t.id_user
       WHERE t.id_ticket = $1`,
      [ticketId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket introuvable.' });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur getTicketByIdAdmin:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

const replyToTicketAdmin = async (req, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ success: false, message: 'Identifiant de ticket invalide.' });
  }

  const reponseAdmin = normalizeTextField(req.body.reponse_admin);
  if (!reponseAdmin) {
    return res.status(400).json({ success: false, message: 'La réponse est requise.' });
  }

  try {
    const updated = await query(
      `UPDATE support_tickets
       SET reponse_admin = $1, statut = 'REPONDU', date_reponse = NOW()
       WHERE id_ticket = $2
       RETURNING id_ticket`,
      [reponseAdmin, ticketId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket introuvable.' });
    }

    const result = await query(
      `SELECT ${TICKET_WITH_USER_COLUMNS}
       FROM support_tickets t
       JOIN utilisateurs u ON u.id_user = t.id_user
       WHERE t.id_ticket = $1`,
      [ticketId]
    );

    const ticket = result.rows[0];
    if (ticket) {
      const snippet = buildSnippet(reponseAdmin);
      createNotification({
        title: 'Nouvelle réponse à votre ticket',
        message: `Réponse à « ${ticket.sujet} » : ${snippet}`,
        type: 'SUPPORT_TICKET',
        recipientId: ticket.id_user,
        relatedEntityType: 'support_ticket_reply',
        relatedEntityId: ticket.id_ticket,
        targetUrl: ticket.student_role === 'ENSEIGNANT' ? '/teacher/support' : '/student/support',
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: 'Réponse envoyée à l’étudiant.',
      data: ticket,
    });
  } catch (error) {
    console.error('Erreur replyToTicketAdmin:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

const updateTicketStatusAdmin = async (req, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ success: false, message: 'Identifiant de ticket invalide.' });
  }

  const statut = normalizeTextField(req.body.statut).toUpperCase();
  if (!ALLOWED_STATUS.has(statut)) {
    return res.status(400).json({ success: false, message: 'Statut invalide.' });
  }

  try {
    const updated = await query(
      `UPDATE support_tickets
       SET statut = $1
       WHERE id_ticket = $2
       RETURNING id_ticket`,
      [statut, ticketId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket introuvable.' });
    }

    const result = await query(
      `SELECT ${TICKET_WITH_USER_COLUMNS}
       FROM support_tickets t
       JOIN utilisateurs u ON u.id_user = t.id_user
       WHERE t.id_ticket = $1`,
      [ticketId]
    );

    const ticket = result.rows[0];
    const meta = STATUS_NOTIF_META[statut];
    if (ticket && meta) {
      createNotification({
        title: meta.title,
        message: meta.message(ticket.sujet),
        type: 'SUPPORT_TICKET',
        recipientId: ticket.id_user,
        relatedEntityType: `support_ticket_status_${statut}`,
        relatedEntityId: ticket.id_ticket,
        targetUrl: ticket.student_role === 'ENSEIGNANT' ? '/teacher/support' : '/student/support',
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: 'Statut du ticket mis à jour.',
      data: ticket,
    });
  } catch (error) {
    console.error('Erreur updateTicketStatusAdmin:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = {
  createTicket,
  getMyTickets,
  getAllTicketsAdmin,
  getTicketByIdAdmin,
  replyToTicketAdmin,
  updateTicketStatusAdmin,
};
