import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../api/api';
import './LandingPage.css';

// ── Données features ─────────────────────────────────────────
const FEATURES = [
  {
    icon: '📚',
    title: 'Catalogue Unifié',
    desc: 'Accédez à des milliers de livres physiques et documents numériques depuis une seule plateforme centralisée.',
    delay: 1,
  },
  {
    icon: '🔄',
    title: 'Gestion des Emprunts',
    desc: 'Réservez, empruntez et rendez vos livres facilement. Suivez vos emprunts en temps réel.',
    delay: 2,
  },
  {
    icon: '📄',
    title: 'Bibliothèque Numérique',
    desc: 'Lisez des PDF, regardez des vidéos de cours directement en ligne sans téléchargement obligatoire.',
    delay: 3,
  },
  {
    icon: '📊',
    title: 'Tableau de Bord BI',
    desc: 'Statistiques avancées sur les emprunts, ressources populaires et tendances de lecture.',
    delay: 4,
  },
  {
    icon: '🔔',
    title: 'Alertes Intelligentes',
    desc: 'Notifications automatiques pour les retards, nouvelles ressources et rappels de retour.',
    delay: 5,
  },
  {
    icon: '🔐',
    title: 'Accès Sécurisé',
    desc: 'Authentification JWT avec contrôle d\'accès par rôle. Vos données sont protégées.',
    delay: 6,
  },
];

const ROLES_INFO = [
  { emoji: '🎓', name: 'Étudiant', desc: 'Cherchez, réservez et lisez des ressources' },
  { emoji: '👨‍🏫', name: 'Enseignant', desc: 'Uploadez et gérez vos cours numériques' },
  { emoji: '📖', name: 'Bibliothécaire', desc: 'Gérez stocks, emprunts et utilisateurs' },
];

