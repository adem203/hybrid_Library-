// ============================================================
// notifications.controller.js
// Endpoints admin pour consulter / marquer les notifications.
// L'utilisateur authentifié est admin (ADMIN ou BIBLIOTHECAIRE) :
// il voit les notifs ciblées sur son rôle OU sur son id_user.
// ============================================================

const { query } = require('../../config/db');

// Quelles "boîtes" un utilisateur authentifié peut consulter.
// ADMIN et BIBLIOTHECAIRE partagent la boîte admin (recipient_role='ADMIN').
const inboxRolesFor = (user) => {
  if (!user) return [];
  switch (user.role) {
    case 'ADMIN':
    case 'BIBLIOTHECAIRE':
      return ['ADMIN', 'BIBLIOTHECAIRE'];
    default:
      return [user.role];
  }
};

const NOTIF_COLUMNS = `
  id, title, message, type, recipient_role, recipient_id,
  is_read, related_entity_type, related_entity_id,
  target_url, created_at, read_at
`;

// Construit la clause WHERE qui sélectionne les notifs de l'utilisateur :
//   recipient_role IN (...)  OR  recipient_id = user.id
const buildVisibilityClause = (user, startIndex = 1) => {
  const roles = inboxRolesFor(user);
  const params = [];
  let idx = startIndex;

  const rolePlaceholders = roles.map(() => `$${idx++}`).join(', ');
  roles.forEach((r) => params.push(r));

  const userIdPlaceholder = `$${idx++}`;
  params.push(user.id_user);

  const sql = `(recipient_role IN (${rolePlaceholders}) OR recipient_id = ${userIdPlaceholder})`;
  return { sql, params, nextIndex: idx };
};

// ─────────────────────────────────────────────
// GET /api/v1/notifications
// Liste paginée des notifs visibles par l'utilisateur, plus récente d'abord.
// Query params optionnels : limit (def. 20, max 100), unread_only=true
// ─────────────────────────────────────────────
const getMyNotifications = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const unreadOnly = String(req.query.unread_only || '').toLowerCase() === 'true';

    const vis = buildVisibilityClause(req.user, 1);
    const whereParts = [vis.sql];
    const params = [...vis.params];
    let nextIndex = vis.nextIndex;

    if (unreadOnly) {
      whereParts.push('is_read = FALSE');
    }

    params.push(limit);
    const limitPlaceholder = `$${nextIndex++}`;

    const result = await query(
      `SELECT ${NOTIF_COLUMNS}
         FROM notifications
        WHERE ${whereParts.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limitPlaceholder}`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Erreur getMyNotifications:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/notifications/unread-count
// ─────────────────────────────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const vis = buildVisibilityClause(req.user, 1);
    const result = await query(
      `SELECT COUNT(*)::int AS count
         FROM notifications
        WHERE ${vis.sql} AND is_read = FALSE`,
      vis.params
    );

    return res.status(200).json({
      success: true,
      data: { count: result.rows[0]?.count || 0 },
    });
  } catch (error) {
    console.error('Erreur getUnreadCount:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PATCH /api/v1/notifications/:id/read
// ─────────────────────────────────────────────
const markAsRead = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'Identifiant invalide.' });
  }

  try {
    const vis = buildVisibilityClause(req.user, 2);
    const params = [id, ...vis.params];

    const result = await query(
      `UPDATE notifications
          SET is_read = TRUE,
              read_at = COALESCE(read_at, NOW())
        WHERE id = $1
          AND ${vis.sql}
        RETURNING ${NOTIF_COLUMNS}`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification introuvable.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Erreur markAsRead:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PATCH /api/v1/notifications/mark-all-read
// ─────────────────────────────────────────────
const markAllAsRead = async (req, res) => {
  try {
    const vis = buildVisibilityClause(req.user, 1);
    const result = await query(
      `UPDATE notifications
          SET is_read = TRUE,
              read_at = COALESCE(read_at, NOW())
        WHERE ${vis.sql}
          AND is_read = FALSE
        RETURNING id`,
      vis.params
    );

    return res.status(200).json({
      success: true,
      data: { updated: result.rowCount || 0 },
    });
  } catch (error) {
    console.error('Erreur markAllAsRead:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
