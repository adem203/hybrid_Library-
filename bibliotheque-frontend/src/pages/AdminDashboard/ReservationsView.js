import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import { empruntsAPI } from '../../api/api';
import { DetailsModal } from './circulationShared';
import DateField from '../../components/DateField/DateField';
import { useChartTheme } from '../../utils/chartTheme';
import './ReservationsView.css';

const RES_STATUS_KEY = {
  EN_ATTENTE: 'admin.reservations.statuses.pending',
  CONFIRMEE: 'admin.reservations.statuses.approved',
  ANNULEE: 'admin.reservations.statuses.cancelled',
  REFUSE: 'admin.reservations.statuses.rejected',
  REFUSEE: 'admin.reservations.statuses.rejected',
  EXPIREE: 'admin.reservations.statuses.expired',
};

const RES_STATUS_TONE = {
  EN_ATTENTE: 'pending',
  CONFIRMEE: 'approved',
  ANNULEE: 'cancelled',
  REFUSE: 'cancelled',
  REFUSEE: 'cancelled',
  EXPIREE: 'expired',
};

const STATUS_COLORS = {
  EN_ATTENTE: '#d6a76b',
  CONFIRMEE: '#10d48e',
  ANNULEE: '#ef4444',
  REFUSE: '#ef4444',
  REFUSEE: '#ef4444',
  EXPIREE: '#f59e0b',
};

const refusedStatuses = new Set(['REFUSE', 'REFUSEE']);
const cancelledStatuses = new Set(['ANNULEE', 'REFUSE', 'REFUSEE']);
const PAGE_SIZE = 10;

const pad2 = (n) => String(n).padStart(2, '0');
const normalizeSearch = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' });
};

const firstValue = (...values) => values.find(value => value !== null && value !== undefined && String(value).trim() !== '') ?? null;
const borrowerSource = (row) => row?.user || row?.borrower || row?.emprunteur || row?.student || row?.teacher || {};
const normalizeReservationId = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = /^RES-?(\d+)$/i.exec(text);
  return match ? Number(match[1]) : value;
};
const reservationRawIdOf = (row) => firstValue(row?.id_reservation, row?.reservation?.id_reservation, row?.reservation?.id, row?.id);
const reservationIdOf = (row) => normalizeReservationId(reservationRawIdOf(row));
const borrowerIdOf = (row) => {
  const borrower = borrowerSource(row);
  return firstValue(
    row?.id_user,
    row?.id_emprunteur,
    borrower?.id_user,
    borrower?.id_emprunteur,
    borrower?.id_student,
    borrower?.id_teacher,
    borrower?.id
  );
};
const realBorrowerMatricule = (row) => {
  const borrower = borrowerSource(row);
  return firstValue(
    row?.matricule,
    row?.matricule_emprunteur,
    borrower?.matricule,
    borrower?.numero_matricule,
    row?.student?.matricule,
    row?.teacher?.matricule
  );
};
const reservationDisplayId = (row) => {
  const rawId = reservationRawIdOf(row);
  const id = reservationIdOf(row);
  if (id == null) return '—';
  if (/^RES-?\d+$/i.test(String(rawId).trim())) return `RES-${String(id).padStart(3, '0')}`;
  return Number.isFinite(Number(id)) ? `RES-${String(id).padStart(3, '0')}` : String(id);
};