// ── Formulaire de connexion ──────────────────────────────────
function LoginForm({ onSuccess }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      onSuccess(user);
    } catch (err) {
      setError(err.response?.data?.message || 'Email ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-form-title">Bon retour 👋</div>
      <div className="auth-form-subtitle">Connectez-vous à votre espace Educated</div>

      {error && (
        <div className="auth-alert auth-alert-error">
          ⚠️ {error}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Email</label>
        <div className="input-wrapper">
          <span className="input-icon">✉️</span>
          <input
            type="email"
            name="email"
            className="form-input with-icon"
            placeholder="votre@email.tn"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Mot de passe</label>
        <div className="input-wrapper">
          <span className="input-icon">🔒</span>
          <input
            type="password"
            name="password"
            className="form-input with-icon"
            placeholder="••••••••"
            value={form.password}
            onChange={handleChange}
            autoComplete="current-password"
          />
        </div>
      </div>

      <button type="submit" className="auth-submit-btn" disabled={loading}>
        {loading ? (
          <><span className="btn-spinner" />Connexion en cours...</>
        ) : (
          'Se connecter →'
        )}
      </button>
    </form>
  );
}

// ── Formulaire d'inscription ─────────────────────────────────
function SignUpForm({ onSuccess }) {
  const [form, setForm] = useState({
    nom: '', prenom: '', email: '', mot_de_passe: '',
    confirm_password: '', role: 'ETUDIANT',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom || !form.email || !form.mot_de_passe) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (form.mot_de_passe.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (form.mot_de_passe !== form.confirm_password) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await authAPI.register({
        nom: form.nom,
        prenom: form.prenom,
        email: form.email,
        mot_de_passe: form.mot_de_passe,
        role: form.role,
      });
      setSuccess('Compte créé avec succès ! Vous pouvez maintenant vous connecter.');
      setTimeout(() => onSuccess(), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la création du compte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
      <div className="auth-form-title">Créer un compte</div>
      <div className="auth-form-subtitle">Rejoignez la communauté Educated</div>

      {error && <div className="auth-alert auth-alert-error">⚠️ {error}</div>}
      {success && <div className="auth-alert auth-alert-success">✅ {success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Nom *</label>
          <input type="text" name="nom" className="form-input"
            placeholder="Ben Ali" value={form.nom} onChange={handleChange} />
        </div>
        <div className="form-group">
          <label className="form-label">Prénom *</label>
          <input type="text" name="prenom" className="form-input"
            placeholder="Mohamed" value={form.prenom} onChange={handleChange} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Email *</label>
        <div className="input-wrapper">
          <span className="input-icon">✉️</span>
          <input type="email" name="email" className="form-input with-icon"
            placeholder="votre@email.tn" value={form.email} onChange={handleChange} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Je suis *</label>
        <select name="role" className="form-select" value={form.role} onChange={handleChange}>
          <option value="ETUDIANT">🎓 Étudiant</option>
          <option value="ENSEIGNANT">👨‍🏫 Enseignant</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Mot de passe *</label>
        <div className="input-wrapper">
          <span className="input-icon">🔒</span>
          <input type="password" name="mot_de_passe" className="form-input with-icon"
            placeholder="Min. 6 caractères" value={form.mot_de_passe} onChange={handleChange} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Confirmer le mot de passe *</label>
        <div className="input-wrapper">
          <span className="input-icon">🔒</span>
          <input type="password" name="confirm_password" className="form-input with-icon"
            placeholder="Répéter le mot de passe" value={form.confirm_password} onChange={handleChange} />
        </div>
      </div>

      <button type="submit" className="auth-submit-btn" disabled={loading}>
        {loading ? (
          <><span className="btn-spinner" />Création en cours...</>
        ) : (
          "Créer mon compte →"
        )}
      </button>
    </form>
  );
}

// ── Composant principal LandingPage ─────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const authRef = useRef(null);

  const handleGetStarted = () => {
    setShowAuth(true);
    setTimeout(() => {
      authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleLoginSuccess = (user) => {
    const routes = {
      ADMIN: '/admin',
      BIBLIOTHECAIRE: '/bibliothecaire',
      ETUDIANT: '/etudiant',
      ENSEIGNANT: '/enseignant',
    };
    navigate(routes[user.role] || '/');
  };

  const handleSignupSuccess = () => {
    setActiveTab('login');
  };

  return (
    <div className="landing">
      {/* Particules de fond */}
      <div className="landing-particles">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="particle" />
        ))}
      </div>

      {/* ── SECTION HERO ─────────────────── */}
      <section className="hero-section">
        <div className="hero-content">
          {/* Côté gauche */}
          <div className="hero-left">
            <div className="hero-badge">
              <div className="hero-badge-dot" />
              ERP Educated — PFE 2025-2026
            </div>

            <h1 className="hero-title">
              La Bibliothèque <br />
              <span>Hybride</span> de<br />
              Demain
            </h1>

            <p className="hero-description">
              Une plateforme unifiée pour gérer vos ressources physiques et numériques.
              Empruntez, lisez, explorez — tout en un seul endroit.
            </p>

            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-number">10k+</span>
                <span className="hero-stat-label">Ressources</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-number">4</span>
                <span className="hero-stat-label">Types d'accès</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-number">99%</span>
                <span className="hero-stat-label">Disponibilité</span>
              </div>
            </div>

            <div className="hero-cta-group">
              <button className="cta-btn" onClick={handleGetStarted}>
                Commencer maintenant →
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  document.querySelector('.features-section')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Découvrir les fonctionnalités
              </button>
            </div>
          </div>

          {/* Scène 3D */}
          <div className="hero-right">
            <div className="scene-3d">
              <div className="orbit-ring"><div className="orbit-dot" /></div>
              <div className="orbit-ring orbit-ring-2" />

              <div className="book-3d">
                <div className="book-spine" />
                <div className="book-front">
                  <div className="book-icon">📚</div>
                  <div className="book-title-3d">Educated Library</div>
                  <div className="book-subtitle-3d">Bibliothèque Hybride</div>
                </div>
                <div className="book-pages" />
                <div className="book-back" />
              </div>

              {/* Éléments flottants */}
              <div className="floating-elements">
                <div className="float-el">
                  <div className="float-el-dot" />
                  <span>📄 15 PDF disponibles</span>
                </div>
                <div className="float-el">
                  <span>📖 3 emprunts actifs</span>
                </div>
                <div className="float-el">
                  <span>✅ Retour validé</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION FEATURES ─────────────── */}
      <section className="features-section">
        <div className="section-header">
          <span className="section-label">Fonctionnalités</span>
          <h2 className="section-title">
            Tout ce dont vous avez besoin
          </h2>
          <p className="section-desc">
            Une solution complète pour moderniser la gestion documentaire
            de votre établissement.
          </p>
        </div>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="feature-card animate-slideUp"
              style={{ animationDelay: `${f.delay * 0.1}s` }}
            >
              <div className="feature-icon-wrap">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION GET STARTED (CTA) ─────── */}
      {!showAuth && (
        <section className="cta-section">
          <div className="cta-card">
            <div className="section-label">Prêt à commencer ?</div>
            <h2 className="cta-title">
              Rejoignez la plateforme<br />
              <span className="text-gradient-gold">Educated aujourd'hui</span>
            </h2>
            <p className="cta-desc">
              Créez votre compte en quelques secondes et accédez à toutes les
              ressources de votre bibliothèque, où que vous soyez.
            </p>
            <button className="cta-btn" onClick={handleGetStarted}>
              🚀 Commencer — c'est gratuit
            </button>
          </div>
        </section>
      )}

      {/* ── SECTION AUTH ─────────────────── */}
      {showAuth && (
        <section className="auth-section" ref={authRef}>
          <div className="auth-container">
            {/* Info côté gauche */}
            <div className="auth-info">
              <h2 className="auth-info-title">
                Votre espace<br />
                <span className="text-gradient-gold">personnalisé</span>
              </h2>
              <p className="auth-info-desc">
                Connectez-vous pour accéder à votre tableau de bord selon votre rôle.
                Chaque utilisateur a une interface adaptée à ses besoins.
              </p>
              <div className="auth-roles">
                {ROLES_INFO.map((r, i) => (
                  <div key={i} className="auth-role-item">
                    <span className="auth-role-emoji">{r.emoji}</span>
                    <div>
                      <div className="auth-role-name">{r.name}</div>
                      <div className="auth-role-desc">{r.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Formulaire */}
            <div className="auth-form-card">
              <div className="auth-tabs">
                <button
                  className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
                  onClick={() => setActiveTab('login')}
                  type="button"
                >
                  Connexion
                </button>
                <button
                  className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
                  onClick={() => setActiveTab('signup')}
                  type="button"
                >
                  Inscription
                </button>
              </div>

              {activeTab === 'login' ? (
                <LoginForm onSuccess={handleLoginSuccess} />
              ) : (
                <SignUpForm onSuccess={handleSignupSuccess} />
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ─────────────────────────── */}
      <footer className="landing-footer">
        <div className="footer-brand">
          Educated<span>.</span>
        </div>
        <div className="footer-copy">
          PFE 2025-2026 — Adem Laadhari — Module Bibliothèque Hybride
        </div>
      </footer>
    </div>
  );
}
