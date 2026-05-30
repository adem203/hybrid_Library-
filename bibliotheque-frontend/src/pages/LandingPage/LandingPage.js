import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../api/api';
import LanguageThemeSwitcher from '../../components/LanguageThemeSwitcher/LanguageThemeSwitcher';
import './LandingPage.css';

// Static (icon + tone) metadata for features; their textual content
// is fetched from the translation file at render time.
const FEATURE_KEYS = [
  { key: 'catalog', icon: '📚', tone: 'gold' },
  { key: 'loans',   icon: '🔄', tone: 'navy' },
  { key: 'digital', icon: '📄', tone: 'navy' },
  { key: 'bi',      icon: '📊', tone: 'gold' },
  { key: 'alerts',  icon: '🔔', tone: 'gold' },
  { key: 'secure',  icon: '🔐', tone: 'navy' },
  { key: 'support', icon: '🎧', tone: 'navy' },
  { key: 'notif',   icon: '✉️', tone: 'gold' },
];

const ROLE_KEYS = [
  { key: 'etudiant',       emoji: '🎓' },
  { key: 'enseignant',     emoji: '👨‍🏫' },
  { key: 'bibliothecaire', emoji: '📖' },
];

const STAT_ITEMS = [
  { key: 'resources',    icon: '📚', value: '10k+',  tone: 'navy' },
  { key: 'accessTypes',  icon: '🎓', value: '4',     tone: 'navy' },
  { key: 'uptime',       icon: '🛡️', value: '99%',   tone: 'navy' },
  { key: 'access',       icon: '🌐', value: '24/7',  tone: 'navy' },
];

const ROLE_CARDS = [
  {
    key: 'student',
    icon: '🎓',
    accent: 'navy',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=480&h=600&q=80',
  },
  {
    key: 'teacher',
    icon: '👨‍🏫',
    accent: 'gold',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=480&h=600&q=80',
  },
  {
    key: 'admin',
    icon: '🛡️',
    accent: 'plum',
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=480&h=600&q=80',
  },
];

const HOW_STEPS = [
  { key: 'create',  icon: '👤' },
  { key: 'explore', icon: '🔍' },
  { key: 'borrow',  icon: '📖' },
  { key: 'return',  icon: '🔁' },
];

