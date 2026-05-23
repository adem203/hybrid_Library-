import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportAPI } from '../../api/api';
import './AdminSupportView.css';

const SUPPORT_PROBLEM_TYPES = [
  { value: 'Problème de réservation', i18nKey: 'admin.support.problemTypes.reservation' },
  { value: 'Problème d’emprunt', i18nKey: 'admin.support.problemTypes.loan' },
  { value: 'Problème de document numérique', i18nKey: 'admin.support.problemTypes.digitalDocument' },
  { value: 'Problème de compte', i18nKey: 'admin.support.problemTypes.account' },
  { value: 'Autre', i18nKey: 'admin.support.problemTypes.other' },
];

const STATUS_META = {
  EN_ATTENTE: { i18nKey: 'admin.support.statuses.pending', className: 'support-badge-pending' },
  REPONDU: { i18nKey: 'admin.support.statuses.answered', className: 'support-badge-replied' },
  FERME: { i18nKey: 'admin.support.statuses.closed', className: 'support-badge-closed' },
};

const ROLE_META = {
  ETUDIANT: { i18nKey: 'admin.support.roles.student', className: 'support-role-student' },
  ENSEIGNANT: { i18nKey: 'admin.support.roles.teacher', className: 'support-role-teacher' },
};

const FILTER_ALL = 'ALL';

const normalizeSupportKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const getRoleKey = (ticket) => {
  const raw = normalizeSupportKey(ticket?.requesterRole || ticket?.userRole || ticket?.student_role || '');
  if (raw === 'ETUDIANT' || raw === 'ENSEIGNANT') return raw;
  return null;
};

const getRoleLabel = (ticket, t) => {
  const key = getRoleKey(ticket);
  return key ? t(ROLE_META[key].i18nKey) : t('admin.support.roles.user');
};

const getStatusLabel = (status, t) => {
  const meta = STATUS_META[normalizeSupportKey(status)];
  return meta ? t(meta.i18nKey) : (status || '—');
};

const getProblemTypeLabel = (type, t) => {
  const item = SUPPORT_PROBLEM_TYPES.find((entry) => entry.value === type);
  return item ? t(item.i18nKey) : (type || '—');
};

const PAGE_SIZE = 6;

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
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

const getInitials = (prenom, nom) => {
  const a = (prenom || '').trim().charAt(0).toUpperCase();
  const b = (nom || '').trim().charAt(0).toUpperCase();
  return `${a}${b}` || '?';
};

const fullName = (ticket, t) =>
  `${ticket?.student_prenom || ''} ${ticket?.student_nom || ''}`.trim() || (t ? t('admin.support.roles.user') : 'Utilisateur');

function RoleBadge({ ticket }) {
  const { t } = useTranslation();
  const key = getRoleKey(ticket);
  const meta = key ? ROLE_META[key] : { i18nKey: 'admin.support.roles.user', className: 'support-role-neutral' };
  return <span className={`support-role-badge ${meta.className}`}>{t(meta.i18nKey)}</span>;
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const meta = STATUS_META[normalizeSupportKey(status)] || { className: 'support-badge-closed' };
  return <span className={`support-badge ${meta.className}`}>{getStatusLabel(status, t)}</span>;
}

function StatCard({ label, value, tone, icon, hint }) {
  return (
    <article className={`dashboard-stat-card dashboard-tone-${tone}`}>
      <div className="dashboard-stat-symbol" aria-hidden="true">{icon}</div>
      <div className="dashboard-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {hint && <em>{hint}</em>}
      </div>
    </article>
  );
}

