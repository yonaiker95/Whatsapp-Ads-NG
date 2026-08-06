// Capa de seguridad de las API keys.
//
// - Las API keys se cifran en reposo (AES-256-GCM) con una clave maestra
//   derivada de AI_ENC_KEY / SESSION_SECRET. NUNCA se almacenan ni se devuelven
//   en texto plano.
// - La representación pública siempre está enmascarada: `****ABCD`.
// - El formato de la clave se valida por proveedor antes de guardar.
// - Toda mutación/validación queda auditada (ver logAuditEvent).
const crypto = require('crypto');

const MASTER_KEY = (() => {
  const raw = process.env.AI_ENC_KEY || process.env.SESSION_SECRET || 'dev-master-key-do-not-use-in-prod';
  return crypto.createHash('sha256').update(String(raw)).digest();
})();

const ALGO = 'aes-256-gcm';

// ---------------------------------------------------------------------------
// Cifrado / descifrado
// ---------------------------------------------------------------------------
function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function decryptSecret(payload) {
  if (!payload) return null;
  const parts = String(payload).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = crypto.createDecipheriv(ALGO, MASTER_KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Enmascaramiento
// ---------------------------------------------------------------------------
function maskKey(key) {
  const s = String(key || '').trim();
  if (!s) return '';
  if (s.length <= 4) return `****${s}`;
  return `****${s.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Validación de formato
// ---------------------------------------------------------------------------
const KEY_FORMATS = {
  gemini: /^AIza[0-9A-Za-z_-]{20,}$/,
  openai: /^sk-[0-9A-Za-z_-]{20,}$/,
  claude: /^sk-ant-[0-9A-Za-z_-]{20,}$/,
  deepseek: /^sk-[0-9A-Za-z_-]{20,}$/,
  mistral: /^[A-Za-z0-9_]{20,}$/,
  openrouter: /^sk-or-v1-[0-9A-Za-z_-]{20,}$/,
  azure: /^[0-9a-fA-F]{32}$/,
};

const PROVIDER_LABELS = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  openrouter: 'OpenRouter',
  azure: 'Azure OpenAI',
};

function providerLabel(providerId) {
  return PROVIDER_LABELS[providerId] || providerId || 'proveedor';
}

// Devuelve { ok, message? }. Los proveedores sin formato definido siempre pasan.
function validateKeyFormat(providerId, key) {
  const re = KEY_FORMATS[providerId];
  if (!re) return { ok: true };
  if (!key || !String(key).trim()) {
    return { ok: false, message: 'La API Key es requerida para este proveedor' };
  }
  if (!re.test(String(key).trim())) {
    return {
      ok: false,
      message: `El formato de la API Key de ${providerLabel(providerId)} no es válido`,
    };
  }
  return { ok: true };
}

module.exports = {
  encryptSecret,
  decryptSecret,
  maskKey,
  validateKeyFormat,
  providerLabel,
};
