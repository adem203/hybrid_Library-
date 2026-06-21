import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Sidebar from '../../components/Sidebar/Sidebar';
import Navbar from '../../components/Navbar/Navbar';
import { authAPI, livresAPI, documentsAPI, empruntsAPI, categoriesAPI, supportAPI, notificationsAPI, resolveAssetUrl } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import './EtudiantDashboard.css';
import '../AdminDashboard/AdminDashboard.css';

const PAGE_SIZE = 10;
const CATALOGUE_FETCH_LIMIT = 5000;
const GED_PAGE_SIZE = 9;
const LOAN_PAGE_SIZE = 5;
const RESV_PAGE_SIZE = 4;
const HIST_PAGE_SIZE = 10;

function formatDateTimeSmart(value, t, language = 'fr') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return t('student.dates.todayAt', { time: `${hh}:${mm}` });
  if (sameDay(d, yesterday)) return t('student.dates.yesterdayAt', { time: `${hh}:${mm}` });
  const date = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  return t('student.dates.dateAt', { date, time: `${hh}:${mm}` });
}

function formatDateLong(value, language = 'fr') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function getLoanReturnInfo(loan, t, language = 'fr') {
  const s = loan.statut;
  if (s === 'RETOURNE') {
    return { text: t('student.loans.returnedOn', { date: formatDateLong(loan.date_retour_effectif, language) }), tone: 'neutral' };
  }
  if (s === 'REFUSE') return { text: t('student.loans.requestRejected'), tone: 'neutral' };
  if (s === 'ANNULE') return { text: t('student.loans.requestCancelled'), tone: 'neutral' };
  const days = daysUntil(loan.date_retour_prevue);
  if (days === null) return { text: '—', tone: 'neutral' };
  if (days < 0) return { text: t('student.loans.overdueBy', { count: Math.abs(days) }), tone: 'late' };
  if (days === 0) return { text: t('student.loans.dueToday'), tone: 'warn' };
  return { text: t('student.loans.inDays', { count: days }), tone: days <= 3 ? 'warn' : 'ok' };
}
const FORMAT_COLORS = {
  PDF: '#ef4444',
  PPTX: '#f59e0b',
  DOCX: '#3b82f6',
  XLSX: '#10b981',
  MP4: '#ec4899',
  ZIP: '#a855f7',
  AUTRE: '#9ca3af',
};
const API_HOST = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1').replace(/\/api\/v1\/?$/, '');

const COVER_PALETTE = [
  { background: 'linear-gradient(135deg, #0d1b4b 0%, #1a2f6e 100%)', accent: '#c9a84c' },
  { background: 'linear-gradient(135deg, #1a2f6e 0%, #243580 100%)', accent: '#e8c96d' },
  { background: 'linear-gradient(135deg, #4a1d2e 0%, #7a2f48 100%)', accent: '#f5e5b0' },
  { background: 'linear-gradient(135deg, #0b3a3e 0%, #14606b 100%)', accent: '#e8c96d' },
  { background: 'linear-gradient(135deg, #3d3a14 0%, #6b5c1f 100%)', accent: '#f5e5b0' },
  { background: 'linear-gradient(135deg, #2a1d4a 0%, #4a2f7a 100%)', accent: '#c9a84c' },
];

