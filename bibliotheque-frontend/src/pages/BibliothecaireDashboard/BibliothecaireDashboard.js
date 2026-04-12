import React, { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar/Sidebar';
import Navbar from '../../components/Navbar/Navbar';
import { statsAPI, livresAPI, empruntsAPI, categoriesAPI } from '../../api/api';
import '../AdminDashboard/AdminDashboard.css';

const SIDEBAR_ITEMS = [
  { type: 'section', label: 'Principal' },
  { id: 'dashboard', icon: '🏠', label: 'Tableau de bord' },
  { type: 'section', label: 'Ressources' },
  { id: 'livres', icon: '📚', label: 'Livres physiques' },
  { id: 'documents', icon: '📄', label: 'Documents numériques' },
  { id: 'categories', icon: '🏷️', label: 'Catégories' },
  { type: 'section', label: 'Circulation' },
  { id: 'emprunts', icon: '🔄', label: 'Emprunts', },
  { id: 'retards', icon: '⚠️', label: 'Retards' },
  { type: 'section', label: 'Analyse' },
  { id: 'stats', icon: '📊', label: 'Statistiques' },
];

// ── Formulaire ajout livre ───────────────────────────────────
function AjouterLivreForm({ onClose, onSuccess, categories }) {
  const [form, setForm] = useState({
    titre: '', auteur: '', isbn: '', emplacement_rayon: '',
    stock_total: 1, id_categorie: '', description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titre) { setError('Le titre est requis.'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      await livresAPI.create(fd);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'ajout.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,8,24,0.8)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', z: 200, zIndex: 200,
    }}>
      <div style={{
        background: 'var(--navy-deep)', border: '1px solid var(--glass-border-gold)',
        borderRadius: 'var(--radius-xl)', padding: '36px', width: '100%', maxWidth: 520,
        animation: 'bounceIn 0.4s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}>
            ➕ Ajouter un livre
          </h3>
          <button onClick={onClose}
            style={{ color: 'var(--text-muted)', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
        {error && <div className="auth-alert auth-alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Titre *</label>
              <input name="titre" className="form-input" placeholder="Titre du livre"
                value={form.titre} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Auteur</label>
              <input name="auteur" className="form-input" placeholder="Auteur"
                value={form.auteur} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label">ISBN</label>
              <input name="isbn" className="form-input" placeholder="978-..."
                value={form.isbn} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Rayon</label>
              <input name="emplacement_rayon" className="form-input" placeholder="Rayon A1"
                value={form.emplacement_rayon} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Stock total</label>
              <input name="stock_total" type="number" min="1" className="form-input"
                value={form.stock_total} onChange={handleChange} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Catégorie</label>
              <select name="id_categorie" className="form-select"
                value={form.id_categorie} onChange={handleChange}>
                <option value="">-- Choisir --</option>
                {categories.map(c => (
                  <option key={c.id_categorie} value={c.id_categorie}>{c.libelle}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="auth-submit-btn" disabled={loading}
              style={{ flex: 1, padding: '12px', marginTop: 0 }}>
              {loading ? 'Ajout...' : '✅ Ajouter le livre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BibliothecaireDashboard() {
  const [activeItem, setActiveItem] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [livres, setLivres] = useState([]);
  const [emprunts, setEmprunts] = useState([]);
  const [retards, setRetards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddLivre, setShowAddLivre] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadDashboard();
    loadCategories();
  }, []);

  useEffect(() => {
    if (activeItem === 'livres') loadLivres();
    if (activeItem === 'emprunts') loadEmprunts();
    if (activeItem === 'retards') loadRetards();
  }, [activeItem]);

  const loadDashboard  = async () => {
    try { const r = await statsAPI.getDashboard(); setStats(r.data.data); } catch {}
  };
  const loadLivres     = async () => {
    setLoading(true);
    try { const r = await livresAPI.getAll({ limit: 50 }); setLivres(r.data.data); } catch {}
    finally { setLoading(false); }
  };
  const loadEmprunts   = async () => {
    setLoading(true);
    try { const r = await empruntsAPI.getAll({ limit: 50 }); setEmprunts(r.data.data); } catch {}
    finally { setLoading(false); }
  };
  const loadRetards    = async () => {
    setLoading(true);
    try { const r = await empruntsAPI.getRetards(); setRetards(r.data.data); } catch {}
    finally { setLoading(false); }
  };
  const loadCategories = async () => {
    try { const r = await categoriesAPI.getAll(); setCategories(r.data.data); } catch {}
  };

  const handleValider  = async (id) => {
    try { await empruntsAPI.valider(id, {}); loadEmprunts(); loadDashboard(); } catch {}
  };
  const handleRefuser  = async (id) => {
    try { await empruntsAPI.refuser(id, {}); loadEmprunts(); } catch {}
  };
  const handleRetourner = async (id) => {
    try { await empruntsAPI.retourner(id); loadEmprunts(); loadDashboard(); } catch {}
  };
  const handleDeleteLivre = async (id) => {
    if (window.confirm('Supprimer ce livre ?')) {
      try { await livresAPI.delete(id); loadLivres(); } catch (err) {
        alert(err.response?.data?.message || 'Erreur.');
      }
    }
  };

  const filteredLivres = livres.filter(l =>
    l.titre?.toLowerCase().includes(search.toLowerCase()) ||
    l.auteur?.toLowerCase().includes(search.toLowerCase())
  );

  const retardCount = stats?.emprunts?.en_retard || 0;
  const pendingCount = stats?.emprunts?.demandes_en_attente || 0;

  return (
    <div className="admin-layout">
      {showAddLivre && (
        <AjouterLivreForm
          onClose={() => setShowAddLivre(false)}
          onSuccess={loadLivres}
          categories={categories}
        />
      )}

      <Sidebar
        items={SIDEBAR_ITEMS}
        activeItem={activeItem}
        onItemClick={setActiveItem}
        badges={{ retards: retardCount, emprunts: pendingCount }}
      />

      <div className="admin-main">
        <Navbar
          title="Bibliothécaire"
          onSearch={activeItem === 'livres' ? setSearch : undefined}
          hasNotif={retardCount > 0 || pendingCount > 0}
        />

        <div className="admin-content">

          {/* ── DASHBOARD ─────────────────── */}
          {activeItem === 'dashboard' && (
            <>
              <div className="page-header">
                <div className="page-header-title">Tableau de bord 📖</div>
                <div className="page-header-sub">
                  {new Date().toLocaleDateString('fr-TN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <div className="stats-grid">
                {[
                  { label: 'Emprunts actifs',    value: stats?.emprunts?.emprunts_actifs,    icon: '📗', bg: 'rgba(16,212,142,0.15)' },
                  { label: 'En attente',          value: stats?.emprunts?.demandes_en_attente, icon: '⏳', bg: 'rgba(245,158,11,0.15)' },
                  { label: 'Retards',             value: stats?.emprunts?.en_retard,           icon: '⚠️', bg: 'rgba(239,68,68,0.15)' },
                  { label: 'Livres disponibles',  value: stats?.stock?.stock_disponible_global, icon: '📚', bg: 'rgba(56,189,248,0.15)' },
                ].map((s, i) => (
                  <div key={i} className="stat-card animate-slideUp" style={{ animationDelay: `${i * 0.08}s` }}>
                    <div className="stat-card-inner">
                      <div>
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value">{s.value ?? 0}</div>
                      </div>
                      <div className="stat-icon" style={{ background: s.bg }}>{s.icon}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">🕐 Dernière activité</div>
                </div>
                <div className="panel-body">
                  <div className="activity-list">
                    {stats?.activite_recente?.slice(0, 6).map((a, i) => (
                      <div key={i} className="activity-item">
                        <div className="activity-icon">
                          {a.statut === 'EN_ATTENTE' ? '📥' : a.statut === 'EN_COURS' ? '📗' : '✅'}
                        </div>
                        <div className="activity-text">
                          <strong>{a.prenom} {a.nom}</strong> — {a.titre}
                        </div>
                        <span className={`badge badge-${
                          a.statut === 'EN_COURS' ? 'success' : a.statut === 'EN_ATTENTE' ? 'warning' : 'info'
                        }`}>{a.statut}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── LIVRES ────────────────────── */}
          {activeItem === 'livres' && (
            <>
              <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="page-header-title">Livres physiques 📚</div>
                  <div className="page-header-sub">{livres.length} livres dans le catalogue</div>
                </div>
                <button className="btn-primary" onClick={() => setShowAddLivre(true)}>
                  + Ajouter un livre
                </button>
              </div>
              <div className="panel">
                {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Titre</th><th>Auteur</th><th>ISBN</th>
                          <th>Rayon</th><th>Stock total</th><th>Disponible</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLivres.map(l => (
                          <tr key={l.id_ressource}>
                            <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{l.titre}</td>
                            <td>{l.auteur}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{l.isbn || '—'}</td>
                            <td>{l.emplacement_rayon || '—'}</td>
                            <td style={{ textAlign: 'center' }}>{l.stock_total}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${l.stock_disponible > 0 ? 'badge-success' : 'badge-danger'}`}>
                                {l.stock_disponible}
                              </span>
                            </td>
                            <td>
                              <button className="action-btn action-btn-danger"
                                onClick={() => handleDeleteLivre(l.id_ressource)}>
                                🗑️ Supprimer
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredLivres.length === 0 && (
                      <div className="empty-state">
                        <div className="empty-state-icon">📚</div>
                        <div className="empty-state-text">Aucun livre trouvé</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── EMPRUNTS ──────────────────── */}
          {activeItem === 'emprunts' && (
            <>
              <div className="page-header">
                <div className="page-header-title">Gestion des emprunts 🔄</div>
              </div>
              <div className="panel">
                {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Utilisateur</th><th>Livre</th><th>Date emprunt</th>
                          <th>Retour prévu</th><th>Statut</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emprunts.map(e => (
                          <tr key={e.id_emprunt}>
                            <td style={{ color: 'var(--text-primary)' }}>{e.prenom} {e.nom}</td>
                            <td>{e.titre}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                              {e.date_emprunt ? new Date(e.date_emprunt).toLocaleDateString('fr-TN') : '—'}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                              {new Date(e.date_retour_prevue).toLocaleDateString('fr-TN')}
                            </td>
                            <td>
                              <span className={`badge badge-${
                                e.statut === 'EN_COURS' ? 'success' :
                                e.statut === 'EN_ATTENTE' ? 'warning' :
                                e.statut === 'EN_RETARD' ? 'danger' :
                                e.statut === 'RETOURNE' ? 'info' : 'gold'
                              }`}>{e.statut}</span>
                            </td>
                            <td style={{ display: 'flex', gap: 6 }}>
                              {e.statut === 'EN_ATTENTE' && (<>
                                <button className="action-btn action-btn-success"
                                  onClick={() => handleValider(e.id_emprunt)}>✅ Valider</button>
                                <button className="action-btn action-btn-danger"
                                  onClick={() => handleRefuser(e.id_emprunt)}>❌ Refuser</button>
                              </>)}
                              {(e.statut === 'EN_COURS' || e.statut === 'EN_RETARD') && (
                                <button className="action-btn action-btn-success"
                                  onClick={() => handleRetourner(e.id_emprunt)}>
                                  📥 Retour
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {emprunts.length === 0 && (
                      <div className="empty-state">
                        <div className="empty-state-icon">📋</div>
                        <div className="empty-state-text">Aucun emprunt</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── RETARDS ───────────────────── */}
          {activeItem === 'retards' && (
            <>
              <div className="page-header">
                <div className="page-header-title">Emprunts en retard ⚠️</div>
                <div className="page-header-sub">{retards.length} emprunt(s) en retard</div>
              </div>
              {loading ? <div className="loading-spinner"><div className="spinner" /></div> : (
                retards.length === 0 ? (
                  <div className="panel">
                    <div className="panel-body">
                      <div className="empty-state">
                        <div className="empty-state-icon">✅</div>
                        <div className="empty-state-text">Aucun retard — tout est en ordre !</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="panel">
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Utilisateur</th><th>Email</th><th>Livre</th>
                            <th>Retour prévu</th><th>Jours retard</th><th>Pénalité estimée</th>
                          </tr>
                        </thead>
                        <tbody>
                          {retards.map((r, i) => (
                            <tr key={i}>
                              <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                {r.prenom} {r.nom}
                              </td>
                              <td style={{ fontSize: '0.82rem' }}>{r.email}</td>
                              <td>{r.titre}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                                {new Date(r.date_retour_prevue).toLocaleDateString('fr-TN')}
                              </td>
                              <td>
                                <span className="badge badge-danger">
                                  {r.jours_retard} jours
                                </span>
                              </td>
                              <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
                                {(r.penalite_estimee / 100).toFixed(3)} DT
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
