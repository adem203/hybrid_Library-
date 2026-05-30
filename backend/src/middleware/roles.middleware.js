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
// GUEST is intentionally absent from every shortcut below: guests can only
// log in and call /auth/me. All resource routes guarded by these helpers
// deny GUEST by default (via requireRole's not-in-list 403).
const isAdmin = requireRole('ADMIN', 'BIBLIOTHECAIRE');
const isBibliothecaire = requireRole('BIBLIOTHECAIRE', 'ADMIN');
const isEnseignant = requireRole('ENSEIGNANT', 'ADMIN');
const isAuthenticated = requireRole('ETUDIANT', 'ENSEIGNANT', 'BIBLIOTHECAIRE', 'ADMIN');

module.exports = { requireRole, isAdmin, isBibliothecaire, isEnseignant, isAuthenticated };