import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

const ROLE_EMOJI = {
  ADMIN: '⚙️', BIBLIOTHECAIRE: '📖', ETUDIANT: '🎓', ENSEIGNANT: '👨‍🏫',
};

export default function Sidebar({ items, activeItem, onItemClick, badges = {} }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  // Items may declare an `i18nKey` (e.g. "sidebar.items.users" or
  // "sidebar.sections.main"). If a translation exists, use it,
  // otherwise fall back to the static `label` already provided.
  // Also tries a sensible default from the item id (sidebar.items.<id>).
  const tLabel = (item, fallback) => {
    if (item.i18nKey) {
      const translated = t(item.i18nKey, { defaultValue: fallback });
      if (translated && translated !== item.i18nKey) return translated;
    }
    if (item.id) {
      const guess = `sidebar.items.${item.id}`;
      const translated = t(guess, { defaultValue: fallback });
      if (translated && translated !== guess) return translated;
    }
    return fallback;
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-text">Educated<span>.</span></div>
        <div className="sidebar-logo-sub">{t('sidebar.logoSubtitle', 'Bibliothèque Hybride')}</div>
      </div>

      {/* Profil */}
      <div className="sidebar-user">
        <div className="sidebar-avatar">
          {ROLE_EMOJI[user?.role] || '👤'}
        </div>
        <div>
          <div className="sidebar-user-name">
            {user?.prenom} {user?.nom}
          </div>
          <div className="sidebar-user-role">{user?.role}</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {items.map((item, i) => {
          if (item.type === 'section') {
            return (
              <div key={i} className="sidebar-section-label">
                {tLabel(item, item.label)}
              </div>
            );
          }
          return (
            <div
              key={i}
              className={`sidebar-nav-item ${activeItem === item.id ? 'active' : ''}`}
              onClick={() => onItemClick(item.id)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {tLabel(item, item.label)}
              {badges[item.id] > 0 && (
                <span className="sidebar-nav-badge">{badges[item.id]}</span>
              )}
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="sidebar-footer">
        <button className="sidebar-logout-btn" onClick={logout}>
          <span>🚪</span>
          {t('sidebar.logout', 'Se déconnecter')}
        </button>
      </div>
    </aside>
  );
}
