import React, { useState, useEffect } from 'react';
import './Navbar.css';

export default function Navbar({ title, onSearch, hasNotif = false }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="app-navbar">
      <div className="navbar-title">
        {title || 'Tableau de bord'}<span>.</span>
      </div>
      <div className="navbar-right">
        <span className="navbar-time">
          {time.toLocaleDateString('fr-TN', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' — '}
          {time.toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {onSearch && (
          <div className="navbar-search">
            <span className="navbar-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Rechercher..."
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        )}
        <button className="navbar-notif-btn">
          🔔
          {hasNotif && <span className="notif-dot" />}
        </button>
      </div>
    </header>
  );
}
