const { query } = require('../../config/db');
const { validationResult } = require('express-validator');

// GET /api/v1/categories — Lister toutes les catégories
const getAllCategories = async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, COUNT(r.id_ressource) AS nb_ressources
       FROM categories c
       LEFT JOIN ressources r ON r.id_categorie = c.id_categorie
       GROUP BY c.id_categorie
       ORDER BY c.libelle ASC`
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Erreur getAllCategories:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// GET /api/v1/categories/:id — Détail d'une catégorie
const getCategorieById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      'SELECT * FROM categories WHERE id_categorie = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Catégorie introuvable.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Erreur getCategorieById:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// POST /api/v1/categories — Créer une catégorie
const createCategorie = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { libelle, tags } = req.body;
  try {
    const result = await query(
      'INSERT INTO categories (libelle, tags) VALUES ($1, $2) RETURNING *',
      [libelle, tags || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Catégorie créée avec succès.',
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Cette catégorie existe déjà.' });
    }
    console.error('Erreur createCategorie:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// PUT /api/v1/categories/:id — Modifier une catégorie
const updateCategorie = async (req, res) => {
  const { id } = req.params;
  const { libelle, tags } = req.body;
  try {
    const result = await query(
      `UPDATE categories SET libelle = COALESCE($1, libelle), tags = COALESCE($2, tags)
       WHERE id_categorie = $3 RETURNING *`,
      [libelle, tags, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Catégorie introuvable.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Catégorie modifiée.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur updateCategorie:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// DELETE /api/v1/categories/:id — Supprimer une catégorie
const deleteCategorie = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      'DELETE FROM categories WHERE id_categorie = $1 RETURNING id_categorie',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Catégorie introuvable.' });
    }

    return res.status(200).json({ success: true, message: 'Catégorie supprimée.' });
  } catch (error) {
    console.error('Erreur deleteCategorie:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = { getAllCategories, getCategorieById, createCategorie, updateCategorie, deleteCategorie };