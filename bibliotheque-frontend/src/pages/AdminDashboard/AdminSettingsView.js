import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const SECURITY_ITEMS = [
  {
    icon: '🔑',
    titleKey: 'admin.settings.jwtAuth',
    detailKey: 'admin.settings.jwtDetail',
    valueKey: 'admin.settings.enabled',
    tone: 'success',
  },
  {
    icon: '👥',
    titleKey: 'admin.settings.rbac',
    detailKey: 'admin.settings.rbacDetail',
    valueKey: 'admin.settings.enabled',
    tone: 'success',
  },
  {
    icon: '🔒',
    titleKey: 'admin.settings.adminAccess',
    detailKey: 'admin.settings.adminAccessDetail',
    valueKey: 'admin.settings.protected',
    tone: 'info',
  },
];

function displayName(user) {
  return [user?.prenom, user?.nom].filter(Boolean).join(' ') || '-';
}

function initials(user) {
  const a = user?.prenom?.[0] || '';
  const b = user?.nom?.[0] || '';
  return (a + b).toUpperCase() || 'A';
}

function normalizeEnumKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function statusBadge(user, t) {
  if (typeof user?.est_bloque !== 'boolean') {
    return { label: t('admin.settings.unspecified'), className: 'badge-info' };
  }
  return user.est_bloque
    ? { label: t('admin.settings.blocked'), className: 'badge-danger' }
    : { label: t('admin.settings.active'), className: 'badge-success' };
}

function roleLabel(role, t) {
  const normalized = normalizeEnumKey(role);
  if (normalized === 'ADMIN') return t('admin.settings.admin');
  if (normalized === 'ADMINISTRATEUR') return t('admin.settings.administrator');
  if (normalized === 'BIBLIOTHECAIRE' || normalized === 'LIBRARIAN') return t('admin.settings.librarian');
  if (normalized === 'ENSEIGNANT' || normalized === 'TEACHER') return t('admin.settings.teacher');
  if (normalized === 'ETUDIANT' || normalized === 'STUDENT') return t('admin.settings.student');
  return role || '-';
}

function formatDateTime(value, locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    + ', ' + date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

// Best-effort, UI-only description of the current browser (no fabricated data).
function currentBrowserLabel() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = '';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  return os ? `${browser} · ${os}` : browser;
}

