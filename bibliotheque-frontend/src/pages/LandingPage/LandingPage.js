import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../api/api';
import LanguageThemeSwitcher from '../../components/LanguageThemeSwitcher/LanguageThemeSwitcher';
import './LandingPage.css';

// Static (icon + delay) metadata for features; their textual content
// is fetched from the translation file at render time.
const FEATURE_KEYS = [
  { key: 'catalog', icon: '📚', delay: 1 },
  { key: 'loans',   icon: '🔄', delay: 2 },
  { key: 'digital', icon: '📄', delay: 3 },
  { key: 'bi',      icon: '📊', delay: 4 },
  { key: 'alerts',  icon: '🔔', delay: 5 },
  { key: 'secure',  icon: '🔐', delay: 6 },
];

const ROLE_KEYS = [
  { key: 'etudiant',       emoji: '🎓' },
  { key: 'enseignant',     emoji: '👨‍🏫' },
  { key: 'bibliothecaire', emoji: '📖' },
];

// ── Formulaire de connexion ──────────────────────────────────
const RESET_GENERIC_MESSAGE = 'Si un compte existe avec cet email, un code de vérification a été envoyé.';

const getApiErrorMessage = (err, fallback) => (
  err.response?.data?.message
  || err.response?.data?.errors?.[0]?.msg
  || fallback
);

const getPasswordResetErrorMessage = (err, fallback) => {
  const code = err.response?.data?.code;
  if (code === 'PASSWORD_RESET_STORAGE_ERROR') {
    return 'Configuration serveur incomplète pour la réinitialisation. Vérifiez la table password_reset_codes dans PostgreSQL.';
  }
  if (code === 'BREVO_CONFIG_MISSING') {
    return 'Configuration Brevo manquante côté serveur. Vérifiez les variables .env puis redémarrez le backend.';
  }
  if (code === 'BREVO_API_ERROR') {
    return "Brevo a refusé l'envoi du code. Vérifiez la clé API, l'expéditeur Brevo vérifié et les logs backend.";
  }
  if (code === 'BREVO_NETWORK_ERROR' || code === 'BREVO_FETCH_UNAVAILABLE') {
    return 'Impossible de contacter Brevo depuis le backend. Vérifiez la connexion serveur et les logs.';
  }

  const message = getApiErrorMessage(err, fallback);
  return message === 'Erreur serveur.'
    ? "Impossible d'envoyer le code. Vérifiez la configuration du serveur ou réessayez plus tard."
    : message;
};

