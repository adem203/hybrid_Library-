import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { empruntsAPI, statsAPI } from '../../api/api';
import { useChartTheme } from '../../utils/chartTheme';

const COLORS = ['#d6a76b', '#6f98c1', '#7fa889', '#b17b8e', '#8f7eb1', '#6fa6a0'];
const RESERVATION_STATUSES = ['EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'EXPIREE'];
const STATUS_COLORS = {
  EN_ATTENTE: '#d6a76b',
  EN_COURS: '#6f98c1',
  CONFIRMEE: '#7fa889',
  APPROUVEE: '#7fa889',
  RETOURNE: '#7fa889',
  RETOURNEE: '#7fa889',
  ANNULEE: '#7f8aa0',
  REFUSEE: '#b17b8e',
  EN_RETARD: '#b17b8e',
};

const STATUS_LABEL_KEYS = {
  EN_ATTENTE: 'admin.stats.labels.pending',
  EN_COURS: 'admin.stats.labels.ongoing',
  RETOURNE: 'admin.stats.labels.returned',
  RETOURNEE: 'admin.stats.labels.returned',
  EN_RETARD: 'admin.stats.labels.overdue',
  ANNULE: 'admin.stats.labels.cancelled',
  ANNULEE: 'admin.stats.labels.cancelled',
  REFUSE: 'admin.stats.labels.rejected',
  REFUSEE: 'admin.stats.labels.rejected',
  CONFIRMEE: 'admin.stats.labels.approved',
  APPROUVEE: 'admin.stats.labels.approved',
  EXPIREE: 'admin.stats.labels.expired',
};

const ROLE_LABEL_KEYS = {
  ADMIN: 'admin.stats.labels.admin',
  ADMINISTRATEUR: 'admin.stats.labels.administrator',
  BIBLIOTHECAIRE: 'admin.stats.labels.librarian',
  LIBRARIAN: 'admin.stats.labels.librarian',
  ENSEIGNANT: 'admin.stats.labels.teacher',
  TEACHER: 'admin.stats.labels.teacher',
  ETUDIANT: 'admin.stats.labels.student',
  STUDENT: 'admin.stats.labels.student',
};

const numberFormatter = new Intl.NumberFormat('fr-FR');
const dateFormatter = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
});
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

function toNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return numberFormatter.format(toNumber(value));
}

function totalOf(items, key = 'value') {
  return items.reduce((sum, item) => sum + toNumber(item[key]), 0);
}

function normalizeLabelKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatStatus(status, t) {
  if (!status) return t('admin.stats.unspecified');
  const key = normalizeLabelKey(status);
  if (STATUS_LABEL_KEYS[key]) return t(STATUS_LABEL_KEYS[key]);
  if (ROLE_LABEL_KEYS[key]) return t(ROLE_LABEL_KEYS[key]);
  return status
    .toString()
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function truncateText(text, maxLength = 18, t) {
  if (!text) return t('admin.stats.noCategory');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatMonth(value) {
  if (!value || typeof value !== 'string') return value || '';
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  const date = new Date(year, month - 1, 1);
  return monthFormatter.format(date);
}

function chartHasValues(data) {
  return data.some((item) => toNumber(item.value) > 0);
}

async function loadReservationStatsFromReservationsApi() {
  const results = await Promise.all(
    RESERVATION_STATUSES.map((statut) => (
      empruntsAPI.getAllReservations({ page: 1, limit: 1, statut })
    ))
  );

  const parStatut = results
    .map((result, index) => ({
      statut: RESERVATION_STATUSES[index],
      total: toNumber(result.data?.pagination?.total),
    }))
    .filter((row) => row.total > 0);

  return {
    total: totalOf(parStatut, 'total'),
    en_attente: parStatut.find((row) => row.statut === 'EN_ATTENTE')?.total || 0,
    par_statut: parStatut,
  };
}

function getStatusColor(name, index) {
  return STATUS_COLORS[name] || COLORS[index % COLORS.length];
}

function StatCard({ label, value, icon, tone, caption, delay }) {
  const displayValue = value === null || typeof value === 'undefined' ? '-' : formatNumber(value);

  return (
    <div
      className={`stat-card analytics-stat-card tone-${tone}`}
      style={{ animationDelay: `${delay * 0.06}s` }}
    >
      <div className="analytics-card-top">
        <span className="analytics-card-icon">{icon}</span>
        <span className="analytics-card-rule" />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{displayValue}</div>
      {caption && <div className="analytics-card-caption">{caption}</div>}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="stats-section-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <span />
    </div>
  );
}

function ChartPanel({ title, subtitle, meta, children, className = '' }) {
  return (
    <section className={`panel stats-chart-panel ${className}`}>
      <div className="stats-panel-header">
        <div>
          <h3 className="stats-panel-title">{title}</h3>
          {subtitle && <div className="stats-panel-subtitle">{subtitle}</div>}
        </div>
        {meta && <div className="stats-panel-meta">{meta}</div>}
      </div>
      <div className="panel-body stats-panel-body">
        {children}
      </div>
    </section>
  );
}

function EmptyChart({ text }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state stats-empty-state">
      <div className="empty-state-text">{text || t('admin.stats.noData')}</div>
    </div>
  );
}

function CustomPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function DonutChart({ data, centerLabel, colors = COLORS }) {
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  const cleanData = data.filter((item) => toNumber(item.value) > 0);
  const total = totalOf(cleanData);

  if (!cleanData.length) return <EmptyChart />;

  return (
    <div className="chart-container stats-donut-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={cleanData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="44%"
            innerRadius="58%"
            outerRadius="78%"
            paddingAngle={2}
            labelLine={false}
            label={CustomPieLabel}
            stroke={chartTheme.pieStroke}
            strokeWidth={2}
          >
            {cleanData.map((_, index) => (
              <Cell key={index} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={chartTheme.tooltip}
            formatter={(value) => [formatNumber(value), t('admin.stats.total')]}
          />
          <Legend
            verticalAlign="bottom"
            height={52}
            iconType="circle"
            formatter={(value) => <span className="stats-legend-label">{formatStatus(value, t)}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="stats-donut-center">
        <span>{centerLabel}</span>
        <strong>{formatNumber(total)}</strong>
      </div>
    </div>
  );
}

function DistributionBreakdown({ items }) {
  const { t } = useTranslation();
  const cleanItems = items.filter((item) => toNumber(item.value) > 0);
  const total = totalOf(cleanItems);

  if (!cleanItems.length) return <EmptyChart />;

  return (
    <div className="stats-distribution">
      <div className="stats-stacked-bar" aria-hidden="true">
        {cleanItems.map((item, index) => {
          const percent = total ? (toNumber(item.value) / total) * 100 : 0;
          return (
            <span
              key={item.name}
              className="stats-stack-segment"
              style={{
                width: `${percent}%`,
                background: getStatusColor(item.name, index),
              }}
            />
          );
        })}
      </div>

      <div className="stats-distribution-list">
        {cleanItems.map((item, index) => {
          const value = toNumber(item.value);
          const percent = total ? (value / total) * 100 : 0;
          return (
            <div className="stats-distribution-row" key={item.name}>
              <div className="stats-distribution-label">
                <span style={{ background: getStatusColor(item.name, index) }} />
                {formatStatus(item.name, t)}
              </div>
              <div className="stats-distribution-value">
                <strong>{formatNumber(value)}</strong>
                <em>{percent.toFixed(1)}%</em>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankingTable({ rows, metricLabel, emptyLabel }) {
  const { t } = useTranslation();
  if (!rows.length) return <EmptyChart text={emptyLabel} />;

  const maxMetric = Math.max(...rows.map((row) => toNumber(row.metric)), 1);

  return (
    <div className="table-wrapper stats-table-wrapper">
      <table className="data-table stats-ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t('admin.stats.resource')}</th>
            <th>{t('admin.stats.classification')}</th>
            <th>{metricLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const metric = toNumber(row.metric);
            return (
              <tr key={row.id || `${row.title}-${index}`}>
                <td className="stats-rank-cell">
                  <span>{index + 1}</span>
                </td>
                <td className="stats-resource-cell">
                  <div className="stats-resource-title">{row.title}</div>
                  <div className="stats-resource-meta">{row.meta || '-'}</div>
                </td>
                <td>
                  <div className="stats-badge-list">
                    {row.badges.length ? row.badges.map((badge) => (
                      <span className={`badge ${badge.variant}`} key={`${row.id}-${badge.label}`}>
                        {badge.label}
                      </span>
                    )) : '-'}
                  </div>
                </td>
                <td className="stats-metric-cell">
                  <strong>{formatNumber(metric)}</strong>
                  <div className="stats-metric-bar" aria-hidden="true">
                    <span style={{ width: `${(metric / maxMetric) * 100}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StatistiquesView() {
  const { t } = useTranslation();
  const chartTheme = useChartTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [empruntsData, setEmpruntsData] = useState(null);
  const [populairesData, setPopulairesData] = useState(null);
  const [repartitionData, setRepartitionData] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [reservationStatsData, setReservationStatsData] = useState(null);

  const loadAll = useCallback(async (showFullLoader = false) => {
    if (showFullLoader) setLoading(true);
    setRefreshing(true);

    const results = await Promise.allSettled([
      statsAPI.getDashboard(),
      statsAPI.getStatsEmprunts(),
      statsAPI.getRessourcesPopulaires(),
      statsAPI.getRepartition(),
      statsAPI.getAdminStats(),
      statsAPI.getStatsReservations(),
    ]);

    if (results[0].status === 'fulfilled') setDashboardData(results[0].value.data.data);
    if (results[1].status === 'fulfilled') setEmpruntsData(results[1].value.data.data);
    if (results[2].status === 'fulfilled') setPopulairesData(results[2].value.data.data);
    if (results[3].status === 'fulfilled') setRepartitionData(results[3].value.data.data);
    if (results[4].status === 'fulfilled') setAdminData(results[4].value.data.data);

    let nextReservationStats = null;
    if (results[5].status === 'fulfilled') {
      nextReservationStats = results[5].value.data.data;
    } else if (results[4].status === 'fulfilled' && results[4].value.data.data?.reservations) {
      nextReservationStats = results[4].value.data.data.reservations;
    }

    const hasReservationCounts = nextReservationStats
      && (
        toNumber(nextReservationStats.total) > 0
        || (nextReservationStats.par_statut || []).some((row) => toNumber(row.total) > 0)
      );

    if (hasReservationCounts) {
      setReservationStatsData(nextReservationStats);
    } else {
      try {
        setReservationStatsData(await loadReservationStatsFromReservationsApi());
      } catch (error) {
        console.error('Erreur stats reservations:', error);
        setReservationStatsData(nextReservationStats);
      }
    }

    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadAll(true);
  }, [loadAll]);

  if (loading) {
    return (
      <div className="stats-page">
        <div className="stats-page-header">
          <div>
            <div className="stats-page-kicker">Admin / {t('admin.stats.title')}</div>
            <h1 className="stats-page-title">{t('admin.stats.title')}</h1>
            <div className="stats-page-subtitle">{t('admin.common.loading')}</div>
          </div>
        </div>
        <div className="panel stats-chart-panel">
          <div className="panel-body">
            <div className="loading-spinner"><div className="spinner" /></div>
          </div>
        </div>
      </div>
    );
  }

  const emprunts = dashboardData?.emprunts || {};
  const stock = dashboardData?.stock || {};
  const docs = dashboardData?.documents || {};

  const repartitionPieData = repartitionData
    ? [
        { name: t('admin.stats.physicalBooks'), value: toNumber(repartitionData.physique) },
        { name: t('admin.stats.digitalDocuments'), value: toNumber(repartitionData.numerique) },
      ]
    : [];

  const usersParRole = (adminData?.users?.par_role || [])
    .map((row) => ({ name: row.role, value: toNumber(row.total) }))
    .filter((row) => row.value > 0);

  const empruntsParStatut = (empruntsData?.par_statut || [])
    .map((row) => ({ name: row.statut, value: toNumber(row.total) }))
    .filter((row) => row.value > 0);

  const empruntsParMois = (empruntsData?.par_mois || []).map((row) => ({
    mois: row.mois,
    label: formatMonth(row.mois),
    emprunts: toNumber(row.total_emprunts),
  }));

  const reservationStats = reservationStatsData || adminData?.reservations || {};
  const reservationsParStatut = (reservationStats.par_statut || [])
    .map((row) => ({ name: row.statut, value: toNumber(row.total) }))
    .filter((row) => row.value > 0);
  const reservationsTotal = typeof reservationStats.total !== 'undefined'
    ? toNumber(reservationStats.total)
    : totalOf(reservationsParStatut);

  const documentsFormats = (adminData?.documents_formats || [])
    .map((row) => ({ format: row.format || t('admin.stats.unspecified'), total: toNumber(row.total) }))
    .filter((row) => row.total > 0);

  const topCategories = (empruntsData?.par_categorie || []).slice(0, 8).map((row) => ({
    categorie: truncateText(row.categorie, 18, t),
    categorieComplete: row.categorie || t('admin.stats.noCategory'),
    emprunts: toNumber(row.nb_emprunts),
  }));

  const topLivres = (populairesData?.top_livres || []).slice(0, 10);
  const topDocuments = (populairesData?.top_documents || []).slice(0, 10);

  const summaryCards = [
    {
      label: t('admin.stats.users'),
      value: adminData?.users?.total,
      icon: 'U',
      tone: 'blue',
      caption: t('admin.stats.registeredAccounts'),
    },
    {
      label: t('admin.stats.physicalBooks'),
      value: stock.nb_livres,
      icon: 'L',
      tone: 'gold',
      caption: t('admin.stats.physicalCatalog'),
    },
    {
      label: t('admin.stats.digitalDocuments'),
      value: docs.nb_documents,
      icon: 'D',
      tone: 'green',
      caption: t('admin.stats.digitalCatalog'),
    },
    {
      label: t('admin.stats.activeLoans'),
      value: emprunts.emprunts_actifs,
      icon: 'P',
      tone: 'blue',
      caption: t('admin.stats.ongoingLoans'),
    },
    {
      label: t('admin.stats.pendingReservations'),
      value: reservationStats.en_attente,
      icon: 'R',
      tone: 'gold',
      caption: t('admin.stats.openRequests'),
    },
    {
      label: t('admin.stats.overdueLoans'),
      value: emprunts.en_retard,
      icon: '!',
      tone: 'rose',
      caption: t('admin.stats.toMonitor'),
    },
    {
      label: t('admin.stats.totalViews'),
      value: docs.consultations_totales,
      icon: 'V',
      tone: 'purple',
      caption: t('admin.stats.documentViews'),
    },
  ];

  const topLivresRows = topLivres.map((livre) => ({
    id: livre.id_ressource,
    title: livre.titre,
    meta: livre.auteur,
    metric: livre.nb_emprunts,
    badges: livre.categorie ? [{ label: livre.categorie, variant: 'badge-gold' }] : [],
  }));

  const topDocumentsRows = topDocuments.map((doc) => ({
    id: doc.id_ressource,
    title: doc.titre,
    meta: doc.format ? t('admin.stats.formatValue', { format: doc.format }) : t('admin.stats.digitalDocument'),
    metric: doc.nb_consultations,
    badges: [
      ...(doc.format ? [{ label: doc.format, variant: 'badge-info' }] : []),
      ...(doc.categorie ? [{ label: doc.categorie, variant: 'badge-gold' }] : []),
    ],
  }));

  return (
    <div className="stats-page">
      <div className="stats-page-header">
        <div>
          <div className="stats-page-kicker">Admin / {t('admin.stats.title')}</div>
          <h1 className="stats-page-title">{t('admin.stats.title')}</h1>
          <div className="stats-page-subtitle">{t('admin.stats.intro')}</div>
        </div>
        <div className="stats-header-actions">
          {lastUpdated && (
            <div className="stats-sync">
              <span />
              {t('admin.stats.update')} {dateFormatter.format(lastUpdated)}
            </div>
          )}
          <button
            type="button"
            className="stats-refresh-btn"
            onClick={() => loadAll(false)}
            disabled={refreshing}
          >
            {refreshing ? t('admin.common.loading') : t('admin.stats.refresh')}
          </button>
        </div>
      </div>

      <div className="stats-summary-grid stats-section">
        {summaryCards.map((card, index) => (
          <StatCard key={card.label} {...card} delay={index + 1} />
        ))}
      </div>

      <SectionHeader
        title={t('admin.stats.distributions')}
        subtitle={t('admin.stats.distributionsSubtitle')}
      />
      <div className="stats-chart-grid stats-chart-grid-3 stats-section">
        <ChartPanel
          title={t('admin.stats.usersByRole')}
          subtitle={t('admin.stats.accountsCount', { count: formatNumber(totalOf(usersParRole)) })}
          meta={t('admin.stats.rolesCount', { count: usersParRole.length })}
        >
          <DonutChart data={usersParRole} centerLabel={t('admin.stats.total')} />
        </ChartPanel>

        <ChartPanel
          title={t('admin.stats.physicalVsDigital')}
          subtitle={t('admin.stats.catalogResourcesCount', { count: formatNumber(totalOf(repartitionPieData)) })}
          meta={t('admin.stats.catalog')}
        >
          {chartHasValues(repartitionPieData) ? (
            <DonutChart data={repartitionPieData} centerLabel={t('admin.stats.collection')} colors={['#d6a76b', '#6fa6a0']} />
          ) : <EmptyChart />}
        </ChartPanel>

        <ChartPanel
          title={t('admin.stats.loansByStatus')}
          subtitle={t('admin.stats.currentLoansState')}
          meta={t('admin.stats.totalCount', { count: formatNumber(totalOf(empruntsParStatut)) })}
        >
          <DistributionBreakdown items={empruntsParStatut} />
        </ChartPanel>
      </div>

      <SectionHeader
        title={t('admin.stats.catalogRequests')}
        subtitle={t('admin.stats.catalogRequestsSubtitle')}
      />
      <div className="stats-chart-grid stats-chart-grid-mixed stats-section">
        <ChartPanel
          title={t('admin.stats.documentsByFormat')}
          subtitle={t('admin.stats.volumeByFileType')}
          meta={t('admin.stats.documentsCount', { count: formatNumber(totalOf(documentsFormats, 'total')) })}
        >
          {documentsFormats.length === 0 ? <EmptyChart /> : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={documentsFormats} margin={{ top: 12, right: 18, left: 0, bottom: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="format" tick={{ fill: chartTheme.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: chartTheme.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [formatNumber(value), t('admin.stats.documents')]} />
                  <Bar dataKey="total" name={t('admin.stats.documents')} radius={[6, 6, 0, 0]}>
                    {documentsFormats.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          title={t('admin.stats.reservationsByStatus')}
          subtitle={t('admin.stats.currentRequestsState')}
          meta={t('admin.stats.totalCount', { count: formatNumber(reservationsTotal) })}
        >
          <DistributionBreakdown items={reservationsParStatut} />
        </ChartPanel>

        <ChartPanel
          title={t('admin.stats.topBorrowedCategories')}
          subtitle={t('admin.stats.topBorrowedCategoriesSubtitle')}
          className="stats-panel-full"
        >
          {topCategories.length === 0 ? <EmptyChart /> : (
            <div className="chart-container stats-horizontal-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topCategories}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis type="number" tick={{ fill: chartTheme.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="categorie" tick={{ fill: chartTheme.axis, fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={chartTheme.tooltip}
                    formatter={(value) => [formatNumber(value), t('admin.stats.loans')]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.categorieComplete || ''}
                  />
                  <Bar dataKey="emprunts" name={t('admin.stats.loans')} fill="#6f98c1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>
      </div>

      <SectionHeader
        title={t('admin.stats.monthlyTrend')}
        subtitle={t('admin.stats.monthlyTrendSubtitle')}
      />
      <div className="stats-section">
        <ChartPanel
          title={t('admin.stats.monthlyLoans')}
          subtitle={t('admin.stats.monthlyLoansSubtitle')}
          meta={t('admin.stats.periodsCount', { count: empruntsParMois.length })}
          className="stats-panel-full"
        >
          {empruntsParMois.length === 0 ? <EmptyChart /> : (
            <div className="chart-container-lg">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={empruntsParMois} margin={{ top: 12, right: 24, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="empruntsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d6a76b" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#d6a76b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="label" tick={{ fill: chartTheme.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: chartTheme.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={chartTheme.tooltip}
                    formatter={(value) => [formatNumber(value), t('admin.stats.loans')]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.mois || ''}
                  />
                  <Area
                    type="monotone"
                    dataKey="emprunts"
                    name={t('admin.stats.loans')}
                    stroke="#d6a76b"
                    strokeWidth={2}
                    fill="url(#empruntsGradient)"
                    dot={{ fill: '#0b142d', stroke: '#d6a76b', strokeWidth: 2, r: 4 }}
                    activeDot={{ fill: '#d6a76b', stroke: '#0b142d', strokeWidth: 2, r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartPanel>
      </div>

      <SectionHeader
        title={t('admin.stats.rankings')}
        subtitle={t('admin.stats.rankingsSubtitle')}
      />
      <div className="stats-chart-grid stats-section">
        <ChartPanel
          title={t('admin.stats.mostBorrowedBooks')}
          subtitle={t('admin.stats.borrowCountRanking')}
        >
          <RankingTable
            rows={topLivresRows}
            metricLabel={t('admin.stats.loans')}
            emptyLabel={t('admin.stats.noPopularBook')}
          />
        </ChartPanel>

        <ChartPanel
          title={t('admin.stats.mostViewedDocuments')}
          subtitle={t('admin.stats.viewCountRanking')}
        >
          <RankingTable
            rows={topDocumentsRows}
            metricLabel={t('admin.stats.views')}
            emptyLabel={t('admin.stats.noPopularDocument')}
          />
        </ChartPanel>
      </div>
    </div>
  );
}
