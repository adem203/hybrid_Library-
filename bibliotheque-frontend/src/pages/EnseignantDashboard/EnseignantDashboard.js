import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '../../components/Sidebar/Sidebar';
import Navbar from '../../components/Navbar/Navbar';
import { documentsAPI, categoriesAPI, statsAPI } from '../../api/api';
import '../AdminDashboard/AdminDashboard.css';
import '../EtudiantDashboard/EtudiantDashboard.css';

const FORMAT_ICON = { PDF: '📄', MP4: '🎬', DOCX: '📝', PPTX: '📊', default: '📁' };

const SIDEBAR_ITEMS = [
  { type: 'section', label: 'Principal' },
  { id: 'dashboard', icon: '🏠', label: 'Tableau de bord' },
  { type: 'section', label: 'Mes cours' },
  { id: 'mes-cours', icon: '📚', label: 'Mes cours' },
  { id: 'upload', icon: '⬆️', label: 'Uploader un cours' },
  { type: 'section', label: 'Ressources' },
  { id: 'catalogue', icon: '🔍', label: 'Catalogue livres' },
  { id: 'ged', icon: '📄', label: 'Bibliothèque numérique' },
  { type: 'section', label: 'Analyse' },
  { id: 'stats', icon: '📊', label: 'Statistiques' },
];