export default function AdminSettingsView() {
  const { t, i18n } = useTranslation();
  const { user: authUser, updateUserData, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const locale = (i18n.language || 'fr').startsWith('en') ? 'en-GB' : 'fr-FR';

  const [profile, setProfile] = useState(authUser || null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // ── Account information (editable, backed by PUT /auth/me) ──
  const [infoEditing, setInfoEditing] = useState(false);
  const [infoForm, setInfoForm] = useState({ prenom: '', nom: '', email: '' });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoMessage, setInfoMessage] = useState(null);

  // ── Password & security ──
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  // ── Preferences (notifications kept local/UI-only) ──
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const res = await authAPI.getMe();
        if (!cancelled) setProfile(res.data.data);
      } catch (error) {
        if (!cancelled) setProfile(authUser || null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [authUser]);

  const startEditInfo = () => {
    setInfoForm({
      prenom: profile?.prenom || '',
      nom: profile?.nom || '',
      email: profile?.email || '',
    });
    setInfoMessage(null);
    setInfoEditing(true);
  };

  const cancelEditInfo = () => {
    setInfoEditing(false);
    setInfoMessage(null);
  };

  const handleInfoChange = (field, value) => {
    setInfoForm(prev => ({ ...prev, [field]: value }));
    setInfoMessage(null);
  };

  const handleInfoSubmit = async (event) => {
    event.preventDefault();
    const prenom = infoForm.prenom.trim();
    const nom = infoForm.nom.trim();
    const email = infoForm.email.trim();

    if (!nom && !prenom) {
      setInfoMessage({ type: 'error', text: t('admin.settings.nameRequired') });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInfoMessage({ type: 'error', text: t('admin.settings.invalidEmail') });
      return;
    }

    setInfoSaving(true);
    try {
      const res = await authAPI.updateMe({ nom, prenom, email });
      const updated = res.data?.data || { ...profile, nom, prenom, email };
      setProfile(updated);
      updateUserData(updated);
      setInfoEditing(false);
      setInfoMessage({ type: 'success', text: res.data?.message || t('admin.settings.profileUpdated') });
    } catch (error) {
      setInfoMessage({
        type: 'error',
        text: error.response?.data?.message || t('admin.settings.profileUpdateError'),
      });
    } finally {
      setInfoSaving(false);
    }
  };

  const handlePasswordChange = (field, value) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
    setPasswordMessage(null);
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordMessage(null);

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: t('admin.settings.passwordRequired') });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: t('admin.settings.passwordMinLength') });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: t('admin.settings.passwordMismatch') });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await authAPI.changePassword({
        ancien_mot_de_passe: passwordForm.currentPassword,
        nouveau_mot_de_passe: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage({ type: 'success', text: res.data.message || t('admin.settings.passwordChanged') });
    } catch (error) {
      setPasswordMessage({
        type: 'error',
        text: error.response?.data?.message || t('admin.settings.passwordChangeError'),
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const badge = statusBadge(profile, t);
  const lastLogin = formatDateTime(profile?.last_login_at || profile?.lastLoginAt, locale);
  const browserLabel = currentBrowserLabel();
  const passwordInputType = showPasswords ? 'text' : 'password';

  return (
    <div className="admin-settings">
      {/* ── Header + breadcrumb ── */}
      <div className="settings-header">
        <h1 className="settings-title">{t('admin.settings.title')}</h1>
        <nav className="settings-breadcrumb" aria-label="breadcrumb">
          <span>{t('admin.settings.home')}</span>
          <i>›</i>
          <span>{t('admin.settings.title')}</span>
          <i>›</i>
          <span className="is-current">{t('admin.settings.accountPreferences')}</span>
        </nav>
      </div>

      <div className="settings-grid">
        {/* ── Profile / Account ── */}
        <section className="settings-card">
          <div className="settings-card-head">
            <h2><span className="settings-card-ico">👤</span>{t('admin.settings.profileAccount')}</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-profile-id">
              <div className="settings-avatar">
                {initials(profile)}
                <span className="settings-avatar-cam" aria-hidden="true">📷</span>
              </div>
              <div className="settings-profile-name">
                <h3>{loadingProfile ? t('admin.common.loading') : displayName(profile)}</h3>
                <p>{profile?.email || '-'}</p>
              </div>
            </div>

            <div className="settings-meta-list">
              <div className="settings-meta-row">
                <span><i className="settings-meta-ico">🛡️</i>{t('admin.settings.role')}</span>
                <span className="badge badge-gold">{roleLabel(profile?.role, t)}</span>
              </div>
              <div className="settings-meta-row">
                <span><i className="settings-meta-ico">⚡</i>{t('admin.settings.status')}</span>
                <span className={`badge ${badge.className}`}>{badge.label}</span>
              </div>
              <div className="settings-meta-row">
                <span><i className="settings-meta-ico">🪪</i>{t('admin.settings.memberId')}</span>
                <strong className="settings-meta-value">{profile?.id_user ? `#${profile.id_user}` : '-'}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* ── Account Information ── */}
        <section className="settings-card">
          <div className="settings-card-head">
            <h2><span className="settings-card-ico">ℹ️</span>{t('admin.settings.accountInformation')}</h2>
            {!infoEditing && (
              <button type="button" className="settings-ghost-btn" onClick={startEditInfo}>
                ✏️ {t('admin.settings.edit')}
              </button>
            )}
          </div>
          <div className="settings-card-body">
            {infoMessage && (
              <div className={`auth-alert auth-alert-${infoMessage.type === 'success' ? 'success' : 'error'}`}>
                {infoMessage.text}
              </div>
            )}
            <form onSubmit={handleInfoSubmit}>
              <div className="settings-form-grid">
                <div className="form-group">
                  <label className="form-label">{t('admin.settings.firstName')}</label>
                  <input
                    className="form-input"
                    value={infoEditing ? infoForm.prenom : (profile?.prenom || '')}
                    onChange={(e) => handleInfoChange('prenom', e.target.value)}
                    readOnly={!infoEditing}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('admin.settings.lastName')}</label>
                  <input
                    className="form-input"
                    value={infoEditing ? infoForm.nom : (profile?.nom || '')}
                    onChange={(e) => handleInfoChange('nom', e.target.value)}
                    readOnly={!infoEditing}
                  />
                </div>
                <div className="form-group settings-form-wide">
                  <label className="form-label">{t('admin.settings.email')}</label>
                  <input
                    className="form-input"
                    type="email"
                    value={infoEditing ? infoForm.email : (profile?.email || '')}
                    onChange={(e) => handleInfoChange('email', e.target.value)}
                    readOnly={!infoEditing}
                  />
                </div>
              </div>

              <p className="settings-note">🔒 {t('admin.settings.emailNote')}</p>

              {infoEditing && (
                <div className="settings-actions-row">
                  <button type="button" className="btn-secondary" onClick={cancelEditInfo} disabled={infoSaving}>
                    {t('admin.settings.cancel')}
                  </button>
                  <button type="submit" className="btn-primary" disabled={infoSaving}>
                    {infoSaving ? t('admin.settings.saving') : t('admin.settings.save')}
                  </button>
                </div>
              )}
            </form>
          </div>
        </section>

        {/* ── Password & Security ── */}
        <section className="settings-card">
          <div className="settings-card-head">
            <h2><span className="settings-card-ico">🛡️</span>{t('admin.settings.passwordSecurity')}</h2>
            <button
              type="button"
              className="settings-ghost-btn"
              onClick={() => setShowPasswords(s => !s)}
              aria-pressed={showPasswords}
            >
              {showPasswords ? '🙈' : '👁️'} {showPasswords ? t('admin.settings.hide') : t('admin.settings.show')}
            </button>
          </div>
          <div className="settings-card-body">
            {passwordMessage && (
              <div className={`auth-alert auth-alert-${passwordMessage.type === 'success' ? 'success' : 'error'}`}>
                {passwordMessage.text}
              </div>
            )}
            <form onSubmit={handlePasswordSubmit}>
              <div className="settings-form-grid">
                <div className="form-group settings-form-wide">
                  <label className="form-label">{t('admin.settings.currentPassword')}</label>
                  <input
                    className="form-input"
                    type={passwordInputType}
                    value={passwordForm.currentPassword}
                    onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                    placeholder={t('admin.settings.currentPasswordPlaceholder')}
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('admin.settings.newPassword')}</label>
                  <input
                    className="form-input"
                    type={passwordInputType}
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                    placeholder={t('admin.settings.newPasswordPlaceholder')}
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('admin.settings.confirmPassword')}</label>
                  <input
                    className="form-input"
                    type={passwordInputType}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                    placeholder={t('admin.settings.confirmPasswordPlaceholder')}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="settings-actions-row settings-actions-end">
                <button type="submit" className="btn-primary" disabled={passwordLoading}>
                  🔒 {passwordLoading ? t('admin.settings.saving') : t('admin.settings.updatePassword')}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ── Preferences ── */}
        <section className="settings-card">
          <div className="settings-card-head">
            <h2><span className="settings-card-ico">🎛️</span>{t('admin.settings.preferences')}</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-pref-list">
              <div className="settings-pref-row">
                <span className="settings-pref-ico">🌙</span>
                <div className="settings-pref-text">
                  <strong>{t('admin.settings.darkMode')}</strong>
                  <em>{t('admin.settings.darkModeHint')}</em>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDark}
                  className={`settings-switch ${isDark ? 'is-on' : ''}`}
                  onClick={toggleTheme}
                  aria-label={t('admin.settings.darkMode')}
                />
              </div>

              <div className="settings-pref-row">
                <span className="settings-pref-ico">🔔</span>
                <div className="settings-pref-text">
                  <strong>{t('admin.settings.notifications')}</strong>
                  <em>{t('admin.settings.notificationsHint')}</em>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications}
                  className={`settings-switch ${notifications ? 'is-on' : ''}`}
                  onClick={() => setNotifications(v => !v)}
                  aria-label={t('admin.settings.notifications')}
                />
              </div>

              <div className="settings-pref-row">
                <span className="settings-pref-ico">🌐</span>
                <div className="settings-pref-text">
                  <strong>{t('admin.settings.language')}</strong>
                  <em>{t('admin.settings.languageHint')}</em>
                </div>
                <select
                  className="form-select settings-lang-select"
                  value={(i18n.language || 'fr').startsWith('en') ? 'en' : 'fr'}
                  onChange={(e) => i18n.changeLanguage(e.target.value)}
                  aria-label={t('admin.settings.language')}
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* ── Security Overview ── */}
        <section className="settings-card">
          <div className="settings-card-head">
            <h2><span className="settings-card-ico">🛡️</span>{t('admin.settings.securityOverview')}</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-security-list">
              {SECURITY_ITEMS.map((item) => (
                <div className="settings-security-row" key={item.titleKey}>
                  <span className="settings-security-ico">{item.icon}</span>
                  <div className="settings-security-text">
                    <strong>{t(item.titleKey)}</strong>
                    <em>{t(item.detailKey)}</em>
                  </div>
                  <span className={`badge ${item.tone === 'info' ? 'badge-info' : 'badge-success'}`}>
                    {t(item.valueKey)} ✓
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Session Management ── */}
        <section className="settings-card">
          <div className="settings-card-head">
            <h2><span className="settings-card-ico">💻</span>{t('admin.settings.sessionManagement')}</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-session-list">
              <div className="settings-session-row">
                <span className="settings-session-ico">🖥️</span>
                <div className="settings-session-text">
                  <strong>{t('admin.settings.activeSession')}</strong>
                  <em>{t('admin.settings.activeSessionHint')}</em>
                </div>
                <div className="settings-session-end">
                  <span className="badge badge-success">{t('admin.settings.thisDevice')}</span>
                  {browserLabel && <small>{browserLabel}</small>}
                </div>
              </div>

              <div className="settings-session-row">
                <span className="settings-session-ico">📅</span>
                <div className="settings-session-text">
                  <strong>{t('admin.settings.lastLogin')}</strong>
                </div>
                <strong className="settings-session-value">{lastLogin || t('admin.settings.notAvailable')}</strong>
              </div>
            </div>

            <div className="settings-danger">
              <div className="settings-danger-text">
                <strong>⚠ {t('admin.settings.dangerZone')}</strong>
                <em>{t('admin.settings.dangerZoneHint')}</em>
              </div>
              <button type="button" className="settings-danger-btn" onClick={logout}>
                ⎋ {t('admin.settings.logoutAllDevices')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
