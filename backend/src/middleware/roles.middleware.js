// Middleware de contrôle d'accès par rôle (RBAC)
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôle requis : ${roles.join(' ou ')}. Votre rôle : ${req.user.role}`,
      });
    }

    next();
  };
};

// Raccourcis pratiques
const isAdmin = requireRole('ADMIN', 'BIBLIOTHECAIRE');
const isBibliothecaire = requireRole('BIBLIOTHECAIRE', 'ADMIN');
const isEnseignant = requireRole('ENSEIGNANT', 'ADMIN');
const isAuthenticated = requireRole('ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE', 'ADMIN');

module.exports = { requireRole, isAdmin, isBibliothecaire, isEnseignant, isAuthenticated };