function LoginForm({ onSuccess }) {
  const { login, setSession } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [otpEmail, setOtpEmail] = useState(null);

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setResetSuccess('');
  };

  const handleForgotPassword = () => {
    setError('');
    setResetSuccess('');
    setIsResetOpen(true);
  };

  const handleResetCompleted = (email) => {
    setForm(f => ({ ...f, email, password: '' }));
    setResetSuccess('Mot de passe réinitialisé avec succès. Vous pouvez vous connecter avec le nouveau mot de passe.');
    setIsResetOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!email || !form.password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email, form.password);
      if (result?.requireOtp) {
        setOtpEmail(result.email || email);
      } else {
        onSuccess(result);
      }
    } catch (err) {
      setError(
        err.response?.data?.message
        || (err.request ? 'Serveur API indisponible. Vérifiez que le backend est démarré.' : 'Email ou mot de passe incorrect.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLoginOtp = async (code) => {
    const res = await authAPI.verifyLogin({ email: otpEmail, code });
    const user = setSession(res.data.token, res.data.user);
    setOtpEmail(null);
    onSuccess(user);
  };

  const handleResendLoginOtp = async () => {
    await authAPI.resendLoginCode({ email: otpEmail });
  };

  return (
    <>
    <form onSubmit={handleSubmit}>
      <div className="auth-form-title">Bon retour 👋</div>
      <div className="auth-form-subtitle">Connectez-vous à votre espace Educated</div>

      {error && (
        <div className="auth-alert auth-alert-error">
          ⚠️ {error}
        </div>
      )}
      {resetSuccess && (
        <div className="auth-alert auth-alert-info">
          {resetSuccess}
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
        <button type="button" className="forgot-password-link" onClick={handleForgotPassword}>
          Mot de passe oublié ?
        </button>
      </div>

      <button type="submit" className="auth-submit-btn" disabled={loading}>
        {loading ? (
          <><span className="btn-spinner" />Connexion en cours...</>
        ) : (
          'Se connecter →'
        )}
      </button>
    </form>
    {isResetOpen && (
      <PasswordResetModal
        initialEmail={form.email}
        onClose={() => setIsResetOpen(false)}
        onCompleted={handleResetCompleted}
      />
    )}
    {otpEmail && (
      <OtpVerificationModal
        email={otpEmail}
        purpose="login"
        onVerify={handleVerifyLoginOtp}
        onResend={handleResendLoginOtp}
        onClose={() => setOtpEmail(null)}
      />
    )}
    </>
  );
}

// Modal de reinitialisation du mot de passe
function PasswordResetModal({ initialEmail, onClose, onCompleted }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    email: initialEmail?.trim() || '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const updateField = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  };

  const handleCodeChange = (e) => {
    updateField('code', e.target.value.replace(/\D/g, '').slice(0, 6));
  };

  const handleRequestCode = async (e) => {
    e.preventDefault();
    const email = form.email.trim();

    if (!email) {
      setError('Email requis.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await authAPI.forgotPassword({ email });
      setForm(f => ({ ...f, email }));
      setMessage(RESET_GENERIC_MESSAGE);
      setStep(2);
    } catch (err) {
      setError(getPasswordResetErrorMessage(err, "Impossible d'envoyer le code pour le moment."));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();

    if (!form.code || form.code.length !== 6) {
      setError('Le code doit contenir 6 chiffres.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await authAPI.verifyResetCode({
        email: form.email,
        code: form.code,
      });
      setMessage('Code vérifié. Choisissez un nouveau mot de passe.');
      setStep(3);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Code invalide ou expiré.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!form.newPassword || form.newPassword.length < 6) {
      setError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await authAPI.resetPassword({
        email: form.email,
        code: form.code,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      });
      onCompleted(form.email);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Impossible de réinitialiser le mot de passe.'));
    } finally {
      setLoading(false);
    }
  };

  const stepTitle = step === 1
    ? 'Recevoir un code'
    : step === 2
      ? 'Vérifier le code'
      : 'Nouveau mot de passe';

  return (
    <div className="reset-modal-backdrop" role="presentation">
      <div className="reset-modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
        <div className="reset-modal-header">
          <div>
            <h2 id="reset-password-title">Mot de passe oublié ?</h2>
            <p>{stepTitle}</p>
          </div>
          <button type="button" className="reset-modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="reset-steps" aria-label="Progression">
          {[1, 2, 3].map(item => (
            <span key={item} className={item <= step ? 'active' : ''}>{item}</span>
          ))}
        </div>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {message && <div className="auth-alert auth-alert-info">{message}</div>}

        {step === 1 && (
          <form onSubmit={handleRequestCode} className="reset-form">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="votre@email.tn"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="reset-actions">
              <button type="button" className="reset-secondary-btn" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? <><span className="btn-spinner" />Envoi...</> : 'Envoyer le code'}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyCode} className="reset-form">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-input" value={form.email} readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Code de vérification</label>
              <input
                type="text"
                inputMode="numeric"
                className="form-input reset-code-input"
                placeholder="000000"
                value={form.code}
                onChange={handleCodeChange}
                autoComplete="one-time-code"
              />
            </div>
            <div className="reset-actions">
              <button type="button" className="reset-secondary-btn" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? <><span className="btn-spinner" />Vérification...</> : 'Vérifier le code'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword} className="reset-form">
            <div className="form-group">
              <label className="form-label">Nouveau mot de passe</label>
              <input
                type="password"
                className="form-input"
                value={form.newPassword}
                onChange={(e) => updateField('newPassword', e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmer le mot de passe</label>
              <input
                type="password"
                className="form-input"
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="reset-actions">
              <button type="button" className="reset-secondary-btn" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? <><span className="btn-spinner" />Réinitialisation...</> : 'Réinitialiser le mot de passe'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Modal OTP (utilise pour register et login) ───────────────
function OtpVerificationModal({ email, purpose, onVerify, onResend, onClose }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleCodeChange = (e) => {
    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Le code doit contenir 6 chiffres.');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await onVerify(code);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Code invalide ou expiré.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    setInfo('');
    try {
      await onResend();
      setInfo('Un nouveau code a été envoyé.');
      setCode('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Impossible de renvoyer le code.'));
    } finally {
      setResending(false);
    }
  };

  const title = purpose === 'register'
    ? 'Confirmez votre inscription'
    : 'Code de connexion';

  return (
    <div className="reset-modal-backdrop" role="presentation">
      <div className="reset-modal" role="dialog" aria-modal="true" aria-labelledby="otp-title">
        <div className="reset-modal-header">
          <div>
            <h2 id="otp-title">{title}</h2>
            <p>Code envoyé à {email}</p>
          </div>
          <button type="button" className="reset-modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {info && <div className="auth-alert auth-alert-info">{info}</div>}

        <form onSubmit={handleSubmit} className="reset-form">
          <div className="form-group">
            <label className="form-label">Code de vérification</label>
            <input
              type="text"
              inputMode="numeric"
              className="form-input reset-code-input"
              placeholder="000000"
              value={code}
              onChange={handleCodeChange}
              autoComplete="one-time-code"
              autoFocus
            />
          </div>
          <div className="reset-actions">
            <button
              type="button"
              className="reset-secondary-btn"
              onClick={handleResend}
              disabled={resending || loading}
            >
              {resending ? <><span className="btn-spinner" />Envoi...</> : 'Renvoyer le code'}
            </button>
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || code.length !== 6}
            >
              {loading ? <><span className="btn-spinner" />Vérification...</> : 'Vérifier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Formulaire d'inscription ─────────────────────────────────
function SignUpForm({ onSuccess }) {
  const { setSession } = useAuth();
  const [form, setForm] = useState({
    nom: '', prenom: '', email: '', mot_de_passe: '',
    confirm_password: '', role: 'ETUDIANT',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [otpEmail, setOtpEmail] = useState(null);

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
      const res = await authAPI.register({
        nom: form.nom,
        prenom: form.prenom,
        email: form.email,
        mot_de_passe: form.mot_de_passe,
        role: form.role,
      });
      if (res.data?.requireOtp) {
        setOtpEmail(res.data.email || form.email);
        setInfo('Un code de vérification a été envoyé à votre email.');
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erreur lors de la création du compte.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegistrationOtp = async (code) => {
    const res = await authAPI.verifyRegistration({ email: otpEmail, code });
    const user = setSession(res.data.token, res.data.user);
    setOtpEmail(null);
    onSuccess(user);
  };

  const handleResendRegistrationOtp = async () => {
    await authAPI.resendRegistrationCode({ email: otpEmail });
  };

  return (
    <>
    <form onSubmit={handleSubmit} style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
      <div className="auth-form-title">Créer un compte</div>
      <div className="auth-form-subtitle">Rejoignez la communauté Educated</div>

      {error && <div className="auth-alert auth-alert-error">⚠️ {error}</div>}
      {info && <div className="auth-alert auth-alert-info">{info}</div>}

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
    {otpEmail && (
      <OtpVerificationModal
        email={otpEmail}
        purpose="register"
        onVerify={handleVerifyRegistrationOtp}
        onResend={handleResendRegistrationOtp}
        onClose={() => setOtpEmail(null)}
      />
    )}
    </>
  );
}

// ── Composant principal LandingPage ─────────────────────────
export default function LandingPage() {
  const { t } = useTranslation();
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

  const handleSignupSuccess = (user) => {
    if (user) {
      handleLoginSuccess(user);
    } else {
      setActiveTab('login');
    }
  };

  return (
    <div className="landing">
      {/* Switchers FR/EN + dark/light (haut droite, flottant) */}
      <LanguageThemeSwitcher variant="floating" size="md" />

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
              {t('landing.badge')}
            </div>

            <h1 className="hero-title">
              {t('landing.hero.title_1')} <br />
              <span>{t('landing.hero.title_highlight')}</span> {t('landing.hero.title_2')}<br />
              {t('landing.hero.title_3')}
            </h1>

            <p className="hero-description">
              {t('landing.hero.description')}
            </p>

            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-number">10k+</span>
                <span className="hero-stat-label">{t('landing.hero.stats.resources')}</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-number">4</span>
                <span className="hero-stat-label">{t('landing.hero.stats.accessTypes')}</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-number">99%</span>
                <span className="hero-stat-label">{t('landing.hero.stats.uptime')}</span>
              </div>
            </div>

            <div className="hero-cta-group">
              <button className="cta-btn" onClick={handleGetStarted}>
                {t('landing.hero.ctaPrimary')}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  document.querySelector('.features-section')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {t('landing.hero.ctaSecondary')}
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
                  <div className="book-title-3d">{t('landing.hero.scene.bookTitle')}</div>
                  <div className="book-subtitle-3d">{t('landing.hero.scene.bookSubtitle')}</div>
                </div>
                <div className="book-pages" />
                <div className="book-back" />
              </div>

              {/* Éléments flottants */}
              <div className="floating-elements">
                <div className="float-el">
                  <div className="float-el-dot" />
                  <span>{t('landing.hero.scene.pdfBadge')}</span>
                </div>
                <div className="float-el">
                  <span>{t('landing.hero.scene.loansBadge')}</span>
                </div>
                <div className="float-el">
                  <span>{t('landing.hero.scene.returnBadge')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION FEATURES ─────────────── */}
      <section className="features-section">
        <div className="section-header">
          <span className="section-label">{t('landing.features.label')}</span>
          <h2 className="section-title">
            {t('landing.features.title')}
          </h2>
          <p className="section-desc">
            {t('landing.features.desc')}
          </p>
        </div>

        <div className="features-grid">
          {FEATURE_KEYS.map((f, i) => (
            <div
              key={f.key}
              className="feature-card animate-slideUp"
              style={{ animationDelay: `${f.delay * 0.1}s` }}
            >
              <div className="feature-icon-wrap">{f.icon}</div>
              <div className="feature-title">{t(`landing.features.items.${f.key}.title`)}</div>
              <div className="feature-desc">{t(`landing.features.items.${f.key}.desc`)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION GET STARTED (CTA) ─────── */}
      {!showAuth && (
        <section className="cta-section">
          <div className="cta-card">
            <div className="section-label">{t('landing.cta.label')}</div>
            <h2 className="cta-title">
              {t('landing.cta.title_1')}<br />
              <span className="text-gradient-gold">{t('landing.cta.title_highlight')}</span>
            </h2>
            <p className="cta-desc">
              {t('landing.cta.desc')}
            </p>
            <button className="cta-btn" onClick={handleGetStarted}>
              {t('landing.cta.button')}
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
                {t('landing.auth.infoTitle_1')}<br />
                <span className="text-gradient-gold">{t('landing.auth.infoTitle_highlight')}</span>
              </h2>
              <p className="auth-info-desc">
                {t('landing.auth.infoDesc')}
              </p>
              <div className="auth-roles">
                {ROLE_KEYS.map((r) => (
                  <div key={r.key} className="auth-role-item">
                    <span className="auth-role-emoji">{r.emoji}</span>
                    <div>
                      <div className="auth-role-name">{t(`landing.auth.roles.${r.key}.name`)}</div>
                      <div className="auth-role-desc">{t(`landing.auth.roles.${r.key}.desc`)}</div>
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
                  {t('landing.auth.tabs.login')}
                </button>
                <button
                  className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
                  onClick={() => setActiveTab('signup')}
                  type="button"
                >
                  {t('landing.auth.tabs.signup')}
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
          {t('landing.footer.copy')}
        </div>
      </footer>
    </div>
  );
}
