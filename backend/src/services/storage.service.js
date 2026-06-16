// ============================================================
// storage.service.js - Stockage des fichiers sur Cloudinary
//
// Remplace le stockage disque local (qui ne persiste pas sur
// Render / les hébergeurs serverless). Couvertures de livres et
// documents numériques sont envoyés sur Cloudinary et on stocke
// l'URL `secure_url` renvoyée dans la base.
//
// Variables d'environnement requises :
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
// ============================================================
const { v2: cloudinary } = require('cloudinary');
const { v4: uuidv4 } = require('uuid');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const isConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

// Cloudinary distingue : image / video / raw (pdf, docx, zip…).
const resourceTypeForMime = (mimetype = '') => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
};

/**
 * Envoie un buffer (multer.memoryStorage) vers Cloudinary.
 * @param {Buffer} buffer
 * @param {{ folder?: string, mimetype?: string, originalname?: string }} opts
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, bytes: number }>}
 */
const uploadBuffer = (buffer, { folder = 'bibliotheque', mimetype = '', originalname = '' } = {}) =>
  new Promise((resolve, reject) => {
    if (!isConfigured()) {
      return reject(new Error('Cloudinary n\'est pas configuré (CLOUDINARY_* manquant).'));
    }

    const resourceType = resourceTypeForMime(mimetype);

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: uuidv4(),
        // Conserve l'extension d'origine pour les fichiers "raw" (pdf, docx…).
        use_filename: false,
        unique_filename: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          bytes: result.bytes,
        });
      }
    );

    uploadStream.end(buffer);
  });

module.exports = { uploadBuffer, resourceTypeForMime, isConfigured };
