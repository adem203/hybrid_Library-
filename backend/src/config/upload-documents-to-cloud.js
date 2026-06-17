// ============================================================
// upload-documents-to-cloud.js
// Pour chaque document numérique de la base, envoie son PDF généré
// (sample-pdfs/documents/<nom_fichier>) vers Cloudinary, puis met à jour
// documents_numeriques.url_fichier + taille_ko. Rend les documents
// ouvrables en ligne sans upload manuel.
//
// Usage :
//   DATABASE_URL="postgresql://...?sslmode=require" \
//   CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... \
//   node src/config/upload-documents-to-cloud.js
// ============================================================
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { uploadBuffer, isConfigured } = require('../services/storage.service');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DOCS_DIR = path.resolve(__dirname, '../../../sample-pdfs/documents');

const sanitize = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 70) || 'document';

(async () => {
  if (!isConfigured()) {
    console.error('❌ Cloudinary non configuré (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET manquants).');
    process.exit(1);
  }

  const docs = await pool.query(`
    SELECT dn.id_ressource, dn.nom_fichier, r.titre
      FROM documents_numeriques dn
      INNER JOIN ressources r ON r.id_ressource = dn.id_ressource
     ORDER BY dn.id_ressource
  `);

  let done = 0, skipped = 0;
  for (const d of docs.rows) {
    // Retrouver le PDF local : par nom_fichier, sinon par titre sanitisé.
    let file = path.join(DOCS_DIR, d.nom_fichier || '');
    if (!fs.existsSync(file)) file = path.join(DOCS_DIR, `${sanitize(d.titre)}.pdf`);
    if (!fs.existsSync(file)) {
      console.warn(`  ⚠️  PDF introuvable pour « ${d.titre} » (cherché: ${d.nom_fichier}). Ignoré.`);
      skipped++;
      continue;
    }

    const buffer = fs.readFileSync(file);
    try {
      const up = await uploadBuffer(buffer, {
        folder: 'bibliotheque/documents',
        mimetype: 'application/pdf',
        originalname: d.nom_fichier || `${sanitize(d.titre)}.pdf`,
      });
      const tailleKo = Math.round((up.bytes || buffer.length) / 1024);
      await pool.query(
        `UPDATE documents_numeriques
            SET url_fichier = $1, taille_ko = $2, format = 'PDF'
          WHERE id_ressource = $3`,
        [up.url, tailleKo, d.id_ressource]
      );
      console.log(`  ✅ ${d.titre}\n     → ${up.url}`);
      done++;
    } catch (e) {
      console.error(`  ❌ Échec pour « ${d.titre} »: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nTerminé. ${done} document(s) mis à jour, ${skipped} ignoré(s).`);
  await pool.end();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
