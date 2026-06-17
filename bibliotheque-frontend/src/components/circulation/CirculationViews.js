// Shared "My Loans" / "My Reservations" tracking views.
//
// These recreate the exact look & behaviour of the Student dashboard pages
// (same `me-*` / `mr-*` CSS classes, same `student.*` i18n keys) so they can be
// reused inside other role spaces (e.g. the Teacher dashboard) without
// duplicating the markup in each page. The components are self-contained:
// they own their search / filter / pagination / details-modal state and only
// need the data array, a loading flag, and a couple of action callbacks.
//
// The backend loan/reservation endpoints are already scoped to the
// authenticated user (req.user.id_user), so passing the caller's own data here
// keeps every role limited to their own records.

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveAssetUrl } from '../../api/api';
// Reuse the Student dashboard styles (me-* / mr-* classes). CSS imports are
// global, so this is a no-op when the host page already imports it.
import '../../pages/EtudiantDashboard/EtudiantDashboard.css';

const LOAN_PAGE_SIZE = 5;
const RESV_PAGE_SIZE = 4;

// ── Cover placeholder (deterministic palette + initials) ──────────────
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

const normalizeText = (value) => (value || '')
  .toString()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

function formatDateLong(value, language = 'fr') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

const formatDate = (date, withTime = false, language = 'fr') => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(language, withTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : undefined);
};

function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// ── Status maps (identical to the Student dashboard) ──────────────────
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

const getLoanRequestDate = (loan) => loan.date_creation || loan.date_emprunt || loan.date_modification;

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
  if (loan.statut === 'ANNULE') return t('student.loans.requestCancelled');
  if (loan.statut === 'REFUSE') return t('student.loans.requestRejected');
  return formatLoanStatus(loan.statut, t);
};

