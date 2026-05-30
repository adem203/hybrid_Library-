import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import Sidebar from '../../components/Sidebar/Sidebar';
import Navbar from '../../components/Navbar/Navbar';
import { statsAPI, authAPI, categoriesAPI, livresAPI, documentsAPI, notificationsAPI } from '../../api/api';
import { useChartTheme } from '../../utils/chartTheme';
import StatistiquesView from './StatistiquesView';
import AdminSettingsView from './AdminSettingsView';
import EmpruntsView from './EmpruntsView';
import ReservationsView from './ReservationsView';
import AdminSupportView from './AdminSupportView';
import DateField from '../../components/DateField/DateField';
import totalUsersIcon from '../../assets/users-stats/total-users.png';
import studentsIcon from '../../assets/users-stats/students.png';
import teachersIcon from '../../assets/users-stats/teachers.png';
import blockedIcon from '../../assets/users-stats/blocked.png';
import './AdminDashboard.css';

const SIDEBAR_ITEMS = [
  { type: 'section', label: 'Principal',         i18nKey: 'sidebar.sections.main' },
  { id: 'dashboard',    icon: '🏠',   label: 'Tableau de bord',  i18nKey: 'sidebar.items.dashboard' },
  { type: 'section', label: 'Gestion',           i18nKey: 'sidebar.sections.management' },
  { id: 'users',        icon: '👥',   label: 'Utilisateurs',     i18nKey: 'sidebar.items.users' },
  { id: 'livres',       icon: '📚',   label: 'Livres',           i18nKey: 'sidebar.items.livres' },
  { id: 'documents',    icon: '📄',   label: 'Documents',        i18nKey: 'sidebar.items.documents' },
  { id: 'emprunts',     icon: '📗',   label: 'Emprunts',         i18nKey: 'sidebar.items.emprunts' },
  { id: 'reservations', icon: '📌',   label: 'Réservations',     i18nKey: 'sidebar.items.reservations' },
  { id: 'categories',   icon: '🏷️',  label: 'Catégories',       i18nKey: 'sidebar.items.categories' },
  { id: 'stats',        icon: '📊',   label: 'Statistiques',     i18nKey: 'sidebar.items.stats' },
  { type: 'section', label: 'Support',           i18nKey: 'sidebar.sections.support' },
  { id: 'support',      icon: '🎧',   label: 'Centre de support', i18nKey: 'sidebar.items.support' },
  { type: 'section', label: 'Système',           i18nKey: 'sidebar.sections.system' },
  { id: 'settings',     icon: '⚙️',  label: 'Paramètres',       i18nKey: 'sidebar.items.settings' },
];

const toDashboardNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const formatDashboardNumber = (value, fallback = '—') => {
  if (value === null || value === undefined) return fallback;
  return new Intl.NumberFormat('fr-FR').format(value);
};

