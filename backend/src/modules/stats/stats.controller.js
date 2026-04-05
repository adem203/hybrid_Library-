const { query } = require('../../config/db');

// ─────────────────────────────────────────────
// GET /api/v1/stats/dashboard
// Tableau de bord général
// ─────────────────────────────────────────────
const getDashboard = async (req, res) => {
  try {
    const [
      empruntsStats,
      stockStats,
      documentsStats,
      retardsCount,
      recentActivity,
    ] = await Promise.all([
      // Stats emprunts
      query(`
        SELECT
          COUNT(*) FILTER (WHERE statut = 'EN_COURS') AS emprunts_actifs,
          COUNT(*) FILTER (WHERE statut = 'EN_ATTENTE') AS demandes_en_attente,
          COUNT(*) FILTER (WHERE statut = 'RETOURNE') AS retours_total,
          COUNT(*) FILTER (WHERE statut IN ('EN_COURS', 'EN_RETARD') AND date_retour_prevue < CURRENT_DATE) AS en_retard
        FROM emprunts
      `),
      // Stats stock livres
      query(`
        SELECT
          COUNT(*) AS nb_livres,
          SUM(stock_total) AS stock_total_global,
          SUM(stock_disponible) AS stock_disponible_global,
          SUM(stock_total - stock_disponible) AS livres_empruntes
        FROM livres_physiques
      `),
      // Stats documents
      query(`
        SELECT
          COUNT(*) AS nb_documents,
          SUM(nb_consultations) AS consultations_totales,
          COUNT(*) FILTER (WHERE format = 'PDF') AS nb_pdf,
          COUNT(*) FILTER (WHERE format = 'MP4') AS nb_videos
        FROM documents_numeriques
      `),
      // Retards
      query(`
        SELECT COUNT(*) FROM emprunts
        WHERE statut IN ('EN_COURS', 'EN_RETARD') AND date_retour_prevue < CURRENT_DATE
      `),
      // Activité récente (10 derniers emprunts)
      query(`
        SELECT
          e.id_emprunt, e.statut, e.date_creation,
          u.nom, u.prenom,
          r.titre
        FROM emprunts e
        INNER JOIN utilisateurs u ON u.id_user = e.id_user
        INNER JOIN ressources r ON r.id_ressource = e.id_livre
        ORDER BY e.date_creation DESC
        LIMIT 10
      `),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        emprunts: empruntsStats.rows[0],
        stock: stockStats.rows[0],
        documents: documentsStats.rows[0],
        retards: parseInt(retardsCount.rows[0].count),
        activite_recente: recentActivity.rows,
      },
    });
  } catch (error) {
    console.error('Erreur getDashboard:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/stats/emprunts
// Statistiques détaillées des emprunts
// ─────────────────────────────────────────────
const getStatsEmprunts = async (req, res) => {
  try {
    const [parStatut, parMois, parCategorie] = await Promise.all([
      // Par statut
      query(`
        SELECT statut, COUNT(*) AS total
        FROM emprunts
        GROUP BY statut
        ORDER BY total DESC
      `),
      // Par mois (12 derniers mois)
      query(`
        SELECT
          TO_CHAR(date_creation, 'YYYY-MM') AS mois,
          COUNT(*) AS total_emprunts
        FROM emprunts
        WHERE date_creation >= NOW() - INTERVAL '12 months'
        GROUP BY mois
        ORDER BY mois ASC
      `),
      // Par catégorie
      query(`
        SELECT
          c.libelle AS categorie,
          COUNT(e.id_emprunt) AS nb_emprunts
        FROM emprunts e
        INNER JOIN ressources r ON r.id_ressource = e.id_livre
        INNER JOIN categories c ON c.id_categorie = r.id_categorie
        GROUP BY c.libelle
        ORDER BY nb_emprunts DESC
        LIMIT 10
      `),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        par_statut: parStatut.rows,
        par_mois: parMois.rows,
        par_categorie: parCategorie.rows,
      },
    });
  } catch (error) {
    console.error('Erreur getStatsEmprunts:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/stats/ressources-populaires
// Top ressources les plus consultées / empruntées
// ─────────────────────────────────────────────
const getRessourcesPopulaires = async (req, res) => {
  try {
    const [topLivres, topDocuments] = await Promise.all([
      // Top livres empruntés
      query(`
        SELECT
          r.id_ressource, r.titre, r.auteur, r.image_couverture,
          c.libelle AS categorie,
          COUNT(e.id_emprunt) AS nb_emprunts
        FROM ressources r
        LEFT JOIN emprunts e ON e.id_livre = r.id_ressource
        LEFT JOIN categories c ON c.id_categorie = r.id_categorie
        WHERE r.type_ressource = 'PHYSIQUE'
        GROUP BY r.id_ressource, c.libelle
        ORDER BY nb_emprunts DESC
        LIMIT 10
      `),
      // Top documents consultés
      query(`
        SELECT
          r.id_ressource, r.titre, r.auteur, r.image_couverture,
          c.libelle AS categorie,
          dn.format, dn.nb_consultations
        FROM ressources r
        INNER JOIN documents_numeriques dn ON dn.id_ressource = r.id_ressource
        LEFT JOIN categories c ON c.id_categorie = r.id_categorie
        ORDER BY dn.nb_consultations DESC
        LIMIT 10
      `),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        top_livres: topLivres.rows,
        top_documents: topDocuments.rows,
      },
    });
  } catch (error) {
    console.error('Erreur getRessourcesPopulaires:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/stats/repartition
// Répartition physique vs numérique
// ─────────────────────────────────────────────
const getRepartition = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        type_ressource,
        COUNT(*) AS total
      FROM ressources
      GROUP BY type_ressource
    `);

    const repartition = {
      physique: 0,
      numerique: 0,
      total: 0,
    };

    result.rows.forEach(row => {
      if (row.type_ressource === 'PHYSIQUE') repartition.physique = parseInt(row.total);
      if (row.type_ressource === 'NUMERIQUE') repartition.numerique = parseInt(row.total);
      repartition.total += parseInt(row.total);
    });

    repartition.pct_physique = repartition.total
      ? Math.round((repartition.physique / repartition.total) * 100)
      : 0;
    repartition.pct_numerique = repartition.total
      ? Math.round((repartition.numerique / repartition.total) * 100)
      : 0;

    return res.status(200).json({ success: true, data: repartition });
  } catch (error) {
    console.error('Erreur getRepartition:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/stats/mes-cours
// Stats de consultation des cours d'un enseignant
// ─────────────────────────────────────────────
const getMesCours = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        r.id_ressource, r.titre, r.date_creation,
        dn.format, dn.taille_ko,
        dn.nb_consultations,
        dn.est_telechargeable,
        COUNT(hl.id) AS nb_lecteurs_uniques
      FROM documents_numeriques dn
      INNER JOIN ressources r ON r.id_ressource = dn.id_ressource
      LEFT JOIN historique_lectures hl ON hl.id_document = dn.id_ressource
      WHERE dn.id_uploade_par = $1
      GROUP BY r.id_ressource, dn.id_ressource
      ORDER BY r.date_creation DESC
    `, [req.user.id_user]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Erreur getMesCours:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = {
  getDashboard,
  getStatsEmprunts,
  getRessourcesPopulaires,
  getRepartition,
  getMesCours,
};