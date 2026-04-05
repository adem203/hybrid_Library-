const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/db');
const { validationResult } = require('express-validator');

// ─────────────────────────────────────────────
// POST /api/v1/auth/register
// Créer un nouveau compte utilisateur
// ─────────────────────────────────────────────
const register = async (req, res) => {
  // Vérifier les erreurs de validation
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { nom, prenom, email, mot_de_passe, role } = req.body;

  try {
    // Vérifier si l'email existe déjà
    const existing = await query(
      'SELECT id_user FROM utilisateurs WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà.',
      });
    }

    // Hacher le mot de passe
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(mot_de_passe, saltRounds);

    // Créer l'utilisateur
    const result = await query(
      `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_user, nom, prenom, email, role, date_creation`,
      [nom, prenom, email.toLowerCase(), hashedPassword, role || 'ETUDIANT']
    );

    const newUser = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Compte créé avec succès.',
      data: newUser,
    });

  } catch (error) {
    console.error('Erreur register:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/login
// Se connecter et recevoir un token JWT
// ─────────────────────────────────────────────
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, mot_de_passe } = req.body;

  try {
    // Trouver l'utilisateur
    const result = await query(
      'SELECT * FROM utilisateurs WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.',
      });
    }

    const user = result.rows[0];

    // Vérifier si bloqué
    if (user.est_bloque) {
      return res.status(403).json({
        success: false,
        message: 'Votre compte est bloqué. Contactez le bibliothécaire.',
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.',
      });
    }

    // Générer le token JWT
    const token = jwt.sign(
      {
        id_user: user.id_user,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Connexion réussie.',
      token,
      user: {
        id_user: user.id_user,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error) {
    console.error('Erreur login:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/auth/me
// Obtenir les infos de l'utilisateur connecté
// ─────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT id_user, nom, prenom, email, role, est_bloque, date_creation
       FROM utilisateurs WHERE id_user = $1`,
      [req.user.id_user]
    );

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur getMe:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/auth/change-password
// Changer le mot de passe
// ─────────────────────────────────────────────
const changePassword = async (req, res) => {
  const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

  try {
    const result = await query(
      'SELECT mot_de_passe FROM utilisateurs WHERE id_user = $1',
      [req.user.id_user]
    );

    const user = result.rows[0];
    const isValid = await bcrypt.compare(ancien_mot_de_passe, user.mot_de_passe);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Ancien mot de passe incorrect.',
      });
    }

    const hashed = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await query(
      'UPDATE utilisateurs SET mot_de_passe = $1, date_modification = NOW() WHERE id_user = $2',
      [hashed, req.user.id_user]
    );

    return res.status(200).json({
      success: true,
      message: 'Mot de passe modifié avec succès.',
    });
  } catch (error) {
    console.error('Erreur changePassword:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/auth/users  (Admin/Biblio seulement)
// Lister tous les utilisateurs
// ─────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const { role, bloque, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (role) {
      whereConditions.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (bloque !== undefined) {
      whereConditions.push(`est_bloque = $${paramIndex++}`);
      params.push(bloque === 'true');
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM utilisateurs ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT id_user, nom, prenom, email, role, est_bloque, date_creation
       FROM utilisateurs ${whereClause}
       ORDER BY date_creation DESC
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
    console.error('Erreur getAllUsers:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/auth/users/:id/bloquer
// Bloquer / débloquer un utilisateur
// ─────────────────────────────────────────────
const toggleBloquerUser = async (req, res) => {
  const { id } = req.params;
  const { bloquer } = req.body; // true ou false

  try {
    const result = await query(
      `UPDATE utilisateurs SET est_bloque = $1, date_modification = NOW()
       WHERE id_user = $2
       RETURNING id_user, nom, prenom, email, est_bloque`,
      [bloquer, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    return res.status(200).json({
      success: true,
      message: bloquer ? 'Utilisateur bloqué.' : 'Utilisateur débloqué.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur toggleBloquerUser:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = { register, login, getMe, changePassword, getAllUsers, toggleBloquerUser };