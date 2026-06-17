// ============================================================
// seed-dummy.js — Données de démonstration pour remplir la plateforme.
// Usage : DATABASE_URL="postgresql://...?sslmode=require" node src/config/seed-dummy.js
//         (ajouter FORCE=1 pour ré-insérer même si des données existent déjà)
//
// Utilisateurs attendus (créés au préalable) :
//   1 = admin@educated.tn (BIBLIOTHECAIRE)
//   2 = mohamedadem.laadhari@polytechnicien.tn (ADMIN)
//   3 = ademlaadhari81@gmail.com (ETUDIANT)
//   4 = ademlaadhari12@gmail.com (ENSEIGNANT)
// ============================================================
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const cover = (seed) => `https://picsum.photos/seed/biblio-${seed}/300/450`;
const SAMPLE_PDF = 'https://www.africau.edu/images/default/sample.pdf';

// titre, auteur, id_categorie, année, isbn, rayon, stock_total
const BOOKS = [
  ['Clean Code', 'Robert C. Martin', 1, 2008, '9780132350884', 'A1', 4],
  ['Introduction to Algorithms', 'Thomas H. Cormen', 1, 2009, '9780262033848', 'A1', 3],
  ['The Pragmatic Programmer', 'Andrew Hunt', 1, 1999, '9780201616224', 'A2', 5],
  ['Designing Data-Intensive Applications', 'Martin Kleppmann', 1, 2017, '9781449373320', 'A2', 2],
  ['Structure and Interpretation of Computer Programs', 'Harold Abelson', 1, 1985, '9780262510875', 'A3', 3],
  ['Calculus', 'Michael Spivak', 2, 2008, '9780914098911', 'B1', 4],
  ['Linear Algebra Done Right', 'Sheldon Axler', 2, 2015, '9783319110790', 'B1', 3],
  ['Introduction to Probability', 'Joseph K. Blitzstein', 2, 2014, '9781466575578', 'B2', 2],
  ['University Physics', 'Hugh D. Young', 3, 2019, '9780135159552', 'C1', 5],
  ['The Feynman Lectures on Physics', 'Richard P. Feynman', 3, 1964, '9780465023820', 'C1', 2],
  ['Concepts of Modern Physics', 'Arthur Beiser', 3, 2002, '9780072448481', 'C2', 3],
  ['Organic Chemistry', 'Jonathan Clayden', 4, 2012, '9780199270293', 'D1', 3],
  ['Chemistry: The Central Science', 'Theodore L. Brown', 4, 2017, '9780134414232', 'D1', 4],
  ['Principles of Economics', 'N. Gregory Mankiw', 5, 2020, '9780357038314', 'E1', 5],
  ['Capital in the Twenty-First Century', 'Thomas Piketty', 5, 2013, '9780674430006', 'E1', 2],
  ['Freakonomics', 'Steven D. Levitt', 5, 2005, '9780060731328', 'E2', 3],
  ['Introduction au droit', 'Jean Carbonnier', 6, 2019, '9782130811234', 'F1', 3],
  ['Droit constitutionnel', 'Francis Hamon', 6, 2021, '9782275090000', 'F1', 2],
  ['English Grammar in Use', 'Raymond Murphy', 7, 2019, '9781108457651', 'G1', 6],
  ['Le Petit Robert de la langue française', 'Paul Robert', 7, 2022, '9782321016489', 'G1', 2],
  ['Bescherelle La Conjugaison pour tous', 'Bescherelle', 7, 2019, '9782401052345', 'G2', 4],
  ['Sapiens : Une brève histoire de l’humanité', 'Yuval Noah Harari', 8, 2011, '9782226257017', 'H1', 4],
  ['Thinking, Fast and Slow', 'Daniel Kahneman', 8, 2011, '9780374533557', 'H1', 3],
  ['Guns, Germs, and Steel', 'Jared Diamond', 8, 1997, '9780393317558', 'H2', 2],
];