const borrowerFirstName = (row) => firstValue(row?.prenom, borrowerSource(row)?.prenom, borrowerSource(row)?.firstName, borrowerSource(row)?.first_name);
const borrowerLastName = (row) => firstValue(row?.nom, borrowerSource(row)?.nom, borrowerSource(row)?.lastName, borrowerSource(row)?.last_name);
const borrowerEmail = (row) => firstValue(row?.email, borrowerSource(row)?.email);
const borrowerRole = (row) => firstValue(row?.role, borrowerSource(row)?.role);
const borrowerName = (row) => [borrowerFirstName(row), borrowerLastName(row)].filter(Boolean).join(' ').trim() || '—';
const borrowerMatricule = (row, t) => {
  const borrowerId = borrowerIdOf(row);
  const userIdLabel = typeof t === 'function' ? t('admin.reservations.userId') : 'ID utilisateur';
  return realBorrowerMatricule(row) || (borrowerId != null ? `${userIdLabel} ${borrowerId}` : '—');
};
const statusLabel = (statut, t) => {
  const key = RES_STATUS_KEY[statut];
  return key && typeof t === 'function' ? t(key) : statut || '—';
};
const statusTone = (statut) => RES_STATUS_TONE[statut] || 'expired';

const exportReservationsCSV = (rows, t) => {
  const headers = [
    t('admin.reservations.csv.reservationId'),
    t('admin.reservations.csv.borrower'),
    t('admin.reservations.csv.borrowerRegistration'),
    t('admin.reservations.csv.role'),
    t('admin.reservations.csv.book'),
    t('admin.reservations.csv.author'),
    t('admin.reservations.csv.isbn'),
    t('admin.reservations.csv.date'),
    t('admin.reservations.csv.status'),
  ];
  const esc = (value) => {
    if (value === null || value === undefined) return '';
    const s = String(value).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(row => {
    lines.push([
      reservationDisplayId(row),
      borrowerName(row),
      borrowerMatricule(row, t),
      borrowerRole(row) || '',
      row.titre || '',
      row.auteur || '',
      row.isbn || '',
      formatDate(row.date_reservation),
      statusLabel(row.statut, t),
    ].map(esc).join(','));
  });

  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reservations-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const matchesSearch = (row, terms) => {
  if (!terms.length) return true;
  const groups = [
    [
      borrowerName(row),
      borrowerMatricule(row),
      borrowerRole(row),
      borrowerEmail(row),
    ],
    [
      row.titre,
      row.auteur,
      row.isbn,
      row.id_livre,
    ],
    [
      reservationDisplayId(row),
      row.id_reservation,
      statusLabel(row.statut),
      row.statut,
    ],
  ];

  return groups.some(group => {
    const haystack = normalizeSearch(group.filter(Boolean).join(' '));
    return terms.every(term => haystack.includes(term));
  });
};

const matchesStatus = (row, value) => {
  if (!value) return true;
  if (value === 'CANCELLED') return cancelledStatuses.has(row.statut);
  if (value === 'REFUSED') return refusedStatuses.has(row.statut);
  return row.statut === value;
};

const matchesDateRange = (row, dateMin, dateMax) => {
  if (!row.date_reservation) return true;
  const t = new Date(row.date_reservation).getTime();
  if (Number.isNaN(t)) return true;
  if (dateMin && t < new Date(dateMin).getTime()) return false;
  if (dateMax && t > new Date(dateMax).getTime() + 24 * 3600 * 1000 - 1) return false;
  return true;
};

const StatCard = ({ label, value, meta, icon, tone }) => (
  <div className={`res-stat-card res-tone-${tone}`}>
    <div className="res-stat-icon">{icon}</div>
    <div className="res-stat-content">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{meta}</em>
    </div>
  </div>
);

export default function ReservationsView() {
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [dateMin, setDateMin] = useState('');
  const [dateMax, setDateMax] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [flash, setFlash] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await empruntsAPI.getAllReservations({ page: 1, limit: 10000 });
      setItems(response.data?.data || []);
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.reservations.errors.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statut, dateMin, dateMax]);

  const stats = items.reduce((acc, row) => {
    acc.total += 1;
    if (row.statut === 'EN_ATTENTE') acc.pending += 1;
    if (row.statut === 'CONFIRMEE') acc.approved += 1;
    if (cancelledStatuses.has(row.statut)) acc.cancelled += 1;
    return acc;
  }, { total: 0, pending: 0, approved: 0, cancelled: 0 });

  const pct = (value) => (stats.total > 0 ? Math.round((value / stats.total) * 100) : 0);
  const approvalRate = pct(stats.approved);
  const normalizedSearch = normalizeSearch(search);
  const searchTerms = normalizedSearch.split(' ').filter(Boolean);
  const filteredItems = items.filter(row => (
    matchesSearch(row, searchTerms)
    && matchesStatus(row, statut)
    && matchesDateRange(row, dateMin, dateMax)
  ));
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const recentItems = [...items]
    .sort((a, b) => new Date(b.date_reservation || 0) - new Date(a.date_reservation || 0))
    .slice(0, 5);
  const distribution = [
    { name: t('admin.reservations.approved'), value: stats.approved, color: STATUS_COLORS.CONFIRMEE },
    { name: t('admin.reservations.pending'), value: stats.pending, color: STATUS_COLORS.EN_ATTENTE },
    { name: t('admin.reservations.cancelled'), value: stats.cancelled, color: STATUS_COLORS.ANNULEE },
  ].filter(item => item.value > 0);

  const approve = async (row) => {
    const id = reservationIdOf(row);
    if (id == null) {
      setFlash({ type: 'error', text: t('admin.reservations.errors.missingId') });
      return;
    }
    setActionLoading({ id, type: 'approve' });
    try {
      await empruntsAPI.approveReservation(id);
      setItems(prev => prev.map(item => (
        reservationIdOf(item) === id ? { ...item, statut: 'CONFIRMEE' } : item
      )));
      setFlash({ type: 'success', text: t('admin.reservations.messages.approved') });
      await load();
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.reservations.errors.generic') });
    } finally {
      setActionLoading(null);
    }
  };

  const cancel = async (row) => {
    const id = reservationIdOf(row);
    if (id == null) {
      setFlash({ type: 'error', text: t('admin.reservations.errors.missingId') });
      return;
    }
    if (!window.confirm(t('admin.reservations.confirmCancel'))) return;
    setActionLoading({ id, type: 'cancel' });
    try {
      await empruntsAPI.cancelReservation(id);
      setItems(prev => prev.map(item => (
        reservationIdOf(item) === id ? { ...item, statut: 'ANNULEE' } : item
      )));
      setFlash({ type: 'success', text: t('admin.reservations.messages.cancelled') });
      await load();
    } catch (err) {
      setFlash({ type: 'error', text: err.response?.data?.message || t('admin.reservations.errors.generic') });
    } finally {
      setActionLoading(null);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setStatut('');
    setDateMin('');
    setDateMax('');
  };

  return (
    <div className="res-page">
      <div className="res-hero">
        <div className="res-hero-title">
          <div className="res-hero-icon">▦</div>
          <div>
            <h1>{t('admin.reservations.title')}</h1>
            <p>{t('admin.reservations.intro')}</p>
          </div>
        </div>
        <button type="button" className="btn-secondary res-export-top" onClick={() => exportReservationsCSV(filteredItems, t)} disabled={filteredItems.length === 0}>
          {t('admin.reservations.export')}
        </button>
      </div>

      {flash && (
        <div className={`auth-alert auth-alert-${flash.type === 'success' ? 'success' : 'error'} res-alert`}>
          <span>{flash.text}</span>
          <button onClick={() => setFlash(null)} aria-label={t('admin.common.close')}>×</button>
        </div>
      )}

      <div className="res-stats-grid">
        <StatCard label={t('admin.reservations.pending')} value={stats.pending} meta={`${pct(stats.pending)}% ${t('admin.reservations.ofTotal')}`} icon="⌛" tone="pending" />
        <StatCard label={t('admin.reservations.approved')} value={stats.approved} meta={`${pct(stats.approved)}% ${t('admin.reservations.ofTotal')}`} icon="✓" tone="approved" />
        <StatCard label={t('admin.reservations.cancelled')} value={stats.cancelled} meta={`${pct(stats.cancelled)}% ${t('admin.reservations.ofTotal')}`} icon="×" tone="cancelled" />
        <StatCard label={t('admin.reservations.totalReservations')} value={stats.total} meta={t('admin.reservations.allPeriods')} icon="□" tone="total" />
      </div>

      <div className="res-dashboard-grid">
        <section className="res-main-panel">
          <div className="res-toolbar">
            <div className="res-toolbar-fields">
              <input
                className="form-input res-search"
                placeholder={t('admin.reservations.searchPlaceholder')}
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              <select className="form-select res-status-select" value={statut} onChange={event => setStatut(event.target.value)}>
                <option value="">{t('admin.reservations.allStatuses')}</option>
                <option value="EN_ATTENTE">{t('admin.reservations.statuses.pending')}</option>
                <option value="CONFIRMEE">{t('admin.reservations.statuses.approved')}</option>
                <option value="ANNULEE">{t('admin.reservations.statuses.cancelled')}</option>
                <option value="REFUSED">{t('admin.reservations.statuses.rejected')}</option>
                <option value="EXPIREE">{t('admin.reservations.statuses.expired')}</option>
              </select>
              <div className="res-date-filter">
                <DateField className="res-date-input" value={dateMin} onChange={setDateMin} max={dateMax || ''} ariaLabel={t('admin.reservations.from')} />
                <span>→</span>
                <DateField className="res-date-input" value={dateMax} onChange={setDateMax} min={dateMin || ''} ariaLabel={t('admin.reservations.to')} />
              </div>
            </div>
            <div className="res-toolbar-actions">
              {(search || statut || dateMin || dateMax) && (
                <button type="button" className="btn-secondary res-reset" onClick={resetFilters}>{t('admin.common.reset')}</button>
              )}
              <button type="button" className="btn-primary res-export" onClick={() => exportReservationsCSV(filteredItems, t)} disabled={filteredItems.length === 0}>
                {t('admin.reservations.export')}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : (
            <div className="res-table-wrap">
              <table className="res-table">
                <thead>
                  <tr>
                    <th>{t('admin.reservations.tableBorrower')}</th>
                    <th>{t('admin.reservations.tableBorrowerRegistration')}</th>
                    <th>{t('admin.reservations.tableBook')}</th>
                    <th>{t('admin.reservations.tableDate')}</th>
                    <th>{t('admin.reservations.tableStatus')}</th>
                    <th>{t('admin.common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(row => {
                    const id = reservationIdOf(row);
                    const isBusy = actionLoading?.id === id;
                    return (
                      <tr key={id || `${row.id_user}-${row.id_livre}-${row.date_reservation}`}>
                        <td>
                          <div className="res-borrower-cell">
                            <div>
                              <strong>{borrowerName(row)}</strong>
                              <span>{reservationDisplayId(row)}{borrowerEmail(row) ? ` · ${borrowerEmail(row)}` : ''}</span>
                            </div>
                          </div>
                        </td>
                        <td className="res-mono">
                          <div>{borrowerMatricule(row, t)}</div>
                          {borrowerRole(row) && <span>{borrowerRole(row)}</span>}
                        </td>
                        <td>
                          <div className="res-book-title">{row.titre || '—'}</div>
                          {row.auteur && <div className="res-book-meta">{row.auteur}</div>}
                        </td>
                        <td className="res-mono">{formatDate(row.date_reservation)}</td>
                        <td>
                          <span className={`res-badge res-badge-${statusTone(row.statut)}`}>
                            {statusLabel(row.statut, t)}
                          </span>
                        </td>
                        <td>
                          <div className="res-actions">
                            <button type="button" className="action-btn action-btn-info" onClick={() => setSelected(row)} disabled={isBusy}>{t('admin.reservations.details')}</button>
                            {row.statut === 'EN_ATTENTE' && (
                              <button type="button" className="action-btn action-btn-success" onClick={() => approve(row)} disabled={isBusy}>
                                {isBusy && actionLoading?.type === 'approve' ? t('admin.reservations.approving') : t('admin.reservations.approve')}
                              </button>
                            )}
                            {(row.statut === 'EN_ATTENTE' || row.statut === 'CONFIRMEE') && (
                              <button type="button" className="action-btn action-btn-danger" onClick={() => cancel(row)} disabled={isBusy}>
                                {isBusy && actionLoading?.type === 'cancel' ? t('admin.reservations.cancelling') : t('admin.reservations.cancel')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginatedItems.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">▦</div>
                  <div className="empty-state-text">{t('admin.reservations.empty')}</div>
                </div>
              )}
            </div>
          )}

          <div className="res-pagination">
            <span>{t('admin.reservations.showing', {
              from: filteredItems.length === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1,
              to: Math.min(currentPage * PAGE_SIZE, filteredItems.length),
              total: filteredItems.length,
            })}</span>
            <div>
              <button type="button" className="btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>{t('admin.common.previous')}</button>
              <span className="res-page-pill">{currentPage}</span>
              <button type="button" className="btn-secondary" disabled={currentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>{t('admin.common.next')}</button>
            </div>
          </div>
        </section>

        <aside className="res-side">
          <section className="res-side-card">
            <div className="res-side-header">
              <h2>{t('admin.reservations.recentActivity')}</h2>
            </div>
            <div className="res-activity-list">
              {recentItems.length === 0 ? (
                <div className="res-empty-mini">{t('admin.reservations.noRecentActivity')}</div>
              ) : recentItems.map(row => (
                <div className="res-activity-item" key={`activity-${row.id_reservation}`}>
                  <div className={`res-activity-icon res-badge-${statusTone(row.statut)}`}>
                    {row.statut === 'CONFIRMEE' ? '✓' : cancelledStatuses.has(row.statut) ? '×' : '⌛'}
                  </div>
                  <div>
                    <strong>
                      {row.statut === 'CONFIRMEE'
                        ? t('admin.reservations.activityApproved')
                        : cancelledStatuses.has(row.statut)
                          ? t('admin.reservations.activityCancelled')
                          : t('admin.reservations.activityNew')}
                    </strong>
                    <span>{t('admin.reservations.activityLine', {
                      book: row.titre || t('admin.reservations.bookFallback'),
                      borrower: borrowerName(row),
                    })}</span>
                  </div>
                  <em>{formatTime(row.date_reservation)}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="res-side-card">
            <div className="res-side-header">
              <h2>{t('admin.reservations.overview')}</h2>
            </div>
            <div className="res-donut-wrap">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={distribution} innerRadius={46} outerRadius={68} dataKey="value" paddingAngle={2}>
                    {distribution.map(item => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTheme.tooltip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="res-donut-center">
                <strong>{stats.total}</strong>
                <span>{t('admin.reservations.total')}</span>
              </div>
            </div>
            <div className="res-distribution-list">
              {distribution.map(item => (
                <div key={item.name}>
                  <span><i style={{ background: item.color }} />{item.name}</span>
                  <strong>{item.value} ({pct(item.value)}%)</strong>
                </div>
              ))}
              {distribution.length === 0 && <div className="res-empty-mini">{t('admin.reservations.noData')}</div>}
            </div>
          </section>

          <section className="res-side-card res-rate-card">
            <div>
              <h2>{t('admin.reservations.approvalRate')}</h2>
              <p>{t('admin.reservations.approvedReservationsCount', { count: stats.approved })}</p>
            </div>
            <div className="res-rate-ring" style={{ '--rate': `${approvalRate * 3.6}deg` }}>
              <strong>{approvalRate}%</strong>
            </div>
          </section>
        </aside>
      </div>

      {selected && <DetailsModal kind="reservation" data={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
