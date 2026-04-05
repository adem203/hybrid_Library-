const { query, getClient } = require('../../config/db');
const { validationResult } = require('express-validator');
const path = require('path');

// ─────────────────────────────────────────────
// GET /api/v1/livres
// Liste paginée avec filtres
// ─────────────────────────────────────────────
const getAllLivres = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      categorie,
      disponible,
      rayon,
      sort = 'date_creation',
      order = 'DESC',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ["r.type_ressource = 'PHYSIQUE'"];
    let params = [];
    let paramIndex = 1;

    if (categorie) {
      whereConditions.push(`r.id_categorie = $${paramIndex++}`);
      params.push(parseInt(categorie));
    }
    if (disponible === 'true') {
      whereConditions.push(`lp.stock_disponible > 0`);
    }
    if (rayon) {
      whereConditions.push(`lp.emplacement_rayon ILIKE $${paramIndex++}`);
      params.push(`%${rayon}%`);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    // Colonnes de tri autorisées
    const validSortCols = ['date_creation', 'titre', 'auteur', 'stock_disponible'];
    const sortCol = validSortCols.includes(sort) ? sort : 'r.date_creation';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Compter le total
    const countResult = await query(
      `SELECT COUNT(*) FROM ressources r
       INNER JOIN livres_physiques lp ON lp.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       ${whereClause}`,
      params
    );

    // Récupérer les livres
    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT
         r.id_ressource, r.titre, r.auteur, r.date_publication,
         r.description, r.image_couverture, r.date_creation,
         c.libelle AS categorie,
         lp.isbn, lp.emplacement_rayon, lp.stock_total, lp.stock_disponible
       FROM ressources r
       INNER JOIN livres_physiques lp ON lp.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       ${whereClause}
       ORDER BY r.${sortCol} ${sortOrder}
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
    console.error('Erreur getAllLivres:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/livres/search?q=xxx
// Recherche full-text
// ─────────────────────────────────────────────
const searchLivres = async (req, res) => {
  const { q, page = 1, limit = 12 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'La recherche doit contenir au moins 2 caractères.',
    });
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const searchTerm = `%${q.trim()}%`;

  try {
    const result = await query(
      `SELECT
         r.id_ressource, r.titre, r.auteur, r.date_publication,
         r.description, r.image_couverture,
         c.libelle AS categorie,
         lp.isbn, lp.emplacement_rayon, lp.stock_total, lp.stock_disponible
       FROM ressources r
       INNER JOIN livres_physiques lp ON lp.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       WHERE r.type_ressource = 'PHYSIQUE'
         AND (
           r.titre ILIKE $1 OR
           r.auteur ILIKE $1 OR
           lp.isbn ILIKE $1 OR
           r.description ILIKE $1 OR
           c.libelle ILIKE $1
         )
       ORDER BY r.titre ASC
       LIMIT $2 OFFSET $3`,
      [searchTerm, parseInt(limit), offset]
    );

    return res.status(200).json({
      success: true,
      query: q,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('Erreur searchLivres:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/livres/:id
// Détail d'un livre
// ─────────────────────────────────────────────
const getLivreById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT
         r.*, c.libelle AS categorie,
         lp.isbn, lp.emplacement_rayon, lp.stock_total, lp.stock_disponible
       FROM ressources r
       INNER JOIN livres_physiques lp ON lp.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       WHERE r.id_ressource = $1 AND r.type_ressource = 'PHYSIQUE'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Livre introuvable.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Erreur getLivreById:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/livres
// Ajouter un nouveau livre (+ image optionnelle)
// ─────────────────────────────────────────────
const createLivre = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const {
    titre, auteur, date_publication, description, id_categorie,
    isbn, emplacement_rayon, stock_total,
  } = req.body;

  const image_couverture = req.file
    ? `/uploads/images/${req.file.filename}`
    : null;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Insérer dans ressources
    const ressourceResult = await client.query(
      `INSERT INTO ressources
         (titre, auteur, date_publication, description, image_couverture, id_categorie, type_ressource)
       VALUES ($1, $2, $3, $4, $5, $6, 'PHYSIQUE')
       RETURNING *`,
      [titre, auteur, date_publication || null, description || null, image_couverture, id_categorie || null]
    );

    const ressource = ressourceResult.rows[0];

    // Insérer dans livres_physiques
    const stockTotal = parseInt(stock_total) || 1;
    await client.query(
      `INSERT INTO livres_physiques
         (id_ressource, isbn, emplacement_rayon, stock_total, stock_disponible)
       VALUES ($1, $2, $3, $4, $4)`,
      [ressource.id_ressource, isbn || null, emplacement_rayon || null, stockTotal]
    );

    await client.query('COMMIT');

    // Récupérer le livre complet
    const finalResult = await query(
      `SELECT r.*, c.libelle AS categorie, lp.isbn, lp.emplacement_rayon, lp.stock_total, lp.stock_disponible
       FROM ressources r
       INNER JOIN livres_physiques lp ON lp.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       WHERE r.id_ressource = $1`,
      [ressource.id_ressource]
    );

    return res.status(201).json({
      success: true,
      message: 'Livre ajouté avec succès.',
      data: finalResult.rows[0],
    });

  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Un livre avec cet ISBN existe déjà.' });
    }
    console.error('Erreur createLivre:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/livres/:id
// Modifier un livre
// ─────────────────────────────────────────────
const updateLivre = async (req, res) => {
  const { id } = req.params;
  const {
    titre, auteur, date_publication, description, id_categorie,
    isbn, emplacement_rayon, stock_total, stock_disponible,
  } = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Vérifier que le livre existe
    const exists = await client.query(
      "SELECT id_ressource FROM ressources WHERE id_ressource = $1 AND type_ressource = 'PHYSIQUE'",
      [id]
    );
    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Livre introuvable.' });
    }

    // Mettre à jour la couverture si uploadée
    const image_couverture = req.file ? `/uploads/images/${req.file.filename}` : undefined;

    // Mettre à jour ressources
    await client.query(
      `UPDATE ressources SET
         titre = COALESCE($1, titre),
         auteur = COALESCE($2, auteur),
         date_publication = COALESCE($3, date_publication),
         description = COALESCE($4, description),
         id_categorie = COALESCE($5, id_categorie),
         ${image_couverture ? 'image_couverture = $7,' : ''}
         date_modification = NOW()
       WHERE id_ressource = ${image_couverture ? '$6' : '$6'}`,
      image_couverture
        ? [titre, auteur, date_publication, description, id_categorie, id, image_couverture]
        : [titre, auteur, date_publication, description, id_categorie, id]
    );

    // Mettre à jour livres_physiques
    await client.query(
      `UPDATE livres_physiques SET
         isbn = COALESCE($1, isbn),
         emplacement_rayon = COALESCE($2, emplacement_rayon),
         stock_total = COALESCE($3, stock_total),
         stock_disponible = COALESCE($4, stock_disponible)
       WHERE id_ressource = $5`,
      [isbn, emplacement_rayon, stock_total ? parseInt(stock_total) : null, stock_disponible ? parseInt(stock_disponible) : null, id]
    );

    await client.query('COMMIT');

    // Récupérer le livre mis à jour
    const result = await query(
      `SELECT r.*, c.libelle AS categorie, lp.isbn, lp.emplacement_rayon, lp.stock_total, lp.stock_disponible
       FROM ressources r
       INNER JOIN livres_physiques lp ON lp.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       WHERE r.id_ressource = $1`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Livre mis à jour.',
      data: result.rows[0],
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur updateLivre:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// DELETE /api/v1/livres/:id
// Supprimer un livre
// ─────────────────────────────────────────────
const deleteLivre = async (req, res) => {
  const { id } = req.params;
  try {
    // Vérifier qu'il n'y a pas d'emprunts en cours
    const activeLoans = await query(
      "SELECT id_emprunt FROM emprunts WHERE id_livre = $1 AND statut IN ('EN_COURS', 'EN_ATTENTE')",
      [id]
    );

    if (activeLoans.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Impossible de supprimer : ${activeLoans.rows.length} emprunt(s) en cours sur ce livre.`,
      });
    }

    // Supprimer (cascade supprime livres_physiques automatiquement)
    const result = await query(
      'DELETE FROM ressources WHERE id_ressource = $1 RETURNING id_ressource, titre',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Livre introuvable.' });
    }

    return res.status(200).json({
      success: true,
      message: `Livre "${result.rows[0].titre}" supprimé avec succès.`,
    });
  } catch (error) {
    console.error('Erreur deleteLivre:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/livres/rayons
// Lister tous les rayons disponibles
// ─────────────────────────────────────────────
const getRayons = async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT emplacement_rayon, COUNT(*) AS nb_livres
       FROM livres_physiques
       WHERE emplacement_rayon IS NOT NULL
       GROUP BY emplacement_rayon
       ORDER BY emplacement_rayon`
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Erreur getRayons:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = { getAllLivres, searchLivres, getLivreById, createLivre, updateLivre, deleteLivre, getRayons };