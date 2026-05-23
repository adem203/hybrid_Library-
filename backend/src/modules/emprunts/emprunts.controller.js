const { query, getClient } = require('../../config/db');
const { notifyAdmins } = require('../notifications/notifications.service');

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

    const emprunt = empruntResult.rows[0];
    const senderName = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() || 'Un utilisateur';
    const roleLabel = req.user.role === 'ENSEIGNANT' ? 'enseignant' : 'étudiant';

    notifyAdmins({
      title: 'Nouvelle demande d’emprunt',
      message: `${senderName} (${roleLabel}) a demandé l’emprunt du livre « ${livre.titre} ».`,
      type: 'BOOK_LOAN_REQUEST',
      relatedEntityType: 'emprunt',
      relatedEntityId: emprunt.id_emprunt,
      targetUrl: '/admin/emprunts',
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: `Demande d'emprunt pour "${livre.titre}" envoyée. En attente de validation.`,
      data: emprunt,
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
         e.id_emprunt, e.id_livre, e.date_emprunt, e.date_retour_prevue,
         e.date_retour_effectif, e.statut, e.penalite_montant, e.notes_biblio,
         e.date_creation, e.date_modification,
         r.titre, r.auteur, r.image_couverture,
         c.libelle AS categorie,
         lp.isbn, lp.emplacement_rayon
       FROM emprunts e
       INNER JOIN ressources r ON r.id_ressource = e.id_livre
       INNER JOIN livres_physiques lp ON lp.id_ressource = e.id_livre
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
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
  const { statut, user_id, livre_id, q, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereConditions = [];
  let params = [];
  let paramIndex = 1;
  const rawSearch = typeof q === 'string' ? q.trim() : '';
  const searchTerms = rawSearch.split(/\s+/).filter(Boolean);
  const normalizedSearch = rawSearch.toLowerCase();

  const loanFacetSql = `
    CONCAT_WS(' ',
      e.id_emprunt::text,
      LPAD(e.id_emprunt::text, 3, '0'),
      'EMP-' || LPAD(e.id_emprunt::text, 3, '0')
    )
  `;
  const borrowerFacetSql = `
    CONCAT_WS(' ',
      u.prenom,
      u.nom,
      CONCAT_WS(' ', u.prenom, u.nom),
      CONCAT_WS(' ', u.nom, u.prenom),
      u.email,
      u.matricule,
      u.id_user::text,
      u.role
    )
  `;
  const bookFacetSql = `
    CONCAT_WS(' ',
      r.titre,
      r.auteur,
      lp.isbn,
      REPLACE(lp.isbn, '-', ''),
      'ISBN ' || lp.isbn,
      e.id_livre::text,
      '#' || e.id_livre::text
    )
  `;

  const queryLooksLikeLoanCode = /^emp[\s-]*\d+$/i.test(rawSearch);
  const compactIdentifier = normalizedSearch
    .replace(/^isbn\s*:?\s*/, '')
    .replace(/[\s-]/g, '');
  const queryLooksLikeIsbn = /^(\d{9}[\dx]|\d{13})$/i.test(compactIdentifier);

  const buildFacetCondition = (facetSql, terms, targetParams, startIndex) => {
    let nextIndex = startIndex;
    const clauses = terms.map((term) => {
      targetParams.push(`%${term}%`);
      return `${facetSql} ILIKE $${nextIndex++}`;
    });

    return {
      sql: clauses.join(' AND '),
      nextIndex,
    };
  };

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

  try {
    if (searchTerms.length > 0) {
      let searchMode = 'all';

      if (queryLooksLikeLoanCode) {
        searchMode = 'loan';
      } else if (queryLooksLikeIsbn) {
        searchMode = 'book';
      } else {
        const borrowerProbeParams = [...params];
        const borrowerProbe = buildFacetCondition(
          borrowerFacetSql,
          searchTerms,
          borrowerProbeParams,
          paramIndex
        );
        const probeWhereConditions = [...whereConditions, `(${borrowerProbe.sql})`];
        const probeWhereClause = 'WHERE ' + probeWhereConditions.join(' AND ');
        const borrowerProbeResult = await query(
          `SELECT EXISTS (
             SELECT 1
             FROM emprunts e
             INNER JOIN utilisateurs u ON u.id_user = e.id_user
             INNER JOIN ressources r ON r.id_ressource = e.id_livre
             INNER JOIN livres_physiques lp ON lp.id_ressource = e.id_livre
             ${probeWhereClause}
           ) AS has_match`,
          borrowerProbeParams
        );

        if (borrowerProbeResult.rows[0]?.has_match) searchMode = 'borrower';
      }

      if (searchMode === 'borrower') {
        const condition = buildFacetCondition(borrowerFacetSql, searchTerms, params, paramIndex);
        whereConditions.push(`(${condition.sql})`);
        paramIndex = condition.nextIndex;
      } else if (searchMode === 'loan') {
        const condition = buildFacetCondition(loanFacetSql, searchTerms, params, paramIndex);
        whereConditions.push(`(${condition.sql})`);
        paramIndex = condition.nextIndex;
      } else if (searchMode === 'book') {
        const bookTerms = queryLooksLikeIsbn ? [compactIdentifier] : searchTerms;
        const condition = buildFacetCondition(bookFacetSql, bookTerms, params, paramIndex);
        whereConditions.push(`(${condition.sql})`);
        paramIndex = condition.nextIndex;
      } else {
        const borrowerCondition = buildFacetCondition(borrowerFacetSql, searchTerms, params, paramIndex);
        paramIndex = borrowerCondition.nextIndex;
        const loanCondition = buildFacetCondition(loanFacetSql, searchTerms, params, paramIndex);
        paramIndex = loanCondition.nextIndex;
        const bookCondition = buildFacetCondition(bookFacetSql, searchTerms, params, paramIndex);
        paramIndex = bookCondition.nextIndex;
        whereConditions.push(
          `((${borrowerCondition.sql}) OR (${loanCondition.sql}) OR (${bookCondition.sql}))`
        );
      }
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM emprunts e
       INNER JOIN utilisateurs u ON u.id_user = e.id_user
       INNER JOIN ressources r ON r.id_ressource = e.id_livre
       INNER JOIN livres_physiques lp ON lp.id_ressource = e.id_livre
       ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT
         e.id_emprunt, e.id_user, e.id_livre,
         e.date_emprunt, e.date_retour_prevue,
         e.date_retour_effectif, e.statut, e.penalite_montant, e.notes_biblio,
         u.nom, u.prenom, u.email, u.matricule, u.role, u.est_bloque,
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

    const reservation = result.rows[0];
    const bookTitle = livreResult.rows[0].titre;
    const senderName = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() || 'Un étudiant';
    const roleLabel = req.user.role === 'ENSEIGNANT' ? 'enseignant' : 'étudiant';

    // Notifier les admins (best-effort, n'échoue jamais la requête métier).
    notifyAdmins({
      title: 'Nouvelle réservation',
      message: `${senderName} (${roleLabel}) a demandé la réservation du livre « ${bookTitle} ».`,
      type: 'BOOK_RESERVATION',
      relatedEntityType: 'reservation',
      relatedEntityId: reservation.id_reservation,
      targetUrl: '/admin/reservations',
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: `Réservation pour "${bookTitle}" créée. Vous serez notifié dès disponibilité.`,
      data: reservation,
    });
  } catch (error) {
    console.error('Erreur reserverLivre:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/emprunts/reservations  (admin/biblio)
// Liste des réservations avec filtres + pagination
// ─────────────────────────────────────────────
const getAllReservations = async (req, res) => {
  const { statut, q, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereConditions = [];
  let params = [];
  let paramIndex = 1;

  if (statut) {
    whereConditions.push(`res.statut = $${paramIndex++}`);
    params.push(statut);
  }
  if (q && q.trim().length > 0) {
    whereConditions.push(
      `(u.nom ILIKE $${paramIndex}
        OR u.prenom ILIKE $${paramIndex}
        OR CONCAT_WS(' ', u.prenom, u.nom) ILIKE $${paramIndex}
        OR u.matricule ILIKE $${paramIndex}
        OR r.titre ILIKE $${paramIndex}
        OR res.id_reservation::text ILIKE $${paramIndex}
        OR LPAD(res.id_reservation::text, 3, '0') ILIKE $${paramIndex})`
    );
    params.push(`%${q.trim()}%`);
    paramIndex++;
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  try {
    const countResult = await query(
      `SELECT COUNT(*) FROM reservations res
       INNER JOIN utilisateurs u ON u.id_user = res.id_user
       INNER JOIN ressources r ON r.id_ressource = res.id_livre
       ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT
         res.id_reservation, res.date_reservation, res.statut,
         res.id_user, res.id_livre,
         u.nom, u.prenom, u.email, u.matricule, u.role,
         r.titre, r.auteur, lp.isbn, lp.stock_disponible
       FROM reservations res
       INNER JOIN utilisateurs u ON u.id_user = res.id_user
       INNER JOIN ressources r ON r.id_ressource = res.id_livre
       INNER JOIN livres_physiques lp ON lp.id_ressource = res.id_livre
       ${whereClause}
       ORDER BY res.date_reservation DESC
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
    console.error('Erreur getAllReservations:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/emprunts/reservations/:id/approve
// Confirmer une réservation (CONFIRMEE)
// ─────────────────────────────────────────────
const approveReservation = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE reservations SET statut = 'CONFIRMEE'
       WHERE id_reservation = $1 AND statut = 'EN_ATTENTE'
       RETURNING id_reservation`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable ou déjà traitée.' });
    }
    return res.status(200).json({ success: true, message: 'Réservation confirmée.' });
  } catch (error) {
    console.error('Erreur approveReservation:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/emprunts/reservations/:id/cancel
// Annuler une réservation (ANNULEE)
// ─────────────────────────────────────────────
const cancelReservation = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE reservations SET statut = 'ANNULEE'
       WHERE id_reservation = $1 AND statut IN ('EN_ATTENTE', 'CONFIRMEE')
       RETURNING id_reservation`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable ou déjà traitée.' });
    }
    return res.status(200).json({ success: true, message: 'Réservation annulée.' });
  } catch (error) {
    console.error('Erreur cancelReservation:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/emprunts/:id/prolonger
// Prolonger la date de retour d'un emprunt EN_COURS
// ─────────────────────────────────────────────
const prolongerEmprunt = async (req, res) => {
  const { id } = req.params;
  const { jours = 7 } = req.body;
  const ajouter = Math.max(1, Math.min(parseInt(jours) || 7, 60));

  try {
    const result = await query(
      `UPDATE emprunts SET
         date_retour_prevue = date_retour_prevue + ($1 || ' days')::INTERVAL,
         date_modification = NOW()
       WHERE id_emprunt = $2 AND statut IN ('EN_COURS', 'EN_RETARD')
       RETURNING id_emprunt, date_retour_prevue`,
      [ajouter.toString(), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Emprunt introuvable ou non prolongeable.' });
    }

    return res.status(200).json({
      success: true,
      message: `Emprunt prolongé de ${ajouter} jour(s).`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur prolongerEmprunt:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/emprunts/mes-reservations
// Liste des réservations de l'étudiant connecté
// ─────────────────────────────────────────────
const getMesReservations = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         res.id_reservation, res.date_reservation, res.statut,
         res.id_livre,
         r.titre, r.auteur, r.image_couverture,
         lp.isbn, lp.stock_disponible
       FROM reservations res
       INNER JOIN ressources r ON r.id_ressource = res.id_livre
       INNER JOIN livres_physiques lp ON lp.id_ressource = res.id_livre
       WHERE res.id_user = $1
       ORDER BY res.date_reservation DESC`,
      [req.user.id_user]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Erreur getMesReservations:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/emprunts/reservations/:id/annuler
// Annuler sa propre réservation (étudiant)
// ─────────────────────────────────────────────
const cancelMaReservation = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE reservations SET statut = 'ANNULEE'
       WHERE id_reservation = $1
         AND id_user = $2
         AND statut IN ('EN_ATTENTE', 'CONFIRMEE')
       RETURNING id_reservation`,
      [id, req.user.id_user]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Réservation introuvable, déjà traitée, ou non autorisée.',
      });
    }
    return res.status(200).json({ success: true, message: 'Réservation annulée.' });
  } catch (error) {
    console.error('Erreur cancelMaReservation:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/emprunts/admin
// Création manuelle d'un emprunt par un admin / bibliothécaire.
// Crée directement un emprunt EN_COURS, décrémente le stock,
// et exige id_user, id_livre et date_retour_prevue valides.
// ─────────────────────────────────────────────
const MIN_YEAR = 1900;
const MAX_YEAR = 9999;
const isValidIsoDate = (s) => {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  const y = d.getUTCFullYear();
  return y >= MIN_YEAR && y <= MAX_YEAR;
};

const creerEmpruntAdmin = async (req, res) => {
  const { id_user, id_livre, date_emprunt, date_retour_prevue, notes_biblio } = req.body;

  if (!id_user || !id_livre) {
    return res.status(400).json({
      success: false,
      message: "id_user et id_livre sont requis.",
    });
  }
  if (!isValidIsoDate(date_retour_prevue)) {
    return res.status(400).json({
      success: false,
      message: "date_retour_prevue invalide (format AAAA-MM-JJ, année entre 1900 et 9999).",
    });
  }
  if (date_emprunt && !isValidIsoDate(date_emprunt)) {
    return res.status(400).json({
      success: false,
      message: "date_emprunt invalide (format AAAA-MM-JJ, année entre 1900 et 9999).",
    });
  }

  const empruntDate = date_emprunt ? new Date(date_emprunt) : new Date();
  const dueDate = new Date(date_retour_prevue);
  if (dueDate.getTime() < empruntDate.getTime()) {
    return res.status(400).json({
      success: false,
      message: "La date de retour prévue doit être postérieure à la date d'emprunt.",
    });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT id_user, nom, prenom, est_bloque FROM utilisateurs WHERE id_user = $1`,
      [id_user]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }
    if (userResult.rows[0].est_bloque) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: "Cet utilisateur est bloqué et ne peut pas emprunter.",
      });
    }

    const livreResult = await client.query(
      `SELECT lp.stock_disponible, r.titre
       FROM livres_physiques lp
       INNER JOIN ressources r ON r.id_ressource = lp.id_ressource
       WHERE lp.id_ressource = $1
       FOR UPDATE`,
      [id_livre]
    );
    if (livreResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Livre introuvable.' });
    }
    if (livreResult.rows[0].stock_disponible <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: "Ce livre n'a plus d'exemplaires disponibles.",
      });
    }

    const existing = await client.query(
      `SELECT id_emprunt FROM emprunts
       WHERE id_user = $1 AND id_livre = $2 AND statut IN ('EN_ATTENTE', 'EN_COURS')`,
      [id_user, id_livre]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: "Cet utilisateur a déjà un emprunt actif ou en attente pour ce livre.",
      });
    }

    const insertResult = await client.query(
      `INSERT INTO emprunts (id_user, id_livre, date_emprunt, date_retour_prevue, statut, notes_biblio)
       VALUES ($1, $2, $3, $4, 'EN_COURS', $5)
       RETURNING *`,
      [id_user, id_livre, empruntDate, dueDate, notes_biblio || null]
    );

    await client.query(
      `UPDATE livres_physiques SET stock_disponible = stock_disponible - 1
       WHERE id_ressource = $1`,
      [id_livre]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: `Emprunt de "${livreResult.rows[0].titre}" créé pour ${userResult.rows[0].prenom} ${userResult.rows[0].nom}.`,
      data: insertResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur creerEmpruntAdmin:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

module.exports = {
  creerDemande,
  creerEmpruntAdmin,
  validerEmprunt,
  refuserEmprunt,
  enregistrerRetour,
  annulerEmprunt,
  getMesEmprunts,
  getRetards,
  getAllEmprunts,
  reserverLivre,
  getAllReservations,
  approveReservation,
  cancelReservation,
  prolongerEmprunt,
  getMesReservations,
  cancelMaReservation,
};
