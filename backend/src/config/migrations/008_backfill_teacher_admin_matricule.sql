-- Backfill matricules for existing teachers (ENS-YYYY-XXXX) and admins
-- (ADM-YYYY-XXXX, covering both ADMIN and BIBLIOTHECAIRE).
-- Safe to run multiple times: only touches rows where matricule is NULL/empty.
-- Mirrors the pattern of 001_add_student_matricule.sql.

BEGIN;

-- Normalise empty-string matricules to NULL so backfill can pick them up.
UPDATE utilisateurs
SET matricule = NULL
WHERE matricule IS NOT NULL
  AND BTRIM(matricule) = '';

WITH missing_users AS (
  SELECT
    u.id_user,
    CASE u.role
      WHEN 'ENSEIGNANT'      THEN 'ENS'
      WHEN 'ADMIN'           THEN 'ADM'
      WHEN 'BIBLIOTHECAIRE'  THEN 'ADM'
    END AS prefix,
    EXTRACT(YEAR FROM COALESCE(u.date_creation, NOW()))::integer AS annee,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE u.role
          WHEN 'ENSEIGNANT'     THEN 'ENS'
          WHEN 'ADMIN'          THEN 'ADM'
          WHEN 'BIBLIOTHECAIRE' THEN 'ADM'
        END,
        EXTRACT(YEAR FROM COALESCE(u.date_creation, NOW()))::integer
      ORDER BY u.date_creation, u.id_user
    ) AS rn
  FROM utilisateurs u
  WHERE u.role IN ('ENSEIGNANT', 'ADMIN', 'BIBLIOTHECAIRE')
    AND u.matricule IS NULL
),
existing_max AS (
  SELECT
    m.prefix,
    m.annee,
    COALESCE(
      MAX((SUBSTRING(u.matricule FROM ('^' || m.prefix || '-' || m.annee || '-([0-9]{4})$')))::integer),
      0
    ) AS max_num
  FROM (SELECT DISTINCT prefix, annee FROM missing_users) m
  LEFT JOIN utilisateurs u
    ON u.matricule LIKE (m.prefix || '-' || m.annee || '-%')
  GROUP BY m.prefix, m.annee
)
UPDATE utilisateurs u
SET
  matricule = m.prefix || '-' || m.annee || '-' || LPAD((e.max_num + m.rn)::text, 4, '0'),
  date_modification = NOW()
FROM missing_users m
INNER JOIN existing_max e
  ON e.prefix = m.prefix AND e.annee = m.annee
WHERE u.id_user = m.id_user
  AND u.matricule IS NULL;

-- Reuse the existing unique partial index from migration 001 if it is not
-- already in place. No-op if it exists.
CREATE UNIQUE INDEX IF NOT EXISTS idx_utilisateurs_matricule_unique
ON utilisateurs (matricule)
WHERE matricule IS NOT NULL;

COMMIT;
