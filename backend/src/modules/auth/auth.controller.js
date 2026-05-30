const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, getClient } = require('../../config/db');
const { validationResult } = require('express-validator');
const { assertBrevoConfig, sendPasswordResetCode, sendEmailVerificationCode } = require('../../services/brevo.service');

const STUDENT_ROLE = 'ETUDIANT';
const GUEST_ROLE = 'GUEST';
const PUBLIC_REGISTRATION_ROLE = GUEST_ROLE;
const MATRICULE_PREFIXES = Object.freeze({
  ETUDIANT: 'ETU',
  ENSEIGNANT: 'ENS',
  ADMIN: 'ADM',
  BIBLIOTHECAIRE: 'ADM',
});
const USER_EDITABLE_ROLES = ['ETUDIANT', 'ENSEIGNANT'];
const PROTECTED_ADMIN_ROLES = ['ADMIN', 'BIBLIOTHECAIRE'];
const PASSWORD_CHANGE_INTERVAL_DAYS = 30;
const RESET_CODE_GENERIC_MESSAGE = 'Si un compte existe avec cet email, un code de vérification a été envoyé.';
const RESET_CODE_LENGTH = 6;
const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

const isStudentRole = (role) => role === STUDENT_ROLE;

const getMatriculePrefix = (role) => MATRICULE_PREFIXES[role] || null;
const roleNeedsMatricule = (role) => Boolean(getMatriculePrefix(role));