const formatDashboardDateTime = (value, fallback = '—') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const day = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${day} ${time}`;
};

const DASHBOARD_STATUS_META = {
  EN_COURS:   { labelKey: 'admin.dashboard.status.enCours',   tone: 'success' },
  EN_ATTENTE: { labelKey: 'admin.dashboard.status.enAttente', tone: 'warning' },
  EN_RETARD:  { labelKey: 'admin.dashboard.status.enRetard',  tone: 'danger' },
  RETOURNE:   { labelKey: 'admin.dashboard.status.retourne',  tone: 'info' },
  CONFIRMEE:  { labelKey: 'admin.dashboard.status.confirmee', tone: 'success' },
  ANNULEE:    { labelKey: 'admin.dashboard.status.annulee',   tone: 'muted' },
  EXPIREE:    { labelKey: 'admin.dashboard.status.expiree',   tone: 'muted' },
  REFUSE:     { labelKey: 'admin.dashboard.status.refuse',    tone: 'danger' },
};

const getDashboardStatusMeta = (status) => {
  const normalized = String(status || '').toUpperCase();
  const meta = DASHBOARD_STATUS_META[normalized];
  if (meta) return meta;
  return { labelKey: 'admin.dashboard.status.unknown', fallback: normalized || null, tone: 'muted' };
};

function DashboardMetricCard({ label, value, subtitle, tone, icon }) {
  const { t } = useTranslation();
  return (
    <article className={`dashboard-stat-card dashboard-tone-${tone}`}>
      <div className="dashboard-stat-symbol" aria-hidden="true">{icon}</div>
      <div className="dashboard-stat-copy">
        <span>{label}</span>
        <strong className={value === null ? 'dashboard-value-unavailable' : ''}>
          {formatDashboardNumber(value, t('admin.dashboard.notAvailable'))}
        </strong>
        <em>{subtitle}</em>
      </div>
    </article>
  );
}

function DashboardEmptyState({ title, text }) {
  return (
    <div className="dashboard-empty-state">
      <strong>{title}</strong>
      {text && <span>{text}</span>}
    </div>
  );
}

function DashboardView({ stats, loadingStats }) {
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  const emprunts = stats?.emprunts || {};
  const stock = stats?.stock || {};
  const documents = stats?.documents || {};
  const reservations = stats?.reservations || null;

  const empruntsActifs = toDashboardNumber(emprunts.emprunts_actifs);
  const reservationsEnAttente = reservations ? toDashboardNumber(reservations.en_attente) : null;
  const retards = toDashboardNumber(emprunts.en_retard) ?? toDashboardNumber(stats?.retards);
  const livresEnStock = toDashboardNumber(stock.stock_disponible_global);
  const documentsNumeriques = toDashboardNumber(documents.nb_documents);
  const consultationsFromData = toDashboardNumber(documents.consultations_totales);
  const consultations = consultationsFromData ?? (documentsNumeriques === 0 ? 0 : null);

  const livresPhysiques = toDashboardNumber(stock.nb_livres);
  const repartitionHasData = livresPhysiques !== null || documentsNumeriques !== null;
  const livresPhysiquesValue = livresPhysiques ?? 0;
  const documentsNumeriquesValue = documentsNumeriques ?? 0;
  const repartitionTotal = repartitionHasData
    ? livresPhysiquesValue + documentsNumeriquesValue
    : null;
  const repartitionData = [
    {
      name: t('admin.dashboard.physicalBooks'),
      value: livresPhysiquesValue,
      color: '#d6a76b',
    },
    {
      name: t('admin.dashboard.digitalDocuments'),
      value: documentsNumeriquesValue,
      color: '#38bdf8',
    },
  ].map(item => ({
    ...item,
    percent: repartitionTotal > 0
      ? Math.round((item.value / repartitionTotal) * 1000) / 10
      : 0,
  }));

  const recentActivity = Array.isArray(stats?.activite_recente)
    ? stats.activite_recente
    : [];

  const metricCards = [
    {
      label: t('admin.dashboard.activeLoans'),
      value: empruntsActifs,
      subtitle: t('admin.dashboard.activeLoans'),
      tone: 'green',
      icon: '📖',
    },
    {
      label: t('admin.dashboard.pendingReservations'),
      value: reservationsEnAttente,
      subtitle: t('admin.dashboard.requestsToProcess'),
      tone: 'gold',
      icon: '⏳',
    },
    {
      label: t('admin.dashboard.overdueLoans'),
      value: retards,
      subtitle: t('admin.dashboard.overdueLoans'),
      tone: 'red',
      icon: '⚠️',
    },
    {
      label: t('admin.dashboard.booksInStock'),
      value: livresEnStock,
      subtitle: t('admin.dashboard.availableCopies'),
      tone: 'blue',
      icon: '📚',
    },
    {
      label: t('admin.dashboard.digitalDocuments'),
      value: documentsNumeriques,
      subtitle: t('admin.dashboard.registeredDocuments'),
      tone: 'purple',
      icon: '📄',
    },
    {
      label: t('admin.dashboard.totalViews'),
      value: consultations,
      subtitle: t('admin.dashboard.totalRealViews'),
      tone: 'amber',
      icon: '👁',
    },
  ];

  const alerts = [
    retards > 0
      ? {
          title: t('admin.dashboard.overdueLoansAlertTitle', { count: retards, formatted: formatDashboardNumber(retards) }),
          text: t('admin.dashboard.overdueLoansAlertText'),
          tone: 'danger',
          short: '⚠️',
        }
      : null,
    reservationsEnAttente > 0
      ? {
          title: t('admin.dashboard.pendingReservationsAlertTitle', { count: reservationsEnAttente, formatted: formatDashboardNumber(reservationsEnAttente) }),
          text: t('admin.dashboard.pendingReservationsAlertText'),
          tone: 'warning',
          short: '⏳',
        }
      : null,
  ].filter(Boolean);

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div className="dashboard-hero-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <h1>{t('admin.dashboard.title')}</h1>
          <p>{t('admin.dashboard.intro')}</p>
        </div>
      </header>

      {loadingStats ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : (
        <>
          <section className="dashboard-stat-grid" aria-label={t('admin.dashboard.mainStatsAriaLabel')}>
            {metricCards.map(card => (
              <DashboardMetricCard key={card.label} {...card} />
            ))}
          </section>

          <section className="dashboard-main-grid">
            <article className="dashboard-panel dashboard-activity-panel">
              <div className="dashboard-panel-header">
                <div>
                  <span className="dashboard-kicker">{t('admin.dashboard.recentActivity')}</span>
                  <h2>{t('admin.dashboard.recentActivity')}</h2>
                </div>
              </div>

              {recentActivity.length > 0 ? (
                <div className="dashboard-activity-list">
                  {recentActivity.map((activity, index) => {
                    const borrower = [activity.prenom, activity.nom].filter(Boolean).join(' ')
                      || t('admin.dashboard.userUnavailable');
                    const title = activity.titre || t('admin.dashboard.titleUnavailable');
                    const statusMeta = getDashboardStatusMeta(activity.statut);
                    const statusLabel = statusMeta.labelKey
                      ? t(statusMeta.labelKey)
                      : (statusMeta.fallback || t('admin.dashboard.status.unknown'));

                    return (
                      <div
                        className={`dashboard-activity-item dashboard-activity-${statusMeta.tone}`}
                        key={activity.id_emprunt || `${activity.date_creation || 'activity'}-${index}`}
                      >
                        <span className="dashboard-activity-marker" aria-hidden="true" />
                        <div className="dashboard-activity-content">
                          <strong>{borrower}</strong>
                          <span>{title}</span>
                        </div>
                        <div className="dashboard-activity-meta">
                          <span className={`dashboard-status-badge dashboard-status-${statusMeta.tone}`}>
                            {statusLabel}
                          </span>
                          <time>{formatDashboardDateTime(activity.date_creation, t('admin.dashboard.dateUnavailable'))}</time>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <DashboardEmptyState
                  title={t('admin.dashboard.emptyActivityTitle')}
                  text={t('admin.dashboard.emptyActivityText')}
                />
              )}
            </article>

            <div className="dashboard-side-column">
              <article className="dashboard-panel">
                <div className="dashboard-panel-header">
                  <div>
                    <span className="dashboard-kicker">{t('admin.dashboard.distribution')}</span>
                    <h2>{t('admin.dashboard.resources')}</h2>
                  </div>
                </div>

                {repartitionTotal > 0 ? (
                  <div className="dashboard-repartition-content">
                    <div className="dashboard-donut">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={repartitionData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={54}
                            outerRadius={78}
                            paddingAngle={3}
                            stroke="transparent"
                          >
                            {repartitionData.map(item => (
                              <Cell key={item.name} fill={item.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value, name) => [formatDashboardNumber(value), name]}
                            contentStyle={chartTheme.tooltip}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="dashboard-donut-center">
                        <span>{t('admin.dashboard.total')}</span>
                        <strong>{formatDashboardNumber(repartitionTotal, t('admin.dashboard.notAvailable'))}</strong>
                      </div>
                    </div>

                    <div className="dashboard-repartition-list">
                      {repartitionData.map(item => (
                        <div className="dashboard-repartition-row" key={item.name}>
                          <div className="dashboard-repartition-row-head">
                            <span>
                              <i style={{ background: item.color }} />
                              {item.name}
                            </span>
                            <strong>
                              {formatDashboardNumber(item.value)} ({item.percent}%)
                            </strong>
                          </div>
                          <div className="dashboard-progress">
                            <span
                              style={{
                                width: `${item.percent}%`,
                                background: item.color,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <DashboardEmptyState
                    title={t('admin.dashboard.emptyDistributionTitle')}
                    text={t('admin.dashboard.emptyDistributionText')}
                  />
                )}
              </article>

              <article className="dashboard-panel">
                <div className="dashboard-panel-header">
                  <div>
                    <span className="dashboard-kicker">{t('admin.dashboard.requestsToProcess')}</span>
                    <h2>{t('admin.dashboard.alerts')}</h2>
                  </div>
                </div>

                {alerts.length > 0 ? (
                  <div className="dashboard-alert-list">
                    {alerts.map(alert => (
                      <div className="dashboard-alert-item" key={alert.title}>
                        <span className={`dashboard-alert-icon dashboard-alert-${alert.tone}`}>
                          {alert.short}
                        </span>
                        <div>
                          <strong>{alert.title}</strong>
                          <span>{alert.text}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <DashboardEmptyState title={t('admin.dashboard.emptyAlertsTitle')} />
                )}
              </article>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// Vue Utilisateurs
const USERS_PAGE_SIZE = 10;
const USER_CREATE_ROLES = [
  { value: 'ETUDIANT', i18nKey: 'admin.roles.student' },
  { value: 'ENSEIGNANT', i18nKey: 'admin.roles.teacher' },
];
const EMPTY_CREATE_USER_FORM = {
  nom_complet: '',
  email: '',
  mot_de_passe: '',
  role: 'ETUDIANT',
  matricule: '',
};

function normalizeSearch(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizeUserSearch = normalizeSearch;

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const userIdOf = (user) => {
  const id = user?.id_user ?? user?.id ?? user?.user_id ?? user?.id_utilisateur ?? null;
  return id !== null && id !== undefined && String(id).trim() !== '' ? id : null;
};
const userFullName = (user) => (
  [user?.prenom, user?.nom].filter(Boolean).join(' ').trim()
  || user?.nom_complet
  || user?.name
  || user?.email
  || '—'
);
const userMatriculeOf = (user) => {
  const matricule = user?.matricule;
  return matricule !== null && matricule !== undefined && String(matricule).trim() !== ''
    ? String(matricule).trim()
    : null;
};
const userIdDisplay = (user) => {
  const id = userIdOf(user);
  return id !== null && id !== undefined ? String(id).trim() : '—';
};
const userMatriculeDisplay = (user) => userMatriculeOf(user) || '—';
const userMatriculeOrId = (user) => userMatriculeOf(user) || (userIdOf(user) != null ? String(userIdOf(user)) : '—');
const userCreatedAt = (user) => user?.date_creation ?? user?.created_at ?? user?.createdAt ?? null;
const userLastLoginAt = (user) => user?.last_login_at ?? user?.lastLoginAt ?? null;
const userLastLogoutAt = (user) => user?.last_logout_at ?? user?.lastLogoutAt ?? null;
const isTruthyBackendFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['true', '1', 'oui', 'yes'].includes(normalizeUserSearch(value));
};
const isUserBlocked = (user) => {
  const status = normalizeUserSearch(user?.status || user?.statut);
  return isTruthyBackendFlag(user?.est_bloque)
    || isTruthyBackendFlag(user?.blocked)
    || ['bloque', 'blocked', 'inactif', 'inactive'].includes(status);
};
const userStatusKey = (user) => {
  const status = normalizeUserSearch(user?.status || user?.statut);
  if (['inactif', 'inactive'].includes(status)) return 'inactive';
  return isUserBlocked(user) ? 'blocked' : 'active';
};

const userStatusLabel = (user, t) => {
  const key = userStatusKey(user);
  if (typeof t === 'function') return t(`admin.statuses.${key}`);
  if (key === 'inactive') return 'Inactif';
  return key === 'blocked' ? 'Bloqué' : 'Actif';
};

const userRoleGroup = (role) => {
  const value = normalizeUserSearch(role).replace(/-/g, '_');
  if (['etudiant', 'student'].includes(value)) return 'student';
  if (['enseignant', 'teacher'].includes(value)) return 'teacher';
  if (['admin', 'administrateur', 'bibliothecaire', 'librarian'].includes(value)) return 'admin';
  return 'other';
};

const userRoleLabel = (role) => {
  const group = userRoleGroup(role);
  const value = normalizeUserSearch(role).replace(/-/g, '_');
  if (group === 'student') return 'Étudiant';
  if (group === 'teacher') return 'Enseignant';
  if (group === 'admin') return ['bibliothecaire', 'librarian'].includes(value) ? 'Bibliothécaire' : 'Admin';
  return role || '—';
};

const translatedUserRoleLabel = (role, t) => {
  const group = userRoleGroup(role);
  const value = normalizeUserSearch(role).replace(/-/g, '_');
  if (group === 'student') return t('admin.roles.student');
  if (group === 'teacher') return t('admin.roles.teacher');
  if (group === 'admin') return ['bibliothecaire', 'librarian'].includes(value)
    ? t('admin.roles.librarian')
    : t('admin.roles.adminShort');
  return role || '—';
};

const searchParts = (values) => values
  .filter(value => value !== null && value !== undefined && String(value).trim() !== '');

const userVisibleNameForSearch = (user) => {
  const displayName = userFullName(user);
  return normalizeSearch(displayName) === normalizeSearch(user?.email) ? '' : displayName;
};

const userNameSearchText = (user) => normalizeSearch(searchParts([
  userVisibleNameForSearch(user),
  [user?.prenom, user?.nom].filter(Boolean).join(' '),
  user?.prenom,
  user?.nom,
  user?.nom_complet,
  user?.name,
]).join(' '));

const userRoleSearchText = (user) => normalizeSearch(searchParts([
  user?.role,
  userRoleLabel(user?.role),
  userRoleGroup(user?.role),
  userRoleGroup(user?.role) === 'student' ? 'student etudiant' : '',
  userRoleGroup(user?.role) === 'teacher' ? 'teacher enseignant' : '',
  userRoleGroup(user?.role) === 'admin' ? 'admin administrateur bibliothecaire librarian' : '',
]).join(' '));

const userStatusSearchText = (user) => normalizeSearch(searchParts([
  userStatusLabel(user),
  user?.status,
  user?.statut,
  isUserBlocked(user) ? 'bloque blocked inactif inactive' : 'actif active',
]).join(' '));

const userEmailSearchText = (user) => normalizeSearch(user?.email);
const userMatriculeSearchText = (user) => normalizeSearch(userMatriculeOf(user));
const userIdSearchText = (user) => normalizeSearch(userIdOf(user));

// Search-by-text matches the placeholder contract:
// "Search by name, email, registration number, or ID".
// Each term must appear (as a substring) in at least one of those fields.
const userPrimarySearchText = (user) => normalizeSearch([
  userNameSearchText(user),
  userEmailSearchText(user),
  userMatriculeSearchText(user),
  userIdSearchText(user),
].filter(Boolean).join(' '));

const getUserSearchQuery = (search) => {
  const query = normalizeSearch(search);
  const terms = query.split(' ').filter(Boolean);
  return { query, terms };
};

const userMatchesSearchQuery = (user, searchQuery) => {
  const { terms } = searchQuery;
  if (terms.length === 0) return true;
  const haystack = userPrimarySearchText(user);
  return terms.every(term => haystack.includes(term));
};

const userEditableRoleValue = (role) => {
  const group = userRoleGroup(role);
  if (group === 'student') return 'ETUDIANT';
  if (group === 'teacher') return 'ENSEIGNANT';
  return '';
};

const isProtectedAdminUser = (user) => userRoleGroup(user?.role) === 'admin';

const userInitials = (user) => {
  const parts = userFullName(user)
    .replace('@', ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (parts[0]?.[0] || 'U') + (parts[1]?.[0] || '');
};

const userRowKey = (user) => {
  const id = userIdOf(user);
  if (id != null) return `user-${id}`;
  if (user?.matricule) return `matricule-${user.matricule}`;
  return `email-${user?.email || userFullName(user)}`;
};

const formatAdminDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const dateKey = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const exportUsersCSV = (rows, t) => {
  const headers = [
    t('admin.users.tableId'),
    t('admin.users.csvName'),
    t('admin.users.tableEmail'),
    t('admin.users.tableRole'),
    t('admin.users.tableStatus'),
    t('admin.users.csvRegistrationOrId'),
    t('admin.users.tableRegisteredOn'),
  ];
  const esc = (value) => {
    if (value === null || value === undefined) return '';
    const s = String(value).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(user => {
    lines.push([
      userIdOf(user),
      userFullName(user),
      user.email || '',
      translatedUserRoleLabel(user.role, t),
      userStatusLabel(user, t),
      userMatriculeOrId(user),
      formatAdminDate(userCreatedAt(user)),
    ].map(esc).join(','));
  });

  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${t('admin.users.exportFilePrefix')}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

function UserStatCard({ label, value, meta, tone, icon }) {
  return (
    <div className={`users-stat-card users-tone-${tone}`}>
      <div className="users-stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{meta}</em>
      </div>
    </div>
  );
}

function UserDetailsModal({ user, onClose }) {
  const { t } = useTranslation();
  if (!user) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('admin.users.detailsTitle')}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('admin.common.close')}>×</button>
        </div>
        <div className="modal-body">
          <div className="modal-grid">
            <div><span className="modal-label">{t('admin.users.fullName')}</span>{userFullName(user)}</div>
            <div><span className="modal-label">{t('admin.users.tableEmail')}</span>{user.email || '—'}</div>
            <div><span className="modal-label">{t('admin.users.tableRole')}</span>{translatedUserRoleLabel(user.role, t)}</div>
            <div><span className="modal-label">{t('admin.users.tableStatus')}</span>{userStatusLabel(user, t)}</div>
            <div><span className="modal-label">{t('admin.users.csvRegistrationOrId')}</span>{userMatriculeOrId(user)}</div>
            <div><span className="modal-label">{t('admin.users.tableRegisteredOn')}</span>{formatAdminDate(userCreatedAt(user))}</div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('admin.common.close')}</button>
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onSubmit }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_CREATE_USER_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nomComplet = form.nom_complet.trim().replace(/\s+/g, ' ');
    const email = form.email.trim().toLowerCase();
    const password = form.mot_de_passe;
    const role = form.role;
    const matricule = form.matricule.trim();

    if (!nomComplet) {
      setError(t('admin.users.errors.fullNameRequired'));
      return;
    }
    if (!isValidEmail(email)) {
      setError(t('admin.users.errors.invalidEmail'));
      return;
    }
    if (!password) {
      setError(t('admin.users.errors.passwordRequired'));
      return;
    }
    if (password.length < 6) {
      setError(t('admin.users.errors.passwordMinLength'));
      return;
    }
    if (!USER_CREATE_ROLES.some(option => option.value === role)) {
      setError(t('admin.users.errors.roleRequired'));
      return;
    }

    const payload = {
      nom_complet: nomComplet,
      email,
      mot_de_passe: password,
      role,
    };
    if (matricule) payload.matricule = matricule;

    setSaving(true);
    setError('');
    try {
      await onSubmit(payload);
    } catch (err) {
      const validationMessage = err.response?.data?.errors?.[0]?.msg;
      setError(validationMessage || err.response?.data?.message || err.message || t('admin.users.errors.createFailed'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal-card users-create-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('admin.users.addUser')}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label={t('admin.common.close')}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-alert auth-alert-error users-create-error">{error}</div>}
            <div className="users-create-grid">
              <label className="users-create-field users-create-field-wide">
                <span>{t('admin.users.fullName')}</span>
                <input
                  className="form-input"
                  name="nom_complet"
                  value={form.nom_complet}
                  onChange={handleChange}
                  autoFocus
                  disabled={saving}
                />
              </label>
              <label className="users-create-field users-create-field-wide">
                <span>{t('admin.users.tableEmail')}</span>
                <input
                  className="form-input"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  disabled={saving}
                />
              </label>
              <label className="users-create-field">
                <span>{t('admin.users.password')}</span>
                <input
                  className="form-input"
                  name="mot_de_passe"
                  type="password"
                  value={form.mot_de_passe}
                  onChange={handleChange}
                  disabled={saving}
                />
              </label>
              <label className="users-create-field">
                <span>{t('admin.users.tableRole')}</span>
                <select
                  className="form-select"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  disabled={saving}
                >
                  {USER_CREATE_ROLES.map(option => (
                    <option key={option.value} value={option.value}>{t(option.i18nKey)}</option>
                  ))}
                </select>
              </label>
              <label className="users-create-field users-create-field-wide">
                <span>{t('admin.users.tableRegistration')}</span>
                <input
                  className="form-input"
                  name="matricule"
                  value={form.matricule}
                  onChange={handleChange}
                  placeholder={t('admin.users.optional')}
                  disabled={saving}
                />
                <em>{t('admin.users.registrationHelp')}</em>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('admin.common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('admin.users.creating') : t('admin.users.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onSubmit }) {
  const { t } = useTranslation();
  const protectedAdmin = isProtectedAdminUser(user);
  const [form, setForm] = useState(() => ({
    nom_complet: userFullName(user) === '—' ? '' : userFullName(user),
    email: user?.email || '',
    role: userEditableRoleValue(user?.role),
    matricule: userMatriculeOf(user) || '',
    mot_de_passe: '',
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nomComplet = form.nom_complet.trim().replace(/\s+/g, ' ');
    const email = form.email.trim().toLowerCase();
    const password = form.mot_de_passe;
    const role = form.role;
    const matricule = form.matricule.trim();

    if (!nomComplet) {
      setError(t('admin.users.errors.fullNameRequired'));
      return;
    }
    if (!isValidEmail(email)) {
      setError(t('admin.users.errors.invalidEmail'));
      return;
    }
    if (!protectedAdmin && !USER_CREATE_ROLES.some(option => option.value === role)) {
      setError(t('admin.users.errors.roleRequired'));
      return;
    }
    if (password && password.length < 6) {
      setError(t('admin.users.errors.passwordMinLength'));
      return;
    }

    const payload = {
      nom_complet: nomComplet,
      email,
      matricule: matricule || null,
    };
    if (!protectedAdmin) payload.role = role;
    if (password) payload.mot_de_passe = password;

    setSaving(true);
    setError('');
    try {
      await onSubmit(user, payload);
    } catch (err) {
      const validationMessage = err.response?.data?.errors?.[0]?.msg;
      setError(validationMessage || err.response?.data?.message || err.message || t('admin.users.errors.updateFailed'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal-card users-create-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('admin.users.editUser')}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label={t('admin.common.close')}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-alert auth-alert-error users-create-error">{error}</div>}
            <div className="users-create-grid">
              <label className="users-create-field users-create-field-wide">
                <span>{t('admin.users.fullName')}</span>
                <input
                  className="form-input"
                  name="nom_complet"
                  value={form.nom_complet}
                  onChange={handleChange}
                  autoFocus
                  disabled={saving}
                />
              </label>
              <label className="users-create-field users-create-field-wide">
                <span>{t('admin.users.tableEmail')}</span>
                <input
                  className="form-input"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  disabled={saving}
                />
              </label>
              <label className="users-create-field">
                <span>{t('admin.users.tableRole')}</span>
                {protectedAdmin ? (
                  <>
                    <input className="form-input" value={translatedUserRoleLabel(user.role, t)} disabled readOnly />
                    <em>{t('admin.users.adminRoleLocked')}</em>
                  </>
                ) : (
                  <select
                    className="form-select"
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    disabled={saving}
                  >
                    {USER_CREATE_ROLES.map(option => (
                      <option key={option.value} value={option.value}>{t(option.i18nKey)}</option>
                    ))}
                  </select>
                )}
              </label>
              <label className="users-create-field">
                <span>{t('admin.users.tableRegistration')}</span>
                <input
                  className="form-input"
                  name="matricule"
                  value={form.matricule}
                  onChange={handleChange}
                  placeholder={t('admin.users.optional')}
                  disabled={saving}
                />
              </label>
              <label className="users-create-field users-create-field-wide">
                <span>{t('admin.users.password')}</span>
                <input
                  className="form-input"
                  name="mot_de_passe"
                  type="password"
                  value={form.mot_de_passe}
                  onChange={handleChange}
                  placeholder={t('admin.users.keepPasswordPlaceholder')}
                  disabled={saving}
                />
                <em>{t('admin.users.passwordHelp')}</em>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('admin.common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('admin.users.saving') : t('admin.common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersView({ users = [], loading, error, onToggleBlock, onCreateUser, onUpdateUser, currentUser }) {
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [flash, setFlash] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, dateFilter]);

  const stats = users.reduce((acc, user) => {
    acc.total += 1;
    const group = userRoleGroup(user.role);
    if (group === 'student') acc.students += 1;
    if (group === 'teacher') acc.teachers += 1;
    if (group === 'admin') acc.admins += 1;
    if (isUserBlocked(user)) acc.blocked += 1;
    return acc;
  }, { total: 0, students: 0, teachers: 0, admins: 0, blocked: 0 });

  const pct = (value) => (stats.total > 0 ? Math.round((value / stats.total) * 100) : 0);
  const searchQuery = getUserSearchQuery(search);
  const filteredUsers = users.filter(user => {
    if (!userMatchesSearchQuery(user, searchQuery)) return false;
    if (roleFilter && userRoleGroup(user.role) !== roleFilter) return false;
    if (statusFilter && userStatusKey(user) !== statusFilter) return false;
    if (dateFilter && dateKey(userCreatedAt(user)) !== dateFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * USERS_PAGE_SIZE, currentPage * USERS_PAGE_SIZE);
  const currentUserId = currentUser?.id_user ?? currentUser?.id ?? null;
  const rangeStart = filteredUsers.length === 0 ? 0 : ((currentPage - 1) * USERS_PAGE_SIZE) + 1;
  const rangeEnd = Math.min(currentPage * USERS_PAGE_SIZE, filteredUsers.length);
  const roleDistribution = [
    { name: t('admin.users.students'), value: stats.students, color: '#38bdf8' },
    { name: t('admin.users.teachers'), value: stats.teachers, color: '#d6a76b' },
    { name: t('admin.users.admins'), value: stats.admins, color: '#a78bfa' },
  ].filter(item => item.value > 0);
  const recentUsers = [...users]
    .sort((a, b) => new Date(userCreatedAt(b) || 0) - new Date(userCreatedAt(a) || 0))
    .slice(0, 5);
  const activeFilterCount = [search, roleFilter, statusFilter, dateFilter].filter(Boolean).length;
  const activeUsersCount = Math.max(0, stats.total - stats.blocked);
  const latestUser = recentUsers[0] || null;

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setDateFilter('');
  };

  const handleToggle = async (user) => {
    const userId = userIdOf(user);
    if (userId == null) {
      setFlash({ type: 'error', text: t('admin.users.errors.missingUserId') });
      return;
    }
    if (currentUserId != null && String(userId) === String(currentUserId)) {
      setFlash({ type: 'error', text: t('admin.users.errors.selfBlockForbidden') });
      return;
    }

    const nextBlocked = !isUserBlocked(user);
    setBusyId(userId);
    try {
      await onToggleBlock(userId, nextBlocked);
      setFlash({ type: 'success', text: nextBlocked ? t('admin.users.userBlocked') : t('admin.users.userUnblocked') });
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || err.message || t('admin.users.errors.actionFailed') });
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateUser = async (payload) => {
    await onCreateUser(payload);
    setCreateOpen(false);
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setDateFilter('');
    setPage(1);
    setFlash({ type: 'success', text: t('admin.users.userCreated') });
  };

  const handleUpdateUser = async (user, payload) => {
    const userId = userIdOf(user);
    if (userId == null) {
      throw new Error(t('admin.users.errors.missingUserId'));
    }
    await onUpdateUser(userId, payload);
    setEditing(null);
    setFlash({ type: 'success', text: t('admin.users.userUpdated') });
  };

  return (
    <div className="users-page">
      <div className="users-hero">
        <div>
          <div className="users-eyebrow">Admin / {t('sidebar.items.users')}</div>
          <h1>{t('admin.users.title')}</h1>
          <p>{t('admin.users.intro')}</p>
        </div>
        <div className="users-hero-actions">
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            + {t('admin.users.addUser')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => exportUsersCSV(filteredUsers, t)} disabled={filteredUsers.length === 0}>
            {t('admin.common.export')}
          </button>
        </div>
      </div>

      {flash && (
        <div className={`auth-alert auth-alert-${flash.type === 'success' ? 'success' : 'error'} users-alert`}>
          <span>{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label={t('admin.common.close')}>×</button>
        </div>
      )}

      {error && (
        <div className="auth-alert auth-alert-error users-alert">
          <span>{error}</span>
        </div>
      )}

      <div className="users-stats-grid">
        <UserStatCard label={t('admin.users.totalUsers')}      value={stats.total}    meta={t('admin.users.allConfounded')} tone="purple" icon={<img src={totalUsersIcon} alt="" />} />
        <UserStatCard label={t('admin.users.students')}        value={stats.students} meta={`${pct(stats.students)}% ${t('admin.users.ofTotal')}`} tone="blue" icon={<img src={studentsIcon} alt="" />} />
        <UserStatCard label={t('admin.users.teachers')}        value={stats.teachers} meta={`${pct(stats.teachers)}% ${t('admin.users.ofTotal')}`} tone="gold" icon={<img src={teachersIcon} alt="" />} />
        <UserStatCard label={t('admin.users.blockedAccounts')} value={stats.blocked}  meta={`${pct(stats.blocked)}% ${t('admin.users.ofTotal')}`} tone="red" icon={<img src={blockedIcon} alt="" />} />
      </div>

      <div className="users-dashboard-grid">
        <section className="users-main-panel">
          <div className="users-toolbar">
            <div className="users-toolbar-fields">
              <input
                className="form-input users-search"
                placeholder={t('admin.users.searchPlaceholder')}
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              <select className="form-select" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
                <option value="">{t('admin.roles.all')}</option>
                <option value="student">{t('admin.roles.student')}</option>
                <option value="teacher">{t('admin.roles.teacher')}</option>
                <option value="admin">{t('admin.roles.admin')}</option>
              </select>
              <select className="form-select" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                <option value="">{t('admin.statuses.all')}</option>
                <option value="active">{t('admin.statuses.active')}</option>
                <option value="blocked">{t('admin.statuses.blocked')}</option>
                <option value="inactive">{t('admin.statuses.inactive')}</option>
              </select>
              <DateField className="users-date" value={dateFilter} onChange={setDateFilter} ariaLabel={t('admin.users.tableRegisteredOn')} />
            </div>
            {(search || roleFilter || statusFilter || dateFilter) && (
              <button type="button" className="btn-secondary users-reset" onClick={resetFilters}>{t('admin.common.reset')}</button>
            )}
          </div>

          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>{t('admin.users.tableId')}</th>
                    <th>{t('admin.users.tableRegistration')}</th>
                    <th>{t('admin.users.tableUser')}</th>
                    <th>{t('admin.users.tableEmail')}</th>
                    <th>{t('admin.users.tableRole')}</th>
                    <th>{t('admin.users.tableStatus')}</th>
                    <th>{t('admin.users.tableRegisteredOn')}</th>
                    <th>{t('admin.users.tableLastLogin')}</th>
                    <th>{t('admin.users.tableLastLogout')}</th>
                    <th>{t('admin.common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map(user => {
                    const id = userIdOf(user);
                    const blocked = isUserBlocked(user);
                    const isSelf = currentUserId != null && String(id) === String(currentUserId);
                    const roleGroup = userRoleGroup(user.role);
                    return (
                      <tr key={userRowKey(user)}>
                        <td className="users-mono">{userIdDisplay(user)}</td>
                        <td className="users-mono">{userMatriculeDisplay(user)}</td>
                        <td>
                          <div className="users-user-cell">
                            <div className={`users-avatar users-avatar-${roleGroup}`}>{userInitials(user)}</div>
                            <div>
                              <strong>{userFullName(user)}</strong>
                              <span className="users-user-meta">{translatedUserRoleLabel(user.role, t)}</span>
                            </div>
                          </div>
                        </td>
                        <td>{user.email || '—'}</td>
                        <td>
                          <span className={`users-badge users-role-${roleGroup}`}>{translatedUserRoleLabel(user.role, t)}</span>
                        </td>
                        <td>
                          <span className={`users-badge ${blocked ? 'users-status-blocked' : 'users-status-active'}`}>
                            {userStatusLabel(user, t)}
                          </span>
                        </td>
                        <td className="users-mono">{formatAdminDate(userCreatedAt(user))}</td>
                        <td className="users-mono">{userLastLoginAt(user) ? formatAdminDate(userLastLoginAt(user)) : '—'}</td>
                        <td className="users-mono">{userLastLogoutAt(user) ? formatAdminDate(userLastLogoutAt(user)) : '—'}</td>
                        <td>
                          <div className="users-actions">
                            <button type="button" className="action-btn action-btn-info" onClick={() => setSelected(user)} disabled={busyId === id}>
                              {t('admin.common.details')}
                            </button>
                            <button type="button" className="action-btn action-btn-warning" onClick={() => setEditing(user)} disabled={busyId === id}>
                              {t('admin.common.edit')}
                            </button>
                            <button
                              type="button"
                              className={`action-btn ${blocked ? 'action-btn-success' : 'action-btn-danger'}`}
                              onClick={() => handleToggle(user)}
                              disabled={busyId === id || isSelf}
                              title={isSelf ? t('admin.users.selfActionDisabled') : undefined}
                            >
                              {busyId === id ? t('admin.users.processing') : blocked ? t('admin.users.unblock') : t('admin.users.block')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginatedUsers.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">👥</div>
                  <div className="empty-state-text">{t('admin.users.noUsersFound')}</div>
                </div>
              )}
            </div>
          )}

          <div className="users-pagination">
            <span>{t('admin.users.paginationSummary', { start: rangeStart, end: rangeEnd, total: filteredUsers.length })}</span>
            <div>
              <button type="button" className="btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
                {t('admin.common.previous')}
              </button>
              <span className="users-page-pill">{currentPage}</span>
              <button type="button" className="btn-secondary" disabled={currentPage >= totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}>
                {t('admin.common.next')}
              </button>
            </div>
          </div>
        </section>

        <aside className="users-side">
          <section className="users-side-card">
            <div className="users-side-header">
              <h2>{t('admin.users.rolesDistribution')}</h2>
            </div>
            <div className="users-donut-wrap">
              {roleDistribution.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={roleDistribution} innerRadius={50} outerRadius={72} dataKey="value" paddingAngle={2}>
                        {roleDistribution.map(item => <Cell key={item.name} fill={item.color} />)}
                      </Pie>
                      <Tooltip contentStyle={chartTheme.tooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="users-donut-center">
                    <strong>{stats.total}</strong>
                    <span>Total</span>
                  </div>
                </>
              ) : (
                <div className="users-empty-mini">{t('admin.users.noDataToDisplay')}</div>
              )}
            </div>
            <div className="users-distribution-list">
              {roleDistribution.map(item => (
                <div key={item.name}>
                  <span><i style={{ background: item.color }} />{item.name}</span>
                  <strong>{item.value} ({pct(item.value)}%)</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="users-side-card">
            <div className="users-side-header">
              <h2>{t('admin.users.recentActivity')}</h2>
            </div>
            {recentUsers.length > 0 ? (
              <div className="users-activity-list">
                {recentUsers.map(user => (
                  <div className="users-activity-item" key={`recent-${userRowKey(user)}`}>
                    <div>
                      <strong>{t('admin.users.accountCreated')}</strong>
                      <span>{userFullName(user)} · {translatedUserRoleLabel(user.role, t)}</span>
                    </div>
                    <em>{formatAdminDate(userCreatedAt(user))}</em>
                  </div>
                ))}
              </div>
            ) : (
              <div className="users-empty-mini">{t('admin.users.noActivityAvailable')}</div>
            )}
          </section>

          <section className="users-side-card users-info-card">
            <h2>{t('admin.users.information')}</h2>
            <div className="users-info-list">
              <div>
                <span>{t('admin.users.activeAccounts')}</span>
                <strong>{activeUsersCount}</strong>
              </div>
              <div>
                <span>{t('admin.users.latestRegistration')}</span>
                <strong>{latestUser ? formatAdminDate(userCreatedAt(latestUser)) : '—'}</strong>
              </div>
              <div>
                <span>{t('admin.users.activeFilters')}</span>
                <strong>{activeFilterCount}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {selected && <UserDetailsModal user={selected} onClose={() => setSelected(null)} />}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSubmit={handleUpdateUser} />}
      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onSubmit={handleCreateUser} />}
    </div>
  );
}

// ── Modal: ressources liées à une catégorie ─────────────────
function ResourcesModal({ categoryId, onClose }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await categoriesAPI.getResources(categoryId);
        if (!cancelled) setData(res.data.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || t('admin.categories.errors.loadResources'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [categoryId, t]);

  const cat = data?.categorie;
  const ressources = data?.ressources || [];
  const totalResources = Number.isFinite(Number(data?.total)) ? Number(data.total) : ressources.length;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,8,24,0.8)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 200, padding: 20,
    }}>
      <div style={{
        background: 'var(--navy-deep)', border: '1px solid var(--glass-border-gold)',
        borderRadius: 'var(--radius-xl)', padding: '32px', width: '100%', maxWidth: 720,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        animation: 'bounceIn 0.4s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--white)', margin: 0, marginBottom: 6 }}>
              📚 {t('admin.categories.linkedResourcesTitle')}
            </h3>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {cat ? <><strong style={{ color: 'var(--gold)' }}>{cat.libelle}</strong> · {t('admin.categories.resourceCount', { count: totalResources })}</> : '…'}
            </div>
          </div>
          <button onClick={onClose}
            style={{ color: 'var(--text-muted)', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, marginBottom: 20 }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : error ? (
            <div className="auth-alert auth-alert-error">⚠️ {error}</div>
          ) : ressources.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-text">{t('admin.categories.noLinkedResources')}</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin.categories.resourceTitle')}</th>
                    <th>{t('admin.categories.resourceAuthor')}</th>
                    <th>{t('admin.categories.resourceType')}</th>
                    <th>{t('admin.categories.resourceDetail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ressources.map((r) => {
                    const isPhys = r.type_ressource === 'PHYSIQUE';
                    const details = isPhys
                      ? [
                        t('admin.categories.availableStock', {
                          available: r.stock_disponible ?? 0,
                          total: r.stock_total ?? 0,
                        }),
                        r.isbn ? `ISBN ${r.isbn}` : '',
                      ].filter(Boolean).join(' · ')
                      : [
                        r.format || '',
                        r.nb_consultations != null ? t('admin.categories.viewsCount', { count: r.nb_consultations }) : '',
                      ].filter(Boolean).join(' · ');
                    return (
                      <tr key={r.id_ressource}>
                        <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.titre}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {r.auteur || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}
                        </td>
                        <td>
                          <span className={`badge ${isPhys ? 'badge-gold' : 'badge-info'}`}>
                            {isPhys ? `📕 ${t('admin.categories.physicalBook')}` : `📄 ${t('admin.categories.digitalDocument')}`}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {details}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="action-btn" onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', borderColor: 'var(--glass-border)', padding: '8px 18px' }}>
            {t('admin.common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: confirmation de suppression ──────────────────────
function ConfirmDialog({ title, message, confirmLabel = 'Supprimer', cancelLabel = 'Annuler', onConfirm, onCancel, loading }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,8,24,0.8)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: 'var(--navy-deep)', border: '1px solid var(--glass-border-gold)',
        borderRadius: 'var(--radius-xl)', padding: '32px', width: '100%', maxWidth: 440,
        animation: 'bounceIn 0.4s ease',
      }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--white)', marginBottom: 12 }}>
          {title}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: 24 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="action-btn" onClick={onCancel} disabled={loading}
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', borderColor: 'var(--glass-border)' }}>
            {cancelLabel}
          </button>
          <button type="button" className="action-btn action-btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: formulaire catégorie (création / édition) ────────
function CategoryFormModal({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const isEdit = !!initial;
  const [libelle, setLibelle] = useState(initial?.libelle || '');
  const [tags, setTags] = useState(initial?.tags || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!libelle.trim()) {
      setError(t('admin.categories.errors.nameRequired'));
      return;
    }
    setLoading(true);
    try {
      const payload = { libelle: libelle.trim(), tags: tags.trim() || null };
      if (isEdit) {
        await categoriesAPI.update(initial.id_categorie, payload);
        onSaved(t('admin.categories.messages.updated'));
      } else {
        await categoriesAPI.create(payload);
        onSaved(t('admin.categories.messages.created'));
      }
    } catch (err) {
      setError(err.response?.data?.message || t('admin.categories.errors.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,8,24,0.8)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: 'var(--navy-deep)', border: '1px solid var(--glass-border-gold)',
        borderRadius: 'var(--radius-xl)', padding: '36px', width: '100%', maxWidth: 480,
        animation: 'bounceIn 0.4s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--white)', margin: 0 }}>
            {isEdit ? `✏️ ${t('admin.categories.editCategory')}` : `➕ ${t('admin.categories.addCategory')}`}
          </h3>
          <button onClick={onClose}
            style={{ color: 'var(--text-muted)', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
        {error && <div className="auth-alert auth-alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('admin.categories.nameLabel')} *</label>
            <input
              className="form-input"
              placeholder={t('admin.categories.namePlaceholder')}
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('admin.categories.tagsLabel')}</label>
            <textarea
              className="form-input"
              placeholder={t('admin.categories.tagsPlaceholder')}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              {t('admin.common.cancel')}
            </button>
            <button type="submit" className="auth-submit-btn" disabled={loading}
              style={{ flex: 1, padding: '12px', marginTop: 0 }}>
              {loading ? t('admin.categories.saving') : (isEdit ? `💾 ${t('admin.common.save')}` : `✅ ${t('admin.categories.createCategory')}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Vue Catégories ──────────────────────────────────────────