// Composant Upload avec drag & drop
function UploadForm({ categories, onSuccess }) {
  const [form, setForm] = useState({
    titre: '', auteur: '', description: '',
    id_categorie: '', est_telechargeable: true,
  });
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState('');
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setMsg('❌ Veuillez sélectionner un fichier.'); return; }
    if (!form.titre) { setMsg('❌ Le titre est requis.'); return; }

    setLoading(true);
    setProgress(0);
    const fd = new FormData();
    fd.append('fichier', file);
    Object.entries(form).forEach(([k, v]) => v !== '' && fd.append(k, v));

    try {
      // Simuler la progression
      const interval = setInterval(() => setProgress(p => Math.min(p + 10, 90)), 200);
      await documentsAPI.upload(fd);
      clearInterval(interval);
      setProgress(100);
      setMsg('✅ Cours uploadé avec succès !');
      setFile(null);
      setForm({ titre: '', auteur: '', description: '', id_categorie: '', est_telechargeable: true });
      setTimeout(() => { setMsg(''); setProgress(0); onSuccess(); }, 2000);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Erreur upload.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <div className="page-header-title">⬆️ Uploader un cours</div>
        <div className="page-header-sub">Formats supportés : PDF, MP4, DOCX, PPTX, XLSX (max 50 Mo)</div>
      </div>

      {msg && (
        <div className={`auth-alert ${msg.startsWith('✅') ? 'auth-alert-success' : 'auth-alert-error'}`}
          style={{ marginBottom: 20 }}>
          {msg}
        </div>
      )}

      {/* Zone drag & drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--gold)' : file ? 'var(--success)' : 'var(--glass-border)'}`,
          borderRadius: 'var(--radius-lg)', padding: '48px 24px',
          textAlign: 'center', cursor: 'pointer', marginBottom: 24,
          background: dragging ? 'var(--gold-dim)' : file ? 'rgba(16,212,142,0.05)' : 'var(--glass-bg)',
          transition: 'all 0.3s ease',
        }}>
        <input ref={inputRef} type="file" style={{ display: 'none' }}
          accept=".pdf,.mp4,.docx,.pptx,.xlsx,.zip" onChange={handleFileChange} />
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>
          {file ? FORMAT_ICON[file.name.split('.').pop().toUpperCase()] || '📁' : '📁'}
        </div>
        {file ? (
          <>
            <div style={{ color: 'var(--success)', fontWeight: 600 }}>{file.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {(file.size / 1024 / 1024).toFixed(2)} Mo — Cliquez pour changer
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Glissez votre fichier ici
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              ou cliquez pour parcourir
            </div>
          </>
        )}
      </div>

      {/* Progression */}
      {loading && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Upload en cours...</span>
            <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{progress}%</span>
          </div>
          <div className="repartition-bar">
            <div className="repartition-fill" style={{ width: `${progress}%`, transition: 'width 0.2s ease' }} />
          </div>
        </div>
      )}

      {/* Formulaire métadonnées */}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Titre du cours *</label>
            <input className="form-input" placeholder="Ex: Introduction aux Algorithmes"
              value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Auteur / Enseignant</label>
            <input className="form-input" placeholder="Nom"
              value={form.auteur} onChange={e => setForm(f => ({ ...f, auteur: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Catégorie</label>
            <select className="form-select" value={form.id_categorie}
              onChange={e => setForm(f => ({ ...f, id_categorie: e.target.value }))}>
              <option value="">-- Choisir --</option>
              {categories.map(c => (
                <option key={c.id_categorie} value={c.id_categorie}>{c.libelle}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} placeholder="Description du cours..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="telechargeable" checked={form.est_telechargeable}
              onChange={e => setForm(f => ({ ...f, est_telechargeable: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer' }} />
            <label htmlFor="telechargeable" style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Autoriser le téléchargement
            </label>
          </div>
        </div>
        <button type="submit" className="auth-submit-btn" disabled={loading || !file}
          style={{ marginTop: 0 }}>
          {loading ? <><span className="btn-spinner" />Upload en cours...</> : '⬆️ Publier le cours'}
        </button>
      </form>
    </div>
  );
}

export default function EnseignantDashboard() {
  const [activeItem, setActiveItem] = useState('dashboard');
  const [mesCours, setMesCours] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = () => { loadMesCours(); loadCategories(); };
  const loadMesCours = async () => {
    setLoading(true);
    try { const r = await statsAPI.getMesCours(); setMesCours(r.data.data); }
    catch {} finally { setLoading(false); }
  };
  const loadCategories = async () => {
    try { const r = await categoriesAPI.getAll(); setCategories(r.data.data); } catch {}
  };
  const handleDeleteCours = async (id) => {
    if (!window.confirm('Supprimer ce cours ?')) return;
    try { await documentsAPI.delete(id); loadMesCours(); } catch {}
  };

  const totalVues = mesCours.reduce((s, c) => s + (c.nb_consultations || 0), 0);

  return (
    <div className="admin-layout">
      <Sidebar items={SIDEBAR_ITEMS} activeItem={activeItem} onItemClick={setActiveItem} />
      <div className="admin-main">
        <Navbar title="Espace Enseignant" />
        <div className="admin-content">

          {/* ── DASHBOARD ─────────────── */}
          {activeItem === 'dashboard' && (
            <>
              <div className="page-header">
                <div className="page-header-title">Mon tableau de bord 👨‍🏫</div>
              </div>
              <div className="stats-grid">
                {[
                  { label: 'Cours publiés',     value: mesCours.length,  icon: '📚', bg: 'rgba(201,168,76,0.15)' },
                  { label: 'Total consultations', value: totalVues,        icon: '👁️', bg: 'rgba(56,189,248,0.15)' },
                  { label: 'Documents PDF',      value: mesCours.filter(c => c.format === 'PDF').length, icon: '📄', bg: 'rgba(16,212,142,0.15)' },
                  { label: 'Vidéos',             value: mesCours.filter(c => c.format === 'MP4').length, icon: '🎬', bg: 'rgba(139,92,246,0.15)' },
                ].map((s, i) => (
                  <div key={i} className="stat-card animate-slideUp" style={{ animationDelay: `${i * 0.08}s` }}>
                    <div className="stat-card-inner">
                      <div>
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value">{s.value}</div>
                      </div>
                      <div className="stat-icon" style={{ background: s.bg }}>{s.icon}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Top cours */}
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">🏆 Mes cours les plus consultés</div>
                  <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    onClick={() => setActiveItem('upload')}>
                    + Ajouter un cours
                  </button>
                </div>
                <div className="panel-body" style={{ padding: '8px 16px' }}>
                  {mesCours.sort((a, b) => b.nb_consultations - a.nb_consultations)
                    .slice(0, 5)
                    .map((c, i) => (
                    <div key={i} className="doc-card" style={{ marginBottom: 8 }}>
                      <div className="doc-icon">{FORMAT_ICON[c.format] || FORMAT_ICON.default}</div>
                      <div className="doc-info">
                        <div className="doc-title">{c.titre}</div>
                        <div className="doc-meta">
                          👁️ {c.nb_consultations} vues · 👤 {c.nb_lecteurs_uniques} lecteurs uniques
                        </div>
                      </div>
                      <span className="badge badge-gold">{c.format}</span>
                    </div>
                  ))}
                  {mesCours.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-state-icon">📤</div>
                      <div className="empty-state-text">Aucun cours publié — commencez par uploader !</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── MES COURS ─────────────── */}
          {activeItem === 'mes-cours' && (
            <>
              <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="page-header-title">Mes cours publiés 📚</div>
                  <div className="page-header-sub">{mesCours.length} cours</div>
                </div>
                <button className="btn-primary" onClick={() => setActiveItem('upload')}>
                  ⬆️ Nouveau cours
                </button>
              </div>
              {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {mesCours.map((c, i) => (
                    <div key={i} className="doc-card" style={{ animationDelay: `${i * 0.04}s` }}>
                      <div className="doc-icon">{FORMAT_ICON[c.format] || FORMAT_ICON.default}</div>
                      <div className="doc-info">
                        <div className="doc-title">{c.titre}</div>
                        <div className="doc-meta">
                          👁️ {c.nb_consultations} consultations · 👤 {c.nb_lecteurs_uniques} lecteurs
                          {' · '}Publié le {new Date(c.date_creation).toLocaleDateString('fr-TN')}
                        </div>
                      </div>
                      <div className="doc-actions">
                        <span className="badge badge-gold">{c.format}</span>
                        <button className="doc-btn"
                          style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                          onClick={() => handleDeleteCours(c.id_ressource)}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                  {mesCours.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-state-icon">📤</div>
                      <div className="empty-state-text">Aucun cours publié pour l'instant</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── UPLOAD ──────────────────── */}
          {activeItem === 'upload' && (
            <UploadForm categories={categories} onSuccess={() => {
              loadMesCours();
              setActiveItem('mes-cours');
            }} />
          )}

        </div>
      </div>
    </div>
  );
}