// Stable advisory-lock key per (prefix, year) to serialize sequence generation
// for the same bucket. Falls inside Postgres bigint range and never collides
// with the legacy student-only key shape (which lived around 202600000+year).
const matriculeAdvisoryLockKey = (prefix, year) => {
  const safePrefix = String(prefix).padEnd(4, '_').slice(0, 4);
  let prefixHash = 0;
  for (let i = 0; i < safePrefix.length; i += 1) {
    prefixHash = (prefixHash * 131 + safePrefix.charCodeAt(i)) >>> 0;
  }
  // 0x70000000 keeps the key in a fixed positive range distinct from year-only keys
  return (0x70000000 + (prefixHash % 1000) * 100000 + (year % 100000));
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const normalizePasswordChangePayload = (body) => ({
  currentPassword: body.currentPassword || body.current_password || body.ancien_mot_de_passe,
  newPassword: body.newPassword || body.new_password || body.nouveau_mot_de_passe,
  confirmPassword: body.confirmPassword || body.confirm_password || body.confirm_mot_de_passe,
});

const normalizeEmail = (email = '') => email.trim().toLowerCase();

const normalizeOptionalText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const splitFullName = (value = '') => {
  const parts = String(value).trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (parts.length <= 1) {
    return { prenom: '', nom: parts[0] || '' };
  }
  return {
    prenom: parts.slice(0, -1).join(' '),
    nom: parts[parts.length - 1],
  };
};

const getResetCodeTtlMinutes = () => {
  const ttl = parseInt(process.env.RESET_CODE_TTL_MINUTES || '15', 10);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 15;
};

const generateResetCode = () => crypto
  .randomInt(0, 10 ** RESET_CODE_LENGTH)
  .toString()
  .padStart(RESET_CODE_LENGTH, '0');

const getOtpTtlMinutes = () => {
  const ttl = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 10;
};

const generateOtp = () => crypto
  .randomInt(0, 10 ** OTP_LENGTH)
  .toString()
  .padStart(OTP_LENGTH, '0');

const secondsSince = (date) => (Date.now() - new Date(date).getTime()) / 1000;

const issueAuthToken = (user) => jwt.sign(
  { id_user: user.id_user, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
);

const buildUserResponse = (user) => ({
  id_user: user.id_user,
  nom: user.nom,
  prenom: user.prenom,
  email: user.email,
  role: user.role,
  matricule: user.matricule,
  password_changed_at: user.password_changed_at,
});

const logAuthError = (context, error) => {
  console.error(context, {
    code: error.code,
    message: error.message,
    detail: error.detail,
    constraint: error.constraint,
    missingEnv: error.missingEnv,
    brevoStatus: error.status,
    brevoResponse: error.responseBody,
    causeMessage: error.causeMessage,
  });
};

const getBrevoErrorResponse = (error) => {
  if (error.code === 'BREVO_CONFIG_MISSING' || error.message === 'Configuration Brevo manquante.') {
    return {
      status: 500,
      body: {
        success: false,
        code: 'BREVO_CONFIG_MISSING',
        message: 'Configuration Brevo manquante côté serveur.',
      },
    };
  }
  if (error.code === 'BREVO_API_ERROR') {
    return {
      status: 502,
      body: {
        success: false,
        code: 'BREVO_API_ERROR',
        message: "Brevo a refuse l'envoi du code. Verifiez la cle API, l'expediteur verifie et les logs backend.",
      },
    };
  }
  if (error.code === 'BREVO_NETWORK_ERROR' || error.code === 'BREVO_FETCH_UNAVAILABLE') {
    return {
      status: 502,
      body: {
        success: false,
        code: error.code,
        message: 'Impossible de contacter Brevo depuis le backend. Verifiez la connexion serveur et les logs.',
      },
    };
  }
  return null;
};

const getOtpServerErrorResponse = (error) => {
  const brevo = getBrevoErrorResponse(error);
  if (brevo) return brevo;
  return { status: 500, body: { success: false, message: 'Erreur serveur.' } };
};

const getUserByEmail = async (email, client = null) => {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT id_user, nom, prenom, email
     FROM utilisateurs
     WHERE email = $1`,
    [normalizeEmail(email)]
  );

  return result.rows[0] || null;
};

const getLatestUnusedResetCode = async (userId, client = null, lock = false) => {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT id, code_hash, expires_at, used_at, attempts
     FROM password_reset_codes
     WHERE user_id = $1
       AND used_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 1
     ${lock ? 'FOR UPDATE' : ''}`,
    [userId]
  );

  return result.rows[0] || null;
};

const logResetError = (context, error) => {
  console.error(context, {
    code: error.code,
    message: error.message,
    detail: error.detail,
    hint: error.hint,
    table: error.table,
    constraint: error.constraint,
    missingEnv: error.missingEnv,
    brevoStatus: error.status,
    brevoResponse: error.responseBody,
    causeMessage: error.causeMessage,
  });
};

const ensurePasswordResetStorageAvailable = async () => {
  const result = await query(`
    WITH rels AS (
      SELECT
        to_regclass('public.password_reset_codes') AS table_regclass,
        to_regclass('public.password_reset_codes_id_seq') AS sequence_regclass
    )
    SELECT
      table_regclass IS NOT NULL AS table_exists,
      sequence_regclass IS NOT NULL AS sequence_exists,
      CASE WHEN table_regclass IS NULL THEN FALSE ELSE has_table_privilege(current_user, table_regclass, 'SELECT') END AS can_select,
      CASE WHEN table_regclass IS NULL THEN FALSE ELSE has_table_privilege(current_user, table_regclass, 'INSERT') END AS can_insert,
      CASE WHEN table_regclass IS NULL THEN FALSE ELSE has_table_privilege(current_user, table_regclass, 'UPDATE') END AS can_update,
      CASE WHEN sequence_regclass IS NULL THEN FALSE ELSE has_sequence_privilege(current_user, sequence_regclass, 'USAGE') END AS can_use_sequence
    FROM rels
  `);

  const storage = result.rows[0];
  const isAvailable = storage?.table_exists
    && storage?.sequence_exists
    && storage?.can_select
    && storage?.can_insert
    && storage?.can_update
    && storage?.can_use_sequence;

  if (!isAvailable) {
    const error = new Error('Password reset storage is not writable by the backend database role.');
    error.code = 'PASSWORD_RESET_STORAGE_UNAVAILABLE';
    error.detail = JSON.stringify(storage);
    throw error;
  }
};

const getResetServerErrorResponse = (error) => {
  if (
    error.code === 'PASSWORD_RESET_STORAGE_UNAVAILABLE'
    || error.code === '42P01'
    || error.code === '42501'
    || error.code === '42703'
  ) {
    return {
      status: 500,
      body: {
        success: false,
        code: 'PASSWORD_RESET_STORAGE_ERROR',
        message: 'Configuration serveur incomplète pour la réinitialisation du mot de passe. Vérifiez la table password_reset_codes et ses permissions.',
      },
    };
  }

  if (error.code === 'BREVO_CONFIG_MISSING' || error.message === 'Configuration Brevo manquante.') {
    return {
      status: 500,
      body: {
        success: false,
        code: 'BREVO_CONFIG_MISSING',
        message: 'Configuration Brevo manquante côté serveur.',
      },
    };
  }

  if (error.code === 'BREVO_API_ERROR') {
    return {
      status: 502,
      body: {
        success: false,
        code: 'BREVO_API_ERROR',
        message: "Brevo a refuse l'envoi du code. Verifiez la cle API, l'expediteur verifie et les logs backend.",
      },
    };
  }

  if (error.code === 'BREVO_NETWORK_ERROR' || error.code === 'BREVO_FETCH_UNAVAILABLE') {
    return {
      status: 502,
      body: {
        success: false,
        code: error.code,
        message: 'Impossible de contacter Brevo depuis le backend. Verifiez la connexion serveur et les logs.',
      },
    };
  }

  return {
    status: 500,
    body: { success: false, message: 'Erreur serveur.' },
  };
};

const validateResetCodeForUser = async ({ userId, code, client = null, lock = false }) => {
  const resetCode = await getLatestUnusedResetCode(userId, client, lock);

  if (!resetCode) {
    return { valid: false, message: 'Code invalide ou expiré.' };
  }

  if (new Date(resetCode.expires_at) <= new Date()) {
    return { valid: false, resetCode, message: 'Code invalide ou expiré.' };
  }

  const isCodeValid = await bcrypt.compare(String(code), resetCode.code_hash);
  if (!isCodeValid) {
    const executor = client || { query };
    await executor.query(
      'UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = $1',
      [resetCode.id]
    );
    return { valid: false, resetCode, message: 'Code invalide ou expiré.' };
  }

  return { valid: true, resetCode };
};

const formatMatricule = (prefix, year, sequence) => (
  `${prefix}-${year}-${String(sequence).padStart(4, '0')}`
);

// Generate the next matricule for a given role, scoped per (prefix, year).
// Returns null for roles that do not get a matricule (e.g. GUEST).
const generateMatricule = async (client, role, accountCreationDate = new Date()) => {
  const prefix = getMatriculePrefix(role);
  if (!prefix) return null;

  const year = new Date(accountCreationDate).getFullYear();
  await client.query(
    'SELECT pg_advisory_xact_lock($1::bigint)',
    [matriculeAdvisoryLockKey(prefix, year)]
  );

  // Look across all rows whose matricule matches this (prefix, year) bucket —
  // prefixes are role-disjoint (ADM covers ADMIN + BIBLIOTHECAIRE), so a
  // pattern match is sufficient and avoids gaps when a role moves.
  const result = await client.query(
    `SELECT COALESCE(MAX((substring(matricule FROM $1))::integer), 0) AS max_num
     FROM utilisateurs
     WHERE matricule LIKE $2`,
    [`^${prefix}-${year}-([0-9]{4})$`, `${prefix}-${year}-%`]
  );

  const nextSequence = parseInt(result.rows[0]?.max_num || 0, 10) + 1;
  if (nextSequence > 9999) {
    throw new Error(`Limite annuelle de matricules atteinte pour ${prefix}-${year}.`);
  }

  return formatMatricule(prefix, year, nextSequence);
};

// Back-compat alias — student call sites still read clearer with this name.
const generateStudentMatricule = (client, accountCreationDate = new Date()) =>
  generateMatricule(client, STUDENT_ROLE, accountCreationDate);

const assignMissingMatricule = async (idUser) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT id_user, role, matricule, date_creation
       FROM utilisateurs
       WHERE id_user = $1
       FOR UPDATE`,
      [idUser]
    );

    const user = userResult.rows[0];
    if (!user || !roleNeedsMatricule(user.role) || user.matricule) {
      await client.query('COMMIT');
      return user?.matricule || null;
    }

    const matricule = await generateMatricule(client, user.role, user.date_creation);
    await client.query(
      `UPDATE utilisateurs
       SET matricule = $1, date_modification = NOW()
       WHERE id_user = $2`,
      [matricule, idUser]
    );

    await client.query('COMMIT');
    return matricule;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/register
// Demande d'inscription : stocke la demande et envoie un OTP par email.
// Le compte n'est cree qu'apres verification via /verify-registration.
// ─────────────────────────────────────────────
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  // SECURITY: public self-registration always creates a GUEST account.
  // Any role sent from the client is ignored. STUDENT/TEACHER accounts
  // must be created by staff via POST /auth/users.
  const { nom, prenom, email, mot_de_passe } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const assignedRole = PUBLIC_REGISTRATION_ROLE;
  const ttlMinutes = getOtpTtlMinutes();

  try {
    assertBrevoConfig();

    const existing = await query(
      'SELECT id_user FROM utilisateurs WHERE email = $1',
      [normalizedEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà.',
      });
    }

    const pending = await query(
      'SELECT id, last_sent_at FROM pending_registrations WHERE email = $1',
      [normalizedEmail]
    );
    if (pending.rows.length > 0) {
      const elapsed = secondsSince(pending.rows[0].last_sent_at);
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          success: false,
          code: 'OTP_RATE_LIMITED',
          message: `Veuillez patienter ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s avant de redemander un code.`,
        });
      }
    }

    const hashedPassword = await bcrypt.hash(mot_de_passe, 10);
    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await query(
      `INSERT INTO pending_registrations
         (email, mot_de_passe_hash, nom, prenom, role, code_hash, expires_at, attempts, last_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW())
       ON CONFLICT (email) DO UPDATE
       SET mot_de_passe_hash = EXCLUDED.mot_de_passe_hash,
           nom = EXCLUDED.nom,
           prenom = EXCLUDED.prenom,
           role = EXCLUDED.role,
           code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           last_sent_at = NOW()`,
      [normalizedEmail, hashedPassword, nom, prenom, assignedRole, codeHash, expiresAt]
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`Code d'inscription pour ${normalizedEmail}: ${code}`);
    }

    await sendEmailVerificationCode({
      toEmail: normalizedEmail,
      toName: [prenom, nom].filter(Boolean).join(' ').trim(),
      code,
      ttlMinutes,
      purpose: 'register',
    });

    return res.status(200).json({
      success: true,
      requireOtp: true,
      email: normalizedEmail,
      message: 'Code de vérification envoyé. Vérifiez votre boîte email.',
    });
  } catch (error) {
    logAuthError('Erreur register:', error);
    if (error.code === '23505' && error.constraint?.includes('email')) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe deja.',
      });
    }
    const response = getOtpServerErrorResponse(error);
    return res.status(response.status).json(response.body);
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/verify-registration
// Valide le code OTP et cree le compte definitif.
// ─────────────────────────────────────────────
const verifyRegistration = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, code } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const pendingResult = await client.query(
      `SELECT id, email, mot_de_passe_hash, nom, prenom, role,
              code_hash, expires_at, attempts
       FROM pending_registrations
       WHERE email = $1
       FOR UPDATE`,
      [normalizedEmail]
    );
    const pending = pendingResult.rows[0];

    if (!pending) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      await client.query('ROLLBACK');
      return res.status(429).json({
        success: false,
        code: 'OTP_LOCKED',
        message: 'Trop de tentatives. Demandez un nouveau code.',
      });
    }

    if (new Date(pending.expires_at) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    const codeOk = await bcrypt.compare(String(code), pending.code_hash);
    if (!codeOk) {
      await client.query(
        'UPDATE pending_registrations SET attempts = attempts + 1 WHERE id = $1',
        [pending.id]
      );
      await client.query('COMMIT');
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    const matricule = roleNeedsMatricule(pending.role)
      ? await generateMatricule(client, pending.role)
      : null;

    const insertResult = await client.query(
      `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role, matricule, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id_user, nom, prenom, email, role, matricule, password_changed_at, date_creation, last_login_at`,
      [pending.nom, pending.prenom, pending.email, pending.mot_de_passe_hash, pending.role, matricule]
    );

    await client.query('DELETE FROM pending_registrations WHERE id = $1', [pending.id]);
    await client.query('COMMIT');

    const user = insertResult.rows[0];
    // TEMP DEBUG — remove once login tracking is confirmed in production.
    console.log('[LOGIN TRACKING] route=/auth/verify-registration id_user=%s last_login_at=%s',
      user.id_user, user.last_login_at);
    const token = issueAuthToken(user);

    return res.status(201).json({
      success: true,
      message: 'Compte vérifié et créé avec succès.',
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logAuthError('Erreur verifyRegistration:', error);
    if (error.code === '23505' && error.constraint?.includes('email')) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe deja.',
      });
    }
    if (error.code === '23505' && error.constraint?.includes('matricule')) {
      return res.status(409).json({
        success: false,
        message: 'Impossible de generer un matricule unique. Veuillez reessayer.',
      });
    }
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/resend-registration
// Renvoie un nouveau code pour une inscription en attente.
// ─────────────────────────────────────────────
const resendRegistrationCode = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const normalizedEmail = normalizeEmail(req.body.email);
  const ttlMinutes = getOtpTtlMinutes();

  try {
    assertBrevoConfig();

    const result = await query(
      `SELECT id, nom, prenom, last_sent_at
       FROM pending_registrations
       WHERE email = $1`,
      [normalizedEmail]
    );
    const pending = result.rows[0];

    if (!pending) {
      return res.status(404).json({
        success: false,
        message: 'Aucune inscription en attente pour cet email.',
      });
    }

    const elapsed = secondsSince(pending.last_sent_at);
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      return res.status(429).json({
        success: false,
        code: 'OTP_RATE_LIMITED',
        message: `Veuillez patienter ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s avant de redemander un code.`,
      });
    }

    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await query(
      `UPDATE pending_registrations
       SET code_hash = $1,
           expires_at = $2,
           attempts = 0,
           last_sent_at = NOW()
       WHERE id = $3`,
      [codeHash, expiresAt, pending.id]
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`Code d'inscription (resend) pour ${normalizedEmail}: ${code}`);
    }

    await sendEmailVerificationCode({
      toEmail: normalizedEmail,
      toName: [pending.prenom, pending.nom].filter(Boolean).join(' ').trim(),
      code,
      ttlMinutes,
      purpose: 'register',
    });

    return res.status(200).json({
      success: true,
      message: 'Un nouveau code a été envoyé.',
    });
  } catch (error) {
    logAuthError('Erreur resendRegistrationCode:', error);
    const response = getOtpServerErrorResponse(error);
    return res.status(response.status).json(response.body);
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/login
// Premiere etape : valide email + mot de passe et envoie un OTP par email.
// Le JWT n'est emis qu'apres /verify-login.
// ─────────────────────────────────────────────
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, mot_de_passe } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const ttlMinutes = getOtpTtlMinutes();

  try {
    const result = await query(
      'SELECT * FROM utilisateurs WHERE email = $1',
      [normalizedEmail]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.',
      });
    }

    if (user.est_bloque) {
      return res.status(403).json({
        success: false,
        message: 'Votre compte est bloqué. Contactez le bibliothécaire.',
      });
    }

    const isPasswordValid = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect.',
      });
    }

    assertBrevoConfig();

    const lastOtpResult = await query(
      `SELECT id, last_sent_at FROM login_otps
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [user.id_user]
    );
    if (lastOtpResult.rows.length > 0) {
      const elapsed = secondsSince(lastOtpResult.rows[0].last_sent_at);
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          success: false,
          code: 'OTP_RATE_LIMITED',
          message: `Veuillez patienter ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s avant de redemander un code.`,
        });
      }
    }

    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const otpClient = await getClient();
    try {
      await otpClient.query('BEGIN');
      await otpClient.query(
        `UPDATE login_otps SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id_user]
      );
      await otpClient.query(
        `INSERT INTO login_otps (user_id, code_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id_user, codeHash, expiresAt]
      );
      await otpClient.query('COMMIT');
    } catch (txErr) {
      await otpClient.query('ROLLBACK');
      throw txErr;
    } finally {
      otpClient.release();
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Code de connexion pour ${normalizedEmail}: ${code}`);
    }

    await sendEmailVerificationCode({
      toEmail: user.email,
      toName: [user.prenom, user.nom].filter(Boolean).join(' ').trim(),
      code,
      ttlMinutes,
      purpose: 'login',
    });

    return res.status(200).json({
      success: true,
      requireOtp: true,
      email: normalizedEmail,
      message: 'Code de connexion envoyé. Vérifiez votre boîte email.',
    });
  } catch (error) {
    logAuthError('Erreur login:', error);
    const response = getOtpServerErrorResponse(error);
    return res.status(response.status).json(response.body);
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/verify-login
// Valide l'OTP de connexion et emet le JWT.
// ─────────────────────────────────────────────
const verifyLogin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, code } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT * FROM utilisateurs WHERE email = $1',
      [normalizedEmail]
    );
    const user = userResult.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    if (user.est_bloque) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'Votre compte est bloqué. Contactez le bibliothécaire.',
      });
    }

    const otpResult = await client.query(
      `SELECT id, code_hash, expires_at, attempts
       FROM login_otps
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [user.id_user]
    );
    const otp = otpResult.rows[0];

    if (!otp) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await client.query('ROLLBACK');
      return res.status(429).json({
        success: false,
        code: 'OTP_LOCKED',
        message: 'Trop de tentatives. Demandez un nouveau code.',
      });
    }

    if (new Date(otp.expires_at) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    const codeOk = await bcrypt.compare(String(code), otp.code_hash);
    if (!codeOk) {
      await client.query('UPDATE login_otps SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      await client.query('COMMIT');
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    await client.query('UPDATE login_otps SET used_at = NOW() WHERE id = $1', [otp.id]);
    const loginUpdate = await client.query(
      `UPDATE utilisateurs
       SET last_login_at = NOW(),
           date_modification = NOW()
       WHERE id_user = $1
       RETURNING last_login_at`,
      [user.id_user]
    );
    await client.query('COMMIT');

    // TEMP DEBUG — remove once login tracking is confirmed in production.
    console.log('[LOGIN TRACKING] route=/auth/verify-login id_user=%s rowCount=%s last_login_at=%s',
      user.id_user, loginUpdate.rowCount, loginUpdate.rows[0]?.last_login_at);

    const token = issueAuthToken(user);

    return res.status(200).json({
      success: true,
      message: 'Connexion réussie.',
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logAuthError('Erreur verifyLogin:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/resend-login
// Renvoie un nouveau code de connexion (rate-limited).
// ─────────────────────────────────────────────
const resendLoginCode = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const normalizedEmail = normalizeEmail(req.body.email);
  const ttlMinutes = getOtpTtlMinutes();

  try {
    assertBrevoConfig();

    const userResult = await query(
      'SELECT id_user, nom, prenom, email, est_bloque FROM utilisateurs WHERE email = $1',
      [normalizedEmail]
    );
    const user = userResult.rows[0];
    if (!user || user.est_bloque) {
      return res.status(404).json({
        success: false,
        message: 'Aucun code en attente.',
      });
    }

    const lastOtpResult = await query(
      `SELECT id, last_sent_at FROM login_otps
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [user.id_user]
    );
    if (lastOtpResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucun code en attente. Reconnectez-vous.',
      });
    }

    const elapsed = secondsSince(lastOtpResult.rows[0].last_sent_at);
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      return res.status(429).json({
        success: false,
        code: 'OTP_RATE_LIMITED',
        message: `Veuillez patienter ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s avant de redemander un code.`,
      });
    }

    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE login_otps SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id_user]
      );
      await client.query(
        `INSERT INTO login_otps (user_id, code_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id_user, codeHash, expiresAt]
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Code de connexion (resend) pour ${normalizedEmail}: ${code}`);
    }

    await sendEmailVerificationCode({
      toEmail: user.email,
      toName: [user.prenom, user.nom].filter(Boolean).join(' ').trim(),
      code,
      ttlMinutes,
      purpose: 'login',
    });

    return res.status(200).json({
      success: true,
      message: 'Un nouveau code a été envoyé.',
    });
  } catch (error) {
    logAuthError('Erreur resendLoginCode:', error);
    const response = getOtpServerErrorResponse(error);
    return res.status(response.status).json(response.body);
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/logout
// Enregistre l'horodatage de la déconnexion explicite de l'utilisateur connecté.
// Le JWT reste valide jusqu'à expiration côté serveur ; ce endpoint sert
// uniquement à tracer la date de dernière déconnexion.
// ─────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const result = await query(
      `UPDATE utilisateurs
       SET last_logout_at = NOW(),
           date_modification = NOW()
       WHERE id_user = $1
       RETURNING last_logout_at`,
      [req.user.id_user]
    );

    // TEMP DEBUG — remove once logout tracking is confirmed in production.
    console.log('[LOGOUT TRACKING] route=/auth/logout id_user=%s rowCount=%s last_logout_at=%s',
      req.user.id_user, result.rowCount, result.rows[0]?.last_logout_at);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Déconnexion enregistrée.',
      last_logout_at: result.rows[0].last_logout_at,
    });
  } catch (error) {
    console.error('Erreur logout:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/auth/me
// Obtenir les infos de l'utilisateur connecté
// ─────────────────────────────────────────────
// POST /api/v1/auth/forgot-password
// Demander un code de verification par email
const forgotPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const email = normalizeEmail(req.body.email);
  const ttlMinutes = getResetCodeTtlMinutes();

  try {
    await ensurePasswordResetStorageAvailable();
    assertBrevoConfig();

    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(200).json({
        success: true,
        message: RESET_CODE_GENERIC_MESSAGE,
      });
    }

    const code = generateResetCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const client = await getClient();
    let resetCodeId = null;

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE password_reset_codes
         SET used_at = NOW()
         WHERE user_id = $1
           AND used_at IS NULL`,
        [user.id_user]
      );

      const insertResult = await client.query(
        `INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [user.id_user, codeHash, expiresAt]
      );
      resetCodeId = insertResult.rows[0].id;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Code de reinitialisation pour ${email}: ${code}`);
    }

    try {
      await sendPasswordResetCode({
        toEmail: user.email,
        toName: [user.prenom, user.nom].filter(Boolean).join(' ').trim(),
        code,
        ttlMinutes,
      });
    } catch (emailError) {
      logResetError('Erreur envoi email Brevo:', emailError);
      if (resetCodeId) {
        await query(
          'UPDATE password_reset_codes SET used_at = NOW() WHERE id = $1',
          [resetCodeId]
        ).catch(markUsedError => logResetError('Erreur invalidation code reset apres echec Brevo:', markUsedError));
      }
      throw emailError;
    }

    return res.status(200).json({
      success: true,
      message: RESET_CODE_GENERIC_MESSAGE,
    });
  } catch (error) {
    logResetError('Erreur forgotPassword:', error);
    const response = getResetServerErrorResponse(error);
    return res.status(response.status).json(response.body);
  }
};

// POST /api/v1/auth/verify-reset-code
// Verifier le code sans le consommer
const verifyResetCode = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, code } = req.body;

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    const validation = await validateResetCodeForUser({
      userId: user.id_user,
      code,
    });

    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Code vérifié avec succès.',
    });
  } catch (error) {
    logResetError('Erreur verifyResetCode:', error);
    const response = getResetServerErrorResponse(error);
    return res.status(response.status).json(response.body);
  }
};

// POST /api/v1/auth/reset-password
// Reinitialiser le mot de passe avec un code valide
const resetPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, code, newPassword, confirmPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.',
    });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'La confirmation ne correspond pas au nouveau mot de passe.',
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const user = await getUserByEmail(email, client);
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    const validation = await validateResetCodeForUser({
      userId: user.id_user,
      code,
      client,
      lock: true,
    });

    if (!validation.valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: validation.message });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await client.query(
      `UPDATE utilisateurs
       SET mot_de_passe = $1,
           password_changed_at = NOW(),
           date_modification = NOW()
       WHERE id_user = $2`,
      [hashedPassword, user.id_user]
    );

    await client.query(
      `UPDATE password_reset_codes
       SET used_at = NOW()
       WHERE id = $1`,
      [validation.resetCode.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logResetError('Erreur resetPassword:', error);
    const response = getResetServerErrorResponse(error);
    return res.status(response.status).json(response.body);
  } finally {
    client.release();
  }
};

// GET /api/v1/auth/me
const getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT id_user, nom, prenom, email, role, matricule, est_bloque, password_changed_at, date_creation
       FROM utilisateurs WHERE id_user = $1`,
      [req.user.id_user]
    );

    const user = result.rows[0];
    if (user && roleNeedsMatricule(user.role) && !user.matricule) {
      user.matricule = await assignMissingMatricule(user.id_user);
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Erreur getMe:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/auth/me
// Mettre à jour le profil de l'utilisateur connecté
// Seuls les champs whitelistés peuvent être modifiés.
// Le rôle, le matricule et le mot de passe ne peuvent jamais être modifiés ici.
// ─────────────────────────────────────────────
const updateMe = async (req, res) => {
  const body = req.body || {};
  const rawFullName = body.nom_complet ?? body.nomComplet;
  const rawNom = body.nom;
  const rawPrenom = body.prenom;
  const rawEmail = body.email;

  let nextNom = null;
  let nextPrenom = null;

  if (typeof rawFullName === 'string' && rawFullName.trim()) {
    const split = splitFullName(rawFullName);
    nextNom = split.nom;
    nextPrenom = split.prenom;
  } else {
    if (typeof rawNom === 'string') nextNom = rawNom.trim();
    if (typeof rawPrenom === 'string') nextPrenom = rawPrenom.trim();
  }

  if (!nextNom) {
    return res.status(400).json({ success: false, message: 'Le nom complet est requis.' });
  }

  const nextEmail = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : null;
  if (!nextEmail) {
    return res.status(400).json({ success: false, message: 'Email invalide.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return res.status(400).json({ success: false, message: 'Email invalide.' });
  }

  try {
    const result = await query(
      `UPDATE utilisateurs
       SET nom = $1,
           prenom = $2,
           email = $3,
           date_modification = NOW()
       WHERE id_user = $4
       RETURNING id_user, nom, prenom, email, role, matricule, est_bloque, password_changed_at, date_creation`,
      [nextNom, nextPrenom || '', nextEmail, req.user.id_user]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès.',
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint?.includes('email')) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà.',
      });
    }
    logAuthError('Erreur updateMe:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/auth/change-password
// Changer le mot de passe
// ─────────────────────────────────────────────
const legacyChangePassword = async (req, res) => {
  const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

  try {
    const result = await query(
      'SELECT mot_de_passe FROM utilisateurs WHERE id_user = $1',
      [req.user.id_user]
    );

    const user = result.rows[0];
    const isValid = await bcrypt.compare(ancien_mot_de_passe, user.mot_de_passe);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Ancien mot de passe incorrect.',
      });
    }

    const hashed = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await query(
      'UPDATE utilisateurs SET mot_de_passe = $1, date_modification = NOW() WHERE id_user = $2',
      [hashed, req.user.id_user]
    );

    return res.status(200).json({
      success: true,
      message: 'Mot de passe modifié avec succès.',
    });
  } catch (error) {
    console.error('Erreur changePassword:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/auth/users  (Admin/Biblio seulement)
// Lister tous les utilisateurs
// ─────────────────────────────────────────────
const changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = normalizePasswordChangePayload(req.body);

  if (!currentPassword) {
    return res.status(400).json({ success: false, message: 'Le mot de passe actuel est requis.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Le nouveau mot de passe doit contenir au moins 6 caracteres.',
    });
  }
  if (!confirmPassword) {
    return res.status(400).json({ success: false, message: 'La confirmation du mot de passe est requise.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'La confirmation ne correspond pas au nouveau mot de passe.',
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT id_user, mot_de_passe, role, password_changed_at
       FROM utilisateurs
       WHERE id_user = $1
       FOR UPDATE`,
      [req.user.id_user]
    );

    const user = result.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.mot_de_passe);
    if (!isValid) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Mot de passe actuel incorrect.',
      });
    }

    if (isStudentRole(user.role) && user.password_changed_at) {
      const nextAllowedDate = addDays(user.password_changed_at, PASSWORD_CHANGE_INTERVAL_DAYS);
      if (new Date() < nextAllowedDate) {
        await client.query('ROLLBACK');
        return res.status(429).json({
          success: false,
          code: 'PASSWORD_CHANGE_RATE_LIMITED',
          message: 'Vous pouvez changer votre mot de passe une seule fois par mois.',
          nextAllowedChangeDate: nextAllowedDate.toISOString(),
        });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    const updateResult = await client.query(
      `UPDATE utilisateurs
       SET mot_de_passe = $1,
           password_changed_at = NOW(),
           date_modification = NOW()
       WHERE id_user = $2
       RETURNING password_changed_at`,
      [hashed, req.user.id_user]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Mot de passe modifie avec succes.',
      password_changed_at: updateResult.rows[0].password_changed_at,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erreur changePassword:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { role, bloque, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (role) {
      whereConditions.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (bloque !== undefined) {
      whereConditions.push(`est_bloque = $${paramIndex++}`);
      params.push(bloque === 'true');
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM utilisateurs ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT id_user, nom, prenom, email, role, matricule, est_bloque,
              date_creation, last_login_at, last_logout_at
       FROM utilisateurs ${whereClause}
       ORDER BY date_creation DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Erreur getAllUsers:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

// ─────────────────────────────────────────────
// POST /api/v1/auth/users
// Création directe d'un utilisateur par un admin/bibliothécaire
// ─────────────────────────────────────────────
const createUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const normalizedEmail = normalizeEmail(req.body.email);
  const role = req.body.role;
  const { nom, prenom } = splitFullName(req.body.nom_complet);
  const requestedMatricule = normalizeOptionalText(req.body.matricule);

  if (!USER_EDITABLE_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: 'Rôle invalide.' });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id_user FROM utilisateurs WHERE email = $1',
      [normalizedEmail]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà.',
      });
    }

    const hashedPassword = await bcrypt.hash(req.body.mot_de_passe, 10);
    const matricule = requestedMatricule || (
      roleNeedsMatricule(role) ? await generateMatricule(client, role) : null
    );

    const result = await client.query(
      `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role, matricule)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_user, nom, prenom, email, role, matricule, est_bloque, password_changed_at, date_creation`,
      [nom, prenom, normalizedEmail, hashedPassword, role, matricule]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Utilisateur créé avec succès.',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (error.code === '23505' && error.constraint?.includes('email')) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà.',
      });
    }
    if (error.code === '23505' && error.constraint?.includes('matricule')) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec ce matricule existe déjà.',
      });
    }

    logAuthError('Erreur createUser:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/auth/users/:id
// Modification d'un utilisateur par un admin/bibliothécaire
// ─────────────────────────────────────────────
const updateUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { id } = req.params;
  const normalizedEmail = normalizeEmail(req.body.email);
  const { nom, prenom } = splitFullName(req.body.nom_complet);
  const requestedMatricule = normalizeOptionalText(req.body.matricule);
  const requestedRole = normalizeOptionalText(req.body.role);
  const requestedPassword = normalizeOptionalText(req.body.mot_de_passe);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `SELECT id_user, role, matricule
       FROM utilisateurs
       WHERE id_user = $1
       FOR UPDATE`,
      [id]
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    const isProtectedAdmin = PROTECTED_ADMIN_ROLES.includes(existing.role);
    if (isProtectedAdmin && requestedRole && requestedRole !== existing.role) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Le rôle administrateur ne peut pas être modifié depuis cette interface.',
      });
    }

    const nextRole = isProtectedAdmin ? existing.role : requestedRole;
    if (!isProtectedAdmin && !USER_EDITABLE_ROLES.includes(nextRole)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Rôle invalide.' });
    }

    // Never overwrite an existing matricule; only generate when missing and the role qualifies.
    const matricule = requestedMatricule
      || existing.matricule
      || (roleNeedsMatricule(nextRole) ? await generateMatricule(client, nextRole) : null);

    const params = [nom, prenom, normalizedEmail, nextRole, matricule, id];
    let passwordSetClause = '';
    if (requestedPassword) {
      const hashedPassword = await bcrypt.hash(requestedPassword, 10);
      params.push(hashedPassword);
      passwordSetClause = `, mot_de_passe = $${params.length}, password_changed_at = NOW()`;
    }

    const result = await client.query(
      `UPDATE utilisateurs
       SET nom = $1,
           prenom = $2,
           email = $3,
           role = $4,
           matricule = $5,
           date_modification = NOW()
           ${passwordSetClause}
       WHERE id_user = $6
       RETURNING id_user, nom, prenom, email, role, matricule, est_bloque, password_changed_at, date_creation`,
      params
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Utilisateur modifié avec succès.',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (error.code === '23505' && error.constraint?.includes('email')) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà.',
      });
    }
    if (error.code === '23505' && error.constraint?.includes('matricule')) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec ce matricule existe déjà.',
      });
    }

    logAuthError('Erreur updateUser:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /api/v1/auth/users/:id/bloquer
// Bloquer / débloquer un utilisateur
// ─────────────────────────────────────────────
const toggleBloquerUser = async (req, res) => {
  const { id } = req.params;
  const { bloquer } = req.body; // true ou false

  try {
    const result = await query(
      `UPDATE utilisateurs SET est_bloque = $1, date_modification = NOW()
       WHERE id_user = $2
       RETURNING id_user, nom, prenom, email, matricule, est_bloque`,
      [bloquer, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    return res.status(200).json({
      success: true,
      message: bloquer ? 'Utilisateur bloqué.' : 'Utilisateur débloqué.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur toggleBloquerUser:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};

module.exports = {
  register,
  verifyRegistration,
  resendRegistrationCode,
  login,
  verifyLogin,
  resendLoginCode,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  logout,
  getMe,
  updateMe,
  changePassword,
  getAllUsers,
  createUser,
  updateUser,
  toggleBloquerUser,
};