// titre, auteur, id_categorie, format, nom_fichier, taille_ko, nb_consultations
const DOCS = [
  ['Cours : Algorithmique et structures de données', 'Prof. A. Laadhari', 1, 'PDF', 'cours-algo.pdf', 1840, 42],
  ['TP : Initiation à la programmation Python', 'Prof. A. Laadhari', 1, 'PDF', 'tp-python.pdf', 920, 31],
  ['Polycopié : Analyse 1', 'Département Maths', 2, 'PDF', 'analyse-1.pdf', 2630, 58],
  ['Exercices corrigés : Algèbre linéaire', 'Département Maths', 2, 'PDF', 'exos-algebre.pdf', 1410, 27],
  ['Cours : Mécanique du point matériel', 'Prof. A. Laadhari', 3, 'PDF', 'mecanique-point.pdf', 3120, 19],
  ['Support : Microéconomie (L1)', 'Faculté d’Économie', 5, 'PDF', 'microeconomie-l1.pdf', 1990, 36],
  ['Fascicule : Introduction au droit civil', 'Faculté de Droit', 6, 'PDF', 'intro-droit-civil.pdf', 1255, 22],
  ['Guide : Méthodologie de la dissertation', 'Cellule pédagogique', 7, 'PDF', 'methodo-dissertation.pdf', 760, 64],
];

const LIBRARIAN = 1, ADMIN = 2, STUDENT = 3, TEACHER = 4;

