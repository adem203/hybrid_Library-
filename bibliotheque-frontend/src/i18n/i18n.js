// ============================================================
// i18n.js — bootstrap i18next + react-i18next
//
// Default language is French. The user choice is persisted
// in localStorage under "lang". This file is imported once
// from src/index.js so the configuration is set up before
// any component mounts.
// ============================================================

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import fr from './locales/fr.json';
import en from './locales/en.json';

const STORAGE_KEY = 'lang';

// Resolve initial language: localStorage first, French otherwise.
const getInitialLanguage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
  } catch {
    // localStorage may be unavailable (private mode, SSR…) — fall through
  }
  return 'fr';
};

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'fr',
  supportedLngs: ['fr', 'en'],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

// Persist subsequent language changes
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = lng;
    }
  } catch {
    /* ignore */
  }
});

// Sync the initial <html lang="…">
if (typeof document !== 'undefined' && document.documentElement) {
  document.documentElement.lang = i18n.language || 'fr';
}

export default i18n;
