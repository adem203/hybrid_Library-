const cron = require('node-cron');
const { query } = require('../config/db');

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

      // Ici tu peux ajouter l'envoi d'emails (avec nodemailer par exemple)
      // Pour chaque emprunt en retard, notifier l'utilisateur
      for (const emprunt of result.rows) {
        console.log(`[CRON] Notification retard → emprunt #${emprunt.id_emprunt}`);
        // TODO: envoyer email à emprunt.id_user
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