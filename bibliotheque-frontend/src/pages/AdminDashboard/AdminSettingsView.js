import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../../api/api';
import { useAuth } from '../../context/AuthContext';

export default function AdminSettingsView() {
  const { t } = useTranslation();
  const { user: authUser, updateUserData } = useAuth();

  const [profile, setProfile] = useState(authUser || null);

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
      try {
        const res = await authAPI.getMe();
        if (!cancelled) setProfile(res.data.data);
      } catch (error) {
        if (!cancelled) setProfile(authUser || null);
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
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
