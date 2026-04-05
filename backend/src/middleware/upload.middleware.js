const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// S'assurer que le dossier uploads existe
const uploadDir = process.env.UPLOAD_PATH || './uploads';
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

const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '50');

// Upload pour documents (PDF, vidéo, etc.)
const uploadDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
}).single('fichier');

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
const handleUpload = (uploadFn) => (req, res, next) => {
  uploadFn(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `Fichier trop volumineux. Taille maximale : ${maxSizeMB} Mo`,
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

module.exports = {
  uploadDocument: handleUpload(uploadDocument),
  uploadImage: handleUpload(uploadImage),
};