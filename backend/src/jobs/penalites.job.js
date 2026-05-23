const cron = require('node-cron');
const { query } = require('../config/db');
const { notifyAdmins } = require('../modules/notifications/notifications.service');

// ─────────────────────────────────────────────
// Tâche : Tous les jours à 08h00
// Marquer les emprunts en retard → statut EN_RETARD
// ─────────────────────────────────────────────
const marquerRetards = async () => {
  console.log('[CRON] Vérification des retards...');
  try {
    const result = await query(`
      UPDATE emprunts
      SET statut = 'EN_RETARD', date_modification = NOW()
      WHERE statut = 'EN_COURS'
        AND date_retour_prevue < CURRENT_DATE
      RETURNING id_emprunt, id_user, id_livre
    `);

    if (result.rowCount > 0) {
      console.log(`[CRON] ${result.rowCount} emprunt(s) marqué(s) EN_RETARD.`);

      // Récupérer les infos lisibles pour la notification admin
      const ids = result.rows.map((r) => r.id_emprunt);
      const enriched = await query(
        `SELECT e.id_emprunt,
                u.nom AS user_nom, u.prenom AS user_prenom,
                r.titre AS titre_livre
           FROM emprunts e
           JOIN utilisateurs u ON u.id_user = e.id_user
           JOIN ressources r   ON r.id_ressource = e.id_livre
          WHERE e.id_emprunt = ANY($1::int[])`,
        [ids]
      );

      for (const row of enriched.rows) {
        const who = `${row.user_prenom || ''} ${row.user_nom || ''}`.trim() || 'Un utilisateur';
        // L'index UNIQUE (type, related_entity_type, related_entity_id, ...)
        // garantit qu'on ne crée qu'une seule notif "OVERDUE_LOAN" par emprunt,
        // même si le cron retourne plusieurs fois la même ligne dans une journée.
        notifyAdmins({
          title: 'Emprunt en retard',
          message: `L’emprunt #${row.id_emprunt} de ${who} pour « ${row.titre_livre} » est en retard.`,
          type: 'OVERDUE_LOAN',
          relatedEntityType: 'emprunt',
          relatedEntityId: row.id_emprunt,
          targetUrl: '/admin/emprunts',
        }).catch(() => {});
      }
    } else {
      console.log('[CRON] Aucun nouveau retard.');
    }
  } catch (error) {
    console.error('[CRON] Erreur vérification retards:', error);
  }
};

// ─────────────────────────────────────────────
// Tâche : Tous les jours à 09h00
// Expirer les réservations de plus de 7 jours
// ─────────────────────────────────────────────
const expirerReservations = async () => {
  console.log('[CRON] Expiration des réservations...');
  try {
    const result = await query(`
      UPDATE reservations
      SET statut = 'EXPIREE'
      WHERE statut = 'EN_ATTENTE'
        AND date_reservation < NOW() - INTERVAL '7 days'
      RETURNING id_reservation
    `);

    if (result.rowCount > 0) {
      console.log(`[CRON] ${result.rowCount} réservation(s) expirée(s).`);
    }
  } catch (error) {
    console.error('[CRON] Erreur expiration réservations:', error);
  }
};

// Initialiser les tâches cron
const initJobs = () => {
  // Tous les jours à 08h00
  cron.schedule('0 8 * * *', marquerRetards, {
    timezone: 'Africa/Tunis',
  });

  // Tous les jours à 09h00
  cron.schedule('0 9 * * *', expirerReservations, {
    timezone: 'Africa/Tunis',
  });

  console.log('✅ Tâches CRON initialisées (retards à 08h00, réservations à 09h00)');
};

module.exports = { initJobs, marquerRetards };