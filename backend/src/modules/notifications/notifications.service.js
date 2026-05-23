// ============================================================
// notifications.service.js
// Service interne pour CREER des notifications depuis d'autres modules
// (réservations, support, documents, cron des retards, etc.).
// La lecture / mise à jour est faite par le controller.
// ============================================================

const { query } = require('../../config/db');

const ALLOWED_TYPES = new Set([
  'BOOK_RESERVATION',
  'SUPPORT_TICKET',
  'DOCUMENT_UPLOAD',
  'OVERDUE_LOAN',
  'BOOK_LOAN_REQUEST',
  'GENERAL',
]);

const ALLOWED_RECIPIENT_ROLES = new Set([
  'ADMIN',
  'BIBLIOTHECAIRE',
  'ENSEIGNANT',
  'ETUDIANT',
]);

/**
 * Crée une notification dans la base.
 *
 * Idempotent grâce à l'index UNIQUE (type, related_entity_type,
 * related_entity_id, recipient_role, recipient_id) : si on essaie
 * d'insérer deux fois pour la même action, le second appel est ignoré.
 *
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {string} payload.type            - voir ALLOWED_TYPES
 * @param {string} [payload.recipientRole] - 'ADMIN', 'BIBLIOTHECAIRE', ...
 * @param {number} [payload.recipientId]   - utilisateur destinataire (optionnel)
 * @param {string} [payload.relatedEntityType]
 * @param {number} [payload.relatedEntityId]
 * @param {string} [payload.targetUrl]
 * @returns {Promise<Object|null>} la notification créée, ou null si déjà existante
 */
async function createNotification(payload) {
  const {
    title,
    message,
    type,
    recipientRole = null,
    recipientId = null,
    relatedEntityType = null,
    relatedEntityId = null,
    targetUrl = null,
  } = payload || {};

  if (!title || !message || !type) {
    throw new Error('createNotification: title, message and type are required.');
  }
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`createNotification: type "${type}" invalide.`);
  }
  if (recipientRole && !ALLOWED_RECIPIENT_ROLES.has(recipientRole)) {
    throw new Error(`createNotification: recipientRole "${recipientRole}" invalide.`);
  }
  if (!recipientRole && !recipientId) {
    throw new Error('createNotification: recipientRole ou recipientId est requis.');
  }

  try {
    const result = await query(
      `INSERT INTO notifications
        (title, message, type, recipient_role, recipient_id,
         related_entity_type, related_entity_id, target_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        String(title).slice(0, 255),
        String(message),
        type,
        recipientRole,
        recipientId,
        relatedEntityType,
        relatedEntityId,
        targetUrl,
      ]
    );
    return result.rows[0] || null;
  } catch (error) {
    // On ne casse jamais l'action métier à cause d'un échec notif
    console.error('[notifications] createNotification a échoué:', error.message);
    return null;
  }
}

/**
 * Helper pratique : notifier toute la team admin (ADMIN + BIBLIOTHECAIRE
 * sont gérés ensemble côté RBAC, donc on émet juste sur ADMIN et
 * on autorise BIBLIOTHECAIRE à lire les notifs role=ADMIN).
 */
async function notifyAdmins(payload) {
  return createNotification({ ...payload, recipientRole: 'ADMIN' });
}

module.exports = {
  createNotification,
  notifyAdmins,
  ALLOWED_TYPES,
  ALLOWED_RECIPIENT_ROLES,
};
