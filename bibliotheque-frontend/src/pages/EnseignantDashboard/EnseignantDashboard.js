import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart,
  BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, LabelList,
} from 'recharts';
import Sidebar from '../../components/Sidebar/Sidebar';
import Navbar from '../../components/Navbar/Navbar';
import { authAPI, documentsAPI, categoriesAPI, statsAPI, livresAPI, supportAPI, notificationsAPI } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import '../AdminDashboard/AdminDashboard.css';
import '../EtudiantDashboard/EtudiantDashboard.css';
import './EnseignantDashboard.css';

const FORMAT_ICON = { PDF: '📄', MP4: '🎬', DOCX: '📝', PPTX: '📊', default: '📁' };
const DOCUMENT_TYPE_TONES = {
  cours: 'gold',
  tp_td: 'green',
  examen: 'blue',
  corrige: 'purple',
  autre: 'slate',
};
const COURSE_FILTERS = [
  { key: 'all', label: 'Tous', i18nKey: 'teacher.ext.filters.all' },
  { key: 'cours', label: 'Cours', i18nKey: 'teacher.ext.pedaTypes.cours' },
  { key: 'tp_td', label: 'TP / TD', i18nKey: 'teacher.ext.pedaTypes.tp_td' },
  { key: 'examen', label: 'Examens', i18nKey: 'teacher.ext.pedaTypes.examen' },
  { key: 'corrige', label: 'Corrigés', i18nKey: 'teacher.ext.pedaTypes.corrige' },
  { key: 'pdf', label: 'PDF', i18nKey: 'teacher.ext.filters.pdf' },
  { key: 'docx', label: 'DOCX', i18nKey: 'teacher.ext.filters.docx' },
  { key: 'pptx', label: 'PPTX', i18nKey: 'teacher.ext.filters.pptx' },
];
const COURSE_PAGE_SIZE = 8;
const DIGITAL_FILTERS = [
  { key: 'all', label: 'Tous', i18nKey: 'teacher.ext.filters.all' },
  { key: 'cours', label: 'Cours', i18nKey: 'teacher.ext.pedaTypes.cours' },
  { key: 'tp_td', label: 'TP / TD', i18nKey: 'teacher.ext.pedaTypes.tp_td' },
  { key: 'examen', label: 'Examens', i18nKey: 'teacher.ext.pedaTypes.examen' },
  { key: 'corrige', label: 'Corrigés', i18nKey: 'teacher.ext.pedaTypes.corrige' },
  { key: 'pdf', label: 'PDF', i18nKey: 'teacher.ext.filters.pdf' },
  { key: 'video', label: 'Vidéos', i18nKey: 'teacher.ext.filters.videos' },
];

const normalizeText = (value = '') => value
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const getTeacherName = (user) => (
  [user?.prenom, user?.nom].filter(Boolean).join(' ').trim() || 'Enseignant'
);

const PROFILE_UNAVAILABLE = 'Non disponible';

const ROLE_LABELS = {
  ETUDIANT: 'Étudiant',
  ENSEIGNANT: 'Enseignant',
  BIBLIOTHECAIRE: 'Bibliothécaire',
  ADMIN: 'Administrateur',
};

const getRoleLabel = (role) => ROLE_LABELS[role] || role || PROFILE_UNAVAILABLE;

const getTeacherInitials = (user) => {
  const initials = [user?.prenom, user?.nom]
    .map(part => (part || '').trim().charAt(0))
    .filter(Boolean)
    .join('');

  if (initials) return initials.toUpperCase();
  return (user?.email || '?').trim().slice(0, 2).toUpperCase();
};

