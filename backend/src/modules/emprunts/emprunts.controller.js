const { query, getClient } = require('../../config/db');

// ─────────────────────────────────────────────
// POST /api/v1/emprunts
// Créer une demande d'emprunt (étudiant)
// ─────────────────────────────────────────────
const creerDemande = async (req, res) => {
  const { id_livre, duree_jours = 14 } = req.body;

  if (!id_livre) {
    return res.status(400).json({ success: false, message: 'L\'identifiant du livre est requis.' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Vérifier que l'utilisateur n'est pas bloqué
    if (req.user.est_bloque) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Votre compte est bloqué. Vous ne pouvez pas faire de demande d\'emprunt.',
      });
    }

    // Vérifier que le livre existe
    const livreResult = await client.query(
      `SELECT lp.stock_disponible, r.titre
       FROM livres_physiques lp
       INNER JOIN ressources r ON r.id_ressource = lp.id_ressource
       WHERE lp.id_ressource = $1`,
      [id_livre]
    );

    if (livreResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Livre introuvable.' });
    }

    const livre = livreResult.rows[0];

    if (livre.stock_disponible <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Ce livre n\'est pas disponible. Voulez-vous le réserver ?',
      });
    }

    // Vérifier qu'il n'y a pas déjà un emprunt en cours pour ce livre
    const existingLoan = await client.query(
      `SELECT id_emprunt FROM emprunts
       WHERE id_user = $1 AND id_livre = $2 AND statut IN ('EN_ATTENTE', 'EN_COURS')`,
      [req.user.id_user, id_livre]
    );

    if (existingLoan.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà un emprunt en cours ou en attente pour ce livre.',
      });
    }

    // Calculer la date de retour prévue
    const dateRetourPrevue = new Date();
    dateRetourPrevue.setDate(dateRetourPrevue.getDate() + parseInt(duree_jours));

    // Créer la demande d'emprunt
    const empruntResult = await client.query(
      `INSERT INTO emprunts (id_user, id_livre, date_retour_prevue, statut)
       VALUES ($1, $2, $3, 'EN_ATTENTE')
       RETURNING *`,
      [req.user.id_user, id_livre, dateRetourPrevue]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: `Demande d'emprunt pour "${livre.titre}" envoyée. En attente de validation.`,
      data: empruntResult.rows[0],
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur creerDemande:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/emprunts/:id/valider
// Valider une demande d'emprunt (bibliothécaire)
// ─────────────────────────────────────────────
const validerEmprunt = async (req, res) => {
  const { id } = req.params;
  const { notes_biblio, duree_jours } = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Vérifier l'emprunt
    const empruntResult = await client.query(
      `SELECT e.*, r.titre AS titre_livre
       FROM emprunts e
       INNER JOIN ressources r ON r.id_ressource = e.id_livre
       WHERE e.id_emprunt = $1 AND e.statut = 'EN_ATTENTE'`,
      [id]
    );

    if (empruntResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Demande introuvable ou déjà traitée.',
      });
    }

    const emprunt = empruntResult.rows[0];

    // Vérifier le stock encore une fois
    const stockResult = await client.query(
      'SELECT stock_disponible FROM livres_physiques WHERE id_ressource = $1 FOR UPDATE',
      [emprunt.id_livre]
    );

    if (stockResult.rows[0].stock_disponible <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Stock épuisé. Impossible de valider.',
      });
    }

    // Calculer nouvelle date de retour si fournie
    let dateRetourPrevue = emprunt.date_retour_prevue;
    if (duree_jours) {
      dateRetourPrevue = new Date();
      dateRetourPrevue.setDate(dateRetourPrevue.getDate() + parseInt(duree_jours));
    }

    // Mettre à jour l'emprunt → EN_COURS
    await client.query(
      `UPDATE emprunts SET
         statut = 'EN_COURS',
         date_emprunt = NOW(),
         date_retour_prevue = $1,
         notes_biblio = $2,
         date_modification = NOW()
       WHERE id_emprunt = $3`,
      [dateRetourPrevue, notes_biblio || null, id]
    );

    // Décrémenter le stock
    await client.query(
      `UPDATE livres_physiques
       SET stock_disponible = stock_disponible - 1
       WHERE id_ressource = $1`,
      [emprunt.id_livre]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Emprunt de "${emprunt.titre_livre}" validé. Retour prévu le ${dateRetourPrevue.toLocaleDateString('fr-TN')}.`,
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur validerEmprunt:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/emprunts/:id/refuser
// Refuser une demande d'emprunt
// ─────────────────────────────────────────────
const refuserEmprunt = async (req, res) => {
  const { id } = req.params;
  const { notes_biblio } = req.body;

  try {
    const result = await query(
      `UPDATE emprunts SET statut = 'REFUSE', notes_biblio = $1, date_modification = NOW()
       WHERE id_emprunt = $2 AND statut = 'EN_ATTENTE'
       RETURNING id_emprunt`,
      [notes_biblio || 'Demande refusée par le bibliothécaire.', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Demande introuvable ou déjà traitée.' });
    }

    return res.status(200).json({ success: true, message: 'Demande refusée.' });
  } catch (error) {
    console.error('Erreur refuserEmprunt:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/emprunts/:id/retourner
// Enregistrer le retour d'un livre
// ─────────────────────────────────────────────
const enregistrerRetour = async (req, res) => {
  const { id } = req.params;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const empruntResult = await client.query(
      `SELECT e.*, r.titre AS titre_livre
       FROM emprunts e
       INNER JOIN ressources r ON r.id_ressource = e.id_livre
       WHERE e.id_emprunt = $1 AND e.statut IN ('EN_COURS', 'EN_RETARD')`,
      [id]
    );

    if (empruntResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Emprunt introuvable ou déjà retourné.' });
    }

    const emprunt = empruntResult.rows[0];
    const now = new Date();

    // Calculer la pénalité si retard
    const dateRetourPrevue = new Date(emprunt.date_retour_prevue);
    let penalite = 0;
    if (now > dateRetourPrevue) {
      const joursRetard = Math.ceil((now - dateRetourPrevue) / (1000 * 60 * 60 * 24));
      const penaliteParJour = parseInt(process.env.PENALITE_PAR_JOUR || '100');
      penalite = joursRetard * penaliteParJour;
    }

    // Mettre à jour l'emprunt
    await client.query(
      `UPDATE emprunts SET
         statut = 'RETOURNE',
         date_retour_effectif = NOW(),
         penalite_montant = $1,
         date_modification = NOW()
       WHERE id_emprunt = $2`,
      [penalite, id]
    );

    // Remettre le stock
    await client.query(
      `UPDATE livres_physiques
       SET stock_disponible = stock_disponible + 1
       WHERE id_ressource = $1`,
      [emprunt.id_livre]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Retour de "${emprunt.titre_livre}" enregistré.`,
      penalite: penalite > 0 ? `Pénalité de retard : ${penalite / 100} DT` : 'Aucune pénalité.',
      penalite_montant: penalite,
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur enregistrerRetour:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/emprunts/:id/annuler
// Annuler une demande (étudiant, seulement si EN_ATTENTE)
// ─────────────────────────────────────────────
const annulerEmprunt = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE emprunts SET statut = 'ANNULE', date_modification = NOW()
       WHERE id_emprunt = $1 AND id_user = $2 AND statut = 'EN_ATTENTE'
       RETURNING id_emprunt`,
      [id, req.user.id_user]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Demande introuvable ou vous ne pouvez pas annuler cet emprunt.',
      });
    }

    return res.status(200).json({ success: true, message: 'Demande annulée.' });
  } catch (error) {
    console.error('Erreur annulerEmprunt:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/emprunts/mes-emprunts
// Mes emprunts (utilisateur connecté)
// ─────────────────────────────────────────────
const getMesEmprunts = async (req, res) => {
  const { statut, page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let whereAdd = '';
    let params = [req.user.id_user];
    if (statut) {
      whereAdd = 'AND e.statut = $2';
      params.push(statut);
    }

    const result = await query(
      `SELECT
         e.id_emprunt, e.date_emprunt, e.date_retour_prevue,
         e.date_retour_effectif, e.statut, e.penalite_montant, e.notes_biblio,
         r.titre, r.auteur, r.image_couverture,
         lp.isbn, lp.emplacement_rayon
       FROM emprunts e
       INNER JOIN ressources r ON r.id_ressource = e.id_livre
       INNER JOIN livres_physiques lp ON lp.id_ressource = e.id_livre
       WHERE e.id_user = $1 ${whereAdd}
       ORDER BY e.date_creation DESC
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Erreur getMesEmprunts:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/emprunts/retards
// Liste des emprunts en retard (bibliothécaire)
// ─────────────────────────────────────────────
const getRetards = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         e.id_emprunt, e.date_emprunt, e.date_retour_prevue,
         CURRENT_DATE - e.date_retour_prevue AS jours_retard,
         (CURRENT_DATE - e.date_retour_prevue) * $1 AS penalite_estimee,
         u.nom, u.prenom, u.email,
         r.titre, r.auteur, lp.isbn
       FROM emprunts e
       INNER JOIN utilisateurs u ON u.id_user = e.id_user
       INNER JOIN ressources r ON r.id_ressource = e.id_livre
       INNER JOIN livres_physiques lp ON lp.id_ressource = e.id_livre
       WHERE e.statut IN ('EN_COURS', 'EN_RETARD')
         AND e.date_retour_prevue < CURRENT_DATE
       ORDER BY e.date_retour_prevue ASC`,
      [parseInt(process.env.PENALITE_PAR_JOUR || '100')]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('Erreur getRetards:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/emprunts
// Tous les emprunts (bibliothécaire) avec filtres
// ─────────────────────────────────────────────
const getAllEmprunts = async (req, res) => {
  const { statut, user_id, livre_id, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereConditions = [];
  let params = [];
  let paramIndex = 1;

  if (statut) {
    whereConditions.push(`e.statut = $${paramIndex++}`);
    params.push(statut);
  }
  if (user_id) {
    whereConditions.push(`e.id_user = $${paramIndex++}`);
    params.push(parseInt(user_id));
  }
  if (livre_id) {
    whereConditions.push(`e.id_livre = $${paramIndex++}`);
    params.push(parseInt(livre_id));
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  try {
    const countResult = await query(
      `SELECT COUNT(*) FROM emprunts e ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT
         e.id_emprunt, e.date_emprunt, e.date_retour_prevue,
         e.date_retour_effectif, e.statut, e.penalite_montant, e.notes_biblio,
         u.nom, u.prenom, u.email, u.est_bloque,
         r.titre, r.auteur, lp.isbn
       FROM emprunts e
       INNER JOIN utilisateurs u ON u.id_user = e.id_user
       INNER JOIN ressources r ON r.id_ressource = e.id_livre
       INNER JOIN livres_physiques lp ON lp.id_ressource = e.id_livre
       ${whereClause}
       ORDER BY e.date_creation DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Erreur getAllEmprunts:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/emprunts/reservations
// Réserver un livre non disponible
// ─────────────────────────────────────────────
const reserverLivre = async (req, res) => {
  const { id_livre } = req.body;
  if (!id_livre) return res.status(400).json({ success: false, message: 'id_livre requis.' });

  try {
    // Vérifier que le livre existe
    const livreResult = await query(
      'SELECT r.titre FROM ressources r WHERE r.id_ressource = $1',
      [id_livre]
    );
    if (livreResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Livre introuvable.' });
    }

    // Vérifier qu'il n'y a pas déjà une réservation active
    const existing = await query(
      `SELECT id_reservation FROM reservations
       WHERE id_user = $1 AND id_livre = $2 AND statut = 'EN_ATTENTE'`,
      [req.user.id_user, id_livre]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Vous avez déjà une réservation active pour ce livre.' });
    }

    const result = await query(
      `INSERT INTO reservations (id_user, id_livre) VALUES ($1, $2) RETURNING *`,
      [req.user.id_user, id_livre]
    );

    return res.status(201).json({
      success: true,
      message: `Réservation pour "${livreResult.rows[0].titre}" créée. Vous serez notifié dès disponibilité.`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur reserverLivre:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = {
  creerDemande,
  validerEmprunt,
  refuserEmprunt,
  enregistrerRetour,
  annulerEmprunt,
  getMesEmprunts,
  getRetards,
  getAllEmprunts,
  reserverLivre,
};