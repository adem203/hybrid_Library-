import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const SECURITY_ITEMS = [
  {
    titleKey: 'admin.settings.jwtAuth',
    valueKey: 'admin.settings.enabled',
    detailKey: 'admin.settings.jwtDetail',
  },
  {
    titleKey: 'admin.settings.rbac',
    valueKey: 'admin.settings.enabled',
    detailKey: 'admin.settings.rbacDetail',
  },
  {
    titleKey: 'admin.settings.adminAccess',
    valueKey: 'admin.settings.protected',
    detailKey: 'admin.settings.adminAccessDetail',
  },
];

function displayName(user) {
  return [user?.prenom, user?.nom].filter(Boolean).join(' ') || '-';
}

function normalizeEnumKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

export default function AdminSettingsView() {
  const { t } = useTranslation();
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(authUser || null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);
  const [preferences, setPreferences] = useState({
    platformName: 'Educated Library',
    darkMode: true,
    notifications: true,
  });

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

  const handlePasswordChange = (field, value) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
    setPasswordMessage(null);
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordMessage(null);

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

  return (
    <>
      <div className="page-header">
        <div className="page-header-title">{t('admin.settings.title')}</div>
        <div className="page-header-sub">{t('admin.settings.profile')} / {t('admin.settings.security')} / {t('admin.settings.preferences')}</div>
      </div>

      <div className="settings-layout">
        <section className="panel settings-profile-card">
          <div className="panel-body">
            <div className="settings-profile-top">
              <div className="settings-avatar">
                {profile?.prenom?.[0] || profile?.nom?.[0] || 'A'}
              </div>
              <div>
                <h2>{loadingProfile ? t('admin.common.loading') : displayName(profile)}</h2>
                <p>{profile?.email || '-'}</p>
              </div>
            </div>

            <div className="settings-profile-meta">
              <div>
                <span>{t('admin.settings.role')}</span>
                <strong>{roleLabel(profile?.role, t)}</strong>
              </div>
              <div>
                <span>{t('admin.settings.status')}</span>
                <strong><span className={`badge ${badge.className}`}>{badge.label}</span></strong>
              </div>
              <div>
                <span>{t('admin.settings.identifier')}</span>
                <strong>{profile?.id_user ? `#${profile.id_user}` : '-'}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">{t('admin.settings.account')}</div>
          </div>
          <div className="panel-body">
            <div className="settings-form-grid">
              <div className="form-group">
                <label className="form-label">{t('admin.settings.firstName')}</label>
                <input className="form-input" value={profile?.prenom || ''} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">{t('admin.settings.lastName')}</label>
                <input className="form-input" value={profile?.nom || ''} readOnly />
              </div>
              <div className="form-group settings-form-wide">
                <label className="form-label">{t('admin.settings.email')}</label>
                <input className="form-input" value={profile?.email || ''} readOnly />
              </div>
            </div>
            <div className="settings-actions-row">
              <span className="settings-readonly-note">{t('admin.settings.profileEditUnavailable')}</span>
              <button type="button" className="btn-secondary" disabled>{t('admin.settings.readOnly')}</button>
            </div>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">{t('admin.settings.password')}</div>
          </div>
          <div className="panel-body">
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
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('admin.settings.newPassword')}</label>
                  <input
                    className="form-input"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('admin.settings.confirmPassword')}</label>
                  <input
                    className="form-input"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
              </div>
              <div className="settings-actions-row">
                <span />
                <button type="submit" className="btn-primary" disabled={passwordLoading}>
                  {passwordLoading ? t('admin.settings.saving') : t('admin.settings.save')}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-header">
            <div className="panel-title">{t('admin.settings.preferences')}</div>
          </div>
          <div className="panel-body">
            <div className="settings-preference-list">
              <label className="settings-preference-item">
                <span>
                  <strong>{t('admin.settings.platformName')}</strong>
                  <em>{preferences.platformName}</em>
                </span>
                <input className="settings-text-mini" value={preferences.platformName} readOnly />
              </label>

              <label className="settings-preference-item">
                <span>
                  <strong>{t('admin.settings.theme')}</strong>
                  <em>{preferences.darkMode ? t('admin.settings.darkModeEnabled') : t('admin.settings.lightModeEnabled')}</em>
                </span>
                <input
                  type="checkbox"
                  checked={preferences.darkMode}
                  readOnly
                  className="settings-toggle"
                />
              </label>

              <label className="settings-preference-item">
                <span>
                  <strong>{t('admin.settings.notifications')}</strong>
                  <em>{preferences.notifications ? t('admin.settings.enabledPlural') : t('admin.settings.disabledPlural')}</em>
                </span>
                <input
                  type="checkbox"
                  checked={preferences.notifications}
                  onChange={(e) => setPreferences(prev => ({ ...prev, notifications: e.target.checked }))}
                  className="settings-toggle"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="panel settings-panel settings-security-panel">
          <div className="panel-header">
            <div className="panel-title">{t('admin.settings.security')}</div>
          </div>
          <div className="panel-body">
            <div className="settings-security-grid">
              {SECURITY_ITEMS.map((item) => (
                <div className="settings-security-item" key={item.titleKey}>
                  <div>
                    <span>{t(item.titleKey)}</span>
                    <p>{t(item.detailKey)}</p>
                  </div>
                  <strong>{t(item.valueKey)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
