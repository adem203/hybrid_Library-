const multer = require('multer');

// ─────────────────────────────────────────────
// Stockage en mémoire : le fichier est gardé en RAM (req.file.buffer)
// puis envoyé vers Cloudinary par le contrôleur. Aucun fichier n'est
// écrit sur le disque local (qui ne persiste pas sur Render/serverless).
// ─────────────────────────────────────────────
const storage = multer.memoryStorage();

// Filtre des types de fichiers autorisés
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'video/mp4',
    'video/avi',
    'video/mkv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/zip',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
  }
};

// Per-type upload size limits — alignés sur le tier gratuit Cloudinary :
//   - Vidéos MP4 : 100 Mo (max upload vidéo gratuit)
//   - Documents  : 10 Mo  (max upload "raw"/image gratuit)
// Pour des fichiers plus volumineux, passer à un plan payant ou à un
// stockage objet dédié (S3, Supabase Storage…) et relever ces limites.
const VIDEO_LIMIT_BYTES = 100 * 1024 * 1024;            // 100 Mo
const DOCUMENT_LIMIT_BYTES = 10 * 1024 * 1024;          // 10 Mo
const ABSOLUTE_LIMIT_BYTES = VIDEO_LIMIT_BYTES;

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/avi',
  'video/mkv',
]);

const isVideoMime = (mimetype) => VIDEO_MIMES.has(mimetype) || (mimetype || '').startsWith('video/');

const getLimitForMime = (mimetype) => (
  isVideoMime(mimetype) ? VIDEO_LIMIT_BYTES : DOCUMENT_LIMIT_BYTES
);

const formatBytes = (bytes) => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(bytes % (1024 * 1024 * 1024) === 0 ? 0 : 1)} Go`;
  }
  return `${Math.round(bytes / (1024 * 1024))} Mo`;
};

// Upload pour documents (PDF, vidéo, etc.) — limite absolue côté multer.
// La règle par type (10 Mo / 100 Mo) est appliquée après par enforceUploadLimit().
const uploadDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: ABSOLUTE_LIMIT_BYTES },
}).single('fichier');

// Post-multer: rejette le fichier si sa taille dépasse la limite spécifique au type.
// (Stockage mémoire : rien à nettoyer sur le disque.)
const enforceUploadLimit = (req, res, next) => {
  if (!req.file) return next();
  const limit = getLimitForMime(req.file.mimetype);
  if (req.file.size > limit) {
    const isVideo = isVideoMime(req.file.mimetype);
    return res.status(400).json({
      success: false,
      message: isVideo
        ? `Vidéo trop volumineuse. Taille maximale pour les vidéos MP4 : ${formatBytes(VIDEO_LIMIT_BYTES)}.`
        : `Fichier trop volumineux. Taille maximale pour les documents : ${formatBytes(DOCUMENT_LIMIT_BYTES)}.`,
    });
  }
  return next();
};

// Upload pour images (couvertures de livres)
const uploadImage = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max pour images
}).single('image');

// Wrapper pour gérer les erreurs multer
const handleUpload = (uploadFn, { enforcePerTypeLimit = false } = {}) => (req, res, next) => {
  uploadFn(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `Fichier trop volumineux. Taille maximale autorisée : ${formatBytes(ABSOLUTE_LIMIT_BYTES)} (vidéos MP4 uniquement). Documents : ${formatBytes(DOCUMENT_LIMIT_BYTES)} maximum.`,
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (enforcePerTypeLimit) {
      return enforceUploadLimit(req, res, next);
    }
    return next();
  });
};

module.exports = {
  uploadDocument: handleUpload(uploadDocument, { enforcePerTypeLimit: true }),
  uploadImage: handleUpload(uploadImage),
};