(async () => {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      "SELECT COUNT(*)::int AS n FROM ressources WHERE type_ressource = 'PHYSIQUE'"
    );
    if (existing.rows[0].n > 0 && process.env.FORCE !== '1') {
      console.log(`⚠️  ${existing.rows[0].n} livres physiques existent déjà. Rien fait.`);
      console.log('   Relancer avec FORCE=1 pour insérer quand même (peut créer des doublons).');
      process.exit(0);
    }

    await client.query('BEGIN');

    // ── Livres physiques ──────────────────────────────────
    const bookIds = [];
    for (let i = 0; i < BOOKS.length; i++) {
      const [titre, auteur, cat, year, isbn, rayon, stock] = BOOKS[i];
      const r = await client.query(
        `INSERT INTO ressources (titre, auteur, date_publication, description, image_couverture, id_categorie, type_ressource)
         VALUES ($1,$2,$3,$4,$5,$6,'PHYSIQUE') RETURNING id_ressource`,
        [titre, auteur, `${year}-01-01`,
         `${titre} — ouvrage de référence par ${auteur}.`,
         cover(i + 1), cat]
      );
      const id = r.rows[0].id_ressource;
      bookIds.push(id);
      await client.query(
        `INSERT INTO livres_physiques (id_ressource, isbn, emplacement_rayon, stock_total, stock_disponible)
         VALUES ($1,$2,$3,$4,$4)`,
        [id, isbn, rayon, stock]
      );
    }

    // ── Documents numériques ──────────────────────────────
    const docIds = [];
    for (let i = 0; i < DOCS.length; i++) {
      const [titre, auteur, cat, format, nom, taille, vues] = DOCS[i];
      const r = await client.query(
        `INSERT INTO ressources (titre, auteur, date_publication, description, image_couverture, id_categorie, type_ressource)
         VALUES ($1,$2,$3,$4,$5,$6,'NUMERIQUE') RETURNING id_ressource`,
        [titre, auteur, '2024-09-01', `Document pédagogique : ${titre}.`, cover(100 + i), cat]
      );
      const id = r.rows[0].id_ressource;
      docIds.push(id);
      await client.query(
        `INSERT INTO documents_numeriques (id_ressource, url_fichier, nom_fichier, format, taille_ko, est_telechargeable, nb_consultations, id_uploade_par)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, SAMPLE_PDF, nom, format, taille, i % 3 !== 0, vues, TEACHER]
      );
    }

    // ── Emprunts (statuts variés) ─────────────────────────
    // [user, bookIndex, statut, dateEmprunt(interval), dueDate(interval), retourEffectif(interval|null), penalite]
    const LOANS = [
      [STUDENT, 0, 'EN_COURS',   "-4 days",  "+10 days", null, 0],
      [TEACHER, 1, 'EN_COURS',   "-9 days",  "+5 days",  null, 0],
      [STUDENT, 8, 'EN_COURS',   "-1 days",  "+14 days", null, 0],
      [STUDENT, 3, 'EN_RETARD',  "-20 days", "-3 days",  null, 3],
      [TEACHER, 11, 'EN_RETARD', "-25 days", "-8 days",  null, 8],
      [STUDENT, 5, 'RETOURNE',   "-30 days", "-16 days", "-18 days", 0],
      [STUDENT, 13, 'RETOURNE',  "-45 days", "-31 days", "-33 days", 0],
      [TEACHER, 21, 'RETOURNE',  "-22 days", "-8 days",  "-10 days", 0],
      [STUDENT, 2, 'EN_ATTENTE', "-1 days",  "+13 days", null, 0],
      [TEACHER, 14, 'EN_ATTENTE',"0 days",   "+14 days", null, 0],
    ];
    const stockDecrement = new Set(); // book ressource ids whose stock to decrement
    for (const [user, bi, statut, demp, due, ret, pen] of LOANS) {
      const idLivre = bookIds[bi];
      await client.query(
        `INSERT INTO emprunts (id_user, id_livre, date_emprunt, date_retour_prevue, date_retour_effectif, statut, penalite_montant)
         VALUES ($1,$2, NOW() + ($3)::interval, (NOW() + ($4)::interval)::date,
                 ${ret ? "NOW() + ($5)::interval" : "NULL"}, $${ret ? 6 : 5}, $${ret ? 7 : 6})`,
        ret ? [user, idLivre, demp, due, ret, statut, pen]
            : [user, idLivre, demp, due, statut, pen]
      );
      if (statut === 'EN_COURS' || statut === 'EN_RETARD') stockDecrement.add(idLivre);
    }
    for (const id of stockDecrement) {
      await client.query(
        `UPDATE livres_physiques SET stock_disponible = GREATEST(stock_disponible - 1, 0) WHERE id_ressource = $1`,
        [id]
      );
    }

    // ── Réservations ──────────────────────────────────────
    const RESERVATIONS = [
      [STUDENT, 4, 'EN_ATTENTE', "-2 days"],
      [TEACHER, 6, 'CONFIRMEE',  "-1 days"],
      [STUDENT, 9, 'EN_ATTENTE', "0 days"],
      [STUDENT, 15, 'EXPIREE',   "-12 days"],
    ];
    for (const [user, bi, statut, when] of RESERVATIONS) {
      await client.query(
        `INSERT INTO reservations (id_user, id_livre, date_reservation, statut)
         VALUES ($1,$2, NOW() + ($3)::interval, $4)`,
        [user, bookIds[bi], when, statut]
      );
    }

    // ── Historique de lecture (étudiant) ──────────────────
    const HISTORY = [
      [STUDENT, 0, "-3 days", 1820, 24],
      [STUDENT, 2, "-2 days", 940, 12],
      [STUDENT, 3, "-1 days", 600, 8],
      [STUDENT, 7, "-5 days", 2400, 31],
      [TEACHER, 4, "-6 days", 1500, 18],
    ];
    for (const [user, di, when, secs, pages] of HISTORY) {
      await client.query(
        `INSERT INTO historique_lectures (id_user, id_document, date_lecture, temps_passe_secondes, pages_consultees)
         VALUES ($1,$2, NOW() + ($3)::interval, $4, $5)`,
        [user, docIds[di], when, secs, pages]
      );
    }

    // ── Notifications ─────────────────────────────────────
    const NOTIFS = [
      ['Bienvenue sur Educated Library', 'Découvrez le catalogue et empruntez vos premiers ouvrages.', 'GENERAL', 'ETUDIANT', null, true],
      ['Nouvelle réservation', 'Un étudiant a réservé « Calculus ».', 'BOOK_RESERVATION', 'BIBLIOTHECAIRE', null, false],
      ['Nouveau ticket de support', 'Un utilisateur a ouvert un ticket d’assistance.', 'SUPPORT_TICKET', 'ADMIN', null, false],
      ['Nouveau document de cours', 'Un enseignant a publié « Polycopié : Analyse 1 ».', 'DOCUMENT_UPLOAD', 'ETUDIANT', null, false],
      ['Emprunt en retard', 'L’emprunt de « Designing Data-Intensive Applications » est en retard.', 'OVERDUE_LOAN', 'BIBLIOTHECAIRE', null, false],
      ['Demande d’emprunt', 'Une nouvelle demande d’emprunt est en attente de validation.', 'BOOK_LOAN_REQUEST', 'BIBLIOTHECAIRE', null, true],
    ];
    for (const [title, message, type, role, rid, read] of NOTIFS) {
      await client.query(
        `INSERT INTO notifications (title, message, type, recipient_role, recipient_id, is_read, read_at, target_url)
         VALUES ($1,$2,$3,$4,$5,$6, ${read ? 'NOW()' : 'NULL'}, '/')`,
        [title, message, type, role, rid, read]
      );
    }

    await client.query('COMMIT');

    const counts = {};
    for (const t of ['ressources', 'livres_physiques', 'documents_numeriques', 'emprunts', 'reservations', 'historique_lectures', 'notifications']) {
      const c = await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
      counts[t] = c.rows[0].n;
    }
    console.log('✅ Données de démonstration insérées.');
    console.table(counts);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Échec, rollback effectué:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
