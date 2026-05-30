import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { empruntsAPI, statsAPI, authAPI, livresAPI } from '../../api/api';
import { useChartTheme } from '../../utils/chartTheme';
import {
  EMP_STATUTS,
  STATUT_BADGE,
  STATUT_COLOR,
  formatStatus,
  isEmpruntEnRetard,
  DetailsModal,
} from './circulationShared';
import DateField from '../../components/DateField/DateField';
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
function StatBox({ label, value, icon, accent, loading }) {
  return (
    <div className="emp-stat" style={{ '--accent': accent }}>
      <div className="emp-stat-icon">{icon}</div>
      <div className="emp-stat-text">
        <div className="emp-stat-value">
          {loading ? <span className="emp-stat-skel" /> : (value ?? 0)}
        </div>
        <div className="emp-stat-label">{label}</div>
      </div>
    </div>
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
export default function EmpruntsView() {
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  // Table state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [dateMin, setDateMin] = useState('');
  const [dateMax, setDateMax] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null);
  const [flash, setFlash] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // Dashboard data — raw API payloads (axios → response.data → backend { success, data: {...} })
  const [dashboard, setDashboard] = useState(null);
  const [empStats, setEmpStats] = useState(null);
  const [topLivres, setTopLivres] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // When search or date filter is active we widen the API limit so the client
  // has the full result set to match against. The search itself is applied
  // client-side (see filteredItems below) so we can reason about exactly what
  // fields each row exposes.
  const filterActive = !!(search || dateMin || dateMax);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await empruntsAPI.getAll({
        page: filterActive ? 1 : page,
        limit: filterActive ? 10000 : limit,
        ...(statut ? { statut } : {}),
      });
      setItems(r.data.data);
      setPagination(r.data.pagination || { total: 0, totalPages: 0 });
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.loans.errors.loadFailed') });
    } finally { setLoading(false); }
  }, [page, limit, statut, filterActive, t]);

  const loadWidgets = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [d, s, p] = await Promise.all([
        statsAPI.getDashboard(),
        statsAPI.getStatsEmprunts(),
        statsAPI.getRessourcesPopulaires(),
      ]);
      // The backend wraps payload as { success, data: {...} }. axios then wraps as
      // { data: { success, data: {...} } } so the real fields live under .data.data.
      setDashboard(d.data?.data || null);
      setEmpStats(s.data?.data || null);
      setTopLivres((p.data?.data?.top_livres || []).slice(0, 5));
    } catch (_err) {
      // Widgets are optional. Leave them null; the cards show 0.
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadWidgets(); }, [loadWidgets]);
  useEffect(() => { setPage(1); }, [search, statut, dateMin, dateMax]);


  // Multi-term AND search inside a SINGLE facet (loan / borrower / book).
  // Cross-facet hits — e.g. one term matching the borrower name while
  // another matches the book author — are intentionally rejected to keep
  // results aligned with what the user reads in the cells.
  const normalizedSearch = normalizeSearch(search);
  const searchTerms = normalizedSearch.split(' ').filter(Boolean);
  const searchMode = getVisibleSearchMode(items, searchTerms);
  const filteredItems = items.filter(e => {
    if (searchTerms.length > 0 && !loanMatchesQuery(e, searchTerms, searchMode)) return false;
    if (e.date_emprunt) {
      const t = new Date(e.date_emprunt).getTime();
      if (dateMin) {
        const min = new Date(dateMin).getTime();
        if (t < min) return false;
      }
      if (dateMax) {
        const max = new Date(dateMax).getTime() + 24 * 3600 * 1000 - 1;
        if (t > max) return false;
      }
    }
    return true;
  });

  const retourner = async (e) => {
    if (!window.confirm(t('admin.loans.confirmReturn'))) return;
    try {
      const r = await empruntsAPI.retourner(e.id_emprunt);
      setFlash({ type: 'success', text: r.data.message + (r.data.penalite ? ` ${r.data.penalite}` : '') });
      loadList(); loadWidgets();
    } catch (err) { setFlash({ type: 'error', text: err.response?.data?.message || t('admin.loans.errors.generic') }); }
  };
  const prolonger = async (e) => {
    const jours = window.prompt(t('admin.loans.extendPrompt'), '7');
    if (!jours) return;
    const joursParsed = parseInt(jours, 10);
    if (!Number.isInteger(joursParsed) || joursParsed < 1) {
      setFlash({ type: 'error', text: t('admin.loans.errors.invalidDays') });
      return;
    }
    try {
      const r = await empruntsAPI.prolonger(e.id_emprunt, { jours: joursParsed });
      setFlash({ type: 'success', text: r.data.message || t('admin.loans.loanExtended', { count: joursParsed }) });
      loadList();
    } catch (err) { setFlash({ type: 'error', text: err.response?.data?.message || t('admin.loans.errors.generic') }); }
  };

  // ─── Stats sources (all real backend data) ───
  // par_statut comes from GET /stats/emprunts and gives accurate counts
  // for EN_COURS + EN_RETARD (active) and RETOURNE.
  const parStatutMap = (empStats?.par_statut || []).reduce((acc, r) => {
    acc[r.statut] = Number(r.total) || 0;
    return acc;
  }, {});
  const livresDispo = dashboard?.stock?.stock_disponible_global;
  const empruntsRetournes = parStatutMap.RETOURNE ?? Number(dashboard?.emprunts?.retours_total) ?? 0;
  const enRetard = Number(dashboard?.emprunts?.en_retard) ?? 0;
  const empruntsActifs = (parStatutMap.EN_COURS || 0) + (parStatutMap.EN_RETARD || 0);

  // Chart data
  const parMois = (empStats?.par_mois || []).map(m => ({
    mois: m.mois,
    total: Number(m.total_emprunts) || 0,
  }));
  const parStatut = (empStats?.par_statut || []).map(s => ({
    statut: s.statut,
    label: formatStatus(s.statut, t),
    total: Number(s.total) || 0,
    color: STATUT_COLOR[s.statut] || '#c9a84c',
  }));

  const activiteRecente = dashboard?.activite_recente || [];
  const topMax = topLivres.reduce((m, l) => Math.max(m, Number(l.nb_emprunts) || 0), 0);

  return (
    <>
      <div className="page-header">
        <div className="page-header-title">{t('admin.loans.title')} 📗</div>
        <div className="page-header-sub">
          {t('admin.loans.intro')}
        </div>
      </div>

      {flash && (
        <div className={`auth-alert auth-alert-${flash.type === 'success' ? 'success' : 'error'}`}
             style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{flash.type === 'success' ? '✅' : '⚠️'} {flash.text}</span>
          <button onClick={() => setFlash(null)} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div className="emp-stats-row">
        <StatBox label={t('admin.loans.availableBooks')} value={livresDispo != null ? Number(livresDispo) : 0}
          icon="📚" accent="rgba(56,189,248,0.18)" loading={statsLoading} />
        <StatBox label={t('admin.loans.returnedLoans')} value={empruntsRetournes}
          icon="✅" accent="rgba(16,212,142,0.18)" loading={statsLoading} />
        <StatBox label={t('admin.loans.overdue')} value={enRetard}
          icon="⏰" accent="rgba(239,68,68,0.18)" loading={statsLoading} />
        <StatBox label={t('admin.loans.activeLoans')} value={empruntsActifs}
          icon="📗" accent="rgba(201,168,76,0.20)" loading={statsLoading} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('admin.loans.tracking')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary"
              onClick={() => exportEmpruntsCSV(filteredItems, t)}
              disabled={filteredItems.length === 0}
              title={t('admin.loans.export')}>
              ⬇️ {t('admin.loans.export')}
            </button>
            <button className="btn-primary" onClick={() => setShowNewModal(true)}>
              + {t('admin.loans.newLoan')}
            </button>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="form-input" placeholder={'🔍 ' + t('admin.common.search')}
            style={{ flex: '1 1 240px', minWidth: 200 }}
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-select" style={{ maxWidth: 200 }}
            value={statut} onChange={e => setStatut(e.target.value)}>
            <option value="">{t('admin.loans.allStatuses')}</option>
            {EMP_STATUTS.map(s => <option key={s} value={s}>{formatStatus(s, t)}</option>)}
          </select>
          <div className="emp-date-field">
            <span className="emp-date-label">{t('admin.loans.from')}</span>
            <DateField value={dateMin} onChange={setDateMin}
              minYear={MIN_YEAR} maxYear={MAX_YEAR}
              max={dateMax || ''}
              ariaLabel={t('admin.loans.startDate')} />
          </div>
          <div className="emp-date-field">
            <span className="emp-date-label">{t('admin.loans.to')}</span>
            <DateField value={dateMax} onChange={setDateMax}
              minYear={MIN_YEAR} maxYear={MAX_YEAR}
              min={dateMin || ''}
              ariaLabel={t('admin.loans.endDate')} />
          </div>
          {(search || statut || dateMin || dateMax) && (
            <button className="btn-secondary"
              onClick={() => { setSearch(''); setStatut(''); setDateMin(''); setDateMax(''); }}>
              {t('admin.loans.reset')}
            </button>
          )}
          <span className="pagination-info" style={{ marginLeft: 'auto' }}>
            {filterActive
              ? t('admin.loans.resultsCount', { count: filteredItems.length })
              : t('admin.loans.loanCount', { count: pagination.total })}
          </span>
        </div>
      </div>

      <div className="panel">
        {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.loans.tableLoanId')}</th>
                  <th>{t('admin.loans.tableBorrowerRegistration')}</th>
                  <th>{t('admin.loans.tableBook')}</th>
                  <th>{t('admin.loans.tableBookId')}</th>
                  <th>{t('admin.loans.tableBorrower')}</th>
                  <th>{t('admin.loans.tableBorrowerEmail')}</th>
                  <th>{t('admin.loans.tableLoanDate')}</th>
                  <th>{t('admin.loans.tableExpectedReturn')}</th>
                  <th>{t('admin.loans.tableActualReturn')}</th>
                  <th>{t('admin.loans.tableStatus')}</th>
                  <th>{t('admin.loans.tableDelay')}</th>
                  <th>{t('admin.loans.tableActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(e => {
                  const retard = isEmpruntEnRetard(e);
                  const isActive = e.statut === 'EN_COURS' || e.statut === 'EN_RETARD';
                  return (
                    <tr key={e.id_emprunt}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {loanDisplayId(e)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <div style={{ whiteSpace: 'nowrap' }}>{borrowerDisplayId(e)}</div>
                        {borrowerRole(e) && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {borrowerRole(e)}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{e.titre}</div>
                        {e.auteur && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{e.auteur}</div>}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {bookDisplayId(e)}
                      </td>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{borrowerDisplayName(e) || '—'}</td>
                      <td
                        title={borrowerEmail(e) || ''}
                        style={{
                          color: 'var(--text-secondary)',
                          fontSize: '0.82rem',
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {borrowerEmail(e) || '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{formatDDMMYYYY(e.date_emprunt)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{formatDDMMYYYY(e.date_retour_prevue)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{formatDDMMYYYY(e.date_retour_effectif)}</td>
                      <td><span className={`badge ${STATUT_BADGE[e.statut] || 'badge-gold'}`}>{formatStatus(e.statut, t)}</span></td>
                      <td>
                        <span className={`badge ${retard ? 'badge-danger' : 'badge-success'}`}>
                          {retard ? t('admin.loans.delayYes') : t('admin.loans.delayNo')}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="action-btn action-btn-info" onClick={() => setSelected(e)}>👁️ {t('admin.loans.details')}</button>
                        {isActive && (
                          <>
                            <button className="action-btn action-btn-success" onClick={() => retourner(e)}>📥 {t('admin.loans.returnAction')}</button>
                            <button className="action-btn action-btn-info" onClick={() => prolonger(e)}>⏱️ {t('admin.loans.extendAction')}</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredItems.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-text">{t('admin.loans.noLoans')}</div>
              </div>
            )}
          </div>
        )}
        {!filterActive && (
          <div className="pagination-bar">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← {t('admin.loans.previous')}</button>
            <span className="pagination-info">{t('admin.loans.pageSummary', { page, totalPages: Math.max(pagination.totalPages, 1) })}</span>
            <button className="btn-secondary" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>{t('admin.loans.next')} →</button>
            <select className="form-select pagination-limit" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        )}
      </div>

      <div className="emp-widgets-grid">
        <div className="panel emp-widget">
          <div className="panel-header"><div style={{ fontWeight: 600 }}>📚 {t('admin.loans.mostBorrowedBooks')}</div></div>
          <div className="panel-body">
            {topLivres.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('admin.loans.noDataYet')}</div>
            ) : (
              <ol className="emp-top-list">
                {topLivres.map((l, i) => {
                  const v = Number(l.nb_emprunts) || 0;
                  const pct = topMax > 0 ? Math.round((v / topMax) * 100) : 0;
                  return (
                    <li key={l.id_ressource || i}>
                      <div className="emp-top-rank">{i + 1}</div>
                      <div className="emp-top-info">
                        <div className="emp-top-title">{l.titre}</div>
                        <div className="emp-top-sub">{l.auteur || '—'}</div>
                        <div className="emp-top-bar"><div className="emp-top-bar-fill" style={{ width: `${pct}%` }} /></div>
                      </div>
                      <div className="emp-top-count">{v}</div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className="panel emp-widget">
          <div className="panel-header"><div style={{ fontWeight: 600 }}>📈 {t('admin.loans.loanTrends')}</div></div>
          <div className="panel-body" style={{ height: 240 }}>
            {parMois.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('admin.loans.notEnoughData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={parMois} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="empAreaGold" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c9a84c" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#c9a84c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="mois" stroke={chartTheme.axis} fontSize={11} />
                  <YAxis stroke={chartTheme.axis} fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={chartTheme.tooltip} />
                  <Area type="monotone" dataKey="total" name={t('admin.loans.total')} stroke="#c9a84c" fill="url(#empAreaGold)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="panel emp-widget">
          <div className="panel-header"><div style={{ fontWeight: 600 }}>🎯 {t('admin.loans.statusBreakdown')}</div></div>
          <div className="panel-body" style={{ height: 240 }}>
            {parStatut.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('admin.loans.noData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={parStatut} dataKey="total" nameKey="label" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {parStatut.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTheme.tooltip} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9ba3c4' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="panel emp-widget">
          <div className="panel-header"><div style={{ fontWeight: 600 }}>🕒 {t('admin.loans.recentActivity')}</div></div>
          <div className="panel-body">
            {activiteRecente.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('admin.loans.noRecentActivity')}</div>
            ) : (
              <ul className="emp-activity-list">
                {activiteRecente.slice(0, 6).map((a, i) => (
                  <li key={a.id_emprunt || i}>
                    <span className={`badge ${STATUT_BADGE[a.statut] || 'badge-gold'}`}>{formatStatus(a.statut, t)}</span>
                    <div className="emp-activity-text">
                      <div className="emp-activity-title">{a.titre}</div>
                      <div className="emp-activity-sub">
                        {a.prenom} {a.nom} · {formatDDMMYYYY(a.date_creation || a.date_emprunt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
    </>
  );
}
