const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const createBrevoError = (message, code, details = {}) => {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
};

const getBrevoConfig = () => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME;
  const missingEnv = [];

  if (!apiKey) missingEnv.push('BREVO_API_KEY');
  if (!senderEmail) missingEnv.push('BREVO_SENDER_EMAIL');
  if (!senderName) missingEnv.push('BREVO_SENDER_NAME');

  if (missingEnv.length > 0) {
    throw createBrevoError('Configuration Brevo manquante.', 'BREVO_CONFIG_MISSING', {
      missingEnv,
    });
  }

  return { apiKey, senderEmail, senderName };
};

const assertBrevoConfig = () => {
  getBrevoConfig();
};

const sendOtpEmail = async ({ toEmail, toName, code, ttlMinutes, subject, intro, outro }) => {
  const { apiKey, senderEmail, senderName } = getBrevoConfig();
  const safeCode = escapeHtml(code);
  const safeName = escapeHtml(toName || toEmail);
  const safeTtl = escapeHtml(ttlMinutes);
  const safeIntro = escapeHtml(intro);
  const safeOutro = escapeHtml(outro);

  if (typeof fetch !== 'function') {
    throw createBrevoError('fetch natif indisponible dans cette version de Node.js.', 'BREVO_FETCH_UNAVAILABLE');
  }

  let response;
  try {
    response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: senderEmail,
          name: senderName,
        },
        to: [
          {
            email: toEmail,
            name: toName || toEmail,
          },
        ],
        subject,
        htmlContent: `
          <p>Bonjour ${safeName},</p>
          <p>${safeIntro}</p>
          <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${safeCode}</p>
          <p>Ce code expire dans ${safeTtl} minutes.</p>
          <p>${safeOutro}</p>
        `,
        textContent: [
          `Bonjour ${toName || toEmail},`,
          '',
          `${intro}`,
          `Code : ${code}`,
          `Ce code expire dans ${ttlMinutes} minutes.`,
          outro,
        ].join('\n'),
      }),
    });
  } catch (error) {
    throw createBrevoError('Impossible de contacter Brevo.', 'BREVO_NETWORK_ERROR', {
      causeMessage: error.message,
    });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw createBrevoError(`Erreur Brevo (${response.status}).`, 'BREVO_API_ERROR', {
      status: response.status,
      responseBody: errorText,
    });
  }
};

const sendPasswordResetCode = ({ toEmail, toName, code, ttlMinutes }) => sendOtpEmail({
  toEmail,
  toName,
  code,
  ttlMinutes,
  subject: 'Code de réinitialisation du mot de passe',
  intro: 'Votre code de réinitialisation du mot de passe est :',
  outro: "Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.",
});

const VERIFICATION_COPY = {
  register: {
    subject: 'Confirmez votre inscription',
    intro: "Voici votre code de confirmation d'inscription :",
    outro: "Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.",
  },
  login: {
    subject: 'Code de connexion',
    intro: 'Voici votre code de connexion :',
    outro: "Si vous n'êtes pas à l'origine de cette connexion, changez votre mot de passe immédiatement.",
  },
};

const sendEmailVerificationCode = ({ toEmail, toName, code, ttlMinutes, purpose }) => {
  const copy = VERIFICATION_COPY[purpose] || VERIFICATION_COPY.login;
  return sendOtpEmail({
    toEmail,
    toName,
    code,
    ttlMinutes,
    subject: copy.subject,
    intro: copy.intro,
    outro: copy.outro,
  });
};

module.exports = { assertBrevoConfig, sendPasswordResetCode, sendEmailVerificationCode };