const CATEGORY_PAGE_SIZE = 8;

const normalizeCategorySearch = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const categoryResourceCount = (category) => {
  const raw = category?.nb_ressources ?? category?.ressources_count ?? category?.total_ressources;
  if (raw === null || raw === undefined || raw === '') return null;
  const count = Number(raw);
  return Number.isFinite(count) ? count : null;
};

const categoryTags = (category) => String(category?.tags || category?.description || '')
  .split(/[,;|]/)
  .map(tag => tag.trim())
  .filter(Boolean);

const formatCategoryNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('fr-FR') : '—';
};

const categoryCreatedAtTime = (category) => {
  const time = Date.parse(category?.date_creation || '');
  return Number.isFinite(time) ? time : 0;
};

const buildCategoryPagination = (current, total) => {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push('gap-start');
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    pages.push(pageNumber);
  }
  if (end < total - 1) pages.push('gap-end');
  pages.push(total);

  return pages;
};

function CategoryStatCard({ tone, icon, label, value, meta }) {
  return (
    <div className={`cat-stat-card cat-tone-${tone}`}>
      <div className="cat-stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong title={String(value)}>{value}</strong>
        <em>{meta}</em>
      </div>
    </div>
  );
}

function CategoryTagChips({ category, limit = 5 }) {
  const tags = categoryTags(category);
  if (tags.length === 0) return <span className="cat-muted">—</span>;
  const visible = tags.slice(0, limit);
  const extra = tags.length - visible.length;
  return (
    <div className="cat-tags">
      {visible.map((tag, index) => <span key={`${category.id_categorie}-${tag}-${index}`}>{tag}</span>)}
      {extra > 0 && <span className="cat-tag-more" title={tags.slice(limit).join(', ')}>+{extra}</span>}
    </div>
  );
}

