import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { empruntsAPI, statsAPI, authAPI, livresAPI } from '../../api/api';
import {
  EMP_STATUTS,
  formatStatus,
  isEmpruntEnRetard,
  DetailsModal,
} from './circulationShared';
import DateField from '../../components/DateField/DateField';
import {
  IconLoanMark, IconBook, IconCheckCircle, IconClock, IconLayers,
  IconFileText, IconExport, IconPlus, IconSearch, IconReset, IconCheck,
  IconKebab, IconChevronLeft, IconChevronRight, IconReturn, IconExtend, IconX,
} from './loansIcons';
import './EmpruntsView.css';

// ─────────────────────────────────────────────
// Date helpers — display dates as DD/MM/YYYY only.
// Browser date inputs still use YYYY-MM-DD internally (HTML spec).
// ─────────────────────────────────────────────
const MIN_YEAR = 1900;
const MAX_YEAR = 9999;

const pad2 = (n) => String(n).padStart(2, '0');

const formatDDMMYYYY = (value) => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Validate that an ISO date string from <input type="date"> is parseable
// and the year sits in [1900, 9999]. Returns null when valid, an error
// message when not.
const validateIsoDate = (iso, t) => {
  if (!iso) return t('admin.loans.errors.dateRequired');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return t('admin.loans.errors.invalidDateFormat');
  const year = Number(m[1]);
  if (year < MIN_YEAR || year > MAX_YEAR) return t('admin.loans.errors.yearRange', { min: MIN_YEAR, max: MAX_YEAR });
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('admin.loans.errors.invalidDate');
  if (d.getFullYear() !== year) return t('admin.loans.errors.invalidDate');
  return null;
};

// Force <input type="date"> to drop any year > 4 digits (HTML allows the
// browser to send 5+ digits in some cases). Returns the cleaned ISO string.
const clampIsoYear = (iso) => {
  if (!iso) return iso;
  const m = /^(-?\d+)-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  let year = m[1];
  if (year.length > 4) year = year.slice(0, 4);
  return `${year}-${m[2]}-${m[3]}`;
};

// CSV export from currently-visible rows.
function exportEmpruntsCSV(rows, t) {
  const headers = [
    t('admin.loans.tableLoanId'), t('admin.loans.tableBorrowerRegistration'), t('admin.loans.borrowerRole'), t('admin.loans.tableBook'), t('admin.loans.tableAuthor'),
    t('admin.loans.tableBookId'), t('admin.loans.tableBorrower'), 'Email',
    t('admin.loans.tableLoanDate'), t('admin.loans.tableExpectedReturn'), t('admin.loans.tableActualReturn'), t('admin.loans.tableStatus'), t('admin.loans.tableDelay'),
  ];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(e => {
    lines.push([
      loanDisplayId(e),
      borrowerDisplayId(e),
      borrowerRole(e) || '',
      e.titre,
      e.auteur || '',
      bookDisplayId(e),
      borrowerDisplayName(e),
      borrowerEmail(e) || '',
      formatDDMMYYYY(e.date_emprunt),
      formatDDMMYYYY(e.date_retour_prevue),
      formatDDMMYYYY(e.date_retour_effectif),
      formatStatus(e.statut, t),
      isEmpruntEnRetard(e) ? t('admin.loans.delayYes') : t('admin.loans.delayNo'),
    ].map(esc).join(','));
  });
  const csv = '﻿' + lines.join('\n'); // BOM so Excel reads UTF-8 correctly
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t('admin.loans.exportFilePrefix')}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// Search helpers
//
// Backend SELECT for /api/v1/emprunts (see backend/src/modules/emprunts/
// emprunts.controller.js getAllEmprunts) returns a flat row:
//   { id_emprunt, id_user, id_livre,
//     date_emprunt, date_retour_prevue, date_retour_effectif,
//     statut, penalite_montant, notes_biblio,
//     nom, prenom, email, matricule, est_bloque,
//     titre, auteur, isbn }
// There is no nested .user / .reservation / .book — the JOIN flattens them.
// ─────────────────────────────────────────────

