import React from 'react';
import { useTranslation } from 'react-i18next';

export const RES_STATUTS = ['EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'EXPIREE'];
export const EMP_STATUTS = ['EN_ATTENTE', 'EN_COURS', 'RETOURNE', 'EN_RETARD', 'ANNULE', 'REFUSE'];

export const STATUT_BADGE = {
  EN_ATTENTE: 'badge-warning',
  EN_COURS: 'badge-success',
  RETOURNE: 'badge-info',
  EN_RETARD: 'badge-danger',
  ANNULE: 'badge-gold',
  REFUSE: 'badge-danger',
  CONFIRMEE: 'badge-success',
  ANNULEE: 'badge-gold',
  EXPIREE: 'badge-danger',
};

export const STATUT_LABEL = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'Actif',
  RETOURNE: 'Retourné',
  EN_RETARD: 'En retard',
  ANNULE: 'Annulé',
  REFUSE: 'Refusé',
  CONFIRMEE: 'Approuvée',
  ANNULEE: 'Annulée',
  EXPIREE: 'Expirée',
};

export const STATUT_I18N_KEY = {
  EN_ATTENTE: 'admin.loans.statuses.pending',
  EN_COURS: 'admin.loans.statuses.ongoing',
  RETOURNE: 'admin.loans.statuses.returned',
  EN_RETARD: 'admin.loans.statuses.overdue',
  ANNULE: 'admin.loans.statuses.cancelled',
  REFUSE: 'admin.loans.statuses.rejected',
  CONFIRMEE: 'admin.loans.statuses.approved',
  ANNULEE: 'admin.loans.statuses.cancelled',
  EXPIREE: 'admin.loans.statuses.expired',
};

export const formatStatus = (statut, t) => {
  if (typeof t === 'function' && STATUT_I18N_KEY[statut]) return t(STATUT_I18N_KEY[statut]);
  return STATUT_LABEL[statut] || statut || '-';
};

// statut color hex for charts (matches global.css tokens)
export const STATUT_COLOR = {
  EN_ATTENTE: '#f59e0b',
  EN_COURS: '#10d48e',
  RETOURNE: '#38bdf8',
  EN_RETARD: '#ef4444',
  ANNULE: '#c9a84c',
  REFUSE: '#ef4444',
  CONFIRMEE: '#10d48e',
  ANNULEE: '#c9a84c',
  EXPIREE: '#ef4444',
};

// Retard derived client-side from an emprunt row.
// True only when the loan is not closed and the due date is past.
export const isEmpruntEnRetard = (e) => {
  if (!e || !e.date_retour_prevue) return false;
  if (['RETOURNE', 'ANNULE', 'REFUSE'].includes(e.statut)) return false;
  const due = new Date(e.date_retour_prevue);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
};

// ID display fallbacks — kept here (instead of importing from EmpruntsView)
// so this shared module stays free of cross-imports. Borrowers can be either
// students or teachers; both share the utilisateurs table.
const borrowerMatriculeOf = (d) =>
  d?.matricule
  || d?.user?.matricule
  || d?.borrower?.matricule
  || d?.emprunteur?.matricule
  || d?.student?.matricule
  || d?.teacher?.matricule
  || d?.reservation?.user?.matricule
  || null;
const borrowerIdOf = (d) =>
  d?.id_user
  ?? d?.user?.id_user
  ?? d?.user?.id
  ?? d?.borrower?.id_user
  ?? d?.borrower?.id
  ?? d?.emprunteur?.id_user
  ?? d?.emprunteur?.id
  ?? d?.reservation?.user?.id_user
  ?? d?.reservation?.user?.id
  ?? null;
const borrowerRoleOf = (d) =>
  d?.role
  || d?.user?.role
  || d?.borrower?.role
  || d?.emprunteur?.role
  || d?.reservation?.user?.role
  || null;