function CategoriesView() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [flash, setFlash] = useState(null);
  const [viewResourcesId, setViewResourcesId] = useState(null);

  useEffect(() => { loadCategories(); }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await categoriesAPI.getAll();
      setCategories(res.data.data || []);
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.categories.errors.loadFailed') });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit = (cat) => { setEditing(cat); setShowModal(true); };

  const handleSaved = (message) => {
    setShowModal(false);
    setEditing(null);
    setFlash({ type: 'success', text: message });
    loadCategories();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await categoriesAPI.delete(confirmDelete.id_categorie);
      setFlash({ type: 'success', text: t('admin.categories.messages.deleted') });
      setConfirmDelete(null);
      loadCategories();
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.categories.errors.deleteFailed') });
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const categoryCountsAvailable = categories.some(c => categoryResourceCount(c) !== null);
  const totalLinkedResources = categoryCountsAvailable
    ? categories.reduce((sum, c) => sum + (categoryResourceCount(c) || 0), 0)
    : null;
  const categoriesWithResources = categoryCountsAvailable
    ? categories.filter(c => (categoryResourceCount(c) || 0) > 0).length
    : null;
  const categoriesWithTags = categories.filter(c => categoryTags(c).length > 0).length;
  const averageResources = categoryCountsAvailable && categories.length > 0
    ? totalLinkedResources / categories.length
    : null;
  const mostUsedCategory = categoryCountsAvailable
    ? [...categories].sort((a, b) => (categoryResourceCount(b) || 0) - (categoryResourceCount(a) || 0))[0]
    : null;
  const mostUsedCount = categoryResourceCount(mostUsedCategory);
  const searchTerms = normalizeCategorySearch(search).split(' ').filter(Boolean);
  const filtered = categories.filter(c => {
    const haystack = normalizeCategorySearch([
      c.libelle,
      c.tags,
      c.description,
    ].filter(Boolean).join(' '));
    return searchTerms.length === 0 || searchTerms.every(term => haystack.includes(term));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / CATEGORY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedCategories = filtered.slice((currentPage - 1) * CATEGORY_PAGE_SIZE, currentPage * CATEGORY_PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : ((currentPage - 1) * CATEGORY_PAGE_SIZE) + 1;
  const rangeEnd = Math.min(currentPage * CATEGORY_PAGE_SIZE, filtered.length);
  const paginationItems = buildCategoryPagination(currentPage, totalPages);
  const distributionColors = ['#38bdf8', '#d6a76b', '#10d48e', '#f87171', '#a78bfa', '#64748b'];
  const rankedDistribution = categoryCountsAvailable
    ? categories
      .map(cat => ({ id: cat.id_categorie, label: cat.libelle, count: categoryResourceCount(cat) || 0 }))
      .filter(cat => cat.count > 0)
      .sort((a, b) => b.count - a.count)
    : [];
  const primaryDistribution = rankedDistribution.slice(0, 5);
  const remainingDistributionCount = rankedDistribution.slice(5).reduce((sum, cat) => sum + cat.count, 0);
  const distributionSegments = [
    ...primaryDistribution.map((cat, index) => ({ ...cat, color: distributionColors[index] })),
    ...(remainingDistributionCount > 0
      ? [{ id: 'others', label: t('admin.categories.otherCategories'), count: remainingDistributionCount, color: distributionColors[5] }]
      : []),
  ];
  const distributionTotal = distributionSegments.reduce((sum, cat) => sum + cat.count, 0);
  let distributionCursor = 0;
  const distributionSegmentsWithMeta = distributionTotal > 0
    ? distributionSegments.map((cat) => {
      const start = distributionCursor;
      const percentage = (cat.count / distributionTotal) * 100;
      const end = start + percentage;
      distributionCursor = end;
      return {
        ...cat,
        start,
        end,
        percentage,
        roundedPercent: Math.round(percentage),
        labelAngle: ((start + end) / 2) * 3.6 - 90,
        labelReverseAngle: -(((start + end) / 2) * 3.6 - 90),
      };
    })
    : [];
  const distributionGradient = distributionSegmentsWithMeta
    .map(cat => `${cat.color} ${cat.start}% ${cat.end}%`)
    .join(', ');
  const recentCategories = [...categories]
    .filter(cat => categoryCreatedAtTime(cat) > 0)
    .sort((a, b) => categoryCreatedAtTime(b) - categoryCreatedAtTime(a))
    .slice(0, 4);

  return (
    <div className="categories-page">
      <div className="categories-hero">
        <div className="categories-title-wrap">
          <div className="categories-title-icon">🏷️</div>
          <div>
            <h1>{t('admin.categories.title')}</h1>
            <p>{t('admin.categories.intro')}</p>
          </div>
        </div>
      </div>

      {flash && (
        <div className={`auth-alert auth-alert-${flash.type === 'success' ? 'success' : 'error'} categories-alert`}>
          <span>{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label={t('admin.common.close')}>×</button>
        </div>
      )}

      <div className="cat-stats-grid">
        <CategoryStatCard tone="purple" icon="🏷️" label={t('admin.categories.totalCategories')} value={formatCategoryNumber(categories.length)} meta={t('admin.categories.allCategories')} />
        <CategoryStatCard tone="green" icon="✓" label={t('admin.categories.activeCategories')} value={formatCategoryNumber(categories.length)} meta={t('admin.categories.allCategories')} />
        <CategoryStatCard
          tone="blue"
          icon="▣"
          label={t('admin.categories.linkedResources')}
          value={totalLinkedResources === null ? t('student.unavailable') : formatCategoryNumber(totalLinkedResources)}
          meta={categoryCountsAvailable ? `${formatCategoryNumber(categoriesWithResources)} ${t('admin.categories.categoriesWithResources')}` : t('student.unavailable')}
        />
        <CategoryStatCard
          tone="gold"
          icon="♛"
          label={t('admin.categories.mostUsed')}
          value={mostUsedCount && mostUsedCount > 0 ? mostUsedCategory.libelle : t('student.unavailable')}
          meta={mostUsedCount && mostUsedCount > 0 ? t('admin.categories.resourceCount', { count: mostUsedCount }) : ''}
        />
      </div>

      <div className="categories-layout">
        <section className="categories-main-card">
          <div className="categories-toolbar">
            <input
              className="form-input categories-search"
              placeholder={t('admin.categories.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn-primary categories-add-btn" onClick={openCreate}>
              + {t('admin.categories.addCategory')}
            </button>
          </div>

          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : (
            <>
              <div className="categories-table-wrap">
                <table className="categories-table">
                  <thead>
                    <tr>
                      <th>{t('admin.categories.tableName')}</th>
                      <th>{t('admin.categories.tableTags')}</th>
                      <th>{t('admin.categories.tableLinkedResources')}</th>
                      <th>{t('admin.categories.tableCreatedOn')}</th>
                      <th>{t('admin.common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCategories.map((c) => {
                      const nb = categoryResourceCount(c);
                      return (
                        <tr key={c.id_categorie}>
                          <td>
                            <button
                              type="button"
                              className="cat-name-btn"
                              onClick={() => setViewResourcesId(c.id_categorie)}
                              title={t('admin.categories.viewResourcesFor', { category: c.libelle })}
                            >
                              <span className="cat-row-icon">🏷️</span>
                              <strong>{c.libelle}</strong>
                            </button>
                          </td>
                          <td>
                            <CategoryTagChips category={c} />
                          </td>
                          <td>
                            {nb === null ? (
                              <span className="cat-muted">{t('student.unavailable')}</span>
                            ) : (
                              <span className={`cat-resource-badge ${nb > 0 ? 'has-resources' : ''}`}>
                                {t('admin.categories.resourceCount', { count: nb })}
                              </span>
                            )}
                          </td>
                          <td className="cat-date">
                            {formatAdminDate(c.date_creation)}
                          </td>
                          <td>
                            <div className="cat-actions">
                              <button className="action-btn action-btn-info" onClick={() => setViewResourcesId(c.id_categorie)}>
                                {t('admin.categories.viewResources')}
                              </button>
                              <button className="action-btn action-btn-success" onClick={() => openEdit(c)}>
                                {t('admin.categories.edit')}
                              </button>
                              <button className="action-btn action-btn-danger" onClick={() => setConfirmDelete(c)}>
                                {t('admin.categories.delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {paginatedCategories.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-icon">{categories.length === 0 ? '🏷️' : '🔍'}</div>
                    <div className="empty-state-text">
                      {categories.length === 0
                        ? t('admin.categories.emptyNoCategories')
                        : t('admin.categories.emptyNoSearchResults')}
                    </div>
                  </div>
                )}
              </div>

              <div className="categories-pagination">
                <span>{t('admin.categories.paginationSummary', { from: rangeStart, to: rangeEnd, total: filtered.length })}</span>
                <div className="cat-page-controls">
                  <button type="button" className="cat-page-arrow" disabled={currentPage <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
                    {t('admin.common.previous')}
                  </button>
                  {paginationItems.map(item => (
                    typeof item === 'number' ? (
                      <button
                        type="button"
                        key={`cat-page-${item}`}
                        className={`cat-page-number ${item === currentPage ? 'is-active' : ''}`}
                        onClick={() => setPage(item)}
                        aria-current={item === currentPage ? 'page' : undefined}
                      >
                        {item}
                      </button>
                    ) : (
                      <span key={item} className="cat-page-gap">…</span>
                    )
                  ))}
                  <button type="button" className="cat-page-arrow" disabled={currentPage >= totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}>
                    {t('admin.common.next')}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="categories-side">
          <section className="cat-side-card">
            <h2>{t('admin.categories.distribution')}</h2>
            {distributionSegmentsWithMeta.length > 0 && distributionTotal > 0 ? (
              <div className="cat-distribution-chart">
                <div className="cat-donut" style={{ background: `conic-gradient(${distributionGradient})` }}>
                  {distributionSegmentsWithMeta
                    .filter(cat => cat.roundedPercent >= 5)
                    .map(cat => (
                      <span
                        key={`donut-label-${cat.id}`}
                        className="cat-donut-label"
                        style={{
                          '--cat-label-angle': `${cat.labelAngle}deg`,
                          '--cat-label-rotate-back': `${cat.labelReverseAngle}deg`,
                          '--cat-label-color': cat.color,
                        }}
                      >
                        {cat.roundedPercent}%
                      </span>
                    ))}
                  <div className="cat-donut-core">
                    <strong>{formatCategoryNumber(distributionTotal)}</strong>
                    <span>{t('admin.categories.resourcesLabel')}</span>
                  </div>
                </div>
                <div className="cat-distribution-list">
                  {distributionSegmentsWithMeta.map(cat => (
                    <div className="cat-distribution-item" key={`dist-${cat.id}`}>
                      <span className="cat-legend-dot" style={{ backgroundColor: cat.color }} />
                      <span title={cat.label}>{cat.label}</span>
                      <strong>{formatCategoryNumber(cat.count)}</strong>
                      <em>{cat.roundedPercent}%</em>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="cat-empty-mini">{t('admin.categories.noLinkedResourcesToShow')}</div>
            )}
          </section>

          <section className="cat-side-card">
            <h2>{t('admin.categories.recent')}</h2>
            {recentCategories.length > 0 ? (
              <div className="cat-recent-list">
                {recentCategories.map(cat => {
                  const count = categoryResourceCount(cat);
                  return (
                    <div className="cat-recent-item" key={`recent-cat-${cat.id_categorie}`}>
                      <span className="cat-recent-icon">🏷️</span>
                      <div>
                        <strong>{cat.libelle}</strong>
                        <span>{t('admin.categories.createdOnDate', { date: formatAdminDate(cat.date_creation) })}</span>
                        {count !== null && (
                          <em>{t('admin.categories.resourceCount', { count })}</em>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="cat-empty-mini">{t('admin.categories.noRecentActivity')}</div>
            )}
          </section>

          <section className="cat-side-card">
            <h2>{t('admin.categories.summary')}</h2>
            <div className="cat-summary-list">
              <div>
                <span>{t('admin.categories.shownResults')}</span>
                <strong>{filtered.length}</strong>
              </div>
              <div>
                <span>{t('admin.categories.withResources')}</span>
                <strong>{categoriesWithResources === null ? t('student.unavailable') : formatCategoryNumber(categoriesWithResources)}</strong>
              </div>
              <div>
                <span>{t('admin.categories.tagsFilled')}</span>
                <strong>{formatCategoryNumber(categoriesWithTags)}</strong>
              </div>
              <div>
                <span>{t('admin.categories.resourcesPerCategory')}</span>
                <strong>{averageResources === null ? t('student.unavailable') : averageResources.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {showModal && (
        <CategoryFormModal
          initial={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}

      {viewResourcesId && (
        <ResourcesModal
          categoryId={viewResourcesId}
          onClose={() => setViewResourcesId(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('admin.categories.deleteConfirmTitle')}
          message={t('admin.categories.deleteConfirmMessage', { category: confirmDelete.libelle })}
          confirmLabel={`🗑️ ${t('admin.categories.delete')}`}
          cancelLabel={t('admin.common.cancel')}
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ── Modal: formulaire livre (création / édition) ────────────
function LivreFormModal({ initial, categories, onClose, onSaved }) {
  const { t } = useTranslation();
  const isEdit = !!initial;
  const [form, setForm] = useState({
    titre: initial?.titre || '',
    auteur: initial?.auteur || '',
    id_categorie: initial?.id_categorie || '',
    isbn: initial?.isbn || '',
    description: initial?.description || '',
    date_publication: initial?.date_publication
      ? String(initial.date_publication).slice(0, 10) : '',
    stock_total: initial?.stock_total ?? 1,
    stock_disponible: initial?.stock_disponible ?? (isEdit ? 0 : 1),
    emplacement_rayon: initial?.emplacement_rayon || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.titre.trim()) { setError(t('admin.books.errors.titleRequired')); return; }
    if (!form.auteur.trim()) { setError(t('admin.books.errors.authorRequired')); return; }

    const total = parseInt(form.stock_total);
    const dispo = parseInt(form.stock_disponible);
    if (Number.isNaN(total) || total < 1) {
      setError(t('admin.books.errors.totalStockInvalid'));
      return;
    }
    if (Number.isNaN(dispo) || dispo < 0) {
      setError(t('admin.books.errors.availableStockInvalid'));
      return;
    }
    if (dispo > total) {
      setError(t('admin.books.errors.availableStockTooHigh'));
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('titre', form.titre.trim());
      fd.append('auteur', form.auteur.trim());
      if (form.id_categorie) fd.append('id_categorie', form.id_categorie);
      if (form.isbn.trim()) fd.append('isbn', form.isbn.trim());
      if (form.description.trim()) fd.append('description', form.description.trim());
      if (form.date_publication) fd.append('date_publication', form.date_publication);
      fd.append('stock_total', String(total));
      if (isEdit) fd.append('stock_disponible', String(dispo));
      if (form.emplacement_rayon.trim()) fd.append('emplacement_rayon', form.emplacement_rayon.trim());

      if (isEdit) {
        await livresAPI.update(initial.id_ressource, fd);
        onSaved(t('admin.books.bookUpdatedSuccess'));
      } else {
        await livresAPI.create(fd);
        onSaved(t('admin.books.bookAddedSuccess'));
      }
    } catch (err) {
      setError(err.response?.data?.message || t('admin.books.errors.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,8,24,0.8)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 200, padding: 20,
    }}>
      <div style={{
        background: 'var(--navy-deep)', border: '1px solid var(--glass-border-gold)',
        borderRadius: 'var(--radius-xl)', padding: '32px', width: '100%', maxWidth: 640,
        maxHeight: '90vh', overflowY: 'auto',
        animation: 'bounceIn 0.4s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--white)', margin: 0 }}>
            {isEdit ? `✏️ ${t('admin.books.editModal')}` : `➕ ${t('admin.books.addModal')}`}
          </h3>
          <button onClick={onClose} aria-label={t('admin.common.close')}
            style={{ color: 'var(--text-muted)', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {error && <div className="auth-alert auth-alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('admin.books.tableTitle')} *</label>
              <input name="titre" className="form-input" value={form.titre} onChange={handleChange}
                placeholder={t('admin.books.titlePlaceholder')} maxLength={255} autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">{t('admin.books.tableAuthor')} *</label>
              <input name="auteur" className="form-input" value={form.auteur} onChange={handleChange}
                placeholder={t('admin.books.authorPlaceholder')} maxLength={150} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('admin.books.tableCategory')}</label>
              <select name="id_categorie" className="form-input" value={form.id_categorie} onChange={handleChange}>
                <option value="">{t('admin.books.noCategory')}</option>
                {categories.map((c) => (
                  <option key={c.id_categorie} value={c.id_categorie}>{c.libelle}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">ISBN</label>
              <input name="isbn" className="form-input" value={form.isbn} onChange={handleChange}
                placeholder="978-..." maxLength={20} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('admin.books.publicationDate')}</label>
              <input name="date_publication" type="date" className="form-input"
                value={form.date_publication} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('admin.books.totalStock')} *</label>
              <input name="stock_total" type="number" min="1" className="form-input"
                value={form.stock_total} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label className="form-label">
                {t('admin.books.availableStock')} {isEdit ? '*' : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('admin.books.availableStockCreationHint')}</span>}
              </label>
              <input name="stock_disponible" type="number" min="0" className="form-input"
                value={form.stock_disponible} onChange={handleChange} disabled={!isEdit} />
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('admin.books.shelfLocation')}</label>
              <input name="emplacement_rayon" className="form-input" value={form.emplacement_rayon}
                onChange={handleChange} placeholder={t('admin.books.shelfPlaceholder')} maxLength={100} />
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('admin.books.description')}</label>
              <textarea name="description" className="form-input" rows={3}
                value={form.description} onChange={handleChange}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                placeholder={t('admin.books.descriptionPlaceholder')} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              {t('admin.books.cancel')}
            </button>
            <button type="submit" className="auth-submit-btn" disabled={loading}
              style={{ flex: 1, padding: '12px', marginTop: 0 }}>
              {loading ? t('admin.books.saving') : (isEdit ? `💾 ${t('admin.books.save')}` : `✅ ${t('admin.books.addBook')}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Vue Livres ──────────────────────────────────────────────
const LIVRES_PAGE_SIZE = 10;
const LIVRES_FETCH_PAGE_SIZE = 500;

const toLivreNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatLivreDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const getLivreStockInfo = (livre) => {
  const total = toLivreNumber(livre?.stock_total);
  const available = toLivreNumber(livre?.stock_disponible);
  let tone = 'empty';
  let labelKey = 'unavailable';

  if (available > 0 && total > 0) {
    tone = available >= total ? 'available' : 'low';
    labelKey = available >= total ? 'available' : 'low';
  }

  return {
    total,
    available,
    tone,
    labelKey,
    display: `${available} / ${total}`
  };
};

const getLivreSearchText = (livre) => normalizeSearch([
  livre?.titre,
  livre?.auteur,
  livre?.isbn,
  livre?.categorie,
  livre?.emplacement_rayon,
  livre?.id_ressource
].filter(Boolean).join(' '));

function LivresView() {
  const { t } = useTranslation();
  const [livres, setLivres] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => { loadLivres(); loadCategories(); }, []);

  useEffect(() => {
    if (!flash) return;
    const timeoutId = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(timeoutId);
  }, [flash]);

  useEffect(() => {
    setPage(1);
  }, [search, filterCat, stockFilter]);

  const loadLivres = async () => {
    setLoading(true);
    try {
      const allLivres = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        const res = await livresAPI.getAll({ page: currentPage, limit: LIVRES_FETCH_PAGE_SIZE });
        const rows = res.data.data || [];
        allLivres.push(...rows);
        totalPages = Number(res.data.pagination?.totalPages) || 1;
        currentPage += 1;
      } while (currentPage <= totalPages);

      setLivres(allLivres);
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.books.errors.loadFailed') });
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await categoriesAPI.getAll();
      setCategories(res.data.data || []);
    } catch {
      // non bloquant : la liste de catégories est juste un filtre/select
    }
  };

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit = async (livre) => {
    try {
      const res = await livresAPI.getById(livre.id_ressource);
      setEditing(res.data.data || livre);
    } catch {
      setEditing(livre);
    }
    setShowModal(true);
  };

  const handleSaved = (message) => {
    setShowModal(false);
    setEditing(null);
    setFlash({ type: 'success', text: message });
    setPage(1);
    loadLivres();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await livresAPI.delete(confirmDelete.id_ressource);
      setFlash({ type: 'success', text: t('admin.books.bookDeletedSuccess') });
      setConfirmDelete(null);
      setPage(1);
      loadLivres();
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.books.errors.deleteFailed') });
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const selectedCategory = categories.find(c => String(c.id_categorie) === String(filterCat));
  const searchTerms = normalizeSearch(search).split(' ').filter(Boolean);
  const filtered = livres.filter((l) => {
    const matchSearch = searchTerms.length === 0
      || searchTerms.every(term => getLivreSearchText(l).includes(term));
    const matchCat = !filterCat || String(l.id_categorie) === String(filterCat)
      || (l.categorie && normalizeSearch(selectedCategory?.libelle) === normalizeSearch(l.categorie));
    const matchStock = !stockFilter || getLivreStockInfo(l).tone === stockFilter;
    return matchSearch && matchCat && matchStock;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / LIVRES_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * LIVRES_PAGE_SIZE;
  const paginatedLivres = filtered.slice(startIndex, startIndex + LIVRES_PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = startIndex + paginatedLivres.length;
  const hasActiveFilters = Boolean(search.trim() || filterCat || stockFilter);

  const resetFilters = () => {
    setSearch('');
    setFilterCat('');
    setStockFilter('');
    setPage(1);
  };

  return (
    <>
      <div className="livres-page">
        <div className="livres-hero">
          <div>
            <div className="livres-eyebrow">Admin / {t('sidebar.sections.management')}</div>
            <h1><span className="livres-title-icon">BK</span>{t('admin.books.title')}</h1>
            <p>{t('admin.books.totalBooks', { count: livres.length })}</p>
          </div>
          <button type="button" className="btn-primary livres-add-btn" onClick={openCreate}>
            + {t('admin.books.addBook')}
          </button>
        </div>
        <div className="page-header-title">{t('admin.books.title')} 📚</div>
        <div className="page-header-sub">{t('admin.books.totalBooks', { count: livres.length })}</div>

        {flash && (
        <div className={`auth-alert auth-alert-${flash.type === 'success' ? 'success' : 'error'}`}
          style={{ marginBottom: 16 }}>
          {flash.type === 'success' ? '✅' : '⚠️'} {flash.text}
        </div>
      )}

      <div className="panel" style={{ marginBottom: 0 }}>
        <div style={{
          padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'center',
          borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap',
        }}>
          <input
            className="form-input"
            placeholder={t('admin.books.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '2 1 240px', minWidth: 220, marginBottom: 0 }}
          />
          <select
            className="form-input"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            style={{ flex: '1 1 180px', minWidth: 160, marginBottom: 0 }}
          >
            <option value="">{t('admin.books.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id_categorie} value={c.id_categorie}>{c.libelle}</option>
            ))}
          </select>
          <select
            className="form-input"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            style={{ flex: '1 1 160px', minWidth: 150, marginBottom: 0 }}
          >
            <option value="">{t('admin.books.allStocks')}</option>
            <option value="available">{t('admin.books.inStock')}</option>
            <option value="low">{t('admin.books.lowStock')}</option>
            <option value="empty">{t('admin.books.outOfStock')}</option>
          </select>
          <button className="action-btn action-btn-success" onClick={openCreate}
            style={{ padding: '10px 18px', fontSize: '0.85rem' }}>
            ➕ {t('admin.books.addBook')}
          </button>
          {hasActiveFilters && (
            <button type="button" className="btn-secondary livres-reset-btn" onClick={resetFilters}>
              {t('admin.books.reset')}
            </button>
          )}
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">{livres.length === 0 ? '📚' : '🔍'}</div>
              <div className="empty-state-text">
                {livres.length === 0
                  ? t('admin.books.emptyNoBooks')
                  : t('admin.books.emptyNoSearchResults')}
              </div>
            </div>
          ) : (
            <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin.books.tableTitle')}</th>
                    <th>{t('admin.books.tableAuthor')}</th>
                    <th>{t('admin.books.tableCategory')}</th>
                    <th>{t('admin.books.tableIsbn')}</th>
                    <th>{t('admin.books.tableStock')}</th>
                    <th>{t('admin.books.tableShelf')}</th>
                    <th>{t('admin.books.tablePublication')}</th>
                    <th style={{ textAlign: 'right' }}>{t('admin.books.tableActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLivres.map((l) => {
                    const stock = getLivreStockInfo(l);
                    const stockClass = stock.tone === 'empty' ? 'badge-danger'
                      : stock.tone === 'low' ? 'badge-warning' : 'badge-success';
                    return (
                      <tr key={l.id_ressource}>
                        <td style={{ color: 'var(--text-primary)', fontWeight: 600, maxWidth: 240 }}>
                          {l.titre}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {l.auteur || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>-</span>}
                        </td>
                        <td>
                          {l.categorie ? (
                            <span className="badge badge-gold">{l.categorie}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>-</span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {l.isbn || '-'}
                        </td>
                        <td>
                          <span className={`badge ${stockClass}`} title={t(`admin.books.stockLabels.${stock.labelKey}`)}>{stock.display}</span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {l.emplacement_rayon || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                          {formatLivreDate(l.date_publication)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 8 }}>
                            <button className="action-btn action-btn-success"
                              onClick={() => openEdit(l)}>
                              {t('admin.books.edit')}
                            </button>
                            <button className="action-btn action-btn-danger"
                              onClick={() => setConfirmDelete(l)}>
                              {t('admin.books.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="livres-pagination">
              <span>{t('admin.books.paginationSummary', { start: rangeStart, end: rangeEnd, total: filtered.length })}</span>
              <div>
                <button type="button" className="btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>{t('admin.books.previous')}</button>
                <span className="livres-page-pill">{currentPage} / {totalPages}</span>
                <button type="button" className="btn-secondary" disabled={currentPage >= totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}>{t('admin.books.next')}</button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      </div>

      {showModal && (
        <LivreFormModal
          initial={editing}
          categories={categories}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('admin.books.confirmDeleteTitle')}
          message={t('admin.books.confirmDeleteMessage', { title: confirmDelete.titre })}
          confirmLabel={t('admin.books.delete')}
          cancelLabel={t('admin.books.cancel')}
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// DOCUMENTS — gestion des ressources numériques
// ─────────────────────────────────────────────
const DOC_PAGE_SIZE = 10;
const DOC_FETCH_PAGE_SIZE = 500;
const DOC_FORMATS = ['PDF', 'MP4', 'DOCX', 'PPTX', 'XLSX', 'ZIP', 'AUTRE'];
const DOC_FORMAT_META = {
  PDF: { icon: 'PDF', tone: 'pdf' },
  MP4: { icon: 'MP4', tone: 'video' },
  DOCX: { icon: 'DOC', tone: 'docx' },
  PPTX: { icon: 'PPT', tone: 'pptx' },
  XLSX: { icon: 'XLS', tone: 'xlsx' },
  ZIP: { icon: 'ZIP', tone: 'zip' },
  AUTRE: { icon: 'FILE', tone: 'other' },
};

const documentFormat = (doc) => String(doc?.format || 'AUTRE').toUpperCase();
const documentFormatMeta = (format) => DOC_FORMAT_META[String(format || '').toUpperCase()] || DOC_FORMAT_META.AUTRE;

const toDocumentNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatDocumentDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const documentUploaderName = (doc) => (
  [doc?.uploade_par_prenom, doc?.uploade_par_nom].filter(Boolean).join(' ').trim() || '—'
);

const formatDocumentSize = (sizeKo, t) => {
  const size = toDocumentNumber(sizeKo);
  if (size === null) return '';
  const mbUnit = typeof t === 'function' ? t('admin.documents.sizeUnits.mb') : 'Mo';
  const kbUnit = typeof t === 'function' ? t('admin.documents.sizeUnits.kb') : 'Ko';
  if (size >= 1024) return `${(size / 1024).toFixed(size >= 10240 ? 0 : 1)} ${mbUnit}`;
  return `${size} ${kbUnit}`;
};

const documentSearchText = (doc) => normalizeSearch([
  doc?.id_ressource,
  doc?.titre,
  doc?.categorie,
  documentUploaderName(doc),
  documentFormat(doc),
].filter(Boolean).join(' '));

const getSafeFileName = (fileName) => {
  if (!fileName) return '';
  return String(fileName).replace(/\\/g, '/').split('/').pop();
};

const getDocumentDownloadFileName = (doc) => {
  const safeStoredName = getSafeFileName(doc?.nom_fichier);
  if (safeStoredName) return safeStoredName;

  const extension = (doc?.format || 'document').toLowerCase();
  const title = (doc?.titre || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${title || 'document'}.${extension}`;
};

const getDocumentFileErrorMessage = (err, fallback, t) => {
  if (err.response?.status === 401) return t('admin.documents.errors.sessionExpired');
  if (err.response?.status === 404) return t('admin.documents.errors.fileNotFound');
  if (err.response?.status === 403) return t('admin.documents.errors.accessDenied');
  return err.response?.data?.message || fallback;
};

function DocumentDetailsModal({ doc, onClose }) {
  const { t } = useTranslation();
  const [fileActionLoading, setFileActionLoading] = useState('');
  const [fileActionError, setFileActionError] = useState('');

  if (!doc) return null;
  const fileMissing = !doc.url_fichier;
  const format = documentFormat(doc);
  const formatMeta = documentFormatMeta(format);

  const handleOpenFile = async () => {
    setFileActionLoading('open');
    setFileActionError('');
    try {
      const response = await documentsAPI.streamFile(doc.id_ressource, { skipAuthRedirect: true });
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      // NOTE: do NOT pass 'noopener,noreferrer' here. In modern browsers
      // `window.open` returns null whenever `noopener` is set — even on
      // success — which would surface a false "popup blocked" warning
      // every time View works. Modern browsers already disconnect the
      // opener for `_blank` automatically, and the blob URL is same-origin
      // and revoked after 60 s, so dropping the flag is safe.
      const opened = window.open(url, '_blank');
      if (!opened) {
        setFileActionError(t('admin.documents.errors.allowPopups'));
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setFileActionError(getDocumentFileErrorMessage(err, t('admin.documents.errors.openFailed'), t));
    } finally {
      setFileActionLoading('');
    }
  };

  const handleDownloadFile = async () => {
    setFileActionLoading('download');
    setFileActionError('');
    try {
      const response = await documentsAPI.downloadFile(doc.id_ressource, { skipAuthRedirect: true });
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = getDocumentDownloadFileName(doc);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setFileActionError(getDocumentFileErrorMessage(err, t('admin.documents.errors.downloadFailed'), t));
    } finally {
      setFileActionLoading('');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <span className={`docs-file-icon docs-file-${formatMeta.tone}`}>{formatMeta.icon}</span>
            {doc.titre}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label={t('admin.documents.close')}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-grid">
            <div><span className="modal-label">{t('admin.documents.tableFormat')} :</span> <span className={`docs-format-badge docs-format-${formatMeta.tone}`}>{format || '—'}</span></div>
            <div><span className="modal-label">{t('admin.documents.tableCategory')} :</span> {doc.categorie || '—'}</div>
            <div><span className="modal-label">{t('admin.documents.author')} :</span> {doc.auteur || '—'}</div>
            <div><span className="modal-label">{t('admin.documents.tableUploadedBy')} :</span> {documentUploaderName(doc)}</div>
            <div><span className="modal-label">{t('admin.documents.views')} :</span> {doc.nb_consultations ?? 0}</div>
            <div><span className="modal-label">{t('admin.documents.fileSize')} :</span> {formatDocumentSize(doc.taille_ko, t) || '—'}</div>
            <div><span className="modal-label">{t('admin.documents.downloadable')} :</span> {doc.est_telechargeable ? t('admin.documents.yes') : t('admin.documents.no')}</div>
            <div><span className="modal-label">{t('admin.documents.file')} :</span> <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{getSafeFileName(doc.nom_fichier) || '—'}</span></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span className="modal-label">{t('admin.documents.description')} :</span>
              <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>{doc.description || t('admin.documents.noDescription')}</div>
            </div>
          </div>
          {fileActionError && (
            <div className="auth-alert auth-alert-error" style={{ marginTop: 16 }}>
              ⚠️ {fileActionError}
            </div>
          )}
          {fileMissing && (
            <div className="auth-alert auth-alert-warning" style={{ marginTop: 16 }}>
              {t('admin.documents.fileUnavailable')}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {!fileMissing && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleOpenFile}
                disabled={fileActionLoading === 'open'}
              >
                {fileActionLoading === 'open' ? t('admin.documents.opening') : t('admin.documents.view')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleDownloadFile}
                disabled={fileActionLoading === 'download'}
              >
                {fileActionLoading === 'download' ? t('admin.documents.downloading') : t('admin.documents.download')}
              </button>
            </>
          )}
          <button className="btn-primary" onClick={onClose}>{t('admin.documents.close')}</button>
        </div>
      </div>
    </div>
  );
}

function CreateDocumentModal({ categories, onClose, onSubmit }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    titre: '',
    id_categorie: '',
    description: '',
    fichier: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value, files } = event.target;
    setForm(prev => ({ ...prev, [name]: name === 'fichier' ? files?.[0] || null : value }));
    setError('');
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.titre.trim()) {
      setError(t('admin.documents.modal.errors.titleRequired'));
      return;
    }
    if (!form.fichier) {
      setError(t('admin.documents.modal.errors.fileRequired'));
      return;
    }

    const payload = new FormData();
    payload.append('titre', form.titre.trim());
    payload.append('fichier', form.fichier);
    if (form.id_categorie) payload.append('id_categorie', form.id_categorie);
    if (form.description.trim()) payload.append('description', form.description.trim());

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('admin.documents.modal.errors.addFailed'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal-card docs-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('admin.documents.modal.title')}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label={t('admin.documents.modal.close')}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-alert auth-alert-error">{error}</div>}
            <div className="docs-form-grid">
              <label className="docs-form-field docs-form-field-wide">
                <span>{t('admin.documents.modal.fields.title')}</span>
                <input className="form-input" name="titre" value={form.titre} onChange={handleChange} disabled={saving} autoFocus />
              </label>
              <div className="docs-form-field docs-form-field-wide">
                <span>{t('admin.documents.modal.fields.file')}</span>
                <input
                  ref={fileInputRef}
                  name="fichier"
                  type="file"
                  accept=".pdf,.mp4,.avi,.mkv,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.zip"
                  onChange={handleChange}
                  disabled={saving}
                  style={{ display: 'none' }}
                />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary" onClick={handleChooseFile} disabled={saving}>
                    {t('admin.documents.modal.chooseFile')}
                  </button>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {form.fichier
                      ? `${t('admin.documents.modal.selectedFile')}: ${form.fichier.name}`
                      : t('admin.documents.modal.noFileChosen')}
                  </span>
                </div>
              </div>
              <label className="docs-form-field docs-form-field-wide">
                <span>{t('admin.documents.modal.fields.category')}</span>
                <select className="form-select" name="id_categorie" value={form.id_categorie} onChange={handleChange} disabled={saving} aria-label={t('admin.documents.modal.selectCategory')}>
                  <option value="">{t('admin.documents.modal.noCategory')}</option>
                  {categories.map(category => (
                    <option key={category.id_categorie} value={category.id_categorie}>{category.libelle}</option>
                  ))}
                </select>
              </label>
              <label className="docs-form-field docs-form-field-wide">
                <span>{t('admin.documents.modal.fields.description')}</span>
                <textarea className="form-input" name="description" rows="4" value={form.description} onChange={handleChange} disabled={saving} />
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('admin.documents.modal.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? t('admin.documents.modal.saving') : t('admin.documents.modal.add')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditDocumentModal({ doc, categories, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    titre: doc?.titre || '',
    description: doc?.description || '',
    id_categorie: doc?.id_categorie ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!doc) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.titre.trim()) { setError(t('admin.documents.errors.titleRequired')); return; }
    setSaving(true);
    try {
      await documentsAPI.update(doc.id_ressource, {
        titre: form.titre.trim(),
        description: form.description || null,
        id_categorie: form.id_categorie || null,
      });
      setSuccess(t('admin.documents.documentUpdatedSuccess'));
      setTimeout(() => { onSaved?.(); onClose(); }, 600);
    } catch (err) {
      setError(err.response?.data?.message || t('admin.documents.errors.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card docs-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('admin.documents.editDocument')}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t('admin.documents.close')}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-alert auth-alert-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
            {success && <div className="auth-alert auth-alert-success" style={{ marginBottom: 12 }}>✅ {success}</div>}
            <div className="docs-form-grid">
              <label className="docs-form-field docs-form-field-wide">
                <span>{t('admin.documents.titleField')}</span>
                <input className="form-input" name="titre" value={form.titre} onChange={handleChange} />
              </label>
              <label className="docs-form-field docs-form-field-wide">
                <span>{t('admin.documents.tableCategory')}</span>
              <select className="form-select" name="id_categorie" value={form.id_categorie} onChange={handleChange}>
                <option value="">{t('admin.documents.noCategory')}</option>
                {categories.map(c => (
                  <option key={c.id_categorie} value={c.id_categorie}>{c.libelle}</option>
                ))}
              </select>
              </label>
              <label className="docs-form-field docs-form-field-wide">
                <span>{t('admin.documents.description')}</span>
              <textarea className="form-input" name="description" rows="3"
                value={form.description} onChange={handleChange} />
              </label>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {t('admin.documents.tableFormat')} : <strong>{doc.format}</strong> · {t('admin.documents.file')} : <span style={{ fontFamily: 'var(--font-mono)' }}>{doc.nom_fichier || '—'}</span>
              <br />{t('admin.documents.formatFileLocked')}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>{t('admin.documents.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('admin.documents.saving') : t('admin.documents.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DocumentsView() {
  const { t } = useTranslation();
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categorieFilter, setCategorieFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [flash, setFlash] = useState(null);

  const fetchAllDocuments = async () => {
    let currentPage = 1;
    let totalPages = 1;
    let rows = [];

    do {
      const response = await documentsAPI.getAll({ page: currentPage, limit: DOC_FETCH_PAGE_SIZE });
      const pageRows = Array.isArray(response.data?.data) ? response.data.data : [];
      rows = rows.concat(pageRows);
      totalPages = Math.max(1, Number(response.data?.pagination?.totalPages) || 1);
      if (!response.data?.pagination?.totalPages && pageRows.length < DOC_FETCH_PAGE_SIZE) break;
      currentPage += 1;
    } while (currentPage <= totalPages);

    return rows;
  };

  const loadDocs = async () => {
    setLoading(true);
    try {
      setDocs(await fetchAllDocuments());
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.documents.errors.loadFailed') });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    categoriesAPI.getAll().then(r => setCategories(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => {});
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPage(1); }, [search, categorieFilter, formatFilter]);

  const selectedCategory = categories.find(c => String(c.id_categorie) === String(categorieFilter));
  const selectedCategoryName = selectedCategory?.libelle || '';
  const normalizedCategoryFilter = normalizeSearch(selectedCategoryName);
  const normalizedSearch = normalizeSearch(search);
  const searchTerms = normalizedSearch.split(' ').filter(Boolean);

  const formatCounts = docs.reduce((acc, doc) => {
    const format = documentFormat(doc);
    acc[format] = (acc[format] || 0) + 1;
    return acc;
  }, {});
  const availableFormats = Object.keys(formatCounts).sort((a, b) => {
    const ai = DOC_FORMATS.indexOf(a);
    const bi = DOC_FORMATS.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const filteredDocs = docs.filter(doc => {
    if (categorieFilter) {
      const docCategoryId = doc.id_categorie ?? doc.id_category ?? null;
      const sameCategoryId = docCategoryId !== null && String(docCategoryId) === String(categorieFilter);
      const sameCategoryLabel = normalizedCategoryFilter && normalizeSearch(doc.categorie) === normalizedCategoryFilter;
      if (!sameCategoryId && !sameCategoryLabel) return false;
    }
    if (formatFilter && documentFormat(doc) !== formatFilter) return false;
    if (searchTerms.length > 0 && !searchTerms.every(term => documentSearchText(doc).includes(term))) return false;
    return true;
  });

  const consultationValues = docs
    .map(doc => toDocumentNumber(doc.nb_consultations))
    .filter(value => value !== null);
  const totalConsultations = consultationValues.length > 0 || docs.length === 0
    ? consultationValues.reduce((sum, value) => sum + value, 0)
    : null;
  const categoryCount = new Set(docs.map(doc => normalizeSearch(doc.categorie)).filter(Boolean)).size;
  const topConsulted = [...docs]
    .filter(doc => toDocumentNumber(doc.nb_consultations) !== null)
    .sort((a, b) => toDocumentNumber(b.nb_consultations) - toDocumentNumber(a.nb_consultations));
  const mostConsulted = topConsulted[0] || null;
  const recentDocs = [...docs]
    .sort((a, b) => new Date(b.date_creation || 0) - new Date(a.date_creation || 0))
    .slice(0, 5);
  const formatDistribution = availableFormats.map(format => {
    const meta = documentFormatMeta(format);
    const count = formatCounts[format];
    return {
      format,
      count,
      tone: meta.tone,
      percent: docs.length > 0 ? Math.round((count / docs.length) * 100) : 0,
    };
  });

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / DOC_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedDocs = filteredDocs.slice((currentPage - 1) * DOC_PAGE_SIZE, currentPage * DOC_PAGE_SIZE);
  const rangeStart = filteredDocs.length === 0 ? 0 : ((currentPage - 1) * DOC_PAGE_SIZE) + 1;
  const rangeEnd = Math.min(currentPage * DOC_PAGE_SIZE, filteredDocs.length);

  const resetFilters = () => {
    setSearch('');
    setCategorieFilter('');
    setFormatFilter('');
  };

  const handleCreateDocument = async (payload) => {
    await documentsAPI.upload(payload);
    setCreateOpen(false);
    setPage(1);
    setFlash({ type: 'success', text: t('admin.documents.modal.messages.addedSuccess') });
    await loadDocs();
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`${t('admin.documents.confirmDeleteTitle')}\n\n${t('admin.documents.confirmDeleteMessage')}`)) return;
    try {
      await documentsAPI.delete(doc.id_ressource);
      setFlash({ type: 'success', text: t('admin.documents.documentDeletedSuccess') });
      await loadDocs();
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.documents.errors.deleteFailed') });
    }
  };

  const openDetails = async (doc) => {
    try {
      const r = await documentsAPI.getById(doc.id_ressource);
      setSelected(r.data.data);
    } catch {
      setSelected(doc);
    }
  };

  const openEdit = async (doc) => {
    try {
      const r = await documentsAPI.getById(doc.id_ressource);
      setEditing(r.data.data);
    } catch {
      setEditing(doc);
    }
  };

  return (
    <div className="docs-page">
      <div className="docs-hero">
        <div>
          <div className="docs-eyebrow">Admin / {t('sidebar.items.documents')}</div>
          <h1><span className="docs-title-icon">DOC</span>{t('admin.documents.title')}</h1>
          <p>{t('admin.documents.intro')}</p>
          <span className="docs-total-pill">{t('admin.documents.totalDocumentsCount', { count: docs.length })}</span>
        </div>
        <button type="button" className="btn-primary docs-add-btn" onClick={() => setCreateOpen(true)}>
          + {t('admin.documents.addDocument')}
        </button>
      </div>

      <div className="docs-stats-grid">
        <div className="docs-stat-card docs-stat-total">
          <span>{t('admin.documents.totalDocuments')}</span>
          <strong>{docs.length}</strong>
          <em>{t('admin.documents.totalDocuments')}</em>
        </div>
        <div className="docs-stat-card docs-stat-category">
          <span>{t('admin.documents.categories')}</span>
          <strong>{categoryCount}</strong>
          <em>{t('admin.documents.categories')}</em>
        </div>
        <div className="docs-stat-card docs-stat-consult">
          <span>{t('admin.documents.views')}</span>
          <strong>{totalConsultations === null ? t('admin.documents.unavailable') : totalConsultations}</strong>
          <em>{t('admin.documents.views')}</em>
        </div>
        <div className="docs-stat-card docs-stat-star">
          <span>{t('admin.documents.mostViewed')}</span>
          <strong className="docs-stat-title">{mostConsulted?.titre || t('admin.documents.unavailable')}</strong>
          <em>{mostConsulted ? t('admin.documents.viewCount', { count: toDocumentNumber(mostConsulted.nb_consultations) ?? 0 }) : ''}</em>
        </div>
      </div>

      {flash && (
        <div className={`auth-alert auth-alert-${flash.type === 'success' ? 'success' : 'error'} docs-alert`}>
          <span>{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label={t('admin.documents.close')}>✕</button>
        </div>
      )}

      <div className="docs-layout">
        <section className="docs-main-panel">
          <div className="docs-toolbar">
            <input
              className="form-input docs-search"
              placeholder={t('admin.documents.searchPlaceholder')}
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            <select className="form-select docs-filter" value={categorieFilter} onChange={event => setCategorieFilter(event.target.value)}>
              <option value="">{t('admin.documents.allCategories')}</option>
              {categories.map(category => (
                <option key={category.id_categorie} value={category.id_categorie}>{category.libelle}</option>
              ))}
            </select>
            <select className="form-select docs-filter docs-format-filter" value={formatFilter} onChange={event => setFormatFilter(event.target.value)}>
              <option value="">{t('admin.documents.allFormats')}</option>
              {availableFormats.map(format => <option key={format} value={format}>{format}</option>)}
            </select>
            {(search || categorieFilter || formatFilter) && (
              <button type="button" className="btn-secondary docs-reset-btn" onClick={resetFilters}>{t('admin.documents.reset')}</button>
            )}
          </div>

          <div className="docs-results-line">
            <span>{t('admin.documents.resultsCount', { count: filteredDocs.length })}</span>
          </div>

          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : (
            <div className="docs-table-wrap">
              <table className="docs-table">
                <colgroup>
                  <col className="docs-col-document" />
                  <col className="docs-col-format" />
                  <col className="docs-col-category" />
                  <col className="docs-col-uploader" />
                  <col className="docs-col-consults" />
                  <col className="docs-col-date" />
                  <col className="docs-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('admin.documents.tableDocumentTitle')}</th>
                    <th>{t('admin.documents.tableFormat')}</th>
                    <th>{t('admin.documents.tableCategory')}</th>
                    <th>{t('admin.documents.tableUploadedBy')}</th>
                    <th>{t('admin.documents.tableViews')}</th>
                    <th>{t('admin.documents.tableCreatedOn')}</th>
                    <th>{t('admin.documents.tableActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDocs.map(doc => {
                    const format = documentFormat(doc);
                    const meta = documentFormatMeta(format);
                    const consultations = toDocumentNumber(doc.nb_consultations);
                    const size = formatDocumentSize(doc.taille_ko, t);
                    return (
                      <tr key={doc.id_ressource}>
                        <td>
                          <div className="docs-document-cell">
                            <span className={`docs-file-icon docs-file-${meta.tone}`}>{meta.icon}</span>
                            <div>
                              <strong>{doc.titre || t('admin.documents.untitled')}</strong>
                              <span>{doc.id_ressource ? `ID ${doc.id_ressource}` : t('admin.documents.idUnavailable')}{size ? ` · ${size}` : ''}</span>
                            </div>
                          </div>
                        </td>
                        <td><span className={`docs-format-badge docs-format-${meta.tone}`}>{format}</span></td>
                        <td className="docs-muted-cell">{doc.categorie || '—'}</td>
                        <td className="docs-muted-cell">{documentUploaderName(doc)}</td>
                        <td className="docs-number-cell">{consultations ?? '—'}</td>
                        <td className="docs-date-cell">{formatDocumentDate(doc.date_creation)}</td>
                        <td>
                          <div className="docs-actions">
                            <button type="button" className="docs-action-btn docs-action-view" onClick={() => openDetails(doc)}>{t('admin.documents.view')}</button>
                            <button type="button" className="docs-action-btn docs-action-edit" onClick={() => openEdit(doc)}>{t('admin.documents.edit')}</button>
                            <button type="button" className="docs-action-btn docs-action-delete" onClick={() => handleDelete(doc)}>{t('admin.documents.delete')}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginatedDocs.length === 0 && (
                <div className="docs-empty-state">
                  <strong>{t('admin.documents.noDocumentsFound')}</strong>
                  <span>{t('admin.documents.noDocumentsHint')}</span>
                </div>
              )}
            </div>
          )}

          <div className="docs-pagination">
            <span>{t('admin.documents.paginationSummary', { start: rangeStart, end: rangeEnd, total: filteredDocs.length })}</span>
            <div>
              <button type="button" className="btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>{t('admin.documents.previous')}</button>
              <span className="docs-page-pill">{currentPage} / {totalPages}</span>
              <button type="button" className="btn-secondary" disabled={currentPage >= totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}>{t('admin.documents.next')}</button>
            </div>
          </div>
        </section>

        <aside className="docs-side">
          <section className="docs-side-card">
            <h2>{t('admin.documents.distribution')}</h2>
            {formatDistribution.length > 0 ? (
              <div className="docs-format-list">
                {formatDistribution.map(item => (
                  <div className="docs-format-row" key={item.format}>
                    <div>
                      <span className={`docs-format-dot docs-dot-${item.tone}`} />
                      <strong>{item.format}</strong>
                    </div>
                    <em>{item.percent}% ({item.count})</em>
                    <span className="docs-format-bar"><i className={`docs-bar-${item.tone}`} style={{ width: `${item.percent}%` }} /></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="docs-side-empty">{t('admin.documents.noFormatData')}</div>
            )}
          </section>

          <section className="docs-side-card">
            <h2>{t('admin.documents.mostConsulted')}</h2>
            {topConsulted.length > 0 ? (
              <div className="docs-side-list">
                {topConsulted.slice(0, 5).map(doc => (
                  <div className="docs-side-item" key={`top-${doc.id_ressource}`}>
                    <span className={`docs-file-icon docs-file-${documentFormatMeta(documentFormat(doc)).tone}`}>{documentFormatMeta(documentFormat(doc)).icon}</span>
                    <div>
                      <strong>{doc.titre || t('admin.documents.untitled')}</strong>
                      <em>{t('admin.documents.viewCount', { count: toDocumentNumber(doc.nb_consultations) ?? 0 })}</em>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="docs-side-empty">{t('admin.documents.noViewedDocument')}</div>
            )}
          </section>

          <section className="docs-side-card">
            <h2>{t('admin.documents.recentActivity')}</h2>
            {recentDocs.length > 0 ? (
              <div className="docs-side-list">
                {recentDocs.map(doc => (
                  <div className="docs-side-item" key={`recent-${doc.id_ressource}`}>
                    <span className={`docs-file-icon docs-file-${documentFormatMeta(documentFormat(doc)).tone}`}>{documentFormatMeta(documentFormat(doc)).icon}</span>
                    <div>
                      <strong>{doc.titre || t('admin.documents.untitled')}</strong>
                      <em>{formatDocumentDate(doc.date_creation)}</em>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="docs-side-empty">{t('admin.documents.noRecentActivity')}</div>
            )}
          </section>
        </aside>
      </div>

      {selected && <DocumentDetailsModal doc={selected} onClose={() => setSelected(null)} />}
      {createOpen && (
        <CreateDocumentModal
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreateDocument}
        />
      )}
      {editing && (
        <EditDocumentModal doc={editing} categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setFlash({ type: 'success', text: t('admin.documents.documentUpdatedSuccess') }); loadDocs(); }} />
      )}
    </div>
  );
}

// CIRCULATION — moved to EmpruntsView.js, ReservationsView.js, circulationShared.js

// Dashboard principal Admin
export default function AdminDashboard() {
  const { t } = useTranslation();
  const [activeItem, setActiveItem] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    loadStats();
    loadUsers();
  }, []);

  // ── Notifications : chargement initial + polling 30s ───────
  useEffect(() => {
    let cancelled = false;

    const refreshUnread = async () => {
      try {
        const res = await notificationsAPI.getUnreadCount();
        if (!cancelled) setUnreadCount(res.data?.data?.count || 0);
      } catch {
        // silencieux (token expiré déjà géré globalement par l'intercepteur)
      }
    };

    refreshUnread();
    const intervalId = setInterval(refreshUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await notificationsAPI.getAll({ limit: 20 });
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.is_read).length);
    } catch {
      setNotifications([]);
    }
  };

  // Mappe un type/URL de notif vers l'onglet sidebar correspondant
  const sidebarItemForNotification = (notif) => {
    const url = (notif?.target_url || '').toLowerCase();
    if (url.includes('/reservations')) return 'reservations';
    if (url.includes('/support')) return 'support';
    if (url.includes('/documents')) return 'documents';
    if (url.includes('/emprunts') || url.includes('/loans')) return 'emprunts';
    switch (notif?.type) {
      case 'BOOK_RESERVATION':   return 'reservations';
      case 'SUPPORT_TICKET':     return 'support';
      case 'DOCUMENT_UPLOAD':    return 'documents';
      case 'OVERDUE_LOAN':
      case 'BOOK_LOAN_REQUEST':  return 'emprunts';
      default: return null;
    }
  };

  const handleMarkNotificationRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
    } catch {
      // si l'API échoue on garde l'état local cohérent côté UI
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead();
    } catch {
      // idem : on continue avec l'état local
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = (notif) => {
    if (!notif) return;
    if (!notif.is_read) {
      handleMarkNotificationRead(notif.id);
    }
    const target = sidebarItemForNotification(notif);
    if (target) setActiveItem(target);
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [dashboardRes, reservationsRes] = await Promise.all([
        statsAPI.getDashboard(),
        statsAPI.getStatsReservations().catch(() => null),
      ]);
      setStats({
        ...(dashboardRes.data?.data || {}),
        reservations: reservationsRes?.data?.data || null,
      });
    } catch {
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    setUsersError('');
    try {
      const res = await authAPI.getUsers({ page: 1, limit: 10000 });
      const rows = res.data?.data;
      setUsers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setUsers([]);
      setUsersError(err.response?.data?.message || t('admin.users.errors.loadFailed'));
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleBlock = async (userId, bloquer) => {
    const currentUserId = currentUser?.id_user ?? currentUser?.id ?? null;
    if (currentUserId != null && String(userId) === String(currentUserId)) {
      throw new Error(t('admin.users.selfActionDisabled'));
    }
    try {
      const res = await authAPI.toggleBloquer(userId, bloquer);
      setUsers(prev =>
        prev.map(u => String(userIdOf(u)) === String(userId)
          ? { ...u, ...(res.data?.data || {}), est_bloque: bloquer }
          : u)
      );
      return res.data?.data;
    } catch (err) {
      throw err;
    }
  };

  const handleCreateUser = async (payload) => {
    const res = await authAPI.createUser(payload);
    await Promise.all([loadUsers(), loadStats()]);
    return res.data?.data;
  };

  const handleUpdateUser = async (userId, payload) => {
    const res = await authAPI.updateUser(userId, payload);
    await Promise.all([loadUsers(), loadStats()]);
    return res.data?.data;
  };

  const retardCount = stats?.emprunts?.en_retard || 0;

  return (
    <div className="admin-layout">
      <Sidebar
        items={SIDEBAR_ITEMS}
        activeItem={activeItem}
        onItemClick={setActiveItem}
        badges={{ retards: retardCount }}
      />
      <div className="admin-main">
        <Navbar
          title={t('admin.navTitle')}
          notifications={notifications}
          unreadCount={unreadCount}
          onOpenNotifications={loadNotifications}
          onMarkAsRead={handleMarkNotificationRead}
          onMarkAllRead={handleMarkAllNotificationsRead}
          onNotificationClick={handleNotificationClick}
        />
        <div className={`admin-content ${activeItem === 'dashboard' ? 'admin-content-dashboard' : ''} ${activeItem === 'categories' ? 'admin-content-categories' : ''} ${activeItem === 'livres' ? 'admin-content-livres' : ''} ${activeItem === 'documents' ? 'admin-content-documents' : ''} ${activeItem === 'reservations' ? 'admin-content-reservations' : ''}`}>
          {activeItem === 'dashboard' && (
            <DashboardView stats={stats} users={users} loadingStats={loadingStats} />
          )}
          {activeItem === 'users' && (
            <UsersView
              users={users}
              loading={loadingUsers}
              error={usersError}
              onToggleBlock={handleToggleBlock}
              onCreateUser={handleCreateUser}
              onUpdateUser={handleUpdateUser}
              currentUser={currentUser}
            />
          )}
          {activeItem === 'stats' && <StatistiquesView />}
          {activeItem === 'categories' && <CategoriesView />}
          {activeItem === 'livres' && <LivresView />}
          {activeItem === 'documents' && <DocumentsView />}
          {activeItem === 'emprunts' && <EmpruntsView />}
          {activeItem === 'reservations' && <ReservationsView />}
          {activeItem === 'support' && <AdminSupportView />}
          {activeItem === 'settings' && <AdminSettingsView />}
        </div>
      </div>
    </div>
  );
}
