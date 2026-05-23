// ============================================================
// LanguageThemeSwitcher.js
// Composant réutilisable : pill FR/EN + pill dark/light.
// Utilisé dans LandingPage (top-right flottant) et dans Navbar
// (à côté de la cloche de notifications) pour TOUS les dashboards.
// ============================================================

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import './LanguageThemeSwitcher.css';

export default function LanguageThemeSwitcher({
  // "floating"  → position absolue/fixed gérée par .lts-floating (landing)
  // "inline"    → s'aligne dans une flexbox parente (navbar)
  variant = 'inline',
  size = 'md', // "sm" ou "md"
  className = '',
}) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const currentLang = (i18n.language || 'fr').slice(0, 2);

  const setLang = (lng) => {
    if (lng !== currentLang) i18n.changeLanguage(lng);
  };

  return (
    <div
      className={`lts ${variant === 'floating' ? 'lts-floating' : 'lts-inline'} lts-${size} ${className}`}
      role="toolbar"
      aria-label={t('switch.toolbarAria', 'Préférences')}
    >
      <div className="lts-lang" role="group" aria-label={t('switch.languageAria')}>
        <button
          type="button"
          className={`lts-lang-btn ${currentLang === 'fr' ? 'is-active' : ''}`}
          onClick={() => setLang('fr')}
          aria-pressed={currentLang === 'fr'}
        >
          FR
        </button>
        <button
          type="button"
          className={`lts-lang-btn ${currentLang === 'en' ? 'is-active' : ''}`}
          onClick={() => setLang('en')}
          aria-pressed={currentLang === 'en'}
        >
          EN
        </button>
      </div>

      <button
        type="button"
        className="lts-theme"
        onClick={toggleTheme}
        aria-label={t('switch.themeAria')}
        title={theme === 'dark' ? t('switch.lightLabel') : t('switch.darkLabel')}
      >
        <span className={`lts-theme-icon ${theme === 'dark' ? 'is-active' : ''}`} aria-hidden="true">🌙</span>
        <span className={`lts-theme-icon ${theme === 'light' ? 'is-active' : ''}`} aria-hidden="true">☀️</span>
      </button>
    </div>
  );
}
