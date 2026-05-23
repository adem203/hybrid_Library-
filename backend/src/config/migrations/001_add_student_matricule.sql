-- Add automatic read-only student matricules.
-- Run this once on an existing database before deploying the updated backend.

BEGIN;

ALTER TABLE utilisateurs
ADD COLUMN IF NOT EXISTS matricule VARCHAR(20);

UPDATE utilisateurs
SET matricule = NULL
WHERE matricule IS NOT NULL
  AND BTRIM(matricule) = '';

WITH missing_students AS (
  SELECT
    u.id_user,
    EXTRACT(YEAR FROM COALESCE(u.date_creation, NOW()))::integer AS annee,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM COALESCE(u.date_creation, NOW()))::integer
      ORDER BY u.date_creation, u.id_user
    ) AS rn
  FROM utilisateurs u
  WHERE u.role = 'ETUDIANT'
    AND u.matricule IS NULL
),
existing_max AS (
  SELECT
    m.annee,
    COALESCE(
      MAX((SUBSTRING(u.matricule FROM ('^ETU-' || m.annee || '-([0-9]{4})$')))::integer),
      0
    ) AS max_num
  FROM (SELECT DISTINCT annee FROM missing_students) m
  LEFT JOIN utilisateurs u
    ON u.matricule LIKE ('ETU-' || m.annee || '-%')
  GROUP BY m.annee
)
UPDATE utilisateurs u
SET
  matricule = 'ETU-' || m.annee || '-' || LPAD((e.max_num + m.rn)::text, 4, '0'),
  date_modification = NOW()
FROM missing_students m
INNER JOIN existing_max e ON e.annee = m.annee
WHERE u.id_user = m.id_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_utilisateurs_matricule_unique
ON utilisateurs (matricule)
WHERE matricule IS NOT NULL;

COMMIT;
