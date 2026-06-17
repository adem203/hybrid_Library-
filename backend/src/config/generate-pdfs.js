// ============================================================
// generate-pdfs.js — Génère un PDF réel par livre et par document
// présents sur la plateforme (lus depuis la base), sans dépendance.
// Usage : DATABASE_URL="postgresql://...?sslmode=require" node src/config/generate-pdfs.js
// Sortie : ../../../sample-pdfs/{books|documents}/*.pdf
// ============================================================
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const OUT_ROOT = path.resolve(__dirname, '../../../sample-pdfs');

// ── Normalisation texte → WinAnsi (Latin-1) ────────────────
const toWinAnsi = (s) => String(s || '')
  .replace(/[‘’′]/g, "'")
  .replace(/[“”″]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/…/g, '...')
  .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
  .replace(/ /g, ' ')
  .split('').map((c) => (c.charCodeAt(0) <= 0xff ? c : '?')).join('');

const esc = (s) => toWinAnsi(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const wrap = (text, max) => {
  const words = toWinAnsi(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur ? cur + ' ' : '') + w;
  }
  if (cur) lines.push(cur);
  return lines;
};

// ── Construction d'un PDF une page (A4), polices base-14 ────
// items: [{ text, size, y }]
function buildPdf(items) {
  let content = 'BT\n';
  for (const it of items) {
    content += `/F1 ${it.size} Tf\n1 0 0 1 50 ${it.y} Tm\n(${esc(it.text)}) Tj\n`;
  }
  content += 'ET\n';

  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 595 842] >>';
  objs[3] = '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>';
  objs[4] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const PARA = [
  "Ce document est un exemplaire de demonstration genere pour la bibliotheque numerique Educated Library.",
  "Il sert a illustrer l'affichage, la lecture en ligne et le telechargement des ressources de la plateforme.",
  "Le contenu ci-dessous est un texte de remplissage et ne constitue pas l'ouvrage reel.",
  "",
  "Chapitre 1 - Introduction",
  "La presente ressource fait partie du catalogue de l'etablissement. Elle peut etre empruntee ou consultee",
  "selon son type (physique ou numerique) et la categorie a laquelle elle appartient.",
  "",
  "Chapitre 2 - Utilisation",
  "Les etudiants peuvent ajouter cette ressource a leurs lectures, tandis que les enseignants et les",
  "bibliothecaires en assurent la gestion : ajout, mise a jour, suivi des emprunts et des reservations.",
  "",
  "Pour toute question, contactez l'equipe de la bibliotheque via la section support de la plateforme.",
];

const sanitize = (s) => toWinAnsi(s)
  .replace(/[^a-zA-Z0-9 _-]/g, '')
  .trim().replace(/\s+/g, '-').slice(0, 70) || 'document';

function makeDoc(titre, auteur, categorie, typeLabel) {
  const items = [];
  let y = 800;
  items.push({ text: 'EDUCATED LIBRARY', size: 10, y });
  y -= 40;
  for (const line of wrap(titre, 46)) { items.push({ text: line, size: 20, y }); y -= 26; }
  y -= 6;
  items.push({ text: `Auteur : ${auteur || 'N/A'}`, size: 12, y }); y -= 18;
  items.push({ text: `Categorie : ${categorie || 'N/A'}   |   Type : ${typeLabel}`, size: 12, y }); y -= 30;
  for (const p of PARA) {
    if (p === '') { y -= 8; continue; }
    for (const line of wrap(p, 95)) { items.push({ text: line, size: 11, y }); y -= 15; }
  }
  return buildPdf(items);
}

(async () => {
  const booksDir = path.join(OUT_ROOT, 'books');
  const docsDir = path.join(OUT_ROOT, 'documents');
  fs.mkdirSync(booksDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const res = await pool.query(`
    SELECT r.id_ressource, r.titre, r.auteur, r.type_ressource,
           c.libelle AS categorie, dn.nom_fichier
      FROM ressources r
      LEFT JOIN categories c ON c.id_categorie = r.id_categorie
      LEFT JOIN documents_numeriques dn ON dn.id_ressource = r.id_ressource
     ORDER BY r.type_ressource, r.id_ressource
  `);

  let nBooks = 0, nDocs = 0;
  for (const row of res.rows) {
    const isDoc = row.type_ressource === 'NUMERIQUE';
    const typeLabel = isDoc ? 'Document numerique' : 'Livre physique';
    const buf = makeDoc(row.titre, row.auteur, row.categorie, typeLabel);
    if (isDoc) {
      const name = (row.nom_fichier && row.nom_fichier.toLowerCase().endsWith('.pdf'))
        ? row.nom_fichier
        : `${sanitize(row.titre)}.pdf`;
      fs.writeFileSync(path.join(docsDir, name), buf);
      nDocs++;
    } else {
      fs.writeFileSync(path.join(booksDir, `${sanitize(row.titre)}.pdf`), buf);
      nBooks++;
    }
  }

  console.log(`✅ PDFs générés dans : ${OUT_ROOT}`);
  console.log(`   books/     : ${nBooks} fichiers`);
  console.log(`   documents/ : ${nDocs} fichiers`);
  await pool.end();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