export default function AdminSupportView() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [typeFilter, setTypeFilter] = useState(FILTER_ALL);
  const [roleFilter, setRoleFilter] = useState(FILTER_ALL);
  const [page, setPage] = useState(1);

  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  const fetchTickets = useCallback(async ({ keepSelectionId } = {}) => {
    try {
      setLoading(true);
      setError('');
      const res = await supportAPI.getAllSupportTickets();
      const data = Array.isArray(res?.data?.data) ? res.data.data : [];
      setTickets(data);

      if (keepSelectionId && data.some((t) => t.id_ticket === keepSelectionId)) {
        setSelectedTicketId(keepSelectionId);
      } else if (data.length > 0) {
        setSelectedTicketId((current) => {
          if (current && data.some((t) => t.id_ticket === current)) return current;
          return data[0].id_ticket;
        });
      } else {
        setSelectedTicketId(null);
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          t('admin.support.errors.loadTickets')
      );
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, typeFilter, roleFilter]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id_ticket === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  useEffect(() => {
    setReplyText(selectedTicket?.reponse_admin || '');
    setActionError('');
  }, [selectedTicket?.id_ticket, selectedTicket?.reponse_admin]);

  const stats = useMemo(() => {
    const counts = { EN_ATTENTE: 0, REPONDU: 0, FERME: 0 };
    tickets.forEach((t) => {
      if (counts[t.statut] !== undefined) counts[t.statut] += 1;
    });
    return { ...counts, total: tickets.length };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== FILTER_ALL && ticket.statut !== statusFilter) return false;
      if (typeFilter !== FILTER_ALL && ticket.type_probleme !== typeFilter) return false;
      if (roleFilter !== FILTER_ALL && getRoleKey(ticket) !== roleFilter) return false;
      if (!q) return true;
      const haystack = [
        fullName(ticket, t),
        ticket.student_email,
        ticket.sujet,
        ticket.type_probleme,
        ticket.message,
        getRoleLabel(ticket, t),
        getProblemTypeLabel(ticket.type_probleme, t),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tickets, searchQuery, statusFilter, typeFilter, roleFilter, t]);

  const pageCount = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedTickets = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredTickets.slice(start, start + PAGE_SIZE);
  }, [filteredTickets, safePage]);

  const rangeStart = filteredTickets.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filteredTickets.length);

  const handleSendReply = async () => {
    if (!selectedTicket) return;
    const text = replyText.trim();
    if (!text) {
      setActionError(t('admin.support.errors.emptyReply'));
      return;
    }
    try {
      setReplySubmitting(true);
      setActionError('');
      await supportAPI.replyToSupportTicket(selectedTicket.id_ticket, text);
      setToast(t('admin.support.messages.replySent'));
      await fetchTickets({ keepSelectionId: selectedTicket.id_ticket });
    } catch (err) {
      setActionError(
        err?.response?.data?.message || t('admin.support.errors.sendReply')
      );
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleChangeStatus = async (statut) => {
    if (!selectedTicket) return;
    try {
      setStatusBusy(true);
      setActionError('');
      await supportAPI.updateSupportTicketStatus(selectedTicket.id_ticket, statut);
      setToast(
        statut === 'FERME'
          ? t('admin.support.messages.ticketClosed')
          : statut === 'REPONDU'
          ? t('admin.support.messages.ticketResolved')
          : t('admin.support.messages.statusUpdated')
      );
      await fetchTickets({ keepSelectionId: selectedTicket.id_ticket });
    } catch (err) {
      setActionError(
        err?.response?.data?.message || t('admin.support.errors.updateStatus')
      );
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <section className="admin-support-page">
      <header className="admin-support-hero">
        <h1>
          {t('admin.support.title')} <span aria-hidden="true">🎧</span>
        </h1>
        <p>{t('admin.support.intro')}</p>
      </header>

      <div className="admin-support-stats">
        <StatCard
          label={t('admin.support.pendingTickets')}
          value={stats.EN_ATTENTE}
          tone="gold"
          icon="⏳"
          hint={t('admin.support.toProcess')}
        />
        <StatCard
          label={t('admin.support.answeredTickets')}
          value={stats.REPONDU}
          tone="green"
          icon="✓"
          hint={t('admin.support.replySent')}
        />
        <StatCard
          label={t('admin.support.closedTickets')}
          value={stats.FERME}
          tone="blue"
          icon="📁"
          hint={t('admin.support.archived')}
        />
        <StatCard
          label={t('admin.support.totalTickets')}
          value={stats.total}
          tone="purple"
          icon="🎫"
          hint={t('admin.support.sinceBeginning')}
        />
      </div>

      {error && <div className="admin-support-error">{error}</div>}

      <div className="admin-support-grid">
        {/* LEFT: tickets list */}
        <article className="admin-support-panel">
          <header className="admin-support-panel-header">
            <h2>
              <span aria-hidden="true">📋</span> {t('admin.support.tickets')}
            </h2>
          </header>

          <div className="admin-support-toolbar">
            <div className="admin-support-search">
              <span aria-hidden="true">🔍</span>
              <input
                type="text"
                placeholder={t('admin.support.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="admin-support-filters">
              <label>
                <span>{t('admin.support.statusLabel')}</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value={FILTER_ALL}>{t('admin.support.filterAll')}</option>
                  <option value="EN_ATTENTE">{t('admin.support.statuses.pending')}</option>
                  <option value="REPONDU">{t('admin.support.statuses.answered')}</option>
                  <option value="FERME">{t('admin.support.statuses.closed')}</option>
                </select>
              </label>
              <label>
                <span>{t('admin.support.typeLabel')}</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value={FILTER_ALL}>{t('admin.support.filterAll')}</option>
                  {SUPPORT_PROBLEM_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {t(type.i18nKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('admin.support.roleLabel')}</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value={FILTER_ALL}>{t('admin.support.filterAll')}</option>
                  <option value="ETUDIANT">{t('admin.support.roles.student')}</option>
                  <option value="ENSEIGNANT">{t('admin.support.roles.teacher')}</option>
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="admin-support-placeholder">{t('admin.support.loadingTickets')}</div>
          ) : tickets.length === 0 ? (
            <div className="admin-support-placeholder">
              {t('admin.support.noTicketsYet')}
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="admin-support-placeholder">
              {t('admin.support.noFilteredTickets')}
            </div>
          ) : (
            <ul className="admin-support-list">
              {pagedTickets.map((ticket) => {
                const selected = ticket.id_ticket === selectedTicketId;
                return (
                  <li
                    key={ticket.id_ticket}
                    className={`admin-support-list-item${selected ? ' is-selected' : ''}`}
                    onClick={() => setSelectedTicketId(ticket.id_ticket)}
                  >
                    <div className="admin-support-avatar" aria-hidden="true">
                      {getInitials(ticket.student_prenom, ticket.student_nom)}
                    </div>
                    <div className="admin-support-item-body">
                      <div className="admin-support-item-row">
                        <div className="admin-support-item-sender">
                          <strong>{fullName(ticket, t)}</strong>
                          <RoleBadge ticket={ticket} />
                        </div>
                        <span className="admin-support-item-date">
                          {formatDateTime(ticket.date_creation)}
                        </span>
                      </div>
                      <div className="admin-support-item-email">{ticket.student_email}</div>
                      <div className="admin-support-item-row">
                        <span className="admin-support-item-subject">{ticket.sujet}</span>
                        <StatusBadge status={ticket.statut} />
                      </div>
                      <div className="admin-support-item-type">{getProblemTypeLabel(ticket.type_probleme, t)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {filteredTickets.length > 0 && (
            <footer className="admin-support-pagination">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                {t('admin.common.previous')}
              </button>
              <span>
                {t('admin.support.pageSummary', { page: safePage, total: pageCount })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={safePage >= pageCount}
              >
                {t('admin.common.next')}
              </button>
              <span className="admin-support-pagination-info">
                {t('admin.support.paginationInfo', { start: rangeStart, end: rangeEnd, total: filteredTickets.length })}
              </span>
            </footer>
          )}
        </article>

        {/* RIGHT: details */}
        <article className="admin-support-panel">
          <header className="admin-support-panel-header admin-support-detail-header">
            <h2>
              <span aria-hidden="true">ℹ️</span> {t('admin.support.ticketDetails')}
            </h2>
            {selectedTicket && (
              <span className="admin-support-ticket-id">
                {t('admin.support.ticketId')}: #TKT-{String(selectedTicket.id_ticket).padStart(4, '0')}
              </span>
            )}
          </header>

          {!selectedTicket ? (
            <div className="admin-support-placeholder">
              {t('admin.support.noTicketSelected')}
            </div>
          ) : (
            <div className="admin-support-detail">
              <div className="admin-support-detail-top">
                <div className="admin-support-student">
                  <div className="admin-support-avatar admin-support-avatar-lg" aria-hidden="true">
                    {getInitials(selectedTicket.student_prenom, selectedTicket.student_nom)}
                  </div>
                  <div>
                    <div className="admin-support-student-name">
                      {fullName(selectedTicket, t)}
                      <RoleBadge ticket={selectedTicket} />
                    </div>
                    <div className="admin-support-student-meta">
                      {selectedTicket.student_email}
                    </div>
                    <div className="admin-support-student-meta">
                      {t('admin.support.roleLabel')}: {getRoleLabel(selectedTicket, t)}
                    </div>
                    {selectedTicket.student_matricule && (
                      <div className="admin-support-student-meta">
                        {t('admin.support.registrationNumber')}: {selectedTicket.student_matricule}
                      </div>
                    )}
                  </div>
                </div>

                <div className="admin-support-resource">
                  <span className="admin-support-label">{t('admin.support.resource')}</span>
                  <div className="admin-support-resource-value">
                    {selectedTicket.related_text || t('admin.support.notSpecified')}
                  </div>
                </div>
              </div>

              <div className="admin-support-detail-grid">
                <div>
                  <span className="admin-support-label">{t('admin.support.subject')}</span>
                  <div className="admin-support-value">{selectedTicket.sujet}</div>
                </div>
                <div>
                  <span className="admin-support-label">{t('admin.support.status')}</span>
                  <div>
                    <StatusBadge status={selectedTicket.statut} />
                  </div>
                </div>
                <div>
                  <span className="admin-support-label">{t('admin.support.type')}</span>
                  <div className="admin-support-value">{getProblemTypeLabel(selectedTicket.type_probleme, t)}</div>
                </div>
                <div>
                  <span className="admin-support-label">{t('admin.support.createdAt')}</span>
                  <div className="admin-support-value">
                    {formatDateTime(selectedTicket.date_creation)}
                  </div>
                </div>
              </div>

              <div>
                <span className="admin-support-label">{t('admin.support.requesterMessage')}</span>
                <div className="admin-support-message-box">
                  {selectedTicket.message || '—'}
                </div>
              </div>

              <div className="admin-support-reply">
                <span className="admin-support-label">{t('admin.support.adminResponse')}</span>
                <textarea
                  className="admin-support-textarea"
                  placeholder={t('admin.support.replyPlaceholder')}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={6}
                  disabled={selectedTicket.statut === 'FERME'}
                />
                {actionError && (
                  <div className="admin-support-inline-error">{actionError}</div>
                )}
                <div className="admin-support-actions">
                  <button
                    type="button"
                    className="admin-support-btn admin-support-btn-primary"
                    onClick={handleSendReply}
                    disabled={replySubmitting || selectedTicket.statut === 'FERME'}
                  >
                    {replySubmitting ? t('admin.support.sending') : `✈ ${t('admin.support.sendReply')}`}
                  </button>
                  <button
                    type="button"
                    className="admin-support-btn admin-support-btn-secondary"
                    onClick={() => handleChangeStatus('REPONDU')}
                    disabled={statusBusy || selectedTicket.statut === 'FERME'}
                  >
                    ✓ {t('admin.support.markResolved')}
                  </button>
                  <button
                    type="button"
                    className="admin-support-btn admin-support-btn-danger"
                    onClick={() => handleChangeStatus('FERME')}
                    disabled={statusBusy || selectedTicket.statut === 'FERME'}
                  >
                    🔒 {t('admin.support.closeTicket')}
                  </button>
                </div>
              </div>

              <div className="admin-support-history">
                <span className="admin-support-label">{t('admin.support.ticketHistory')}</span>
                <ul>
                  <li>
                    <span className="admin-support-history-dot" />
                    <div>
                      <strong>{t('admin.support.requesterMessage')}</strong>
                      <em>{formatDateTime(selectedTicket.date_creation)}</em>
                    </div>
                  </li>
                  {selectedTicket.reponse_admin && selectedTicket.date_reponse && (
                    <li>
                      <span className="admin-support-history-dot admin-support-history-dot-replied" />
                      <div>
                        <strong>{t('admin.support.adminReply')}</strong>
                        <em>{formatDateTime(selectedTicket.date_reponse)}</em>
                      </div>
                    </li>
                  )}
                  <li>
                    <span className="admin-support-history-dot admin-support-history-dot-status" />
                    <div>
                      <strong>{t('admin.support.status')}</strong>
                      <em>
                        {getStatusLabel(selectedTicket.statut, t)}
                      </em>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </article>
      </div>

      {toast && <div className="admin-support-toast">{toast}</div>}
    </section>
  );
}