const DASHBOARD_PREVIEWS = [
  { key: 'student', variant: 'navy' },
  { key: 'teacher', variant: 'gold' },
  { key: 'admin',   variant: 'violet' },
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

// ── Formulaire d'inscription (compte invité uniquement) ──────
// Les comptes étudiant/enseignant sont créés par l'administration
// via la page de gestion des utilisateurs. Le backend force le rôle
// GUEST quoi qu'envoie le client ; on n'expose donc pas de sélecteur.
function SignUpForm({ onSuccess }) {
  const { t } = useTranslation();
  const { setSession } = useAuth();
  const [form, setForm] = useState({
    nom: '', prenom: '', email: '', mot_de_passe: '', confirm_password: '',
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
      setError(t('landing.auth.signup.errors.required'));
      return;
    }
    if (form.mot_de_passe.length < 6) {
      setError(t('landing.auth.signup.errors.minPassword'));
      return;
    }
    if (form.mot_de_passe !== form.confirm_password) {
      setError(t('landing.auth.signup.errors.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      // No `role` field is sent: the backend forces GUEST. Sending one would
      // be ignored anyway, but we omit it to make intent explicit.
      const res = await authAPI.register({
        nom: form.nom,
        prenom: form.prenom,
        email: form.email,
        mot_de_passe: form.mot_de_passe,
      });
      if (res.data?.requireOtp) {
        setOtpEmail(res.data.email || form.email);
        setInfo(t('landing.auth.signup.otpSent'));
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t('landing.auth.signup.errors.generic')));
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
      <div className="auth-form-title">{t('landing.auth.signup.title')}</div>
      <div className="auth-form-subtitle">{t('landing.auth.signup.subtitle')}</div>

      <div className="auth-alert auth-alert-info" style={{ marginTop: 12 }}>
        ℹ️ {t('landing.auth.signup.infoMessage')}
      </div>

      {error && <div className="auth-alert auth-alert-error">⚠️ {error}</div>}
      {info && <div className="auth-alert auth-alert-info">{info}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">{t('landing.auth.signup.labels.lastName')} *</label>
          <input type="text" name="nom" className="form-input"
            placeholder={t('landing.auth.signup.placeholders.lastName')}
            value={form.nom} onChange={handleChange} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('landing.auth.signup.labels.firstName')} *</label>
          <input type="text" name="prenom" className="form-input"
            placeholder={t('landing.auth.signup.placeholders.firstName')}
            value={form.prenom} onChange={handleChange} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t('landing.auth.signup.labels.email')} *</label>
        <div className="input-wrapper">
          <span className="input-icon">✉️</span>
          <input type="email" name="email" className="form-input with-icon"
            placeholder={t('landing.auth.signup.placeholders.email')}
            value={form.email} onChange={handleChange} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t('landing.auth.signup.labels.password')} *</label>
        <div className="input-wrapper">
          <span className="input-icon">🔒</span>
          <input type="password" name="mot_de_passe" className="form-input with-icon"
            placeholder={t('landing.auth.signup.placeholders.password')}
            value={form.mot_de_passe} onChange={handleChange} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t('landing.auth.signup.labels.confirmPassword')} *</label>
        <div className="input-wrapper">
          <span className="input-icon">🔒</span>
          <input type="password" name="confirm_password" className="form-input with-icon"
            placeholder={t('landing.auth.signup.placeholders.confirmPassword')}
            value={form.confirm_password} onChange={handleChange} />
        </div>
      </div>

      <button type="submit" className="auth-submit-btn" disabled={loading}>
        {loading ? (
          <><span className="btn-spinner" />{t('landing.auth.signup.buttonLoading')}</>
        ) : (
          `${t('landing.auth.signup.button')} →`
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
const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const authRef = useRef(null);

  const openAuth = (tab = 'login') => {
    setActiveTab(tab);
    setShowAuth(true);
    setTimeout(() => {
      authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
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
    <div className="landing landing-v2">
      {/* ── TOP NAVBAR ───────────────────── */}
      <header className="lv-nav">
        <div className="lv-nav-inner">
          <a
            href="#top"
            className="lv-brand"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            <span className="lv-brand-mark" aria-hidden="true">📘</span>
            Educated<span className="lv-brand-dot">.</span>
          </a>

          <nav className="lv-nav-links" aria-label="Primary">
            <button type="button" onClick={() => scrollToId('features')}>{t('landing.nav.features')}</button>
            <button type="button" onClick={() => scrollToId('roles')}>{t('landing.nav.roles')}</button>
            <button type="button" onClick={() => scrollToId('how')}>{t('landing.nav.how')}</button>
            <button type="button" onClick={() => scrollToId('dashboards')}>{t('landing.nav.platform')}</button>
            <button type="button" onClick={() => scrollToId('final-cta')}>{t('landing.nav.contact')}</button>
          </nav>

          <div className="lv-nav-actions">
            <button type="button" className="lv-btn lv-btn-ghost" onClick={() => openAuth('login')}>
              {t('landing.nav.login')}
            </button>
            <button type="button" className="lv-btn lv-btn-primary" onClick={() => openAuth('signup')}>
              {t('landing.nav.getStarted')} →
            </button>
            <LanguageThemeSwitcher variant="inline" size="sm" className="lv-switcher" />
          </div>
        </div>
      </header>

      <main id="top" className="lv-main">
        {/* ── HERO ───────────────────────── */}
        <section className="lv-hero">
          <div className="lv-hero-grid">
            <div className="lv-hero-left">
              <div className="lv-hero-badge">
                <span className="lv-hero-badge-dot" />
                {t('landing.badge')}
              </div>

              <h1 className="lv-hero-title">
                {t('landing.hero.title_1')}<br />
                <span className="lv-gold">{t('landing.hero.title_highlight')}</span> {t('landing.hero.title_2')}<br />
                {t('landing.hero.title_3')}
              </h1>

              <p className="lv-hero-desc">{t('landing.hero.description')}</p>

              <div className="lv-hero-actions">
                <button type="button" className="lv-btn lv-btn-primary lv-btn-lg" onClick={() => openAuth('signup')}>
                  {t('landing.hero.ctaPrimary')}
                </button>
                <button
                  type="button"
                  className="lv-btn lv-btn-outline lv-btn-lg"
                  onClick={() => scrollToId('features')}
                >
                  {t('landing.hero.ctaSecondary')}
                </button>
              </div>

              <div className="lv-hero-trust">
                <div className="lv-hero-avatars" aria-hidden="true">
                  <span className="lv-avatar lv-avatar-1" />
                  <span className="lv-avatar lv-avatar-2" />
                  <span className="lv-avatar lv-avatar-3" />
                  <span className="lv-avatar lv-avatar-4" />
                </div>
                <p>{t('landing.hero.trustedBy')}</p>
              </div>
            </div>

            <div className="lv-hero-right" aria-hidden="true">
              <div className="lv-scene">
                <div className="lv-scene-orbit lv-scene-orbit-1" />
                <div className="lv-scene-orbit lv-scene-orbit-2" />
                <span className="lv-scene-dot lv-scene-dot-1" />
                <span className="lv-scene-dot lv-scene-dot-2" />
                <span className="lv-scene-dot lv-scene-dot-3" />
                <span className="lv-scene-dot lv-scene-dot-4" />

                <div className="lv-book">
                  <div className="lv-book-spine" />
                  <div className="lv-book-cover">
                    <div className="lv-book-emblem">
                      <span className="lv-book-emblem-stripe lv-stripe-1" />
                      <span className="lv-book-emblem-stripe lv-stripe-2" />
                      <span className="lv-book-emblem-stripe lv-stripe-3" />
                    </div>
                    <div className="lv-book-title">{t('landing.hero.scene.bookTitle')}</div>
                    <div className="lv-book-subtitle">{t('landing.hero.scene.bookSubtitle')}</div>
                  </div>
                  <div className="lv-book-pedestal" />
                </div>

                <div className="lv-floating lv-floating-1">
                  <div className="lv-floating-icon lv-floating-icon-gold">📄</div>
                  <div>
                    <div className="lv-floating-title">{t('landing.hero.scene.pdfTitle')}</div>
                    <div className="lv-floating-sub">{t('landing.hero.scene.pdfSubtitle')}</div>
                  </div>
                </div>
                <div className="lv-floating lv-floating-2">
                  <div className="lv-floating-icon lv-floating-icon-navy">📖</div>
                  <div>
                    <div className="lv-floating-title">{t('landing.hero.scene.loansTitle')}</div>
                    <div className="lv-floating-sub">{t('landing.hero.scene.loansSubtitle')}</div>
                  </div>
                </div>
                <div className="lv-floating lv-floating-3">
                  <div className="lv-floating-icon lv-floating-icon-success">✓</div>
                  <div>
                    <div className="lv-floating-title">{t('landing.hero.scene.returnTitle')}</div>
                    <div className="lv-floating-sub">{t('landing.hero.scene.returnSubtitle')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── STATS BAR ──────────────────── */}
          <div className="lv-stats">
            {STAT_ITEMS.map((s) => (
              <div key={s.key} className="lv-stat">
                <div className={`lv-stat-icon lv-stat-icon-${s.tone}`}>{s.icon}</div>
                <div className="lv-stat-copy">
                  <div className="lv-stat-value">{s.value}</div>
                  <div className="lv-stat-title">{t(`landing.stats.${s.key}Title`)}</div>
                  <div className="lv-stat-desc">{t(`landing.stats.${s.key}Desc`)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── ROLES SECTION ────────────────── */}
        <section id="roles" className="lv-section lv-roles">
          <div className="lv-section-head">
            <span className="lv-eyebrow">{t('landing.roles.label')}</span>
            <h2 className="lv-section-title">{t('landing.roles.title')}</h2>
          </div>
          <div className="lv-roles-grid">
            {ROLE_CARDS.map((r) => (
              <article key={r.key} className={`lv-role-card lv-role-${r.accent}`}>
                <div className="lv-role-content">
                  <div className="lv-role-icon" aria-hidden="true">{r.icon}</div>
                  <h3 className="lv-role-title">{t(`landing.roles.${r.key}.title`)}</h3>
                  <p className="lv-role-desc">{t(`landing.roles.${r.key}.desc`)}</p>
                  <button
                    type="button"
                    className="lv-role-link"
                    onClick={() => openAuth('signup')}
                  >
                    {t(`landing.roles.${r.key}.link`)}
                  </button>
                </div>
                <div className="lv-role-photo" aria-hidden="true">
                  <img src={r.image} alt="" loading="lazy" />
                  <span className="lv-role-photo-glow" />
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── FEATURES SECTION ─────────────── */}
        <section id="features" className="lv-section lv-features">
          <div className="lv-section-head">
            <span className="lv-eyebrow">{t('landing.features.label')}</span>
            <h2 className="lv-section-title">{t('landing.features.title')}</h2>
          </div>
          <div className="lv-features-grid">
            {FEATURE_KEYS.map((f) => (
              <article key={f.key} className="lv-feature-card">
                <div className={`lv-feature-icon lv-feature-icon-${f.tone}`}>{f.icon}</div>
                <h3 className="lv-feature-title">{t(`landing.features.items.${f.key}.title`)}</h3>
                <p className="lv-feature-desc">{t(`landing.features.items.${f.key}.desc`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────── */}
        <section id="how" className="lv-section lv-how">
          <div className="lv-section-head">
            <span className="lv-eyebrow">{t('landing.how.label')}</span>
            <h2 className="lv-section-title">{t('landing.how.title')}</h2>
          </div>
          <ol className="lv-how-steps">
            {HOW_STEPS.map((s, idx) => (
              <li key={s.key} className={`lv-how-step ${idx % 2 === 1 ? 'is-accent' : ''}`}>
                <div className="lv-how-step-circle">
                  <span className="lv-how-step-num">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="lv-how-step-icon">{s.icon}</span>
                </div>
                <div className="lv-how-step-copy">
                  <h3>{t(`landing.how.steps.${s.key}.title`)}</h3>
                  <p>{t(`landing.how.steps.${s.key}.desc`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── DASHBOARD PREVIEWS ───────────── */}
        <section id="dashboards" className="lv-section lv-dashboards">
          <div className="lv-section-head">
            <span className="lv-eyebrow">{t('landing.dashboards.label')}</span>
            <h2 className="lv-section-title">{t('landing.dashboards.title')}</h2>
            <p className="lv-section-sub">{t('landing.dashboards.subtitle')}</p>
          </div>
          <div className="lv-dashboards-grid">
            {DASHBOARD_PREVIEWS.map((d) => (
              <article key={d.key} className={`lv-dash-card lv-dash-${d.variant}`}>
                <div className="lv-dash-preview" aria-hidden="true">
                  <div className="lv-dash-window">
                    <div className="lv-dash-window-bar">
                      <span /><span /><span />
                      <span className="lv-dash-window-title">Educated</span>
                    </div>
                    <div className="lv-dash-window-body">
                      <aside className="lv-dash-sidebar">
                        <span className="lv-dash-row is-active" />
                        <span className="lv-dash-row" />
                        <span className="lv-dash-row" />
                        <span className="lv-dash-row" />
                      </aside>
                      <div className="lv-dash-main">
                        <div className="lv-dash-kpis">
                          <span /><span /><span /><span />
                        </div>
                        {d.variant === 'gold' ? (
                          <div className="lv-dash-chart-bars">
                            {Array.from({ length: 7 }).map((_, i) => (
                              <span key={i} style={{ height: `${40 + (i * 9) % 55}%` }} />
                            ))}
                          </div>
                        ) : d.variant === 'violet' ? (
                          <div className="lv-dash-chart-pie">
                            <div className="lv-dash-pie" />
                            <div className="lv-dash-bars-mini">
                              <span /><span /><span /><span />
                            </div>
                          </div>
                        ) : (
                          <div className="lv-dash-table">
                            <span className="lv-dash-thead" />
                            <span /><span /><span />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lv-dash-foot">
                  <div>
                    <h3>{t(`landing.dashboards.${d.key}.title`)}</h3>
                    <p>{t(`landing.dashboards.${d.key}.desc`)}</p>
                  </div>
                  <button type="button" className="lv-dash-cta" aria-label={t('landing.dashboards.label')} onClick={() => openAuth('signup')}>→</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA (dark navy) ────────── */}
        <section id="final-cta" className="lv-section lv-final-cta-wrap">
          <div className="lv-final-cta">
            <div className="lv-final-particles" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className={`lv-final-spark lv-final-spark-${i + 1}`} />
              ))}
            </div>
            <div className="lv-final-book" aria-hidden="true">
              <span className="lv-final-book-glow" />
              <span className="lv-final-book-rays" />
              <div className="lv-final-book-stage">
                <span className="lv-final-book-page lv-final-book-page-l" />
                <span className="lv-final-book-page lv-final-book-page-r" />
                <span className="lv-final-book-spine" />
                <span className="lv-final-book-shine" />
              </div>
            </div>
            <div className="lv-final-copy">
              <span className="lv-final-eyebrow">{t('landing.cta.label')}</span>
              <h2>
                {t('landing.cta.title_1')}<br />
                <span className="lv-gold">{t('landing.cta.title_highlight')}</span>
              </h2>
              <p>{t('landing.cta.desc')}</p>
            </div>
            <div className="lv-final-action">
              <button type="button" className="lv-btn lv-btn-primary lv-btn-lg" onClick={() => openAuth('signup')}>
                {t('landing.cta.button')} →
              </button>
            </div>
          </div>
        </section>

        {/* ── AUTH (inline expanded when triggered) ── */}
        {showAuth && (
          <section className="lv-section auth-section" ref={authRef}>
            <div className="auth-container">
              <div className="auth-info">
                <h2 className="auth-info-title">
                  {t('landing.auth.infoTitle_1')}<br />
                  <span className="text-gradient-gold">{t('landing.auth.infoTitle_highlight')}</span>
                </h2>
                <p className="auth-info-desc">{t('landing.auth.infoDesc')}</p>
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
      </main>

      {/* ── FOOTER ──────────────────────────── */}
      <footer className="lv-footer">
        <div className="lv-footer-grid">
          <div className="lv-footer-brand-col">
            <div className="lv-brand">
              <span className="lv-brand-mark" aria-hidden="true">📘</span>
              Educated<span className="lv-brand-dot">.</span>
            </div>
            <p className="lv-footer-tagline">{t('landing.footer.tagline')}</p>
          </div>

          <div className="lv-footer-col">
            <h4>{t('landing.footer.quickLinks')}</h4>
            <ul>
              <li><button type="button" onClick={() => scrollToId('features')}>{t('landing.footer.links.features')}</button></li>
              <li><button type="button" onClick={() => scrollToId('roles')}>{t('landing.footer.links.roles')}</button></li>
              <li><button type="button" onClick={() => scrollToId('how')}>{t('landing.footer.links.how')}</button></li>
              <li><button type="button" onClick={() => scrollToId('dashboards')}>{t('landing.footer.links.platform')}</button></li>
              <li><button type="button" onClick={() => scrollToId('final-cta')}>{t('landing.footer.links.contact')}</button></li>
            </ul>
          </div>

          <div className="lv-footer-col">
            <h4>{t('landing.footer.resources')}</h4>
            <ul>
              <li><a href="#help">{t('landing.footer.res.help')}</a></li>
              <li><a href="#docs">{t('landing.footer.res.docs')}</a></li>
              <li><a href="#privacy">{t('landing.footer.res.privacy')}</a></li>
              <li><a href="#terms">{t('landing.footer.res.terms')}</a></li>
            </ul>
          </div>

          <div className="lv-footer-col">
            <h4>{t('landing.footer.project')}</h4>
            <ul>
              <li>{t('landing.footer.proj.author')}</li>
              <li>{t('landing.footer.proj.pfe')}</li>
              <li>{t('landing.footer.proj.module')}</li>
            </ul>
            <div className="lv-footer-social" aria-label="Social">
              <a href="#linkedin" aria-label="LinkedIn">in</a>
              <a href="#github" aria-label="GitHub">{'</>'}</a>
              <a href="#email" aria-label="Email">@</a>
            </div>
          </div>
        </div>
        <div className="lv-footer-bottom">
          {t('landing.footer.copy')}
        </div>
      </footer>
    </div>
  );
}
