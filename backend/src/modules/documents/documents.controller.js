const { query, getClient } = require('../../config/db');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { uploadBuffer } = require('../../services/storage.service');
const { notifyAdmins, createNotification } = require('../notifications/notifications.service');

// Un fichier stocké à distance (Cloudinary) commence par http(s).
// Les anciens fichiers locaux commencent par /uploads/ (compat).
const isRemoteUrl = (url) => /^https?:\/\//i.test(String(url || ''));

// Récupère un fichier distant et le renvoie au client en respectant
// les requêtes Range (lecteur PDF, vidéos). Préserve le contrôle d'accès :
// le client ne voit jamais l'URL Cloudinary, tout passe par l'API.
const proxyRemoteFile = async (req, res, fileUrl, { contentType, filename, disposition }) => {
  const range = req.headers.range;
  const upstream = await fetch(fileUrl, {
    headers: range ? { Range: range } : {},
  });

  if (!upstream.ok && upstream.status !== 206) {
    return res.status(502).json({ success: false, message: 'Fichier indisponible sur le stockage distant.' });
  }

  const headers = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`,
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers['Content-Range'] = contentRange;

  res.writeHead(upstream.status === 206 ? 206 : 200, headers);
  Readable.fromWeb(upstream.body).pipe(res);
};

const DOCUMENT_MANAGER_ROLES = ['BIBLIOTHECAIRE', 'ADMIN'];
const DOCUMENT_PUBLIC_READER_ROLES = ['ETUDIANT', 'ENSEIGNANT', ...DOCUMENT_MANAGER_ROLES];
const UPLOAD_URL_PREFIX = '/uploads/';

const getUploadRoot = () => path.resolve(process.env.UPLOAD_PATH || './uploads');

const isPathInside = (targetPath, rootPath) => {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const buildStoredUploadUrl = (uploadedPath) => {
  const uploadRoot = getUploadRoot();
  const resolvedPath = path.resolve(uploadedPath);

  if (!isPathInside(resolvedPath, uploadRoot)) {
    throw new Error('Uploaded file is outside the configured upload directory.');
  }

  const relativeFilePath = path.relative(uploadRoot, resolvedPath).split(path.sep).join('/');
  return `${UPLOAD_URL_PREFIX}${relativeFilePath}`;
};

const resolveStoredUploadPath = (storedUrl) => {
  const normalizedUrl = String(storedUrl || '').replace(/\\/g, '/');
  if (!normalizedUrl.startsWith(UPLOAD_URL_PREFIX)) return null;

  const relativeFilePath = normalizedUrl.slice(UPLOAD_URL_PREFIX.length);
  if (!relativeFilePath || relativeFilePath.includes('\0')) return null;

  const uploadRoot = getUploadRoot();
  const resolvedPath = path.resolve(uploadRoot, relativeFilePath);
  return isPathInside(resolvedPath, uploadRoot) ? resolvedPath : null;
};

const getDocumentOwnership = async (client, id) => {
  const result = await client.query(
    `SELECT dn.id_uploade_par
     FROM documents_numeriques dn
     INNER JOIN ressources r ON r.id_ressource = dn.id_ressource
     WHERE dn.id_ressource = $1
       AND r.type_ressource = 'NUMERIQUE'`,
    [id]
  );

  return result.rows[0] || null;
};

const canManageDocument = (user, document) => {
  if (!user || !document) return false;
  if (DOCUMENT_MANAGER_ROLES.includes(user.role)) return true;
  return user.role === 'ENSEIGNANT' && document.id_uploade_par === user.id_user;
};

const isDocumentOwner = (user, document) => (
  Boolean(user && document && Number(document.id_uploade_par) === Number(user.id_user))
);

const canAccessDocumentFile = (user, document) => {
  if (!user || !document) return false;
  if (DOCUMENT_PUBLIC_READER_ROLES.includes(user.role)) return true;
  return user.role === 'ENSEIGNANT' && isDocumentOwner(user, document);
};

const canBypassDownloadRestriction = (user, document) => (
  Boolean(user && (DOCUMENT_MANAGER_ROLES.includes(user.role) || isDocumentOwner(user, document)))
);

// ─────────────────────────────────────────────
// GET /api/v1/documents
// Catalogue des documents numériques
// ─────────────────────────────────────────────
const getAllDocuments = async (req, res) => {
  try {
    const {
      page = 1, limit = 12, categorie, format, telechargeable, q,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ["r.type_ressource = 'NUMERIQUE'"];
    let params = [];
    let paramIndex = 1;

    if (categorie) {
      whereConditions.push(`r.id_categorie = $${paramIndex++}`);
      params.push(parseInt(categorie));
    }
    if (format) {
      whereConditions.push(`dn.format = $${paramIndex++}`);
      params.push(format.toUpperCase());
    }
    if (telechargeable !== undefined) {
      whereConditions.push(`dn.est_telechargeable = $${paramIndex++}`);
      params.push(telechargeable === 'true');
    }
    if (q) {
      whereConditions.push(`(r.titre ILIKE $${paramIndex} OR r.auteur ILIKE $${paramIndex})`);
      params.push(`%${q}%`);
      paramIndex++;
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM ressources r
       INNER JOIN documents_numeriques dn ON dn.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT
         r.id_ressource, r.titre, r.auteur, r.date_publication,
         r.description, r.image_couverture, r.date_creation,
         c.libelle AS categorie,
         dn.format, dn.taille_ko, dn.est_telechargeable, dn.nb_consultations,
         u.nom AS uploade_par_nom, u.prenom AS uploade_par_prenom
       FROM ressources r
       INNER JOIN documents_numeriques dn ON dn.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       LEFT JOIN utilisateurs u ON u.id_user = dn.id_uploade_par
       ${whereClause}
       ORDER BY r.date_creation DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Erreur getAllDocuments:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/documents/:id
// Détail d'un document
// ─────────────────────────────────────────────
const getDocumentById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT
         r.*, c.libelle AS categorie,
         dn.url_fichier, dn.nom_fichier, dn.format, dn.taille_ko,
         dn.est_telechargeable, dn.nb_consultations,
         u.nom AS uploade_par_nom, u.prenom AS uploade_par_prenom
       FROM ressources r
       INNER JOIN documents_numeriques dn ON dn.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       LEFT JOIN utilisateurs u ON u.id_user = dn.id_uploade_par
       WHERE r.id_ressource = $1 AND r.type_ressource = 'NUMERIQUE'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Erreur getDocumentById:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/documents/upload
// Uploader un document numérique
// ─────────────────────────────────────────────
const uploadDocument = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Aucun fichier reçu.' });
  }

  const {
    titre, auteur, date_publication, description,
    id_categorie, est_telechargeable,
  } = req.body;

  if (!titre) {
    return res.status(400).json({ success: false, message: 'Le titre est requis.' });
  }

  // Déterminer le format
  const mimeToFormat = {
    'application/pdf': 'PDF',
    'video/mp4': 'MP4',
    'application/msword': 'DOCX',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.ms-powerpoint': 'PPTX',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/vnd.ms-excel': 'XLSX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/zip': 'ZIP',
  };

  const format = mimeToFormat[req.file.mimetype] || 'AUTRE';
  const taille_ko = Math.round(req.file.size / 1024);
  let url_fichier;

  try {
    const uploaded = await uploadBuffer(req.file.buffer, {
      folder: 'bibliotheque/documents',
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
    });
    url_fichier = uploaded.url;
  } catch (error) {
    console.error('Erreur upload Cloudinary (uploadDocument):', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de l\'envoi du fichier.' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const ressourceResult = await client.query(
      `INSERT INTO ressources
         (titre, auteur, date_publication, description, id_categorie, type_ressource)
       VALUES ($1, $2, $3, $4, $5, 'NUMERIQUE')
       RETURNING *`,
      [titre, auteur || null, date_publication || null, description || null, id_categorie || null]
    );

    const ressource = ressourceResult.rows[0];

    await client.query(
      `INSERT INTO documents_numeriques
         (id_ressource, url_fichier, nom_fichier, format, taille_ko, est_telechargeable, id_uploade_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        ressource.id_ressource,
        url_fichier,
        req.file.originalname,
        format,
        taille_ko,
        est_telechargeable !== 'false',
        req.user.id_user,
      ]
    );

    await client.query('COMMIT');

    // Notification admin uniquement si l'uploader est un enseignant
    // (admins/bibliothécaires qui uploadent eux-mêmes n'ont pas besoin d'être notifiés).
    if (req.user.role === 'ENSEIGNANT') {
      const uploaderName = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() || 'Un enseignant';
      notifyAdmins({
        title: 'Nouveau document uploadé',
        message: `${uploaderName} (enseignant) a déposé le document « ${ressource.titre} ».`,
        type: 'DOCUMENT_UPLOAD',
        relatedEntityType: 'document',
        relatedEntityId: ressource.id_ressource,
        targetUrl: '/admin/documents',
      }).catch(() => {});

      // Notifier aussi les étudiants : nouveau document de cours disponible.
      createNotification({
        title: 'Nouveau document de cours',
        message: `${uploaderName} (enseignant) a publié « ${ressource.titre} ».`,
        type: 'DOCUMENT_UPLOAD',
        recipientRole: 'ETUDIANT',
        relatedEntityType: 'document',
        relatedEntityId: ressource.id_ressource,
        targetUrl: '/student/documents',
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: 'Document uploadé avec succès.',
      data: {
        id_ressource: ressource.id_ressource,
        titre: ressource.titre,
        format,
        taille_ko,
        url: url_fichier,
      },
    });

  } catch (error) {
    await client.query('ROLLBACK');
    // Le fichier est déjà sur Cloudinary ; en cas d'échec DB il devient orphelin
    // (nettoyable plus tard). Pas de fichier local à supprimer.
    console.error('Erreur uploadDocument:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/documents/:id/stream
// Streaming (lecture en ligne) du document
// ─────────────────────────────────────────────
const streamDocument = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT dn.url_fichier, dn.nom_fichier, dn.format, dn.id_uploade_par, r.titre
       FROM documents_numeriques dn
       INNER JOIN ressources r ON r.id_ressource = dn.id_ressource
       WHERE dn.id_ressource = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }

    const doc = result.rows[0];
    if (!canAccessDocumentFile(req.user, doc)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé à ce document.',
      });
    }

    // Enregistrer la consultation dans l'historique (async, ne bloque pas)
    if (req.user.role === 'ETUDIANT') {
      query(
        `INSERT INTO historique_lectures (id_user, id_document) VALUES ($1, $2)`,
        [req.user.id_user, id]
      ).catch(console.error);

    // Incrémenter le compteur de consultations (async)
      query(
        `UPDATE documents_numeriques SET nb_consultations = nb_consultations + 1 WHERE id_ressource = $1`,
        [id]
      ).catch(console.error);
    }

    // MIME type centralisé pour les formats supportés
    const MIME_BY_FORMAT = {
      PDF: 'application/pdf',
      MP4: 'video/mp4',
      WEBM: 'video/webm',
      OGG: 'video/ogg',
      MOV: 'video/quicktime',
      DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ZIP: 'application/zip',
    };
    const contentType = MIME_BY_FORMAT[doc.format] || 'application/octet-stream';

    // Fichier distant (Cloudinary) : proxy avec support des Range requests.
    if (isRemoteUrl(doc.url_fichier)) {
      return proxyRemoteFile(req, res, doc.url_fichier, {
        contentType,
        filename: doc.nom_fichier,
        disposition: 'inline',
      });
    }

    // Fichier local (compat avec les anciens uploads sur disque)
    const filePath = resolveStoredUploadPath(doc.url_fichier);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Fichier introuvable sur le serveur.' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Support du streaming partiel (Range requests pour PDF viewer et vidéos)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.nom_fichier)}"`,
      });
      fs.createReadStream(filePath).pipe(res);
    }

  } catch (error) {
    console.error('Erreur streamDocument:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/documents/:id/download
// Télécharger un document (si autorisé)
// ─────────────────────────────────────────────
const downloadDocument = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT dn.url_fichier, dn.nom_fichier, dn.est_telechargeable, dn.id_uploade_par
       FROM documents_numeriques dn
       WHERE dn.id_ressource = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }

    const doc = result.rows[0];

    if (!canAccessDocumentFile(req.user, doc)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé à ce document.',
      });
    }

    if (!doc.est_telechargeable && !canBypassDownloadRestriction(req.user, doc)) {
      return res.status(403).json({
        success: false,
        message: 'Ce document n\'est pas disponible en téléchargement.',
      });
    }

    // Fichier distant (Cloudinary) : proxy en pièce jointe.
    if (isRemoteUrl(doc.url_fichier)) {
      return proxyRemoteFile(req, res, doc.url_fichier, {
        contentType: 'application/octet-stream',
        filename: doc.nom_fichier,
        disposition: 'attachment',
      });
    }

    // Fichier local (compat avec les anciens uploads sur disque)
    const filePath = resolveStoredUploadPath(doc.url_fichier);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Fichier introuvable sur le serveur.' });
    }

    // Envoyer le fichier en téléchargement
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nom_fichier)}"`);
    res.download(filePath, doc.nom_fichier);

  } catch (error) {
    console.error('Erreur downloadDocument:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/documents/:id
// Mettre à jour les métadonnées d'un document
// ─────────────────────────────────────────────
const updateDocument = async (req, res) => {
  const { id } = req.params;
  const {
    titre, auteur, date_publication, description,
    id_categorie, est_telechargeable,
  } = req.body;

  if (titre !== undefined && (!titre || !titre.toString().trim())) {
    return res.status(400).json({ success: false, message: 'Le titre est requis.' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const documentOwnership = await getDocumentOwnership(client, id);
    if (!documentOwnership) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }
    if (!canManageDocument(req.user, documentOwnership)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Vous pouvez modifier uniquement vos propres documents.',
      });
    }

    await client.query(
      `UPDATE ressources SET
         titre = COALESCE($1, titre),
         auteur = COALESCE($2, auteur),
         date_publication = COALESCE($3, date_publication),
         description = COALESCE($4, description),
         id_categorie = COALESCE($5, id_categorie),
         date_modification = NOW()
       WHERE id_ressource = $6`,
      [
        titre || null,
        auteur || null,
        date_publication || null,
        description || null,
        id_categorie ? parseInt(id_categorie) : null,
        id,
      ]
    );

    if (est_telechargeable !== undefined) {
      const flag = est_telechargeable === true || est_telechargeable === 'true';
      await client.query(
        `UPDATE documents_numeriques SET est_telechargeable = $1 WHERE id_ressource = $2`,
        [flag, id]
      );
    }

    await client.query('COMMIT');

    const result = await query(
      `SELECT r.*, c.libelle AS categorie,
              dn.url_fichier, dn.nom_fichier, dn.format, dn.taille_ko,
              dn.est_telechargeable, dn.nb_consultations,
              u.nom AS uploade_par_nom, u.prenom AS uploade_par_prenom
       FROM ressources r
       INNER JOIN documents_numeriques dn ON dn.id_ressource = r.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       LEFT JOIN utilisateurs u ON u.id_user = dn.id_uploade_par
       WHERE r.id_ressource = $1`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Document mis à jour.',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur updateDocument:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// DELETE /api/v1/documents/:id
// Supprimer un document
// ─────────────────────────────────────────────
const deleteDocument = async (req, res) => {
  const { id } = req.params;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Récupérer le chemin du fichier avant suppression
    const docResult = await client.query(
      `SELECT dn.url_fichier, dn.id_uploade_par
       FROM documents_numeriques dn
       INNER JOIN ressources r ON r.id_ressource = dn.id_ressource
       WHERE dn.id_ressource = $1
         AND r.type_ressource = 'NUMERIQUE'`,
      [id]
    );

    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }

    if (!canManageDocument(req.user, docResult.rows[0])) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Vous pouvez supprimer uniquement vos propres documents.',
      });
    }

    const filePath = resolveStoredUploadPath(docResult.rows[0].url_fichier);

    // Supprimer de la BDD (cascade)
    await client.query(
      "DELETE FROM ressources WHERE id_ressource = $1 AND type_ressource = 'NUMERIQUE'",
      [id]
    );

    await client.query('COMMIT');

    // Supprimer le fichier physique (ne pas bloquer si erreur)
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.status(200).json({ success: true, message: 'Document supprimé avec succès.' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur deleteDocument:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/documents/historique/mes-lectures
// Historique de lecture de l'utilisateur connecté
// ─────────────────────────────────────────────
const getMesLectures = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         hl.id, hl.date_lecture, hl.temps_passe_secondes,
         r.id_ressource, r.titre, r.auteur, r.description, r.image_couverture,
         c.libelle AS categorie,
         dn.format, dn.taille_ko, dn.est_telechargeable, dn.nb_consultations
       FROM historique_lectures hl
       INNER JOIN documents_numeriques dn ON dn.id_ressource = hl.id_document
       INNER JOIN ressources r ON r.id_ressource = dn.id_ressource
       LEFT JOIN categories c ON c.id_categorie = r.id_categorie
       WHERE hl.id_user = $1
       ORDER BY hl.date_lecture DESC
       LIMIT 1000`,
      [req.user.id_user]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Erreur getMesLectures:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = {
  getAllDocuments,
  getDocumentById,
  uploadDocument,
  streamDocument,
  downloadDocument,
  updateDocument,
  deleteDocument,
  getMesLectures,
};
