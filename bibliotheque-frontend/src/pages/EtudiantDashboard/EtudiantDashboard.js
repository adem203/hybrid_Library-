import React, { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar/Sidebar';
import Navbar from '../../components/Navbar/Navbar';
import { livresAPI, documentsAPI, empruntsAPI, categoriesAPI } from '../../api/api';
import './EtudiantDashboard.css';
import '../AdminDashboard/AdminDashboard.css';

const FORMAT_ICON = { PDF: '📄', MP4: '🎬', DOCX: '📝', PPTX: '📊', XLSX: '📈', default: '📁' };

const SIDEBAR_ITEMS = [
  { type: 'section', label: 'Accueil' },
  { id: 'catalogue', icon: '🔍', label: 'Catalogue' },
  { id: 'ged', icon: '📄', label: 'Bibliothèque numérique' },
  { type: 'section', label: 'Mes activités' },
  { id: 'mes-emprunts', icon: '📗', label: 'Mes emprunts' },
  { id: 'historique', icon: '📖', label: 'Historique lectures' },
  { type: 'section', label: 'Mon compte' },
  { id: 'profil', icon: '👤', label: 'Mon profil' },
];

export default function EtudiantDashboard() {
  const [activeItem, setActiveItem] = useState('catalogue');
  const [livres, setLivres] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [emprunts, setEmprunts] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterDispo, setFilterDispo] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (activeItem === 'catalogue') loadLivres();
    if (activeItem === 'ged') loadDocuments();
    if (activeItem === 'mes-emprunts') loadEmprunts();
    if (activeItem === 'historique') loadLectures();
  }, [activeItem]);

  const loadAll       = async () => { loadLivres(); loadCategories(); };
  const loadCategories = async () => {
    try { const r = await categoriesAPI.getAll(); setCategories(r.data.data); } catch {}
  };
  const loadLivres    = async () => {
    setLoading(true);
    try {
      const params = { limit: 48, ...(filterCat && { categorie: filterCat }), ...(filterDispo === 'true' && { disponible: true }) };
      const r = await livresAPI.getAll(params);
      setLivres(r.data.data);
    } catch {} finally { setLoading(false); }
  };
  const loadDocuments = async () => {
    setLoading(true);
    try { const r = await documentsAPI.getAll({ limit: 30 }); setDocuments(r.data.data); }
    catch {} finally { setLoading(false); }
  };
  const loadEmprunts  = async () => {
    setLoading(true);
    try { const r = await empruntsAPI.getMesEmprunts(); setEmprunts(r.data.data); }
    catch {} finally { setLoading(false); }
  };
  const loadLectures  = async () => {
    setLoading(true);
    try { const r = await documentsAPI.getMesLectures(); setLectures(r.data.data); }
    catch {} finally { setLoading(false); }
  };

  const handleEmprunt = async (id_livre) => {
    try {
      await empruntsAPI.creer({ id_livre, duree_jours: 14 });
      setMsg('✅ Demande d\'emprunt envoyée ! En attente de validation.');
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Erreur.'));
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const handleAnnuler = async (id) => {
    try {
      await empruntsAPI.annuler(id);
      loadEmprunts();
    } catch {}
  };

  const filteredLivres = livres.filter(l =>
    l.titre?.toLowerCase().includes(search.toLowerCase()) ||
    l.auteur?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-layout">
      <Sidebar items={SIDEBAR_ITEMS} activeItem={activeItem} onItemClick={setActiveItem} />
      <div className="admin-main">
        <Navbar title="Espace Étudiant" />
        <div className="admin-content">

          {/* Message flottant */}
          {msg && (
            <div style={{
              position: 'fixed', top: 80, right: 24, zIndex: 300,
              background: msg.startsWith('✅') ? 'rgba(16,212,142,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${msg.startsWith('✅') ? 'rgba(16,212,142,0.4)' : 'rgba(239,68,68,0.4)'}`,
              color: msg.startsWith('✅') ? 'var(--success)' : 'var(--danger)',
              borderRadius: 'var(--radius-md)', padding: '14px 20px',
              fontSize: '0.9rem', fontWeight: 600, animation: 'slideLeft 0.3s ease',
              backdropFilter: 'blur(16px)', maxWidth: 360,
            }}>
              {msg}
            </div>
          )}

          {/* ── CATALOGUE ─────────────── */}
          {activeItem === 'catalogue' && (
            <>
              <div className="page-header">
                <div className="page-header-title">Catalogue des livres 📚</div>
                <div className="page-header-sub">{filteredLivres.length} livres trouvés</div>
              </div>

              <div className="search-bar-wrapper">
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    className="search-input-big"
                    placeholder="Rechercher par titre, auteur..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <select className="filter-select" value={filterCat}
                  onChange={e => { setFilterCat(e.target.value); }}>
                  <option value="">Toutes les catégories</option>
                  {categories.map(c => (
                    <option key={c.id_categorie} value={c.id_categorie}>{c.libelle}</option>
                  ))}
                </select>
                <select className="filter-select" value={filterDispo}
                  onChange={e => setFilterDispo(e.target.value)}>
                  <option value="">Tous</option>
                  <option value="true">Disponibles uniquement</option>
                </select>
                <button className="btn-primary" onClick={loadLivres}>🔍 Filtrer</button>
              </div>

              {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <div className="catalogue-grid">
                  {filteredLivres.map((l, i) => (
                    <div key={l.id_ressource} className="book-card"
                      style={{ animationDelay: `${(i % 12) * 0.04}s` }}>
                      <div className="book-cover">
                        {l.image_couverture
                          ? <img src={`http://localhost:5000${l.image_couverture}`}
                              alt={l.titre} className="book-cover-img" />
                          : '📖'
                        }
                      </div>
                      <div className="book-card-body">
                        <div className="book-card-title">{l.titre}</div>
                        <div className="book-card-author">{l.auteur || 'Auteur inconnu'}</div>
                        <div className="book-card-footer">
                          <span className={`book-dispo ${l.stock_disponible > 0 ? 'available' : 'unavailable'}`}>
                            {l.stock_disponible > 0 ? `✅ ${l.stock_disponible} dispo` : '❌ Indisponible'}
                          </span>
                          {l.stock_disponible > 0 ? (
                            <button className="book-borrow-btn"
                              onClick={() => handleEmprunt(l.id_ressource)}>
                              Emprunter
                            </button>
                          ) : (
                            <button className="book-borrow-btn"
                              onClick={async () => {
                                try { await empruntsAPI.reserver({ id_livre: l.id_ressource });
                                  setMsg('🔔 Réservation créée !'); setTimeout(() => setMsg(''), 3000);
                                } catch (err) { setMsg('❌ ' + (err.response?.data?.message || 'Erreur.')); }
                              }}>
                              Réserver
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredLivres.length === 0 && (
                    <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                      <div className="empty-state-icon">🔍</div>
                      <div className="empty-state-text">Aucun livre trouvé pour "{search}"</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── GED ─────────────────────── */}
          {activeItem === 'ged' && (
            <>
              <div className="page-header">
                <div className="page-header-title">Bibliothèque numérique 📄</div>
                <div className="page-header-sub">{documents.length} documents disponibles</div>
              </div>
              {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {documents.map((d, i) => (
                    <div key={d.id_ressource} className="doc-card"
                      style={{ animationDelay: `${i * 0.05}s` }}>
                      <div className="doc-icon">
                        {FORMAT_ICON[d.format] || FORMAT_ICON.default}
                      </div>
                      <div className="doc-info">
                        <div className="doc-title">{d.titre}</div>
                        <div className="doc-meta">
                          {d.auteur} · {d.format} · {d.taille_ko ? `${Math.round(d.taille_ko/1024)} Mo` : '—'}
                          {' · '} 👁️ {d.nb_consultations} vues
                        </div>
                      </div>
                      <div className="doc-actions">
                        <a href={`http://localhost:5000/api/v1/documents/${d.id_ressource}/stream`}
                          target="_blank" rel="noreferrer"
                          className="doc-btn doc-btn-read">
                          👁️ Lire
                        </a>
                        {d.est_telechargeable && (
                          <a href={`http://localhost:5000/api/v1/documents/${d.id_ressource}/download`}
                            className="doc-btn doc-btn-dl">
                            ⬇️ DL
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-state-icon">📂</div>
                      <div className="empty-state-text">Aucun document disponible</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── MES EMPRUNTS ──────────── */}
          {activeItem === 'mes-emprunts' && (
            <>
              <div className="page-header">
                <div className="page-header-title">Mes emprunts 📗</div>
                <div className="page-header-sub">{emprunts.length} emprunt(s)</div>
              </div>
              {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : emprunts.length === 0 ? (
                <div className="panel"><div className="panel-body">
                  <div className="empty-state">
                    <div className="empty-state-icon">📚</div>
                    <div className="empty-state-text">Aucun emprunt pour l'instant</div>
                  </div>
                </div></div>
              ) : (
                emprunts.map(e => (
                  <div key={e.id_emprunt} className="emprunt-item">
                    <div className="emprunt-book-icon">📖</div>
                    <div className="emprunt-info">
                      <div className="emprunt-title">{e.titre}</div>
                      <div className="emprunt-dates">
                        {e.date_emprunt
                          ? `Emprunté le ${new Date(e.date_emprunt).toLocaleDateString('fr-TN')}`
                          : 'En attente de validation'
                        }
                        {' — '}
                        Retour prévu : {new Date(e.date_retour_prevue).toLocaleDateString('fr-TN')}
                      </div>
                      {e.notes_biblio && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          Note : {e.notes_biblio}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                      <span className={`badge badge-${
                        e.statut === 'EN_COURS' ? 'success' :
                        e.statut === 'EN_ATTENTE' ? 'warning' :
                        e.statut === 'EN_RETARD' ? 'danger' :
                        e.statut === 'RETOURNE' ? 'info' : 'gold'
                      }`}>{e.statut}</span>
                      {e.statut === 'EN_ATTENTE' && (
                        <button className="action-btn action-btn-danger"
                          onClick={() => handleAnnuler(e.id_emprunt)}>
                          ✕ Annuler
                        </button>
                      )}
                      {e.penalite_montant > 0 && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 600 }}>
                          Pénalité: {(e.penalite_montant/100).toFixed(3)} DT
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── HISTORIQUE ────────────── */}
          {activeItem === 'historique' && (
            <>
              <div className="page-header">
                <div className="page-header-title">Historique de lectures 📖</div>
              </div>
              {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lectures.map((l, i) => (
                    <div key={i} className="doc-card" style={{ animationDelay: `${i * 0.04}s` }}>
                      <div className="doc-icon">{FORMAT_ICON[l.format] || '📁'}</div>
                      <div className="doc-info">
                        <div className="doc-title">{l.titre}</div>
                        <div className="doc-meta">
                          {l.auteur} · Consulté le {new Date(l.date_lecture).toLocaleDateString('fr-TN')}
                        </div>
                      </div>
                      <span className="badge badge-gold">{l.format}</span>
                    </div>
                  ))}
                  {lectures.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-state-icon">📖</div>
                      <div className="empty-state-text">Aucune lecture pour l'instant</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