function getCoverPlaceholder(book) {
  const key = (book && (book.categorie || book.titre || book.auteur || '')) + '';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const palette = COVER_PALETTE[h % COVER_PALETTE.length];
  const initials = (book?.titre || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('') || '?';
  return { ...palette, initials };
}

const DOCUMENT_TYPE_META = {
  TOUS: { labelKey: 'student.digital.types.all', shortLabelKey: 'student.digital.types.all' },
  COURS: { labelKey: 'student.digital.types.courses', shortLabelKey: 'student.digital.types.coursesShort' },
  TP_TD: { labelKey: 'student.digital.types.tutorials', shortLabelKey: 'student.digital.types.tutorials' },
  EXAMEN: { labelKey: 'student.digital.types.exams', shortLabelKey: 'student.digital.types.examShort' },
  CORRIGE: { labelKey: 'student.digital.types.corrections', shortLabelKey: 'student.digital.types.correctionShort' },
  VIDEO: { labelKey: 'student.digital.types.videos', shortLabelKey: 'student.digital.types.videoShort' },
  AUTRE: { labelKey: 'student.digital.types.other', shortLabelKey: 'student.digital.types.other' },
};
const DOCUMENT_TYPE_TABS = ['TOUS', 'COURS', 'TP_TD', 'EXAMEN', 'CORRIGE', 'VIDEO', 'AUTRE'];
const DOCUMENT_SUMMARY_TYPES = ['COURS', 'TP_TD', 'EXAMEN', 'CORRIGE', 'VIDEO'];
const DOCUMENT_FORMAT_ORDER = ['PDF', 'PPTX', 'MP4', 'DOCX', 'XLSX', 'ZIP', 'AUTRE'];

const RESERVATION_STATUS_OPTIONS = ['EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'EXPIREE'];
const RESERVATION_STATUS_LABEL_KEYS = {
  EN_ATTENTE: 'student.statusBadges.pending',
  CONFIRMEE: 'student.statusBadges.approved',
  APPROUVEE: 'student.statusBadges.approved',
  ANNULEE: 'student.statusBadges.cancelled',
  REFUSEE: 'student.statusBadges.rejected',
  REFUSE: 'student.statusBadges.rejected',
  EXPIREE: 'student.statusBadges.expired',
};
const RESERVATION_BADGE = {
  EN_ATTENTE: 'badge-warning',
  CONFIRMEE: 'badge-success',
  APPROUVEE: 'badge-success',
  ANNULEE: 'badge-gold',
  REFUSEE: 'badge-danger',
  REFUSE: 'badge-danger',
  EXPIREE: 'badge-danger',
};

const LOAN_STATUS_OPTIONS = ['', 'EN_ATTENTE', 'EN_COURS', 'EN_RETARD', 'RETOURNE', 'ANNULE', 'REFUSE'];
const LOAN_STATUS_LABEL_KEYS = {
  EN_ATTENTE: 'student.statusBadges.pending',
  EN_COURS: 'student.statusBadges.ongoing',
  EN_RETARD: 'student.statusBadges.overdue',
  RETOURNE: 'student.statusBadges.returned',
  ANNULE: 'student.statusBadges.cancelledMasculine',
  REFUSE: 'student.statusBadges.rejectedMasculine',
};
const LOAN_BADGE = {
  EN_ATTENTE: 'badge-warning',
  EN_COURS: 'badge-success',
  EN_RETARD: 'badge-danger',
  RETOURNE: 'badge-info',
  ANNULE: 'badge-gold',
  REFUSE: 'badge-danger',
};

const formatReservationStatus = (statut, t) => {
  const key = RESERVATION_STATUS_LABEL_KEYS[statut];
  return key && t ? t(key) : statut || '-';
};
const canCancelReservation = (statut) => statut === 'EN_ATTENTE' || statut === 'CONFIRMEE';
const formatLoanStatus = (statut, t) => {
  const key = LOAN_STATUS_LABEL_KEYS[statut];
  return key && t ? t(key) : statut || '-';
};
const canCancelLoan = (statut) => statut === 'EN_ATTENTE';

const formatDate = (date, withTime = false, language = 'fr') => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(language, withTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : undefined);
};

const getLoanRequestDate = (loan) => loan.date_creation || loan.date_emprunt || loan.date_modification;

const getLoanSummary = (loan, t, language = 'fr') => {
  if (loan.statut === 'EN_ATTENTE') {
    return t('student.loans.requestSentOn', { date: formatDate(getLoanRequestDate(loan), false, language) });
  }
  if (loan.statut === 'EN_COURS' || loan.statut === 'EN_RETARD') {
    return t('student.loans.borrowedDueSummary', {
      borrowed: formatDate(loan.date_emprunt, false, language),
      due: formatDate(loan.date_retour_prevue, false, language),
    });
  }
  if (loan.statut === 'RETOURNE') {
    return t('student.loans.returnedOn', { date: formatDate(loan.date_retour_effectif, false, language) });
  }
  if (loan.statut === 'ANNULE') {
    return t('student.loans.requestCancelled');
  }
  if (loan.statut === 'REFUSE') {
    return t('student.loans.requestRejected');
  }
  return formatLoanStatus(loan.statut, t);
};

const normalizeText = (value) => (value || '')
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const inferDocumentType = (document) => {
  const format = (document.format || '').toUpperCase();
  const text = normalizeText([
    document.titre,
    document.description,
    document.categorie,
    document.format,
  ].filter(Boolean).join(' '));

  if (format === 'MP4' || /\b(video|videos|mp4)\b/.test(text)) return 'VIDEO';
  if (/\b(corrige|corriges|correction|corrections|solution|solutions)\b/.test(text)) return 'CORRIGE';
  if (/\b(examen|examens|exam|devoir|devoirs|ds|controle|controles|final)\b/.test(text)) return 'EXAMEN';
  if (/\b(tp|td)\b|travaux pratiques|travaux diriges/.test(text)) return 'TP_TD';
  if (/\b(cours|support|supports|slide|slides|diapo|diapos|presentation|polycopie|chapitre)\b/.test(text)) return 'COURS';
  return 'AUTRE';
};

const formatFileSize = (tailleKo, t) => {
  const size = Number(tailleKo);
  if (!size) return t('student.digital.sizeUnavailable');
  if (size >= 1024) {
    const value = size / 1024;
    return t('student.digital.sizeMb', { value: value >= 10 ? value.toFixed(0) : value.toFixed(1) });
  }
  return t('student.digital.sizeKb', { value: Math.round(size) });
};

const getUploaderName = (document) => (
  [document.uploade_par_prenom, document.uploade_par_nom].filter(Boolean).join(' ').trim()
);

const getDocumentAuthor = (document, t) => document.auteur || getUploaderName(document) || t('student.common.authorUnavailable');

const getDownloadFileName = (document) => {
  const extension = (document.format || 'document').toLowerCase();
  const title = (document.titre || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${title || 'document'}.${extension}`;
};

const DOCUMENT_ID_FIELDS = ['id_ressource', 'id_document', 'document_id'];
const DOCUMENT_FILE_FIELDS = ['url_fichier', 'fichier', 'file_url', 'url', 'chemin', 'path'];

const getDocumentReadId = (document) => {
  if (!document) return null;
  for (const field of DOCUMENT_ID_FIELDS) {
    const value = document[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
};

const getDocumentFilePath = (document) => {
  if (!document) return '';
  for (const field of DOCUMENT_FILE_FIELDS) {
    const value = document[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
};

const getDocumentFileUrl = (filePath) => {
  const normalizedPath = String(filePath || '').trim().replace(/\\/g, '/');
  if (!normalizedPath) return '';
  if (/^(https?:|blob:|data:)/i.test(normalizedPath)) return normalizedPath;
  if (normalizedPath.startsWith('/')) return `${API_HOST}${normalizedPath}`;
  return `${API_HOST}/${normalizedPath}`;
};

// A catalog resource can be read online when it is digital/hybrid or carries
// an attached file (PDF/document/URL). Driven entirely by existing fields —
// no new DB logic. Physical-only books carry none of these, so Read stays hidden.
const isReadableOnline = (book) => {
  if (!book) return false;
  const type = String(book.type_ressource || '').toUpperCase();
  if (type === 'NUMERIQUE' || type === 'HYBRIDE') return true;
  if (book.format) return true;
  return Boolean(getDocumentFilePath(book));
};

// A resource has a physical side (borrow/reserve) when it is physical/hybrid or
// exposes stock fields. Digital-only resources have neither → no borrow/reserve.
const hasPhysicalCopies = (book) => {
  if (!book) return false;
  const type = String(book.type_ressource || '').toUpperCase();
  if (type === 'PHYSIQUE' || type === 'HYBRIDE') return true;
  if (type === 'NUMERIQUE') return false;
  return book.stock_total != null || book.stock_disponible != null;
};

const getStudentName = (user, t) => {
  const fullName = [user?.prenom, user?.nom].filter(Boolean).join(' ').trim();
  return fullName || user?.email || (t ? t('student.common.studentFallback') : 'étudiant');
};

const PROFILE_UNAVAILABLE = '—';

const ROLE_LABEL_KEYS = {
  ETUDIANT: 'student.profile.roles.etudiant',
  ENSEIGNANT: 'student.profile.roles.enseignant',
  BIBLIOTHECAIRE: 'student.profile.roles.librarian',
  ADMIN: 'student.profile.roles.admin',
};

const getRoleLabel = (role, t) => {
  const key = ROLE_LABEL_KEYS[String(role || '').toUpperCase()];
  return key && t ? t(key) : role || PROFILE_UNAVAILABLE;
};

const formatProfileDate = (value, withTime = false, language = 'fr') => {
  if (!value) return PROFILE_UNAVAILABLE;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return PROFILE_UNAVAILABLE;
  return d.toLocaleDateString(language, withTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'long', day: 'numeric' });
};

const getStudentInitials = (user) => {
  const initials = [user?.prenom, user?.nom]
    .map(part => (part || '').trim().charAt(0))
    .filter(Boolean)
    .join('');

  if (initials) return initials.toUpperCase();
  return (user?.email || '?').trim().slice(0, 2).toUpperCase();
};

const getAvailableProfileValue = (user, keys) => {
  for (const key of keys) {
    const value = user?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
};

const getAcademicInfo = (user) => {
  const parts = [
    getAvailableProfileValue(user, ['filiere', 'specialite', 'departement']),
    getAvailableProfileValue(user, ['niveau', 'annee_etude', 'level']),
    getAvailableProfileValue(user, ['classe', 'groupe', 'section']),
  ].filter(Boolean);

  return parts.join(' / ') || null;
};

const getLoanDate = (emprunt) => (
  emprunt.date_retour_effectif
  || emprunt.date_emprunt
  || emprunt.date_creation
  || emprunt.date_modification
  || emprunt.date_retour_prevue
  || null
);

const getLectureDocumentKey = (lecture) => (
  lecture.id_document
  || lecture.document_id
  || lecture.id_ressource
  || [lecture.titre, lecture.auteur, lecture.format].filter(Boolean).join('|')
  || `lecture-${lecture.id}`
);

const getReservationActivityTitle = (statut, t) => {
  if (statut === 'EN_ATTENTE') return t('student.activity.reservationCreated');
  if (statut === 'CONFIRMEE' || statut === 'APPROUVEE') return t('student.activity.reservationApproved');
  if (statut === 'ANNULEE') return t('student.activity.reservationCancelled');
  if (statut === 'EXPIREE') return t('student.activity.reservationExpired');
  return t('student.activity.reservation');
};

const getLoanActivityTitle = (statut, t) => {
  if (statut === 'RETOURNE') return t('student.activity.returnCompleted');
  if (statut === 'EN_COURS' || statut === 'EN_RETARD') return t('student.activity.activeLoan');
  if (statut === 'EN_ATTENTE') return t('student.activity.loanRequest');
  if (statut === 'REFUSE') return t('student.loans.requestRejected');
  if (statut === 'ANNULE') return t('student.loans.requestCancelled');
  return t('student.activity.loan');
};

const getActivityTone = (statut, fallback = 'gold') => {
  if (['EN_COURS', 'RETOURNE', 'CONFIRMEE', 'APPROUVEE'].includes(statut)) return 'success';
  if (statut === 'EN_RETARD' || statut === 'REFUSE' || statut === 'EXPIREE') return 'danger';
  if (statut === 'EN_ATTENTE') return 'warning';
  if (statut === 'ANNULE' || statut === 'ANNULEE') return 'muted';
  return fallback;
};

const buildRecentActivity = ({ emprunts = [], reservations = [], lectures = [] }, t) => {
  const loanActivities = emprunts.map((emprunt) => ({
    id: `emprunt-${emprunt.id_emprunt}`,
    icon: 'loan',
    title: getLoanActivityTitle(emprunt.statut, t),
    resourceTitle: emprunt.titre,
    detail: emprunt.auteur || emprunt.categorie || '',
    statusLabel: formatLoanStatus(emprunt.statut, t),
    statusClass: LOAN_BADGE[emprunt.statut] || 'badge-info',
    date: getLoanDate(emprunt),
    tone: getActivityTone(emprunt.statut, 'info'),
  }));

  const reservationActivities = reservations.map((reservation) => ({
    id: `reservation-${reservation.id_reservation}`,
    icon: 'reservation',
    title: getReservationActivityTitle(reservation.statut, t),
    resourceTitle: reservation.titre,
    detail: reservation.auteur || '',
    statusLabel: formatReservationStatus(reservation.statut, t),
    statusClass: RESERVATION_BADGE[reservation.statut] || 'badge-info',
    date: reservation.date_reservation,
    tone: getActivityTone(reservation.statut, 'gold'),
  }));

  const readingActivities = lectures.map((lecture) => ({
    id: `lecture-${lecture.id}`,
    icon: 'document',
    title: t('student.activity.viewedDocument'),
    resourceTitle: lecture.titre,
    detail: lecture.auteur || '',
    statusLabel: lecture.format || '',
    statusClass: 'badge-info',
    date: lecture.date_lecture,
    tone: 'success',
  }));

  return [...loanActivities, ...reservationActivities, ...readingActivities]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 5);
};

const HOME_UNAVAILABLE = 'Non disponible';

const isHomeDataAvailable = (availability, key) => availability?.[key] !== false;

const buildStudentSummaryCards = ({ emprunts = [], reservations = [], lectures = [], availability = {} }, t) => {
  const loansAvailable = isHomeDataAvailable(availability, 'emprunts');
  const reservationsAvailable = isHomeDataAvailable(availability, 'reservations');
  const readingsAvailable = isHomeDataAvailable(availability, 'lectures');
  const activeLoansCount = emprunts.filter(e => ['EN_COURS', 'EN_RETARD'].includes(e.statut)).length;
  const pendingReservationsCount = reservations.filter(r => r.statut === 'EN_ATTENTE').length;
  const uniqueDocumentsConsulted = new Set(lectures.map(getLectureDocumentKey)).size;

  // Translation helper — falls back to French if t is not provided (defensive).
  const tr = (key, fr) => (t ? t(key) : fr);
  const unavailableValue = tr('student.unavailable', HOME_UNAVAILABLE);
  const dataUnavailable = tr('student.summary.dataUnavailable', 'Donnée indisponible');

  return [
    {
      id: 'active-loans',
      label: tr('student.summary.activeLoans', 'Emprunts actifs'),
      value: loansAvailable ? activeLoansCount : unavailableValue,
      hint: loansAvailable
        ? (activeLoansCount
            ? tr('student.summary.activeLoansHint', 'Livres empruntés actuellement')
            : tr('student.summary.noActiveLoan', 'Aucun emprunt actif'))
        : dataUnavailable,
      isUnavailable: !loansAvailable,
      tone: 'blue',
      icon: 'loan',
      target: 'mes-emprunts',
      actionLabel: tr('student.summary.viewLoans', 'Voir mes emprunts'),
    },
    {
      id: 'pending-reservations',
      label: tr('student.summary.pendingReservations', 'Réservations en attente'),
      value: reservationsAvailable ? pendingReservationsCount : unavailableValue,
      hint: reservationsAvailable
        ? (pendingReservationsCount
            ? tr('student.summary.pendingHint', 'Demandes en attente de réponse')
            : tr('student.summary.noPending', 'Aucune réservation en attente'))
        : dataUnavailable,
      isUnavailable: !reservationsAvailable,
      tone: 'gold',
      icon: 'reservation',
      target: 'mes-reservations',
      actionLabel: tr('student.summary.viewReservations', 'Voir mes réservations'),
    },
    {
      id: 'consulted-documents',
      label: tr('student.summary.viewedDocs', 'Documents consultés'),
      value: readingsAvailable ? uniqueDocumentsConsulted : unavailableValue,
      hint: readingsAvailable
        ? (uniqueDocumentsConsulted
            ? tr('student.summary.uniqueDocsHint', 'Documents uniques consultés')
            : tr('student.summary.noViewed', 'Aucun document consulté'))
        : dataUnavailable,
      isUnavailable: !readingsAvailable,
      tone: 'green',
      icon: 'document',
      target: 'historique',
      actionLabel: tr('student.summary.viewHistory', 'Voir l’historique'),
    },
    {
      id: 'reading-history',
      label: tr('student.summary.readingHistory', 'Historique de lectures'),
      value: readingsAvailable ? lectures.length : unavailableValue,
      hint: readingsAvailable
        ? (lectures.length
            ? tr('student.summary.savedViews', 'Consultations enregistrées')
            : tr('student.summary.noReading', 'Aucune lecture enregistrée'))
        : dataUnavailable,
      isUnavailable: !readingsAvailable,
      tone: 'purple',
      icon: 'history',
      target: 'historique',
      actionLabel: tr('student.summary.viewHistory', 'Voir l’historique'),
    },
  ];
};

const buildSuggestedResources = ({ livres = [], documents = [] }, t) => (
  [
    ...livres.map(item => ({ ...item, resourceType: t('student.resourceTypes.book'), resourceKind: 'book' })),
    ...documents.map(item => ({ ...item, resourceType: t('student.resourceTypes.document'), resourceKind: 'document' })),
  ]
    .filter(resource => resource.id_ressource && resource.titre)
    .sort((a, b) => new Date(b.date_creation || 0) - new Date(a.date_creation || 0))
    .slice(0, 4)
);

const getMonthlyLectureCount = (lectures = []) => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  return lectures.filter((lecture) => {
    if (!lecture.date_lecture) return false;
    const date = new Date(lecture.date_lecture);
    return !Number.isNaN(date.getTime())
      && date.getMonth() === month
      && date.getFullYear() === year;
  }).length;
};

const getCategoryResourceCount = (category) => {
  const raw = category?.nb_ressources ?? category?.ressources_count ?? category?.total_ressources;
  const count = Number(raw);
  return Number.isFinite(count) ? count : null;
};

const SIDEBAR_ITEMS = [
  { type: 'section', label: 'Accueil', i18nKey: 'sidebar.sections.home' },
  { id: 'accueil', icon: '🏠', label: 'Accueil', i18nKey: 'sidebar.items.home' },
  { id: 'catalogue', icon: '🔍', label: 'Catalogue', i18nKey: 'sidebar.items.studentCatalogue' },
  { id: 'ged', icon: '📄', label: 'Bibliothèque numérique', i18nKey: 'sidebar.items.ged' },
  { type: 'section', label: 'Mes activités', i18nKey: 'sidebar.sections.myActivities' },
  { id: 'mes-emprunts', icon: '📗', label: 'Mes emprunts', i18nKey: 'sidebar.items.mesEmprunts' },
  { id: 'mes-reservations', icon: '🔖', label: 'Mes réservations', i18nKey: 'sidebar.items.mesReservations' },
  { id: 'historique', icon: '📖', label: 'Historique lectures', i18nKey: 'sidebar.items.historique' },
  { type: 'section', label: 'Mon compte', i18nKey: 'sidebar.sections.myAccount' },
  { id: 'profil', icon: '👤', label: 'Mon profil', i18nKey: 'sidebar.items.myProfile' },
  { id: 'aide', icon: '🎧', label: 'Centre d’aide', i18nKey: 'sidebar.items.helpCenter' },
];

const SUPPORT_PROBLEM_TYPES = [
  { value: 'Problème de réservation', i18nKey: 'student.help.problemTypes.reservation' },
  { value: 'Problème d’emprunt', i18nKey: 'student.help.problemTypes.loan' },
  { value: 'Problème de document numérique', i18nKey: 'student.help.problemTypes.digital' },
  { value: 'Problème de compte', i18nKey: 'student.help.problemTypes.account' },
  { value: 'Autre', i18nKey: 'student.help.problemTypes.other' },
];

const SUPPORT_FAQS = [
  {
    questionKey: 'student.help.faq.reserveBookQuestion',
    answerKey: 'student.help.faq.reserveBookAnswer',
  },
  {
    questionKey: 'student.help.faq.documentQuestion',
    answerKey: 'student.help.faq.documentAnswer',
  },
  {
    questionKey: 'student.help.faq.cancelReservationQuestion',
    answerKey: 'student.help.faq.cancelReservationAnswer',
  },
  {
    questionKey: 'student.help.faq.adminReplyQuestion',
    answerKey: 'student.help.faq.adminReplyAnswer',
  },
];

const SUPPORT_STATUS_META = {
  EN_ATTENTE: { i18nKey: 'student.help.statusPending', className: 'status-pending' },
  REPONDU: { i18nKey: 'student.help.statusAnswered', className: 'status-answered' },
  FERME: { i18nKey: 'student.help.statusClosed', className: 'status-closed' },
};

const getSupportProblemTypeLabel = (value, t) => {
  const type = SUPPORT_PROBLEM_TYPES.find(item => item.value === value);
  return type ? t(type.i18nKey) : (value || '—');
};

// ── Student home icons ──────────────────────────────────────
// Inline SVGs in a consistent Lucide-style family (24×24 viewBox,
// stroke 1.75, round caps/joins, no fill). Sized via 1em so they
// scale with the parent container's font-size.
const STUDENT_ICON_PATHS = {
  // Open book → active loans
  loan: (
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ),
  // Bookmark → pending reservations
  reservation: (
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  ),
  // File-text → viewed documents
  document: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </>
  ),
  // Clock with rewind arrow → reading history
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <polyline points="12 7 12 12 16 14" />
    </>
  ),
  // Search → catalog quick action
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  // Library / column chart → digital library quick action
  library: (
    <>
      <line x1="4"  y1="4"  x2="4"  y2="20" />
      <line x1="8"  y1="8"  x2="8"  y2="20" />
      <line x1="12" y1="6"  x2="12" y2="20" />
      <line x1="16" y1="10" x2="16" y2="20" />
      <line x1="20" y1="6"  x2="20" y2="20" />
    </>
  ),
};

function StudentHomeIcon({ name }) {
  const paths = STUDENT_ICON_PATHS[name];
  if (!paths) {
    // Fallback for any legacy name → keeps the old CSS-char rendering.
    return <span className={`student-home-icon icon-${name}`} aria-hidden="true" />;
  }
  return (
    <span className={`student-home-icon icon-${name}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {paths}
      </svg>
    </span>
  );
}

function Pagination({ page, totalPages, total, onChange, itemLabelKey = 'student.catalog.bookCount' }) {
  const { t } = useTranslation();
  if (totalPages <= 1) {
    return total > 0 ? (
      <div className="pagination-info-only">
        {t(itemLabelKey, { count: total })}
      </div>
    ) : null;
  }

  return (
    <div className="pagination">
      <div className="pagination-info">
        {t('student.pagination.info', { total, page, totalPages, item: t(itemLabelKey, { count: total }) })}
      </div>
      <div className="pagination-controls">
        <button className="pagination-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ← {t('common.previous')}
        </button>
        <span className="pagination-current">{page} / {totalPages}</span>
        <button className="pagination-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          {t('common.next')} →
        </button>
      </div>
    </div>
  );
}

function InfoItem({ label, value, mono, highlight }) {
  const colorMap = { success: 'var(--success)', danger: 'var(--danger)' };
  return (
    <div className="book-modal-info-item">
      <div className="book-modal-info-label">{label}</div>
      <div
        className="book-modal-info-value"
        style={{
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          color: highlight ? colorMap[highlight] : undefined,
        }}
      >
        {value ?? '—'}
      </div>
    </div>
  );
}

function BookDetailsModal({ book, loading, onClose, onEmprunt, onReserver, onRead }) {
  const { t } = useTranslation();
  if (!book) return null;
  const dispo = (book.stock_disponible ?? 0) > 0;
  const canRead = isReadableOnline(book);
  const physical = hasPhysicalCopies(book);
  const annee = book.date_publication ? new Date(book.date_publication).getFullYear() : null;
  const showSkeleton = loading && !book.titre;

  return (
    <div className="book-modal-overlay" onClick={onClose}>
      <div className="book-modal" onClick={e => e.stopPropagation()}>
        <button className="book-modal-close" onClick={onClose} aria-label={t('student.actions.close')}>✕</button>

        {showSkeleton ? (
          <div style={{ padding: 60 }}>
            <div className="loading-spinner"><div className="spinner" /></div>
          </div>
        ) : (
          <>
            <div className="book-modal-header">
              <div className="book-modal-cover">
                {book.image_couverture
                  ? <img src={resolveAssetUrl(book.image_couverture)} alt={book.titre} />
                  : <span style={{ fontSize: '3.5rem' }}>📖</span>
                }
              </div>
              <div className="book-modal-title-block">
                <div className="book-modal-title">{book.titre}</div>
                <div className="book-modal-author">{t('student.catalog.byAuthor', { author: book.auteur || t('student.common.unknownAuthor') })}</div>
                <div className="book-modal-badges">
                  {book.categorie && <span className="badge badge-gold">{book.categorie}</span>}
                  <span className={`badge ${dispo ? 'badge-success' : 'badge-danger'}`}>
                    {dispo ? t('student.catalog.availableCount', { count: book.stock_disponible }) : t('student.statusBadges.unavailable')}
                  </span>
                </div>
              </div>
            </div>

            <div className="book-modal-body">
              <div className="book-modal-section">
                <div className="book-modal-section-title">{t('student.catalog.description')}</div>
                <div className="book-modal-description">
                  {book.description || t('student.catalog.noDescription')}
                </div>
              </div>

              <div className="book-modal-section">
                <div className="book-modal-section-title">{t('student.catalog.information')}</div>
                <div className="book-modal-grid">
                  <InfoItem label="ISBN" value={book.isbn} mono />
                  <InfoItem label={t('student.digital.category')} value={book.categorie} />
                  <InfoItem label={t('student.catalog.shelf')} value={book.emplacement_rayon} />
                  <InfoItem label={t('student.catalog.year')} value={annee} mono />
                  <InfoItem label={t('student.catalog.totalStock')} value={book.stock_total} mono />
                  <InfoItem
                    label={t('student.catalog.availableStock')}
                    value={book.stock_disponible}
                    mono
                    highlight={dispo ? 'success' : 'danger'}
                  />
                </div>
              </div>
            </div>

            <div className="book-modal-footer">
              <button className="btn-secondary" onClick={onClose}>{t('student.actions.close')}</button>
              {canRead && onRead && (
                <button className="btn-secondary" onClick={() => onRead(book)}>
                  📖 {t('student.digital.read')}
                </button>
              )}
              {physical && (dispo ? (
                <button className="btn-primary" onClick={() => onEmprunt(book.id_ressource)}>
                  📗 {t('student.catalog.borrow')}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => onReserver(book.id_ressource)}>
                  🔖 {t('student.catalog.reserve')}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoanDetailsModal({ loan, onClose }) {
  const { t, i18n } = useTranslation();
  if (!loan) return null;

  const detailRows = [
    { label: t('student.loans.bookTitle'), value: loan.titre },
    { label: t('student.digital.author'), value: loan.auteur },
    { label: t('student.digital.category'), value: loan.categorie },
    { label: 'ISBN', value: loan.isbn, mono: true },
    { label: t('student.catalog.shelf'), value: loan.emplacement_rayon },
    { label: t('student.loans.requestSent'), value: formatDate(getLoanRequestDate(loan), true, i18n.language), mono: true },
    {
      label: t('student.loans.loanDate'),
      value: ['EN_COURS', 'EN_RETARD', 'RETOURNE'].includes(loan.statut) ? formatDate(loan.date_emprunt, false, i18n.language) : null,
      mono: true,
    },
    { label: t('student.loans.expectedReturn'), value: formatDate(loan.date_retour_prevue, false, i18n.language), mono: true },
    { label: t('student.loans.actualReturn'), value: formatDate(loan.date_retour_effectif, false, i18n.language), mono: true },
    { label: t('student.loans.currentStatus'), value: formatLoanStatus(loan.statut, t) },
  ];

  return (
    <div className="loan-modal-overlay" onClick={onClose}>
      <div className="loan-modal" onClick={e => e.stopPropagation()}>
        <button className="book-modal-close" onClick={onClose} aria-label={t('student.actions.close')}>✕</button>
        <div className="loan-modal-header">
          <div>
            <div className="loan-modal-kicker">{t('student.loans.loanDetails')}</div>
            <h2>{loan.titre}</h2>
            <p>{getLoanSummary(loan, t, i18n.language)}</p>
          </div>
          <span className={`badge ${LOAN_BADGE[loan.statut] || 'badge-info'}`}>
            {formatLoanStatus(loan.statut, t)}
          </span>
        </div>

        <div className="loan-modal-grid">
          {detailRows.map(row => (
            <div key={row.label} className="loan-modal-info">
              <span>{row.label}</span>
              <strong style={{ fontFamily: row.mono ? 'var(--font-mono)' : undefined }}>
                {row.value || '—'}
              </strong>
            </div>
          ))}
        </div>

        {(loan.notes_biblio || loan.penalite_montant > 0) && (
          <div className="loan-modal-note">
            {loan.notes_biblio && <p>{loan.notes_biblio}</p>}
            {loan.penalite_montant > 0 && (
              <strong>{t('student.loans.penalty', { amount: (loan.penalite_montant / 100).toFixed(3) })}</strong>
            )}
          </div>
        )}

        <div className="loan-modal-footer">
          <button className="btn-secondary" type="button" onClick={onClose}>{t('student.actions.close')}</button>
        </div>
      </div>
    </div>
  );
}

export default function EtudiantDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [activeItem, setActiveItem] = useState('accueil');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [livres, setLivres] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [emprunts, setEmprunts] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [loanStatusFilter, setLoanStatusFilter] = useState('');
  const [loanSearch, setLoanSearch] = useState('');
  const [loanPage, setLoanPage] = useState(1);
  const [reservations, setReservations] = useState([]);
  const [homeData, setHomeData] = useState({
    emprunts: [],
    reservations: [],
    lectures: [],
    livres: [],
    documents: [],
    availability: {
      emprunts: false,
      reservations: false,
      lectures: false,
      livres: false,
      documents: false,
    },
  });
  const [homeLoading, setHomeLoading] = useState(true);
  const [profileData, setProfileData] = useState({ user: null });
  const [profileLoading, setProfileLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordVisibility, setPasswordVisibility] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [searchRes, setSearchRes] = useState('');
  const [filterStatutRes, setFilterStatutRes] = useState('');
  const [resvPage, setResvPage] = useState(1);
  const [histSearch, setHistSearch] = useState('');
  const [histFormat, setHistFormat] = useState('');
  const [histDate, setHistDate] = useState('all');
  const [histPage, setHistPage] = useState(1);
  const [selectedLecture, setSelectedLecture] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gedTypeFilter, setGedTypeFilter] = useState('TOUS');
  const [gedSearch, setGedSearch] = useState('');
  const [gedCategoryFilter, setGedCategoryFilter] = useState('');
  const [gedFormatFilter, setGedFormatFilter] = useState('');
  const [gedSort, setGedSort] = useState('recent');
  const [gedPage, setGedPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterAvail, setFilterAvail] = useState('tous');
  const [sortBy, setSortBy] = useState('pertinence');
  const [availCounts, setAvailCounts] = useState({ all: 0, dispo: 0, indispo: 0 });
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [msg, setMsg] = useState('');
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [openSupportFaq, setOpenSupportFaq] = useState(null);
  const [supportForm, setSupportForm] = useState({
    sujet: '',
    type_probleme: '',
    related_text: '',
    message: '',
  });
  const [selectedBook, setSelectedBook] = useState(null);
  const [loadingBook, setLoadingBook] = useState(false);
  const [page, setPage] = useState(1);
  const searchInputRef = useRef(null);

  useEffect(() => { loadCategories(); }, []);

  // ── Notifications: initial load + 30s polling (mirror Admin/Teacher) ──
  useEffect(() => {
    let cancelled = false;
    const refreshUnread = async () => {
      try {
        const res = await notificationsAPI.getUnreadCount();
        if (!cancelled) setUnreadCount(res.data?.data?.count || 0);
      } catch {
        /* silent — global interceptor handles auth */
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

  const handleMarkNotificationRead = async (id) => {
    try { await notificationsAPI.markAsRead(id); } catch { /* keep local */ }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllNotificationsRead = async () => {
    try { await notificationsAPI.markAllAsRead(); } catch { /* keep local */ }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const sidebarItemForNotification = (notif) => {
    const url = (notif?.target_url || '').toLowerCase();
    if (url.includes('/support') || url.includes('/help') || url.includes('/aide')) return 'aide';
    if (url.includes('/documents') || url.includes('/ged')) return 'ged';
    if (url.includes('/reservations')) return 'mes-reservations';
    if (url.includes('/emprunts') || url.includes('/loans')) return 'mes-emprunts';
    switch (notif?.type) {
      case 'SUPPORT_TICKET':    return 'aide';
      case 'DOCUMENT_UPLOAD':   return 'ged';
      case 'BOOK_RESERVATION':  return 'mes-reservations';
      case 'BOOK_LOAN_REQUEST':
      case 'OVERDUE_LOAN':      return 'mes-emprunts';
      default: return null;
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif) return;
    if (!notif.is_read) handleMarkNotificationRead(notif.id);
    const target = sidebarItemForNotification(notif);
    if (target) setActiveItem(target);
  };

  useEffect(() => {
    if (activeItem === 'accueil') loadHomeDashboard();
    if (activeItem === 'ged') loadDocuments();
    if (activeItem === 'mes-emprunts') loadEmprunts();
    if (activeItem === 'mes-reservations') loadReservations();
    if (activeItem === 'historique') loadLectures();
    if (activeItem === 'profil') loadStudentProfile();
    if (activeItem === 'aide') loadSupportTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem]);

  useEffect(() => {
    if (activeItem === 'catalogue') loadLivres();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem]);

  useEffect(() => {
    if (activeItem !== 'catalogue') return;
    if (page !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterCat, filterAvail, sortBy]);

  useEffect(() => {
    if (activeItem !== 'ged') return;
    if (gedPage !== 1) setGedPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gedTypeFilter, gedSearch, gedCategoryFilter, gedFormatFilter, gedSort]);

  useEffect(() => {
    if (activeItem !== 'mes-emprunts') return;
    if (loanPage !== 1) setLoanPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanSearch, loanStatusFilter]);

  useEffect(() => {
    if (activeItem !== 'mes-reservations') return;
    if (resvPage !== 1) setResvPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRes, filterStatutRes]);

  useEffect(() => {
    if (activeItem !== 'historique') return;
    if (histPage !== 1) setHistPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histSearch, histFormat, histDate]);

  const showMessage = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  };

  const loadHomeDashboard = async () => {
    setHomeLoading(true);
    const results = await Promise.allSettled([
      empruntsAPI.getMesEmprunts({ limit: 500 }),
      empruntsAPI.getMesReservations(),
      documentsAPI.getMesLectures(),
      livresAPI.getAll({ limit: 6, disponible: true, sort: 'date_creation', order: 'DESC' }),
      documentsAPI.getAll({ limit: 6 }),
    ]);
    const readHomeResult = (result) => {
      const payload = result.status === 'fulfilled' ? result.value?.data?.data : null;
      return {
        data: Array.isArray(payload) ? payload : [],
        available: result.status === 'fulfilled',
      };
    };
    const empruntsResult = readHomeResult(results[0]);
    const reservationsResult = readHomeResult(results[1]);
    const lecturesResult = readHomeResult(results[2]);
    const livresResult = readHomeResult(results[3]);
    const documentsResult = readHomeResult(results[4]);

    const nextHomeData = {
      emprunts: empruntsResult.data,
      reservations: reservationsResult.data,
      lectures: lecturesResult.data,
      livres: livresResult.data,
      documents: documentsResult.data,
      availability: {
        emprunts: empruntsResult.available,
        reservations: reservationsResult.available,
        lectures: lecturesResult.available,
        livres: livresResult.available,
        documents: documentsResult.available,
      },
    };

    setHomeData(nextHomeData);
    setHomeLoading(false);
  };

  const loadStudentProfile = async () => {
    setProfileLoading(true);
    try {
      const r = await authAPI.getMe();
      setProfileData({ user: r.data.data || null });
    } catch {
      setProfileData({ user: null });
    } finally {
      setProfileLoading(false);
    }
  };

  const loadSupportTickets = async () => {
    setSupportLoading(true);
    try {
      const r = await supportAPI.getMySupportTickets();
      setSupportTickets(Array.isArray(r.data.data) ? r.data.data : []);
    } catch {
      setSupportTickets([]);
      showMessage(`❌ ${t('student.messages.loadRequestsFailed')}`);
    } finally {
      setSupportLoading(false);
    }
  };

  const loadCategories = async () => {
    try { const r = await categoriesAPI.getAll(); setCategories(r.data.data); } catch {}
  };

  const loadLivres = async () => {
    setLoading(true);
    try {
      const r = await livresAPI.getAll({
        page: 1,
        limit: CATALOGUE_FETCH_LIMIT,
        sort: 'date_creation',
        order: 'DESC',
      });
      const rows = r.data.data || [];
      setLivres(rows);
      const total = rows.length;
      const dispo = rows.filter(b => Number(b.stock_disponible) > 0).length;
      setAvailCounts({ all: total, dispo, indispo: total - dispo });
    } catch {
      showMessage(`❌ ${t('student.messages.loadCatalogFailed')}`);
      setLivres([]);
      setAvailCounts({ all: 0, dispo: 0, indispo: 0 });
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const r = await documentsAPI.getAll({ limit: 5000 });
      const rows = r.data.data || [];
      setDocuments(rows);
      setDocumentsTotal(r.data.pagination?.total || rows.length);
    }
    catch { showMessage(`❌ ${t('student.messages.loadDocumentsFailed')}`); }
    finally { setLoading(false); }
  };

  const loadEmprunts = async () => {
    setLoading(true);
    try { const r = await empruntsAPI.getMesEmprunts({ limit: 5000 }); setEmprunts(r.data.data); }
    catch { showMessage(`❌ ${t('student.messages.loadLoansFailed')}`); }
    finally { setLoading(false); }
  };

  const loadReservations = async () => {
    setLoading(true);
    try { const r = await empruntsAPI.getMesReservations(); setReservations(r.data.data); }
    catch { showMessage(`❌ ${t('student.messages.loadReservationsFailed')}`); }
    finally { setLoading(false); }
  };

  const loadLectures = async () => {
    setLoading(true);
    try { const r = await documentsAPI.getMesLectures(); setLectures(r.data.data); }
    catch { showMessage(`❌ ${t('student.messages.loadHistoryFailed')}`); }
    finally { setLoading(false); }
  };

  const handleEmprunt = async (id_livre) => {
    try {
      await empruntsAPI.creer({ id_livre, duree_jours: 14 });
      showMessage(`✅ ${t('student.messages.loanRequestSent')}`);
      if (activeItem === 'catalogue') loadLivres();
    } catch (err) {
      showMessage(`❌ ${err.response?.data?.message || t('student.messages.genericError')}`);
    }
  };

  const handleAnnuler = async (id) => {
    try {
      await empruntsAPI.annuler(id);
      loadEmprunts();
      if (selectedLoan?.id_emprunt === id) setSelectedLoan(null);
    } catch {
      showMessage(`❌ ${t('student.messages.cancelLoanFailed')}`);
    }
  };

  const handleAnnulerReservation = async (id) => {
    if (!window.confirm(t('student.reservations.confirmCancel'))) return;
    try {
      await empruntsAPI.annulerMaReservation(id);
      showMessage(`✅ ${t('student.messages.reservationCancelled')}`);
      loadReservations();
    } catch (err) {
      showMessage(`❌ ${err.response?.data?.message || t('student.messages.genericError')}`);
    }
  };

  const handleReserver = async (id_livre) => {
    try {
      await empruntsAPI.reserver({ id_livre });
      showMessage(`✅ ${t('student.messages.reservationCreated')}`);
      if (activeItem === 'mes-reservations') loadReservations();
      if (activeItem === 'catalogue') loadLivres();
    } catch (err) {
      showMessage(`❌ ${err.response?.data?.message || t('student.messages.genericError')}`);
    }
  };

  const openBookDetails = async (id) => {
    setLoadingBook(true);
    setSelectedBook({ id_ressource: id });
    try {
      const r = await livresAPI.getById(id);
      setSelectedBook(r.data.data);
    } catch {
      showMessage(`❌ ${t('student.messages.loadBookDetailsFailed')}`);
      setSelectedBook(null);
    } finally {
      setLoadingBook(false);
    }
  };

  const handleModalEmprunt = async (id) => {
    setSelectedBook(null);
    await handleEmprunt(id);
  };

  const handleModalReserver = async (id) => {
    setSelectedBook(null);
    await handleReserver(id);
  };

  const resolveDocumentForRead = async (document) => {
    const id = getDocumentReadId(document);
    if (!id || document?.id_ressource) {
      return document;
    }

    const response = await documentsAPI.getById(id);
    const fullDocument = response.data.data || {};
    return {
      ...document,
      ...fullDocument,
      id_ressource: fullDocument.id_ressource || id,
    };
  };

  const handleReadDocument = async (document) => {
    try {
      const resolvedDocument = await resolveDocumentForRead(document);
      const documentId = getDocumentReadId(resolvedDocument);
      const filePath = getDocumentFilePath(resolvedDocument);

      if (documentId) {
        const response = await documentsAPI.streamFile(documentId);
        const blob = new Blob([response.data], {
          type: response.headers['content-type'] || 'application/octet-stream',
        });
        const url = URL.createObjectURL(blob);
        const opened = window.open(url, '_blank');
        if (!opened) {
          showMessage(`❌ ${t('student.messages.allowPopups')}`);
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }

      const url = getDocumentFileUrl(filePath);
      if (!url) {
        showMessage(`❌ ${t('student.messages.openDocumentFailed')}`);
        return;
      }

      const opened = window.open(url, '_blank');
      if (!opened) {
        showMessage(`❌ ${t('student.messages.allowPopups')}`);
      }
    } catch (err) {
      showMessage(err.response?.status === 404
        ? `❌ ${t('student.messages.documentUnavailable')}`
        : `❌ ${t('student.messages.openDocumentFailed')}`);
    }
  };

  const handleDownloadDocument = async (document) => {
    try {
      const response = await documentsAPI.downloadFile(document.id_ressource);
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = getDownloadFileName(document);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (err.response?.status === 404) {
        showMessage(`❌ ${t('student.messages.fileUnavailable')}`);
      } else if (err.response?.status === 403) {
        showMessage(`❌ ${t('student.messages.downloadForbidden')}`);
      } else {
        showMessage(`❌ ${t('student.messages.downloadFailed')}`);
      }
    }
  };

  const handleProfileEditUnavailable = () => {
    showMessage(t('student.messages.profileEditUnavailable'));
  };

  const openPasswordModal = () => {
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setPasswordVisibility({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
    setShowPasswordModal(true);
  };

  const handlePasswordFormChange = (field, value) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setPasswordVisibility(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!passwordForm.currentPassword.trim()) {
      showMessage(`❌ ${t('student.messages.currentPasswordRequired')}`);
      return;
    }
    if (!passwordForm.newPassword.trim()) {
      showMessage(`❌ ${t('student.messages.newPasswordRequired')}`);
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showMessage(`❌ ${t('student.messages.passwordMismatch')}`);
      return;
    }

    setPasswordSaving(true);
    try {
      await authAPI.changePassword(passwordForm);
      showMessage(`✅ ${t('student.messages.passwordChanged')}`);
      setShowPasswordModal(false);
      loadStudentProfile();
    } catch (err) {
      showMessage(`❌ ${err.response?.data?.message || t('student.messages.passwordChangeFailed')}`);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSupportFormChange = (field, value) => {
    setSupportForm(prev => ({ ...prev, [field]: value }));
    if (supportError) setSupportError('');
  };

  const handleSupportSubmit = async (event) => {
    event.preventDefault();
    const sujet = supportForm.sujet.trim();
    const typeProbleme = supportForm.type_probleme.trim();
    const message = supportForm.message.trim();
    const relatedText = supportForm.related_text.trim();

    if (!sujet) {
      setSupportError(t('student.messages.subjectRequired'));
      return;
    }
    if (!typeProbleme) {
      setSupportError(t('student.messages.problemTypeRequired'));
      return;
    }
    if (!message) {
      setSupportError(t('student.messages.messageRequired'));
      return;
    }

    setSupportSubmitting(true);
    try {
      await supportAPI.createSupportTicket({
        sujet,
        type_probleme: typeProbleme,
        message,
        related_text: relatedText || undefined,
      });
      setSupportForm({
        sujet: '',
        type_probleme: '',
        related_text: '',
        message: '',
      });
      setSupportError('');
      showMessage(`✅ ${t('student.messages.supportRequestSent')}`);
      loadSupportTickets();
    } catch (err) {
      setSupportError(err.response?.data?.message || t('student.messages.supportRequestFailed'));
    } finally {
      setSupportSubmitting(false);
    }
  };

  const summaryCards = buildStudentSummaryCards(homeData, t);
  const recentActivities = buildRecentActivity(homeData, t);
  const suggestedResources = buildSuggestedResources(homeData, t);
  const homeAvailability = homeData.availability || {};
  const readingsAvailable = isHomeDataAvailable(homeAvailability, 'lectures');
  const activityUnavailable = ['emprunts', 'reservations', 'lectures']
    .every(key => !isHomeDataAvailable(homeAvailability, key));
  const resourcesUnavailable = ['livres', 'documents']
    .every(key => !isHomeDataAvailable(homeAvailability, key));
  const readingHistoryCount = readingsAvailable ? homeData.lectures.length : null;
  const monthlyLectureCount = readingsAvailable ? getMonthlyLectureCount(homeData.lectures) : null;
  const popularCategories = categories
    .map(category => ({
      id: category.id_categorie,
      label: category.libelle,
      count: getCategoryResourceCount(category),
    }))
    .filter(category => category.count && category.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const popularCategoryTotal = popularCategories.reduce((sum, category) => sum + category.count, 0);
  const typedDocuments = documents.map(document => ({
    ...document,
    documentType: inferDocumentType(document),
    normalizedFormat: (document.format || 'AUTRE').toUpperCase(),
  }));
  const documentTypeCounts = typedDocuments.reduce((acc, document) => {
    acc[document.documentType] = (acc[document.documentType] || 0) + 1;
    return acc;
  }, {});
  const documentCategories = Array.from(new Set(
    typedDocuments.map(document => document.categorie).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  const documentFormats = Array.from(new Set(
    typedDocuments.map(document => document.normalizedFormat).filter(Boolean)
  )).sort((a, b) => {
    const aIndex = DOCUMENT_FORMAT_ORDER.indexOf(a);
    const bIndex = DOCUMENT_FORMAT_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  const filteredDocuments = typedDocuments.filter((document) => {
    const matchesType = gedTypeFilter === 'TOUS' || document.documentType === gedTypeFilter;
    const query = normalizeText(gedSearch.trim());
    const matchesSearch = !query || normalizeText([
      document.titre,
      document.auteur,
      document.categorie,
      document.description,
    ].filter(Boolean).join(' ')).includes(query);
    const matchesCategory = !gedCategoryFilter || document.categorie === gedCategoryFilter;
    const matchesFormat = !gedFormatFilter || document.normalizedFormat === gedFormatFilter;
    return matchesType && matchesSearch && matchesCategory && matchesFormat;
  });
  const documentSummaryCards = [
    { label: t('student.digital.totalDocuments'), value: documentsTotal || documents.length, tone: 'gold' },
    ...DOCUMENT_SUMMARY_TYPES.map(type => ({
      label: t(DOCUMENT_TYPE_META[type].labelKey),
      value: documentTypeCounts[type] || 0,
      tone: type.toLowerCase().replace('_', '-'),
    })),
  ];
  const quickActions = [
    { label: t('student.quickActions.searchBook'),       detail: t('student.quickActions.searchBookDetail'),       target: 'catalogue',        icon: 'search' },
    { label: t('student.quickActions.digitalLibrary'),   detail: t('student.quickActions.digitalLibraryDetail'),   target: 'ged',              icon: 'library' },
    { label: t('student.quickActions.viewLoans'),        detail: t('student.quickActions.viewLoansDetail'),        target: 'mes-emprunts',     icon: 'loan' },
    { label: t('student.quickActions.viewReservations'), detail: t('student.quickActions.viewReservationsDetail'), target: 'mes-reservations', icon: 'reservation' },
  ];

  const profileUser = profileData.user || user || {};
  const profileFullName = [profileUser?.prenom, profileUser?.nom].filter(Boolean).join(' ').trim()
    || getAvailableProfileValue(profileUser, ['nom_complet', 'full_name', 'name']);
  const profileMatricule = getAvailableProfileValue(profileUser, [
    'matricule',
    'numero_etudiant',
    'student_id',
    'id_etudiant',
    'id_user',
  ]);
  const profileAcademic = getAcademicInfo(profileUser);
  const profileCreatedAt = formatProfileDate(profileUser?.date_creation, false, i18n.language);
  const profileMemberSince = profileUser?.date_creation ? profileCreatedAt : null;
  const profileInfoRows = [
    { icon: 'person', label: t('student.profile.rows.fullName'), value: profileFullName || PROFILE_UNAVAILABLE },
    { icon: 'mail', label: t('student.profile.rows.email'), value: profileUser?.email || PROFILE_UNAVAILABLE },
    { icon: 'id', label: t('student.profile.rows.studentId'), value: profileMatricule || PROFILE_UNAVAILABLE, mono: true },
    { icon: 'role', label: t('student.profile.rows.role'), value: getRoleLabel(profileUser?.role, t) },
    { icon: 'calendar', label: t('student.profile.rows.createdAt'), value: profileCreatedAt },
    // Field / Level / Class only appears when the student actually has academic data.
    ...(profileAcademic
      ? [{ icon: 'school', label: t('student.profile.rows.fieldLevelClass'), value: profileAcademic }]
      : []),
  ];
  const profileSecurityRows = [
    { icon: 'password', badgeIcon: 'lock', label: t('student.profile.rows.password'), value: t('student.profile.security2.protected'), tone: 'success' },
    { icon: 'status', badgeIcon: 'check', label: t('student.profile.rows.accountStatus'), value: t('student.profile.security2.active'), tone: 'success' },
    { icon: 'auth', badgeIcon: 'shield', label: t('student.profile.rows.authentication'), value: t('student.profile.security2.secureLogin'), tone: 'success' },
    { icon: 'manage', badgeIcon: 'person', label: t('student.profile.rows.accountManagement'), value: t('student.profile.security2.managedByAdmin'), tone: 'info' },
  ];
  const isSuccessMessage = msg.startsWith('✅') || msg.startsWith('🔖');
  const isErrorMessage = msg.startsWith('❌');
  const messageColor = isSuccessMessage ? 'var(--success)' : isErrorMessage ? 'var(--danger)' : 'var(--gold)';
  const messageBorder = isSuccessMessage
    ? 'rgba(16,212,142,0.4)'
    : isErrorMessage
      ? 'rgba(239,68,68,0.4)'
      : 'rgba(201,168,76,0.45)';
  const messageBg = isSuccessMessage
    ? 'rgba(16,212,142,0.15)'
    : isErrorMessage
      ? 'rgba(239,68,68,0.15)'
      : 'rgba(201,168,76,0.14)';

  return (
    <div className="admin-layout">
      <Sidebar items={SIDEBAR_ITEMS} activeItem={activeItem} onItemClick={setActiveItem} />
      <div className="admin-main">
        <Navbar
          title={t('student.navTitle')}
          notifications={notifications}
          unreadCount={unreadCount}
          onOpenNotifications={loadNotifications}
          onMarkAsRead={handleMarkNotificationRead}
          onMarkAllRead={handleMarkAllNotificationsRead}
          onNotificationClick={handleNotificationClick}
        />
        <div className={`admin-content ${activeItem === 'accueil' ? 'student-home-content' : ''} ${activeItem === 'profil' ? 'student-profile-content' : ''} ${activeItem === 'aide' ? 'student-help-content' : ''}`}>
          {msg && (
            <div
              style={{
                position: 'fixed',
                top: 80,
                right: 24,
                zIndex: 300,
                background: messageBg,
                border: `1px solid ${messageBorder}`,
                color: messageColor,
                borderRadius: 'var(--radius-md)',
                padding: '14px 20px',
                fontSize: '0.9rem',
                fontWeight: 600,
                animation: 'slideLeft 0.3s ease',
                backdropFilter: 'blur(16px)',
                maxWidth: 360,
              }}
            >
              {msg}
            </div>
          )}

          {activeItem === 'accueil' && (
            <div className="student-home-page">
              <section className="student-home-hero">
                <div className="student-home-hero-copy">
                  <div className="student-home-kicker">
                    {t('student.welcome.kicker')}
                    <span className="kicker-spark" aria-hidden="true">✦</span>
                  </div>
                  <h1>{t('student.hello')}, <span>{getStudentName(user, t)}</span></h1>
                  <p>{t('student.welcome.intro')}</p>
                  <p className="student-home-hero-subline">{t('student.welcome.subline')}</p>
                </div>
                <div className="student-home-hero-action">
                  <button className="student-home-primary" type="button" onClick={() => setActiveItem('catalogue')}>
                    <StudentHomeIcon name="search" />
                    {t('student.welcome.searchBook')}
                  </button>
                </div>
                <div className="student-home-hero-visual" aria-hidden="true">
                  {/* Flat academic illustration: stacked books, classical
                      columns, desk lamp, open book and a small plant. */}
                  <div className="student-hero-scene">
                    <span className="hero-art hero-art-shelf hero-art-shelf-1" />
                    <span className="hero-art hero-art-shelf hero-art-shelf-2" />
                    <span className="hero-art hero-art-shelf hero-art-shelf-3" />
                    <div className="hero-art hero-art-column">
                      <span className="hero-art-column-cap" />
                      <span className="hero-art-column-base" />
                    </div>
                    <div className="hero-art hero-art-lamp">
                      <span className="hero-art-lamp-shade" />
                      <span className="hero-art-lamp-arm" />
                      <span className="hero-art-lamp-base" />
                    </div>
                    <div className="hero-art hero-art-openbook">
                      <span className="hero-art-openbook-left" />
                      <span className="hero-art-openbook-right" />
                    </div>
                    <div className="hero-art hero-art-plant">
                      <span className="hero-art-plant-pot" />
                      <span className="hero-art-plant-leaf hero-art-plant-leaf-l" />
                      <span className="hero-art-plant-leaf hero-art-plant-leaf-r" />
                      <span className="hero-art-plant-leaf hero-art-plant-leaf-c" />
                    </div>
                  </div>
                  <i className="student-hero-spark spark-one" />
                  <i className="student-hero-spark spark-two" />
                  <i className="student-hero-spark spark-three" />
                  <i className="student-hero-spark spark-four" />
                  <i className="student-hero-spark spark-five" />
                </div>
              </section>

              {homeLoading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <>
                  <section className="student-summary-grid" aria-label={t('student.home.summaryAria')}>
                    {summaryCards.map(card => (
                      <button
                        key={card.id}
                        type="button"
                        className={`student-summary-card tone-${card.tone}${card.isUnavailable ? ' is-unavailable' : ''}`}
                        onClick={() => setActiveItem(card.target)}
                      >
                        <span className="student-summary-icon">
                          <StudentHomeIcon name={card.icon} />
                        </span>
                        <span className="student-summary-label">{card.label}</span>
                        <strong>{card.value}</strong>
                        <em>{card.hint}</em>
                        <span className="student-summary-link">{card.actionLabel}</span>
                      </button>
                    ))}
                  </section>

                  <div className="student-home-dashboard-grid">
                    <section className="student-home-panel student-actions-panel">
                      <header className="student-panel-header">
                        <h2>{t('student.panels.quickActions')}</h2>
                      </header>
                      <div className="student-action-grid">
                        {quickActions.map(action => (
                          <button
                            key={action.target}
                            type="button"
                            className="student-action-card"
                            onClick={() => setActiveItem(action.target)}
                          >
                            <StudentHomeIcon name={action.icon} />
                            <span>
                              <strong>{action.label}</strong>
                              <em>{action.detail}</em>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="student-home-panel student-activity-panel">
                      <header className="student-panel-header">
                        <h2>{t('student.panels.recentActivity')}</h2>
                        <button type="button" className="student-panel-link" onClick={() => setActiveItem('historique')}>
                          {t('student.panels.viewAll')}
                        </button>
                      </header>
                      {recentActivities.length === 0 ? (
                        <div className="empty-state student-home-empty">
                          <div className="empty-state-icon">📭</div>
                          <div className="empty-state-text">
                            {activityUnavailable ? t('student.panels.activityUnavailable') : t('student.panels.noRecentActivity')}
                          </div>
                        </div>
                      ) : (
                        <div className="student-activity-list">
                          {recentActivities.map(activity => (
                            <article key={activity.id} className={`student-activity-item tone-${activity.tone}`}>
                              <div className="student-activity-icon">
                                <StudentHomeIcon name={activity.icon} />
                              </div>
                              <div className="student-activity-copy">
                                <strong>{activity.title}</strong>
                                <span>{activity.resourceTitle || '-'}</span>
                                {activity.detail && <small>{activity.detail}</small>}
                              </div>
                              <div className="student-activity-meta">
                                {activity.statusLabel && (
                                  <span className={`badge ${activity.statusClass}`}>{activity.statusLabel}</span>
                                )}
                                <time dateTime={activity.date || undefined}>{formatDate(activity.date, false, i18n.language)}</time>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>

                    <aside className="student-home-side-column" aria-label={t('student.home.indicatorsAria')}>
                      <section className="student-home-panel student-progress-panel">
                        <header className="student-panel-header">
                          <h2>{t('student.panels.readingProgress')}</h2>
                        </header>
                        {readingHistoryCount > 0 ? (
                          <>
                            <div className="student-progress-metrics">
                              <div>
                                <strong>{monthlyLectureCount}</strong>
                                <span>{t('student.panels.consultations', { count: monthlyLectureCount })}</span>
                              </div>
                              <div>
                                <strong>{readingHistoryCount}</strong>
                                <span>{t('student.panels.savedConsultations', { count: readingHistoryCount })}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="student-side-link"
                              onClick={() => setActiveItem('historique')}
                            >
                              {t('student.summary.viewHistory')}
                            </button>
                          </>
                        ) : (
                          <div className="student-side-empty">{t('student.panels.progressUnavailable')}</div>
                        )}
                      </section>

                      <section className="student-home-panel student-categories-panel">
                        <header className="student-panel-header">
                          <h2>{t('student.panels.popularCategories')}</h2>
                        </header>
                        {popularCategories.length === 0 ? (
                          <div className="student-side-empty">{t('student.panels.noCategory')}</div>
                        ) : (
                          <div className="student-category-list">
                            {popularCategories.map(category => {
                              const percent = popularCategoryTotal
                                ? Math.round((category.count / popularCategoryTotal) * 100)
                                : 0;
                              return (
                                <div className="student-category-row" key={category.id || category.label}>
                                  <div>
                                    <span>{category.label}</span>
                                    <strong>{category.count}</strong>
                                  </div>
                                  <div className="student-category-bar">
                                    <span style={{ width: `${percent}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>

                    </aside>
                  </div>

                  <section className="student-home-panel student-resources-panel">
                    <header className="student-panel-header">
                      <h2>{t('student.panels.resourcesToDiscover')}</h2>
                      <button type="button" className="student-panel-link" onClick={() => setActiveItem('catalogue')}>
                        {t('student.panels.viewMore')}
                      </button>
                    </header>
                    {suggestedResources.length === 0 ? (
                      <div className="empty-state student-home-empty">
                        <div className="empty-state-icon">✨</div>
                        <div className="empty-state-text">
                          {resourcesUnavailable
                            ? t('student.panels.resourcesUnavailable')
                            : t('student.panels.noResources')}
                        </div>
                      </div>
                    ) : (
                      <div className="student-resource-grid">
                        {suggestedResources.map(resource => {
                          const resourceMeta = resource.resourceKind === 'document'
                            ? (resource.auteur || getUploaderName(resource))
                            : resource.auteur;

                          return (
                            <article
                              key={`${resource.resourceType}-${resource.id_ressource}`}
                              className={`student-resource-card type-${resource.resourceKind}`}
                            >
                              <div className="student-resource-cover">
                                {resource.resourceKind === 'book' && resource.image_couverture ? (
                                  <img src={resolveAssetUrl(resource.image_couverture)} alt={resource.titre} />
                                ) : (
                                  <StudentHomeIcon name={resource.resourceKind === 'book' ? 'loan' : 'document'} />
                                )}
                              </div>
                              <div className="student-resource-content">
                                <div className="student-resource-badges">
                                  <span className="badge badge-gold">{resource.resourceType}</span>
                                  {resource.categorie && (
                                    <span className="student-resource-category">{resource.categorie}</span>
                                  )}
                                </div>
                                <strong>{resource.titre}</strong>
                                {resourceMeta && <em>{resourceMeta}</em>}
                                {resource.resourceKind === 'book' ? (
                                  <button
                                    type="button"
                                    className="student-resource-action"
                                    onClick={() => openBookDetails(resource.id_ressource)}
                                  >
                                    {t('student.actions.viewDetails')}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="student-resource-action"
                                    onClick={() => handleReadDocument(resource)}
                                  >
                                    {t('student.actions.open')}
                                  </button>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {activeItem === 'aide' && (
            <section className="student-help-page" aria-labelledby="student-help-title">
              <section className="student-help-hero">
                <div className="student-help-hero-icon" aria-hidden="true">🎧</div>
                <div className="student-help-hero-copy">
                  <h1 id="student-help-title">{t('student.help.title')}</h1>
                  <p>{t('student.help.intro')}</p>
                  <p>{t('student.help.teamHere')}</p>
                </div>
                <div className="student-help-hero-art" aria-hidden="true">
                  <div className="help-chat-bubble bubble-one" />
                  <div className="help-chat-bubble bubble-two" />
                  <div className="help-headset">
                    <span className="help-headset-band" />
                    <span className="help-headset-ear left" />
                    <span className="help-headset-ear right" />
                    <span className="help-headset-mic" />
                  </div>
                  <span className="help-hero-spark spark-one" />
                  <span className="help-hero-spark spark-two" />
                </div>
              </section>

              <div className="student-help-grid">
                <section className="student-help-card student-help-form-card">
                  <header className="student-help-card-header">
                    <span className="student-help-header-icon" aria-hidden="true">✈</span>
                    <h2>{t('student.help.sendRequest')}</h2>
                  </header>

                  <form className="student-help-form" onSubmit={handleSupportSubmit} noValidate>
                    <label>
                      <span>{t('student.help.subject')}</span>
                      <input
                        type="text"
                        value={supportForm.sujet}
                        onChange={e => handleSupportFormChange('sujet', e.target.value)}
                        placeholder={t('student.help.subjectPlaceholder')}
                      />
                    </label>

                    <label>
                      <span>{t('student.help.type')}</span>
                      <select
                        value={supportForm.type_probleme}
                        onChange={e => handleSupportFormChange('type_probleme', e.target.value)}
                      >
                        <option value="">{t('student.help.typePlaceholder')}</option>
                        {SUPPORT_PROBLEM_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{t(type.i18nKey)}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>{t('student.help.related')}</span>
                      <input
                        type="text"
                        value={supportForm.related_text}
                        onChange={e => handleSupportFormChange('related_text', e.target.value)}
                        placeholder={t('student.help.relatedPlaceholder')}
                      />
                    </label>

                    <label>
                      <span>{t('student.help.message')}</span>
                      <textarea
                        value={supportForm.message}
                        onChange={e => handleSupportFormChange('message', e.target.value)}
                        placeholder={t('student.help.messagePlaceholder')}
                        rows={5}
                      />
                    </label>

                    {supportError && (
                      <div className="student-help-error" role="alert">{supportError}</div>
                    )}

                    <button className="student-help-submit" type="submit" disabled={supportSubmitting}>
                      <span aria-hidden="true">✈</span>
                      {supportSubmitting ? t('student.help.submitting') : t('student.help.submit')}
                    </button>
                  </form>
                </section>

                <aside className="student-help-side">
                  <section className="student-help-card student-help-info-card">
                    <div>
                      <header className="student-help-card-header">
                        <span className="student-help-header-icon" aria-hidden="true">i</span>
                        <h2>{t('student.help.usefulInfo')}</h2>
                      </header>
                      <p>{t('student.help.usefulInfoText')}</p>
                    </div>
                  </section>

                  <section className="student-help-card student-help-faq-card">
                    <header className="student-help-card-header">
                      <span className="student-help-header-icon" aria-hidden="true">?</span>
                      <h2>{t('student.help.faqTitle')}</h2>
                    </header>
                    <div className="student-help-faq-list">
                      {SUPPORT_FAQS.map((faq, index) => {
                        const isOpen = openSupportFaq === index;
                        return (
                          <div key={faq.questionKey} className={`student-help-faq-item${isOpen ? ' is-open' : ''}`}>
                            <button
                              type="button"
                              className="student-help-faq-row"
                              aria-expanded={isOpen}
                              onClick={() => setOpenSupportFaq(isOpen ? null : index)}
                            >
                              <span aria-hidden="true">□</span>
                              <strong>{t(faq.questionKey)}</strong>
                              <em className="student-help-faq-arrow" aria-hidden="true">›</em>
                            </button>
                            <div className="student-help-faq-answer">
                              <p>{t(faq.answerKey)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" className="student-help-faq-more">
                      {t('student.help.faqMore')}
                      <span aria-hidden="true">→</span>
                    </button>
                  </section>
                </aside>
              </div>

              <section className="student-help-card student-help-tickets-card">
                <header className="student-help-tickets-header">
                  <div>
                    <span className="student-help-header-icon" aria-hidden="true">▣</span>
                    <div>
                      <h2>{t('student.help.myRequests')}</h2>
                      <p>{t('student.help.myRequestsSub')}</p>
                    </div>
                  </div>
                </header>

                {supportLoading ? (
                  <div className="loading-spinner"><div className="spinner" /></div>
                ) : supportTickets.length === 0 ? (
                  <div className="student-help-empty">
                    <span aria-hidden="true">▣</span>
                    {t('student.help.empty')}
                  </div>
                ) : (
                  <div className="student-help-table-wrap">
                    <table className="student-help-table">
                      <thead>
                        <tr>
                          <th>{t('student.help.tableSubject')}</th>
                          <th>{t('student.help.tableType')}</th>
                          <th>{t('student.help.tableStatus')}</th>
                          <th>{t('student.help.tableDate')}</th>
                          <th>{t('student.help.tableResponse')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supportTickets.map(ticket => {
                          const statusMeta = SUPPORT_STATUS_META[ticket.statut] || SUPPORT_STATUS_META.EN_ATTENTE;
                          return (
                            <tr key={ticket.id_ticket}>
                              <td>
                                <span className="student-help-ticket-icon" aria-hidden="true">▣</span>
                                <strong>{ticket.sujet}</strong>
                              </td>
                              <td>{getSupportProblemTypeLabel(ticket.type_probleme, t)}</td>
                              <td>
                                <span className={`student-help-status ${statusMeta.className}`}>
                                  {t(statusMeta.i18nKey)}
                                </span>
                              </td>
                              <td>{formatDate(ticket.date_creation, true, i18n.language)}</td>
                              <td>
                                <span className="student-help-response" title={ticket.reponse_admin || ''}>
                                  {ticket.reponse_admin || '–'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </section>
          )}

          {activeItem === 'catalogue' && (() => {
            const focusSearch = () => {
              const el = searchInputRef.current;
              if (!el) return;
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => el.focus(), 250);
            };
            const resetFilters = () => {
              setSearch('');
              setFilterCat('');
              setFilterAvail('tous');
              setSortBy('pertinence');
            };
            // Real per-category counts derived from the loaded physical-book dataset.
            const categoryCountMap = {};
            for (const b of livres) {
              const key = normalizeText(b.categorie);
              if (key) categoryCountMap[key] = (categoryCountMap[key] || 0) + 1;
            }
            const catCount = (c) => categoryCountMap[normalizeText(c.libelle)] || 0;
            const visibleCats = showAllCategories ? categories : categories.slice(0, 6);

            // ---- Client-side pipeline: filter → sort → paginate ----
            const q = normalizeText(search);
            const qIsbn = q.replace(/[-\s]/g, '');
            const catId = filterCat ? String(filterCat) : '';
            const selectedCat = catId
              ? categories.find(c => String(c.id_categorie) === catId)
              : null;
            const selectedCatLibelle = normalizeText(selectedCat?.libelle || '');

            const matchesSearch = (b) => {
              if (!q) return true;
              const isbnNorm = normalizeText(b.isbn).replace(/[-\s]/g, '');
              return (
                normalizeText(b.titre).includes(q) ||
                normalizeText(b.auteur).includes(q) ||
                isbnNorm.includes(qIsbn) ||
                normalizeText(b.categorie).includes(q)
              );
            };
            const matchesCat = (b) => {
              if (!catId) return true;
              return normalizeText(b.categorie) === selectedCatLibelle;
            };
            const matchesAvail = (b) => {
              const s = Number(b.stock_disponible) || 0;
              if (filterAvail === 'dispo')   return s > 0;
              if (filterAvail === 'indispo') return s <= 0;
              return true;
            };

            let filtered = livres.filter(b => matchesSearch(b) && matchesCat(b) && matchesAvail(b));

            const collator = new Intl.Collator(i18n.language, { sensitivity: 'base' });
            if (sortBy === 'titre') {
              filtered = [...filtered].sort((a, b) => collator.compare(a.titre || '', b.titre || ''));
            } else if (sortBy === 'auteur') {
              filtered = [...filtered].sort((a, b) => collator.compare(a.auteur || '', b.auteur || ''));
            } else if (sortBy === 'stock') {
              filtered = [...filtered].sort((a, b) => (Number(b.stock_disponible) || 0) - (Number(a.stock_disponible) || 0));
            }
            // 'pertinence' and 'recent': dataset is already date_creation DESC from the API call.

            const filteredCount = filtered.length;
            const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
            const safePage = Math.min(Math.max(1, page), totalPages);
            const firstIdx = filteredCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
            const lastIdx  = Math.min(safePage * PAGE_SIZE, filteredCount);
            const displayedLivres = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
            return (
            <section className="cat-page">
              <div className="cat-hero">
                <div className="cat-hero-left">
                  <span className="cat-hero-eyebrow">{t('student.catalog.eyebrow')}</span>
                  <h1 className="cat-hero-title">{t('student.catalog.title')}</h1>
                  <p className="cat-hero-sub">{t('student.catalog.availableBooksCount', { count: availCounts.all })}</p>
                </div>
                <div className="cat-hero-art" aria-hidden="true">
                  <span className="cat-hero-art-book b1" />
                  <span className="cat-hero-art-book b2" />
                  <span className="cat-hero-art-book b3" />
                </div>
                <button className="cat-hero-cta" onClick={focusSearch}>
                  <span className="cat-hero-cta-icon">🔍</span> {t('student.catalog.searchBook')}
                </button>
              </div>

              <div className="cat-toolbar">
                <div className="cat-search">
                  <span className="cat-search-icon" aria-hidden="true">🔍</span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={t('student.catalog.searchPlaceholder')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="cat-sort"
                  value={filterCat}
                  onChange={e => setFilterCat(e.target.value)}
                >
                  <option value="">{t('student.catalog.allCategories')}</option>
                  {categories.map(c => (
                    <option key={c.id_categorie} value={c.id_categorie}>{c.libelle}</option>
                  ))}
                </select>
                <select
                  className="cat-sort"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                >
                  <option value="pertinence">{t('student.catalog.sortByRelevance')}</option>
                  <option value="recent">{t('student.catalog.sortRecent')}</option>
                  <option value="titre">{t('student.catalog.sortTitle')}</option>
                  <option value="auteur">{t('student.catalog.sortAuthor')}</option>
                  <option value="stock">{t('student.catalog.sortStock')}</option>
                </select>
              </div>

              <div className="cat-layout">
                <aside className="cat-sidebar">
                  <div className="cat-sidebar-header">
                    <span>≡ {t('student.catalog.filters')}</span>
                  </div>

                  <div className="cat-filter-group">
                    <div className="cat-filter-group-title">{t('student.catalog.availability')}</div>
                    {[
                      { value: 'tous',    label: t('student.catalog.all'), count: availCounts.all, dot: 'gold' },
                      { value: 'dispo',   label: t('student.statusBadges.available'), count: availCounts.dispo, dot: 'green' },
                      { value: 'indispo', label: t('student.statusBadges.unavailable'), count: availCounts.indispo, dot: 'red' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`cat-radio-row ${filterAvail === opt.value ? 'active' : ''}`}
                        onClick={() => setFilterAvail(opt.value)}
                      >
                        <span className={`cat-radio-dot ${opt.dot}`} />
                        <span className="cat-radio-label">{opt.label}</span>
                        <span className="cat-count-badge">{opt.count}</span>
                      </button>
                    ))}
                  </div>

                  <div className="cat-filter-group">
                    <div className="cat-filter-group-title">{t('student.catalog.categories')}</div>
                    <div className="cat-cat-list">
                      <button
                        type="button"
                        className={`cat-cat-row ${!filterCat ? 'active' : ''}`}
                        onClick={() => setFilterCat('')}
                      >
                        <span className="cat-cat-libelle">{t('student.catalog.allCategories')}</span>
                        <span className="cat-count-badge">{availCounts.all}</span>
                      </button>
                      {visibleCats.map(c => (
                        <button
                          key={c.id_categorie}
                          type="button"
                          className={`cat-cat-row ${filterCat === String(c.id_categorie) ? 'active' : ''}`}
                          onClick={() => setFilterCat(String(c.id_categorie))}
                        >
                          <span className="cat-cat-libelle">{c.libelle}</span>
                          <span className="cat-count-badge">{catCount(c)}</span>
                        </button>
                      ))}
                      {categories.length > 6 && (
                        <button
                          type="button"
                          className="cat-voir-plus"
                          onClick={() => setShowAllCategories(v => !v)}
                        >
                          {showAllCategories ? t('student.catalog.showLess') : t('student.catalog.showMore')}
                        </button>
                      )}
                    </div>
                  </div>

                  <button className="cat-reset-btn" type="button" onClick={resetFilters}>
                    {t('student.catalog.resetFilters')} ⟳
                  </button>
                </aside>

                <main className="cat-main">
                  {loading ? (
                    <div className="loading-spinner"><div className="spinner" /></div>
                  ) : (
                    <>
                      {displayedLivres.length === 0 ? (
                        <div className="cat-empty">
                          <div className="empty-state-icon">🔍</div>
                          <div className="empty-state-text">
                            {search.trim()
                              ? t('student.catalog.emptySearch', { query: search })
                              : t('student.catalog.emptyFilters')}
                          </div>
                        </div>
                      ) : (
                        <div className="cat-grid">
                          {displayedLivres.map((l, i) => {
                            const ph = getCoverPlaceholder(l);
                            const stock = Number(l.stock_disponible) || 0;
                            const canRead = isReadableOnline(l);
                            const physical = hasPhysicalCopies(l);
                            return (
                              <article
                                key={l.id_ressource}
                                className="cat-card"
                                style={{ animationDelay: `${(i % 12) * 0.04}s` }}
                                onClick={() => openBookDetails(l.id_ressource)}
                              >
                                <div className="cat-card-cover">
                                  {l.image_couverture ? (
                                    <img
                                      src={resolveAssetUrl(l.image_couverture)}
                                      alt={l.titre}
                                      className="cat-card-cover-img"
                                      onError={e => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <div
                                      className="cat-cover-placeholder"
                                      style={{ background: ph.background, '--accent': ph.accent }}
                                    >
                                      <span className="cat-cover-spine" />
                                      <span className="cat-cover-initials">{ph.initials}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="cat-card-body">
                                  {l.categorie && (
                                    <span className="cat-card-chip">{l.categorie}</span>
                                  )}
                                  <h3 className="cat-card-title">{l.titre}</h3>
                                  <p className="cat-card-author">{l.auteur || t('student.common.unknownAuthor')}</p>
                                  {physical && (stock > 0 ? (
                                    <span className="cat-card-badge available">
                                      {t('student.catalog.availableCountShort', { count: stock })}
                                    </span>
                                  ) : (
                                    <span className="cat-card-badge unavailable">{t('student.statusBadges.unavailable')}</span>
                                  ))}
                                  <div className="cat-card-actions">
                                    {canRead && (
                                      <button
                                        type="button"
                                        className="cat-card-read"
                                        onClick={e => { e.stopPropagation(); handleReadDocument(l); }}
                                      >
                                        📖 {t('student.digital.read')}
                                      </button>
                                    )}
                                    {physical && (stock > 0 ? (
                                      <button
                                        className="cat-card-primary"
                                        onClick={e => { e.stopPropagation(); handleEmprunt(l.id_ressource); }}
                                      >
                                        {t('student.catalog.borrow')}
                                      </button>
                                    ) : (
                                      <button
                                        className="cat-card-primary reserve"
                                        onClick={e => { e.stopPropagation(); handleReserver(l.id_ressource); }}
                                      >
                                        {t('student.catalog.reserve')}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      className="cat-card-details"
                                      onClick={e => { e.stopPropagation(); openBookDetails(l.id_ressource); }}
                                    >
                                      {t('student.actions.viewDetails')} →
                                    </button>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}

                      <div className="cat-pagination-row">
                        <span className="cat-result-count">
                          {filteredCount > 0
                            ? t('student.catalog.showing', { from: firstIdx, to: lastIdx, total: filteredCount })
                            : t('student.catalog.zeroBooks')}
                        </span>
                        <Pagination
                          page={safePage}
                          totalPages={totalPages}
                          total={filteredCount}
                          onChange={(p) => {
                            setPage(p);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        />
                      </div>
                    </>
                  )}
                </main>
              </div>
            </section>
            );
          })()}

          {activeItem === 'ged' && (() => {
            // ---- Sort + paginate the pre-filtered list ----
            const collator = new Intl.Collator(i18n.language, { sensitivity: 'base' });
            let sortedDocs = [...filteredDocuments];
            if (gedSort === 'titre') {
              sortedDocs.sort((a, b) => collator.compare(a.titre || '', b.titre || ''));
            } else if (gedSort === 'taille') {
              sortedDocs.sort((a, b) => (Number(b.taille_ko) || 0) - (Number(a.taille_ko) || 0));
            } else if (gedSort === 'views') {
              sortedDocs.sort((a, b) => (Number(b.nb_consultations) || 0) - (Number(a.nb_consultations) || 0));
            } else {
              sortedDocs.sort((a, b) => new Date(b.date_creation || 0) - new Date(a.date_creation || 0));
            }
            const filteredCount = sortedDocs.length;
            const totalPages = Math.max(1, Math.ceil(filteredCount / GED_PAGE_SIZE));
            const safePage = Math.min(Math.max(1, gedPage), totalPages);
            const firstIdx = filteredCount === 0 ? 0 : (safePage - 1) * GED_PAGE_SIZE + 1;
            const lastIdx  = Math.min(safePage * GED_PAGE_SIZE, filteredCount);
            const pageDocs = sortedDocs.slice((safePage - 1) * GED_PAGE_SIZE, safePage * GED_PAGE_SIZE);

            // ---- Right widgets data (computed from full dataset) ----
            const totalDocs = typedDocuments.length;
            const formatCounts = {};
            for (const d of typedDocuments) {
              const k = d.normalizedFormat || 'AUTRE';
              formatCounts[k] = (formatCounts[k] || 0) + 1;
            }
            const formatTotal = totalDocs || 1;
            const formatList = Object.keys(formatCounts)
              .sort((a, b) => formatCounts[b] - formatCounts[a])
              .map(fmt => ({
                fmt,
                count: formatCounts[fmt],
                color: FORMAT_COLORS[fmt] || FORMAT_COLORS.AUTRE,
                pct: Math.round((formatCounts[fmt] / formatTotal) * 100),
              }));
            let donutAcc = 0;
            const donutStops = formatList.map(f => {
              const start = (donutAcc / formatTotal) * 360;
              donutAcc += f.count;
              const end = (donutAcc / formatTotal) * 360;
              return `${f.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
            }).join(', ');
            const donutBg = donutStops
              ? `conic-gradient(${donutStops})`
              : 'conic-gradient(var(--glass-border) 0deg 360deg)';

            const recentDocs = [...typedDocuments]
              .sort((a, b) => new Date(b.date_creation || 0) - new Date(a.date_creation || 0))
              .slice(0, 5);

            // ---- Stat icons + tones ----
            const STAT_ICONS = {
              gold: '📑',
              cours: '📘',
              'tp-td': '🧪',
              examen: '📝',
              corrige: '✅',
              video: '▶',
            };

            return (
            <section className="ged-page">
              {/* HERO */}
              <div className="ged-hero">
                <div className="ged-hero-left">
                  <h1 className="ged-hero-title">{t('student.digital.title')}</h1>
                  <p className="ged-hero-sub">
                    {t('student.digital.intro')}
                  </p>
                </div>
                <div className="ged-hero-art" aria-hidden="true">
                  <span className="ged-hero-art-doc d1" />
                  <span className="ged-hero-art-doc d2" />
                  <span className="ged-hero-art-doc d3" />
                </div>
                <div className="ged-hero-count">
                  <span className="ged-hero-count-icon">📄</span>
                  <div className="ged-hero-count-info">
                    <strong>{totalDocs}</strong>
                    <span>{t('student.digital.availableDocumentsCount', { count: totalDocs })}</span>
                  </div>
                </div>
              </div>

              {/* STAT CARDS */}
              <div className="ged-stats-row">
                {documentSummaryCards.map(card => (
                  <div key={card.label} className={`ged-stat-card tone-${card.tone}`}>
                    <span className="ged-stat-icon">{STAT_ICONS[card.tone] || '📄'}</span>
                    <div className="ged-stat-info">
                      <span className="ged-stat-label">{card.label}</span>
                      <strong className="ged-stat-value">{card.value}</strong>
                    </div>
                  </div>
                ))}
              </div>

              {/* TYPE TABS */}
              <div className="ged-tabs" role="tablist" aria-label={t('student.digital.typesAria')}>
                {DOCUMENT_TYPE_TABS.map(type => {
                  const count = type === 'TOUS' ? totalDocs : (documentTypeCounts[type] || 0);
                  const active = gedTypeFilter === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`ged-tab ${active ? 'active' : ''}`}
                      onClick={() => setGedTypeFilter(type)}
                    >
                      <span className="ged-tab-label">{t(DOCUMENT_TYPE_META[type].labelKey)}</span>
                      <span className="ged-tab-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* TOOLBAR */}
              <div className="ged-toolbar">
                <div className="ged-search">
                  <span className="ged-search-icon" aria-hidden="true">🔍</span>
                  <input
                    type="text"
                    placeholder={t('student.digital.searchPlaceholder')}
                    value={gedSearch}
                    onChange={e => setGedSearch(e.target.value)}
                  />
                </div>
                <select
                  className="ged-select"
                  value={gedCategoryFilter}
                  onChange={e => setGedCategoryFilter(e.target.value)}
                  disabled={documentCategories.length === 0}
                >
                  <option value="">{t('student.digital.allCategories')}</option>
                  {documentCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select
                  className="ged-select"
                  value={gedFormatFilter}
                  onChange={e => setGedFormatFilter(e.target.value)}
                  disabled={documentFormats.length === 0}
                >
                  <option value="">{t('student.digital.allFormats')}</option>
                  {documentFormats.map(format => (
                    <option key={format} value={format}>{format}</option>
                  ))}
                </select>
                <select
                  className="ged-select"
                  value={gedSort}
                  onChange={e => setGedSort(e.target.value)}
                >
                  <option value="recent">{t('student.digital.sortRecent')}</option>
                  <option value="titre">{t('student.digital.sortTitle')}</option>
                  <option value="taille">{t('student.digital.size')}</option>
                  <option value="views">{t('student.digital.views')}</option>
                </select>
              </div>

              {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <div className="ged-layout">
                  {/* MAIN GRID */}
                  <main className="ged-main">
                    <div className="ged-results-meta">
                      {filteredCount > 0
                        ? t('student.digital.resultsFound', { count: filteredCount })
                        : t('student.digital.noResults')}
                    </div>

                    {filteredCount === 0 ? (
                      <div className="ged-empty">
                        <div className="empty-state-icon">🔎</div>
                        <div className="empty-state-text">
                          {gedSearch.trim()
                            ? t('student.digital.emptySearch', { query: gedSearch })
                            : t('student.digital.emptyFilters')}
                        </div>
                      </div>
                    ) : (
                      <div className="ged-grid">
                        {pageDocs.map((document, i) => {
                          const fmt = document.normalizedFormat || 'AUTRE';
                          const fmtColor = FORMAT_COLORS[fmt] || FORMAT_COLORS.AUTRE;
                          const uploader = getUploaderName(document);
                          const author = getDocumentAuthor(document, t);
                          return (
                            <article
                              key={document.id_ressource}
                              className="ged-card"
                              style={{ animationDelay: `${Math.min(i, 9) * 0.04}s` }}
                            >
                              <div className="ged-card-top">
                                <span className={`ged-type-badge type-${document.documentType.toLowerCase()}`}>
                                  {t(DOCUMENT_TYPE_META[document.documentType].shortLabelKey)}
                                </span>
                                <span
                                  className="ged-format-badge"
                                  style={{ '--fmt-color': fmtColor }}
                                >
                                  <span className="ged-format-dot" />
                                  {fmt}
                                </span>
                              </div>

                              <h3 className="ged-card-title">{document.titre}</h3>

                              <div className="ged-card-meta">
                                <span className="ged-card-meta-row">
                                  <span aria-hidden="true">👤</span> {author}
                                </span>
                                {document.categorie && (
                                  <span className="ged-card-meta-row">
                                    <span aria-hidden="true">🏷</span> {document.categorie}
                                  </span>
                                )}
                              </div>

                              <div className="ged-card-stats">
                                <span>{formatFileSize(document.taille_ko, t)}</span>
                                <span className="ged-card-stat-sep">·</span>
                                <span>
                                  👁 {t('student.digital.viewCount', { count: Number(document.nb_consultations) || 0 })}
                                </span>
                              </div>

                              <div className="ged-card-actions">
                                <button
                                  type="button"
                                  className="ged-btn ged-btn-read"
                                  onClick={() => handleReadDocument(document)}
                                >
                                  📖 {t('student.digital.read')}
                                </button>
                                {document.est_telechargeable ? (
                                  <button
                                    type="button"
                                    className="ged-btn ged-btn-dl"
                                    onClick={() => handleDownloadDocument(document)}
                                  >
                                    ⬇ {t('student.actions.download')}
                                  </button>
                                ) : (
                                  <span className="ged-btn-disabled" title={t('student.digital.notDownloadable')}>
                                    🔒 {t('student.digital.notDownloadable')}
                                  </span>
                                )}
                              </div>

                              {uploader && uploader !== author && (
                                <div className="ged-card-uploader">{t('student.digital.addedBy', { name: uploader })}</div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {filteredCount > 0 && (
                      <div className="ged-pagination-row">
                        <span className="ged-result-count">
                          {t('student.digital.showing', { from: firstIdx, to: lastIdx, total: filteredCount })}
                        </span>
                        <Pagination
                          page={safePage}
                          totalPages={totalPages}
                          total={filteredCount}
                          itemLabelKey="student.digital.documentCount"
                          onChange={(p) => {
                            setGedPage(p);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        />
                      </div>
                    )}
                  </main>

                  {/* RIGHT WIDGETS */}
                  <aside className="ged-sidebar">
                    {/* Formats populaires */}
                    <section className="ged-widget">
                      <div className="ged-widget-header">
                        <h3 className="ged-widget-title">{t('student.digital.popularFormats')}</h3>
                      </div>
                      {formatList.length === 0 ? (
                        <div className="ged-widget-empty">{t('student.digital.noFormat')}</div>
                      ) : (
                        <div className="ged-donut-row">
                          <div className="ged-donut" style={{ background: donutBg }}>
                            <div className="ged-donut-hole">
                              <strong>{totalDocs}</strong>
                              <span>{t('student.digital.docsShort')}</span>
                            </div>
                          </div>
                          <ul className="ged-donut-legend">
                            {formatList.slice(0, 5).map(f => (
                              <li key={f.fmt}>
                                <span className="ged-legend-dot" style={{ background: f.color }} />
                                <span className="ged-legend-label">{f.fmt}</span>
                                <span className="ged-legend-pct">{f.pct}%</span>
                                <span className="ged-legend-count">({f.count})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>

                    {/* Documents récents */}
                    <section className="ged-widget">
                      <div className="ged-widget-header">
                        <h3 className="ged-widget-title">{t('student.digital.recentDocuments')}</h3>
                      </div>
                      {recentDocs.length === 0 ? (
                        <div className="ged-widget-empty">{t('student.digital.noRecentDocuments')}</div>
                      ) : (
                        <ul className="ged-recent-list">
                          {recentDocs.map(d => {
                            const fmt = d.normalizedFormat || 'AUTRE';
                            const fmtColor = FORMAT_COLORS[fmt] || FORMAT_COLORS.AUTRE;
                            return (
                              <li key={d.id_ressource} className="ged-recent-item">
                                <span
                                  className="ged-recent-icon"
                                  style={{ '--fmt-color': fmtColor }}
                                  aria-hidden="true"
                                >
                                  {fmt}
                                </span>
                                <div className="ged-recent-info">
                                  <button
                                    type="button"
                                    className="ged-recent-title"
                                    onClick={() => handleReadDocument(d)}
                                    title={d.titre}
                                  >
                                    {d.titre}
                                  </button>
                                  <span className="ged-recent-sub">
                                    {[getUploaderName(d) || d.auteur, d.categorie].filter(Boolean).join(' · ')}
                                  </span>
                                  <span className="ged-recent-meta">
                                    {formatFileSize(d.taille_ko, t)}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    {/* Besoin d'aide */}
                    <section className="ged-widget ged-help-card">
                      <span className="ged-help-icon" aria-hidden="true">💡</span>
                      <h3 className="ged-widget-title">{t('student.digital.helpTitle')}</h3>
                      <p className="ged-help-text">
                        {t('student.digital.helpText')}
                      </p>
                      <button
                        type="button"
                        className="ged-help-btn"
                        onClick={() => setActiveItem('profil')}
                      >
                        {t('student.help.title')} →
                      </button>
                    </section>
                  </aside>
                </div>
              )}
            </section>
            );
          })()}

          {activeItem === 'mes-emprunts' && (() => {
            // ---- Stats from full dataset ----
            const stats = { actifs: 0, attente: 0, retournes: 0, refuses: 0 };
            for (const e of emprunts) {
              if (e.statut === 'EN_COURS' || e.statut === 'EN_RETARD') stats.actifs++;
              else if (e.statut === 'EN_ATTENTE') stats.attente++;
              else if (e.statut === 'RETOURNE') stats.retournes++;
              else if (e.statut === 'REFUSE') stats.refuses++;
            }

            // ---- Filter ----
            const q = normalizeText(loanSearch);
            const filtered = emprunts.filter((e) => {
              if (loanStatusFilter && e.statut !== loanStatusFilter) return false;
              if (!q) return true;
              const isbnNorm = normalizeText(e.isbn).replace(/[-\s]/g, '');
              const qIsbn = q.replace(/[-\s]/g, '');
              return (
                normalizeText(e.titre).includes(q) ||
                normalizeText(e.auteur).includes(q) ||
                normalizeText(e.categorie).includes(q) ||
                isbnNorm.includes(qIsbn) ||
                normalizeText(formatLoanStatus(e.statut, t)).includes(q) ||
                String(e.id_emprunt).includes(q)
              );
            });

            // ---- Sort (most recent request/loan first) ----
            const sorted = [...filtered].sort((a, b) => {
              const da = new Date(getLoanRequestDate(a) || 0).getTime();
              const db = new Date(getLoanRequestDate(b) || 0).getTime();
              return db - da;
            });

            // ---- Paginate ----
            const filteredCount = sorted.length;
            const totalPages = Math.max(1, Math.ceil(filteredCount / LOAN_PAGE_SIZE));
            const safePage = Math.min(Math.max(1, loanPage), totalPages);
            const firstIdx = filteredCount === 0 ? 0 : (safePage - 1) * LOAN_PAGE_SIZE + 1;
            const lastIdx  = Math.min(safePage * LOAN_PAGE_SIZE, filteredCount);
            const pageRows = sorted.slice((safePage - 1) * LOAN_PAGE_SIZE, safePage * LOAN_PAGE_SIZE);

            const resetLoanFilters = () => {
              setLoanSearch('');
              setLoanStatusFilter('');
            };

            const statCards = [
              { key: 'actifs',    label: t('student.loans.activeLoans'), value: stats.actifs,    tone: 'active',    icon: '📚', sub: t('student.loans.ongoingLoansSub') },
              { key: 'attente',   label: t('student.statusBadges.pending'), value: stats.attente,   tone: 'pending',   icon: '⏳', sub: t('student.loans.pendingRequestsSub') },
              { key: 'retournes', label: t('student.loans.returnedLoans'), value: stats.retournes, tone: 'returned',  icon: '✓',  sub: t('student.loans.returnedLoansSub') },
              { key: 'refuses',   label: t('student.statusBadges.rejectedMasculine'), value: stats.refuses,   tone: 'refused',   icon: '✕',  sub: t('student.loans.rejectedRequestsSub') },
            ];

            return (
            <section className="me-page">
              {/* HERO HEADER */}
              <div className="me-header">
                <div className="me-header-icon" aria-hidden="true">📚</div>
                <div className="me-header-text">
                  <h1 className="me-header-title">{t('student.loans.title')}</h1>
                  <p className="me-header-sub">
                    {t('student.loans.intro')}
                  </p>
                </div>
              </div>

              {/* STAT CARDS */}
              <div className="me-stats-row">
                {statCards.map(c => (
                  <div key={c.key} className={`me-stat-card tone-${c.tone}`}>
                    <span className="me-stat-icon">{c.icon}</span>
                    <div className="me-stat-info">
                      <span className="me-stat-label">{c.label}</span>
                      <strong className="me-stat-value">{c.value}</strong>
                      <span className="me-stat-sub">{c.sub}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* TOOLBAR */}
              <div className="me-toolbar">
                <div className="me-search">
                  <span className="me-search-icon" aria-hidden="true">🔍</span>
                  <input
                    type="text"
                    placeholder={t('student.loans.searchPlaceholder')}
                    value={loanSearch}
                    onChange={e => setLoanSearch(e.target.value)}
                  />
                </div>
                <select
                  className="me-select"
                  value={loanStatusFilter}
                  onChange={e => setLoanStatusFilter(e.target.value)}
                >
                  {LOAN_STATUS_OPTIONS.map(statut => (
                    <option key={statut || 'TOUS'} value={statut}>
                      {statut ? formatLoanStatus(statut, t) : t('student.loans.allStatuses')}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="me-reset-btn"
                  onClick={resetLoanFilters}
                >
                  ⟳ {t('student.actions.reset')}
                </button>
              </div>

              {/* LIST */}
              {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : emprunts.length === 0 ? (
                <div className="me-empty">
                  <div className="empty-state-icon">📚</div>
                  <div className="empty-state-text">
                    {t('student.loans.empty')}
                  </div>
                </div>
              ) : filteredCount === 0 ? (
                <div className="me-empty">
                  <div className="empty-state-icon">🔎</div>
                  <div className="empty-state-text">{t('student.loans.noResults')}</div>
                </div>
              ) : (
                <>
                  <div className="me-list">
                    {pageRows.map((loan, i) => {
                      const cover = getCoverPlaceholder(loan);
                      const ret = getLoanReturnInfo(loan, t, i18n.language);
                      const badgeTone = ({
                        EN_COURS:   'success',
                        EN_ATTENTE: 'pending',
                        EN_RETARD:  'danger',
                        RETOURNE:   'info',
                        ANNULE:     'muted',
                        REFUSE:     'danger',
                      })[loan.statut] || 'info';
                      return (
                        <article
                          key={loan.id_emprunt}
                          className="me-row"
                          style={{ animationDelay: `${Math.min(i, 5) * 0.04}s` }}
                        >
                          <div className="me-row-cover">
                            {loan.image_couverture ? (
                              <img
                                src={resolveAssetUrl(loan.image_couverture)}
                                alt={loan.titre}
                                onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <div
                                className="me-cover-placeholder"
                                style={{ background: cover.background, '--accent': cover.accent }}
                              >
                                <span className="me-cover-spine" />
                                <span className="me-cover-initials">{cover.initials}</span>
                              </div>
                            )}
                          </div>

                          <div className="me-row-info">
                            <h3 className="me-row-title">{loan.titre}</h3>
                            <p className="me-row-author">{loan.auteur || t('student.common.unknownAuthor')}</p>
                            <div className="me-row-tags">
                              {loan.categorie && <span className="me-row-tag">{loan.categorie}</span>}
                              {loan.isbn && (
                                <span className="me-row-isbn">· ISBN: {loan.isbn}</span>
                              )}
                            </div>
                          </div>

                          <div className="me-row-date">
                            <span className="me-row-date-label">{t('student.loans.loanDate')}</span>
                            <span className="me-row-date-value">
                              <span aria-hidden="true">📅</span> {formatDateLong(loan.date_emprunt || getLoanRequestDate(loan), i18n.language)}
                            </span>
                          </div>

                          <div className="me-row-date">
                            <span className="me-row-date-label">{t('student.loans.expectedReturn')}</span>
                            <span className="me-row-date-value">
                              <span aria-hidden="true">📅</span> {formatDateLong(loan.date_retour_prevue, i18n.language)}
                            </span>
                            <span className={`me-row-remaining tone-${ret.tone}`}>{ret.text}</span>
                          </div>

                          <div className="me-row-actions">
                            <span className={`me-badge tone-${badgeTone}`}>
                              <span className="me-badge-dot" />
                              {formatLoanStatus(loan.statut, t)}
                            </span>
                            <div className="me-row-buttons">
                              <button
                                type="button"
                                className="me-btn me-btn-details"
                                onClick={() => setSelectedLoan(loan)}
                              >
                                ⟳ {t('student.actions.details')}
                              </button>
                              {canCancelLoan(loan.statut) && (
                                <button
                                  type="button"
                                  className="me-btn me-btn-cancel"
                                  onClick={() => handleAnnuler(loan.id_emprunt)}
                                >
                                  ✕ {t('student.actions.cancel')}
                                </button>
                              )}
                            </div>
                            {loan.penalite_montant > 0 && (
                              <span className="me-row-penalty">
                                {t('student.loans.penalty', { amount: (loan.penalite_montant / 100).toFixed(3) })}
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="me-pagination-row">
                    <span className="me-result-count">
                      {t('student.loans.showing', { from: firstIdx, to: lastIdx, total: filteredCount })}
                    </span>
                    <Pagination
                      page={safePage}
                      totalPages={totalPages}
                      total={filteredCount}
                      itemLabelKey="student.loans.loanCount"
                      onChange={(p) => {
                        setLoanPage(p);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />
                  </div>
                </>
              )}
            </section>
            );
          })()}

          {activeItem === 'mes-reservations' && (() => {
            // ---- Stats from full dataset ----
            const counts = { EN_ATTENTE: 0, CONFIRMEE: 0, EXPIREE: 0, ANNULEE: 0 };
            for (const r of reservations) {
              if (counts[r.statut] !== undefined) counts[r.statut]++;
            }
            const total = reservations.length;

            // ---- Filter ----
            const q = normalizeText(searchRes);
            const qIsbn = q.replace(/[-\s]/g, '');
            const filtered = reservations.filter((r) => {
              if (filterStatutRes && r.statut !== filterStatutRes) return false;
              if (!q) return true;
              const isbnNorm = normalizeText(r.isbn).replace(/[-\s]/g, '');
              return (
                normalizeText(r.titre).includes(q) ||
                normalizeText(r.auteur).includes(q) ||
                isbnNorm.includes(qIsbn) ||
                normalizeText(formatReservationStatus(r.statut, t)).includes(q) ||
                String(r.id_reservation).includes(q)
              );
            });

            // ---- Sort (most recent reservation first) ----
            const sorted = [...filtered].sort((a, b) => {
              const da = new Date(a.date_reservation || 0).getTime();
              const db = new Date(b.date_reservation || 0).getTime();
              return db - da;
            });

            // ---- Paginate ----
            const filteredCount = sorted.length;
            const totalPages = Math.max(1, Math.ceil(filteredCount / RESV_PAGE_SIZE));
            const safePage = Math.min(Math.max(1, resvPage), totalPages);
            const firstIdx = filteredCount === 0 ? 0 : (safePage - 1) * RESV_PAGE_SIZE + 1;
            const lastIdx  = Math.min(safePage * RESV_PAGE_SIZE, filteredCount);
            const pageRows = sorted.slice((safePage - 1) * RESV_PAGE_SIZE, safePage * RESV_PAGE_SIZE);

            const resetResvFilters = () => {
              setSearchRes('');
              setFilterStatutRes('');
            };

            const statCards = [
              { key: 'EN_ATTENTE', label: t('student.statusBadges.pending'), value: counts.EN_ATTENTE, tone: 'pending', icon: '⏳', sub: t('student.reservations.requestCount', { count: counts.EN_ATTENTE }) },
              { key: 'CONFIRMEE', label: t('student.reservations.approvedPlural'), value: counts.CONFIRMEE, tone: 'success', icon: '✓', sub: t('student.reservations.reservationLabel', { count: counts.CONFIRMEE }) },
              { key: 'EXPIREE', label: t('student.reservations.expiredPlural'), value: counts.EXPIREE, tone: 'info', icon: '⏰', sub: t('student.reservations.reservationLabel', { count: counts.EXPIREE }) },
              { key: 'ANNULEE', label: t('student.reservations.cancelledRejected'), value: counts.ANNULEE, tone: 'danger', icon: '✕', sub: t('student.reservations.reservationLabel', { count: counts.ANNULEE }) },
            ];

            // ---- Donut data for "Statut des réservations" ----
            const RESV_TONE_COLOR = {
              EN_ATTENTE: '#fcd34d',
              CONFIRMEE:  '#86efac',
              EXPIREE:    '#93c5fd',
              ANNULEE:    '#fca5a5',
            };
            const donutEntries = [
              { key: 'EN_ATTENTE', label: t('student.statusBadges.pending'), count: counts.EN_ATTENTE, color: RESV_TONE_COLOR.EN_ATTENTE },
              { key: 'CONFIRMEE', label: t('student.reservations.approvedPlural'), count: counts.CONFIRMEE, color: RESV_TONE_COLOR.CONFIRMEE },
              { key: 'EXPIREE', label: t('student.reservations.expiredPlural'), count: counts.EXPIREE, color: RESV_TONE_COLOR.EXPIREE },
              { key: 'ANNULEE', label: t('student.reservations.cancelledPlural'), count: counts.ANNULEE, color: RESV_TONE_COLOR.ANNULEE },
            ];
            const donutTotal = total || 1;
            let donutAcc = 0;
            const donutStops = donutEntries
              .filter(e => e.count > 0)
              .map(e => {
                const start = (donutAcc / donutTotal) * 360;
                donutAcc += e.count;
                const end = (donutAcc / donutTotal) * 360;
                return `${e.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
              }).join(', ');
            const donutBg = donutStops
              ? `conic-gradient(${donutStops})`
              : 'conic-gradient(var(--glass-border) 0deg 360deg)';

            const recentResvs = sorted.slice(0, 3);

            return (
            <section className="mr-page">
              <div className="mr-layout">
                <div className="mr-main">
                  {/* HEADER */}
                  <div className="mr-header">
                    <div className="mr-header-text">
                      <h1 className="mr-header-title">
                        {t('student.reservations.title')} <span aria-hidden="true">📌</span>
                      </h1>
                      <p className="mr-header-sub">
                        {t('student.reservations.intro')}
                      </p>
                    </div>
                    <div className="mr-header-art" aria-hidden="true">
                      <span className="mr-header-art-book b1" />
                      <span className="mr-header-art-book b2" />
                      <span className="mr-header-art-book b3" />
                    </div>
                  </div>

                  {/* STAT CARDS */}
                  <div className="mr-stats-row">
                    {statCards.map(c => (
                      <div key={c.key} className={`mr-stat-card tone-${c.tone}`}>
                        <span className="mr-stat-icon">{c.icon}</span>
                        <div className="mr-stat-info">
                          <span className="mr-stat-label">{c.label}</span>
                          <strong className="mr-stat-value">{c.value}</strong>
                          <span className="mr-stat-sub">{c.sub}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* TOOLBAR */}
                  <div className="mr-toolbar">
                    <div className="mr-search">
                      <span className="mr-search-icon" aria-hidden="true">🔍</span>
                      <input
                        type="text"
                        placeholder={t('student.reservations.searchPlaceholder')}
                        value={searchRes}
                        onChange={e => setSearchRes(e.target.value)}
                      />
                    </div>
                    <select
                      className="mr-select"
                      value={filterStatutRes}
                      onChange={e => setFilterStatutRes(e.target.value)}
                    >
                      <option value="">{t('student.reservations.allStatuses')}</option>
                      {RESERVATION_STATUS_OPTIONS.map(statut => (
                        <option key={statut} value={statut}>{formatReservationStatus(statut, t)}</option>
                      ))}
                    </select>
                    <button type="button" className="mr-reset-btn" onClick={resetResvFilters}>
                      ⟳ {t('student.actions.reset')}
                    </button>
                  </div>

                  {/* LIST */}
                  {loading ? (
                    <div className="loading-spinner"><div className="spinner" /></div>
                  ) : reservations.length === 0 ? (
                    <div className="mr-empty">
                      <div className="empty-state-icon">📌</div>
                      <div className="empty-state-text">
                        {t('student.reservations.empty')}
                      </div>
                    </div>
                  ) : filteredCount === 0 ? (
                    <div className="mr-empty">
                      <div className="empty-state-icon">🔎</div>
                      <div className="empty-state-text">{t('student.reservations.noResults')}</div>
                    </div>
                  ) : (
                    <>
                      <div className="mr-list">
                        {pageRows.map((r, i) => {
                          const cover = getCoverPlaceholder(r);
                          const badgeTone = ({
                            EN_ATTENTE: 'pending',
                            CONFIRMEE:  'success',
                            EXPIREE:    'info',
                            ANNULEE:    'danger',
                          })[r.statut] || 'muted';
                          const statusSub = ({
                            EN_ATTENTE: t('student.reservations.statusSub.pending'),
                            CONFIRMEE:  t('student.reservations.statusSub.approved'),
                            EXPIREE:    t('student.reservations.statusSub.expired'),
                            ANNULEE:    t('student.reservations.statusSub.cancelled'),
                          })[r.statut] || '';
                          const reqDateShort = r.date_reservation
                            ? new Date(r.date_reservation).toLocaleDateString(i18n.language)
                            : '—';
                          return (
                            <article
                              key={r.id_reservation}
                              className="mr-row"
                              style={{ animationDelay: `${Math.min(i, 4) * 0.04}s` }}
                            >
                              <div className="mr-row-cover">
                                {r.image_couverture ? (
                                  <img
                                    src={resolveAssetUrl(r.image_couverture)}
                                    alt={r.titre}
                                    onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div
                                    className="mr-cover-placeholder"
                                    style={{ background: cover.background, '--accent': cover.accent }}
                                  >
                                    <span className="mr-cover-spine" />
                                    <span className="mr-cover-initials">{cover.initials}</span>
                                  </div>
                                )}
                              </div>

                              <div className="mr-row-info">
                                <h3 className="mr-row-title">{r.titre}</h3>
                                <p className="mr-row-author">{r.auteur || t('student.common.unknownAuthor')}</p>
                                <div className="mr-row-tags">
                                  {r.isbn && (
                                    <span className="mr-row-isbn">
                                      <span aria-hidden="true">📕</span> ISBN: {r.isbn}
                                    </span>
                                  )}
                                  {r.categorie && (
                                    <span className="mr-row-tag">
                                      <span aria-hidden="true">🏷</span> {r.categorie}
                                    </span>
                                  )}
                                </div>
                                <div className="mr-row-requested">
                                  {t('student.reservations.requestedOn', { date: reqDateShort })}
                                </div>
                              </div>

                              <div className="mr-row-date">
                                <span className="mr-row-date-label">{t('student.reservations.reservationDate')}</span>
                                <span className="mr-row-date-value">
                                  <span aria-hidden="true">📅</span> {formatDateLong(r.date_reservation, i18n.language)}
                                </span>
                              </div>

                              <div className="mr-row-status">
                                <span className="mr-row-status-label">{t('student.reservations.status')}</span>
                                <span className={`mr-badge tone-${badgeTone}`}>
                                  <span className="mr-badge-dot" />
                                  {formatReservationStatus(r.statut, t)}
                                </span>
                                <span className="mr-row-status-sub">{statusSub}</span>
                              </div>

                              <div className="mr-row-actions">
                                <button
                                  type="button"
                                  className="mr-btn mr-btn-details"
                                  onClick={() => openBookDetails(r.id_livre)}
                                >
                                  {t('student.actions.details')}
                                </button>
                                {canCancelReservation(r.statut) && (
                                  <button
                                    type="button"
                                    className="mr-btn mr-btn-cancel"
                                    onClick={() => handleAnnulerReservation(r.id_reservation)}
                                  >
                                    {t('student.actions.cancel')}
                                  </button>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <div className="mr-pagination-row">
                        <span className="mr-result-count">
                          {t('student.reservations.showing', { from: firstIdx, to: lastIdx, total: filteredCount })}
                        </span>
                        <Pagination
                          page={safePage}
                          totalPages={totalPages}
                          total={filteredCount}
                          itemLabelKey="student.reservations.reservationCount"
                          onChange={(p) => {
                            setResvPage(p);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        />
                        <span className="mr-page-size-tag">
                          {t('student.pagination.perPage', { count: RESV_PAGE_SIZE })}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* RIGHT WIDGETS */}
                <aside className="mr-sidebar">
                  <section className="mr-widget mr-info-card">
                    <div className="mr-widget-header">
                      <span className="mr-info-icon" aria-hidden="true">ⓘ</span>
                      <h3 className="mr-widget-title">{t('student.reservations.about')}</h3>
                    </div>
                    <p className="mr-info-text">
                      {t('student.reservations.aboutText')}
                    </p>
                  </section>

                  <section className="mr-widget">
                    <div className="mr-widget-header">
                      <h3 className="mr-widget-title">{t('student.reservations.statusBreakdown')}</h3>
                    </div>
                    {total === 0 ? (
                      <div className="mr-widget-empty">{t('student.reservations.emptyShort')}</div>
                    ) : (
                      <div className="mr-donut-row">
                        <div className="mr-donut" style={{ background: donutBg }}>
                          <div className="mr-donut-hole">
                            <strong>{total}</strong>
                            <span>{t('student.common.total')}</span>
                          </div>
                        </div>
                        <ul className="mr-donut-legend">
                          {donutEntries.map(e => (
                            <li key={e.key}>
                              <span className="mr-legend-dot" style={{ background: e.color }} />
                              <span className="mr-legend-label">{e.label}</span>
                              <span className="mr-legend-count">{e.count}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>

                  <section className="mr-widget">
                    <div className="mr-widget-header">
                      <h3 className="mr-widget-title">{t('student.reservations.recentReservations')}</h3>
                    </div>
                    {recentResvs.length === 0 ? (
                      <div className="mr-widget-empty">{t('student.reservations.noRecentReservations')}</div>
                    ) : (
                      <>
                        <ul className="mr-recent-list">
                          {recentResvs.map(r => {
                            const c = getCoverPlaceholder(r);
                            const tone = ({
                              EN_ATTENTE: 'pending',
                              CONFIRMEE:  'success',
                              EXPIREE:    'info',
                              ANNULEE:    'danger',
                            })[r.statut] || 'muted';
                            return (
                              <li key={r.id_reservation} className="mr-recent-item">
                                <div
                                  className="mr-recent-cover"
                                  style={{ background: c.background, '--accent': c.accent }}
                                >
                                  {r.image_couverture ? (
                                    <img
                                      src={resolveAssetUrl(r.image_couverture)}
                                      alt={r.titre}
                                      onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <span className="mr-recent-initials">{c.initials}</span>
                                  )}
                                </div>
                                <div className="mr-recent-info">
                                  <button
                                    type="button"
                                    className="mr-recent-title"
                                    onClick={() => openBookDetails(r.id_livre)}
                                    title={r.titre}
                                  >
                                    {r.titre}
                                  </button>
                                  <span className="mr-recent-date">
                                    {r.date_reservation ? formatDateLong(r.date_reservation, i18n.language) : '—'}
                                  </span>
                                </div>
                                <span className={`mr-badge mr-badge-sm tone-${tone}`}>
                                  {formatReservationStatus(r.statut, t)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        {filteredCount > recentResvs.length && (
                          <button
                            type="button"
                            className="mr-recent-more"
                            onClick={() => setResvPage(1)}
                          >
                            {t('student.reservations.viewAll')} →
                          </button>
                        )}
                      </>
                    )}
                  </section>
                </aside>
              </div>
            </section>
            );
          })()}

          {activeItem === 'historique' && (() => {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
            const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // ---- Format / search / date filter ----
            const q = normalizeText(histSearch);
            const inDateBucket = (d) => {
              if (histDate === 'all') return true;
              if (!d) return false;
              const t = new Date(d).getTime();
              if (Number.isNaN(t)) return false;
              if (histDate === 'today') return t >= dayStart.getTime();
              if (histDate === 'week')  return t >= sevenDaysAgo.getTime();
              if (histDate === 'month') return t >= monthStart.getTime();
              return true;
            };
            const filtered = lectures.filter((l) => {
              const fmt = (l.format || 'AUTRE').toUpperCase();
              if (histFormat && fmt !== histFormat) return false;
              if (!inDateBucket(l.date_lecture)) return false;
              if (!q) return true;
              return (
                normalizeText(l.titre).includes(q) ||
                normalizeText(l.auteur).includes(q) ||
                normalizeText(l.categorie).includes(q) ||
                normalizeText(fmt).includes(q) ||
                normalizeText(l.description).includes(q)
              );
            });

            const filteredCount = filtered.length;
            const totalPages = Math.max(1, Math.ceil(filteredCount / HIST_PAGE_SIZE));
            const safePage = Math.min(Math.max(1, histPage), totalPages);
            const firstIdx = filteredCount === 0 ? 0 : (safePage - 1) * HIST_PAGE_SIZE + 1;
            const lastIdx  = Math.min(safePage * HIST_PAGE_SIZE, filteredCount);
            const pageRows = filtered.slice((safePage - 1) * HIST_PAGE_SIZE, safePage * HIST_PAGE_SIZE);

            // ---- Stats on FULL dataset ----
            const totalConsultations = lectures.length;
            const monthConsultations = lectures.filter(l => l.date_lecture && new Date(l.date_lecture) >= monthStart).length;
            const uniqueDocs = new Set(lectures.map(getLectureDocumentKey)).size;
            const monthDocsUnique = new Set(
              lectures
                .filter(l => l.date_lecture && new Date(l.date_lecture) >= monthStart)
                .map(getLectureDocumentKey)
            ).size;
            const last = lectures[0];
            const lastLabel = last ? formatDateTimeSmart(last.date_lecture, t, i18n.language) : t('student.history.noReading');
            const lastSub = last ? (last.titre || '—') : '—';

            const formatCounts = {};
            for (const l of lectures) {
              const f = (l.format || 'AUTRE').toUpperCase();
              formatCounts[f] = (formatCounts[f] || 0) + 1;
            }
            const distinctFormats = Object.keys(formatCounts);
            const formatTotal = totalConsultations || 1;
            const formatList = distinctFormats
              .sort((a, b) => formatCounts[b] - formatCounts[a])
              .map(f => ({
                fmt: f,
                count: formatCounts[f],
                pct: Math.round((formatCounts[f] / formatTotal) * 100),
                color: FORMAT_COLORS[f] || FORMAT_COLORS.AUTRE,
              }));
            let donutAcc = 0;
            const donutStops = formatList.map(f => {
              const start = (donutAcc / formatTotal) * 360;
              donutAcc += f.count;
              const end = (donutAcc / formatTotal) * 360;
              return `${f.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
            }).join(', ');
            const donutBg = donutStops
              ? `conic-gradient(${donutStops})`
              : 'conic-gradient(var(--glass-border) 0deg 360deg)';

            const recentLectures = lectures.slice(0, 4);
            const last7Count = lectures.filter(l => l.date_lecture && new Date(l.date_lecture) >= sevenDaysAgo).length;

            // ---- Per-document view count across the student's own history ----
            const perDocCount = {};
            for (const l of lectures) {
              const k = getLectureDocumentKey(l);
              perDocCount[k] = (perDocCount[k] || 0) + 1;
            }

            const resetHistFilters = () => {
              setHistSearch('');
              setHistFormat('');
              setHistDate('all');
            };

            const openLecture = (lecture) => {
              handleReadDocument(lecture);
            };

            const isVideo = (l) => (l.format || '').toUpperCase() === 'MP4';

            const statCards = [
              { key: 'total', label: t('student.history.totalViews'), value: totalConsultations, sub: t('student.history.monthDelta', { count: monthConsultations }), icon: '📋', tone: 'gold' },
              { key: 'unique', label: t('student.history.uniqueDocuments'), value: uniqueDocs, sub: t('student.history.monthDelta', { count: monthDocsUnique }), icon: '📚', tone: 'cours' },
              { key: 'last', label: t('student.history.latestReading'), value: lastLabel, sub: lastSub, icon: '📅', tone: 'examen', mono: true },
              { key: 'fmt', label: t('student.history.viewedFormats'), value: distinctFormats.length, sub: distinctFormats.slice(0, 4).join(', ') || '—', icon: '🗂', tone: 'corrige' },
            ];

            return (
            <section className="hl-page">
              <div className="hl-layout">
                <div className="hl-main">
                  {/* HERO */}
                  <div className="hl-hero">
                    <div className="hl-hero-icon" aria-hidden="true">📖</div>
                    <div className="hl-hero-text">
                      <h1 className="hl-hero-title">{t('student.history.title')}</h1>
                      <p className="hl-hero-sub">{t('student.history.intro')}</p>
                      <p className="hl-hero-sub-2">{t('student.history.introDetail')}</p>
                    </div>
                    <div className="hl-hero-art" aria-hidden="true">
                      <span className="hl-hero-art-book b1" />
                      <span className="hl-hero-art-book b2" />
                      <span className="hl-hero-art-book b3" />
                    </div>
                  </div>

                  {/* STAT CARDS */}
                  <div className="hl-stats-row">
                    {statCards.map(c => (
                      <div key={c.key} className={`hl-stat-card tone-${c.tone}`}>
                        <span className="hl-stat-icon">{c.icon}</span>
                        <div className="hl-stat-info">
                          <span className="hl-stat-label">{c.label}</span>
                          <strong className={`hl-stat-value${c.mono ? ' mono' : ''}`}>{c.value}</strong>
                          <span className="hl-stat-sub">{c.sub}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* TOOLBAR */}
                  <div className="hl-toolbar">
                    <div className="hl-search">
                      <span className="hl-search-icon" aria-hidden="true">🔍</span>
                      <input
                        type="text"
                        placeholder={t('student.history.searchPlaceholder')}
                        value={histSearch}
                        onChange={e => setHistSearch(e.target.value)}
                      />
                    </div>
                    <select className="hl-select" value={histFormat} onChange={e => setHistFormat(e.target.value)}>
                      <option value="">{t('student.digital.allFormats')}</option>
                      {distinctFormats.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <select className="hl-select" value={histDate} onChange={e => setHistDate(e.target.value)}>
                      <option value="all">{t('student.history.allDates')}</option>
                      <option value="today">{t('student.history.today')}</option>
                      <option value="week">{t('student.history.last7Days')}</option>
                      <option value="month">{t('student.history.last30Days')}</option>
                    </select>
                    <button type="button" className="hl-reset-btn" onClick={resetHistFilters}>
                      ⟳ {t('student.actions.reset')}
                    </button>
                  </div>

                  {/* LIST */}
                  {loading ? (
                    <div className="loading-spinner"><div className="spinner" /></div>
                  ) : lectures.length === 0 ? (
                    <div className="hl-empty">
                      <div className="empty-state-icon">📖</div>
                      <div className="empty-state-text">{t('student.history.empty')}</div>
                    </div>
                  ) : filteredCount === 0 ? (
                    <div className="hl-empty">
                      <div className="empty-state-icon">🔎</div>
                      <div className="empty-state-text">{t('student.history.noResults')}</div>
                    </div>
                  ) : (
                    <>
                      <div className="hl-list">
                        {pageRows.map((l, i) => {
                          const fmt = (l.format || 'AUTRE').toUpperCase();
                          const fmtColor = FORMAT_COLORS[fmt] || FORMAT_COLORS.AUTRE;
                          const cover = getCoverPlaceholder({
                            titre: l.titre,
                            categorie: l.categorie || fmt,
                            auteur: l.auteur,
                          });
                          const myViews = perDocCount[getLectureDocumentKey(l)] || 1;
                          return (
                            <article
                              key={l.id || `${i}-${l.id_ressource}`}
                              className="hl-row"
                              style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
                            >
                              <div className="hl-row-cover">
                                {l.image_couverture ? (
                                  <img
                                    src={resolveAssetUrl(l.image_couverture)}
                                    alt={l.titre}
                                    onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div
                                    className="hl-cover-placeholder"
                                    style={{ background: cover.background, '--accent': cover.accent }}
                                  >
                                    <span className="hl-cover-spine" />
                                    <span className="hl-cover-initials">{cover.initials}</span>
                                  </div>
                                )}
                              </div>

                              <div className="hl-row-info">
                                <h3 className="hl-row-title">{l.titre}</h3>
                                <div className="hl-row-meta">
                                  <span className="hl-row-author">{l.auteur || t('student.common.authorUnavailable')}</span>
                                  <span className="hl-row-sep">·</span>
                                  <span className="hl-row-date">{t('student.history.viewedOn', { date: formatDateTimeSmart(l.date_lecture, t, i18n.language) })}</span>
                                </div>
                              </div>

                              <span
                                className="hl-format-badge"
                                style={{ '--fmt-color': fmtColor }}
                              >
                                {fmt}
                              </span>

                              <span className="hl-views">
                                <span aria-hidden="true">👁</span> {t('student.history.viewCount', { count: myViews })}
                              </span>

                              <div className="hl-row-actions">
                                <button
                                  type="button"
                                  className="hl-btn hl-btn-details"
                                  onClick={() => setSelectedLecture(l)}
                                >
                                  {t('student.actions.details')}
                                </button>
                                <button
                                  type="button"
                                  className="hl-btn hl-btn-open"
                                  onClick={() => openLecture(l)}
                                >
                                  {isVideo(l) ? `▶ ${t('student.digital.read')}` : `⤴ ${t('student.actions.open')}`}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <div className="hl-pagination-row">
                        <span className="hl-result-count">
                          {t('student.history.showing', { from: firstIdx, to: lastIdx, total: filteredCount })}
                        </span>
                        <Pagination
                          page={safePage}
                          totalPages={totalPages}
                          total={filteredCount}
                          itemLabelKey="student.history.consultationCount"
                          onChange={(p) => {
                            setHistPage(p);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        />
                        <span className="hl-page-size-tag">{t('student.pagination.perPage', { count: HIST_PAGE_SIZE })}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* RIGHT SIDEBAR */}
                <aside className="hl-sidebar">
                  <section className="hl-widget">
                    <div className="hl-widget-header">
                      <h3 className="hl-widget-title">{t('student.digital.popularFormats')}</h3>
                    </div>
                    {formatList.length === 0 ? (
                      <div className="hl-widget-empty">{t('student.history.noSavedReading')}</div>
                    ) : (
                      <>
                        <div className="hl-donut-row">
                          <div className="hl-donut" style={{ background: donutBg }}>
                            <div className="hl-donut-hole">
                              <strong>{totalConsultations}</strong>
                              <span>{t('student.history.readings')}</span>
                            </div>
                          </div>
                          <ul className="hl-donut-legend">
                            {formatList.slice(0, 5).map(f => (
                              <li key={f.fmt}>
                                <span className="hl-legend-dot" style={{ background: f.color }} />
                                <span className="hl-legend-label">{f.fmt}</span>
                                <span className="hl-legend-pct">{f.pct}%</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <p className="hl-donut-foot">{t('student.history.basedOnViews')}</p>
                      </>
                    )}
                  </section>

                  <section className="hl-widget">
                    <div className="hl-widget-header">
                      <h3 className="hl-widget-title">{t('student.panels.recentActivity')}</h3>
                    </div>
                    {recentLectures.length === 0 ? (
                      <div className="hl-widget-empty">{t('student.panels.noRecentActivity')}</div>
                    ) : (
                      <>
                        <ul className="hl-recent-list">
                          {recentLectures.map((l, idx) => {
                            const fmt = (l.format || 'AUTRE').toUpperCase();
                            const fmtColor = FORMAT_COLORS[fmt] || FORMAT_COLORS.AUTRE;
                            return (
                              <li key={l.id || `recent-${idx}`} className="hl-recent-item">
                                <span
                                  className="hl-recent-icon"
                                  style={{ '--fmt-color': fmtColor }}
                                >
                                  {fmt}
                                </span>
                                <div className="hl-recent-info">
                                  <button
                                    type="button"
                                    className="hl-recent-title"
                                    onClick={() => setSelectedLecture(l)}
                                    title={l.titre}
                                  >
                                    {l.titre}
                                  </button>
                                  <span className="hl-recent-date">{formatDateTimeSmart(l.date_lecture, t, i18n.language)}</span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        <button
                          type="button"
                          className="hl-recent-more"
                          onClick={() => { setHistSearch(''); setHistFormat(''); setHistDate('all'); setHistPage(1); }}
                        >
                          {t('student.history.viewAllActivity')} →
                        </button>
                      </>
                    )}
                  </section>

                  <section className="hl-widget hl-summary-card">
                    <div className="hl-widget-header">
                      <h3 className="hl-widget-title">{t('student.history.summary')}</h3>
                      <span className="hl-summary-icon" aria-hidden="true">📈</span>
                    </div>
                    <p className="hl-summary-text">
                      {last7Count > 0
                        ? t('student.history.last7Summary', { count: last7Count })
                        : t('student.history.noLast7')}
                    </p>
                  </section>
                </aside>
              </div>

              {/* DETAILS MODAL */}
              {selectedLecture && (
                <div
                  className="hl-modal-overlay"
                  onClick={() => setSelectedLecture(null)}
                  role="dialog"
                  aria-modal="true"
                >
                  <div className="hl-modal" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="hl-modal-close"
                      onClick={() => setSelectedLecture(null)}
                      aria-label={t('student.actions.close')}
                    >
                      ✕
                    </button>
                    <div className="hl-modal-header">
                      <span
                        className="hl-modal-fmt"
                        style={{ '--fmt-color': FORMAT_COLORS[(selectedLecture.format || 'AUTRE').toUpperCase()] || FORMAT_COLORS.AUTRE }}
                      >
                        {(selectedLecture.format || 'AUTRE').toUpperCase()}
                      </span>
                      <h2 className="hl-modal-title">{selectedLecture.titre}</h2>
                      <p className="hl-modal-author">{selectedLecture.auteur || t('student.common.authorUnavailable')}</p>
                    </div>
                    <dl className="hl-modal-grid">
                      <div><dt>{t('student.digital.category')}</dt><dd>{selectedLecture.categorie || '—'}</dd></div>
                      <div><dt>{t('student.digital.format')}</dt><dd>{(selectedLecture.format || 'AUTRE').toUpperCase()}</dd></div>
                      <div><dt>{t('student.digital.size')}</dt><dd>{formatFileSize(selectedLecture.taille_ko, t)}</dd></div>
                      <div><dt>{t('student.history.consultationDate')}</dt><dd>{formatDateTimeSmart(selectedLecture.date_lecture, t, i18n.language)}</dd></div>
                      <div><dt>{t('student.history.myViews')}</dt><dd>{perDocCount[getLectureDocumentKey(selectedLecture)] || 1}</dd></div>
                      <div><dt>{t('student.history.totalViewsLabel')}</dt><dd>{selectedLecture.nb_consultations || 0}</dd></div>
                    </dl>
                    {selectedLecture.description && (
                      <div className="hl-modal-desc">
                        <strong>{t('student.digital.description')}</strong>
                        <p>{selectedLecture.description}</p>
                      </div>
                    )}
                    <div className="hl-modal-footer">
                      <button
                        type="button"
                        className="hl-btn hl-btn-open"
                        onClick={() => { openLecture(selectedLecture); setSelectedLecture(null); }}
                      >
                        ⤴ {t('student.history.openDocument')}
                      </button>
                      <button
                        type="button"
                        className="hl-btn hl-btn-details"
                        onClick={() => setSelectedLecture(null)}
                      >
                        {t('student.actions.close')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
            );
          })()}

          {activeItem === 'profil' && (
            <section className="student-profile-page" aria-labelledby="student-profile-title">
              <header className="student-profile-header">
                <div className="student-profile-header-copy">
                  <div className="student-profile-title-line">
                    <h1 id="student-profile-title">{t('student.profile.title')}</h1>
                    <span className="student-profile-title-icon" aria-hidden="true">👤</span>
                  </div>
                  <p>{t('student.profile.intro')}</p>
                </div>
                <button
                  type="button"
                  className="student-profile-edit-btn"
                  onClick={handleProfileEditUnavailable}
                >
                  <span aria-hidden="true">✎</span>
                  {t('student.profile.editProfile')}
                </button>
              </header>

              {profileLoading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <>
                  <section className="student-profile-hero-card">
                    <div className="student-profile-hero-left">
                      <div className="student-profile-avatar" aria-hidden="true">
                        {getStudentInitials(profileUser)}
                      </div>
                      <div className="student-profile-identity">
                        <h2>{profileFullName || PROFILE_UNAVAILABLE}</h2>
                        <p className="student-profile-email">
                          <span className="profile-inline-icon icon-mail" aria-hidden="true" />
                          {profileUser?.email || PROFILE_UNAVAILABLE}
                        </p>
                        <div className="student-profile-badges">
                          <span className="student-profile-role-badge">
                            <span className="profile-inline-icon icon-person" aria-hidden="true" />
                            {getRoleLabel(profileUser?.role, t)}
                          </span>
                          {profileMatricule && (
                            <span className="student-profile-id-badge">
                              {t('student.profile.idBadge', { id: profileMatricule })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {profileMemberSince && (
                      <div className="student-profile-member-since">
                        <span className="profile-inline-icon icon-calendar" aria-hidden="true" />
                        <span className="student-profile-member-since-copy">
                          <span>{t('student.profile.memberSince')}</span>
                          <strong>{profileMemberSince}</strong>
                        </span>
                      </div>
                    )}
                  </section>

                  <div className="student-profile-card-grid">
                    <section className="student-profile-card">
                      <header className="student-profile-card-header">
                        <span className="profile-card-icon icon-person" aria-hidden="true" />
                        <h2>{t('student.profile.personalInfo')}</h2>
                      </header>
                      <div className="student-profile-row-list">
                        {profileInfoRows.map(row => (
                          <div key={row.label} className="student-profile-row">
                            <span className={`profile-row-icon icon-${row.icon}`} aria-hidden="true" />
                            <span className="student-profile-row-label">{row.label}</span>
                            <span className={`student-profile-row-value ${row.mono ? 'is-mono' : ''}`}>
                              {row.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="student-profile-card">
                      <header className="student-profile-card-header">
                        <span className="profile-card-icon icon-security" aria-hidden="true" />
                        <h2>{t('student.profile.security')}</h2>
                      </header>
                      <div className="student-profile-row-list">
                        {profileSecurityRows.map(row => (
                          <div key={row.label} className="student-profile-row">
                            <span className={`profile-row-icon icon-${row.icon}`} aria-hidden="true" />
                            <span className="student-profile-row-label">{row.label}</span>
                            <span className={`student-profile-badge tone-${row.tone}`}>
                              <span className={`profile-inline-icon icon-${row.badgeIcon}`} aria-hidden="true" />
                              {row.value}
                            </span>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="student-profile-password-btn"
                        onClick={openPasswordModal}
                      >
                        <span className="profile-inline-icon icon-lock" aria-hidden="true" />
                        {t('student.profile.changePassword')}
                      </button>
                    </section>

                  </div>
                </>
              )}
            </section>
          )}

          {showPasswordModal && (
            <div
              className="student-password-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-password-modal-title"
              onClick={() => setShowPasswordModal(false)}
            >
              <form className="student-password-modal" onSubmit={handlePasswordSubmit} onClick={e => e.stopPropagation()} noValidate>
                <button
                  type="button"
                  className="student-password-modal-close"
                  aria-label={t('student.actions.close')}
                  onClick={() => setShowPasswordModal(false)}
                >
                  ✕
                </button>
                <header>
                  <span className="profile-card-icon icon-security" aria-hidden="true" />
                  <div>
                    <h2 id="student-password-modal-title">{t('student.profile.passwordModalTitle')}</h2>
                    <p>{t('student.profile.passwordModalIntro')}</p>
                  </div>
                </header>

                <label className="student-password-field">
                  <span>{t('student.profile.currentPassword')}</span>
                  <span className="student-password-input-wrap">
                    <input
                      type={passwordVisibility.currentPassword ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={e => handlePasswordFormChange('currentPassword', e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className={`student-password-eye ${passwordVisibility.currentPassword ? 'is-visible' : ''}`}
                      aria-label={passwordVisibility.currentPassword ? t('student.profile.hideCurrentPassword') : t('student.profile.showCurrentPassword')}
                      aria-pressed={passwordVisibility.currentPassword}
                      onClick={() => togglePasswordVisibility('currentPassword')}
                    />
                  </span>
                </label>
                <label className="student-password-field">
                  <span>{t('student.profile.newPassword')}</span>
                  <span className="student-password-input-wrap">
                    <input
                      type={passwordVisibility.newPassword ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={e => handlePasswordFormChange('newPassword', e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className={`student-password-eye ${passwordVisibility.newPassword ? 'is-visible' : ''}`}
                      aria-label={passwordVisibility.newPassword ? t('student.profile.hideNewPassword') : t('student.profile.showNewPassword')}
                      aria-pressed={passwordVisibility.newPassword}
                      onClick={() => togglePasswordVisibility('newPassword')}
                    />
                  </span>
                </label>
                <label className="student-password-field">
                  <span>{t('student.profile.confirmPassword')}</span>
                  <span className="student-password-input-wrap">
                    <input
                      type={passwordVisibility.confirmPassword ? 'text' : 'password'}
                      value={passwordForm.confirmPassword}
                      onChange={e => handlePasswordFormChange('confirmPassword', e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className={`student-password-eye ${passwordVisibility.confirmPassword ? 'is-visible' : ''}`}
                      aria-label={passwordVisibility.confirmPassword ? t('student.profile.hideConfirmPassword') : t('student.profile.showConfirmPassword')}
                      aria-pressed={passwordVisibility.confirmPassword}
                      onClick={() => togglePasswordVisibility('confirmPassword')}
                    />
                  </span>
                </label>

                <div className="student-password-actions">
                  <button type="button" className="student-password-cancel" onClick={() => setShowPasswordModal(false)}>
                    {t('student.profile.cancel')}
                  </button>
                  <button type="submit" className="student-password-submit" disabled={passwordSaving}>
                    {passwordSaving ? t('student.profile.saving') : t('student.profile.save')}
                  </button>
                </div>
              </form>
            </div>
          )}

          <LoanDetailsModal
            loan={selectedLoan}
            onClose={() => setSelectedLoan(null)}
          />

          <BookDetailsModal
            book={selectedBook}
            loading={loadingBook}
            onClose={() => setSelectedBook(null)}
            onEmprunt={handleModalEmprunt}
            onReserver={handleModalReserver}
            onRead={(book) => { setSelectedBook(null); handleReadDocument(book); }}
          />
        </div>
      </div>
    </div>
  );
}
