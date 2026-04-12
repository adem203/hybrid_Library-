import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

const ROLE_EMOJI = {
  ADMIN: '⚙️', BIBLIOTHECAIRE: '📖', ETUDIANT: '🎓', ENSEIGNANT: '👨‍🏫',
};

export default function Sidebar({ items, activeItem, onItemClick, badges = {} }) {
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-text">Educated<span>.</span></div>
        <div className="sidebar-logo-sub">Bibliothèque Hybride</div>
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
              <div key={i} className="sidebar-section-label">{item.label}</div>
            );
          }
          return (
            <div
              key={i}
              className={`sidebar-nav-item ${activeItem === item.id ? 'active' : ''}`}
              onClick={() => onItemClick(item.id)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {item.label}
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
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