// Normalize a value for case/accent-insensitive matching.
export function normalizeSearch(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Display helpers for the three identifier columns. The loan row carries
// real backend fields only — no fake IDs are generated.
export function loanDisplayId(loan) {
  if (!loan || loan.id_emprunt == null) return '—';
  return `EMP-${String(loan.id_emprunt).padStart(3, '0')}`;
}

export function borrowerFirstName(loan) {
  return loan?.prenom || null;
}

export function borrowerLastName(loan) {
  return loan?.nom || null;
}

export function borrowerEmail(loan) {
  return loan?.email || null;
}

export function borrowerDisplayName(loan) {
  return [borrowerFirstName(loan), borrowerLastName(loan)]
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function borrowerMatricule(loan) {
  return loan?.matricule || null;
}
export function borrowerUserId(loan) {
  return loan?.id_user ?? null;
}
export function borrowerRole(loan) {
  return loan?.role || null;
}
// Display: real matricule when present, otherwise #<id>, otherwise —.
export function borrowerDisplayId(loan) {
  const m = borrowerMatricule(loan);
  if (m) return m;
  const id = borrowerUserId(loan);
  if (id != null) return `#${id}`;
  return '—';
}

// Prefer ISBN (livres_physiques.isbn). Fall back to "#<id_livre>".
export function bookDisplayId(loan) {
  if (loan?.isbn) return loan.isbn;
  if (loan?.id_livre != null) return `#${loan.id_livre}`;
  return '—';
}

// Build three independent searchable strings per loan — one per logical
// entity. The matcher requires ALL terms to land within a single facet,
// which prevents cross-field false positives like a borrower-name term
// pairing with a book-author term to wrongly match an unrelated loan.
export function buildVisibleSearchFacets(loan) {
  if (!loan) return { loanFacet: '', borrowerFacet: '', bookFacet: '' };
  const join = (parts) => parts
    .filter(v => v !== null && v !== undefined && v !== '')
    .join(' ');

  return {
    // ID Emprunt + Statut shown in the table.
    loanFacet: join([
      loanDisplayId(loan),
      loan.id_emprunt,
      formatStatus(loan.statut),
      loan.statut,
    ]),
    // Everything tied to the displayed borrower; same source as the cells.
    borrowerFacet: join([
      borrowerDisplayName(loan),
      borrowerMatricule(loan),
      borrowerUserId(loan),
      borrowerDisplayId(loan),
      borrowerRole(loan),
    ]),
    // Book metadata — title, author, ISBN, id.
    bookFacet: join([
      loan.titre,
      loan.auteur,
      bookDisplayId(loan),
      loan.id_livre,
      loan.isbn,
    ]),
  };
}

export const buildLoanFacets = buildVisibleSearchFacets;

function facetMatchesTerms(facet, terms) {
  const haystack = normalizeSearch(facet);
  return terms.every(term => haystack.includes(term));
}

// All terms must appear inside one and the same facet for the row to match.
// Empty query -> everything passes.
export function getVisibleSearchMode(loans, terms) {
  if (!terms.length) return 'all';
  return loans.some(loan => facetMatchesTerms(buildVisibleSearchFacets(loan).borrowerFacet, terms))
    ? 'borrower'
    : 'all';
}

export function loanMatchesQuery(loan, terms, mode = 'all') {
  if (!terms.length) return true;
  const facets = buildVisibleSearchFacets(loan);

  if (mode === 'borrower') return facetMatchesTerms(facets.borrowerFacet, terms);

  return [
    facets.borrowerFacet,
    facets.loanFacet,
    facets.bookFacet,
  ].some(facet => facetMatchesTerms(facet, terms));
}

export function getMatchedVisibleFacet(loan, terms) {
  if (!terms.length) return null;
  const facets = buildVisibleSearchFacets(loan);
  const match = Object.entries(facets).find(([, facet]) => facetMatchesTerms(facet, terms));
  return match ? match[0] : null;
}

// ─────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────
function StatCard({ label, value, desc, icon, tone, loading }) {
  return (
    <div className={`loans-stat loans-stat-${tone}`}>
      <span className="loans-stat-icon">{icon}</span>
      <div className="loans-stat-body">
        <span className="loans-stat-label">{label}</span>
        <strong>{loading ? <span className="loans-stat-skel" /> : (value ?? 0)}</strong>
        <em>{desc}</em>
      </div>
    </div>
  );
}

// Status badge mapping for the redesigned table.
const LOAN_STATUS_CLASS = {
  EN_ATTENTE: 'loans-st-pending',
  EN_COURS: 'loans-st-active',
  RETOURNE: 'loans-st-returned',
  EN_RETARD: 'loans-st-overdue',
  ANNULE: 'loans-st-cancelled',
  REFUSE: 'loans-st-rejected',
};

const APPROVAL_ERROR_KEYS = {
  LOAN_ALREADY_APPROVED: 'admin.loans.alreadyApproved',
  LOAN_ALREADY_RETURNED: 'admin.loans.alreadyReturned',
  LOAN_NOT_PENDING: 'admin.loans.cannotApprove',
  LOAN_NOT_FOUND: 'admin.loans.cannotApprove',
  BOOK_UNAVAILABLE: 'admin.loans.bookUnavailable',
};

function approvalErrorMessage(error, t) {
  const code = error.response?.data?.code;
  return APPROVAL_ERROR_KEYS[code]
    ? t(APPROVAL_ERROR_KEYS[code])
    : (error.response?.data?.message || t('admin.loans.cannotApprove'));
}

// Translate a backend role code to a readable label (safe fallback).
function roleLabel(role, t) {
  const r = String(role || '').toUpperCase();
  if (r === 'ETUDIANT' || r === 'STUDENT') return t('admin.roles.student');
  if (r === 'ENSEIGNANT' || r === 'TEACHER') return t('admin.roles.teacher');
  if (r === 'ADMIN' || r === 'ADMINISTRATEUR') return t('admin.roles.admin');
  if (r === 'BIBLIOTHECAIRE' || r === 'LIBRARIAN') return t('admin.loans.staff');
  return role || '—';
}

function avatarInitials(loan) {
  const a = borrowerFirstName(loan)?.[0] || '';
  const b = borrowerLastName(loan)?.[0] || '';
  return ((a + b) || borrowerEmail(loan)?.[0] || '?').toUpperCase();
}

// Deterministic avatar tint from the borrower id/name.
function avatarTone(loan) {
  const seed = String(borrowerUserId(loan) ?? borrowerDisplayName(loan) ?? '');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ['blue', 'gold', 'green', 'purple'][hash % 4];
}

// Kebab (⋮) row menu. Positioned with `fixed` from the button rect so it is
// never clipped by the table's horizontal scroll container.
function RowMenu({ actions }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target)
        && btnRef.current && !btnRef.current.contains(e.target)
      ) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 184) });
    }
    setOpen(o => !o);
  };

  const disabled = !actions || actions.length === 0;

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="loans-kebab"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('admin.loans.tableActions')}
      >
        <IconKebab size={16} />
      </button>
      {open && !disabled && (
        <div ref={menuRef} className="loans-menu" style={{ top: pos.top, left: pos.left }} role="menu">
          {actions.map((a) => (
            <button
              type="button"
              key={a.key}
              className={`loans-menu-item ${a.danger ? 'is-danger' : ''}`}
              onClick={() => { setOpen(false); a.onClick(); }}
              role="menuitem"
            >
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Nouvel emprunt modal
// ─────────────────────────────────────────────
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const addDaysIso = (iso, days) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

function NouvelEmpruntModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [books, setBooks] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [idUser, setIdUser] = useState('');
  const [idLivre, setIdLivre] = useState('');
  const [dateEmprunt, setDateEmprunt] = useState(todayIso());
  const [dateRetour, setDateRetour] = useState(addDaysIso(todayIso(), 14));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [u, b] = await Promise.all([
          authAPI.getUsers({ limit: 200 }),
          livresAPI.getAll({ disponible: 'true', limit: 200 }),
        ]);
        const userRows = u.data?.data || [];
        const bookRows = b.data?.data || [];
        // Hide other admins from the borrower list — admins don't borrow.
        setUsers(userRows.filter(x => x.role !== 'ADMIN' && !x.est_bloque));
        setBooks(bookRows.filter(x => Number(x.stock_disponible) > 0));
      } catch (err) {
        setError(err.response?.data?.message || t('admin.loans.errors.loadModalData'));
      } finally {
        setLoadingLists(false);
      }
    })();
  }, [t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!idUser) return setError(t('admin.loans.errors.borrowerRequired'));
    if (!idLivre) return setError(t('admin.loans.errors.bookRequired'));

    const errEmp = validateIsoDate(dateEmprunt, t);
    if (errEmp) return setError(`${t('admin.loans.tableLoanDate')} : ${errEmp}`);
    const errRet = validateIsoDate(dateRetour, t);
    if (errRet) return setError(`${t('admin.loans.tableExpectedReturn')} : ${errRet}`);
    if (new Date(dateRetour).getTime() < new Date(dateEmprunt).getTime()) {
      return setError(t('admin.loans.errors.returnAfterLoan'));
    }

    setSubmitting(true);
    try {
      const r = await empruntsAPI.creerAdmin({
        id_user: Number(idUser),
        id_livre: Number(idLivre),
        date_emprunt: dateEmprunt,
        date_retour_prevue: dateRetour,
        notes_biblio: notes.trim() || undefined,
      });
      onCreated?.(r.data?.message || t('admin.loans.loanCreated'));
    } catch (err) {
      setError(err.response?.data?.message || t('admin.loans.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3 className="modal-title">📗 {t('admin.loans.newLoan')}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t('admin.common.close')}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div className="auth-alert auth-alert-error" style={{ margin: 0 }}>⚠️ {error}</div>
            )}

            <div className="emp-form-row">
              <label className="emp-form-label">{t('admin.loans.tableBorrower')} *</label>
              <select className="form-select" required disabled={loadingLists || submitting}
                value={idUser} onChange={e => setIdUser(e.target.value)}>
                <option value="">{loadingLists ? t('admin.common.loading') : t('admin.loans.selectBorrower')}</option>
                {users.map(u => (
                  <option key={u.id_user} value={u.id_user}>
                    {u.prenom} {u.nom} — {u.email} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="emp-form-row">
              <label className="emp-form-label">{t('admin.loans.availableBook')} *</label>
              <select className="form-select" required disabled={loadingLists || submitting}
                value={idLivre} onChange={e => setIdLivre(e.target.value)}>
                <option value="">{loadingLists ? t('admin.common.loading') : t('admin.loans.selectBook')}</option>
                {books.map(b => (
                  <option key={b.id_ressource} value={b.id_ressource}>
                    {b.titre} — {b.auteur} ({t('admin.loans.availableShort')} : {b.stock_disponible})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="emp-form-row">
                <label className="emp-form-label">{t('admin.loans.tableLoanDate')} *</label>
                <input type="date" className="form-input" required disabled={submitting}
                  min={`${MIN_YEAR}-01-01`} max={`${MAX_YEAR}-12-31`}
                  value={dateEmprunt}
                  onChange={e => setDateEmprunt(clampIsoYear(e.target.value))} />
              </div>
              <div className="emp-form-row">
                <label className="emp-form-label">{t('admin.loans.tableExpectedReturn')} *</label>
                <input type="date" className="form-input" required disabled={submitting}
                  min={`${MIN_YEAR}-01-01`} max={`${MAX_YEAR}-12-31`}
                  value={dateRetour}
                  onChange={e => setDateRetour(clampIsoYear(e.target.value))} />
              </div>
            </div>

            <div className="emp-form-row">
              <label className="emp-form-label">{t('admin.loans.notesOptional')}</label>
              <textarea className="form-input" rows={2} disabled={submitting}
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              {t('admin.common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || loadingLists}>
              {submitting ? t('admin.loans.creating') : t('admin.loans.confirmLoan')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
const LOANS_PAGE_SIZE = 8;

// Windowed page numbers with ellipsis markers.
function buildPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  sorted.forEach(n => {
    if (n - prev > 1) out.push(`gap-${n}`);
    out.push(n);
    prev = n;
  });
  return out;
}

export default function EmpruntsView() {
  const { t } = useTranslation();
  // Table state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [dateMin, setDateMin] = useState('');
  const [dateMax, setDateMax] = useState('');
  const [borrowerFilter, setBorrowerFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [flash, setFlash] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  // Custom in-app confirmation modals (replace native window.confirm / window.prompt)
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendDays, setExtendDays] = useState('7');
  const [extendError, setExtendError] = useState(null);
  const [extendSubmitting, setExtendSubmitting] = useState(false);

  // Stat-card data — raw API payloads (axios → response.data → backend { success, data }).
  const [dashboard, setDashboard] = useState(null);
  const [empStats, setEmpStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // All filtering + pagination is client-side, so load the full set once.
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await empruntsAPI.getAll({ page: 1, limit: 10000 });
      setItems(r.data.data || []);
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.loans.errors.loadFailed') });
    } finally { setLoading(false); }
  }, [t]);

  const loadWidgets = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [d, s] = await Promise.all([
        statsAPI.getDashboard(),
        statsAPI.getStatsEmprunts(),
      ]);
      setDashboard(d.data?.data || null);
      setEmpStats(s.data?.data || null);
    } catch (_err) {
      // Stat widgets are optional; the cards fall back to 0.
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadWidgets(); }, [loadWidgets]);
  useEffect(() => { setPage(1); }, [search, statut, dateMin, dateMax, borrowerFilter]);

  // Distinct borrowers for the "All borrowers" filter.
  const borrowerOptions = (() => {
    const map = new Map();
    items.forEach(e => {
      const id = borrowerUserId(e);
      if (id != null && !map.has(id)) map.set(id, borrowerDisplayName(e) || borrowerDisplayId(e));
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  })();

  // Multi-term AND search inside a SINGLE facet (loan / borrower / book).
  const normalizedSearch = normalizeSearch(search);
  const searchTerms = normalizedSearch.split(' ').filter(Boolean);
  const searchMode = getVisibleSearchMode(items, searchTerms);
  const filteredItems = items.filter(e => {
    if (searchTerms.length > 0 && !loanMatchesQuery(e, searchTerms, searchMode)) return false;
    if (statut && e.statut !== statut) return false;
    if (borrowerFilter && String(borrowerUserId(e)) !== String(borrowerFilter)) return false;
    if (e.date_emprunt) {
      const ts = new Date(e.date_emprunt).getTime();
      if (dateMin && ts < new Date(dateMin).getTime()) return false;
      if (dateMax && ts > new Date(dateMax).getTime() + 24 * 3600 * 1000 - 1) return false;
    }
    return true;
  });

  const hasActiveFilters = !!(search || statut || dateMin || dateMax || borrowerFilter);

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / LOANS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * LOANS_PAGE_SIZE;
  const pageItems = filteredItems.slice(startIndex, startIndex + LOANS_PAGE_SIZE);
  const rangeStart = filteredItems.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = startIndex + pageItems.length;
  const pageList = buildPageNumbers(currentPage, totalPages);

  const resetFilters = () => {
    setSearch(''); setStatut(''); setDateMin(''); setDateMax(''); setBorrowerFilter(''); setPage(1);
  };

  // Open the custom confirmation modal instead of a native popup.
  const retourner = (e) => setReturnTarget(e);
  const confirmReturn = async () => {
    if (!returnTarget || returnSubmitting) return;
    setReturnSubmitting(true);
    try {
      const r = await empruntsAPI.retourner(returnTarget.id_emprunt);
      setFlash({ type: 'success', text: r.data.message + (r.data.penalite ? ` ${r.data.penalite}` : '') });
      loadList(); loadWidgets();
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.loans.errors.generic') });
    } finally {
      setReturnSubmitting(false);
      setReturnTarget(null);
    }
  };

  // Open the custom extend modal instead of a native prompt.
  const prolonger = (e) => { setExtendDays('7'); setExtendError(null); setExtendTarget(e); };
  const confirmExtend = async () => {
    if (!extendTarget || extendSubmitting) return;
    const joursParsed = parseInt(extendDays, 10);
    if (!Number.isInteger(joursParsed) || joursParsed < 1) {
      setExtendError(t('admin.loans.errors.invalidDays'));
      return;
    }
    setExtendError(null);
    setExtendSubmitting(true);
    try {
      const r = await empruntsAPI.prolonger(extendTarget.id_emprunt, { jours: joursParsed });
      setFlash({ type: 'success', text: r.data.message || t('admin.loans.loanExtended', { count: joursParsed }) });
      loadList();
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.loans.errors.generic') });
    } finally {
      setExtendSubmitting(false);
      setExtendTarget(null);
    }
  };
  // Approve a pending loan → backend validerEmprunt (EN_ATTENTE → EN_COURS,
  // re-checks stock and decrements it). No duplicate stock handling here.
  const approuver = async (e) => {
    if (e.statut !== 'EN_ATTENTE' || approvingId !== null) return;

    setApprovingId(e.id_emprunt);
    try {
      const r = await empruntsAPI.valider(e.id_emprunt, {});
      setItems(current => current.map(item => (
        item.id_emprunt === e.id_emprunt
          ? { ...item, ...(r.data?.data || {}), statut: 'EN_COURS' }
          : item
      )));
      setFlash({ type: 'success', text: t('admin.loans.loanApproved') });
      await Promise.all([loadList(), loadWidgets()]);
    } catch (err) {
      setFlash({ type: 'error', text: approvalErrorMessage(err, t) });
    } finally {
      setApprovingId(null);
    }
  };

  // ─── Stat-card sources (all real backend data) ───
  const parStatutMap = (empStats?.par_statut || []).reduce((acc, r) => {
    acc[r.statut] = Number(r.total) || 0;
    return acc;
  }, {});
  const livresDispo = dashboard?.stock?.stock_disponible_global;
  const empruntsRetournes = parStatutMap.RETOURNE ?? Number(dashboard?.emprunts?.retours_total) ?? 0;
  const enRetard = Number(dashboard?.emprunts?.en_retard) ?? 0;
  const empruntsActifs = (parStatutMap.EN_COURS || 0) + (parStatutMap.EN_RETARD || 0);

  return (
    <>
      <div className="loans-page">
        <div className="loans-header">
          <div className="loans-header-left">
            <span className="loans-title-mark"><IconLoanMark size={26} /></span>
            <div>
              <div className="loans-breadcrumb">{t('sidebar.items.dashboard')} <span>›</span> {t('admin.loans.title')}</div>
              <h1>{t('admin.loans.title')}</h1>
              <p>{t('admin.loans.intro')}</p>
            </div>
          </div>
          <div className="loans-header-actions">
            <button type="button" className="btn-secondary loans-hbtn" onClick={() => { setStatut('EN_RETARD'); setPage(1); }}>
              <IconFileText size={16} /> {t('admin.loans.overdueReport')}
            </button>
            <button type="button" className="btn-secondary loans-hbtn" onClick={() => exportEmpruntsCSV(filteredItems, t)} disabled={filteredItems.length === 0}>
              <IconExport size={16} /> {t('admin.loans.export')}
            </button>
            <button type="button" className="btn-primary loans-hbtn" onClick={() => setShowNewModal(true)}>
              <IconPlus size={16} /> {t('admin.loans.newLoan')}
            </button>
          </div>
        </div>

        {flash && (
          <div className={`auth-alert auth-alert-${flash.type === 'success' ? 'success' : 'error'} loans-alert`}>
            <span>{flash.text}</span>
            <button type="button" onClick={() => setFlash(null)} aria-label={t('admin.common.close')}><IconX size={15} /></button>
          </div>
        )}

        <div className="loans-stats">
          <StatCard tone="blue" loading={statsLoading} icon={<IconBook size={22} />} value={empruntsActifs}
            label={t('admin.loans.activeLoans')} desc={t('admin.loans.activeLoansDesc')} />
          <StatCard tone="green" loading={statsLoading} icon={<IconCheckCircle size={22} />} value={empruntsRetournes}
            label={t('admin.loans.returnedLoans')} desc={t('admin.loans.returnedLoansDesc')} />
          <StatCard tone="amber" loading={statsLoading} icon={<IconClock size={22} />} value={enRetard}
            label={t('admin.loans.overdueLoans')} desc={t('admin.loans.overdueLoansDesc')} />
          <StatCard tone="purple" loading={statsLoading} icon={<IconLayers size={22} />} value={livresDispo != null ? Number(livresDispo) : 0}
            label={t('admin.loans.availableBooks')} desc={t('admin.loans.availableBooksDesc')} />
        </div>

        <div className="panel loans-card">
          <div className="loans-card-head">
            <h2><IconLoanMark size={18} /> {t('admin.loans.tracking')}</h2>
            <span className="loans-count">{t('admin.loans.loanCount', { count: filteredItems.length })}</span>
          </div>

          <div className="loans-toolbar">
            <div className="loans-search">
              <IconSearch size={17} className="loans-search-icon" />
              <input className="form-input" placeholder={t('admin.loans.searchPlaceholder')}
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-select loans-select" value={statut} onChange={e => setStatut(e.target.value)}>
              <option value="">{t('admin.loans.allStatuses')}</option>
              {EMP_STATUTS.map(s => <option key={s} value={s}>{formatStatus(s, t)}</option>)}
            </select>
            <div className="loans-date">
              <span>{t('admin.loans.from')}</span>
              <DateField value={dateMin} onChange={setDateMin} minYear={MIN_YEAR} maxYear={MAX_YEAR} max={dateMax || ''} ariaLabel={t('admin.loans.startDate')} />
            </div>
            <div className="loans-date">
              <span>{t('admin.loans.to')}</span>
              <DateField value={dateMax} onChange={setDateMax} minYear={MIN_YEAR} maxYear={MAX_YEAR} min={dateMin || ''} ariaLabel={t('admin.loans.endDate')} />
            </div>
            <select className="form-select loans-select" value={borrowerFilter} onChange={e => setBorrowerFilter(e.target.value)}>
              <option value="">{t('admin.loans.allBorrowers')}</option>
              {borrowerOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button type="button" className="btn-secondary loans-reset" onClick={resetFilters} disabled={!hasActiveFilters}>
              <IconReset size={15} /> {t('admin.loans.resetFilters')}
            </button>
          </div>

          {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <>
              <div className="table-wrapper loans-table-wrap">
                <table className="data-table loans-table">
                  <thead>
                    <tr>
                      <th>{t('admin.loans.tableLoanId')}</th>
                      <th>{t('admin.loans.tableRegNo')}</th>
                      <th>{t('admin.loans.tableBook')}</th>
                      <th>{t('admin.loans.tableBorrower')}</th>
                      <th>{t('admin.loans.tableBorrowerEmail')}</th>
                      <th>{t('admin.loans.tableBorrowedOn')}</th>
                      <th>{t('admin.loans.tableDueDate')}</th>
                      <th>{t('admin.loans.tableReturnedOn')}</th>
                      <th>{t('admin.loans.tableStatus')}</th>
                      <th>{t('admin.loans.tableOverdue')}</th>
                      <th style={{ textAlign: 'right' }}>{t('admin.loans.tableActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(e => {
                      const retard = isEmpruntEnRetard(e);
                      const isPending = e.statut === 'EN_ATTENTE';
                      const isActive = e.statut === 'EN_COURS' || e.statut === 'EN_RETARD';
                      const menuActions = [];
                      if (isActive) {
                        menuActions.push({ key: 'return', label: t('admin.loans.returnAction'), icon: <IconReturn size={15} />, onClick: () => retourner(e) });
                        menuActions.push({ key: 'extend', label: t('admin.loans.extendAction'), icon: <IconExtend size={15} />, onClick: () => prolonger(e) });
                      }
                      return (
                        <tr key={e.id_emprunt}>
                          <td className="loans-mono">{loanDisplayId(e)}</td>
                          <td className="loans-mono">{borrowerDisplayId(e)}</td>
                          <td>
                            <div className="loans-book">
                              <strong>{e.titre}</strong>
                              {e.auteur && <span>{e.auteur}</span>}
                            </div>
                          </td>
                          <td>
                            <div className="loans-borrower">
                              <span className={`loans-avatar loans-avatar-${avatarTone(e)}`}>{avatarInitials(e)}</span>
                              <div className="loans-borrower-meta">
                                <strong>{borrowerDisplayName(e) || '—'}</strong>
                                <span>{roleLabel(borrowerRole(e), t)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="loans-email" title={borrowerEmail(e) || ''}>{borrowerEmail(e) || '—'}</td>
                          <td className="loans-mono">{formatDDMMYYYY(e.date_emprunt)}</td>
                          <td className="loans-mono">{formatDDMMYYYY(e.date_retour_prevue)}</td>
                          <td className="loans-mono">{formatDDMMYYYY(e.date_retour_effectif)}</td>
                          <td><span className={`loans-badge ${LOAN_STATUS_CLASS[e.statut] || 'loans-st-pending'}`}>{formatStatus(e.statut, t)}</span></td>
                          <td><span className={`loans-badge ${retard ? 'loans-ov-yes' : 'loans-ov-no'}`}>{retard ? t('admin.loans.delayYes') : t('admin.loans.delayNo')}</span></td>
                          <td>
                            <div className="loans-actions">
                              <button type="button" className="loans-act loans-act-details" onClick={() => setSelected(e)}>{t('admin.loans.details')}</button>
                              {isPending && (
                                <button
                                  type="button"
                                  className="loans-act loans-act-approve"
                                  onClick={() => approuver(e)}
                                  disabled={approvingId !== null}
                                >
                                  <IconCheck size={14} /> {approvingId === e.id_emprunt ? t('admin.loans.approving') : t('admin.loans.approve')}
                                </button>
                              )}
                              <RowMenu actions={menuActions} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredItems.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-icon"><IconLoanMark size={32} /></div>
                    <div className="empty-state-text">{t('admin.loans.noLoans')}</div>
                  </div>
                )}
              </div>

              {filteredItems.length > 0 && (
                <div className="loans-footer">
                  <span>{t('admin.loans.showingSummary', { start: rangeStart, end: rangeEnd, total: filteredItems.length })}</span>
                  <div className="loans-pager">
                    <button type="button" className="loans-pager-nav" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label={t('admin.loans.previous')}><IconChevronLeft size={15} /></button>
                    {pageList.map(item => (
                      typeof item === 'number'
                        ? <button type="button" key={item} className={`loans-pager-btn ${item === currentPage ? 'is-active' : ''}`} onClick={() => setPage(item)} aria-current={item === currentPage ? 'page' : undefined}>{item}</button>
                        : <span key={item} className="loans-pager-gap">…</span>
                    ))}
                    <button type="button" className="loans-pager-nav" disabled={currentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} aria-label={t('admin.loans.next')}><IconChevronRight size={15} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selected && <DetailsModal kind="emprunt" data={selected} onClose={() => setSelected(null)} />}
      {showNewModal && (
        <NouvelEmpruntModal
          onClose={() => setShowNewModal(false)}
          onCreated={(msg) => {
            setShowNewModal(false);
            setFlash({ type: 'success', text: msg });
            loadList(); loadWidgets();
          }}
        />
      )}

      {/* Confirm book return — custom modal (replaces native window.confirm) */}
      {returnTarget && (
        <div className="modal-backdrop" onClick={() => { if (!returnSubmitting) setReturnTarget(null); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">{t('admin.loans.confirmReturnTitle')}</h3>
              <button className="modal-close" onClick={() => setReturnTarget(null)} disabled={returnSubmitting} aria-label={t('admin.common.close')}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>{t('admin.loans.confirmReturnMessage')}</p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setReturnTarget(null)} disabled={returnSubmitting}>
                {t('admin.common.cancel')}
              </button>
              <button type="button" className="btn-primary" onClick={confirmReturn} disabled={returnSubmitting}>
                {returnSubmitting ? t('admin.common.loading') : t('admin.loans.confirmReturnBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend loan — custom modal (replaces native window.prompt) */}
      {extendTarget && (
        <div className="modal-backdrop" onClick={() => { if (!extendSubmitting) setExtendTarget(null); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">{t('admin.loans.extendTitle')}</h3>
              <button className="modal-close" onClick={() => setExtendTarget(null)} disabled={extendSubmitting} aria-label={t('admin.common.close')}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {extendError && (
                <div className="auth-alert auth-alert-error" style={{ margin: 0 }}>⚠️ {extendError}</div>
              )}
              <p style={{ margin: 0 }}>{t('admin.loans.extendMessage')}</p>
              <div className="emp-form-row">
                <label className="emp-form-label">{t('admin.loans.extendDaysLabel')}</label>
                <input type="number" className="form-input" min={1} disabled={extendSubmitting}
                  value={extendDays} onChange={e => setExtendDays(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setExtendTarget(null)} disabled={extendSubmitting}>
                {t('admin.common.cancel')}
              </button>
              <button type="button" className="btn-primary" onClick={confirmExtend} disabled={extendSubmitting}>
                {extendSubmitting ? t('admin.common.loading') : t('admin.loans.confirmExtendBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