const getAvailableProfileValue = (user, keys) => {
  for (const key of keys) {
    const value = user?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
};

const getDocumentSearchText = (document) => normalizeText([
  document?.type_document,
  document?.type_pedagogique,
  document?.categorie,
  document?.titre,
  document?.description,
].filter(Boolean).join(' '));

const getPedagogicalType = (document) => {
  const text = getDocumentSearchText(document);

  if (/\b(corrige|correction|solution)\b/.test(text)) {
    return { key: 'corrige', label: 'Corrigé', i18nKey: 'teacher.ext.pedaTypes.corrige' };
  }
  if (/\b(examen|exam|devoir|controle|ds|test)\b/.test(text)) {
    return { key: 'examen', label: 'Examen', i18nKey: 'teacher.ext.pedaTypes.examen' };
  }
  if (/\b(tp|td|travaux pratiques|travaux diriges|exercice|serie)\b/.test(text)) {
    return { key: 'tp_td', label: 'TP / TD', i18nKey: 'teacher.ext.pedaTypes.tp_td' };
  }
  return { key: 'cours', label: 'Cours', i18nKey: 'teacher.ext.pedaTypes.cours' };
};

const parseCount = (value) => Number.parseInt(value || 0, 10) || 0;

const formatDate = (value) => {
  if (!value) return 'Date non disponible';
  return new Date(value).toLocaleDateString('fr-TN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatProfileDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatFileSize = (tailleKo) => {
  const size = Number(tailleKo);
  if (!size) return 'Non disponible';
  if (size >= 1024) {
    const value = size / 1024;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} Mo`;
  }
  return `${Math.round(size)} Ko`;
};

const getDownloadFileName = (document) => {
  if (document?.nom_fichier) return document.nom_fichier;
  const extension = (document?.format || 'document').toLowerCase();
  const title = (document?.titre || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${title || 'document'}.${extension}`;
};

const getUploaderName = (document) => (
  [document?.uploade_par_prenom, document?.uploade_par_nom].filter(Boolean).join(' ').trim()
);

const getDocumentAuthor = (document) => (
  document?.auteur || getUploaderName(document) || 'Auteur non renseigné'
);

const getPublicationYear = (value) => {
  if (!value) return 'Non disponible';
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : 'Non disponible';
};

const getBookAvailability = (book) => (
  Number(book?.stock_disponible || 0) > 0 ? 'Disponible' : 'Indisponible'
);

const getDocumentStatus = (document) => {
  const rawStatus = document?.statut || document?.status || document?.etat;
  if (!rawStatus) return 'Publié';

  const normalized = normalizeText(rawStatus);
  if (normalized.includes('brouillon') || normalized.includes('draft')) return 'Brouillon';
  if (normalized.includes('archive')) return 'Archivé';
  return 'Publié';
};

const SIDEBAR_ITEMS = [
  { type: 'section', label: 'Principal', i18nKey: 'sidebar.sections.main' },
  { id: 'dashboard', icon: '🏠', label: 'Tableau de bord', i18nKey: 'sidebar.items.dashboard' },
  { type: 'section', label: 'Mes cours', i18nKey: 'sidebar.sections.myCourses' },
  { id: 'mes-cours', icon: '📚', label: 'Mes cours', i18nKey: 'sidebar.items.mesCours' },
  { id: 'upload', icon: '⬆️', label: 'Uploader un cours', i18nKey: 'sidebar.items.upload' },
  { type: 'section', label: 'Ressources', i18nKey: 'sidebar.sections.resources' },
  { id: 'catalogue', icon: '🔍', label: 'Catalogue livres', i18nKey: 'sidebar.items.catalogue' },
  { id: 'ged', icon: '📄', label: 'Bibliothèque numérique', i18nKey: 'sidebar.items.ged' },
  { type: 'section', label: 'Analyse', i18nKey: 'sidebar.sections.analysis' },
  { id: 'stats', icon: '📊', label: 'Statistiques', i18nKey: 'sidebar.items.stats' },
  { type: 'section', label: 'Support', i18nKey: 'sidebar.sections.support' },
  { id: 'centre-aide', icon: '🎧', label: 'Centre d’aide', i18nKey: 'sidebar.items.helpCenter' },
  { type: 'section', label: 'Mon compte', i18nKey: 'sidebar.sections.myAccount' },
  { id: 'profil', icon: '👤', label: 'Mon profil', i18nKey: 'sidebar.items.myProfile' },
];

const TEACHER_SUPPORT_TYPES = [
  { value: 'Problème d’upload', i18nKey: 'teacher.ext.help.problemTypes.upload' },
  { value: 'Problème de document', i18nKey: 'teacher.ext.help.problemTypes.document' },
  { value: 'Problème de compte', i18nKey: 'teacher.ext.help.problemTypes.account' },
  { value: 'Problème de statistiques', i18nKey: 'teacher.ext.help.problemTypes.statistics' },
  { value: 'Problème d’accès', i18nKey: 'teacher.ext.help.problemTypes.access' },
  { value: 'Autre', i18nKey: 'teacher.ext.help.problemTypes.other' },
];

const TEACHER_SUPPORT_MESSAGE_MAX = 1000;

const TEACHER_SUPPORT_STATUS_META = {
  EN_ATTENTE: { label: 'Ouverte', filterKey: 'ouverte', tone: 'open', i18nKey: 'teacher.ext.supportStatus.open' },
  REPONDU: { label: 'Répondue', filterKey: 'repondue', tone: 'answered', i18nKey: 'teacher.ext.supportStatus.answered' },
  FERME: { label: 'Fermée', filterKey: 'fermee', tone: 'closed', i18nKey: 'teacher.ext.supportStatus.closed' },
};

const TEACHER_SUPPORT_FILTERS = [
  { key: 'all', label: 'Toutes', i18nKey: 'teacher.ext.supportFilters.all' },
  { key: 'ouverte', label: 'Ouvertes', i18nKey: 'teacher.ext.supportFilters.open' },
  { key: 'repondue', label: 'Répondues', i18nKey: 'teacher.ext.supportFilters.answered' },
  { key: 'fermee', label: 'Fermées', i18nKey: 'teacher.ext.supportFilters.closed' },
];

const TEACHER_SUPPORT_TYPE_ICONS = {
  'Problème d’upload': '☁️',
  'Problème de document': '📄',
  'Problème de compte': '👤',
  'Problème de statistiques': '📊',
  'Problème d’accès': '🔒',
  'Autre': '⋯',
};

// ── Uploader un cours ─────────────────────────────────────────
const UC_DOCUMENT_TYPES = [
  { key: 'cours', label: 'Cours', icon: '📖', i18nKey: 'teacher.ext.pedaTypes.cours' },
  { key: 'tp_td', label: 'TP/TD', icon: '🧪', i18nKey: 'teacher.ext.pedaTypes.tp_td' },
  { key: 'examen', label: 'Examen', icon: '📝', i18nKey: 'teacher.ext.pedaTypes.examen' },
  { key: 'corrige', label: 'Corrigé', icon: '✅', i18nKey: 'teacher.ext.pedaTypes.corrige' },
  { key: 'video', label: 'Vidéo', icon: '🎬', i18nKey: 'teacher.ext.pedaTypes.video' },
  { key: 'autre', label: 'Autre', icon: '⋯', i18nKey: 'teacher.ext.pedaTypes.autre' },
];

const UC_ALLOWED_EXTS = ['pdf', 'mp4', 'docx', 'pptx', 'xlsx'];
const UC_VIDEO_EXTS = ['mp4'];
const UC_DOCUMENT_LIMIT_BYTES = 200 * 1024 * 1024;        // 200 Mo
const UC_VIDEO_LIMIT_BYTES = 1 * 1024 * 1024 * 1024;      // 1 Go
const UC_MAX_DESC = 1000;
const ucIsVideoExt = (ext) => UC_VIDEO_EXTS.includes(ext);
const ucGetLimitForExt = (ext) => (ucIsVideoExt(ext) ? UC_VIDEO_LIMIT_BYTES : UC_DOCUMENT_LIMIT_BYTES);

const getFileExt = (name = '') => (name.split('.').pop() || '').toLowerCase();
const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${bytes} o`;
};

function UploadForm({ categories, onSuccess, onCancel, currentUser }) {
  const { t } = useTranslation();
  const defaultAuteur = [currentUser?.prenom, currentUser?.nom].filter(Boolean).join(' ').trim();
  const [form, setForm] = useState({
    titre: '',
    auteur: defaultAuteur,
    description: '',
    id_categorie: '',
    type_document: 'cours',
    est_telechargeable: true,
  });
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const inputRef = useRef();

  const validateFile = (f) => {
    if (!f) return 'Veuillez sélectionner un fichier.';
    const ext = getFileExt(f.name);
    if (!UC_ALLOWED_EXTS.includes(ext)) {
      return 'Format non supporté. Formats acceptés : PDF, MP4, DOCX, PPTX, XLSX.';
    }
    const limit = ucGetLimitForExt(ext);
    if (f.size > limit) {
      return ucIsVideoExt(ext)
        ? 'Vidéo trop volumineuse. Taille maximale pour les vidéos MP4 : 1 Go.'
        : 'Fichier trop volumineux. Taille maximale pour les documents : 200 Mo.';
    }
    return '';
  };

  const applyFile = (f) => {
    const fileError = validateFile(f);
    if (fileError) {
      setErrorMsg(fileError);
      setFile(null);
      return;
    }
    setErrorMsg('');
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
  };

  const handleReset = () => {
    setFile(null);
    setForm({
      titre: '',
      auteur: defaultAuteur,
      description: '',
      id_categorie: '',
      type_document: 'cours',
      est_telechargeable: true,
    });
    setErrorMsg('');
    setSuccessMsg('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleCancel = () => {
    handleReset();
    if (typeof onCancel === 'function') onCancel();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const fileError = validateFile(file);
    if (fileError) { setErrorMsg(fileError); return; }
    if (!form.titre.trim()) { setErrorMsg('Le titre du cours est requis.'); return; }
    if (!form.id_categorie) { setErrorMsg('La catégorie est requise.'); return; }
    if (!form.type_document) { setErrorMsg('Le type de document est requis.'); return; }

    setLoading(true);
    setProgress(0);
    const fd = new FormData();
    fd.append('fichier', file);
    fd.append('titre', form.titre.trim());
    if (form.auteur.trim()) fd.append('auteur', form.auteur.trim());
    if (form.description.trim()) fd.append('description', form.description.trim());
    if (form.id_categorie) fd.append('id_categorie', form.id_categorie);
    fd.append('est_telechargeable', form.est_telechargeable ? 'true' : 'false');
    fd.append('type_document', form.type_document);

    let interval;
    try {
      interval = setInterval(() => setProgress((p) => Math.min(p + 8, 90)), 220);
      await documentsAPI.upload(fd);
      clearInterval(interval);
      setProgress(100);
      setSuccessMsg('Le cours a été publié avec succès.');
      setTimeout(() => {
        handleReset();
        if (typeof onSuccess === 'function') onSuccess();
      }, 1500);
    } catch (err) {
      if (interval) clearInterval(interval);
      setProgress(0);
      setErrorMsg(err.response?.data?.message || 'Erreur lors de la publication du cours.');
    } finally {
      setLoading(false);
    }
  };

  const fileExt = file ? getFileExt(file.name) : '';

  return (
    <div className="uc-page">
      {/* HERO */}
      <section className="uc-hero">
        <div className="uc-hero-copy">
          <div className="uc-hero-kicker">{t('teacher.kickers.newCourse')}</div>
          <h1>{t('teacher.upload.title')}</h1>
          <p>{t('teacher.upload.intro')}</p>
          <div className="uc-hero-formats">
            <span aria-hidden="true">ℹ️</span>
            {t('teacher.ext.upload.formatsSupported')}
          </div>
        </div>
        <div className="uc-hero-illustration" aria-hidden="true">
          <span className="uc-illus-cloud">☁️</span>
          <span className="uc-illus-arrow">⬆️</span>
          <span className="uc-illus-book">📚</span>
          <span className="uc-illus-spark1">✦</span>
          <span className="uc-illus-spark2">✧</span>
        </div>
      </section>

      <div className="uc-layout">
        {/* LEFT COLUMN */}
        <div className="uc-main">
          {/* DROPZONE */}
          <div
            className={`uc-dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              style={{ display: 'none' }}
              accept=".pdf,.mp4,.docx,.pptx,.xlsx"
              onChange={handleFileChange}
            />
            <div className="uc-dropzone-icon" aria-hidden="true">
              {file ? (FORMAT_ICON[fileExt.toUpperCase()] || '📁') : '☁️'}
            </div>
            {file ? (
              <>
                <div className="uc-dropzone-title">{file.name}</div>
                <div className="uc-dropzone-sub">
                  {formatBytes(file.size)} • {fileExt.toUpperCase()} — cliquez pour changer
                </div>
              </>
            ) : (
              <>
                <div className="uc-dropzone-title">{t('teacher.ext.upload.dropHere')}</div>
                <div className="uc-dropzone-link">{t('teacher.ext.upload.clickToBrowse')}</div>
                <div className="uc-dropzone-meta">
                  {t('teacher.ext.upload.formatsSupported')}
                </div>
              </>
            )}
          </div>

          {/* PROGRESS */}
          {loading && (
            <div className="uc-progress">
              <div className="uc-progress-head">
                <span>{t('teacher.ext.upload.publishing')}</span>
                <span>{progress}%</span>
              </div>
              <div className="uc-progress-bar">
                <div className="uc-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* FORM CARD */}
          <form className="uc-form-card" onSubmit={handleSubmit}>
            <header className="uc-form-header">
              <h2>
                <span aria-hidden="true">📄</span> {t('teacher.ext.upload.courseInfo')}
              </h2>
            </header>

            {errorMsg && <div className="uc-alert uc-alert-error">{errorMsg}</div>}
            {successMsg && <div className="uc-alert uc-alert-success">{successMsg}</div>}

            <div className="uc-field">
              <label htmlFor="uc-titre">{t('teacher.ext.upload.titleLabel')}</label>
              <input
                id="uc-titre"
                type="text"
                placeholder={t('teacher.ext.upload.titleLabel')}
                value={form.titre}
                maxLength={255}
                onChange={(e) => setForm((s) => ({ ...s, titre: e.target.value }))}
              />
            </div>

            <div className="uc-field-row">
              <div className="uc-field">
                <label htmlFor="uc-auteur">{t('teacher.ext.upload.authorLabel')}</label>
                <input
                  id="uc-auteur"
                  type="text"
                  placeholder={t('teacher.ext.upload.authorLabel')}
                  value={form.auteur}
                  onChange={(e) => setForm((s) => ({ ...s, auteur: e.target.value }))}
                />
              </div>
              <div className="uc-field">
                <label htmlFor="uc-categorie">{t('teacher.ext.upload.categoryLabel')}</label>
                <select
                  id="uc-categorie"
                  value={form.id_categorie}
                  onChange={(e) => setForm((s) => ({ ...s, id_categorie: e.target.value }))}
                  disabled={categories.length === 0}
                >
                  <option value="">
                    {categories.length === 0
                      ? t('teacher.ext.upload.categoriesUnavailable')
                      : '-- ' + t('teacher.ext.upload.categoryLabel') + ' --'}
                  </option>
                  {categories.map((c) => (
                    <option key={c.id_categorie} value={c.id_categorie}>
                      {c.libelle}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="uc-field">
              <label>{t('teacher.ext.upload.documentTypeLabel')}</label>
              <div className="uc-type-pills" role="radiogroup" aria-label={t('teacher.ext.upload.documentTypeLabel')}>
                {UC_DOCUMENT_TYPES.map((dt) => (
                  <button
                    key={dt.key}
                    type="button"
                    role="radio"
                    aria-checked={form.type_document === dt.key}
                    className={`uc-type-pill${form.type_document === dt.key ? ' is-active' : ''}`}
                    onClick={() => setForm((s) => ({ ...s, type_document: dt.key }))}
                  >
                    <span aria-hidden="true">{dt.icon}</span> {dt.i18nKey ? t(dt.i18nKey) : dt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="uc-field">
              <label htmlFor="uc-desc">{t('teacher.ext.upload.descriptionLabel')}</label>
              <textarea
                id="uc-desc"
                rows={4}
                placeholder={t('teacher.ext.upload.descriptionLabel')}
                maxLength={UC_MAX_DESC}
                value={form.description}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              />
              <div className="uc-desc-counter">
                {form.description.length} / {UC_MAX_DESC}
              </div>
            </div>

            <div className="uc-form-footer">
              <label className="uc-toggle">
                <input
                  type="checkbox"
                  checked={form.est_telechargeable}
                  onChange={(e) => setForm((s) => ({ ...s, est_telechargeable: e.target.checked }))}
                />
                <span className="uc-toggle-track" aria-hidden="true">
                  <span className="uc-toggle-thumb" />
                </span>
                <span className="uc-toggle-text">
                  <strong>{t('teacher.upload.downloadable')}</strong>
                  <em>{t('teacher.upload.downloadable')}</em>
                </span>
              </label>
              <div className="uc-actions">
                <button
                  type="button"
                  className="uc-btn uc-btn-secondary"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  {t('teacher.ext.upload.cancel')}
                </button>
                <button
                  type="submit"
                  className="uc-btn uc-btn-primary"
                  disabled={loading}
                >
                  {loading ? t('teacher.ext.upload.publishing') : <><span aria-hidden="true">⬆</span> {t('teacher.ext.upload.publish')}</>}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN */}
        <aside className="uc-aside">
          <article className="uc-side-card">
            <header className="uc-side-header">
              <span className="uc-side-icon-lg" aria-hidden="true">💡</span>
              <h3>{t('teacher.ext.upload.publishingTips')}</h3>
            </header>
            <ul className="uc-tips-list">
              <li>
                <span className="uc-tip-icon" aria-hidden="true">📋</span>
                <div>
                  <strong>{t('teacher.ext.upload.clearFileName')}</strong>
                  <em>{t('teacher.ext.upload.clearFileNameDetail')}</em>
                </div>
              </li>
              <li>
                <span className="uc-tip-icon" aria-hidden="true">🧱</span>
                <div>
                  <strong>{t('teacher.ext.upload.structuredContent')}</strong>
                  <em>{t('teacher.ext.upload.structuredContentDetail')}</em>
                </div>
              </li>
              <li>
                <span className="uc-tip-icon" aria-hidden="true">📦</span>
                <div>
                  <strong>{t('teacher.ext.upload.fileSize')}</strong>
                  <em>{t('teacher.ext.upload.fileSizeDetail')}</em>
                </div>
              </li>
              <li>
                <span className="uc-tip-icon" aria-hidden="true">🔐</span>
                <div>
                  <strong>{t('teacher.ext.upload.rights')}</strong>
                  <em>{t('teacher.ext.upload.rightsDetail')}</em>
                </div>
              </li>
            </ul>
          </article>

          <article className="uc-side-card">
            <header className="uc-side-header">
              <h3>{t('teacher.ext.upload.usefulInfos')}</h3>
            </header>
            <ul className="uc-info-list">
              <li>
                <span className="uc-tip-icon" aria-hidden="true">🛡️</span>
                <div>
                  <strong>{t('teacher.ext.upload.usefulInfos')}</strong>
                  <em>{t('teacher.ext.upload.usefulInfos')}</em>
                </div>
              </li>
              <li>
                <span className="uc-tip-icon" aria-hidden="true">⚡</span>
                <div>
                  <strong>{t('teacher.ext.upload.usefulInfos')}</strong>
                  <em>{t('teacher.ext.upload.usefulInfos')}</em>
                </div>
              </li>
            </ul>
          </article>

          <article className="uc-side-card uc-help-card">
            <header className="uc-side-header">
              <span className="uc-side-icon-lg" aria-hidden="true">🎓</span>
              <h3>{t('teacher.ext.upload.needHelp')}</h3>
            </header>
            <p>{t('teacher.ext.upload.usefulInfos')}</p>
            <button
              type="button"
              className="uc-help-link"
              onClick={() => window.open('mailto:support@educated.tn', '_blank', 'noopener')}
            >
              {t('teacher.ext.upload.viewGuide')}
            </button>
          </article>
        </aside>
      </div>
    </div>
  );
}

const VIDEO_FORMATS = new Set(['MP4', 'WEBM', 'OGG', 'MOV']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov']);

const detectVideoFormat = (course) => {
  if (!course) return null;
  const format = String(course.format || '').toUpperCase();
  if (VIDEO_FORMATS.has(format)) return format;
  const sources = [course.nom_fichier, course.url_fichier];
  for (const src of sources) {
    if (!src) continue;
    const ext = String(src).split('?')[0].split('.').pop().toLowerCase();
    if (VIDEO_EXTS.has(ext)) return ext.toUpperCase();
  }
  if (String(course.mime_type || '').toLowerCase().startsWith('video/')) {
    return 'VIDEO';
  }
  return null;
};

const videoMimeForFormat = (format) => {
  switch (String(format || '').toUpperCase()) {
    case 'WEBM': return 'video/webm';
    case 'OGG': return 'video/ogg';
    case 'MOV': return 'video/quicktime';
    case 'MP4':
    default: return 'video/mp4';
  }
};

function CourseDetailsModal({ course, onClose, onEdit }) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewMime, setPreviewMime] = useState('');
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [fileActionError, setFileActionError] = useState('');
  const [fileActionLoading, setFileActionLoading] = useState('');
  const normalizedFormat = (course?.format || '').toUpperCase();
  const isPdf = normalizedFormat === 'PDF';
  const videoFormat = detectVideoFormat(course);
  const isVideo = Boolean(videoFormat);
  const canPreview = isPdf || isVideo;

  useEffect(() => {
    let objectUrl = '';
    let isCancelled = false;

    setPreviewUrl('');
    setPreviewError('');
    setPreviewMime('');
    setVideoLoadError(false);
    setFileActionError('');

    if (!course?.id_ressource || !canPreview) {
      setPreviewLoading(false);
      return undefined;
    }

    setPreviewLoading(true);

    documentsAPI.streamFile(course.id_ressource)
      .then((response) => {
        if (isCancelled) return;
        const rawHeader = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const fallbackType = isPdf ? 'application/pdf' : videoMimeForFormat(videoFormat);
        // If the server returned a generic / wrong content-type for a media file,
        // prefer the typed fallback so <video> / <iframe> can actually render it.
        const isGeneric = !rawHeader
          || rawHeader === 'application/octet-stream'
          || rawHeader === 'binary/octet-stream';
        const type = isGeneric ? fallbackType : rawHeader;
        const blob = new Blob([response.data], { type });
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setPreviewMime(type);
      })
      .catch((err) => {
        if (isCancelled) return;
        setPreviewError(err.response?.data?.message || 'Aperçu non disponible pour ce type de fichier.');
      })
      .finally(() => {
        if (!isCancelled) setPreviewLoading(false);
      });

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [course?.id_ressource, canPreview, isPdf, videoFormat]);

  if (!course) return null;

  const tone = DOCUMENT_TYPE_TONES[course.pedagogicalType.key];
  const previewUnavailableText = 'Aperçu non disponible pour ce type de fichier.';

  const fetchDocumentBlob = async (download = false) => {
    const response = download
      ? await documentsAPI.downloadFile(course.id_ressource)
      : await documentsAPI.streamFile(course.id_ressource);
    const fallbackType = isPdf
      ? 'application/pdf'
      : isVideo
        ? videoMimeForFormat(videoFormat)
        : 'application/octet-stream';
    return new Blob([response.data], {
      type: response.headers['content-type'] || fallbackType,
    });
  };

  const handleOpenFile = async () => {
    setFileActionError('');

    // Fast path: the preview already loaded a typed blob URL (PDF iframe / <video>).
    // Open it synchronously inside the click handler — same URL as the preview.
    if (previewUrl) {
      const win = window.open(previewUrl, '_blank', 'noopener,noreferrer');
      // `noopener` makes `window.open` return null even on success in modern browsers,
      // so we only show the popup warning when the call clearly didn't open anything.
      if (win === null && typeof window.opener !== 'undefined' && document.hasFocus()) {
        // Heuristic: nothing reliable. Skip the false warning.
      }
      return;
    }

    // Slow path: preview hasn't finished loading yet — fetch the blob first, then open.
    setFileActionLoading('open');
    try {
      const blob = await fetchDocumentBlob(false);
      const url = URL.createObjectURL(blob);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (!url) {
        setFileActionError('Impossible d’ouvrir ce fichier.');
        return;
      }
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      // With `noopener` we cannot detect blocking reliably. Only warn if the
      // popup is *unambiguously* blocked (some old browsers return null without `noopener`).
      if (opened === null && !navigator.userAgent) {
        setFileActionError('Autorisez les fenêtres pop-up pour ouvrir ce document.');
      }
    } catch (err) {
      setFileActionError(err.response?.data?.message || 'Impossible d’ouvrir ce fichier.');
    } finally {
      setFileActionLoading('');
    }
  };

  const handleDownloadFile = async () => {
    setFileActionLoading('download');
    setFileActionError('');
    try {
      const blob = await fetchDocumentBlob(true);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = getDownloadFileName(course);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setFileActionError(err.response?.status === 403
        ? 'Ce document n’est pas disponible en téléchargement.'
        : err.response?.data?.message || 'Impossible de télécharger ce fichier.');
    } finally {
      setFileActionLoading('');
    }
  };

  return (
    <div className="teacher-modal-backdrop" role="presentation">
      <div className="teacher-modal teacher-details-modal" role="dialog" aria-modal="true" aria-labelledby="course-details-title">
        <div className="teacher-modal-header">
          <div>
            <h2 id="course-details-title">{t('teacher.ext.modalCourse.title')}</h2>
            <p>{course.titre}</p>
          </div>
          <button type="button" className="teacher-modal-close" onClick={onClose} aria-label={t('teacher.ext.modalCourse.close')}>
            ×
          </button>
        </div>

        <div className="course-details-head">
          <div className="doc-icon">{FORMAT_ICON[course.format] || FORMAT_ICON.default}</div>
          <div>
            <h3>{course.titre}</h3>
            <div className="teacher-doc-meta">
              <span className={`teacher-type-pill tone-${tone}`}>{course.pedagogicalType.label}</span>
              <span className="teacher-status-pill">{course.statusLabel}</span>
            </div>
          </div>
        </div>

        <div className="course-details-grid">
          <div><span>{t('teacher.ext.modalBook.category')}</span><strong>{course.categorie || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>{t('teacher.ext.modalCourse.pubDate')}</span><strong>{formatDate(course.date_publication || course.date_creation)}</strong></div>
          <div><span>{t('teacher.ext.modalCourse.uploadDate')}</span><strong>{formatDate(course.date_creation)}</strong></div>
          <div><span>{t('teacher.ext.modalCourse.views')}</span><strong>{course.consultations}</strong></div>
          <div><span>{t('teacher.ext.mesCours.totalReaders')}</span><strong>{course.readers}</strong></div>
          <div><span>{t('teacher.ext.modalCourse.fileName')}</span><strong>{course.nom_fichier || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>{t('teacher.ext.modalCourse.fileType')}</span><strong>{course.format || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>{t('teacher.ext.modalCourse.size')}</span><strong>{formatFileSize(course.taille_ko)}</strong></div>
        </div>

        <div className="course-description-block">
          <span>{t('teacher.ext.modalCourse.description')}</span>
          <p>{course.description || t('teacher.ext.common.noDescription')}</p>
        </div>

        <div className="course-preview-block">
          <div className="course-preview-header">
            <div>
              <span>{t('teacher.ext.modalCourse.description')}</span>
              <strong>{course.nom_fichier || course.titre}</strong>
            </div>
            <div className="course-file-actions">
              <button
                type="button"
                className="teacher-secondary-action"
                onClick={handleOpenFile}
                disabled={fileActionLoading === 'open'}
              >
                {fileActionLoading === 'open' ? t('teacher.ext.modalCourse.opening') : t('teacher.ext.modalCourse.openFile')}
              </button>
              <button
                type="button"
                className="teacher-primary-action"
                onClick={handleDownloadFile}
                disabled={fileActionLoading === 'download'}
              >
                {fileActionLoading === 'download' ? t('teacher.ext.modalCourse.downloading') : t('teacher.ext.modalCourse.download')}
              </button>
            </div>
          </div>

          <div className="course-preview-frame">
            {canPreview && previewLoading && (
              <div className="course-preview-placeholder">
                {isPdf ? 'Chargement de l’aperçu PDF…' : 'Chargement de la vidéo…'}
              </div>
            )}
            {isPdf && !previewLoading && previewUrl && (
              <iframe
                src={previewUrl}
                title={`Aperçu du document ${course.titre}`}
                className="course-pdf-preview"
              />
            )}
            {isVideo && !previewLoading && previewUrl && !videoLoadError && (
              <video
                controls
                preload="metadata"
                className="course-video-preview"
                onError={() => setVideoLoadError(true)}
              >
                <source
                  src={previewUrl}
                  type={previewMime || videoMimeForFormat(videoFormat)}
                />
                Votre navigateur ne peut pas lire cette vidéo.
              </video>
            )}
            {isVideo && !previewLoading && videoLoadError && (
              <div className="course-preview-placeholder">
                Impossible de prévisualiser cette vidéo. Vous pouvez l’ouvrir ou la télécharger.
              </div>
            )}
            {!canPreview && (
              <div className="course-preview-placeholder">
                {previewUnavailableText}
                {previewError && <small>{previewError}</small>}
              </div>
            )}
            {canPreview && !previewLoading && !previewUrl && previewError && (
              <div className="course-preview-placeholder">
                {previewError}
              </div>
            )}
          </div>

          {fileActionError && (
            <div className="course-file-error">{fileActionError}</div>
          )}
        </div>

        <div className="teacher-modal-actions">
          <button type="button" className="teacher-secondary-action" onClick={onClose}>{t('teacher.ext.modalCourse.close')}</button>
          <button type="button" className="teacher-primary-action" onClick={() => onEdit(course)}>
            {t('teacher.ext.modalCourse.editBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CourseEditModal({ course, categories, loading, onClose, onSubmit }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    titre: course?.titre || '',
    auteur: course?.auteur || '',
    description: course?.description || '',
    id_categorie: course?.id_categorie || '',
    est_telechargeable: course?.est_telechargeable !== false,
  });

  if (!course) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(course.id_ressource, form);
  };

  return (
    <div className="teacher-modal-backdrop" role="presentation">
      <div className="teacher-modal" role="dialog" aria-modal="true" aria-labelledby="course-edit-title">
        <div className="teacher-modal-header">
          <div>
            <h2 id="course-edit-title">{t('teacher.ext.modalCourse.edit')}</h2>
            <p>{course.titre}</p>
          </div>
          <button type="button" className="teacher-modal-close" onClick={onClose} aria-label={t('teacher.ext.modalCourse.close')}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="course-edit-form">
          <div className="form-group">
            <label className="form-label">{t('teacher.upload.courseTitle')}</label>
            <input
              className="form-input"
              value={form.titre}
              onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
              required
            />
          </div>

          <div className="course-edit-grid">
            <div className="form-group">
              <label className="form-label">{t('teacher.ext.upload.authorLabel')}</label>
              <input
                className="form-input"
                value={form.auteur}
                onChange={e => setForm(f => ({ ...f, auteur: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('teacher.upload.category')}</label>
              <select
                className="form-select"
                value={form.id_categorie || ''}
                onChange={e => setForm(f => ({ ...f, id_categorie: e.target.value }))}
              >
                <option value="">{t('teacher.ext.common.notAvailable')}</option>
                {categories.map(category => (
                  <option key={category.id_categorie} value={category.id_categorie}>
                    {category.libelle}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('teacher.upload.description')}</label>
            <textarea
              className="form-input"
              rows={4}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <label className="course-edit-check">
            <input
              type="checkbox"
              checked={form.est_telechargeable}
              onChange={e => setForm(f => ({ ...f, est_telechargeable: e.target.checked }))}
            />
            <span>{t('teacher.upload.downloadable')}</span>
          </label>

          <div className="teacher-modal-actions">
            <button type="button" className="teacher-secondary-action" onClick={onClose}>
              {t('teacher.ext.upload.cancel')}
            </button>
            <button type="submit" className="teacher-primary-action" disabled={loading}>
              {loading ? t('teacher.ext.upload.publishing') : t('teacher.profile.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BookDetailsModal({ book, error, onClose }) {
  const { t } = useTranslation();
  if (!book) return null;

  return (
    <div className="teacher-modal-backdrop" role="presentation">
      <div className="teacher-modal" role="dialog" aria-modal="true" aria-labelledby="book-details-title">
        <div className="teacher-modal-header">
          <div>
            <h2 id="book-details-title">{t('teacher.actions.viewDetails')}</h2>
            <p>{book.titre}</p>
          </div>
          <button type="button" className="teacher-modal-close" onClick={onClose} aria-label={t('teacher.ext.modalBook.close')}>×</button>
        </div>

        {error && <div className="teacher-course-message">{error}</div>}

        <div className="course-details-head">
          <div className="doc-icon">📚</div>
          <div>
            <h3>{book.titre}</h3>
            <div className="teacher-doc-meta">
              <span className="teacher-type-pill tone-gold">{book.categorie || t('teacher.ext.common.notAvailable')}</span>
              <span className={`teacher-status-pill ${Number(book.stock_disponible || 0) > 0 ? 'available' : 'unavailable'}`}>
                {getBookAvailability(book)}
              </span>
            </div>
          </div>
        </div>

        <div className="course-details-grid">
          <div><span>{t('teacher.ext.modalBook.author')}</span><strong>{book.auteur || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>{t('teacher.ext.modalBook.category')}</span><strong>{book.categorie || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>ISBN</span><strong>{book.isbn || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>{t('teacher.ext.modalCourse.pubDate')}</span><strong>{getPublicationYear(book.date_publication)}</strong></div>
          <div><span>{t('teacher.ext.modalBook.language')}</span><strong>{book.langue || book.language || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>{t('admin.dashboard.booksInStock')}</span><strong>{book.stock_total ?? 0}</strong></div>
          <div><span>{t('admin.dashboard.availableCopies')}</span><strong>{book.stock_disponible ?? 0}</strong></div>
          <div><span>{t('admin.books.tableShelf')}</span><strong>{book.emplacement_rayon || t('teacher.ext.common.notAvailable')}</strong></div>
        </div>

        <div className="course-description-block">
          <span>{t('teacher.ext.modalBook.description')}</span>
          <p>{book.description || t('teacher.ext.common.noDescription')}</p>
        </div>

        <div className="teacher-modal-actions">
          <button type="button" className="teacher-primary-action" onClick={onClose}>{t('teacher.ext.modalBook.close')}</button>
        </div>
      </div>
    </div>
  );
}

function DigitalDocumentDetailsModal({
  document,
  actionLoading,
  actionError,
  onClose,
  onOpen,
  onDownload,
}) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const normalizedFormat = (document?.format || '').toUpperCase();
  const isPdf = normalizedFormat === 'PDF';

  useEffect(() => {
    let objectUrl = '';
    let isCancelled = false;

    setPreviewUrl('');
    setPreviewError('');

    if (!document?.id_ressource || !isPdf) {
      setPreviewLoading(false);
      return undefined;
    }

    setPreviewLoading(true);
    documentsAPI.streamFile(document.id_ressource)
      .then((response) => {
        if (isCancelled) return;
        const blob = new Blob([response.data], {
          type: response.headers['content-type'] || 'application/pdf',
        });
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((err) => {
        if (isCancelled) return;
        setPreviewError(err.response?.data?.message || 'Fichier non disponible.');
      })
      .finally(() => {
        if (!isCancelled) setPreviewLoading(false);
      });

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document?.id_ressource, isPdf]);

  if (!document) return null;

  const type = getPedagogicalType(document);
  const tone = DOCUMENT_TYPE_TONES[type.key] || DOCUMENT_TYPE_TONES.autre;

  return (
    <div className="teacher-modal-backdrop" role="presentation">
      <div className="teacher-modal teacher-details-modal" role="dialog" aria-modal="true" aria-labelledby="digital-details-title">
        <div className="teacher-modal-header">
          <div>
            <h2 id="digital-details-title">{t('teacher.actions.viewDetails')}</h2>
            <p>{document.titre}</p>
          </div>
          <button type="button" className="teacher-modal-close" onClick={onClose} aria-label={t('teacher.ext.modalCourse.close')}>×</button>
        </div>

        <div className="course-details-head">
          <div className="doc-icon">{FORMAT_ICON[document.format] || FORMAT_ICON.default}</div>
          <div>
            <h3>{document.titre}</h3>
            <div className="teacher-doc-meta">
              <span className={`teacher-type-pill tone-${tone}`}>{type.i18nKey ? t(type.i18nKey) : type.label}</span>
              <span className="teacher-status-pill">{document.format || t('teacher.ext.modalDigital.fileType')}</span>
            </div>
          </div>
        </div>

        <div className="course-details-grid">
          <div><span>{t('teacher.ext.modalDigital.type')}</span><strong>{type.i18nKey ? t(type.i18nKey) : type.label}</strong></div>
          <div><span>{t('teacher.ext.modalDigital.category')}</span><strong>{document.categorie || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>{t('teacher.ext.modalDigital.authorTeacher')}</span><strong>{getDocumentAuthor(document)}</strong></div>
          <div><span>{t('teacher.ext.modalDigital.fileType')}</span><strong>{document.format || t('teacher.ext.common.notAvailable')}</strong></div>
          <div><span>{t('teacher.ext.modalDigital.size')}</span><strong>{formatFileSize(document.taille_ko)}</strong></div>
          <div><span>{t('teacher.ext.modalDigital.pubDate')}</span><strong>{formatDate(document.date_publication || document.date_creation)}</strong></div>
          <div><span>{t('teacher.ext.modalDigital.views')}</span><strong>{document.nb_consultations || 0}</strong></div>
          <div><span>{t('teacher.actions.download')}</span><strong>{document.est_telechargeable ? t('teacher.status.available') : t('teacher.status.unavailable')}</strong></div>
        </div>

        <div className="course-description-block">
          <span>{t('teacher.ext.modalDigital.description')}</span>
          <p>{document.description || t('teacher.ext.common.noDescription')}</p>
        </div>

        <div className="course-preview-block">
          <div className="course-preview-header">
            <div>
              <span>{t('teacher.ext.modalDigital.description')}</span>
              <strong>{document.nom_fichier || document.titre}</strong>
            </div>
            <div className="course-file-actions">
              <button type="button" className="teacher-secondary-action" onClick={() => onOpen(document)} disabled={actionLoading === 'open'}>
                {actionLoading === 'open' ? t('teacher.ext.modalCourse.opening') : t('teacher.ext.digital.readBtn')}
              </button>
              <button type="button" className="teacher-primary-action" onClick={() => onDownload(document)} disabled={actionLoading === 'download' || !document.est_telechargeable}>
                {actionLoading === 'download' ? t('teacher.ext.modalCourse.downloading') : t('teacher.ext.digital.downloadBtn')}
              </button>
            </div>
          </div>

          <div className="course-preview-frame">
            {isPdf && previewLoading && <div className="course-preview-placeholder">{t('admin.common.loading')}</div>}
            {isPdf && !previewLoading && previewUrl && (
              <iframe src={previewUrl} title={document.titre} className="course-pdf-preview" />
            )}
            {(!isPdf || (!previewLoading && !previewUrl)) && (
              <div className="course-preview-placeholder">
                {previewError || t('teacher.ext.common.notAvailable')}
              </div>
            )}
          </div>

          {actionError && <div className="course-file-error">{actionError}</div>}
        </div>

        <div className="teacher-modal-actions">
          <button type="button" className="teacher-primary-action" onClick={onClose}>{t('teacher.ext.modalCourse.close')}</button>
        </div>
      </div>
    </div>
  );
}

export default function EnseignantDashboard() {
  const { t } = useTranslation();
  const { user, updateUserData } = useAuth();
  const [activeItem, setActiveItem] = useState('dashboard');
  const [mesCours, setMesCours] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [coursePage, setCoursePage] = useState(1);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [courseMessage, setCourseMessage] = useState('');
  const [books, setBooks] = useState([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState('');
  const [bookSearch, setBookSearch] = useState('');
  const [bookCategory, setBookCategory] = useState('');
  const [bookAvailability, setBookAvailability] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookSort, setBookSort] = useState('titre-asc');
  const [bookPage, setBookPage] = useState(1);
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookDetailError, setBookDetailError] = useState('');
  const [digitalDocuments, setDigitalDocuments] = useState([]);
  const [digitalLoading, setDigitalLoading] = useState(false);
  const [digitalError, setDigitalError] = useState('');
  const [digitalSearch, setDigitalSearch] = useState('');
  const [digitalFilter, setDigitalFilter] = useState('all');
  const [digitalPage, setDigitalPage] = useState(1);
  const [statsPeriod, setStatsPeriod] = useState('30');
  const [statsExportMsg, setStatsExportMsg] = useState('');
  const [selectedDigitalDocument, setSelectedDigitalDocument] = useState(null);
  const [digitalActionLoading, setDigitalActionLoading] = useState('');
  const [digitalActionError, setDigitalActionError] = useState('');
  const [profileData, setProfileData] = useState({ user: null });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileEditModalOpen, setProfileEditModalOpen] = useState(false);
  const [profileEditForm, setProfileEditForm] = useState({ nom: '', prenom: '', email: '' });
  const [profileEditSaving, setProfileEditSaving] = useState(false);
  const [profileEditError, setProfileEditError] = useState('');
  const [profileEditSuccess, setProfileEditSuccess] = useState('');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordReveal, setPasswordReveal] = useState({ current: false, next: false, confirm: false });
  const [supportForm, setSupportForm] = useState({
    sujet: '',
    type_probleme: '',
    related_text: '',
    message: '',
  });
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportSuccess, setSupportSuccess] = useState('');
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportListError, setSupportListError] = useState('');
  const [supportFilter, setSupportFilter] = useState('all');
  const [supportSelectedTicket, setSupportSelectedTicket] = useState(null);
  const [supportGuideNotice, setSupportGuideNotice] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refreshUnread = async () => {
      try {
        const res = await notificationsAPI.getUnreadCount();
        if (!cancelled) setUnreadCount(res.data?.data?.count || 0);
      } catch {
        /* silent — auth errors handled globally */
      }
    };
    refreshUnread();
    const intervalId = setInterval(refreshUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsAPI.getAll({ limit: 20 });
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.is_read).length);
    } catch {
      setNotifications([]);
    }
  }, []);

  const handleMarkNotificationRead = useCallback(async (id) => {
    try { await notificationsAPI.markAsRead(id); } catch { /* keep local state */ }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    try { await notificationsAPI.markAllAsRead(); } catch { /* keep local state */ }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const sidebarItemForNotification = (notif) => {
    const url = (notif?.target_url || '').toLowerCase();
    if (url.includes('/support') || url.includes('/help')) return 'centre-aide';
    if (url.includes('/documents') || url.includes('/upload')) return 'mes-cours';
    if (url.includes('/stats')) return 'stats';
    switch (notif?.type) {
      case 'SUPPORT_TICKET':   return 'centre-aide';
      case 'DOCUMENT_UPLOAD':  return 'mes-cours';
      default: return null;
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif) return;
    if (!notif.is_read) handleMarkNotificationRead(notif.id);
    const target = sidebarItemForNotification(notif);
    if (target) setActiveItem(target);
  };

  const loadMesCours = useCallback(async () => {
    setLoading(true);
    try { const r = await statsAPI.getMesCours(); setMesCours(r.data.data); }
    catch {} finally { setLoading(false); }
  }, []);
  const loadCategories = useCallback(async () => {
    try { const r = await categoriesAPI.getAll(); setCategories(r.data.data); } catch {}
  }, []);
  const loadAll = useCallback(() => { loadMesCours(); loadCategories(); }, [loadMesCours, loadCategories]);
  const loadBooks = useCallback(async () => {
    setBooksLoading(true);
    setBooksError('');
    try {
      const response = await livresAPI.getAll({
        limit: 200,
        q: bookSearch.trim() || undefined,
        categorie: bookCategory || undefined,
        disponible: bookAvailability || undefined,
        sort: 'titre',
        order: 'ASC',
      });
      setBooks(response.data.data || []);
    } catch (err) {
      setBooksError(err.response?.data?.message || 'Impossible de charger le catalogue livres.');
    } finally {
      setBooksLoading(false);
    }
  }, [bookSearch, bookCategory, bookAvailability]);
  const loadDigitalDocuments = useCallback(async () => {
    setDigitalLoading(true);
    setDigitalError('');
    try {
      const response = await documentsAPI.getAll({ limit: 500 });
      setDigitalDocuments(response.data.data || []);
    } catch (err) {
      setDigitalError(err.response?.data?.message || 'Impossible de charger la bibliothèque numérique.');
    } finally {
      setDigitalLoading(false);
    }
  }, []);
  const loadTeacherProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const response = await authAPI.getMe();
      setProfileData({ user: response.data.data || null });
    } catch {
      setProfileData({ user: null });
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadSupportTickets = useCallback(async () => {
    setSupportLoading(true);
    setSupportListError('');
    try {
      const response = await supportAPI.getMySupportTickets();
      setSupportTickets(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (err) {
      setSupportTickets([]);
      setSupportListError(err?.response?.data?.message || 'Impossible de charger vos demandes.');
    } finally {
      setSupportLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (activeItem === 'catalogue') loadBooks();
  }, [activeItem, loadBooks]);
  useEffect(() => {
    if (activeItem === 'ged') loadDigitalDocuments();
  }, [activeItem, loadDigitalDocuments]);
  useEffect(() => {
    if (activeItem === 'profil') loadTeacherProfile();
  }, [activeItem, loadTeacherProfile]);
  useEffect(() => {
    if (activeItem === 'centre-aide') loadSupportTickets();
  }, [activeItem, loadSupportTickets]);
  useEffect(() => {
    setCoursePage(1);
  }, [courseSearch, courseFilter]);
  useEffect(() => {
    setBookPage(1);
  }, [bookSearch, bookCategory, bookAvailability, bookAuthor, bookSort]);
  useEffect(() => {
    setDigitalPage(1);
  }, [digitalSearch, digitalFilter]);

  const handleDeleteCours = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce cours/document ?')) return;
    try {
      await documentsAPI.delete(id);
      setCourseMessage('Document supprimé avec succès.');
      loadMesCours();
    } catch (err) {
      setCourseMessage(err.response?.data?.message || 'Impossible de supprimer ce document.');
    }
  };

  const handleEditSubmit = async (id, form) => {
    if (!form.titre.trim()) {
      setCourseMessage('Le titre est requis.');
      return;
    }

    setEditLoading(true);
    try {
      await documentsAPI.update(id, {
        titre: form.titre.trim(),
        auteur: form.auteur || null,
        description: form.description || null,
        id_categorie: form.id_categorie || null,
        est_telechargeable: form.est_telechargeable,
      });
      setEditingCourse(null);
      setCourseMessage('Document modifié avec succès.');
      await loadMesCours();
    } catch (err) {
      setCourseMessage(err.response?.data?.message || 'Impossible de modifier ce document.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleBookDetails = async (book) => {
    setSelectedBook(book);
    setBookDetailError('');
    try {
      const response = await livresAPI.getById(book.id_ressource);
      setSelectedBook(response.data.data);
    } catch (err) {
      setBookDetailError(err.response?.data?.message || 'Impossible de charger les détails du livre.');
    }
  };

  const handleDigitalDetails = async (document) => {
    setSelectedDigitalDocument(document);
    setDigitalActionError('');
    try {
      const response = await documentsAPI.getById(document.id_ressource);
      setSelectedDigitalDocument({
        ...document,
        ...response.data.data,
        pedagogicalType: document.pedagogicalType,
        documentType: document.documentType,
      });
    } catch (err) {
      setDigitalActionError(err.response?.data?.message || 'Impossible de charger les détails du document.');
    }
  };

  const openDocumentBlob = async (document) => {
    setDigitalActionLoading('open');
    setDigitalActionError('');
    try {
      const response = await documentsAPI.streamFile(document.id_ressource);
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        setDigitalActionError('Autorisez les fenêtres pop-up pour ouvrir ce document.');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setDigitalActionError(err.response?.status === 404
        ? 'Fichier non disponible.'
        : err.response?.data?.message || 'Impossible d’ouvrir ce document.');
    } finally {
      setDigitalActionLoading('');
    }
  };

  const downloadDocumentBlob = async (document) => {
    setDigitalActionLoading('download');
    setDigitalActionError('');
    try {
      const response = await documentsAPI.downloadFile(document.id_ressource);
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = getDownloadFileName(document);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setDigitalActionError(err.response?.status === 403
        ? 'Ce document n’est pas disponible en téléchargement.'
        : err.response?.status === 404
          ? 'Fichier non disponible.'
          : err.response?.data?.message || 'Impossible de télécharger ce document.');
    } finally {
      setDigitalActionLoading('');
    }
  };

  const enrichedDocuments = mesCours.map(document => ({
    ...document,
    pedagogicalType: getPedagogicalType(document),
    consultations: parseCount(document.nb_consultations),
    readers: parseCount(document.nb_lecteurs_uniques),
    statusLabel: getDocumentStatus(document),
  }));
  const teacherName = getTeacherName(user);
  const documentsPublies = enrichedDocuments.length;
  const coursAjoutes = enrichedDocuments.filter(doc => doc.pedagogicalType.key === 'cours').length;
  const tpTdAjoutes = enrichedDocuments.filter(doc => doc.pedagogicalType.key === 'tp_td').length;
  const examensAjoutes = enrichedDocuments.filter(doc => doc.pedagogicalType.key === 'examen').length;
  const corrigesAjoutes = enrichedDocuments.filter(doc => doc.pedagogicalType.key === 'corrige').length;
  const totalVues = enrichedDocuments.reduce((s, c) => s + c.consultations, 0);
  const totalReaders = enrichedDocuments.reduce((s, c) => s + c.readers, 0);
  const recentDocuments = [...enrichedDocuments]
    .sort((a, b) => new Date(b.date_creation || 0) - new Date(a.date_creation || 0))
    .slice(0, 6);
  const mostConsultedDocuments = [...enrichedDocuments]
    .filter(document => document.consultations > 0)
    .sort((a, b) => b.consultations - a.consultations)
    .slice(0, 5);
  // ── Dashboard derived data (real DB only) ──────────────────────────
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const isThisMonth = (value) => {
    if (!value) return false;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) && d >= startOfMonth && d <= now;
  };
  const countThisMonth = (predicate = () => true) =>
    enrichedDocuments.filter((doc) => isThisMonth(doc.date_creation) && predicate(doc)).length;

  const documentsCeMois = countThisMonth();
  const coursCeMois = countThisMonth((d) => d.pedagogicalType.key === 'cours');
  const tpTdCeMois = countThisMonth((d) => d.pedagogicalType.key === 'tp_td');
  const examensCeMois = countThisMonth((d) => d.pedagogicalType.key === 'examen');

  const documentsConsultes = enrichedDocuments.filter((d) => d.consultations > 0).length;
  const tauxEngagement = documentsPublies > 0
    ? Math.round((documentsConsultes / documentsPublies) * 100)
    : null;

  const mostConsultedResource = enrichedDocuments.reduce((best, current) => {
    if (current.consultations <= 0) return best;
    if (!best || current.consultations > best.consultations) return current;
    return best;
  }, null);

  const formatMonthlyHint = (count) =>
    count > 0
      ? `+${count} ${t('teacher.ext.dashboard.thisMonth')}`
      : t('teacher.ext.dashboard.noNewThisMonth');

  const summaryCards = [
    {
      label: t('teacher.ext.dashboard.publishedDocs'),
      value: documentsPublies,
      icon: '📄',
      tone: 'gold',
      hint: formatMonthlyHint(documentsCeMois),
    },
    {
      label: t('teacher.ext.dashboard.addedCourses'),
      value: coursAjoutes,
      icon: '📖',
      tone: 'blue',
      hint: formatMonthlyHint(coursCeMois),
    },
    {
      label: t('teacher.ext.dashboard.tpTdAdded'),
      value: tpTdAjoutes,
      icon: '✏️',
      tone: 'green',
      hint: formatMonthlyHint(tpTdCeMois),
    },
    {
      label: t('teacher.ext.dashboard.examsAdded'),
      value: examensAjoutes,
      icon: '📝',
      tone: 'purple',
      hint: formatMonthlyHint(examensCeMois),
    },
    {
      label: t('teacher.ext.dashboard.totalViews'),
      value: totalVues,
      icon: '👁️',
      tone: 'gold',
      hint: totalVues > 0
        ? t('teacher.ext.dashboard.allResourcesIncluded')
        : t('teacher.ext.dashboard.noViewsYet'),
    },
    {
      label: t('teacher.ext.dashboard.totalReaders'),
      value: totalReaders > 0 ? totalReaders : (totalReaders === 0 && documentsPublies > 0 ? 0 : null),
      icon: '👥',
      tone: 'blue',
      hint: totalReaders > 0
        ? t('teacher.ext.dashboard.uniqueReaders')
        : t('teacher.ext.dashboard.noReadersYet'),
    },
    {
      label: t('teacher.ext.dashboard.engagementRate'),
      value: tauxEngagement,
      suffix: tauxEngagement !== null ? '%' : '',
      icon: '📈',
      tone: 'green',
      hint: tauxEngagement !== null
        ? `${documentsConsultes}/${documentsPublies} ${t('teacher.ext.dashboard.resourcesViewed')}`
        : t('teacher.ext.dashboard.insufficientData'),
      ring: tauxEngagement !== null ? tauxEngagement : 0,
      showRing: tauxEngagement !== null,
    },
    {
      label: t('teacher.ext.dashboard.mostViewedResource'),
      value: mostConsultedResource ? mostConsultedResource.titre : null,
      icon: '⭐',
      tone: 'purple',
      hint: mostConsultedResource
        ? `${mostConsultedResource.consultations} ${mostConsultedResource.consultations > 1 ? t('teacher.ext.dashboard.views') : t('teacher.ext.dashboard.view')}`
        : t('teacher.ext.dashboard.noViewsRecorded'),
      compact: true,
    },
  ];
  const quickActions = [
    { label: t('teacher.ext.dashboard.addDocument'), detail: t('teacher.ext.dashboard.publishDigital'), target: 'upload', icon: '📄', tone: 'gold' },
    { label: t('teacher.ext.dashboard.viewMyDocuments'), detail: t('teacher.ext.dashboard.manageResources'), target: 'mes-cours', icon: '📁', tone: 'blue' },
    { label: t('teacher.ext.dashboard.addCourse'), detail: t('teacher.ext.dashboard.uploadMaterial'), target: 'upload', icon: '🎓', tone: 'green' },
    { label: t('teacher.ext.dashboard.viewStats'), detail: t('teacher.ext.dashboard.trackPerformance'), target: 'stats', icon: '📊', tone: 'purple' },
  ];

  // ── Activité ce mois — real series from date_creation ──────────────
  const weeklyActivity = (() => {
    const buckets = [];
    for (let i = 4; i >= 0; i -= 1) {
      const start = new Date(now);
      start.setDate(start.getDate() - i * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const count = enrichedDocuments.filter((d) => {
        if (!d.date_creation) return false;
        const t = new Date(d.date_creation);
        return t >= start && t < end;
      }).length;
      buckets.push({ label: `S${5 - i}`, value: count });
    }
    return buckets;
  })();
  const hasWeeklyData = weeklyActivity.some((b) => b.value > 0);
  const lastConsultation = enrichedDocuments.reduce((latest, current) => {
    if (!current.derniere_consultation) return latest;
    if (!latest) return current;
    return new Date(current.derniere_consultation) > new Date(latest.derniere_consultation)
      ? current
      : latest;
  }, null);

  // ── Statistiques page derived data ──────────────────────────────────
  const STATS_PERIOD_OPTIONS = [
    { value: '7', label: t('teacher.ext.stats.periods.last7') },
    { value: '30', label: t('teacher.ext.stats.periods.last30') },
    { value: '90', label: t('teacher.ext.stats.periods.last90') },
    { value: 'all', label: t('teacher.ext.stats.periods.all') },
  ];
  const statsPeriodLabel =
    STATS_PERIOD_OPTIONS.find((opt) => opt.value === statsPeriod)?.label
    || t('teacher.ext.stats.periods.last30');

  const periodCutoff = (() => {
    if (statsPeriod === 'all') return null;
    const days = Number(statsPeriod);
    if (!Number.isFinite(days)) return null;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  })();

  // Period filter: keep docs that were consulted at least once within the window
  // (so the bar chart / top-list reflect "activity during the period").
  // If no cutoff (Toutes les périodes), keep all docs with > 0 consultations.
  const periodConsultedDocs = enrichedDocuments.filter((d) => {
    if (d.consultations <= 0) return false;
    if (!periodCutoff) return true;
    if (!d.derniere_consultation) return false;
    return new Date(d.derniere_consultation) >= periodCutoff;
  });

  const consultationsPerResource = [...periodConsultedDocs]
    .sort((a, b) => b.consultations - a.consultations)
    .slice(0, 5)
    .map((d) => ({
      titre: d.titre,
      shortTitle: `${(d.titre || '').slice(0, 18)}${(d.titre || '').length > 18 ? '…' : ''}${d.format ? ` - ${d.format}` : ''}`,
      consultations: d.consultations,
      format: d.format,
    }));

  const topResourcesList = [...periodConsultedDocs]
    .sort((a, b) => b.consultations - a.consultations)
    .slice(0, 5);

  // CSV export of teacher resources (real data only)
  const handleExportStats = () => {
    setStatsExportMsg('');
    if (enrichedDocuments.length === 0) {
      setStatsExportMsg('Aucune donnée à exporter pour le moment.');
      return;
    }
    const escape = (val) => {
      const s = String(val == null ? '' : val);
      if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const headers = [
      'Titre', 'Type', 'Format', 'Catégorie',
      'Date de création', 'Consultations', 'Lecteurs uniques', 'Dernière consultation',
    ];
    const rows = enrichedDocuments.map((d) => [
      d.titre,
      d.pedagogicalType.label,
      d.format,
      d.categorie,
      d.date_creation ? new Date(d.date_creation).toISOString().slice(0, 10) : '',
      d.consultations,
      d.readers,
      d.derniere_consultation ? new Date(d.derniere_consultation).toISOString().slice(0, 10) : '',
    ]);
    const csv = '﻿' + [headers, ...rows].map((r) => r.map(escape).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `statistiques-mes-cours-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatsExportMsg('Export généré avec succès.');
    setTimeout(() => setStatsExportMsg(''), 3500);
  };

  const handleViewTopResource = () => {
    if (mostConsultedResource) {
      setActiveItem('mes-cours');
    }
  };

  const TYPE_PIE_COLORS = {
    gold: '#eab308',
    green: '#22c55e',
    blue: '#60a5fa',
    purple: '#a78bfa',
    slate: '#64748b',
  };
  const normalizedCourseSearch = normalizeText(courseSearch.trim());
  const filteredCourses = enrichedDocuments.filter(document => {
    const matchesSearch = !normalizedCourseSearch || normalizeText([
      document.titre,
      document.categorie,
      document.pedagogicalType.label,
      document.format,
      document.statusLabel,
    ].filter(Boolean).join(' ')).includes(normalizedCourseSearch);

    const matchesFilter = courseFilter === 'all'
      || (courseFilter === 'pdf' && document.format === 'PDF')
      || (courseFilter === 'docx' && document.format === 'DOCX')
      || (courseFilter === 'pptx' && document.format === 'PPTX')
      || document.pedagogicalType.key === courseFilter;

    return matchesSearch && matchesFilter;
  });
  const latestPublication = recentDocuments[0] || null;
  const coursePageCount = Math.max(1, Math.ceil(filteredCourses.length / COURSE_PAGE_SIZE));
  const safeCoursePage = Math.min(coursePage, coursePageCount);
  const pagedCourses = filteredCourses.slice(
    (safeCoursePage - 1) * COURSE_PAGE_SIZE,
    safeCoursePage * COURSE_PAGE_SIZE
  );
  const courseRangeStart = filteredCourses.length === 0
    ? 0
    : (safeCoursePage - 1) * COURSE_PAGE_SIZE + 1;
  const courseRangeEnd = Math.min(safeCoursePage * COURSE_PAGE_SIZE, filteredCourses.length);

  const bookAuthors = Array.from(new Set(books.map(book => book.auteur).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  // Client-side filter: author + "Indisponible" (the server only knows 'true')
  const filteredBooks = books.filter((book) => {
    if (bookAuthor && book.auteur !== bookAuthor) return false;
    if (bookAvailability === 'false' && Number(book.stock_disponible || 0) > 0) return false;
    return true;
  });

  const CATALOG_PAGE_SIZE = 12;
  // Client-side sort
  const sortedBooks = [...filteredBooks].sort((a, b) => {
    switch (bookSort) {
      case 'titre-desc':
        return (b.titre || '').localeCompare(a.titre || '', 'fr');
      case 'auteur-asc':
        return (a.auteur || '').localeCompare(b.auteur || '', 'fr');
      case 'stock-desc':
        return Number(b.stock_disponible || 0) - Number(a.stock_disponible || 0);
      case 'recent':
        return new Date(b.date_creation || 0) - new Date(a.date_creation || 0);
      case 'titre-asc':
      default:
        return (a.titre || '').localeCompare(b.titre || '', 'fr');
    }
  });

  const visibleBooks = sortedBooks;
  const bookPageCount = Math.max(1, Math.ceil(visibleBooks.length / CATALOG_PAGE_SIZE));
  const typedDigitalDocuments = digitalDocuments.map(document => ({
    ...document,
    pedagogicalType: getPedagogicalType(document),
    normalizedFormat: (document.format || 'AUTRE').toUpperCase(),
  }));
  const normalizedDigitalSearch = normalizeText(digitalSearch.trim());
  const filteredDigitalDocuments = typedDigitalDocuments.filter(document => {
    const matchesSearch = !normalizedDigitalSearch || normalizeText([
      document.titre,
      document.auteur,
      getUploaderName(document),
      document.categorie,
      document.pedagogicalType.label,
      document.format,
    ].filter(Boolean).join(' ')).includes(normalizedDigitalSearch);
    const matchesFilter = digitalFilter === 'all'
      || document.pedagogicalType.key === digitalFilter
      || (digitalFilter === 'pdf' && document.normalizedFormat === 'PDF')
      || (digitalFilter === 'video' && ['MP4', 'VIDEO'].includes(document.normalizedFormat));
    return matchesSearch && matchesFilter;
  });
  const DIGITAL_PAGE_SIZE = 20;
  const digitalPageCount = Math.max(1, Math.ceil(filteredDigitalDocuments.length / DIGITAL_PAGE_SIZE));
  const safeDigitalPage = Math.min(digitalPage, digitalPageCount);
  const pagedDigitalDocuments = filteredDigitalDocuments.slice(
    (safeDigitalPage - 1) * DIGITAL_PAGE_SIZE,
    safeDigitalPage * DIGITAL_PAGE_SIZE
  );
  const digitalRangeStart = filteredDigitalDocuments.length === 0
    ? 0
    : (safeDigitalPage - 1) * DIGITAL_PAGE_SIZE + 1;
  const digitalRangeEnd = Math.min(safeDigitalPage * DIGITAL_PAGE_SIZE, filteredDigitalDocuments.length);
  const documentTypeDistribution = [
    { key: 'cours', label: t('teacher.ext.pedaTypes.cours'), value: coursAjoutes, tone: 'gold' },
    { key: 'tp_td', label: t('teacher.ext.pedaTypes.tp_td'), value: tpTdAjoutes, tone: 'green' },
    { key: 'examen', label: t('teacher.ext.pedaTypes.examen'), value: examensAjoutes, tone: 'blue' },
    { key: 'corrige', label: t('teacher.ext.pedaTypes.corrige'), value: corrigesAjoutes, tone: 'purple' },
    {
      key: 'autre',
      label: t('teacher.ext.stats.others'),
      value: Math.max(documentsPublies - coursAjoutes - tpTdAjoutes - examensAjoutes - corrigesAjoutes, 0),
      tone: 'slate',
    },
  ];
  // Document type distribution as % of total (used by Statistiques page)
  const typeDistribution = documentTypeDistribution.map((item) => ({
    ...item,
    pct: documentsPublies > 0 ? (item.value / documentsPublies) * 100 : 0,
  }));
  const typeDistributionForChart = typeDistribution.filter((item) => item.value > 0);

  const profileUser = profileData.user || user || {};
  const profileFullName = [profileUser?.prenom, profileUser?.nom].filter(Boolean).join(' ').trim();
  const profileSpecialty = getAvailableProfileValue(profileUser, [
    'matiere',
    'matiere_enseignement',
    'specialite',
    'discipline',
  ]);
  const profileDepartment = getAvailableProfileValue(profileUser, [
    'departement',
    'department',
    'departement_enseignant',
  ]);
  const profileCreatedAtRaw = getAvailableProfileValue(profileUser, [
    'date_creation',
    'dateCreation',
    'created_at',
    'createdAt',
    'created_on',
  ]);
  const profileCreatedAtDisplay = formatProfileDate(profileCreatedAtRaw) || PROFILE_UNAVAILABLE;
  const profileRoleI18nMap = {
    ETUDIANT: 'teacher.ext.roles.etudiant',
    ENSEIGNANT: 'teacher.ext.roles.enseignant',
    BIBLIOTHECAIRE: 'teacher.ext.roles.bibliothecaire',
    ADMIN: 'teacher.ext.roles.admin',
  };
  const profileRoleLabel = profileRoleI18nMap[profileUser?.role]
    ? t(profileRoleI18nMap[profileUser?.role])
    : (profileUser?.role || t('teacher.ext.profile.notAvailable'));
  const profileNotAvailable = t('teacher.ext.profile.notAvailable');
  const profileInfoRows = [
    { icon: '👤', label: t('teacher.ext.profile.fullName'), value: profileFullName || profileNotAvailable },
    { icon: '✉️', label: t('teacher.ext.profile.email'), value: profileUser?.email || profileNotAvailable },
    { icon: '🛡️', label: t('teacher.profile.role'), value: profileRoleLabel },
    {
      icon: '📅',
      label: t('teacher.ext.profile.accountCreated'),
      value: profileCreatedAtDisplay,
    },
    { icon: '📖', label: t('teacher.ext.profile.subjectSpecialty'), value: profileSpecialty || profileNotAvailable },
    { icon: '🏛️', label: t('teacher.profile.department'), value: profileDepartment || profileNotAvailable },
  ];
  const profileAccountBlocked = profileUser?.est_bloque === true;
  const profileSecurityRows = [
    {
      icon: '🔑',
      label: t('teacher.ext.profile.password'),
      value: '••••••••',
      mono: true,
    },
    {
      icon: '✅',
      label: t('teacher.ext.profile.accountStatus'),
      value: profileAccountBlocked ? t('teacher.ext.profile.blocked') : t('teacher.ext.profile.active'),
      tone: profileAccountBlocked ? 'danger' : 'success',
    },
    {
      icon: '🛡️',
      label: t('teacher.ext.profile.security'),
      value: t('teacher.ext.profile.protected'),
      tone: 'success',
    },
  ];
  const supportMessageLength = supportForm.message.length;
  const filteredSupportTickets = supportTickets.filter(ticket => {
    if (supportFilter === 'all') return true;
    const meta = TEACHER_SUPPORT_STATUS_META[ticket?.statut];
    return meta && meta.filterKey === supportFilter;
  });

  const openProfileEditModal = () => {
    setProfileEditForm({
      nom: profileUser?.nom || '',
      prenom: profileUser?.prenom || '',
      email: profileUser?.email || '',
    });
    setProfileEditError('');
    setProfileEditSuccess('');
    setProfileEditModalOpen(true);
  };

  const closeProfileEditModal = () => {
    if (profileEditSaving) return;
    setProfileEditModalOpen(false);
    setProfileEditError('');
    setProfileEditSuccess('');
  };

  const handleProfileEditSubmit = async (e) => {
    e.preventDefault();
    setProfileEditError('');
    setProfileEditSuccess('');

    const nom = (profileEditForm.nom || '').trim();
    const prenom = (profileEditForm.prenom || '').trim();
    const email = (profileEditForm.email || '').trim();

    if (!nom) {
      setProfileEditError(t('teacher.ext.profile.errorLastNameRequired'));
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setProfileEditError(t('teacher.ext.profile.errorInvalidEmail'));
      return;
    }

    setProfileEditSaving(true);
    try {
      const response = await authAPI.updateMe({ nom, prenom, email });
      const nextUser = response.data?.data || null;
      if (nextUser) {
        setProfileData({ user: nextUser });
        if (typeof updateUserData === 'function') updateUserData(nextUser);
      }
      setProfileEditSuccess('Profil mis à jour avec succès.');
      window.setTimeout(() => {
        setProfileEditModalOpen(false);
        setProfileEditSuccess('');
      }, 1500);
    } catch (err) {
      setProfileEditError(err?.response?.data?.message || 'Impossible de mettre à jour le profil.');
    } finally {
      setProfileEditSaving(false);
    }
  };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    setSupportError('');
    setSupportSuccess('');

    const sujet = supportForm.sujet.trim();
    const type_probleme = supportForm.type_probleme.trim();
    const message = supportForm.message.trim();
    const related_text = supportForm.related_text.trim();

    if (!sujet) {
      setSupportError('Le sujet est requis.');
      return;
    }
    if (!type_probleme) {
      setSupportError('Le type de problème est requis.');
      return;
    }
    if (!message) {
      setSupportError('Le message est requis.');
      return;
    }
    if (message.length > TEACHER_SUPPORT_MESSAGE_MAX) {
      setSupportError(`Le message ne doit pas dépasser ${TEACHER_SUPPORT_MESSAGE_MAX} caractères.`);
      return;
    }

    setSupportSaving(true);
    try {
      await supportAPI.createSupportTicket({ sujet, type_probleme, message, related_text });
      setSupportSuccess('Votre demande a été envoyée à l’administration.');
      setSupportForm({ sujet: '', type_probleme: '', related_text: '', message: '' });
      loadSupportTickets();
      window.setTimeout(() => setSupportSuccess(''), 3500);
    } catch (err) {
      setSupportError(err?.response?.data?.message || 'Erreur lors de l’envoi de la demande.');
    } finally {
      setSupportSaving(false);
    }
  };

  const handleSupportGuideClick = () => {
    setSupportGuideNotice('Guide indisponible pour le moment.');
    window.setTimeout(() => setSupportGuideNotice(''), 3000);
  };

  const closePasswordModal = () => {
    if (passwordSaving) return;
    setPasswordModalOpen(false);
    setPasswordForm({ current: '', next: '', confirm: '' });
    setPasswordReveal({ current: false, next: false, confirm: false });
    setPasswordError('');
    setPasswordSuccess('');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const { current, next, confirm } = passwordForm;
    if (!current || !next || !confirm) {
      setPasswordError('Tous les champs sont requis.');
      return;
    }
    if (next.length < 6) {
      setPasswordError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (next !== confirm) {
      setPasswordError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setPasswordSaving(true);
    try {
      await authAPI.changePassword({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      setPasswordSuccess('Mot de passe modifié avec succès.');
      setPasswordForm({ current: '', next: '', confirm: '' });
      window.setTimeout(() => {
        setPasswordModalOpen(false);
        setPasswordSuccess('');
      }, 1600);
    } catch (err) {
      setPasswordError(err?.response?.data?.message || 'Impossible de modifier le mot de passe.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar items={SIDEBAR_ITEMS} activeItem={activeItem} onItemClick={setActiveItem} />
      <div className="admin-main">
        <Navbar
          title={t('teacher.navTitle')}
          notifications={notifications}
          unreadCount={unreadCount}
          onOpenNotifications={loadNotifications}
          onMarkAsRead={handleMarkNotificationRead}
          onMarkAllRead={handleMarkAllNotificationsRead}
          onNotificationClick={handleNotificationClick}
        />
        <div className="admin-content">

          {/* ── DASHBOARD ─────────────── */}
          {activeItem === 'dashboard' && (
            <>
              <section className="tb-hero">
                <div className="tb-hero-copy">
                  <div className="tb-hero-kicker">{t('teacher.kickers.teacherSpace')}</div>
                  <h1>{t('teacher.hello')}, {teacherName}</h1>
                  <p>{t('teacher.dashboard.intro')}</p>
                </div>
                <button
                  className="tb-hero-btn"
                  type="button"
                  onClick={() => setActiveItem('upload')}
                >
                  <span aria-hidden="true">+</span> {t('teacher.ext.mesCours.newDocument')}
                </button>
                <div className="tb-hero-illustration" aria-hidden="true">
                  <span className="tb-illus-globe">🌐</span>
                  <span className="tb-illus-books">📚</span>
                  <span className="tb-illus-doc">📑</span>
                  <span className="tb-illus-spark1">✦</span>
                  <span className="tb-illus-spark2">✧</span>
                </div>
              </section>

              <section className="tb-stats-grid" aria-label="Statistiques pédagogiques">
                {summaryCards.map((card) => {
                  const isUnavailable =
                    card.value === null || card.value === undefined;
                  const displayValue = isUnavailable
                    ? 'Non disponible'
                    : (card.compact
                        ? String(card.value)
                        : `${typeof card.value === 'number'
                            ? new Intl.NumberFormat('fr-FR').format(card.value)
                            : card.value}${card.suffix || ''}`);
                  return (
                    <article
                      key={card.label}
                      className={`tb-stat-card tb-tone-${card.tone}${card.compact ? ' tb-stat-compact' : ''}`}
                    >
                      <div className="tb-stat-head">
                        <div className="tb-stat-icon" aria-hidden="true">{card.icon}</div>
                        {card.showRing && (
                          <div
                            className="tb-stat-ring"
                            style={{
                              background: `conic-gradient(var(--tb-ring-color, #22c55e) ${card.ring}%, rgba(255,255,255,0.08) 0)`,
                            }}
                            aria-hidden="true"
                          >
                            <span>{card.ring}%</span>
                          </div>
                        )}
                      </div>
                      <div className="tb-stat-body">
                        <span className="tb-stat-label">{card.label}</span>
                        <strong
                          className={`tb-stat-value${isUnavailable ? ' tb-stat-unavailable' : ''}${card.compact && !isUnavailable ? ' tb-stat-value-compact' : ''}`}
                        >
                          {displayValue}
                        </strong>
                        {card.hint && <em className="tb-stat-hint">{card.hint}</em>}
                      </div>
                    </article>
                  );
                })}
              </section>

              <section className="tb-actions-grid" aria-label="Actions rapides">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={`tb-action-card tb-tone-${action.tone}`}
                    onClick={() => setActiveItem(action.target)}
                  >
                    <span className="tb-action-icon" aria-hidden="true">{action.icon}</span>
                    <div className="tb-action-text">
                      <strong>{action.label}</strong>
                      <em>{action.detail}</em>
                    </div>
                    <span className="tb-action-arrow" aria-hidden="true">›</span>
                  </button>
                ))}
              </section>

              <section className="tb-bottom-grid">
                {/* Recent documents */}
                <article className="tb-panel">
                  <header className="tb-panel-header">
                    <h2>
                      <span aria-hidden="true">📄</span> {t('teacher.ext.dashboard.recentlyPublished')}
                    </h2>
                    <button
                      type="button"
                      className="tb-link-btn"
                      onClick={() => setActiveItem('mes-cours')}
                    >
                      {t('teacher.ext.dashboard.viewAll')} ›
                    </button>
                  </header>
                  <div className="tb-doc-list">
                    {loading ? (
                      <div className="tb-loading">{t('admin.common.loading')}</div>
                    ) : recentDocuments.length === 0 ? (
                      <div className="tb-empty">
                        {t('teacher.mesCours.empty')}
                      </div>
                    ) : (
                      recentDocuments.map((document) => (
                        <div key={document.id_ressource} className="tb-doc-row">
                          <span className={`tb-format-badge tb-fmt-${(document.format || 'default').toLowerCase()}`}>
                            {document.format || 'DOC'}
                          </span>
                          <div className="tb-doc-info">
                            <div className="tb-doc-title">{document.titre}</div>
                            {document.categorie && (
                              <div className="tb-doc-cat">{document.categorie}</div>
                            )}
                          </div>
                          <span className={`teacher-type-pill tone-${DOCUMENT_TYPE_TONES[document.pedagogicalType.key]}`}>
                            {document.pedagogicalType.i18nKey ? t(document.pedagogicalType.i18nKey) : document.pedagogicalType.label}
                          </span>
                          <span className="tb-doc-date">
                            <span aria-hidden="true">📅</span> {formatDate(document.date_creation)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                {/* Most consulted */}
                <article className="tb-panel">
                  <header className="tb-panel-header">
                    <h2>
                      <span aria-hidden="true">⭐</span> {t('teacher.ext.dashboard.mostViewedResources')}
                    </h2>
                    <button
                      type="button"
                      className="tb-link-btn"
                      onClick={() => setActiveItem('stats')}
                    >
                      {t('teacher.ext.dashboard.viewAll')} ›
                    </button>
                  </header>
                  <div className="tb-consulted-list">
                    {loading ? (
                      <div className="tb-loading">{t('admin.common.loading')}</div>
                    ) : mostConsultedDocuments.length === 0 ? (
                      <div className="tb-empty">
                        {t('teacher.mesCours.empty')}
                      </div>
                    ) : (
                      mostConsultedDocuments.map((document, index) => (
                        <div key={document.id_ressource} className="tb-consulted-row">
                          <span className={`tb-rank tb-rank-${index + 1}`}>{index + 1}</span>
                          <span className={`tb-format-badge tb-fmt-${(document.format || 'default').toLowerCase()}`}>
                            {document.format || 'DOC'}
                          </span>
                          <div className="tb-consulted-info">
                            <div className="tb-consulted-title">{document.titre}</div>
                            <div className="tb-consulted-meta">{document.pedagogicalType.i18nKey ? t(document.pedagogicalType.i18nKey) : document.pedagogicalType.label}</div>
                          </div>
                          <div className="tb-consulted-count">
                            <strong>{document.consultations}</strong>
                            <em>{t('teacher.ext.dashboard.views')}</em>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                {/* Activity this month */}
                <article className="tb-panel tb-activity-panel">
                  <header className="tb-panel-header">
                    <h2>{t('teacher.ext.dashboard.activityThisMonth')}</h2>
                  </header>
                  {hasWeeklyData ? (
                    <div className="tb-activity-chart">
                      <ResponsiveContainer width="100%" height={140}>
                        <AreaChart data={weeklyActivity} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="tbActivityFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#eab308" stopOpacity={0.45} />
                              <stop offset="100%" stopColor="#eab308" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="label"
                            tick={{ fill: '#94a0bc', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis hide allowDecimals={false} />
                          <Tooltip
                            cursor={{ stroke: 'rgba(234,179,8,0.2)' }}
                            contentStyle={{
                              background: '#0f172a',
                              border: '1px solid rgba(234,179,8,0.35)',
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            labelStyle={{ color: '#fde68a' }}
                            itemStyle={{ color: '#e4e8f1' }}
                            formatter={(value) => [value, 'Documents']}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#eab308"
                            strokeWidth={2}
                            fill="url(#tbActivityFill)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="tb-empty tb-empty-small">
                      {t('teacher.ext.dashboard.noActivityThisMonth')}
                    </div>
                  )}
                  <div className="tb-activity-list">
                    <div className="tb-activity-row">
                      <span className="tb-activity-icon" aria-hidden="true">👁️</span>
                      <span className="tb-activity-label">{t('teacher.ext.dashboard.viewsLabel')}</span>
                      <strong>{new Intl.NumberFormat('fr-FR').format(totalVues)}</strong>
                    </div>
                    <div className="tb-activity-row">
                      <span className="tb-activity-icon" aria-hidden="true">👥</span>
                      <span className="tb-activity-label">{t('teacher.ext.dashboard.readersLabel')}</span>
                      <strong>
                        {totalReaders > 0
                          ? new Intl.NumberFormat('fr-FR').format(totalReaders)
                          : t('teacher.ext.common.notAvailable')}
                      </strong>
                    </div>
                    <div className="tb-activity-row">
                      <span className="tb-activity-icon" aria-hidden="true">📄</span>
                      <span className="tb-activity-label">{t('teacher.ext.dashboard.publishedLabel')}</span>
                      <strong>{documentsPublies}</strong>
                    </div>
                    {documentsCeMois > 0 && (
                      <div className="tb-activity-row tb-activity-row-muted">
                        <span className="tb-activity-icon" aria-hidden="true">🆕</span>
                        <span className="tb-activity-label">{t('teacher.ext.dashboard.newThisMonth')}</span>
                        <strong>{documentsCeMois}</strong>
                      </div>
                    )}
                    {lastConsultation && (
                      <div className="tb-activity-row tb-activity-row-muted">
                        <span className="tb-activity-icon" aria-hidden="true">⏱️</span>
                        <span className="tb-activity-label">{t('teacher.ext.dashboard.lastViewLabel')}</span>
                        <strong>{formatDate(lastConsultation.derniere_consultation)}</strong>
                      </div>
                    )}
                  </div>
                </article>
              </section>
            </>
          )}

          {/* ── MES COURS ─────────────── */}
          {activeItem === 'mes-cours' && (
            <>
              <section className="mc-hero">
                <div className="mc-hero-copy">
                  <div className="mc-hero-kicker">{t('teacher.kickers.teacherSpace')}</div>
                  <h1>{t('teacher.mesCours.title')}</h1>
                  <p>{t('teacher.mesCours.intro')}</p>
                </div>
                <button
                  className="mc-hero-btn"
                  type="button"
                  onClick={() => setActiveItem('upload')}
                >
                  <span aria-hidden="true">+</span> {t('teacher.mesCours.newCourse')}
                </button>
                <div className="mc-hero-illustration" aria-hidden="true">
                  <span className="mc-illus-doc">📚</span>
                  <span className="mc-illus-pen">✏️</span>
                  <span className="mc-illus-clip">📎</span>
                  <span className="mc-illus-spark1">✦</span>
                  <span className="mc-illus-spark2">✧</span>
                </div>
              </section>

              {courseMessage && (
                <div className="mc-banner">
                  {courseMessage}
                  <button type="button" onClick={() => setCourseMessage('')} aria-label="Fermer">×</button>
                </div>
              )}

              <section className="mc-stats-grid" aria-label={t('teacher.ext.mesCours.publishedDocs')}>
                {[
                  { label: t('teacher.ext.mesCours.publishedDocs'), value: documentsPublies, icon: '📄', tone: 'gold' },
                  { label: t('teacher.ext.mesCours.addedCourses'), value: coursAjoutes, icon: '📖', tone: 'blue' },
                  { label: t('teacher.ext.mesCours.tpTdAdded'), value: tpTdAjoutes, icon: '🧪', tone: 'green' },
                  { label: t('teacher.ext.mesCours.examsAdded'), value: examensAjoutes, icon: '📝', tone: 'purple' },
                  {
                    label: t('teacher.ext.mesCours.totalViews'),
                    value: totalVues,
                    icon: '👁️',
                    tone: 'gold',
                  },
                  {
                    label: t('teacher.ext.mesCours.totalReaders'),
                    value: totalReaders > 0
                      ? totalReaders
                      : (documentsPublies > 0 ? 0 : null),
                    icon: '👥',
                    tone: 'blue',
                  },
                  {
                    label: t('teacher.ext.mesCours.mostViewedDoc'),
                    value: mostConsultedResource ? mostConsultedResource.titre : null,
                    hint: mostConsultedResource
                      ? `${mostConsultedResource.consultations} ${t('teacher.ext.dashboard.views')}`
                      : null,
                    icon: '⭐',
                    tone: 'green',
                    compact: true,
                  },
                  {
                    label: t('teacher.ext.mesCours.latestPublication'),
                    value: latestPublication ? latestPublication.titre : null,
                    hint: latestPublication
                      ? formatDate(latestPublication.date_creation)
                      : null,
                    icon: '🕒',
                    tone: 'purple',
                    compact: true,
                  },
                ].map((card) => {
                  const isUnavailable = card.value === null || card.value === undefined;
                  const display = isUnavailable
                    ? 'Non disponible'
                    : (card.compact
                        ? String(card.value)
                        : new Intl.NumberFormat('fr-FR').format(card.value));
                  return (
                    <article
                      key={card.label}
                      className={`mc-stat-card tb-tone-${card.tone}${card.compact ? ' mc-stat-compact' : ''}`}
                    >
                      <div className="mc-stat-icon" aria-hidden="true">{card.icon}</div>
                      <div className="mc-stat-body">
                        <span className="mc-stat-label">{card.label}</span>
                        <strong
                          className={`mc-stat-value${isUnavailable ? ' mc-stat-unavailable' : ''}${card.compact && !isUnavailable ? ' mc-stat-value-compact' : ''}`}
                        >
                          {display}
                        </strong>
                        {card.hint && !isUnavailable && (
                          <em className="mc-stat-hint">{card.hint}</em>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>

              <section className="mc-toolbar">
                <div className="mc-search">
                  <span aria-hidden="true">🔍</span>
                  <input
                    type="search"
                    value={courseSearch}
                    onChange={(event) => setCourseSearch(event.target.value)}
                    placeholder={t('teacher.mesCours.search')}
                  />
                </div>
                <div className="mc-filters" role="tablist" aria-label={t('teacher.mesCours.search')}>
                  {COURSE_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={`mc-filter${courseFilter === filter.key ? ' is-active' : ''}`}
                      onClick={() => setCourseFilter(filter.key)}
                    >
                      {filter.i18nKey ? t(filter.i18nKey) : filter.label}
                    </button>
                  ))}
                </div>
              </section>

              {loading ? (
                <div className="mc-loading">Chargement de vos documents…</div>
              ) : enrichedDocuments.length === 0 ? (
                <div className="mc-empty">
                  <div className="mc-empty-icon" aria-hidden="true">📤</div>
                  <div className="mc-empty-title">Aucun document publié pour le moment.</div>
                  <button
                    type="button"
                    className="mc-empty-btn"
                    onClick={() => setActiveItem('upload')}
                  >
                    Ajouter un document
                  </button>
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="mc-empty">
                  <div className="mc-empty-icon" aria-hidden="true">🔎</div>
                  <div className="mc-empty-title">Aucun document trouvé.</div>
                  <button
                    type="button"
                    className="mc-empty-btn mc-empty-btn-ghost"
                    onClick={() => { setCourseSearch(''); setCourseFilter('all'); }}
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              ) : (
                <>
                  <section className="mc-grid">
                    {pagedCourses.map((course) => (
                      <article key={course.id_ressource} className="mc-card">
                        <header className="mc-card-head">
                          <span className={`tb-format-badge tb-fmt-${(course.format || 'default').toLowerCase()}`}>
                            {course.format || 'DOC'}
                          </span>
                          <span className="mc-card-status">{course.statusLabel || t('teacher.status.published')}</span>
                        </header>

                        <h3 className="mc-card-title" title={course.titre}>{course.titre}</h3>

                        <div className="mc-card-pills">
                          <span className={`teacher-type-pill tone-${DOCUMENT_TYPE_TONES[course.pedagogicalType.key]}`}>
                            {course.pedagogicalType.i18nKey ? t(course.pedagogicalType.i18nKey) : course.pedagogicalType.label}
                          </span>
                          {course.categorie && (
                            <span className="mc-card-cat">{course.categorie}</span>
                          )}
                        </div>

                        <div className="mc-card-meta">
                          <div className="mc-meta-item">
                            <span aria-hidden="true">👁️</span>
                            <strong>{course.consultations}</strong>
                            <em>{t('teacher.ext.dashboard.views')}</em>
                          </div>
                          <div className="mc-meta-item">
                            <span aria-hidden="true">👥</span>
                            <strong>{course.readers}</strong>
                            <em>{t('teacher.ext.mesCours.totalReaders')}</em>
                          </div>
                          <div className="mc-meta-item">
                            <span aria-hidden="true">📅</span>
                            <strong>{formatDate(course.date_creation)}</strong>
                            <em>{t('teacher.ext.modalCourse.pubDate')}</em>
                          </div>
                        </div>

                        <footer className="mc-card-actions">
                          <button
                            type="button"
                            className="mc-btn mc-btn-primary"
                            onClick={() => setSelectedCourse(course)}
                          >
                            {t('teacher.actions.viewDetails')}
                          </button>
                          <button
                            type="button"
                            className="mc-btn mc-btn-secondary"
                            onClick={() => setEditingCourse(course)}
                          >
                            {t('teacher.actions.edit')}
                          </button>
                          <button
                            type="button"
                            className="mc-btn mc-btn-danger"
                            onClick={() => handleDeleteCours(course.id_ressource)}
                          >
                            {t('teacher.actions.delete')}
                          </button>
                        </footer>
                      </article>
                    ))}
                  </section>

                  <footer className="mc-pagination">
                    <div className="mc-pagination-info">
                      Affichage de {courseRangeStart} à {courseRangeEnd} sur {filteredCourses.length} document{filteredCourses.length > 1 ? 's' : ''}
                    </div>
                    {coursePageCount > 1 && (
                      <div className="mc-pagination-controls">
                        <button
                          type="button"
                          onClick={() => setCoursePage((p) => Math.max(1, p - 1))}
                          disabled={safeCoursePage <= 1}
                        >
                          ‹ Précédent
                        </button>
                        <span>Page {safeCoursePage} / {coursePageCount}</span>
                        <button
                          type="button"
                          onClick={() => setCoursePage((p) => Math.min(coursePageCount, p + 1))}
                          disabled={safeCoursePage >= coursePageCount}
                        >
                          Suivant ›
                        </button>
                      </div>
                    )}
                  </footer>
                </>
              )}

              <CourseDetailsModal
                course={selectedCourse}
                onClose={() => setSelectedCourse(null)}
                onEdit={(course) => {
                  setSelectedCourse(null);
                  setEditingCourse(course);
                }}
              />
              {editingCourse && (
                <CourseEditModal
                  key={editingCourse.id_ressource}
                  course={editingCourse}
                  categories={categories}
                  loading={editLoading}
                  onClose={() => setEditingCourse(null)}
                  onSubmit={handleEditSubmit}
                />
              )}
            </>
          )}

          {/* ── UPLOAD ──────────────────── */}
          {activeItem === 'upload' && (
            <UploadForm
              categories={categories}
              currentUser={user}
              onSuccess={() => {
                loadMesCours();
                setActiveItem('mes-cours');
              }}
              onCancel={() => setActiveItem('mes-cours')}
            />
          )}

          {activeItem === 'catalogue' && (() => {
            const safeBookPage = Math.min(bookPage, bookPageCount);
            const bookRangeStart = visibleBooks.length === 0 ? 0 : (safeBookPage - 1) * CATALOG_PAGE_SIZE + 1;
            const bookRangeEnd = Math.min(safeBookPage * CATALOG_PAGE_SIZE, visibleBooks.length);
            const pagedBooks = visibleBooks.slice(
              (safeBookPage - 1) * CATALOG_PAGE_SIZE,
              safeBookPage * CATALOG_PAGE_SIZE
            );
            const resetCatalogFilters = () => {
              setBookSearch('');
              setBookCategory('');
              setBookAvailability('');
              setBookAuthor('');
              setBookSort('titre-asc');
            };

            // Deterministic gradient palette for CSS book covers
            const COVER_PALETTES = [
              ['#0c4a6e', '#082f49'],
              ['#1e293b', '#0f172a'],
              ['#3f1d1d', '#1c1010'],
              ['#1e3a2f', '#0f2018'],
              ['#3a2a16', '#1f1408'],
              ['#312e81', '#1e1b4b'],
              ['#365314', '#1a2e05'],
              ['#3b1f2b', '#1f0f17'],
            ];
            const pickPalette = (book) => {
              const seed = (book.id_ressource || 0) + (book.titre ? book.titre.length : 0);
              return COVER_PALETTES[seed % COVER_PALETTES.length];
            };

            return (
              <section className="cat-page">
                <header className="cat-hero">
                  <div className="cat-hero-copy">
                    <h1>{t('teacher.catalog.title')}</h1>
                    <p>{t('teacher.catalog.intro')}</p>
                  </div>
                  <div className="cat-hero-illustration" aria-hidden="true">
                    <span className="cat-illus-shelf">📚</span>
                    <span className="cat-illus-globe">🌐</span>
                    <span className="cat-illus-book1">📕</span>
                    <span className="cat-illus-book2">📗</span>
                    <span className="cat-illus-book3">📘</span>
                    <span className="cat-illus-spark1">✦</span>
                    <span className="cat-illus-spark2">✧</span>
                    <span className="cat-illus-spark3">✦</span>
                  </div>
                </header>

                <div className="cat-toolbar">
                  <div className="cat-search">
                    <span aria-hidden="true">🔍</span>
                    <input
                      type="search"
                      value={bookSearch}
                      onChange={(e) => setBookSearch(e.target.value)}
                      placeholder={t('teacher.ext.catalog.searchPlaceholder')}
                    />
                  </div>
                  <div className="cat-select">
                    <span className="cat-select-icon" aria-hidden="true">🏷️</span>
                    <select value={bookCategory} onChange={(e) => setBookCategory(e.target.value)}>
                      <option value="">{t('teacher.ext.catalog.allCategories')}</option>
                      {categories.map((c) => (
                        <option key={c.id_categorie} value={c.id_categorie}>{c.libelle}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cat-select">
                    <span className="cat-select-icon" aria-hidden="true">📅</span>
                    <select value={bookAvailability} onChange={(e) => setBookAvailability(e.target.value)}>
                      <option value="">{t('teacher.ext.catalog.availability')}</option>
                      <option value="true">{t('teacher.ext.catalog.available')}</option>
                      <option value="false">{t('teacher.ext.catalog.unavailable')}</option>
                    </select>
                  </div>
                  <div className="cat-select">
                    <span className="cat-select-icon" aria-hidden="true">👤</span>
                    <select
                      value={bookAuthor}
                      onChange={(e) => setBookAuthor(e.target.value)}
                      disabled={bookAuthors.length === 0}
                    >
                      <option value="">{t('teacher.ext.catalog.allAuthors')}</option>
                      {bookAuthors.map((author) => (
                        <option key={author} value={author}>{author}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cat-select cat-select-sort">
                    <span className="cat-select-icon" aria-hidden="true">↕</span>
                    <div className="cat-select-stack">
                      <em>{t('teacher.ext.catalog.sortBy')}</em>
                      <select value={bookSort} onChange={(e) => setBookSort(e.target.value)}>
                        <option value="titre-asc">{t('teacher.ext.catalog.titleAZ')}</option>
                        <option value="titre-desc">{t('teacher.ext.catalog.titleZA')}</option>
                        <option value="auteur-asc">{t('teacher.ext.catalog.authorAZ')}</option>
                        <option value="stock-desc">{t('teacher.ext.catalog.mostAvailable')}</option>
                        <option value="recent">{t('teacher.ext.catalog.mostRecent')}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {booksError && <div className="cat-banner cat-banner-error">{booksError}</div>}

                {booksLoading ? (
                  <div className="cat-loading">{t('teacher.ext.catalog.loading')}</div>
                ) : books.length === 0 ? (
                  <div className="cat-empty">
                    <div className="cat-empty-icon" aria-hidden="true">📚</div>
                    <div className="cat-empty-title">{t('teacher.ext.catalog.noBooks')}</div>
                  </div>
                ) : visibleBooks.length === 0 ? (
                  <div className="cat-empty">
                    <div className="cat-empty-icon" aria-hidden="true">🔎</div>
                    <div className="cat-empty-title">{t('teacher.ext.catalog.noResults')}</div>
                    <button type="button" className="cat-empty-btn" onClick={resetCatalogFilters}>
                      {t('teacher.ext.catalog.resetFilters')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="cat-grid">
                      {pagedBooks.map((book) => {
                        const dispo = Number(book.stock_disponible || 0);
                        const total = Number(book.stock_total || 0);
                        const isAvailable = dispo > 0;
                        const [c1, c2] = pickPalette(book);
                        const coverShortTitle = (book.titre || '').toUpperCase().slice(0, 60);
                        return (
                          <article key={book.id_ressource} className="cat-card">
                            <div className="cat-card-cover">
                              {book.image_couverture ? (
                                <img
                                  src={book.image_couverture}
                                  alt={book.titre}
                                  loading="lazy"
                                />
                              ) : (
                                <div
                                  className="cat-cover-placeholder"
                                  style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)` }}
                                  aria-hidden="true"
                                >
                                  <span className="cat-cover-spine" />
                                  <span className="cat-cover-title">{coverShortTitle}</span>
                                  <span className="cat-cover-mark">✒</span>
                                </div>
                              )}
                            </div>
                            <div className="cat-card-body">
                              <div className="cat-card-pills">
                                <span className={`cat-pill ${isAvailable ? 'cat-pill-ok' : 'cat-pill-ko'}`}>
                                  {isAvailable ? t('teacher.ext.catalog.available') : t('teacher.ext.catalog.unavailable')}
                                </span>
                                {book.categorie && (
                                  <span className="cat-pill cat-pill-cat">{book.categorie}</span>
                                )}
                              </div>
                              <h3 className="cat-card-title" title={book.titre}>{book.titre}</h3>
                              <p className="cat-card-author">{book.auteur || t('teacher.ext.catalog.authorNotSet')}</p>
                              <div className="cat-card-meta">
                                <div className="cat-meta-item">
                                  <em>ISBN</em>
                                  <strong title={book.isbn || ''}>
                                    {book.isbn || t('teacher.ext.catalog.notAvailableValue')}
                                  </strong>
                                </div>
                                <div className="cat-meta-item">
                                  <em>{t('teacher.ext.catalog.total')}</em>
                                  <strong>{Number.isFinite(total) ? total : 0}</strong>
                                </div>
                                <div className="cat-meta-item">
                                  <em>{t('teacher.ext.catalog.availableCopies')}</em>
                                  <strong>{Number.isFinite(dispo) ? dispo : 0}</strong>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="cat-details-btn"
                                onClick={() => handleBookDetails(book)}
                              >
                                {t('teacher.ext.catalog.viewDetails')} <span aria-hidden="true">→</span>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <footer className="cat-pagination">
                      <div className="cat-pagination-info">
                        {t('teacher.ext.catalog.showing')} {bookRangeStart} {t('teacher.ext.catalog.to')} {bookRangeEnd} {t('teacher.ext.catalog.of')} {visibleBooks.length} {t('teacher.ext.catalog.books')}
                      </div>
                      {bookPageCount > 1 && (
                        <div className="cat-pagination-controls">
                          <button
                            type="button"
                            onClick={() => setBookPage((p) => Math.max(1, p - 1))}
                            disabled={safeBookPage <= 1}
                          >
                            ‹ {t('teacher.ext.catalog.previous')}
                          </button>
                          <span>{t('teacher.ext.catalog.page')} {safeBookPage} / {bookPageCount}</span>
                          <button
                            type="button"
                            onClick={() => setBookPage((p) => Math.min(bookPageCount, p + 1))}
                            disabled={safeBookPage >= bookPageCount}
                          >
                            {t('teacher.ext.catalog.next')} ›
                          </button>
                        </div>
                      )}
                    </footer>
                  </>
                )}

                <BookDetailsModal
                  book={selectedBook}
                  error={bookDetailError}
                  onClose={() => {
                    setSelectedBook(null);
                    setBookDetailError('');
                  }}
                />
              </section>
            );
          })()}

          {activeItem === 'ged' && (
            <>
              <div className="teacher-courses-header">
                <div>
                  <div className="page-header-title">{t('teacher.digital.title')}</div>
                  <div className="page-header-sub">{t('teacher.digital.intro')}</div>
                </div>
              </div>

              <div className="teacher-course-toolbar teacher-digital-toolbar">
                <div className="teacher-course-search">
                  <span>🔎</span>
                  <input
                    type="search"
                    value={digitalSearch}
                    onChange={event => setDigitalSearch(event.target.value)}
                    placeholder={t('teacher.digital.search')}
                  />
                </div>
                <div className="teacher-course-filters" aria-label={t('teacher.digital.search')}>
                  {DIGITAL_FILTERS.map(filter => (
                    <button
                      key={filter.key}
                      type="button"
                      className={digitalFilter === filter.key ? 'active' : ''}
                      onClick={() => setDigitalFilter(filter.key)}
                    >
                      {filter.i18nKey ? t(filter.i18nKey) : filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {digitalError && <div className="teacher-course-message">{digitalError}</div>}
              {digitalActionError && !selectedDigitalDocument && <div className="teacher-course-message">{digitalActionError}</div>}

              {digitalLoading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : filteredDigitalDocuments.length === 0 ? (
                <div className="empty-state teacher-course-empty">
                  <div className="empty-state-icon">📄</div>
                  <div className="empty-state-text">{t('teacher.ext.digital.noDocuments')}</div>
                </div>
              ) : (
                <div className="teacher-digital-grid">
                  {pagedDigitalDocuments.map(document => {
                    const tone = DOCUMENT_TYPE_TONES[document.pedagogicalType.key] || DOCUMENT_TYPE_TONES.autre;
                    return (
                      <article key={document.id_ressource} className="teacher-digital-card bn-card">
                        <div className="teacher-digital-top bn-card-top">
                          <span className={`teacher-type-pill tone-${tone}`}>{document.pedagogicalType.i18nKey ? t(document.pedagogicalType.i18nKey) : document.pedagogicalType.label}</span>
                          <span className="badge badge-gold">{document.format || t('teacher.ext.digital.fileFallback')}</span>
                        </div>
                        <h3 className="bn-card-title" title={document.titre}>{document.titre}</h3>
                        <p className="bn-card-desc">{document.description || t('teacher.ext.common.noDescription')}</p>
                        <ul className="bn-card-meta">
                          <li title={getDocumentAuthor(document)}>
                            <span aria-hidden="true">👤</span>
                            <em>{getDocumentAuthor(document)}</em>
                          </li>
                          {document.categorie && (
                            <li title={document.categorie}>
                              <span aria-hidden="true">🏷️</span>
                              <em>{document.categorie}</em>
                            </li>
                          )}
                          <li>
                            <span aria-hidden="true">📅</span>
                            <em>{formatDate(document.date_publication || document.date_creation)}</em>
                          </li>
                        </ul>
                        <div className="bn-card-stats">
                          <div>
                            <span aria-hidden="true">📦</span>
                            <strong>{formatFileSize(document.taille_ko)}</strong>
                            <em>{t('teacher.ext.digital.sizeLabel')}</em>
                          </div>
                          <div>
                            <span aria-hidden="true">👁️</span>
                            <strong>{document.nb_consultations || 0}</strong>
                            <em>{t('teacher.ext.digital.viewsShort')}</em>
                          </div>
                        </div>
                        <div className="bn-card-actions">
                          <button
                            type="button"
                            className="bn-action bn-action-ghost"
                            onClick={() => handleDigitalDetails(document)}
                          >
                            {t('teacher.ext.digital.viewDetails')}
                          </button>
                          <button
                            type="button"
                            className="bn-action bn-action-ghost"
                            onClick={() => openDocumentBlob(document)}
                            disabled={digitalActionLoading === 'open'}
                          >
                            {digitalActionLoading === 'open' ? t('teacher.ext.digital.opening') : t('teacher.ext.digital.openOrRead')}
                          </button>
                          {document.est_telechargeable ? (
                            <button
                              type="button"
                              className="bn-action bn-action-primary"
                              onClick={() => downloadDocumentBlob(document)}
                              disabled={digitalActionLoading === 'download'}
                            >
                              <span aria-hidden="true">⬇</span>
                              {digitalActionLoading === 'download' ? t('teacher.ext.digital.downloading') : t('teacher.ext.digital.download')}
                            </button>
                          ) : (
                            <span className="bn-action bn-action-disabled">{t('teacher.ext.digital.notDownloadable')}</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {filteredDigitalDocuments.length > 0 && (
                <footer className="bn-pagination">
                  <div className="bn-pagination-info">
                    {t('teacher.ext.digital.showing')} {digitalRangeStart} {t('teacher.ext.digital.to')} {digitalRangeEnd} {t('teacher.ext.digital.of')} {filteredDigitalDocuments.length} {t('teacher.ext.digital.documents')}
                  </div>
                  {digitalPageCount > 1 && (
                    <div className="bn-pagination-controls">
                      <button
                        type="button"
                        onClick={() => setDigitalPage((p) => Math.max(1, p - 1))}
                        disabled={safeDigitalPage <= 1}
                      >
                        ‹ {t('teacher.ext.digital.previous')}
                      </button>
                      <span>{t('teacher.ext.digital.page')} {safeDigitalPage} / {digitalPageCount}</span>
                      <button
                        type="button"
                        onClick={() => setDigitalPage((p) => Math.min(digitalPageCount, p + 1))}
                        disabled={safeDigitalPage >= digitalPageCount}
                      >
                        {t('teacher.ext.digital.next')} ›
                      </button>
                    </div>
                  )}
                </footer>
              )}

              <DigitalDocumentDetailsModal
                document={selectedDigitalDocument}
                actionLoading={digitalActionLoading}
                actionError={digitalActionError}
                onClose={() => {
                  setSelectedDigitalDocument(null);
                  setDigitalActionError('');
                }}
                onOpen={openDocumentBlob}
                onDownload={downloadDocumentBlob}
              />
            </>
          )}

          {activeItem === 'stats' && (
            <section className="ts-page">
              {/* HEADER */}
              <header className="ts-header">
                <div className="ts-header-copy">
                  <h1>{t('teacher.stats.title')}</h1>
                  <p>{t('teacher.stats.intro')}</p>
                </div>
                <div className="ts-header-tools">
                  <div className="ts-period">
                    <span aria-hidden="true">📅</span>
                    <select
                      value={statsPeriod}
                      onChange={(e) => setStatsPeriod(e.target.value)}
                      aria-label={t('teacher.ext.stats.periodAria')}
                    >
                      {STATS_PERIOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="ts-export-btn" onClick={handleExportStats}>
                    <span aria-hidden="true">⬇</span> {t('teacher.ext.stats.exportBtn')}
                  </button>
                </div>
              </header>

              {statsExportMsg && <div className="ts-toast">{statsExportMsg}</div>}

              {/* KPI ROW */}
              <section className="ts-kpis" aria-label={t('teacher.ext.stats.kpiAria')}>
                {[
                  { label: t('teacher.ext.stats.published'), value: documentsPublies, icon: '📄', tone: 'purple', monthDelta: documentsCeMois },
                  { label: t('teacher.ext.stats.addedCourses'), value: coursAjoutes, icon: '📖', tone: 'blue', monthDelta: coursCeMois },
                  { label: t('teacher.ext.stats.tpTdAdded'), value: tpTdAjoutes, icon: '🧪', tone: 'gold', monthDelta: tpTdCeMois },
                  { label: t('teacher.ext.stats.examsAdded'), value: examensAjoutes, icon: '📝', tone: 'green', monthDelta: examensCeMois },
                  { label: t('teacher.ext.stats.totalViews'), value: totalVues, icon: '👁️', tone: 'gold' },
                  { label: t('teacher.ext.stats.totalReaders'), value: totalReaders > 0 ? totalReaders : (documentsPublies > 0 ? 0 : null), icon: '👥', tone: 'blue' },
                ].map((card) => {
                  const isUnavailable = card.value === null || card.value === undefined;
                  return (
                    <article key={card.label} className={`ts-kpi-card ts-tone-${card.tone}`}>
                      <div className="ts-kpi-icon" aria-hidden="true">{card.icon}</div>
                      <div className="ts-kpi-body">
                        <span className="ts-kpi-label">{card.label}</span>
                        <strong className={`ts-kpi-value${isUnavailable ? ' ts-kpi-unavailable' : ''}`}>
                          {isUnavailable
                            ? t('teacher.ext.stats.notAvailable')
                            : new Intl.NumberFormat('fr-FR').format(card.value)}
                        </strong>
                        <em className="ts-kpi-hint">
                          {card.monthDelta !== undefined
                            ? (card.monthDelta > 0
                                ? `+${card.monthDelta} ${t('teacher.ext.stats.thisMonth')}`
                                : t('teacher.ext.stats.noNewThisMonth'))
                            : t('teacher.ext.stats.cumulative')}
                        </em>
                      </div>
                    </article>
                  );
                })}
              </section>

              {/* MAIN GRID: bar chart + donut */}
              <section className="ts-main-grid">
                <article className="ts-panel">
                  <header className="ts-panel-header">
                    <h2>{t('teacher.ext.stats.viewsByResource')}</h2>
                    <span className="ts-panel-hint">{statsPeriodLabel}</span>
                  </header>
                  {consultationsPerResource.length === 0 ? (
                    <div className="ts-empty">
                      {t('teacher.ext.stats.noConsultations')}
                    </div>
                  ) : (
                    <div className="ts-chart-wrap">
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart
                          data={consultationsPerResource}
                          margin={{ top: 20, right: 16, left: 0, bottom: 16 }}
                        >
                          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis
                            dataKey="shortTitle"
                            tick={{ fill: '#94a0bc', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                            interval={0}
                          />
                          <YAxis
                            tick={{ fill: '#94a0bc', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            cursor={{ fill: 'rgba(234,179,8,0.08)' }}
                            contentStyle={{
                              background: '#0f172a',
                              border: '1px solid rgba(234,179,8,0.35)',
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            labelStyle={{ color: '#fde68a' }}
                            itemStyle={{ color: '#e4e8f1' }}
                            formatter={(value) => [value, t('teacher.ext.stats.tooltipViews')]}
                          />
                          <Bar dataKey="consultations" fill="#eab308" radius={[8, 8, 0, 0]} maxBarSize={64}>
                            <LabelList
                              dataKey="consultations"
                              position="top"
                              fill="#fde68a"
                              fontSize={12}
                              fontWeight={700}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </article>

                <article className="ts-panel">
                  <header className="ts-panel-header">
                    <h2>{t('teacher.ext.stats.distributionByType')}</h2>
                  </header>
                  {documentsPublies === 0 ? (
                    <div className="ts-empty">
                      {t('teacher.ext.stats.publishFirstDoc')}
                    </div>
                  ) : (
                    <div className="ts-donut-row">
                      <div className="ts-donut-chart">
                        <ResponsiveContainer width="100%" height={210}>
                          <PieChart>
                            <Pie
                              data={typeDistributionForChart}
                              dataKey="value"
                              nameKey="label"
                              innerRadius={58}
                              outerRadius={90}
                              stroke="#0f172a"
                              strokeWidth={3}
                              paddingAngle={typeDistributionForChart.length > 1 ? 2 : 0}
                            >
                              {typeDistributionForChart.map((entry) => (
                                <Cell key={entry.key} fill={TYPE_PIE_COLORS[entry.tone] || '#eab308'} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: '#0f172a',
                                border: '1px solid rgba(234,179,8,0.35)',
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                              labelStyle={{ color: '#fde68a' }}
                              itemStyle={{ color: '#e4e8f1' }}
                              formatter={(value, name) => [value, name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="ts-donut-legend">
                        {typeDistribution.map((item) => (
                          <li key={item.key}>
                            <span
                              className="ts-legend-dot"
                              style={{ background: TYPE_PIE_COLORS[item.tone] || '#eab308' }}
                              aria-hidden="true"
                            />
                            <span className="ts-legend-label">{item.label}</span>
                            <div className="ts-legend-bar">
                              <div
                                style={{
                                  width: `${item.pct}%`,
                                  background: TYPE_PIE_COLORS[item.tone] || '#eab308',
                                }}
                              />
                            </div>
                            <span className="ts-legend-value">
                              {item.value} ({item.pct.toFixed(1).replace('.', ',')}%)
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              </section>

              {/* SECONDARY GRID: engagement + top + featured */}
              <section className="ts-secondary-grid">
                <article className="ts-panel">
                  <header className="ts-panel-header">
                    <h2>{t('teacher.ext.stats.engagementRate')}</h2>
                    <span className="ts-panel-hint">{statsPeriodLabel}</span>
                  </header>
                  {tauxEngagement === null ? (
                    <div className="ts-empty">
                      {t('teacher.ext.stats.engagementUnavailable')}
                    </div>
                  ) : (
                    <div className="ts-engagement">
                      <div className="ts-engagement-big">
                        <strong>{tauxEngagement}%</strong>
                        <em>{t('teacher.ext.stats.engagementBigSuffix')}</em>
                      </div>
                      <div className="ts-engagement-bar">
                        <div
                          className="ts-engagement-fill"
                          style={{ width: `${tauxEngagement}%` }}
                        />
                      </div>
                      <div className="ts-engagement-meta">
                        <span>{documentsConsultes} {t('teacher.ext.stats.viewed')}</span>
                        <span>{documentsPublies} {t('teacher.ext.stats.publishedShort')}</span>
                      </div>
                    </div>
                  )}
                </article>

                <article className="ts-panel">
                  <header className="ts-panel-header">
                    <h2>{t('teacher.ext.stats.mostViewedResources')}</h2>
                  </header>
                  {topResourcesList.length === 0 ? (
                    <div className="ts-empty">
                      {t('teacher.ext.stats.noResourceViewed')}
                    </div>
                  ) : (
                    <ul className="ts-top-list">
                      {topResourcesList.map((doc, index) => (
                        <li key={doc.id_ressource} className="ts-top-row">
                          <span className="ts-top-rank">{index + 1}</span>
                          <span className="ts-top-icon" aria-hidden="true">
                            {FORMAT_ICON[doc.format] || FORMAT_ICON.default}
                          </span>
                          <div className="ts-top-info">
                            <strong title={doc.titre}>{doc.titre}</strong>
                            <em>{doc.pedagogicalType.i18nKey ? t(doc.pedagogicalType.i18nKey) : doc.pedagogicalType.label}{doc.format ? ` · ${doc.format}` : ''}</em>
                          </div>
                          <span className="ts-top-count">{doc.consultations}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="ts-link-row"
                    onClick={() => setActiveItem('mes-cours')}
                  >
                    {t('teacher.ext.stats.viewAllResources')} <span aria-hidden="true">›</span>
                  </button>
                </article>

                <article className="ts-panel ts-featured">
                  <header className="ts-panel-header">
                    <span className="ts-trophy" aria-hidden="true">🏆</span>
                    <h2>{t('teacher.ext.stats.mostViewedResource')}</h2>
                  </header>
                  {!mostConsultedResource ? (
                    <div className="ts-empty">
                      {t('teacher.ext.stats.noConsultations')}
                    </div>
                  ) : (
                    <>
                      <div className="ts-featured-card">
                        <div className="ts-featured-icon" aria-hidden="true">
                          {FORMAT_ICON[mostConsultedResource.format] || FORMAT_ICON.default}
                        </div>
                        <div className="ts-featured-meta">
                          <strong title={mostConsultedResource.titre}>{mostConsultedResource.titre}</strong>
                          <em>
                            {t('teacher.ext.stats.typeLabel')} : {mostConsultedResource.pedagogicalType.i18nKey ? t(mostConsultedResource.pedagogicalType.i18nKey) : mostConsultedResource.pedagogicalType.label}
                            {mostConsultedResource.format
                              ? `   ·   ${t('teacher.ext.stats.formatLabel')} : ${mostConsultedResource.format}`
                              : ''}
                          </em>
                        </div>
                      </div>
                      <div className="ts-featured-count">
                        <strong>{mostConsultedResource.consultations}</strong>
                        <em>{t('teacher.ext.stats.viewsCount')}</em>
                      </div>
                      <button
                        type="button"
                        className="ts-featured-btn"
                        onClick={handleViewTopResource}
                      >
                        {t('teacher.ext.stats.viewResource')} <span aria-hidden="true">↗</span>
                      </button>
                    </>
                  )}
                </article>
              </section>

              {/* INFO FOOTER */}
              <footer className="ts-info-footer">
                <span aria-hidden="true">ℹ</span>
                {t('teacher.ext.stats.infoFooter')}
              </footer>
            </section>
          )}

          {activeItem === 'centre-aide' && (
            <section className="teacher-help-page">
              <header className="teacher-help-header">
                <div className="teacher-help-header-text">
                  <h1>{t('teacher.help.title')}</h1>
                  <p>{t('teacher.help.intro')}</p>
                </div>
                <div className="teacher-help-header-illustration" aria-hidden="true">
                  <svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="teacherHelpHeadset" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0" stopColor="#a78bfa" stopOpacity="0.85" />
                        <stop offset="1" stopColor="#7c3aed" stopOpacity="0.75" />
                      </linearGradient>
                      <linearGradient id="teacherHelpBubble" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0" stopColor="#c084fc" stopOpacity="0.85" />
                        <stop offset="1" stopColor="#7c3aed" stopOpacity="0.75" />
                      </linearGradient>
                    </defs>
                    <g fill="none" stroke="url(#teacherHelpHeadset)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M40 90 Q40 40 100 40 Q160 40 160 90" />
                      <rect x="26" y="86" width="22" height="40" rx="11" fill="url(#teacherHelpHeadset)" stroke="none" />
                      <rect x="152" y="86" width="22" height="40" rx="11" fill="url(#teacherHelpHeadset)" stroke="none" />
                      <path d="M48 126 q14 14 36 14" />
                    </g>
                    <g>
                      <rect x="92" y="86" width="78" height="50" rx="14" fill="url(#teacherHelpBubble)" />
                      <circle cx="116" cy="111" r="4" fill="#0d1b4b" />
                      <circle cx="132" cy="111" r="4" fill="#0d1b4b" />
                      <circle cx="148" cy="111" r="4" fill="#0d1b4b" />
                      <path d="M104 132 L98 144 L114 134 Z" fill="url(#teacherHelpBubble)" />
                    </g>
                  </svg>
                </div>
              </header>

              <div className="teacher-help-grid">
                <article className="teacher-help-card teacher-help-form-card">
                  <header className="teacher-help-card-header">
                    <span className="teacher-help-card-icon" aria-hidden="true">📤</span>
                    <h2>{t('teacher.ext.help.sendRequestHeader')}</h2>
                  </header>
                  <form className="teacher-help-form" onSubmit={handleSupportSubmit} noValidate>
                    <label className="teacher-help-field">
                      <span>
                        {t('teacher.ext.help.subjectLabel')} <em className="teacher-help-required">*</em>
                      </span>
                      <input
                        type="text"
                        value={supportForm.sujet}
                        onChange={(e) => setSupportForm(f => ({ ...f, sujet: e.target.value }))}
                        placeholder={t('teacher.ext.help.subjectPlaceholder')}
                        maxLength={255}
                        disabled={supportSaving}
                        required
                      />
                    </label>

                    <label className="teacher-help-field">
                      <span>
                        {t('teacher.ext.help.typeLabel')} <em className="teacher-help-required">*</em>
                      </span>
                      <div className="teacher-help-select-wrap">
                        <select
                          value={supportForm.type_probleme}
                          onChange={(e) => setSupportForm(f => ({ ...f, type_probleme: e.target.value }))}
                          disabled={supportSaving}
                          required
                        >
                          <option value="">{t('teacher.ext.help.typePlaceholder')}</option>
                          {TEACHER_SUPPORT_TYPES.map(option => (
                            <option key={option.value} value={option.value}>{t(option.i18nKey)}</option>
                          ))}
                        </select>
                        <span aria-hidden="true" className="teacher-help-select-chevron">▾</span>
                      </div>
                    </label>

                    <label className="teacher-help-field">
                      <span>{t('teacher.ext.help.relatedDocLabel')}</span>
                      <div className="teacher-help-input-wrap">
                        <input
                          type="text"
                          value={supportForm.related_text}
                          onChange={(e) => setSupportForm(f => ({ ...f, related_text: e.target.value }))}
                          placeholder={t('teacher.ext.help.relatedDocPlaceholder')}
                          maxLength={255}
                          disabled={supportSaving}
                          list="teacher-help-doc-suggestions"
                        />
                        <span aria-hidden="true" className="teacher-help-input-icon">📄</span>
                      </div>
                      <datalist id="teacher-help-doc-suggestions">
                        {mesCours.slice(0, 50).map((doc, idx) => (
                          <option
                            key={doc.id_ressource || doc.id_document || `${doc.titre || 'doc'}-${idx}`}
                            value={doc.titre || ''}
                          />
                        ))}
                      </datalist>
                    </label>

                    <label className="teacher-help-field">
                      <span>
                        {t('teacher.ext.help.messageLabel')} <em className="teacher-help-required">*</em>
                      </span>
                      <textarea
                        value={supportForm.message}
                        onChange={(e) => setSupportForm(f => ({ ...f, message: e.target.value.slice(0, TEACHER_SUPPORT_MESSAGE_MAX) }))}
                        placeholder={t('teacher.ext.help.messagePlaceholder')}
                        rows={5}
                        maxLength={TEACHER_SUPPORT_MESSAGE_MAX}
                        disabled={supportSaving}
                        required
                      />
                      <div className="teacher-help-counter">
                        {supportMessageLength} / {TEACHER_SUPPORT_MESSAGE_MAX}
                      </div>
                    </label>

                    {supportError && (
                      <div className="teacher-help-feedback teacher-help-feedback-error">{supportError}</div>
                    )}
                    {supportSuccess && (
                      <div className="teacher-help-feedback teacher-help-feedback-success">{supportSuccess}</div>
                    )}

                    <button
                      type="submit"
                      className="teacher-help-submit"
                      disabled={supportSaving}
                    >
                      <span aria-hidden="true">➤</span>
                      {supportSaving ? t('teacher.ext.help.sending') : t('teacher.ext.help.submitBtn')}
                    </button>
                  </form>
                </article>

                <article className="teacher-help-card teacher-help-tickets-card">
                  <header className="teacher-help-card-header">
                    <span className="teacher-help-card-icon" aria-hidden="true">📨</span>
                    <h2>{t('teacher.help.myTickets')}</h2>
                  </header>
                  <div className="teacher-help-filters" role="tablist">
                    {TEACHER_SUPPORT_FILTERS.map(filter => (
                      <button
                        key={filter.key}
                        type="button"
                        role="tab"
                        aria-selected={supportFilter === filter.key}
                        className={`teacher-help-filter${supportFilter === filter.key ? ' is-active' : ''}`}
                        onClick={() => setSupportFilter(filter.key)}
                      >
                        {filter.i18nKey ? t(filter.i18nKey) : filter.label}
                      </button>
                    ))}
                  </div>

                  {supportLoading ? (
                    <div className="teacher-help-tickets-state">{t('teacher.ext.help.loadingTickets')}</div>
                  ) : supportListError ? (
                    <div className="teacher-help-tickets-state teacher-help-tickets-error">{supportListError}</div>
                  ) : filteredSupportTickets.length === 0 ? (
                    <div className="teacher-help-tickets-state">
                      {supportTickets.length === 0
                        ? t('teacher.ext.help.noTicketsSent')
                        : t('teacher.ext.help.noTicketsFilter')}
                    </div>
                  ) : (
                    <ul className="teacher-help-ticket-list">
                      {filteredSupportTickets.map(ticket => {
                        const meta = TEACHER_SUPPORT_STATUS_META[ticket.statut] || { label: ticket.statut, tone: 'open' };
                        const icon = TEACHER_SUPPORT_TYPE_ICONS[ticket.type_probleme] || '✉️';
                        return (
                          <li key={ticket.id_ticket}>
                            <button
                              type="button"
                              className="teacher-help-ticket"
                              onClick={() => setSupportSelectedTicket(ticket)}
                            >
                              <span className={`teacher-help-ticket-icon tone-${meta.tone}`} aria-hidden="true">
                                {icon}
                              </span>
                              <span className="teacher-help-ticket-body">
                                <strong className="teacher-help-ticket-title">{ticket.sujet}</strong>
                                <span className="teacher-help-ticket-date">
                                  {t('teacher.ext.help.createdOn')} {ticket.date_creation ? formatProfileDate(ticket.date_creation) : '—'}
                                  {ticket.date_creation && (
                                    <> {t('teacher.ext.help.at')} {new Date(ticket.date_creation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>
                                  )}
                                </span>
                              </span>
                              <span className={`teacher-help-status-badge tone-${meta.tone}`}>{meta.i18nKey ? t(meta.i18nKey) : meta.label}</span>
                              <span aria-hidden="true" className="teacher-help-ticket-chevron">›</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="teacher-help-tickets-footer">
                    <span aria-hidden="true">ⓘ</span>
                    <span>
                      {t('teacher.ext.help.cantFindAnswer')}{' '}
                      <button
                        type="button"
                        className="teacher-help-link"
                        onClick={() => {
                          const el = document.querySelector('.teacher-help-form input');
                          if (el && typeof el.focus === 'function') el.focus();
                        }}
                      >
                        {t('teacher.ext.help.createNewRequest')}
                      </button>
                    </span>
                  </div>
                </article>
              </div>

              <article className="teacher-help-card teacher-help-info-card">
                <span className="teacher-help-info-icon" aria-hidden="true">ⓘ</span>
                <div className="teacher-help-info-text">
                  <h2>{t('teacher.help.importantInfo')}</h2>
                  <p>{t('teacher.ext.help.importantInfoText')}</p>
                </div>
                <button
                  type="button"
                  className="teacher-help-guide-btn"
                  onClick={handleSupportGuideClick}
                >
                  <span aria-hidden="true">📘</span>
                  {t('teacher.help.userGuide')}
                </button>
                {supportGuideNotice && (
                  <div className="teacher-help-guide-notice" role="status">{supportGuideNotice}</div>
                )}
              </article>

              {supportSelectedTicket && (
                <div
                  className="teacher-modal-backdrop"
                  role="presentation"
                  onClick={() => setSupportSelectedTicket(null)}
                >
                  <div
                    className="teacher-modal teacher-help-ticket-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="teacher-help-ticket-title"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="teacher-modal-header">
                      <div>
                        <h2 id="teacher-help-ticket-title">{supportSelectedTicket.sujet}</h2>
                        <p className="teacher-modal-subtitle">
                          {t('teacher.ext.help.createdOn')} {supportSelectedTicket.date_creation ? formatProfileDate(supportSelectedTicket.date_creation) : '—'}
                          {supportSelectedTicket.date_creation && (
                            <> {t('teacher.ext.help.at')} {new Date(supportSelectedTicket.date_creation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="teacher-modal-close"
                        onClick={() => setSupportSelectedTicket(null)}
                        aria-label={t('teacher.ext.help.closeBtn')}
                      >×</button>
                    </div>
                    <div className="teacher-help-ticket-modal-body">
                      <div className="teacher-help-ticket-modal-meta">
                        <div>
                          <span>{t('teacher.help.type')}</span>
                          <strong>{(() => {
                            const pt = TEACHER_SUPPORT_TYPES.find(p => p.value === supportSelectedTicket.type_probleme);
                            return pt ? t(pt.i18nKey) : (supportSelectedTicket.type_probleme || '—');
                          })()}</strong>
                        </div>
                        <div>
                          <span>{t('admin.support.status')}</span>
                          <strong>
                            {(() => {
                              const m = TEACHER_SUPPORT_STATUS_META[supportSelectedTicket.statut];
                              return m ? (m.i18nKey ? t(m.i18nKey) : m.label) : supportSelectedTicket.statut;
                            })()}
                          </strong>
                        </div>
                        {supportSelectedTicket.related_text && (
                          <div>
                            <span>{t('teacher.ext.help.relatedDoc')}</span>
                            <strong>{supportSelectedTicket.related_text}</strong>
                          </div>
                        )}
                      </div>

                      {supportSelectedTicket.message && (
                        <section className="teacher-help-ticket-modal-section">
                          <h3>{t('teacher.ext.help.yourMessage')}</h3>
                          <p>{supportSelectedTicket.message}</p>
                        </section>
                      )}

                      <section className="teacher-help-ticket-modal-section">
                        <h3>{t('teacher.ext.help.adminResponse')}</h3>
                        {supportSelectedTicket.reponse_admin ? (
                          <p>{supportSelectedTicket.reponse_admin}</p>
                        ) : (
                          <p className="teacher-help-ticket-modal-empty">
                            {t('teacher.ext.help.awaitingResponse')}
                          </p>
                        )}
                      </section>
                    </div>
                    <div className="teacher-modal-actions">
                      <button
                        type="button"
                        className="teacher-primary-action"
                        onClick={() => setSupportSelectedTicket(null)}
                      >
                        {t('teacher.ext.help.closeBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeItem === 'profil' && (
            <>
              <header className="teacher-profile-header">
                <div className="teacher-profile-header-text">
                  <h1>{t('teacher.profile.title')}</h1>
                  <p>{t('teacher.profile.intro')}</p>
                </div>
                <button
                  type="button"
                  className="teacher-profile-edit-btn"
                  onClick={openProfileEditModal}
                >
                  <span aria-hidden="true" className="teacher-profile-edit-btn-icon">✎</span>
                  {t('teacher.profile.editProfile')}
                </button>
              </header>

              {profileLoading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <div className="teacher-profile-page">
                  <section className="teacher-profile-hero-card">
                    <div className="teacher-profile-hero-main">
                      <div className="teacher-profile-avatar" aria-hidden="true">
                        {getTeacherInitials(profileUser)}
                      </div>
                      <div className="teacher-profile-identity">
                        <h2>{profileFullName || profileNotAvailable}</h2>
                        <p>{profileUser?.email || profileNotAvailable}</p>
                        <span className="teacher-profile-role-badge">
                          {profileRoleLabel}
                        </span>
                        <p className="teacher-profile-subtitle">
                          <span aria-hidden="true" className="teacher-profile-subtitle-icon">👥</span>
                          {t('teacher.ext.profile.subtitle')}
                        </p>
                      </div>
                    </div>
                    <div className="teacher-profile-hero-illustration" aria-hidden="true">
                      <svg viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg">
                        <g fill="none" stroke="rgba(201,168,76,0.55)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M40 70 L110 40 L180 70 L110 100 Z" />
                          <path d="M55 78 L55 110 Q110 140 165 110 L165 78" />
                          <path d="M180 70 L180 100" />
                          <circle cx="180" cy="106" r="4" fill="rgba(201,168,76,0.55)" stroke="none" />
                          <path d="M40 140 L110 125 L180 140" />
                          <path d="M40 140 L40 160 L110 145 L180 160 L180 140" />
                          <path d="M110 125 L110 145" />
                          <path d="M195 35 q8 -6 16 0" opacity="0.6" />
                          <path d="M200 28 q6 -5 12 0" opacity="0.4" />
                        </g>
                      </svg>
                    </div>
                  </section>

                  <div className="teacher-profile-cards">
                    <section className="teacher-profile-card">
                      <header className="teacher-profile-card-header">
                        <span className="teacher-profile-card-icon" aria-hidden="true">👤</span>
                        <h3>{t('teacher.ext.profile.personalInfo')}</h3>
                      </header>
                      <ul className="teacher-profile-rows">
                        {profileInfoRows.map((row, idx) => (
                          <li
                            key={row.label}
                            className={`teacher-profile-row${idx < profileInfoRows.length - 1 ? ' has-divider' : ''}`}
                          >
                            <span className="teacher-profile-row-icon" aria-hidden="true">{row.icon}</span>
                            <span className="teacher-profile-row-label">{row.label}</span>
                            <span className="teacher-profile-row-value">{row.value}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="teacher-profile-card">
                      <header className="teacher-profile-card-header">
                        <span className="teacher-profile-card-icon" aria-hidden="true">🛡️</span>
                        <h3>{t('teacher.ext.profile.accountSecurity')}</h3>
                      </header>
                      <ul className="teacher-profile-rows">
                        {profileSecurityRows.map((row, idx) => (
                          <li
                            key={row.label}
                            className={`teacher-profile-row${idx < profileSecurityRows.length - 1 ? ' has-divider' : ''}`}
                          >
                            <span className="teacher-profile-row-icon" aria-hidden="true">{row.icon}</span>
                            <span className="teacher-profile-row-label">{row.label}</span>
                            <span
                              className={`teacher-profile-row-value${row.mono ? ' mono' : ''}${row.tone ? ` tone-${row.tone}` : ''}`}
                            >
                              {row.tone === 'success' && (
                                <span className="teacher-profile-status-dot tone-success" aria-hidden="true" />
                              )}
                              {row.tone === 'danger' && (
                                <span className="teacher-profile-status-dot tone-danger" aria-hidden="true" />
                              )}
                              {row.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="teacher-profile-password-btn"
                        onClick={() => setPasswordModalOpen(true)}
                      >
                        <span aria-hidden="true">🔒</span>
                        {t('teacher.ext.profile.changePasswordBtn')}
                      </button>
                    </section>

                  </div>
                </div>
              )}

              {passwordModalOpen && (
                <div className="teacher-modal-backdrop" role="presentation" onClick={closePasswordModal}>
                  <div
                    className="teacher-modal teacher-profile-password-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="teacher-password-title"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="teacher-modal-header">
                      <div>
                        <h2 id="teacher-password-title">{t('teacher.ext.profile.passwordModalTitle')}</h2>
                        <p className="teacher-modal-subtitle">
                          {t('teacher.ext.profile.passwordModalSubtitle')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="teacher-modal-close"
                        onClick={closePasswordModal}
                        aria-label={t('teacher.ext.profile.closeBtn')}
                      >×</button>
                    </div>
                    <form onSubmit={handlePasswordSubmit} className="teacher-profile-password-form">
                      <label className="teacher-profile-password-field">
                        <span>{t('teacher.ext.profile.currentPassword')}</span>
                        <div className="teacher-profile-password-input">
                          <input
                            type={passwordReveal.current ? 'text' : 'password'}
                            autoComplete="current-password"
                            value={passwordForm.current}
                            onChange={(e) => setPasswordForm(f => ({ ...f, current: e.target.value }))}
                            disabled={passwordSaving}
                            required
                          />
                          <button
                            type="button"
                            className="teacher-profile-password-eye"
                            onClick={() => setPasswordReveal(r => ({ ...r, current: !r.current }))}
                            aria-label={passwordReveal.current ? t('teacher.ext.profile.hide') : t('teacher.ext.profile.show')}
                            tabIndex={-1}
                          >
                            {passwordReveal.current ? '🙈' : '👁'}
                          </button>
                        </div>
                      </label>
                      <label className="teacher-profile-password-field">
                        <span>{t('teacher.ext.profile.newPassword')}</span>
                        <div className="teacher-profile-password-input">
                          <input
                            type={passwordReveal.next ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={passwordForm.next}
                            onChange={(e) => setPasswordForm(f => ({ ...f, next: e.target.value }))}
                            disabled={passwordSaving}
                            minLength={6}
                            required
                          />
                          <button
                            type="button"
                            className="teacher-profile-password-eye"
                            onClick={() => setPasswordReveal(r => ({ ...r, next: !r.next }))}
                            aria-label={passwordReveal.next ? t('teacher.ext.profile.hide') : t('teacher.ext.profile.show')}
                            tabIndex={-1}
                          >
                            {passwordReveal.next ? '🙈' : '👁'}
                          </button>
                        </div>
                      </label>
                      <label className="teacher-profile-password-field">
                        <span>{t('teacher.ext.profile.confirmNewPassword')}</span>
                        <div className="teacher-profile-password-input">
                          <input
                            type={passwordReveal.confirm ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={passwordForm.confirm}
                            onChange={(e) => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                            disabled={passwordSaving}
                            minLength={6}
                            required
                          />
                          <button
                            type="button"
                            className="teacher-profile-password-eye"
                            onClick={() => setPasswordReveal(r => ({ ...r, confirm: !r.confirm }))}
                            aria-label={passwordReveal.confirm ? t('teacher.ext.profile.hide') : t('teacher.ext.profile.show')}
                            tabIndex={-1}
                          >
                            {passwordReveal.confirm ? '🙈' : '👁'}
                          </button>
                        </div>
                      </label>
                      {passwordError && <div className="teacher-profile-password-error">{passwordError}</div>}
                      {passwordSuccess && <div className="teacher-profile-password-success">{passwordSuccess}</div>}
                      <div className="teacher-modal-actions">
                        <button
                          type="button"
                          className="teacher-secondary-action"
                          onClick={closePasswordModal}
                          disabled={passwordSaving}
                        >
                          {t('teacher.ext.profile.cancelBtn')}
                        </button>
                        <button
                          type="submit"
                          className="teacher-primary-action"
                          disabled={passwordSaving}
                        >
                          {passwordSaving ? t('teacher.ext.profile.saving') : t('teacher.ext.profile.saveBtn')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {profileEditModalOpen && (
                <div className="teacher-modal-backdrop" role="presentation" onClick={closeProfileEditModal}>
                  <div
                    className="teacher-modal teacher-profile-edit-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="teacher-profile-edit-title"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="teacher-modal-header">
                      <div>
                        <h2 id="teacher-profile-edit-title">{t('teacher.ext.profile.editProfileModalTitle')}</h2>
                        <p className="teacher-modal-subtitle">
                          {t('teacher.ext.profile.editProfileModalSubtitle')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="teacher-modal-close"
                        onClick={closeProfileEditModal}
                        aria-label={t('teacher.ext.profile.closeBtn')}
                      >×</button>
                    </div>
                    <form onSubmit={handleProfileEditSubmit} className="teacher-profile-edit-form">
                      <div className="teacher-profile-edit-grid">
                        <label className="teacher-profile-password-field">
                          <span>{t('teacher.ext.profile.firstName')}</span>
                          <input
                            type="text"
                            value={profileEditForm.prenom}
                            onChange={(e) => setProfileEditForm(f => ({ ...f, prenom: e.target.value }))}
                            disabled={profileEditSaving}
                            maxLength={100}
                          />
                        </label>
                        <label className="teacher-profile-password-field">
                          <span>{t('teacher.ext.profile.lastName')}</span>
                          <input
                            type="text"
                            value={profileEditForm.nom}
                            onChange={(e) => setProfileEditForm(f => ({ ...f, nom: e.target.value }))}
                            disabled={profileEditSaving}
                            maxLength={100}
                            required
                          />
                        </label>
                      </div>
                      <label className="teacher-profile-password-field">
                        <span>{t('teacher.ext.profile.email')}</span>
                        <input
                          type="email"
                          value={profileEditForm.email}
                          onChange={(e) => setProfileEditForm(f => ({ ...f, email: e.target.value }))}
                          disabled={profileEditSaving}
                          maxLength={150}
                          required
                        />
                      </label>
                      <label className="teacher-profile-password-field">
                        <span>{t('teacher.ext.profile.subjectSpecialty')}</span>
                        <input
                          type="text"
                          value={profileSpecialty || ''}
                          placeholder={profileNotAvailable}
                          readOnly
                          disabled
                        />
                        <small className="teacher-profile-edit-hint">
                          {t('teacher.ext.profile.fieldUnavailable')}
                        </small>
                      </label>
                      <label className="teacher-profile-password-field">
                        <span>{t('teacher.profile.department')}</span>
                        <input
                          type="text"
                          value={profileDepartment || ''}
                          placeholder={profileNotAvailable}
                          readOnly
                          disabled
                        />
                        <small className="teacher-profile-edit-hint">
                          {t('teacher.ext.profile.fieldUnavailable')}
                        </small>
                      </label>
                      {profileEditError && (
                        <div className="teacher-profile-password-error">{profileEditError}</div>
                      )}
                      {profileEditSuccess && (
                        <div className="teacher-profile-password-success">{profileEditSuccess}</div>
                      )}
                      <div className="teacher-modal-actions">
                        <button
                          type="button"
                          className="teacher-secondary-action"
                          onClick={closeProfileEditModal}
                          disabled={profileEditSaving}
                        >
                          {t('teacher.ext.profile.cancelBtn')}
                        </button>
                        <button
                          type="submit"
                          className="teacher-primary-action"
                          disabled={profileEditSaving}
                        >
                          {profileEditSaving ? t('teacher.ext.profile.saving') : t('teacher.ext.profile.saveBtn')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
