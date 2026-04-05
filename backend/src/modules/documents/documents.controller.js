const { query, getClient } = require('../../config/db');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

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
  const url_fichier = `/${req.file.path.replace(/\\/g, '/')}`;

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
    // Supprimer le fichier uploadé en cas d'erreur
    if (req.file) fs.unlinkSync(req.file.path);
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
      `SELECT dn.url_fichier, dn.nom_fichier, dn.format, r.titre
       FROM documents_numeriques dn
       INNER JOIN ressources r ON r.id_ressource = dn.id_ressource
       WHERE dn.id_ressource = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }

    const doc = result.rows[0];
    // url_fichier est relatif : /uploads/pdf/xxx.pdf
    const filePath = path.join(process.cwd(), doc.url_fichier);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Fichier introuvable sur le serveur.' });
    }

    // Enregistrer la consultation dans l'historique (async, ne bloque pas)
    query(
      `INSERT INTO historique_lectures (id_user, id_document) VALUES ($1, $2)`,
      [req.user.id_user, id]
    ).catch(console.error);

    // Incrémenter le compteur de consultations (async)
    query(
      `UPDATE documents_numeriques SET nb_consultations = nb_consultations + 1 WHERE id_ressource = $1`,
      [id]
    ).catch(console.error);

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Support du streaming partiel (Range requests pour PDF viewer et vidéos)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const mimeTypes = {
        PDF: 'application/pdf',
        MP4: 'video/mp4',
        DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeTypes[doc.format] || 'application/octet-stream',
        'Content-Disposition': 'inline',
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': doc.format === 'PDF' ? 'application/pdf' : 'application/octet-stream',
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
      `SELECT dn.url_fichier, dn.nom_fichier, dn.est_telechargeable
       FROM documents_numeriques dn
       WHERE dn.id_ressource = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }

    const doc = result.rows[0];

    if (!doc.est_telechargeable) {
      return res.status(403).json({
        success: false,
        message: 'Ce document n\'est pas disponible en téléchargement.',
      });
    }

    const filePath = path.join(process.cwd(), doc.url_fichier);

    if (!fs.existsSync(filePath)) {
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
      'SELECT url_fichier FROM documents_numeriques WHERE id_ressource = $1',
      [id]
    );

    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Document introuvable.' });
    }

    const filePath = path.join(process.cwd(), docResult.rows[0].url_fichier);

    // Supprimer de la BDD (cascade)
    await client.query(
      "DELETE FROM ressources WHERE id_ressource = $1 AND type_ressource = 'NUMERIQUE'",
      [id]
    );

    await client.query('COMMIT');

    // Supprimer le fichier physique (ne pas bloquer si erreur)
    if (fs.existsSync(filePath)) {
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
         r.titre, r.auteur, dn.format
       FROM historique_lectures hl
       INNER JOIN documents_numeriques dn ON dn.id_ressource = hl.id_document
       INNER JOIN ressources r ON r.id_ressource = dn.id_ressource
       WHERE hl.id_user = $1
       ORDER BY hl.date_lecture DESC
       LIMIT 50`,
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
  deleteDocument,
  getMesLectures,
};