// ── Shared pagination (mirror of the Student dashboard Pagination) ────
function Pagination({ page, totalPages, total, onChange, itemLabelKey = 'student.catalog.bookCount' }) {
  const { t } = useTranslation();
  if (totalPages <= 1) {
    return total > 0 ? (
      <div className="pagination-info-only">{t(itemLabelKey, { count: total })}</div>
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

// ── Loan details modal (mirror of the Student dashboard modal) ────────
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

// ── MY LOANS ──────────────────────────────────────────────────────────
export function MyLoansView({ emprunts = [], loading = false, onCancel }) {
  const { t, i18n } = useTranslation();
  const [loanSearch, setLoanSearch] = useState('');
  const [loanStatusFilter, setLoanStatusFilter] = useState('');
  const [loanPage, setLoanPage] = useState(1);
  const [selectedLoan, setSelectedLoan] = useState(null);

  useEffect(() => { setLoanPage(1); }, [loanSearch, loanStatusFilter]);

  const stats = useMemo(() => {
    const s = { actifs: 0, attente: 0, retournes: 0, refuses: 0 };
    for (const e of emprunts) {
      if (e.statut === 'EN_COURS' || e.statut === 'EN_RETARD') s.actifs++;
      else if (e.statut === 'EN_ATTENTE') s.attente++;
      else if (e.statut === 'RETOURNE') s.retournes++;
      else if (e.statut === 'REFUSE') s.refuses++;
    }
    return s;
  }, [emprunts]);

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

  const sorted = [...filtered].sort((a, b) => {
    const da = new Date(getLoanRequestDate(a) || 0).getTime();
    const db = new Date(getLoanRequestDate(b) || 0).getTime();
    return db - da;
  });

  const filteredCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / LOAN_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, loanPage), totalPages);
  const firstIdx = filteredCount === 0 ? 0 : (safePage - 1) * LOAN_PAGE_SIZE + 1;
  const lastIdx = Math.min(safePage * LOAN_PAGE_SIZE, filteredCount);
  const pageRows = sorted.slice((safePage - 1) * LOAN_PAGE_SIZE, safePage * LOAN_PAGE_SIZE);

  const resetLoanFilters = () => {
    setLoanSearch('');
    setLoanStatusFilter('');
  };

  const handleCancel = (id) => {
    if (onCancel) onCancel(id);
    if (selectedLoan?.id_emprunt === id) setSelectedLoan(null);
  };

  const statCards = [
    { key: 'actifs', label: t('student.loans.activeLoans'), value: stats.actifs, tone: 'active', icon: '📚', sub: t('student.loans.ongoingLoansSub') },
    { key: 'attente', label: t('student.statusBadges.pending'), value: stats.attente, tone: 'pending', icon: '⏳', sub: t('student.loans.pendingRequestsSub') },
    { key: 'retournes', label: t('student.loans.returnedLoans'), value: stats.retournes, tone: 'returned', icon: '✓', sub: t('student.loans.returnedLoansSub') },
    { key: 'refuses', label: t('student.statusBadges.rejectedMasculine'), value: stats.refuses, tone: 'refused', icon: '✕', sub: t('student.loans.rejectedRequestsSub') },
  ];

  return (
    <section className="me-page">
      <div className="me-header">
        <div className="me-header-icon" aria-hidden="true">📚</div>
        <div className="me-header-text">
          <h1 className="me-header-title">{t('student.loans.title')}</h1>
          <p className="me-header-sub">{t('student.loans.intro')}</p>
        </div>
      </div>

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
        <button type="button" className="me-reset-btn" onClick={resetLoanFilters}>
          ⟳ {t('student.actions.reset')}
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : emprunts.length === 0 ? (
        <div className="me-empty">
          <div className="empty-state-icon">📚</div>
          <div className="empty-state-text">{t('student.loans.empty')}</div>
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
                EN_COURS: 'success',
                EN_ATTENTE: 'pending',
                EN_RETARD: 'danger',
                RETOURNE: 'info',
                ANNULE: 'muted',
                REFUSE: 'danger',
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
                      {loan.isbn && <span className="me-row-isbn">· ISBN: {loan.isbn}</span>}
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
                          onClick={() => handleCancel(loan.id_emprunt)}
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

      <LoanDetailsModal loan={selectedLoan} onClose={() => setSelectedLoan(null)} />
    </section>
  );
}

// ── MY RESERVATIONS ─────────────────────────────────────────────────────
export function MyReservationsView({ reservations = [], loading = false, onCancel, onOpenBookDetails }) {
  const { t, i18n } = useTranslation();
  const [searchRes, setSearchRes] = useState('');
  const [filterStatutRes, setFilterStatutRes] = useState('');
  const [resvPage, setResvPage] = useState(1);

  useEffect(() => { setResvPage(1); }, [searchRes, filterStatutRes]);

  const counts = useMemo(() => {
    const c = { EN_ATTENTE: 0, CONFIRMEE: 0, EXPIREE: 0, ANNULEE: 0 };
    for (const r of reservations) {
      if (c[r.statut] !== undefined) c[r.statut]++;
    }
    return c;
  }, [reservations]);
  const total = reservations.length;

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

  const sorted = [...filtered].sort((a, b) => {
    const da = new Date(a.date_reservation || 0).getTime();
    const db = new Date(b.date_reservation || 0).getTime();
    return db - da;
  });

  const filteredCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / RESV_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, resvPage), totalPages);
  const firstIdx = filteredCount === 0 ? 0 : (safePage - 1) * RESV_PAGE_SIZE + 1;
  const lastIdx = Math.min(safePage * RESV_PAGE_SIZE, filteredCount);
  const pageRows = sorted.slice((safePage - 1) * RESV_PAGE_SIZE, safePage * RESV_PAGE_SIZE);

  const resetResvFilters = () => {
    setSearchRes('');
    setFilterStatutRes('');
  };

  const openDetails = (idLivre) => { if (onOpenBookDetails) onOpenBookDetails(idLivre); };

  const statCards = [
    { key: 'EN_ATTENTE', label: t('student.statusBadges.pending'), value: counts.EN_ATTENTE, tone: 'pending', icon: '⏳', sub: t('student.reservations.requestCount', { count: counts.EN_ATTENTE }) },
    { key: 'CONFIRMEE', label: t('student.reservations.approvedPlural'), value: counts.CONFIRMEE, tone: 'success', icon: '✓', sub: t('student.reservations.reservationLabel', { count: counts.CONFIRMEE }) },
    { key: 'EXPIREE', label: t('student.reservations.expiredPlural'), value: counts.EXPIREE, tone: 'info', icon: '⏰', sub: t('student.reservations.reservationLabel', { count: counts.EXPIREE }) },
    { key: 'ANNULEE', label: t('student.reservations.cancelledRejected'), value: counts.ANNULEE, tone: 'danger', icon: '✕', sub: t('student.reservations.reservationLabel', { count: counts.ANNULEE }) },
  ];

  const RESV_TONE_COLOR = {
    EN_ATTENTE: '#fcd34d',
    CONFIRMEE: '#86efac',
    EXPIREE: '#93c5fd',
    ANNULEE: '#fca5a5',
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
          <div className="mr-header">
            <div className="mr-header-text">
              <h1 className="mr-header-title">
                {t('student.reservations.title')} <span aria-hidden="true">📌</span>
              </h1>
              <p className="mr-header-sub">{t('student.reservations.intro')}</p>
            </div>
            <div className="mr-header-art" aria-hidden="true">
              <span className="mr-header-art-book b1" />
              <span className="mr-header-art-book b2" />
              <span className="mr-header-art-book b3" />
            </div>
          </div>

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

          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : reservations.length === 0 ? (
            <div className="mr-empty">
              <div className="empty-state-icon">📌</div>
              <div className="empty-state-text">{t('student.reservations.empty')}</div>
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
                    CONFIRMEE: 'success',
                    EXPIREE: 'info',
                    ANNULEE: 'danger',
                  })[r.statut] || 'muted';
                  const statusSub = ({
                    EN_ATTENTE: t('student.reservations.statusSub.pending'),
                    CONFIRMEE: t('student.reservations.statusSub.approved'),
                    EXPIREE: t('student.reservations.statusSub.expired'),
                    ANNULEE: t('student.reservations.statusSub.cancelled'),
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
                          onClick={() => openDetails(r.id_livre)}
                        >
                          {t('student.actions.details')}
                        </button>
                        {canCancelReservation(r.statut) && (
                          <button
                            type="button"
                            className="mr-btn mr-btn-cancel"
                            onClick={() => onCancel && onCancel(r.id_reservation)}
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

        <aside className="mr-sidebar">
          <section className="mr-widget mr-info-card">
            <div className="mr-widget-header">
              <span className="mr-info-icon" aria-hidden="true">ⓘ</span>
              <h3 className="mr-widget-title">{t('student.reservations.about')}</h3>
            </div>
            <p className="mr-info-text">{t('student.reservations.aboutText')}</p>
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
                      CONFIRMEE: 'success',
                      EXPIREE: 'info',
                      ANNULEE: 'danger',
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
                            onClick={() => openDetails(r.id_livre)}
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
}
