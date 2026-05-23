const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// S'assurer que le dossier uploads existe
const uploadDir = path.resolve(process.env.UPLOAD_PATH || './uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Sous-dossiers par type
const createSubDir = (subDir) => {
  const dir = path.join(uploadDir, subDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// Configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'divers';

    if (file.mimetype === 'application/pdf') subDir = 'pdf';
    else if (file.mimetype.startsWith('video/')) subDir = 'videos';
    else if (file.mimetype.startsWith('image/')) subDir = 'images';
    else if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'application/msword'
    ) subDir = 'documents';

    cb(null, createSubDir(subDir));
  },
  filename: (req, file, cb) => {
    // Nom unique : uuid + extension originale
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

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

// Per-type upload size limits
//   - MP4 videos   : 1 Go
//   - Documents    : 200 Mo (PDF, DOCX, PPTX, XLSX)
//   - Other media  : default DOCUMENT_LIMIT
const VIDEO_LIMIT_BYTES = 1 * 1024 * 1024 * 1024;       // 1 Go
const DOCUMENT_LIMIT_BYTES = 200 * 1024 * 1024;         // 200 Mo
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

// Upload pour documents (PDF, vidéo, etc.) — limite absolue côté multer = 1 Go
// La règle par type (200 Mo / 1 Go) est appliquée après par enforceUploadLimit().
const uploadDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: ABSOLUTE_LIMIT_BYTES },
}).single('fichier');

// Post-multer: rejette le fichier si sa taille dépasse la limite spécifique au type.
const enforceUploadLimit = (req, res, next) => {
  if (!req.file) return next();
  const limit = getLimitForMime(req.file.mimetype);
  if (req.file.size > limit) {
    // Nettoyer le fichier déjà écrit sur disque
    try {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (cleanupErr) {
      console.error('Erreur nettoyage fichier hors limite:', cleanupErr);
    }
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
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, createSubDir('images')),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
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