const fmtMatriculeEmprunteur = (d) => {
  const m = borrowerMatriculeOf(d);
  if (m) return m;
  const id = borrowerIdOf(d);
  return id != null ? `#${id}` : '—';
};
const fmtBookId = (d) => d?.isbn || (d?.id_livre != null ? `#${d.id_livre}` : '—');

export function DetailsModal({ kind, data, onClose }) {
  const { t } = useTranslation();
  if (!data) return null;
  const isRes = kind === 'reservation';
  const loanCode = data.id_emprunt != null
    ? `EMP-${String(data.id_emprunt).padStart(3, '0')}`
    : null;
  const reservationCode = data.id_reservation != null
    ? `RES-${String(data.id_reservation).padStart(3, '0')}`
    : null;
  const mono = { fontFamily: 'var(--font-mono)' };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{isRes ? t('admin.circulation.details.reservation') : t('admin.loans.detailsLoan')} — {data.titre}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t('admin.common.close')}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-grid">
            <div>
              <span className="modal-label">{isRes ? t('admin.circulation.details.reservationId') : t('admin.loans.tableLoanId')} :</span>{' '}
              <span style={mono}>{(isRes ? reservationCode : loanCode) || '—'}</span>
            </div>
            <div>
              <span className="modal-label">{t('admin.loans.tableBorrowerRegistration')} :</span>{' '}
              <span style={mono}>{fmtMatriculeEmprunteur(data)}</span>
            </div>
            <div>
              <span className="modal-label">{t('admin.loans.borrowerId')} :</span>{' '}
              <span style={mono}>{borrowerIdOf(data) != null ? `#${borrowerIdOf(data)}` : '—'}</span>
            </div>
            <div><span className="modal-label">{t('admin.loans.borrowerName')} :</span> {data.prenom} {data.nom}</div>
            <div>
              <span className="modal-label">{t('admin.loans.borrowerRole')} :</span> {borrowerRoleOf(data) || '—'}
            </div>
            <div><span className="modal-label">Email :</span> {data.email || '—'}</div>
            <div><span className="modal-label">{t('admin.loans.tableBook')} :</span> {data.titre}</div>
            <div><span className="modal-label">{t('admin.loans.tableAuthor')} :</span> {data.auteur || '—'}</div>
            <div>
              <span className="modal-label">{t('admin.loans.tableBookId')} :</span>{' '}
              <span style={mono}>{fmtBookId(data)}</span>
            </div>
            <div><span className="modal-label">{t('admin.loans.tableStatus')} :</span> <span className={`badge ${STATUT_BADGE[data.statut] || 'badge-gold'}`}>{formatStatus(data.statut, t)}</span></div>
            {isRes ? (
              <>
                <div><span className="modal-label">{t('admin.circulation.details.reservedOn')} :</span> {data.date_reservation ? new Date(data.date_reservation).toLocaleString('fr-TN') : '—'}</div>
                <div><span className="modal-label">{t('admin.circulation.details.availableStock')} :</span> {data.stock_disponible ?? '—'}</div>
              </>
            ) : (
              <>
                <div><span className="modal-label">{t('admin.loans.tableLoanDate')} :</span> {data.date_emprunt ? new Date(data.date_emprunt).toLocaleString('fr-TN') : '—'}</div>
                <div><span className="modal-label">{t('admin.loans.tableExpectedReturn')} :</span> {data.date_retour_prevue ? new Date(data.date_retour_prevue).toLocaleDateString('fr-TN') : '—'}</div>
                <div><span className="modal-label">{t('admin.loans.tableActualReturn')} :</span> {data.date_retour_effectif ? new Date(data.date_retour_effectif).toLocaleString('fr-TN') : '—'}</div>
                <div><span className="modal-label">{t('admin.loans.penalty')} :</span> {data.penalite_montant ? `${(data.penalite_montant / 100).toFixed(3)} DT` : '—'}</div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="modal-label">{t('admin.loans.libraryNotes')} :</span>
                  <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>{data.notes_biblio || t('admin.loans.noNotes')}</div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>{t('admin.common.close')}</button>
        </div>
      </div>
    </div>
  );
}
