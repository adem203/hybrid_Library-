import React, { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar/Sidebar';
import Navbar from '../../components/Navbar/Navbar';
import { statsAPI, authAPI } from '../../api/api';
import './AdminDashboard.css';

const SIDEBAR_ITEMS = [
  { type: 'section', label: 'Principal' },
  { id: 'dashboard', icon: '🏠', label: 'Tableau de bord' },
  { type: 'section', label: 'Gestion' },
  { id: 'users', icon: '👥', label: 'Utilisateurs' },
  { id: 'stats', icon: '📊', label: 'Statistiques' },
  { id: 'categories', icon: '🏷️', label: 'Catégories' },
  { type: 'section', label: 'Système' },
  { id: 'settings', icon: '⚙️', label: 'Paramètres' },
];

// Composant Stats Card
function StatCard({ label, value, icon, iconBg, trend, trendDir, delay }) {
  return (
    <div className="stat-card animate-slideUp" style={{ animationDelay: `${delay * 0.08}s` }}>
      <div className="stat-card-inner">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value ?? '—'}</div>
          {trend && (
            <div className={`stat-trend ${trendDir || 'up'}`}>
              {trendDir === 'down' ? '↓' : '↑'} {trend}
            </div>
          )}
        </div>
        <div className="stat-icon" style={{ background: iconBg }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// Vue Dashboard
function DashboardView({ stats, users, loadingStats }) {
  const s = stats?.emprunts || {};
  const stock = stats?.stock || {};
  const docs = stats?.documents || {};

  return (
    <>
      <div className="page-header">
        <div className="page-header-title">Tableau de bord Admin ⚙️</div>
        <div className="page-header-sub">Vue d'ensemble du système Educated</div>
      </div>

      {loadingStats ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard label="Emprunts actifs" value={s.emprunts_actifs}
              icon="📗" iconBg="rgba(16,212,142,0.15)" trend="+2 aujourd'hui" delay={1} />
            <StatCard label="En attente" value={s.demandes_en_attente}
              icon="⏳" iconBg="rgba(245,158,11,0.15)" trendDir="up" delay={2} />
            <StatCard label="Retards" value={s.en_retard}
              icon="⚠️" iconBg="rgba(239,68,68,0.15)" trendDir={s.en_retard > 0 ? 'down' : 'up'} delay={3} />
            <StatCard label="Livres en stock" value={stock.stock_disponible_global}
              icon="📚" iconBg="rgba(56,189,248,0.15)" delay={4} />
            <StatCard label="Documents numériques" value={docs.nb_documents}
              icon="📄" iconBg="rgba(201,168,76,0.15)" delay={5} />
            <StatCard label="Consultations" value={docs.consultations_totales}
              icon="👁️" iconBg="rgba(139,92,246,0.15)" delay={6} />
          </div>

          <div className="grid-3">
            {/* Activité récente */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">🕐 Activité récente</div>
              </div>
              <div className="panel-body">
                {stats?.activite_recente?.length ? (
                  <div className="activity-list">
                    {stats.activite_recente.map((a, i) => (
                      <div key={i} className="activity-item">
                        <div className="activity-icon">
                          {a.statut === 'EN_ATTENTE' ? '📥' :
                           a.statut === 'EN_COURS' ? '📗' :
                           a.statut === 'RETOURNE' ? '✅' : '📋'}
                        </div>
                        <div className="activity-text">
                          <strong>{a.prenom} {a.nom}</strong> —{' '}
                          {a.titre}
                          <div>
                            <span className={`badge badge-${
                              a.statut === 'EN_COURS' ? 'success' :
                              a.statut === 'EN_ATTENTE' ? 'warning' :
                              a.statut === 'RETOURNE' ? 'info' : 'danger'
                            }`}>{a.statut}</span>
                          </div>
                        </div>
                        <div className="activity-time">
                          {new Date(a.date_creation).toLocaleDateString('fr-TN')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-text">Aucune activité récente</div>
                  </div>
                )}
              </div>
            </div>

            {/* Répartition */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">📊 Répartition</div>
              </div>
              <div className="panel-body">
                {[
                  { label: 'Livres physiques', value: stock.nb_livres, color: '#c9a84c', pct: 60 },
                  { label: 'Documents numériques', value: docs.nb_documents, color: '#38bdf8', pct: 40 },
                ].map((item, i) => (
                  <div key={i} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.value ?? 0}
                      </span>
                    </div>
                    <div className="repartition-bar">
                      <div
                        className={`repartition-fill ${i === 1 ? 'blue' : ''}`}
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Vue Utilisateurs
function UsersView({ users, loading, onToggleBlock }) {
  return (
    <>
      <div className="page-header">
        <div className="page-header-title">Gestion des Utilisateurs 👥</div>
        <div className="page-header-sub">{users?.length || 0} utilisateurs enregistrés</div>
      </div>
      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Email</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>Inscrit le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map((u) => (
                    <tr key={u.id_user}>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {u.prenom} {u.nom}
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span className="badge badge-gold">{u.role}</span>
                      </td>
                      <td>
                        <span className={`badge ${u.est_bloque ? 'badge-danger' : 'badge-success'}`}>
                          {u.est_bloque ? '🔒 Bloqué' : '✅ Actif'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {new Date(u.date_creation).toLocaleDateString('fr-TN')}
                      </td>
                      <td>
                        <button
                          className={`action-btn ${u.est_bloque ? 'action-btn-success' : 'action-btn-danger'}`}
                          onClick={() => onToggleBlock(u.id_user, !u.est_bloque)}
                        >
                          {u.est_bloque ? '🔓 Débloquer' : '🔒 Bloquer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Dashboard principal Admin
export default function AdminDashboard() {
  const [activeItem, setActiveItem] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    loadStats();
    loadUsers();
  }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await statsAPI.getDashboard();
      setStats(res.data.data);
    } catch (err) {
      console.error('Erreur stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await authAPI.getUsers();
      setUsers(res.data.data);
    } catch (err) {
      console.error('Erreur users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleBlock = async (userId, bloquer) => {
    try {
      await authAPI.toggleBloquer(userId, bloquer);
      setUsers(prev =>
        prev.map(u => u.id_user === userId ? { ...u, est_bloque: bloquer } : u)
      );
    } catch (err) {
      console.error('Erreur blocage:', err);
    }
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
        <Navbar title="Admin" hasNotif={retardCount > 0} />
        <div className="admin-content">
          {activeItem === 'dashboard' && (
            <DashboardView stats={stats} users={users} loadingStats={loadingStats} />
          )}
          {activeItem === 'users' && (
            <UsersView users={users} loading={loadingUsers} onToggleBlock={handleToggleBlock} />
          )}
          {activeItem === 'stats' && (
            <div>
              <div className="page-header">
                <div className="page-header-title">Statistiques 📊</div>
              </div>
              <div className="panel">
                <div className="panel-body">
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                    Connectez les graphiques (recharts, chart.js...) ici avec statsAPI.getStatsEmprunts()
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
