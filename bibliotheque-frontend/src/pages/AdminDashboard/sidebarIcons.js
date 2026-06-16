// ============================================================
// sidebarIcons.js — Admin-only inline SVG icon set + brand mark
//
// These are used ONLY by the Admin dashboard (passed through the
// admin-only SIDEBAR_ITEMS and Sidebar props). The shared Sidebar
// component keeps its default emoji behaviour for every other
// dashboard, so Student / Teacher are untouched.
//
// Every icon uses stroke="currentColor", so its colour is driven by
// CSS (.adm-nav-ico-* in AdminDashboard.css): a soft per-item accent
// at rest, and gold when the nav item is active.
// ============================================================

import React from 'react';

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const Ico = ({ id, children }) => (
  <svg {...ICON_PROPS} className={`adm-nav-ico adm-nav-ico-${id}`}>
    {children}
  </svg>
);

export const IconDashboard = () => (
  <Ico id="dashboard">
    <rect x="3" y="3" width="7" height="7" rx="1.6" />
    <rect x="14" y="3" width="7" height="7" rx="1.6" />
    <rect x="14" y="14" width="7" height="7" rx="1.6" />
    <rect x="3" y="14" width="7" height="7" rx="1.6" />
  </Ico>
);

export const IconUsers = () => (
  <Ico id="users">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Ico>
);

export const IconBooks = () => (
  <Ico id="livres">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Ico>
);

export const IconDocuments = () => (
  <Ico id="documents">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="16" y2="17" />
    <line x1="8" y1="9" x2="10" y2="9" />
  </Ico>
);

export const IconLoans = () => (
  <Ico id="emprunts">
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </Ico>
);

export const IconReservations = () => (
  <Ico id="reservations">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
  </Ico>
);

export const IconCategories = () => (
  <Ico id="categories">
    <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  </Ico>
);

export const IconStats = () => (
  <Ico id="stats">
    <line x1="3" y1="21" x2="21" y2="21" />
    <rect x="5" y="11" width="3.4" height="7" rx="1" />
    <rect x="10.3" y="6" width="3.4" height="12" rx="1" />
    <rect x="15.6" y="14" width="3.4" height="4" rx="1" />
  </Ico>
);

export const IconSupport = () => (
  <Ico id="support">
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
    <rect x="2" y="13" width="4" height="7" rx="1.6" />
    <rect x="18" y="13" width="4" height="7" rx="1.6" />
    <path d="M20 20a3 3 0 0 1-3 3h-3" />
  </Ico>
);

export const IconSettings = () => (
  <Ico id="settings">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Ico>
);

export const IconLogout = () => (
  <svg {...ICON_PROPS} className="adm-nav-ico adm-nav-ico-logout">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// Premium academic brand mark: gold badge with an open book.
export const AdminBrandMark = () => (
  <svg viewBox="0 0 40 40" width="38" height="38" role="img" aria-label="Educated" className="adm-brand-mark">
    <defs>
      <linearGradient id="adm-brand-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f3dd97" />
        <stop offset="0.55" stopColor="#d8b860" />
        <stop offset="1" stopColor="#bd9a3f" />
      </linearGradient>
    </defs>
    <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="url(#adm-brand-gold)" />
    <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="none" stroke="#ffffff" strokeOpacity="0.25" />
    <path
      d="M20 12.4c-2.5-1.6-5.6-2.2-8.8-1.7-.5.08-.9.5-.9 1.02v13.3c0 .64.58 1.12 1.2 1.02 2.9-.45 5.7.1 7.9 1.56 2.2-1.46 5-2.01 7.9-1.56.62.1 1.2-.38 1.2-1.02v-13.3c0-.52-.4-.94-.9-1.02-3.2-.5-6.3.1-8.8 1.7z"
      fill="#0a1330"
    />
    <path d="M20 12.7v13.4" stroke="#f3dd97" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M13 15.4c1.7-.3 3.3-.1 4.7.6M13 18.7c1.7-.3 3.3-.1 4.7.6" stroke="#d8b860" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    <path d="M27 15.4c-1.7-.3-3.3-.1-4.7.6M27 18.7c-1.7-.3-3.3-.1-4.7.6" stroke="#d8b860" strokeWidth="1.1" strokeLinecap="round" fill="none" />
  </svg>
);
