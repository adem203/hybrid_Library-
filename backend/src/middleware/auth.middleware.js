const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const authMiddleware = async (req, res, next) => {
  try {
    // Récupérer le token depuis le header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant. Connectez-vous.',
      });
    }

    const token = authHeader.split(' ')[1];

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Vérifier que l'utilisateur existe toujours en BDD
    const result = await query(
      'SELECT id_user, nom, prenom, email, role, est_bloque FROM utilisateurs WHERE id_user = $1',
      [decoded.id_user]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur introuvable. Token invalide.',
      });
    }

    const user = result.rows[0];

    // Vérifier si l'utilisateur est bloqué
    if (user.est_bloque) {
      return res.status(403).json({
        success: false,
        message: 'Votre compte est bloqué. Contactez le bibliothécaire.',
      });
    }

    // Attacher l'utilisateur à la requête
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré. Reconnectez-vous.',
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token invalide.',
      });
    }
    console.error('Erreur auth middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification.',
    });
  }
};

module.exports = authMiddleware;