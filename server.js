const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');

// Centro de IA: todo acceso a proveedores pasa por IAProvider vía ProviderManager.
const { providerManager } = require('./providers/provider-manager');
const { encryptSecret, decryptSecret, maskKey, validateKeyFormat, providerLabel } = require('./security/api-keys');
const { createGoogleClient } = require('./google');

// ---------------------------------------------------------------------------
// 1. Config
// ---------------------------------------------------------------------------
const dotenv = require('dotenv');
dotenv.config();

// Zona horaria local para timestamps y logs (sobreescribible con TZ en .env/env).
// Debe fijarse antes de cualquier uso de Date.
process.env.TZ = process.env.TZ || 'America/Caracas';

const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST = resolveDist();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@whatsapp-ads.com';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';
let EVO_URL = process.env.EVOLUTION_API_URL || 'http://localhost:3100';
let EVO_KEY = process.env.EVOLUTION_API_KEY || 'evolution_api_7465829274';
let N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_USER = process.env.N8N_BASIC_AUTH_USER || 'admin@whatsapp-ads.com';
const N8N_PASS = process.env.N8N_BASIC_AUTH_PASSWORD || 'Admin123';

// ---------------------------------------------------------------------------
// Instalación (primer arranque / wizard de setup estilo CRM)
// ---------------------------------------------------------------------------
// Marca que el instalador ya se completó. Mientras no exista (o la base de
// datos esté vacía), el servidor arranca en modo setup y solo sirve el wizard.
const SETUP_FILE = path.join(__dirname, 'data', 'setup.json');
let INSTALLED = false;
const INSTANCE_SYNC_MS = parseInt(process.env.INSTANCE_SYNC_INTERVAL_MS || '30000', 10);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Envío automático de campañas programadas: cron ejecutado dentro del contenedor
// (no depende de n8n ni de conexiones externas). Por defecto cada minuto.
const CAMPAIGN_CRON = process.env.CAMPAIGN_CRON || '* * * * *';

// Códigos de verificación por WhatsApp (6 dígitos).
const OTP_TTL_MS = 10 * 60 * 1000;        // validez: 10 min
const OTP_RESEND_MS = 60 * 1000;          // reenvío permitido cada 60s
const OTP_MAX_ATTEMPTS = 5;               // intentos antes de invalidar
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/whatsapp_ads';
const APP_URL = process.env.APP_URL || `http://localhost:4200`;

// Billing / plan mensual
const PLAN_NAME = 'mensual';
const PLAN_AMOUNT = 29.99;
const PLAN_CURRENCY = 'USD';
const TRIAL_DAYS = 30;          // mes de cortesia desde el registro
const GRACE_DAYS = 3;           // dias de gracia tras el vencimiento antes de bloquear
const BILLING_CHECK_MS = 60000; // revisar vencimientos cada minuto

// Planes entre los que el usuario puede hacer upgrade / downgrade por sí mismo.
const CHANGEABLE_PLAN_SLUGS = ['starter', 'profesional'];

// Catálogo de extras (add-ons) que aumentan los límites del plan con costo mensual.
// El monto mensual del usuario = precio del plan base + total de add-ons.
const PLAN_ADDONS = [
  { key: 'extra_instances', label: 'Instancias adicionales', unitLabel: 'instancia', unitAmount: 5 },
  { key: 'extra_messages', label: 'Mensajes adicionales', unitLabel: '1,000 mensajes', unitAmount: 3 },
  { key: 'extra_campaigns', label: 'Campañas adicionales', unitLabel: 'campaña', unitAmount: 2 },
  { key: 'extra_groups', label: 'Grupos adicionales', unitLabel: '100 grupos', unitAmount: 2 },
  { key: 'extra_auto_replies', label: 'Auto-respuestas adicionales', unitLabel: 'auto-respuesta', unitAmount: 1 },
  { key: 'chatbot_ai', label: 'Chatbot con IA', unitLabel: 'activación', unitAmount: 9.99 },
  { key: 'extra_ai_quota', label: 'Cuota de IA extra', unitLabel: '$10 de cuota', unitAmount: 10 },
];

// Cómo suma cada add-on a los límites del plan (0 = ilimitado).
const ADDON_LIMIT_MAP = {
  extra_instances: { field: 'maxInstances', perUnit: 1 },
  extra_messages: { field: 'maxMessages', perUnit: 1000 },
  extra_campaigns: { field: 'maxCampaigns', perUnit: 1 },
  extra_groups: { field: 'maxGroups', perUnit: 100 },
  extra_auto_replies: { field: 'maxAutoReplies', perUnit: 1 },
  chatbot_ai: { field: 'chatbotEnabled', perUnit: null },
  extra_ai_quota: { field: 'aiQuota', perUnit: 10 },
};
const MAX_ADDON_QTY = 99;

// Centro de IA: cuota mensual de consumo por cliente en modo SaaS (USD).
// En modo BYOK el cliente paga su propio proveedor y no cuenta contra esta cuota.
const AI_SAAS_MONTHLY_QUOTA = 20;
// Las peticiones de IA que fallan por un error no relacionado con la
// autenticación igual cuentan contra el consumo.
const AI_USAGE_LOGGING_ENABLED = true;

// Seguridad: cookie secure solo si se sirve por HTTPS
const COOKIE_SECURE = /^https:\/\//.test(process.env.APP_URL || '') || process.env.COOKIE_SECURE === 'true';

function resolveDist() {
  const root = path.join(__dirname, 'dist', 'whatsapp-ads-angular');
  const browser = path.join(root, 'browser');
  return fs.existsSync(browser) ? browser : root;
}

function getAllowedOrigins() {
  const origins = new Set(['http://localhost:4200', 'http://127.0.0.1:4200']);
  if (APP_URL) origins.add(APP_URL.replace(/\/$/, ''));
  origins.add(`http://localhost:${PORT}`);
  origins.add(`http://127.0.0.1:${PORT}`);
  return origins;
}

function getOrigin(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return null;
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Helper HTTP (para llamar a Evolution API / n8n)
// ---------------------------------------------------------------------------
function fetchJson(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { ...headers },
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error || parsed.message || `HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch {
          if (res.statusCode >= 400) {
            const err = new Error(data || `HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            reject(err);
          } else {
            resolve(data);
          }
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// 3. Base de datos
// ---------------------------------------------------------------------------
let pool = new Pool({ connectionString: DB_URL });

// Cliente de Google (OAuth + Sheets/Docs/Calendar) para alimentar el
// conocimiento del bot desde la cuenta de Google de cada instancia.
const googleClient = createGoogleClient({
  getPool: () => pool,
  encryptSecret,
  decryptSecret,
  appUrl: () => APP_URL,
});

async function initDb() {
  const client = await pool.connect();
  try {
    // Detecta si la columna security_sender ya existía antes de migrar (para
    // activar el envío de seguridad en las instancias existentes de admins
    // solo la primera vez; en instalaciones nuevas se crea con DEFAULT FALSE).
    const hadSecuritySender = (await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'instances' AND column_name = 'security_sender'`
    ).catch(() => ({ rows: [] }))).rows.length > 0;
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        permissions TEXT[] DEFAULT '{}',
        organization_id TEXT,
        plan TEXT DEFAULT 'mensual',
        billing_status TEXT DEFAULT 'active',
        billing_period_start TIMESTAMPTZ,
        billing_period_end TIMESTAMPTZ,
        grace_period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner_id TEXT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id TEXT;
      -- Permisos por módulo que un miembro de organización puede tener
      ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT '{}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'mensual';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ;
      -- Teléfono WhatsApp verificado (notificaciones, recuperación y 2FA)
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE;
      -- Códigos de verificación de 6 dígitos enviados por WhatsApp. El campo
      -- token identifica flujos que continúan (2FA y recuperación de contraseña).
      CREATE TABLE IF NOT EXISTS otp_codes (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        token TEXT,
        attempts INT DEFAULT 0,
        used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        consumed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes (phone, purpose, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_otp_token ON otp_codes (token);
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        number TEXT,
        period TEXT,
        amount NUMERIC DEFAULT 29.99,
        status TEXT DEFAULT 'pending',
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        due_date TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id TEXT;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
      CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        type TEXT DEFAULT 'card',
        brand TEXT,
        last4 TEXT,
        exp_month TEXT,
        exp_year TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        email TEXT,
        name TEXT,
        role TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        evolution_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        n8n_url TEXT,
        n8n_api_key TEXT,
        phone TEXT,
        status TEXT DEFAULT 'disconnected',
        evolution_instance_id TEXT,
        user_id TEXT REFERENCES users(id),
        verification_role TEXT DEFAULT 'all',
        security_sender BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE instances ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE instances ADD COLUMN IF NOT EXISTS verification_role TEXT DEFAULT 'all';
      ALTER TABLE instances ADD COLUMN IF NOT EXISTS security_sender BOOLEAN DEFAULT FALSE;
      ALTER TABLE instances ADD COLUMN IF NOT EXISTS integration TEXT DEFAULT 'WHATSAPP-BAILEYS';
      CREATE TABLE IF NOT EXISTS groups_ (
        id TEXT PRIMARY KEY,
        instance_id TEXT REFERENCES instances(id) ON DELETE CASCADE,
        jid TEXT NOT NULL,
        name TEXT,
        description TEXT,
        participants INT DEFAULT 0,
        tags TEXT[] DEFAULT '{}',
        excluded BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(instance_id, jid)
      );
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        content JSONB,
        variables TEXT[] DEFAULT '{}',
        preview TEXT,
        user_id TEXT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'draft',
        active BOOLEAN DEFAULT TRUE,
        scheduled_at TIMESTAMPTZ,
        recurrence TEXT DEFAULT 'none',
        recurrence_config JSONB,
        concurrence INT DEFAULT 1,
        start_time TIME,
        end_time TIME,
        interval_value INT DEFAULT 1,
        interval_unit TEXT DEFAULT 'none',
        template_id TEXT REFERENCES templates(id),
        instance_id TEXT REFERENCES instances(id),
        group_ids TEXT[] DEFAULT '{}',
        tags TEXT[] DEFAULT '{}',
        exclude_tags TEXT[] DEFAULT '{}',
        metrics JSONB,
        total_sent INT DEFAULT 0,
        total_failed INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS send_logs (
        id TEXT PRIMARY KEY,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
        sent INT DEFAULT 0,
        failed INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS message_logs (
        id TEXT PRIMARY KEY,
        instance_id TEXT REFERENCES instances(id) ON DELETE CASCADE,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
        group_jid TEXT,
        group_name TEXT,
        message_key TEXT,
        sender_jid TEXT,
        sender_name TEXT,
        content TEXT,
        message_type TEXT DEFAULT 'text',
        status TEXT DEFAULT 'sent',
        direction TEXT DEFAULT 'outgoing',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        instance_id TEXT REFERENCES instances(id) ON DELETE CASCADE,
        jid TEXT NOT NULL,
        name TEXT,
        last_message TEXT,
        last_message_type TEXT DEFAULT 'text',
        last_message_at TIMESTAMPTZ,
        unread INT DEFAULT 0,
        profile_pic TEXT,
        archived BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(instance_id, jid)
      );
      CREATE TABLE IF NOT EXISTS auto_replies (
        id TEXT PRIMARY KEY,
        instance_id TEXT REFERENCES instances(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        trigger TEXT NOT NULL,
        response TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE auto_replies ADD COLUMN IF NOT EXISTS use_ai BOOLEAN DEFAULT FALSE;
      ALTER TABLE auto_replies ADD COLUMN IF NOT EXISTS ai_instructions TEXT;
      CREATE TABLE IF NOT EXISTS chatbot_configs (
        id TEXT PRIMARY KEY,
        instance_id TEXT UNIQUE REFERENCES instances(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT FALSE,
        system_prompt TEXT DEFAULT 'Eres un vendedor experto de merchandising de WhatsApp Ads System...',
        max_tokens INT DEFAULT 200,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Conocimiento del bot por instancia: el sistema arma el prompt de la IA
      -- combinando la información de la empresa, la lista de precios y el
      -- calendario/disponibilidad junto con el comportamiento (system_prompt).
      ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS company_info TEXT DEFAULT '';
      ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS price_list JSONB DEFAULT '[]';
      ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS calendar TEXT DEFAULT '';
      ALTER TABLE chatbot_configs ADD COLUMN IF NOT EXISTS temperature NUMERIC DEFAULT 0.7;
      -- Documentos del bot (RAG): el chatbot busca en los documentos de la
      -- instancia los fragmentos relevantes a la consulta del cliente y los
      -- inyecta en el prompt. Los embeddings son opcionales (si el proveedor de
      -- IA no expone el endpoint, cae a búsqueda léxica por palabras).
      CREATE TABLE IF NOT EXISTS bot_documents (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT DEFAULT 'stored',
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bot_document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES bot_documents(id) ON DELETE CASCADE,
        instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
        chunk_index INT DEFAULT 0,
        content TEXT NOT NULL,
        embedding JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bot_documents_instance ON bot_documents (instance_id);
      CREATE INDEX IF NOT EXISTS idx_bot_document_chunks_instance ON bot_document_chunks (instance_id);
      CREATE INDEX IF NOT EXISTS idx_bot_document_chunks_document ON bot_document_chunks (document_id);
      -- Bloqueo de usuarios desde el panel del propietario de la organización
      -- (un usuario bloqueado no puede iniciar sesión y pierde sus sesiones).
      ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
      -- Onboarding obligatorio: el usuario debe completar la configuración
      -- inicial (organización, WhatsApp, campaña) antes de usar el panel.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
      -- Auditoría de bloqueos/desbloqueos realizados por el propietario.
      CREATE TABLE IF NOT EXISTS user_block_audit (
        id BIGSERIAL PRIMARY KEY,
        actor_id TEXT NOT NULL,
        actor_name TEXT,
        target_id TEXT NOT NULL,
        target_name TEXT,
        action TEXT NOT NULL CHECK (action IN ('block', 'unblock')),
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_block_audit_created ON user_block_audit (created_at DESC);
      -- Procedencia de cada documento del bot: 'manual' (pegado a mano),
      -- 'sheet' / 'docs' / 'calendar' (importados desde la cuenta de Google).
      ALTER TABLE bot_documents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
      ALTER TABLE bot_documents ADD COLUMN IF NOT EXISTS source_ref TEXT;
      ALTER TABLE bot_documents ADD COLUMN IF NOT EXISTS source_url TEXT;
      -- Conexión OAuth de la cuenta de Google asociada a CADA instancia
      -- (tokens cifrados). Cada WhatsApp conecta su propia cuenta de Google y el
      -- bot lee de ahí su catálogo, documentos y agenda en tiempo real.
      CREATE TABLE IF NOT EXISTS google_connections (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        instance_id TEXT UNIQUE REFERENCES instances(id) ON DELETE CASCADE,
        google_email TEXT NOT NULL,
        access_token_enc TEXT NOT NULL,
        refresh_token_enc TEXT,
        scopes TEXT,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS instance_id TEXT REFERENCES instances(id) ON DELETE CASCADE;
      ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_google_connections_instance ON google_connections (instance_id) WHERE instance_id IS NOT NULL;
      -- Fuentes de Google por instancia: qué hoja de cálculo, documentos y
      -- calendario alimentan al bot (lectura en vivo). Reemplaza a las tablas
      -- de Negocio eliminadas.
      CREATE TABLE IF NOT EXISTS instance_google_sources (
        id TEXT PRIMARY KEY,
        instance_id TEXT UNIQUE REFERENCES instances(id) ON DELETE CASCADE,
        sheet_id TEXT,
        sheet_name TEXT,
        sheet_range TEXT DEFAULT 'A1:Z200',
        doc_ids TEXT[] DEFAULT '{}',
        calendar_id TEXT,
        calendar_days INT DEFAULT 30,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Credenciales OAuth de Google del sistema (Client ID/Secret). Fila única
      -- configurable desde el panel (admin); si no existe, se usan las variables
      -- de entorno GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. El secret va cifrado.
      CREATE TABLE IF NOT EXISTS google_oauth_config (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        client_secret_enc TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Se eliminan las tablas del módulo Negocio (catálogo, inventario,
      -- documentos y agenda) porque toda esa información se lee en vivo de la
      -- cuenta de Google asociada a la instancia.
      DROP TABLE IF EXISTS products CASCADE;
      DROP TABLE IF EXISTS documents CASCADE;
      DROP TABLE IF EXISTS appointments CASCADE;
      -- Auto-respuestas: una regla en modo IA puede alimentarse de un documento
      -- específico de la instancia (la parte del conocimiento que le interese).
      ALTER TABLE auto_replies ADD COLUMN IF NOT EXISTS document_id TEXT;
      CREATE TABLE IF NOT EXISTS chatbot_paused (
        id TEXT PRIMARY KEY,
        instance_id TEXT REFERENCES instances(id) ON DELETE CASCADE,
        sender_jid TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(instance_id, sender_jid)
      );
      -- Metodos de pago configurados por el admin (destinos a donde pagan los usuarios)
      CREATE TABLE IF NOT EXISTS payment_destinations (
        id TEXT PRIMARY KEY,
        type TEXT DEFAULT 'banco',
        custom_type TEXT,
        name TEXT NOT NULL,
        holder TEXT,
        detail TEXT,
        instructions TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Migración: soporte de tipos personalizados en métodos de pago
      ALTER TABLE payment_destinations ADD COLUMN IF NOT EXISTS custom_type TEXT;
      -- Pagos reportados por los usuarios y verificados por el admin
      CREATE TABLE IF NOT EXISTS reported_payments (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        user_name TEXT,
        destination_id TEXT,
        destination_name TEXT,
        amount NUMERIC DEFAULT 29.99,
        reference TEXT,
        payment_date TIMESTAMPTZ,
        status TEXT DEFAULT 'pending',
        note TEXT,
        verified_by TEXT,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Planes del landing (mensual / anual) administrados por el admin
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        description TEXT,
        price_monthly NUMERIC DEFAULT 0,
        price_yearly NUMERIC DEFAULT 0,
        features JSONB DEFAULT '[]',
        cta TEXT DEFAULT 'Empezar',
        popular BOOLEAN DEFAULT FALSE,
        color TEXT DEFAULT '#25D366',
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS name TEXT;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS slug TEXT;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_monthly NUMERIC DEFAULT 0;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_yearly NUMERIC DEFAULT 0;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]';
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS cta TEXT DEFAULT 'Empezar';
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS popular BOOLEAN DEFAULT FALSE;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#25D366';
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
      -- Límites configurables por plan (0 = ilimitado)
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_instances INT DEFAULT 1;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_messages INT DEFAULT 1000;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_campaigns INT DEFAULT 1;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_groups INT DEFAULT 50;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_auto_replies INT DEFAULT 5;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS ai_quota NUMERIC DEFAULT 0;
      -- Add-ons (extras) que el usuario suma a su plan con costo mensual
      CREATE TABLE IF NOT EXISTS user_addons (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        addon_key TEXT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, addon_key)
      );
      -- Catálogo de add-ons: precios configurables por el admin (la cantidad
      -- la elige cada usuario en "Gestionar plan").
      CREATE TABLE IF NOT EXISTS plan_addons (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        unit_label TEXT,
        unit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Testimonios del landing administrados por el admin
      CREATE TABLE IF NOT EXISTS testimonials (
        id TEXT PRIMARY KEY,
        author TEXT NOT NULL,
        role TEXT,
        company TEXT,
        quote TEXT NOT NULL,
        avatar TEXT,
        rating INT DEFAULT 5,
        result TEXT,
        color TEXT DEFAULT '#25D366',
        featured BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS author TEXT;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS role TEXT;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS company TEXT;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS quote TEXT;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS avatar TEXT;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS rating INT DEFAULT 5;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS result TEXT;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#25D366';
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
      -- Centro de IA: configuracion por cliente (SaaS o BYOK). Las API keys
      -- siempre se guardan cifradas; nunca en texto plano.
      CREATE TABLE IF NOT EXISTS ai_configs (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        mode TEXT DEFAULT 'saas',            -- 'saas' | 'byok'
        provider TEXT DEFAULT 'gemini',
        model TEXT,
        api_key_enc TEXT,                    -- cifrada AES-256-GCM (BYOK)
        base_url TEXT,                       -- endpoint (azure/byok)
        organization TEXT,
        project TEXT,
        status TEXT DEFAULT 'not_configured',-- not_configured | connected | error | invalid
        last_error TEXT,
        last_validated_at TIMESTAMPTZ,
        monthly_quota NUMERIC DEFAULT 20,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Centro de IA: claves del sistema (modo SaaS) administradas por el admin
      CREATE TABLE IF NOT EXISTS ai_saas_keys (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        api_key_enc TEXT NOT NULL,           -- cifrada AES-256-GCM
        label TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Centro de IA: consumo registrado por cada solicitud de IA
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT,
        model TEXT,
        mode TEXT,                           -- 'saas' | 'byok'
        action TEXT DEFAULT 'chatbot',       -- chatbot | test | manual
        input_tokens INT DEFAULT 0,
        output_tokens INT DEFAULT 0,
        estimated_cost NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'ok',            -- ok | error | auth_error
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Centro de IA: auditoria de operaciones sobre claves y config
      CREATE TABLE IF NOT EXISTS ai_audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,                -- key_saved | key_rotated | key_validated | key_invalid | connection_failed | quota_blocked | saas_key_set | saas_key_removed
        detail TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // El administrador NO se crea aquí: el wizard de instalación (/setup)
    // lo crea con las credenciales elegidas por el usuario. Si la base ya
    // tenía datos (instalación previa), el admin ya existe.
    // Backfill: da a los usuarios no-admin existentes un periodo mensual activo
    // si no lo tienen.
    await client.query(
      `UPDATE users SET plan = COALESCE(plan, 'mensual'), billing_status = COALESCE(billing_status, 'active'),
       billing_period_start = COALESCE(billing_period_start, NOW()),
       billing_period_end = COALESCE(billing_period_end, NOW() + INTERVAL '30 days')
       WHERE billing_period_end IS NULL`
    );
    // Primera migración de security_sender: las instancias ya existentes de
    // administradores/owners quedan habilitadas como emisoras de seguridad.
    // En instalaciones nuevas la columna nace con DEFAULT FALSE (sin emisor).
    if (!hadSecuritySender) {
      await client.query(
        `UPDATE instances SET security_sender = TRUE
         WHERE user_id IN (SELECT id FROM users WHERE role IN ('admin', 'owner'))`
      ).catch(() => {});
    }
    // Normaliza start_time/end_time de campañas a TIME (hora del día de la
    // ventana de envío). Antes eran TIMESTAMPTZ y la UI los maneja como
    // "HH:MM", lo que rompía la edición y el sentido de la ventana diaria.
    const campaignStartTimeType = (await client.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'start_time'`
    ).catch(() => ({ rows: [] }))).rows[0]?.data_type;
    if (campaignStartTimeType === 'timestamp with time zone') {
      await client.query(
        `ALTER TABLE campaigns ALTER COLUMN start_time TYPE TIME USING start_time::time`
      ).catch(() => {});
      await client.query(
        `ALTER TABLE campaigns ALTER COLUMN end_time TYPE TIME USING end_time::time`
      ).catch(() => {});
    }
    // Seed de los planes del landing (solo si la tabla está vacía)
    const planCount = await client.query('SELECT COUNT(*) AS n FROM plans');
    if (parseInt(planCount.rows[0].n, 10) === 0) {
      const defaults = [
        {
          slug: 'starter', name: 'Starter', description: 'Para empezar y probar la plataforma',
          priceMonthly: 0, priceYearly: 0, color: '#6b7280', cta: 'Empezar gratis', popular: false, sortOrder: 1,
          maxInstances: 1, maxMessages: 1000, maxCampaigns: 1, maxGroups: 50, maxAutoReplies: 5,
          chatbotEnabled: false, aiQuota: 0,
          features: ['1 instancia de WhatsApp', '1,000 mensajes/mes', '1 campaña activa', 'Plantillas básicas',
            'Respuestas automáticas (5)', 'Analytics básico', 'Soporte por email'],
        },
        {
          slug: 'profesional', name: 'Profesional', description: 'Para negocios que escalan en WhatsApp',
          priceMonthly: 49, priceYearly: 39, color: '#25D366', cta: 'Empezar ahora', popular: true, sortOrder: 2,
          maxInstances: 5, maxMessages: 50000, maxCampaigns: 0, maxGroups: 500, maxAutoReplies: 0,
          chatbotEnabled: true, aiQuota: 20,
          features: ['5 instancias de WhatsApp', '50,000 mensajes/mes', 'Campañas ilimitadas',
            'Plantillas avanzadas + variables', 'Respuestas automáticas ilimitadas', 'Chatbot IA incluido',
            'Analytics avanzado + gráficos', 'Bandeja de conversaciones', 'Soporte prioritario (chat)', 'API acceso'],
        },
        {
          slug: 'empresarial', name: 'Empresarial', description: 'Para equipos y agencias con alto volumen',
          priceMonthly: 199, priceYearly: 159, color: '#6c63ff', cta: 'Contactar ventas', popular: false, sortOrder: 3,
          maxInstances: 20, maxMessages: 500000, maxCampaigns: 0, maxGroups: 2000, maxAutoReplies: 0,
          chatbotEnabled: true, aiQuota: 100,
          features: ['20 instancias de WhatsApp', '500,000 mensajes/mes', 'Todo lo de Profesional +',
            'Marca blanca (white-label)', 'Sub-cuentas para clientes', 'Webhooks personalizados', 'SSO / SAML',
            'SLA 99.9%', 'Gerente de cuenta dedicado', 'Onboarding personalizado', 'Soporte 24/7 telefónico'],
        },
      ];
      for (const p of defaults) {
        await client.query(
          `INSERT INTO plans (id, name, slug, description, price_monthly, price_yearly, features, cta, popular, color, is_active, sort_order,
           max_instances, max_messages, max_campaigns, max_groups, max_auto_replies, chatbot_enabled, ai_quota)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (slug) DO NOTHING`,
          [cuid(), p.name, p.slug, p.description, p.priceMonthly, p.priceYearly,
           JSON.stringify(p.features), p.cta, p.popular, p.color, p.sortOrder,
           p.maxInstances, p.maxMessages, p.maxCampaigns, p.maxGroups, p.maxAutoReplies,
           p.chatbotEnabled, p.aiQuota]
        );
      }
    }
    // Actualiza los límites de los planes ya existentes (para que no queden en 0 por defecto)
    await client.query(
      `UPDATE plans SET
         max_instances = CASE slug WHEN 'starter' THEN 1 WHEN 'profesional' THEN 5 WHEN 'empresarial' THEN 20 ELSE max_instances END,
         max_messages = CASE slug WHEN 'starter' THEN 1000 WHEN 'profesional' THEN 50000 WHEN 'empresarial' THEN 500000 ELSE max_messages END,
         max_campaigns = CASE slug WHEN 'starter' THEN 1 WHEN 'profesional' THEN 0 WHEN 'empresarial' THEN 0 ELSE max_campaigns END,
         max_groups = CASE slug WHEN 'starter' THEN 50 WHEN 'profesional' THEN 500 WHEN 'empresarial' THEN 2000 ELSE max_groups END,
         max_auto_replies = CASE slug WHEN 'starter' THEN 5 WHEN 'profesional' THEN 0 WHEN 'empresarial' THEN 0 ELSE max_auto_replies END,
         chatbot_enabled = CASE slug WHEN 'starter' THEN FALSE WHEN 'profesional' THEN TRUE WHEN 'empresarial' THEN TRUE ELSE chatbot_enabled END,
         ai_quota = CASE slug WHEN 'starter' THEN 0 WHEN 'profesional' THEN 20 WHEN 'empresarial' THEN 100 ELSE ai_quota END
       WHERE slug IN ('starter','profesional','empresarial')`
    );
    // Seed del catálogo de add-ons con los precios por defecto (solo si la
    // tabla está vacía, para no pisar precios ya configurados por el admin).
    const addonCount = await client.query('SELECT COUNT(*) AS n FROM plan_addons');
    if (parseInt(addonCount.rows[0].n, 10) === 0) {
      for (const a of PLAN_ADDONS) {
        await client.query(
          `INSERT INTO plan_addons (key, label, unit_label, unit_amount, is_active, sort_order)
           VALUES ($1,$2,$3,$4,TRUE,$5) ON CONFLICT (key) DO NOTHING`,
          [a.key, a.label, a.unitLabel, a.unitAmount, PLAN_ADDONS.indexOf(a) + 1]
        );
      }
    }
    // Seed de los testimonios del landing (solo si la tabla está vacía)
    const testimonialCount = await client.query('SELECT COUNT(*) AS n FROM testimonials');
    if (parseInt(testimonialCount.rows[0].n, 10) === 0) {
      const defaultTestimonials = [
        {
          author: 'María González', role: 'Directora de Marketing', company: 'EcoMarket', avatar: 'MG',
          quote: 'WhatsApp Ads transformó completamente nuestra estrategia de ventas. Pasamos de enviar 200 mensajes manuales al día a más de 5,000 automatizados con una tasa de respuesta del 42%.',
          result: '+340% ventas en 3 meses', color: '#25D366', rating: 5, featured: true, sortOrder: 1,
        },
        {
          author: 'Carlos Ruiz', role: 'CEO', company: 'TechSolutions', avatar: 'CR',
          quote: 'El chatbot con IA nos permite atender consultas 24/7 sin contratar personal adicional. Los leads calificados llegan directo a nuestro CRM listos para cerrar.',
          result: '60% menos tiempo en soporte', color: '#128C7E', rating: 5, featured: false, sortOrder: 2,
        },
        {
          author: 'Ana Martínez', role: 'Gerente de Operaciones', company: 'FashionHub', avatar: 'AM',
          quote: 'La gestión multi-instancia nos permite manejar 3 números de WhatsApp distintos desde un solo panel. La programación de campañas nos ahorra 15 horas semanales.',
          result: 'ROI 12x en campañas', color: '#075E54', rating: 5, featured: false, sortOrder: 3,
        },
        {
          author: 'Pedro López', role: 'Fundador', company: 'AutoPartes Online', avatar: 'PL',
          quote: 'Implementamos respuestas automáticas para FAQs y reducimos el tiempo de primera respuesta de 4 horas a segundos. Nuestros clientes están encantados.',
          result: '98% satisfacción cliente', color: '#6c63ff', rating: 5, featured: false, sortOrder: 4,
        },
        {
          author: 'Sofía Herrera', role: 'Directora de Agencia', company: 'DigitalBoost', avatar: 'SH',
          quote: 'Como agencia, la opción white-label nos permite ofrecer WhatsApp Ads a nuestros clientes bajo nuestra marca. El soporte prioritario es excelente.',
          result: '15 nuevos clientes en 6 meses', color: '#f59e0b', rating: 5, featured: false, sortOrder: 5,
        },
        {
          author: 'Roberto Silva', role: 'Head of Growth', company: 'FitLife', avatar: 'RS',
          quote: 'Los analytics en tiempo real nos permitieron detectar que los jueves a las 7pm teníamos 3x más conversiones. Reprogramamos campañas y duplicamos ventas.',
          result: '2x conversiones en 1 mes', color: '#ef4444', rating: 5, featured: false, sortOrder: 6,
        },
      ];
      for (const t of defaultTestimonials) {
        await client.query(
          `INSERT INTO testimonials (id, author, role, company, quote, avatar, rating, result, color, featured, is_active, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11) ON CONFLICT (id) DO NOTHING`,
          [cuid(), t.author, t.role, t.company, t.quote, t.avatar, t.rating, t.result || null,
           t.color, t.featured, t.sortOrder]
        );
      }
    }
    console.log('Database ready');
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// 4. Sesiones (persistidas en la BD, TTL de 24h o hasta cerrar sesión)
// ---------------------------------------------------------------------------
// En la BD solo se guarda el resumen SHA-256 del id de sesión, de modo que un
// compromiso de la base de datos no pueda reproducirse para secuestrar sesiones
// activas.
const sessionsCache = new Map();
function hashSid(sid) {
  return crypto.createHash('sha256').update(String(sid)).digest('hex');
}

async function createSession(u) {
  const sid = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO sessions (id, user_id, email, name, role, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [hashSid(sid), u.id, u.email, u.name, u.role, expiresAt.toISOString()]
  ).catch(() => {});
  const session = {
    id: u.id, email: u.email, name: u.name, role: u.role, expiresAt: expiresAt.getTime(),
    onboardingCompleted: !!u.onboarding_completed,
    organizationId: u.organization_id || null,
  };
  sessionsCache.set(sid, session);
  return { sid, session };
}

async function getSession(sid) {
  if (!sid) return null;
  let session = sessionsCache.get(sid);
  if (session) {
    if (session.expiresAt < Date.now()) {
      sessionsCache.delete(sid);
      await pool.query('DELETE FROM sessions WHERE id = $1', [hashSid(sid)]).catch(() => {});
      return null;
    }
    return session;
  }
  const res = await pool.query('SELECT * FROM sessions WHERE id = $1', [hashSid(sid)]).catch(() => null);
  if (!res || res.rows.length === 0) return null;
  const s = res.rows[0];
  const expiresAt = new Date(s.expires_at).getTime();
  if (expiresAt < Date.now()) {
    await pool.query('DELETE FROM sessions WHERE id = $1', [hashSid(sid)]).catch(() => {});
    return null;
  }
  session = { id: s.user_id, email: s.email, name: s.name, role: s.role, expiresAt };
  // Añade el estado de onboarding y la organización de la sesión consultando el
  // usuario real: la tabla sessions no guarda estos campos y el rol puede haber
  // cambiado (p. ej. el primer usuario pasa a ser 'owner' tras el onboarding).
  const userRow = (await pool.query(
    'SELECT onboarding_completed, organization_id, role FROM users WHERE id = $1', [s.user_id]
  ).catch(() => ({ rows: [] }))).rows[0];
  if (userRow) {
    session.onboardingCompleted = !!userRow.onboarding_completed;
    session.organizationId = userRow.organization_id || null;
    session.role = userRow.role || session.role;
  } else {
    session.onboardingCompleted = false;
    session.organizationId = null;
  }
  sessionsCache.set(sid, session);
  return session;
}

async function deleteSession(sid) {
  if (!sid) return;
  sessionsCache.delete(sid);
  await pool.query('DELETE FROM sessions WHERE id = $1', [hashSid(sid)]).catch(() => {});
}

// ---------------------------------------------------------------------------
// 5. Helpers
// ---------------------------------------------------------------------------
function parseCookies(req) {
  const cookie = req.headers.cookie || '';
  const result = {};
  cookie.split(';').forEach((c) => {
    const [k, ...v] = c.trim().split('=');
    if (k) result[k.trim()] = v.join('=');
  });
  return result;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

function applyCors(req, res) {
  const origin = getOrigin(req);
  const allowed = getAllowedOrigins();
  const allowOrigin = origin && allowed.has(origin)
    ? origin
    : APP_URL.replace(/\/$/, '');
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

function sendJson(res, status, data, extraHeaders) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

// Define la cookie de sesión con el flag Secure cuando se sirve por HTTPS.
function sessionCookie(sid, maxAgeSeconds) {
  return `session-id=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${COOKIE_SECURE ? '; Secure' : ''}`;
}

async function requireAuth(req, res) {
  const cookies = parseCookies(req);
  const sid = cookies['session-id'];
  const session = await getSession(sid);
  if (!session) {
    sendJson(res, 401, { error: 'No autorizado' });
    return null;
  }
  return session;
}

function cuid() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(12).toString('hex');
  return `c${ts}${rand}`;
}

// Las contraseñas se guardan como scrypt$<salt>$<hash>. Los valores en texto
// plano (legacy) se migran al iniciar sesión correctamente (ver verifyPassword).
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) {
    // Hash legacy en texto plano. Devuelve { ok, legacy } para que el llamador
    // pueda actualizarlo.
    return { ok: stored === String(password), legacy: true };
  }
  const [, salt, hash] = stored.split('$');
  const computed = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { ok: computed === hash, legacy: false };
}

// ---------------------------------------------------------------------------
// Teléfono y códigos de verificación (OTP por WhatsApp)
// ---------------------------------------------------------------------------
function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).trim();
  if (p.startsWith('+')) p = p.slice(1);
  p = p.replace(/[^\d]/g, '');
  if (p.length < 8 || p.length > 15) return null;
  return p;
}

function maskPhone(phone) {
  const p = String(phone || '').replace(/[^\d]/g, '');
  if (p.length <= 4) return '••••';
  return `+${p.slice(0, 2)}•••••${p.slice(-2)}`;
}

function genOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Roles de verificación de una instancia: para qué envíos de código se usa.
const VALID_VERIFICATION_ROLES = ['otp', 'password', 'other', 'all'];

// Permisos por módulo que el propietario puede otorgar a los miembros.
const PERMISSION_LABELS = {
  instances: 'Gestionar instancias',
  campaigns: 'Campañas y envíos',
  templates: 'Plantillas',
  groups: 'Grupos',
  auto_replies: 'Auto-respuestas',
  chatbot: 'Chatbot',
  ai_center: 'Centro de IA',
  reports: 'Reportes y conversaciones',
  billing: 'Facturación y plan',
  organization: 'Organización y equipo',
  messages: 'Envío manual de mensajes',
};
const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS);

// Devuelve solo permisos válidos, sin duplicados.
function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((p) => String(p)).filter((p) => PERMISSION_KEYS.includes(p)))];
}

// El propietario de la organización y los administradores comparten privilegios
// de administración (gestionar planes, pagos, claves, usuarios, etc.).
function isAdminRole(role) {
  return role === 'admin' || role === 'owner';
}

// True solo si la sesión pertenece al propietario (owner) de su organización.
async function isOrgOwner(session) {
  if (!session) return false;
  try {
    const r = await pool.query(
      `SELECT o.owner_id FROM organizations o
       JOIN users u ON u.organization_id = o.id
       WHERE u.id = $1`, [session.id]
    );
    return r.rows.length > 0 && String(r.rows[0].owner_id) === String(session.id);
  } catch {
    return false;
  }
}

// El administrador global y el propietario de la organización siempre tienen acceso.
async function hasPermission(session, perm) {
  if (!perm) return true;
  if (isAdminRole(session.role)) return true;
  const u = (await pool.query('SELECT permissions FROM users WHERE id = $1', [session.id]).catch(() => ({ rows: [] }))).rows[0];
  const perms = u && u.permissions ? u.permissions : [];
  return perms.includes(perm);
}

// Permiso requerido por cada módulo de la API (null = sin restricción).
function permForModule(base) {
  switch (base) {
    case 'instances': return 'instances';
    case 'campaigns': return 'campaigns';
    case 'templates': return 'templates';
    case 'groups': return 'groups';
    case 'auto-replies': return 'auto_replies';
    case 'chatbot': return 'chatbot';
    case 'ai': return 'ai_center';
    case 'metrics':
    case 'analytics':
    case 'conversations': return 'reports';
    case 'billing': return 'billing';
    case 'organizations': return 'organization';
    case 'messages': return 'messages';
    default: return null;
  }
}

// Instancia de Evolution conectada que se usa para enviar los códigos. Solo las
// instancias que el admin/owner marca como emisoras de seguridad
// (security_sender = TRUE) pueden enviar. Además, cada instancia tiene un rol de
// verificación (verification_role): 'otp' (verificación de número/2FA/
// notificaciones), 'password' (recuperación de contraseña), 'other' (otras
// verificaciones) o 'all' (todas). El envío usa EXCLUSIVAMENTE instancias del
// administrador (admin global o propietario de la organización); las de los
// miembros nunca envían códigos de verificación. Se elige la primera conectada
// y habilitada cuyo rol cubra el propósito; si ninguna la cubre, el envío no se
// puede completar y el código queda registrado en el log para desarrollo.
function roleMatches(role, purpose) {
  const r = role || 'all';
  if (r === 'all') return true;
  if (purpose === 'password_reset') return r === 'password';
  return r === 'otp' || r === 'other';
}

async function getOtpSenderInstance(purpose = 'otp') {
  const admins = (await pool.query(
    `SELECT id FROM users WHERE role IN ('admin', 'owner')`
  ).catch(() => ({ rows: [] }))).rows;
  const adminIds = new Set(admins.map((a) => String(a.id)));
  const rows = (await pool.query(
    `SELECT * FROM instances WHERE status = 'connected' AND security_sender = TRUE ORDER BY created_at ASC`
  ).catch(() => ({ rows: [] }))).rows;
  return rows.find((i) => adminIds.has(String(i.user_id)) && roleMatches(i.verification_role, purpose)) || null;
}

async function sendWhatsAppText(instance, number, text) {
  await fetchJson('POST', `${evolutionBaseUrl(instance)}/message/sendText/${evoInstanceName(instance)}`,
    { apikey: instance.api_key }, { number: String(number), text, delay: 0 });
}

// Envía el código por WhatsApp al número. Si no hay instancia conectada con el
// rol adecuado, devuelve delivered:false (el código se loguea para probar en dev).
async function sendOtpByWhatsApp(phone, code, purpose = 'otp') {
  const inst = await getOtpSenderInstance(purpose);
  const text = `WhatsApp Ads: tu código de verificación es ${code}. No lo compartas. Expira en 10 minutos.`;
  if (!inst) {
    console.log(`[OTP] Sin instancia conectada. Código para +${phone}: ${code}`);
    return { delivered: false, code, noInstance: true };
  }
  try {
    await sendWhatsAppText(inst, phone, text);
    return { delivered: true, code };
  } catch (e) {
    console.warn('[OTP] Envío falló a +' + phone + ':', e.message);
    return { delivered: false, code };
  }
}

async function createOtp({ phone, code, purpose, token }) {
  const id = cuid();
  await pool.query(
    `INSERT INTO otp_codes (id, phone, code, purpose, token, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, phone, code, purpose, token || null, new Date(Date.now() + OTP_TTL_MS).toISOString()]
  );
  return id;
}

async function hasRecentOtp(phone, purpose) {
  const row = (await pool.query(
    `SELECT created_at FROM otp_codes WHERE phone = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`, [phone, purpose]
  ).catch(() => ({ rows: [] }))).rows[0];
  if (!row) return false;
  return Date.now() - new Date(row.created_at).getTime() < OTP_RESEND_MS;
}

async function verifyOtpRow(row, code, consume = true) {
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await pool.query('UPDATE otp_codes SET used = TRUE, consumed_at = NOW() WHERE id = $1', [row.id]).catch(() => {});
    return { ok: false, error: 'Demasiados intentos. Solicita un código nuevo.' };
  }
  if (String(row.code).trim() !== String(code || '').trim()) {
    await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]).catch(() => {});
    return { ok: false, error: 'Código incorrecto' };
  }
  if (consume) {
    await pool.query('UPDATE otp_codes SET used = TRUE, consumed_at = NOW() WHERE id = $1', [row.id]).catch(() => {});
  }
  return { ok: true };
}

// Verifica el código SIN consumirlo (el paso final del flujo lo consume).
// Se usa para validar el OTP al completar el sexto dígito en el registro.
async function checkOtpByPhone(phone, code, purpose) {
  const row = (await pool.query(
    `SELECT * FROM otp_codes WHERE phone = $1 AND purpose = $2 AND used = FALSE
     AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
    [phone, purpose]
  ).catch(() => ({ rows: [] }))).rows[0];
  if (!row) return { ok: false, error: 'Código inválido o expirado' };
  return verifyOtpRow(row, code, false);
}

async function verifyOtpByPhone(phone, code, purpose) {
  const row = (await pool.query(
    `SELECT * FROM otp_codes WHERE phone = $1 AND purpose = $2 AND used = FALSE
     AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
    [phone, purpose]
  ).catch(() => ({ rows: [] }))).rows[0];
  if (!row) return { ok: false, error: 'Código inválido o expirado' };
  return verifyOtpRow(row, code);
}

async function verifyOtpByToken(token, code, purpose) {
  if (!token) return { ok: false, error: 'Token inválido' };
  const row = (await pool.query(
    `SELECT * FROM otp_codes WHERE token = $1 AND purpose = $2 AND used = FALSE
     AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
    [token]
  ).catch(() => ({ rows: [] }))).rows[0];
  if (!row) return { ok: false, error: 'La verificación expiró. Vuelve a intentarlo.' };
  return verifyOtpRow(row, code);
}

function getMimeType(ext) {
  const mimes = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.json': 'application/json',
    '.woff': 'font/woff', '.woff2': 'font/woff2',
  };
  return mimes[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// 5b. Instalación / setup
// ---------------------------------------------------------------------------
function readSetupMarker() {
  try {
    return JSON.parse(fs.readFileSync(SETUP_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeSetupMarker(extra = {}) {
  const dir = path.dirname(SETUP_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETUP_FILE, JSON.stringify({
    installed: true,
    installedAt: new Date().toISOString(),
    ...extra,
  }, null, 2));
}

// Actualiza claves del .env en su sitio (mantiene el resto de claves y
// comentarios intactos). Las claves nuevas se agregan al final.
function updateEnvFile(updates) {
  const envPath = path.join(__dirname, '.env');
  let text = '';
  try { text = fs.readFileSync(envPath, 'utf8'); } catch { /* .env ausente */ }
  const updatedKeys = new Set();
  const out = text.split(/\r?\n/).map((line) => {
    const m = line.match(/^([A-Z0-9_]+)\s*=/i);
    if (!m) return line;
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      updatedKeys.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!updatedKeys.has(k)) out.push(`${k}=${v}`);
  }
  fs.writeFileSync(envPath, out.join('\n') + '\n');
}

function buildDbUrl(db) {
  const host = String(db.host || 'localhost').trim();
  const port = String(db.port || '5432').trim();
  const user = encodeURIComponent(String(db.user || 'postgres').trim());
  const password = encodeURIComponent(String(db.password || '').trim());
  const database = String(db.database || 'postgres').trim();
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

function friendlyDbError(e) {
  const msg = String((e && e.message) || e || '').toLowerCase();
  if (msg.includes('ecnrefused') || msg.includes('connect econnrefused') || msg.includes('timeout expired'))
    return 'No se pudo conectar al servidor de base de datos. Revisa host, puerto y que PostgreSQL esté corriendo.';
  if (msg.includes('password authentication failed'))
    return 'Credenciales incorrectas (usuario o contraseña).';
  if (msg.includes('does not exist'))
    return 'La base de datos indicada no existe. Créala o escribe el nombre correcto.';
  if (msg.includes('sasl') || msg.includes('authentication'))
    return 'Fallo de autenticación con PostgreSQL.';
  if (msg.includes('sorry, too many clients'))
    return 'PostgreSQL rechazó la conexión: hay demasiadas conexiones abiertas.';
  return (e && e.message) ? e.message : 'Error desconocido al conectar.';
}

async function probeDb(connectionString) {
  const testPool = new Pool({ connectionString, connectionTimeoutMillis: 6000 });
  try {
    const r = await testPool.query('SELECT 1 AS ok, version()');
    await testPool.end().catch(() => {});
    return { ok: true, version: String(r.rows[0].version).split(' ').slice(0, 2).join(' ') };
  } catch (e) {
    await testPool.end().catch(() => {});
    return { ok: false, error: friendlyDbError(e), code: e && e.code };
  }
}

async function testDbConnection(connectionString) {
  return probeDb(connectionString);
}

// Comprueba si la base de datos objetivo existe o si podrá crearse en el
// instalador (sin crearla todavía: eso ocurre en el paso install).
async function detectDatabaseState(db) {
  const url = buildDbUrl(db);
  const probe = await probeDb(url);
  if (probe.ok) return { ok: true, created: false, version: probe.version };
  if (probe.code === '3D000') {
    return { ok: false, missing: true, created: false, error: friendlyDbError(probe.error), code: probe.code };
  }
  return { ok: false, missing: false, created: false, error: probe.error, code: probe.code };
}

// Garantiza que la base de datos exista. Si no existe, se conecta a la base
// de mantenimiento 'postgres' y ejecuta CREATE DATABASE (requiere permiso
// CREATEDB en el usuario), y luego vuelve a comprobar la conexión objetivo.
async function ensureDatabaseExists(db) {
  const url = buildDbUrl(db);
  const probe = await probeDb(url);
  if (probe.ok) return { ok: true, created: false, version: probe.version };
  if (probe.code !== '3D000') {
    return { ok: false, created: false, error: probe.error, code: probe.code };
  }
  const maintUrl = buildDbUrl({ ...db, database: 'postgres' });
  const maintProbe = await probeDb(maintUrl);
  if (!maintProbe.ok) {
    return {
      ok: false,
      created: false,
      error: `No se pudo conectar al servidor para crear la base de datos: ${maintProbe.error}`,
    };
  }
  const adminPool = new Pool({ connectionString: maintUrl, connectionTimeoutMillis: 6000 });
  try {
    const name = String(db.database || '').trim();
    await adminPool.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } catch (e) {
    return {
      ok: false,
      created: false,
      error: `No se pudo crear la base de datos "${db.database}": ${(e && e.message) || e}`,
    };
  } finally {
    await adminPool.end().catch(() => {});
  }
  const retest = await probeDb(url);
  return { ok: retest.ok, created: true, version: retest.version, error: retest.error, code: retest.code };
}

function handleSetup(req, res, parts) {
  const method = req.method;
  const action = parts[1] || 'status';

  // El asistente solo funciona la primera vez: una vez instalado se bloquea
  // por completo (se conserva únicamente `status` para que la app lo detecte).
  if (INSTALLED && action !== 'status') {
    return sendJson(res, 409, { error: 'La instalación ya está completa. El asistente de instalación solo funciona la primera vez.' });
  }

  if (method === 'GET' && action === 'status') {
    return sendJson(res, 200, { installed: INSTALLED });
  }

  if (method === 'POST' && action === 'db-test') {
    return parseBody(req).then(async (body) => {
      const db = body.db || body;
      const result = await detectDatabaseState(db);
      if (result.ok) {
        return sendJson(res, 200, { ok: true, version: result.version || null });
      }
      if (result.missing) {
        return sendJson(res, 200, {
          ok: false,
          willCreate: true,
          error: 'La base de datos no existe. Se creará automáticamente durante la instalación.',
        });
      }
      return sendJson(res, 200, { ok: false, error: result.error });
    });
  }

  // Prueba de alcance de los servicios externos (Evolution API / n8n).
  if (method === 'POST' && action === 'test-service') {
    return parseBody(req).then(async (body) => {
      const type = String(body.type || '').trim();
      const url = String(body.url || '').trim().replace(/\/+$/, '');
      const apiKey = String(body.apiKey || '').trim();
      if (!url) return sendJson(res, 200, { ok: false, error: 'URL requerida' });
      if (type === 'evolution') {
        try {
          await fetchJson('GET', `${url}/instance/fetchInstances`, { apikey: apiKey });
          return sendJson(res, 200, { ok: true, type });
        } catch (e) {
          if (e.statusCode === 401 || e.statusCode === 403)
            return sendJson(res, 200, { ok: false, error: 'Alcanzable pero la API key no es válida.' });
          if (e.statusCode)
            return sendJson(res, 200, { ok: false, error: `Respuesta inesperada (HTTP ${e.statusCode}). Revisa la URL.` });
          return sendJson(res, 200, { ok: false, error: 'No se pudo alcanzar Evolution API. Revisa la URL.' });
        }
      }
      if (type === 'n8n') {
        try {
          await fetchJson('GET', `${url}/api/v1/workflows`, { 'X-N8N-API-KEY': apiKey });
          return sendJson(res, 200, { ok: true, type });
        } catch (e) {
          if (e.statusCode === 401 || e.statusCode === 403)
            return sendJson(res, 200, { ok: false, error: 'Alcanzable pero la API key de n8n no es válida.' });
          if (e.statusCode)
            return sendJson(res, 200, { ok: false, error: `Respuesta inesperada (HTTP ${e.statusCode}). Revisa la URL.` });
          return sendJson(res, 200, { ok: false, error: 'No se pudo alcanzar n8n. Revisa la URL.' });
        }
      }
      return sendJson(res, 200, { ok: false, error: 'Tipo de servicio inválido.' });
    });
  }

  if (method === 'POST' && action === 'install') {
    if (INSTALLED) return sendJson(res, 409, { error: 'La instalación ya está completa.' });
    return parseBody(req).then(async (body) => {
      const db = body.db || {};
      const evolution = body.evolution || {};
      const n8n = body.n8n || {};
      const admin = body.admin || {};

      const errors = [];
      if (!String(db.host || '').trim()) errors.push('Host de la base de datos requerido.');
      if (!String(db.database || '').trim()) errors.push('Nombre de la base de datos requerido.');
      if (!String(evolution.url || '').trim()) errors.push('URL de Evolution API requerida.');
      if (!String(evolution.apiKey || '').trim()) errors.push('API key de Evolution API requerida.');
      if (!String(n8n.url || '').trim()) errors.push('URL de n8n requerida.');
      if (!String(n8n.apiKey || '').trim()) errors.push('API key de n8n requerida.');
      const email = String(admin.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Correo de administrador inválido.');
      if (!admin.name || !String(admin.name).trim()) errors.push('Nombre del administrador requerido.');
      if (!admin.password || String(admin.password).length < 8) errors.push('La contraseña debe tener al menos 8 caracteres.');
      const phone = normalizePhone(admin.phone);
      if (!phone) errors.push('Número de WhatsApp inválido.');
      if (errors.length) return sendJson(res, 400, { error: errors.join(' '), details: errors });

      const connectionString = buildDbUrl(db);
      const dbReady = await ensureDatabaseExists(db);
      if (!dbReady.ok) {
        return sendJson(res, 400, { error: 'No se pudo preparar la base de datos: ' + (dbReady.error || dbReady.code) });
      }

      const evoUrl = String(evolution.url || EVO_URL || 'http://localhost:3100').trim().replace(/\/+$/, '');
      const evoKey = String(evolution.apiKey || '').trim();
      const n8nUrl = String(n8n.url || N8N_URL || 'http://localhost:5678').trim().replace(/\/+$/, '');
      const n8nKey = String(n8n.apiKey || '').trim();

      // Solo se sobrescriben las claves que el usuario haya rellenado; si una
      // API key se deja vacía se conserva la del .env existente.
      const envUpdates = { DATABASE_URL: connectionString };
      if (evoUrl) envUpdates.EVOLUTION_API_URL = evoUrl;
      if (evoKey) envUpdates.EVOLUTION_API_KEY = evoKey;
      if (n8nUrl) envUpdates.N8N_URL = n8nUrl;
      if (n8nKey) envUpdates.N8N_API_KEY = n8nKey;
      updateEnvFile(envUpdates);
      process.env.DATABASE_URL = connectionString;
      process.env.EVOLUTION_API_URL = evoUrl;
      process.env.EVOLUTION_API_KEY = evoKey || process.env.EVOLUTION_API_KEY;
      process.env.N8N_URL = n8nUrl;
      process.env.N8N_API_KEY = n8nKey || process.env.N8N_API_KEY;
      EVO_URL = evoUrl;
      EVO_KEY = evoKey || EVO_KEY;
      N8N_URL = n8nUrl;

      try {
        await pool.end().catch(() => {});
      } catch { /* ignore */ }
      pool = new Pool({ connectionString });
      await initDb();

      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]).catch(() => ({ rows: [] }));
      let adminId;
      if (existing.rows[0]) {
        adminId = existing.rows[0].id;
        await pool.query(
          `UPDATE users SET role = 'admin', phone = $1, phone_verified = TRUE,
             name = COALESCE(NULLIF($2, ''), name) WHERE id = $3`,
          [phone, String(admin.name).trim(), adminId]
        ).catch(() => {});
      } else {
        adminId = cuid();
        await pool.query(
          `INSERT INTO users (id, email, name, password_hash, role, plan, billing_status,
             phone, phone_verified, billing_period_start, billing_period_end)
           VALUES ($1, $2, $3, $4, 'admin', 'mensual', 'active', $5, TRUE, NOW(), NOW() + INTERVAL '30 days')`,
          [adminId, email, String(admin.name).trim(), hashPassword(admin.password), phone]
        );
      }

      writeSetupMarker({ adminEmail: email });
      INSTALLED = true;
      console.log(`[setup] Instalación completada. Admin: ${email}`);
      return sendJson(res, 200, { ok: true, installed: true, adminEmail: email });
    });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------------------
// 6. Router
// ---------------------------------------------------------------------------
async function handleRequest(req, res, pathname) {
  const method = req.method;
  const parts = pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const base = parts[0] || '';
  const id = parts[1] || '';
  const action = parts[2] || '';

  if (base === 'auth') return handleAuth(req, res, pathname);

  // Wizard de instalación (primer arranque). No exige sesión: mientras no
  // esté instalado el resto de la API no es usable.
  if (base === 'setup') return handleSetup(req, res, parts);

  // Evolution API entrega los webhooks sin cookie de sesión. Se valida la API
  // key de la instancia (header apikey) en su lugar; si no, se cae a la
  // autenticación de sesión normal (usada por herramientas/tests).
  if (base === 'webhooks' && method === 'POST') {
    const wb = await parseBody(req);
    req._webhookBody = wb;
    try {
      if (wb && wb.instance) {
        const wh = await pool.query('SELECT * FROM instances WHERE name = $1', [String(wb.instance)]);
        if (wh.rows.length > 0 && req.headers.apikey === wh.rows[0].api_key) {
          return await handleWebhook(res, wb);
        }
      }
    } catch (e) {
      console.warn('Webhook apikey check error:', e.message);
    }
  }

  // Los workflows de n8n llaman a /api/ai/chatbot-reply para obtener la
  // respuesta generada por el Centro de IA. El header apikey al estilo
  // Evolution mantiene el workflow simple y acotado a la instancia; si no,
  // se cae a la autenticación de sesión (herramientas).
  if (base === 'ai' && id === 'chatbot-reply' && method === 'POST') {
    const wb = req._webhookBody || await parseBody(req);
    req._webhookBody = wb;
    try {
      if (wb && (wb.instanceId || wb.instance)) {
        const wh = wb.instanceId
          ? await pool.query('SELECT * FROM instances WHERE id = $1', [String(wb.instanceId)])
          : await pool.query('SELECT * FROM instances WHERE name = $1', [String(wb.instance)]);
        if (wh.rows.length > 0 && req.headers.apikey === wh.rows[0].api_key) {
          return await chatbotReplyEndpoint(res, wb, null);
        }
      }
    } catch (e) {
      console.warn('chatbot-reply apikey check error:', e.message);
    }
  }

  // Los planes del landing son públicos (marketing): el GET devuelve los
  // planes activos sin sesión. El CRUD (crear/editar/eliminar) exige admin.
  if (base === 'plans' && method === 'GET' && !id) {
    return await getPlans(res, null);
  }

  // Los testimonios del landing también son públicos: el GET devuelve los
  // activos sin sesión. El CRUD exige admin.
  if (base === 'testimonials' && method === 'GET' && !id) {
    return await getTestimonials(res, null);
  }

  // -- Google OAuth callback (llega por redirect del navegador) --
  // Se procesa ANTES de requireAuth: el navegador navega directo a esta URL
  // tras autorizar en Google. La asociación con el usuario se hace mediante el
  // parámetro `state` (ver google.js), así funciona aunque el popup no lleve
  // cookie de sesión. Termina redirigiendo de vuelta a la SPA.
  if (base === 'chatbot' && id === 'google' && action === 'callback') {
    const q = new URL(req.url, `http://${req.headers.host}`);
    return await googleOAuthCallback(res, q);
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    // La sincronización de instancias está disponible para todos los usuarios
    // autenticados (no requiere permiso de módulo): reconcilia únicamente las
    // instancias de la organización del usuario (ver reconcileWithEvolution).
    if (base === 'instances' && method === 'POST' && id === 'sync' && !action) {
      if (!(await ensureBillingActive(res, session))) return;
      return await syncInstances(res, await parseBody(req), session);
    }
    // Permiso por módulo: los miembros solo acceden a los módulos que el
    // propietario les haya concedido. Admin y propietario pasan siempre.
    const requiredPerm = permForModule(base);
    if (requiredPerm && !(await hasPermission(session, requiredPerm))) {
      return sendJson(res, 403, { error: 'No tienes permiso para acceder a este módulo' });
    }
    switch (base) {
      // -- Onboarding obligatorio (cualquier usuario autenticado) --
      case 'onboarding':
        if (method === 'GET' && !id) return await getOnboardingStatus(res, session);
        if (method === 'POST' && id === 'complete') return await completeOnboarding(res, await parseBody(req), session);
        break;

      // -- Planes (solo admin: crear / editar / eliminar) --
      case 'plans':
        if (method === 'GET' && id === 'all') return await getPlans(res, session);
        if (method === 'GET' && id === 'addons') return await getAddonPrices(res, session);
        if (method === 'PUT' && id === 'addons') return await updateAddonPrices(res, await parseBody(req), session);
        if (method === 'POST' && !id) return await createPlan(res, await parseBody(req), session);
        if (method === 'PUT' && id) return await updatePlan(res, id, await parseBody(req), session);
        if (method === 'DELETE' && id) return await deletePlan(res, id, session);
        break;

      // -- Testimonios (solo admin: crear / editar / eliminar) --
      case 'testimonials':
        if (method === 'GET' && id === 'all') return await getTestimonials(res, session);
        if (method === 'POST' && !id) return await createTestimonial(res, await parseBody(req), session);
        if (method === 'PUT' && id) return await updateTestimonial(res, id, await parseBody(req), session);
        if (method === 'DELETE' && id) return await deleteTestimonial(res, id, session);
        break;

      // -- Usuarios registrados (solo el propietario de la organización) --
      case 'users':
        if (method === 'GET' && id === 'audit') return await getUsersAudit(res, session);
        if (method === 'GET' && !id) return await getAdminUsers(res, session);
        if (method === 'GET' && id && !action) return await getAdminUserDetail(res, id, session);
        if (method === 'PUT' && id && !action) return await updateAdminUser(res, id, await parseBody(req), session);
        if (method === 'POST' && id && action === 'block') return await blockUser(res, id, await parseBody(req), session);
        if (method === 'POST' && id && action === 'unblock') return await unblockUser(res, id, session);
        if (method === 'POST' && id && action === 'password-reset') return await sendUserPasswordReset(res, id, session);
        break;

      // -- Organizations --
      case 'organizations':
        if (method === 'POST' && !id) return await createOrganization(res, await parseBody(req), session);
        if (method === 'POST' && id === 'current' && action === 'members')
          return await addOrganizationMember(res, await parseBody(req), session);
        if (method === 'GET' && id === 'current' && action === 'members')
          return await getOrganizationMembers(res, session);
        if (method === 'PUT' && id === 'current' && action === 'members' && parts[3])
          return await updateOrganizationMember(res, parts[3], await parseBody(req), session);
        if (method === 'DELETE' && id === 'current' && action === 'members' && parts[3])
          return await removeOrganizationMember(res, parts[3], session);
        if (method === 'GET' && id === 'current') return await getCurrentOrganization(res, session);
        if (method === 'PUT' && id === 'current') return await updateOrganization(res, await parseBody(req), session);
        break;

      // -- Instances --
      case 'instances':
        if ((method === 'POST' && !id) || (method === 'PUT' && id) || (method === 'DELETE' && id)
          || (method === 'POST' && action === 'sync')) {
          if (!(await ensureBillingActive(res, session))) return;
        }
        if (method === 'GET' && !id) return await getInstances(res, session);
        if (method === 'GET' && id && !action) return await getInstance(res, id, session);
        if (method === 'POST' && !id) return await createInstance(res, await parseBody(req), session);
        if (method === 'PUT' && id) return await updateInstance(res, id, await parseBody(req), session);
        if (method === 'DELETE' && id && action !== 'disconnect') return await deleteInstance(res, id, session);
        if (method === 'POST' && id && action === 'connect') return await connectInstance(res, id, session);
        if (method === 'DELETE' && id && action === 'disconnect') return await disconnectInstance(res, id, session);
        if (method === 'GET' && id && action === 'qrcode') return await getInstanceQr(res, id, session);
        if (method === 'GET' && id && action === 'status') return await getInstanceStatus(res, id, session);
        if (method === 'POST' && action === 'sync') return await syncInstances(res, await parseBody(req), session);
        if (method === 'POST' && id === 'sync' && !action) return await syncInstances(res, await parseBody(req), session);
        break;

      // -- Campaigns --
      case 'campaigns':
        if (method === 'POST' || method === 'PUT' || (method === 'POST' && action === 'send')) {
          if (!(await ensureBillingActive(res, session))) return;
        }
        if (method === 'GET' && !id) return await getCampaigns(res, req, session);
        if (method === 'GET' && id && action !== 'logs' && action !== 'send') return await getCampaign(res, id, session);
        if (method === 'POST' && !id) return await createCampaign(res, await parseBody(req), session);
        if (method === 'PUT' && id) return await updateCampaign(res, id, await parseBody(req), session);
        if (method === 'DELETE' && id) return await deleteCampaign(res, id, session);
        if (method === 'POST' && id && action === 'send') return await sendCampaign(res, id, session);
        if (method === 'GET' && id && action === 'logs') return await getCampaignLogs(res, id, session);
        break;

      // -- Templates --
      case 'templates':
        if (method === 'POST' || method === 'PUT') {
          if (!(await ensureBillingActive(res, session))) return;
        }
        if (method === 'GET' && !id) return await getTemplates(res, session);
        if (method === 'GET' && id) return await getTemplate(res, id, session);
        if (method === 'POST' && !id) return await createTemplate(res, await parseBody(req), session);
        if (method === 'PUT' && id) return await updateTemplate(res, id, await parseBody(req), session);
        if (method === 'DELETE' && id) return await deleteTemplate(res, id, session);
        break;

      // -- Groups --
      case 'groups':
        if (method === 'POST' || method === 'PUT' || (method === 'POST' && id === 'sync')) {
          if (!(await ensureBillingActive(res, session))) return;
        }
        if (method === 'GET' && !id) return await getGroups(res, session);
        if (method === 'GET' && id) return await getGroup(res, id, session);
        if (method === 'POST' && !id) return await createGroup(res, await parseBody(req), session);
        if (method === 'PUT' && id) return await updateGroup(res, id, await parseBody(req), session);
        if (method === 'DELETE' && id) return await deleteGroup(res, id, session);
        if (method === 'POST' && id === 'sync') {
          const bd = await parseBody(req);
          return await syncGroups(res, bd.instanceId, session);
        }
        if (method === 'POST' && id === 'create-remote') {
          const bd = await parseBody(req);
          return await createRemoteGroup(res, bd, session);
        }
        break;

      // -- Chatbot --
      case 'chatbot':
        if (method === 'POST') {
          if (!(await ensureBillingActive(res, session))) return;
        }
        if (method === 'GET' && parts[1] === 'config' && parts[2]) return await getChatbotConfig(res, parts[2], session);
        if (method === 'POST' && parts[1] === 'config') return await saveChatbotConfig(res, await parseBody(req), session);
        if (method === 'POST' && parts[1] === 'pause') return await togglePauseChat(res, await parseBody(req), session);
        if (method === 'GET' && parts[1] === 'paused') return await getPausedChats(res, req, session);
        if (method === 'DELETE' && parts[1] === 'paused') return await removePausedChat(res, req, session);
        if (method === 'GET' && parts[1] === 'documents') return await getChatbotDocuments(res, req, session);
        if (method === 'POST' && parts[1] === 'documents' && parts[2] === 'query')
          return await testChatbotDocumentQuery(res, await parseBody(req), session);
        if (method === 'POST' && parts[1] === 'documents' && !parts[2])
          return await createChatbotDocument(res, await parseBody(req), session);
        if (method === 'DELETE' && parts[1] === 'documents' && parts[2])
          return await deleteChatbotDocument(res, parts[2], session);
        if (parts[1] === 'google')
          return await handleGoogleRoutes(res, req, session, parts.slice(2));
        break;

      // -- Configuración del sistema (solo admin) --
      case 'admin':
        if (id === 'google-config') {
          if (method === 'GET') return await getGoogleOAuthConfig(res, session);
          if (method === 'POST') return await setGoogleOAuthConfig(res, await parseBody(req), session);
          if (method === 'DELETE') return await clearGoogleOAuthConfig(res, session);
        }
        break;

      // -- Auto-replies --
      case 'auto-replies':
        if (method === 'POST' || method === 'PUT') {
          if (!(await ensureBillingActive(res, session))) return;
        }
        if (method === 'GET' && !id) return await getAutoReplies(res, session);
        if (method === 'GET' && id) return await getAutoReply(res, id, session);
        if (method === 'POST' && !id) return await createAutoReply(res, await parseBody(req), session);
        if (method === 'PUT' && id) return await updateAutoReply(res, id, await parseBody(req), session);
        if (method === 'DELETE' && id) return await deleteAutoReply(res, id, session);
        break;

      // -- Billing --
      case 'billing':
        if (method === 'GET' && !id) return await getBillingInfo(res, session);
        if (method === 'GET' && id === 'invoices' && !action) return await getInvoices(res, session);
        if (method === 'POST' && id === 'invoices' && parts[2] && parts[3] === 'pay')
          return await payInvoice(res, parts[2], session);
        // Metodos de pago (destinos configurados por el admin)
        if (method === 'GET' && id === 'payment-destinations' && !action)
          return await getPaymentDestinations(res, session);
        if (method === 'POST' && id === 'payment-destinations' && !action)
          return await createPaymentDestination(res, await parseBody(req), session);
        if (method === 'PUT' && id === 'payment-destinations' && parts[2])
          return await updatePaymentDestination(res, parts[2], await parseBody(req), session);
        if (method === 'DELETE' && id === 'payment-destinations' && parts[2])
          return await deletePaymentDestination(res, parts[2], session);
        // Pagos reportados
        if (method === 'GET' && id === 'reported-payments' && !action)
          return await getReportedPayments(res, session);
        if (method === 'POST' && id === 'reported-payments' && !action)
          return await reportPayment(res, await parseBody(req), session);
        if (method === 'POST' && id === 'reported-payments' && parts[2] && parts[3] === 'verify')
          return await verifyReportedPayment(res, parts[2], session);
        if (method === 'POST' && id === 'reported-payments' && parts[2] && parts[3] === 'reject')
          return await rejectReportedPayment(res, parts[2], await parseBody(req), session);
        // Gestión de plan (upgrade / downgrade) y add-ons
        if (method === 'GET' && id === 'plan' && !action) return await getPlanChangeInfo(res, session);
        if (method === 'POST' && id === 'plan' && action === 'change')
          return await changeUserPlan(res, await parseBody(req), session);
        if (method === 'POST' && id === 'plan' && action === 'addons')
          return await updateUserAddons(res, await parseBody(req), session);
        break;

      // -- Centro de IA --
      case 'ai':
        if (method === 'GET' && !id) return await getAiOverview(res, session);
        if (method === 'GET' && id === 'config') return await getAiConfig(res, session);
        if (method === 'PUT' && id === 'config') return await saveAiConfig(res, await parseBody(req), session);
        if (method === 'POST' && id === 'validate') return await validateAiConnection(res, await parseBody(req), session);
        if (method === 'POST' && id === 'test') return await testAi(res, await parseBody(req), session);
        if (method === 'POST' && id === 'suggest') return await suggestAiReply(res, await parseBody(req), session);
        if (method === 'POST' && id === 'chatbot-reply') return await chatbotReplyEndpoint(res, req._webhookBody || await parseBody(req), session);
        if (method === 'POST' && id === 'rotate-key') return await rotateAiKey(res, await parseBody(req), session);
        if (method === 'GET' && id === 'usage') return await getAiUsage(res, session);
        if (method === 'GET' && id === 'catalogue') return await getAiCatalogue(res, session);
        // Admin: claves del sistema (modo SaaS)
        if (method === 'GET' && id === 'saas-keys') return await getSaaSKeys(res, session);
        if (method === 'POST' && id === 'saas-keys') return await setSaaSKey(res, await parseBody(req), session);
        if (method === 'DELETE' && id === 'saas-keys' && parts[2]) return await deleteSaaSKey(res, parts[2], session);
        break;

      // -- Métricas / Analítica / Conversaciones --
      case 'metrics':
        if (method === 'GET' && id === 'dashboard') return await getDashboardMetrics(res, session);
        break;
      case 'analytics':
        if (method === 'GET' && id === 'campaign' && parts[2]) return await getCampaignAnalytics(res, parts[2], session);
        break;
      case 'conversations':
        if (method === 'GET' && !id) return await getConversations(res, req, session);
        if (method === 'GET' && id === 'history') return await getConversationHistory(res, req, session);
        if (method === 'POST' && id === 'sync') return await syncConversations(res, (await parseBody(req)).instanceId, session);
        break;

      // -- Mensajes (envío) --
      case 'messages':
        if (method === 'POST' && id === 'send') {
          if (!(await ensureBillingActive(res, session))) return;
          return await sendMessage(res, await parseBody(req), session);
        }
        break;

      // -- Webhooks --
      case 'webhooks':
        if (method === 'POST') return await handleWebhook(res, req._webhookBody || await parseBody(req));
        break;
    }
  } catch (error) {
    console.error(`Error ${method} /api/${base}:`, error);
    return sendJson(res, 500, { error: error.message || 'Error interno' });
  }

  sendJson(res, 404, { error: 'Endpoint no encontrado' });
}

// =========================================================================
// 7. Manejadores de autenticación
// =========================================================================
async function handleAuth(req, res, pathname) {
  const cookies = parseCookies(req);
  const sid = cookies['session-id'];
  const session = await getSession(sid);

  if (pathname === '/api/auth/csrf' && req.method === 'GET') {
    return sendJson(res, 200, { csrfToken: crypto.randomBytes(32).toString('hex') });
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await parseBody(req);
    const name = (body.name || '').toString().trim();
    const email = (body.email || '').toString().trim().toLowerCase();
    const password = String(body.password || '');
    const phone = normalizePhone(body.phone);
    const code = String(body.code || '').trim();

    if (!name || name.length < 2) return sendJson(res, 400, { error: 'El nombre es requerido' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Correo electrónico inválido' });
    if (password.length < 6) return sendJson(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres' });
    if (!phone) return sendJson(res, 400, { error: 'Agrega y valida tu número de WhatsApp' });
    const otpCheck = await verifyOtpByPhone(phone, code, 'register');
    if (!otpCheck.ok) return sendJson(res, 400, { error: otpCheck.error });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]).catch(() => null);
    if (existing && existing.rows.length > 0) return sendJson(res, 409, { error: 'Este correo ya está registrado' });
    const phoneTaken = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]).catch(() => null);
    if (phoneTaken && phoneTaken.rows.length > 0) return sendJson(res, 409, { error: 'Ese número de WhatsApp ya está vinculado a otra cuenta' });

    const u = { id: cuid(), email, name, password_hash: hashPassword(password), role: 'user', phone };
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash, role, plan, billing_status, billing_period_start, billing_period_end,
         phone, phone_verified, two_factor_enabled)
       VALUES ($1, $2, $3, $4, $5, 'mensual', 'active', $6, $7, $8, TRUE, FALSE)`,
      [u.id, u.email, u.name, u.password_hash, u.role, now, periodEnd, u.phone]
    );

    const { sid: newSid, session: sess } = await createSession(u);
    res.writeHead(201, {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(newSid, SESSION_TTL_MS / 1000),
    });
    return res.end(JSON.stringify({
      url: '/onboarding',
      expires: new Date(sess.expiresAt).toISOString(),
      user: { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, phoneVerified: true, twoFactorEnabled: false },
    }));
  }

  // Envía el código de 6 dígitos por WhatsApp (validación del número en el
  // registro). Devuelve un teléfono enmascarado; el código viaja por WhatsApp.
  if (pathname === '/api/auth/phone/send-code' && req.method === 'POST') {
    const body = await parseBody(req);
    const phone = normalizePhone(body.phone);
    const purpose = ['register', 'login', 'password_reset', 'notification', 'phone_update'].includes(body.purpose) ? body.purpose : 'register';
    if (!phone) return sendJson(res, 400, { error: 'Número de WhatsApp inválido' });
    // Sin una instancia conectada no se puede entregar el código: se bloquea la
    // activación de OTP en el perfil (validación/cambio de número).
    if (['phone_update', 'notification'].includes(purpose) && !(await getOtpSenderInstance(purpose))) {
      return sendJson(res, 400, {
        error: 'No hay una instancia de WhatsApp conectada. Conecta una en Instancias antes de activar la verificación de tu número.',
      });
    }
    if (await hasRecentOtp(phone, purpose)) {
      return sendJson(res, 429, { error: 'Espera un momento antes de solicitar otro código' });
    }
    const code = genOtpCode();
    await createOtp({ phone, code, purpose });
    const result = await sendOtpByWhatsApp(phone, code, purpose);
    return sendJson(res, 200, {
      data: { sent: true, maskedPhone: maskPhone(phone), delivered: result.delivered },
      success: true,
    });
  }

  // Verifica el código SIN consumirlo (validación al completar el sexto
  // dígito). El flujo final (registro, cambio de teléfono) consume el código.
  if (pathname === '/api/auth/phone/verify' && req.method === 'POST') {
    const body = await parseBody(req);
    const phone = normalizePhone(body.phone);
    const code = String(body.code || '').trim();
    const purpose = ['register', 'password_reset', 'phone_update'].includes(body.purpose) ? body.purpose : 'register';
    if (!phone) return sendJson(res, 400, { error: 'Número de WhatsApp inválido' });
    if (!/^\d{6}$/.test(code)) return sendJson(res, 400, { error: 'Ingresa el código de 6 dígitos' });
    const check = await checkOtpByPhone(phone, code, purpose);
    if (!check.ok) return sendJson(res, 400, { error: check.error });
    return sendJson(res, 200, { data: { verified: true }, success: true });
  }

  if (pathname === '/api/auth/callback/credentials' && req.method === 'POST') {
    const body = await parseBody(req);
    const dbuser = await pool.query('SELECT * FROM users WHERE email = $1', [body.email]).catch(() => null);
    if (dbuser && dbuser.rows.length > 0) {
      const u = dbuser.rows[0];
      const check = verifyPassword(body.password, u.password_hash);
      if (check.ok) {
        // Cuenta bloqueada por el propietario de la organización: se rechaza el
        // acceso incluso con credenciales válidas.
        if (u.blocked) {
          const reason = (u.blocked_reason || '').toString().trim();
          return sendJson(res, 403, {
            error: reason
              ? `Tu cuenta está bloqueada: ${reason}`
              : 'Tu cuenta está bloqueada. Contacta al administrador de la organización.',
          });
        }
        // Actualiza el hash legacy en texto plano al iniciar sesión
        if (check.legacy) {
          await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [hashPassword(body.password), u.id]).catch(() => {});
        }
        // Verificación en dos pasos: primero el código enviado a su WhatsApp.
        if (u.phone_verified && u.two_factor_enabled && u.phone) {
          if (!(await getOtpSenderInstance('login'))) {
            return sendJson(res, 503, {
              error: 'No hay una instancia de WhatsApp conectada para enviar el código de verificación.',
            });
          }
          if (await hasRecentOtp(u.phone, 'login')) {
            return sendJson(res, 429, { error: 'Ya enviamos un código. Revisa tu WhatsApp y espera un momento para reenviar.' });
          }
          const token = crypto.randomBytes(24).toString('hex');
          const code = genOtpCode();
          await createOtp({ phone: u.phone, code, purpose: 'login', token });
          await sendOtpByWhatsApp(u.phone, code, 'login');
          return sendJson(res, 200, {
            data: { requiresTwoFactor: true, token, maskedPhone: maskPhone(u.phone) },
            success: true,
          });
        }
        const { sid: newSid, session: sess } = await createSession(u);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': sessionCookie(newSid, SESSION_TTL_MS / 1000),
        });
        return res.end(JSON.stringify({
          url: '/app/dashboard',
          expires: new Date(sess.expiresAt).toISOString(),
        }));
      }
    }
    return sendJson(res, 401, { error: 'Credenciales inválidas' });
  }

  // Reenvía el código de segundo factor usando el token del inicio de sesión.
  if (pathname === '/api/auth/two-factor/resend' && req.method === 'POST') {
    const body = await parseBody(req);
    const token = String(body.token || '');
    const row = (await pool.query(
      `SELECT * FROM otp_codes WHERE token = $1 AND purpose = 'login' AND used = FALSE
       AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`, [token]
    ).catch(() => ({ rows: [] }))).rows[0];
    if (!row) return sendJson(res, 400, { error: 'La verificación expiró. Vuelve a iniciar sesión.' });
    if (await hasRecentOtp(row.phone, 'login')) {
      return sendJson(res, 429, { error: 'Espera un momento antes de solicitar otro código' });
    }
    const code = genOtpCode();
    await pool.query(
      'UPDATE otp_codes SET code = $1, attempts = 0, expires_at = $2 WHERE id = $3',
      [code, new Date(Date.now() + OTP_TTL_MS).toISOString(), row.id]
    ).catch(() => {});
    await sendOtpByWhatsApp(row.phone, code, 'login');
    return sendJson(res, 200, { data: { sent: true, maskedPhone: maskPhone(row.phone) }, success: true });
  }

  // Segundo factor: completa el inicio de sesión con el código enviado a WhatsApp.
  if (pathname === '/api/auth/two-factor/verify' && req.method === 'POST') {    const body = await parseBody(req);
    const token = String(body.token || '');
    const code = String(body.code || '').trim();
    const row = (await pool.query(
      `SELECT * FROM otp_codes WHERE token = $1 AND purpose = 'login' AND used = FALSE
       AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`, [token]
    ).catch(() => ({ rows: [] }))).rows[0];
    if (!row) return sendJson(res, 400, { error: 'La verificación expiró. Vuelve a iniciar sesión.' });
    const check = await verifyOtpRow(row, code);
    if (!check.ok) return sendJson(res, 400, { error: check.error });
    const user = (await pool.query(
      'SELECT * FROM users WHERE phone = $1 ORDER BY created_at DESC LIMIT 1', [row.phone]
    ).catch(() => ({ rows: [] }))).rows[0];
    if (!user) return sendJson(res, 404, { error: 'Usuario no encontrado' });
    if (user.blocked) {
      const reason = (user.blocked_reason || '').toString().trim();
      return sendJson(res, 403, {
        error: reason
          ? `Tu cuenta está bloqueada: ${reason}`
          : 'Tu cuenta está bloqueada. Contacta al administrador de la organización.',
      });
    }
    const { sid: newSid, session: sess } = await createSession(user);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(newSid, SESSION_TTL_MS / 1000),
    });
    return res.end(JSON.stringify({
      url: '/app/dashboard',
      expires: new Date(sess.expiresAt).toISOString(),
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        phone: user.phone, phoneVerified: !!user.phone_verified, twoFactorEnabled: !!user.two_factor_enabled,
      },
    }));
  }

  // Recuperación de contraseña: envía el código por WhatsApp al teléfono
  // verificado de la cuenta.
  if (pathname === '/api/auth/forgot/send' && req.method === 'POST') {
    const body = await parseBody(req);
    const email = (body.email || '').toString().trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Correo electrónico inválido' });
    const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email]).catch(() => ({ rows: [] }))).rows[0];
    if (!user) return sendJson(res, 404, { error: 'No existe una cuenta con ese correo' });
    if (!user.phone || !user.phone_verified) {
      return sendJson(res, 400, { error: 'Tu cuenta no tiene un número de WhatsApp verificado. Contacta al administrador.' });
    }
    if (await hasRecentOtp(user.phone, 'password_reset')) {
      return sendJson(res, 429, { error: 'Ya enviamos un código. Revisa tu WhatsApp y espera un momento para reenviar.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const code = genOtpCode();
    await createOtp({ phone: user.phone, code, purpose: 'password_reset', token });
    await sendOtpByWhatsApp(user.phone, code, 'password_reset');
    return sendJson(res, 200, { data: { sent: true, token, maskedPhone: maskPhone(user.phone) }, success: true });
  }

  // Restablece la contraseña con el código recibido por WhatsApp.
  if (pathname === '/api/auth/forgot/reset' && req.method === 'POST') {
    const body = await parseBody(req);
    const token = String(body.token || '');
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    if (password.length < 6) return sendJson(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres' });
    const row = (await pool.query(
      `SELECT * FROM otp_codes WHERE token = $1 AND purpose = 'password_reset' AND used = FALSE
       AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`, [token]
    ).catch(() => ({ rows: [] }))).rows[0];
    if (!row) return sendJson(res, 400, { error: 'La verificación expiró. Solicita un nuevo código.' });
    const check = await verifyOtpRow(row, code);
    if (!check.ok) return sendJson(res, 400, { error: check.error });
    const user = (await pool.query(
      'SELECT * FROM users WHERE phone = $1 ORDER BY created_at DESC LIMIT 1', [row.phone]
    ).catch(() => ({ rows: [] }))).rows[0];
    if (!user) return sendJson(res, 404, { error: 'Usuario no encontrado' });
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashPassword(password), user.id]);
    return sendJson(res, 200, { data: { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' }, success: true });
  }

  // Actualiza preferencias de seguridad/notificaciones (requiere sesión).
  if (pathname === '/api/auth/settings' && req.method === 'POST') {
    if (!session) return sendJson(res, 401, { error: 'No autorizado' });
    const body = await parseBody(req);
    const fields = [];
    const values = [];
    if (typeof body.twoFactorEnabled === 'boolean') {
      if (body.twoFactorEnabled) {
        const user = (await pool.query(
          'SELECT phone, phone_verified FROM users WHERE id = $1', [session.id]
        ).catch(() => ({ rows: [] }))).rows[0];
        if (!user || !user.phone_verified) {
          return sendJson(res, 400, { error: 'Para activar la verificación en dos pasos primero valida tu número de WhatsApp' });
        }
        if (!(await getOtpSenderInstance('otp'))) {
          return sendJson(res, 400, {
            error: 'No hay una instancia de WhatsApp conectada. No se puede activar la verificación en dos pasos.',
          });
        }
      }
      fields.push(`two_factor_enabled = $${fields.length + 1}`);
      values.push(body.twoFactorEnabled);
    }
    if (typeof body.notificationsEnabled === 'boolean') {
      fields.push(`notifications_enabled = $${fields.length + 1}`);
      values.push(body.notificationsEnabled);
    }
    if (fields.length === 0) return sendJson(res, 400, { error: 'Sin cambios' });
    values.push(session.id);
    await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
      values
    );
    return sendJson(res, 200, { data: { message: 'Preferencias actualizadas' }, success: true });
  }

  // Cambia/valida el número de WhatsApp del usuario autenticado.
  if (pathname === '/api/auth/phone' && req.method === 'PUT') {
    if (!session) return sendJson(res, 401, { error: 'No autorizado' });
    const body = await parseBody(req);
    const phone = normalizePhone(body.phone);
    const code = String(body.code || '').trim();
    if (!phone) return sendJson(res, 400, { error: 'Número de WhatsApp inválido' });
    const check = await verifyOtpByPhone(phone, code, 'phone_update');
    if (!check.ok) return sendJson(res, 400, { error: check.error });
    const existing = (await pool.query(
      'SELECT id FROM users WHERE phone = $1 AND id <> $2', [phone, session.id]
    ).catch(() => ({ rows: [] }))).rows[0];
    if (existing) return sendJson(res, 409, { error: 'Ese número ya está registrado' });
    await pool.query(
      'UPDATE users SET phone = $1, phone_verified = TRUE, updated_at = NOW() WHERE id = $2',
      [phone, session.id]
    );
    return sendJson(res, 200, { data: { phone, phoneVerified: true }, success: true });
  }

  if (pathname === '/api/auth/session' && req.method === 'GET') {
    if (session) {
      const userRow = (await pool.query(
        'SELECT phone, phone_verified, two_factor_enabled, notifications_enabled, permissions, onboarding_completed, organization_id FROM users WHERE id = $1', [session.id]
      ).catch(() => ({ rows: [] }))).rows[0] || {};
      return sendJson(res, 200, {
        user: {
          id: session.id, name: session.name, email: session.email, role: session.role,
          phone: userRow.phone || null,
          phoneVerified: !!userRow.phone_verified,
          twoFactorEnabled: !!userRow.two_factor_enabled,
          notificationsEnabled: userRow.notifications_enabled !== false,
          onboardingCompleted: userRow.onboarding_completed !== false,
          organizationId: userRow.organization_id || null,
          permissions: userRow.permissions || [],
        },
        expires: new Date(session.expiresAt).toISOString(),
      });
    }
    return sendJson(res, 200, {});
  }

  if (pathname === '/api/auth/signout' && req.method === 'GET') {
    await deleteSession(sid);
    res.writeHead(302, {
      'Set-Cookie': `session-id=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`,
      'Location': '/auth/login',
    });
    return res.end();
  }

  return sendJson(res, 404, { error: 'Not found' });
}

// =========================================================================
// 8. Organizaciones
// =========================================================================
async function getCurrentOrganization(res, session) {
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [session.id]).catch(() => null);
  const userId = user && user.rows.length > 0 ? user.rows[0].id : session.id;
  const orgId = user && user.rows[0].organization_id;
  let org = null;
  if (orgId) {
    org = (await pool.query('SELECT * FROM organizations WHERE id = $1', [orgId]).catch(() => ({ rows: [] }))).rows[0] || null;
  }
  if (!org) {
    // Fallback: cualquier organización propiedad de este usuario
    org = (await pool.query('SELECT * FROM organizations WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]).catch(() => ({ rows: [] }))).rows[0] || null;
  }
  sendJson(res, 200, { data: org ? enrichOrganization(org, userId) : null, success: true });
}

async function createOrganization(res, body, session) {
  const name = (body.name || '').toString().trim();
  const description = (body.description || '').toString().trim();
  if (!name) return sendJson(res, 400, { error: 'El nombre de la organización es requerido' });

  const existing = await pool.query('SELECT * FROM organizations WHERE owner_id = $1', [session.id]).catch(() => ({ rows: [] }));
  if (existing.rows.length > 0) return sendJson(res, 400, { error: 'Ya tienes una organización' });

  const id = cuid();
  await pool.query(
    'INSERT INTO organizations (id, name, description, owner_id) VALUES ($1, $2, $3, $4)',
    [id, name, description, session.id]
  );
  await pool.query('UPDATE users SET organization_id = $1, role = $2, updated_at = NOW() WHERE id = $3',
    [id, 'owner', session.id]);
  const org = (await pool.query('SELECT * FROM organizations WHERE id = $1', [id])).rows[0];
  sendJson(res, 201, { data: enrichOrganization(org, session.id), success: true });
}

// =========================================================================
// 8c. Onboarding obligatorio
// =========================================================================
async function getOnboardingStatus(res, session) {
  // El administrador global está exento del onboarding: nunca crea ni se une a
  // una organización y conserva su rol.
  if (session.role === 'admin') {
    return sendJson(res, 200, {
      data: { completed: true, hasOrganization: false, isOwner: false, organization: null },
      success: true,
    });
  }
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [session.id]).catch(() => ({ rows: [] }))).rows[0] || null;
  let org = null;
  let isOwner = false;
  if (user) {
    if (user.organization_id) {
      org = (await pool.query('SELECT * FROM organizations WHERE id = $1', [user.organization_id]).catch(() => ({ rows: [] }))).rows[0] || null;
    }
    if (!org) {
      org = (await pool.query('SELECT * FROM organizations WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1', [user.id]).catch(() => ({ rows: [] }))).rows[0] || null;
    }
    isOwner = !!org && String(org.owner_id) === String(user.id);
  }
  sendJson(res, 200, {
    data: {
      completed: !!user && user.onboarding_completed !== false,
      hasOrganization: !!org,
      isOwner,
      organization: org ? { id: org.id, name: org.name, description: org.description } : null,
    },
    success: true,
  });
}

// Crea la organización (si aún no existe) o une al usuario a la de su equipo,
// y marca el onboarding como completado. La primera persona en completarlo se
// convierte en propietario (owner); el resto se une como usuario.
async function completeOnboarding(res, body, session) {
  const name = (body.name || '').toString().trim().slice(0, 120) || null;
  const description = (body.description || '').toString().trim().slice(0, 500) || null;

  // El administrador global no pasa por el onboarding: solo se marca como
  // completado sin tocar su rol ni crear organización.
  if (session.role === 'admin') {
    await pool.query(
      `UPDATE users SET onboarding_completed = TRUE, updated_at = NOW() WHERE id = $1`,
      [session.id]
    ).catch(() => {});
    return sendJson(res, 200, {
      data: { completed: true, organizationId: null, isOwner: false, role: 'admin' },
      success: true,
    });
  }

  await pool.query('BEGIN');
  let org = null;
  let role = 'user';
  try {
    // Bloqueo a nivel de toda la app dentro de la transacción: evita que dos
    // primeros usuarios creen dos organizaciones al completar a la vez.
    await pool.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', ['wa_ads_onboarding_org']);

    const u = (await pool.query('SELECT * FROM users WHERE id = $1', [session.id])).rows[0];
    if (!u) {
      await pool.query('ROLLBACK');
      return sendJson(res, 404, { error: 'Usuario no encontrado' });
    }
    if (u.organization_id) {
      org = (await pool.query('SELECT * FROM organizations WHERE id = $1', [u.organization_id])).rows[0] || null;
    }
    if (!org) {
      org = (await pool.query('SELECT * FROM organizations WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1', [u.id])).rows[0] || null;
    }
    if (!org) {
      const orgId = cuid();
      const orgName = name || u.name || 'Mi organización';
      await pool.query(
        `INSERT INTO organizations (id, name, description, owner_id) VALUES ($1, $2, $3, $4)`,
        [orgId, orgName, description, u.id]
      );
      org = (await pool.query('SELECT * FROM organizations WHERE id = $1', [orgId])).rows[0];
    }
    role = String(org.owner_id) === String(u.id) ? 'owner' : 'user';
    await pool.query(
      `UPDATE users SET organization_id = $1, role = $2, onboarding_completed = TRUE, updated_at = NOW() WHERE id = $3`,
      [org.id, role, u.id]
    );
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('[onboarding] completeOnboarding error:', e.message);
    return sendJson(res, 500, { error: 'No se pudo completar el onboarding' });
  }

  // Refresca el rol en todas sus sesiones activas para que el panel lo
  // reconozca de inmediato (el owner pasa a ver los controles de organización).
  await updateUserSessionsInStore(session.id, { role });

  sendJson(res, 200, {
    data: { completed: true, organizationId: org.id, isOwner: role === 'owner', role },
    success: true,
  });
}

// Carga la organización de la sesión actual: primero la asociada al usuario
// y, si no existe, cualquier organización propiedad de este usuario.
async function loadOrgForSession(session) {
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [session.id]).catch(() => ({ rows: [] }));
  const u = user.rows[0] || null;
  const orgId = u ? u.organization_id : null;
  let org = null;
  if (orgId) {
    org = (await pool.query('SELECT * FROM organizations WHERE id = $1', [orgId]).catch(() => ({ rows: [] }))).rows[0] || null;
  }
  if (!org) {
    org = (await pool.query('SELECT * FROM organizations WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1', [session.id]).catch(() => ({ rows: [] }))).rows[0] || null;
  }
  return { user: u, org };
}

function canManageOrganization(session, org) {
  if (isAdminRole(session.role)) return true;
  return !!org && String(org.owner_id) === String(session.id);
}

async function updateOrganization(res, body, session) {
  const { org } = await loadOrgForSession(session);
  if (!org) return sendJson(res, 404, { error: 'Aún no tienes una organización' });
  if (!canManageOrganization(session, org)) return sendJson(res, 403, { error: 'Solo el propietario puede editar la organización' });

  const name = (body.name || '').toString().trim();
  const description = (body.description || '').toString().trim();
  if (!name) return sendJson(res, 400, { error: 'El nombre de la organización es requerido' });

  await pool.query('UPDATE organizations SET name = $1, description = $2, updated_at = NOW() WHERE id = $3',
    [name, description, org.id]);
  const updated = (await pool.query('SELECT * FROM organizations WHERE id = $1', [org.id])).rows[0];
  sendJson(res, 200, { data: enrichOrganization(updated, session.id), success: true });
}

async function getOrganizationMembers(res, session) {
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [session.id]).catch(() => ({ rows: [] }));
  const orgId = user.rows.length > 0 ? user.rows[0].organization_id : null;
  if (!orgId) return sendJson(res, 404, { error: 'Aún no tienes una organización' });
  const members = await pool.query(
    `SELECT id, email, name, role, permissions, organization_id, created_at FROM users
     WHERE organization_id = $1 ORDER BY created_at ASC`, [orgId]);
  sendJson(res, 200, { data: members.rows, success: true });
}

async function addOrganizationMember(res, body, session) {
  const { org } = await loadOrgForSession(session);
  if (!org) return sendJson(res, 404, { error: 'Aún no tienes una organización' });
  if (!canManageOrganization(session, org)) return sendJson(res, 403, { error: 'Solo el propietario puede invitar miembros' });

  const name = (body.name || '').toString().trim();
  const email = (body.email || '').toString().trim().toLowerCase();
  const password = String(body.password || '');
  if (!name || name.length < 2) return sendJson(res, 400, { error: 'El nombre es requerido' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Correo electrónico inválido' });
  if (password.length < 6) return sendJson(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres' });

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]).catch(() => null);
  if (existing && existing.rows.length > 0) return sendJson(res, 409, { error: 'Este correo ya está registrado' });

  const memberId = cuid();
  const permissions = sanitizePermissions(body.permissions);
  await pool.query(
    'INSERT INTO users (id, email, name, password_hash, role, permissions, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [memberId, email, name, hashPassword(password), 'user', permissions, org.id]
  );
  const member = (await pool.query(
    `SELECT id, email, name, role, permissions, organization_id, created_at FROM users WHERE id = $1`, [memberId])).rows[0];
  sendJson(res, 201, { data: member, success: true });
}

async function updateOrganizationMember(res, memberId, body, session) {
  const { org } = await loadOrgForSession(session);
  if (!org) return sendJson(res, 404, { error: 'Aún no tienes una organización' });
  if (!canManageOrganization(session, org)) return sendJson(res, 403, { error: 'Solo el propietario puede modificar miembros' });

  const member = (await pool.query(
    'SELECT * FROM users WHERE id = $1 AND organization_id = $2', [memberId, org.id]
  ).catch(() => ({ rows: [] }))).rows[0];
  if (!member) return sendJson(res, 404, { error: 'Miembro no encontrado' });

  const name = body.name !== undefined ? String(body.name).trim() : null;
  if (name === '') return sendJson(res, 400, { error: 'El nombre es requerido' });

  const permissions = body.permissions !== undefined ? sanitizePermissions(body.permissions) : null;

  await pool.query('UPDATE users SET name = COALESCE($1, name), permissions = COALESCE($2, permissions), updated_at = NOW() WHERE id = $3',
    [name, permissions, memberId]);
  const updated = (await pool.query(
    'SELECT id, email, name, role, permissions, organization_id, created_at FROM users WHERE id = $1', [memberId])).rows[0];
  sendJson(res, 200, { data: updated, success: true });
}

async function removeOrganizationMember(res, memberId, session) {
  const { org } = await loadOrgForSession(session);
  if (!org) return sendJson(res, 404, { error: 'Aún no tienes una organización' });
  if (!canManageOrganization(session, org)) return sendJson(res, 403, { error: 'Solo el propietario puede eliminar miembros' });

  const member = (await pool.query(
    'SELECT * FROM users WHERE id = $1 AND organization_id = $2', [memberId, org.id]
  ).catch(() => ({ rows: [] }))).rows[0];
  if (!member) return sendJson(res, 404, { error: 'Miembro no encontrado' });
  if (String(member.id) === String(session.id)) return sendJson(res, 400, { error: 'No puedes eliminarte a ti mismo' });
  if (String(member.id) === String(org.owner_id)) return sendJson(res, 400, { error: 'No puedes eliminar al propietario de la organización' });

  await pool.query('DELETE FROM users WHERE id = $1', [memberId]);
  sendJson(res, 200, { data: { id: memberId }, success: true });
}

// =========================================================================
// 8b. Panel de usuarios registrados (solo el propietario de la organización)
// =========================================================================
// Elimina del caché de sesiones todas las sesiones de un usuario (además de
// las filas de la tabla sessions) para que pierda el acceso de inmediato.
function purgeUserSessions(userId) {
  for (const [k, s] of sessionsCache) {
    if (s.id === userId) sessionsCache.delete(k);
  }
}

// Refresca campos de las sesiones activas de un usuario (tabla sessions y
// caché). Solo las columnas existentes en la tabla sessions; el resto de
// campos (onboarding, organización) se leen siempre del usuario real.
async function updateUserSessionsInStore(userId, fields) {
  const allowed = ['role', 'name', 'email'];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return;
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values = entries.map(([, v]) => v);
  values.push(userId);
  await pool.query(
    `UPDATE sessions SET ${sets.join(', ')} WHERE user_id = $${values.length}`,
    values
  ).catch(() => {});
  for (const [k, s] of sessionsCache) {
    if (s.id === userId) sessionsCache.set(k, { ...s, ...Object.fromEntries(entries) });
  }
}

async function getAdminUsers(res, session) {
  // Solo el administrador global puede listar a los dueños de organizaciones;
  // los miembros se gestionan en /api/organizations/current/members.
  if (session.role !== 'admin') {
    return sendJson(res, 403, { error: 'Solo el administrador puede ver los propietarios de organizaciones' });
  }
  const where = "u.role = 'owner'";
  const params = [];
  const result = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.permissions, u.plan, u.billing_status,
            u.phone, u.phone_verified, u.two_factor_enabled, u.notifications_enabled,
            u.organization_id, u.blocked, u.blocked_at, u.blocked_reason,
            u.created_at, u.updated_at,
            o.name AS organization_name,
            (SELECT COUNT(*) FROM instances i WHERE i.user_id = u.id) AS instance_count,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS session_count
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE ${where}
     ORDER BY u.created_at ASC`,
    params
  ).catch(() => ({ rows: [] }));
  const data = result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    permissions: r.permissions || [],
    plan: r.plan,
    billingStatus: r.billing_status,
    phone: r.phone,
    phoneVerified: !!r.phone_verified,
    twoFactorEnabled: !!r.two_factor_enabled,
    notificationsEnabled: !!r.notifications_enabled,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    blocked: !!r.blocked,
    blockedAt: r.blocked_at,
    blockedReason: r.blocked_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    instanceCount: Number(r.instance_count || 0),
    sessionCount: Number(r.session_count || 0),
  }));
  sendJson(res, 200, { data, success: true });
}

// Admin: detalle completo de un propietario de organización, incluyendo sus
// add-ons activos, el catálogo de add-ons y los planes disponibles.
async function getAdminUserDetail(res, id, session) {
  if (session.role !== 'admin') {
    return sendJson(res, 403, { error: 'Solo el administrador puede ver los detalles de un propietario' });
  }
  const result = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.permissions, u.plan, u.billing_status,
            u.phone, u.phone_verified, u.two_factor_enabled, u.notifications_enabled,
            u.organization_id, u.blocked, u.blocked_at, u.blocked_reason,
            u.created_at, u.updated_at,
            o.name AS organization_name,
            (SELECT COUNT(*) FROM instances i WHERE i.user_id = u.id) AS instance_count,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS session_count
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [id]
  ).catch(() => ({ rows: [] }));
  const r = result.rows[0];
  if (!r) return sendJson(res, 404, { error: 'Usuario no encontrado' });
  const user = {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    permissions: r.permissions || [],
    plan: r.plan,
    billingStatus: r.billing_status,
    phone: r.phone,
    phoneVerified: !!r.phone_verified,
    twoFactorEnabled: !!r.two_factor_enabled,
    notificationsEnabled: !!r.notifications_enabled,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    blocked: !!r.blocked,
    blockedAt: r.blocked_at,
    blockedReason: r.blocked_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    instanceCount: Number(r.instance_count || 0),
    sessionCount: Number(r.session_count || 0),
    addons: await getUserAddons(id),
  };
  const plans = (await pool.query('SELECT * FROM plans ORDER BY sort_order ASC, created_at ASC').catch(() => ({ rows: [] }))).rows.map(enrichPlan);
  const addonCatalog = await getAddonCatalog();
  const monthly = await getUserMonthlyAmount(id, r.role);
  sendJson(res, 200, { data: { user, plans, addonCatalog, monthly }, success: true });
}

// Admin: actualiza el plan base y/o los extras de un propietario. Aplica los
// cambios de inmediato y, si el monto mensual sube, genera una factura
// pendiente por la diferencia (mismo comportamiento que el auto-cambio).
async function updateAdminUser(res, id, body, session) {
  if (session.role !== 'admin') {
    return sendJson(res, 403, { error: 'Solo el administrador puede actualizar el plan de un propietario' });
  }
  const target = (await pool.query('SELECT * FROM users WHERE id = $1', [id]).catch(() => ({ rows: [] }))).rows[0];
  if (!target) return sendJson(res, 404, { error: 'Usuario no encontrado' });
  if (target.role === 'admin') return sendJson(res, 400, { error: 'El administrador no gestiona un plan' });

  // El monto mensual ANTES de aplicar los cambios, para facturar la diferencia
  // si el nuevo total sube.
  const oldTotal = await getUserMonthlyAmount(id, target.role);
  let changed = false;

  const newPlan = String((body || {}).plan || '').toLowerCase();
  if (newPlan) {
    const planRow = (await pool.query('SELECT * FROM plans WHERE slug = $1', [newPlan]).catch(() => ({ rows: [] }))).rows[0];
    if (!planRow) return sendJson(res, 400, { error: 'Plan no encontrado' });
    await pool.query('UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2', [newPlan, id]);
    changed = true;
  }

  if (Array.isArray((body || {}).addons)) {
    const catalog = await getAddonCatalog();
    const validKeys = new Set(catalog.map((a) => a.key));
    const normalized = [];
    for (const item of body.addons) {
      const key = String((item && item.key) || '');
      if (!validKeys.has(key)) continue;
      const quantity = Math.max(0, Math.min(MAX_ADDON_QTY, parseInt(item.quantity, 10) || 0));
      const def = catalog.find((a) => a.key === key);
      normalized.push({ key, quantity, unitAmount: def ? def.unitAmount : 0 });
    }
    await pool.query('DELETE FROM user_addons WHERE user_id = $1', [id]);
    for (const item of normalized) {
      if (item.quantity <= 0) continue;
      await pool.query(
        `INSERT INTO user_addons (id, user_id, addon_key, quantity, unit_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [cuid(), id, item.key, item.quantity, item.unitAmount]
      );
    }
    changed = true;
  }

  if (changed) {
    const newTotal = await getUserMonthlyAmount(id, target.role);
    if (newTotal > oldTotal) {
      const diff = Math.round((newTotal - oldTotal) * 100) / 100;
      const period = `Plan gestionado por el administrador · ${new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`;
      await createPendingInvoice(id, diff, period, new Date(Date.now() + 30 * 86400000));
    }
  }

  return await getAdminUserDetail(res, id, session);
}

// Admin: genera un enlace de restablecimiento de contraseña y lo envía por
// WhatsApp al número verificado del propietario. El enlace contiene el token
// de la OTP; el propietario completa el cambio en /reset-password con el
// código de 6 dígitos incluido en el mismo mensaje.
async function sendUserPasswordReset(res, id, session) {
  if (session.role !== 'admin') {
    return sendJson(res, 403, { error: 'Solo el administrador puede enviar enlaces de recuperación' });
  }
  const target = (await pool.query('SELECT * FROM users WHERE id = $1', [id]).catch(() => ({ rows: [] }))).rows[0];
  if (!target) return sendJson(res, 404, { error: 'Usuario no encontrado' });
  if (target.role === 'admin') {
    return sendJson(res, 400, { error: 'El administrador no recupera su contraseña por este medio' });
  }
  if (!target.phone || !target.phone_verified) {
    return sendJson(res, 400, { error: 'El usuario no tiene un número de WhatsApp verificado. No se puede enviar el enlace.' });
  }
  if (await hasRecentOtp(target.phone, 'password_reset')) {
    return sendJson(res, 429, { error: 'Ya se envió un enlace hace poco. Espera un momento para reenviarlo.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  const code = genOtpCode();
  await createOtp({ phone: target.phone, code, purpose: 'password_reset', token });
  const base = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
  const url = `${base}/reset-password?token=${token}`;
  const name = (target.name || target.email || '').trim();
  const text = [
    `Hola ${name},`,
    `El administrador de WhatsApp Ads generó un enlace para restablecer tu contraseña.`,
    ``,
    `Abre este enlace: ${url}`,
    `Y usa el código de verificación: ${code}`,
    ``,
    `El enlace y el código vencen en 10 minutos. Si no lo solicitaste, ignora este mensaje.`,
  ].join('\n');
  const inst = await getOtpSenderInstance('password_reset');
  const maskedPhone = maskPhone(target.phone);
  if (!inst) {
    console.log(`[Admin] Sin instancia conectada. Enlace para ${target.email}: ${url} (código ${code})`);
    return sendJson(res, 200, { data: { sent: false, delivered: false, noInstance: true, url, maskedPhone }, success: true });
  }
  try {
    await sendWhatsAppText(inst, target.phone, text);
    return sendJson(res, 200, { data: { sent: true, delivered: true, url, maskedPhone }, success: true });
  } catch (e) {
    console.warn('[Admin] Envío del enlace falló a ' + target.phone + ':', e.message);
    return sendJson(res, 200, { data: { sent: true, delivered: false, url, maskedPhone }, success: true });
  }
}

async function blockUser(res, id, body, session) {
  const isGlobalAdmin = session.role === 'admin';
  if (!isGlobalAdmin && !(await isOrgOwner(session))) {
    return sendJson(res, 403, { error: 'No tienes permisos para bloquear usuarios' });
  }
  const actorUser = (await pool.query('SELECT * FROM users WHERE id = $1', [session.id]).catch(() => ({ rows: [] }))).rows[0];
  const target = (await pool.query('SELECT * FROM users WHERE id = $1', [id]).catch(() => ({ rows: [] }))).rows[0];
  if (!target) return sendJson(res, 404, { error: 'Usuario no encontrado' });
  if (String(target.id) === String(session.id)) return sendJson(res, 400, { error: 'No puedes bloquear tu propia cuenta' });
  if (target.role === 'admin') {
    return sendJson(res, 400, { error: 'No puedes bloquear a un administrador' });
  }
  // Un propietario solo bloquea a miembros de su propia organización y nunca a
  // otro propietario; el administrador global sí puede bloquear a los dueños.
  if (!isGlobalAdmin) {
    if (target.role === 'owner') {
      return sendJson(res, 400, { error: 'No puedes bloquear a otro propietario de organización' });
    }
    const actorOrg = actorUser ? actorUser.organization_id : null;
    if (!actorOrg || String(target.organization_id) !== String(actorOrg)) {
      return sendJson(res, 403, { error: 'Solo puedes bloquear usuarios de tu organización' });
    }
  }
  const reason = String(body && body.reason ? body.reason : '').trim().slice(0, 200);
  // Bloquear al propietario bloquea en cascada a todos los usuarios de su
  // organización (dueño incluido), con el mismo motivo.
  const targets = target.role === 'owner' && target.organization_id
    ? (await pool.query('SELECT * FROM users WHERE organization_id = $1', [target.organization_id]).catch(() => ({ rows: [] }))).rows
    : [target];
  for (const t of targets) {
    await pool.query(
      `UPDATE users SET blocked = TRUE, blocked_at = NOW(), blocked_reason = $1, updated_at = NOW() WHERE id = $2`,
      [reason || null, t.id]
    );
    // Revoca todas las sesiones activas: los usuarios quedan fuera de inmediato.
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [t.id]).catch(() => {});
    purgeUserSessions(t.id);
    logBlockAudit(session, t, 'block', reason || null);
    // Notifica en tiempo real (si tiene la app abierta) para que cierre sesión.
    wsSendToUser(t.id, 'account:blocked', { reason: reason || null, blockedAt: new Date().toISOString() });
  }
  sendJson(res, 200, { data: { id, blocked: true, cascade: targets.length > 1 }, success: true });
}

async function unblockUser(res, id, session) {
  const isGlobalAdmin = session.role === 'admin';
  if (!isGlobalAdmin && !(await isOrgOwner(session))) {
    return sendJson(res, 403, { error: 'No tienes permisos para desbloquear usuarios' });
  }
  const actorUser = (await pool.query('SELECT * FROM users WHERE id = $1', [session.id]).catch(() => ({ rows: [] }))).rows[0];
  const target = (await pool.query('SELECT * FROM users WHERE id = $1', [id]).catch(() => ({ rows: [] }))).rows[0];
  if (!target) return sendJson(res, 404, { error: 'Usuario no encontrado' });
  if (!isGlobalAdmin) {
    const actorOrg = actorUser ? actorUser.organization_id : null;
    if (!actorOrg || String(target.organization_id) !== String(actorOrg)) {
      return sendJson(res, 403, { error: 'Solo puedes desbloquear usuarios de tu organización' });
    }
  }
  if (target.role === 'owner') {
    // Desbloquear al propietario levanta también el bloqueo en cascada de su
    // organización: los miembros que quedaron bloqueados con el mismo motivo
    // (bloqueo manual o falta de pago) vuelven a estar activos.
    const reason = (target.blocked_reason || '').toString().trim();
    await pool.query(
      `UPDATE users SET blocked = FALSE, blocked_at = NULL, blocked_reason = NULL, updated_at = NOW() WHERE id = $1`,
      [target.id]
    );
    if (target.organization_id) {
      const members = (await pool.query(
        `SELECT * FROM users WHERE organization_id = $1 AND blocked = TRUE AND id <> $2`,
        [target.organization_id, target.id]
      ).catch(() => ({ rows: [] }))).rows;
      for (const m of members) {
        // El bloqueo en cascada copia el motivo del dueño (puede ser NULL);
        // solo se levantan esos bloqueos, no los individuales con otro motivo.
        if (((m.blocked_reason || '').toString().trim()) === reason) {
          await pool.query(
            `UPDATE users SET blocked = FALSE, blocked_at = NULL, blocked_reason = NULL, updated_at = NOW() WHERE id = $1`,
            [m.id]
          );
          logBlockAudit(session, m, 'unblock', null);
        }
      }
    }
    logBlockAudit(session, target, 'unblock', null);
  } else {
    await pool.query(
      `UPDATE users SET blocked = FALSE, blocked_at = NULL, blocked_reason = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    logBlockAudit(session, target, 'unblock', null);
  }
  sendJson(res, 200, { data: { id, blocked: false }, success: true });
}

// Registra una acción de bloqueo/desbloqueo en la tabla de auditoría.
async function logBlockAudit(actor, target, action, reason) {
  const actorName = actor && actor.name ? actor.name : (actor && actor.email ? actor.email : String(actor && actor.id || ''));
  const targetName = target && target.name ? target.name : (target && target.email ? target.email : String(target && target.id || ''));
  await pool.query(
    `INSERT INTO user_block_audit (actor_id, actor_name, target_id, target_name, action, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [String(actor && actor.id || ''), actorName, String(target && target.id || ''), targetName, action, reason || null]
  ).catch(() => {});
}

// Últimos eventos de bloqueo/desbloqueo (propietario de la organización o
// administrador global).
async function getUsersAudit(res, session) {
  if (session.role !== 'admin' && !(await isOrgOwner(session))) {
    return sendJson(res, 403, { error: 'No tienes permisos para ver el historial' });
  }
  const result = await pool.query(
    `SELECT id, actor_id, actor_name, target_id, target_name, action, reason, created_at
     FROM user_block_audit
     ORDER BY created_at DESC
     LIMIT 100`
  ).catch(() => ({ rows: [] }));
  const data = result.rows.map((r) => ({
    id: String(r.id),
    actorId: r.actor_id,
    actorName: r.actor_name,
    targetId: r.target_id,
    targetName: r.target_name,
    action: r.action,
    reason: r.reason,
    createdAt: r.created_at,
  }));
  sendJson(res, 200, { data, success: true });
}

function enrichOrganization(org, currentUserId) {
  return {
    id: org.id,
    name: org.name,
    description: org.description,
    ownerId: org.owner_id,
    isOwner: String(org.owner_id) === String(currentUserId),
    createdAt: org.created_at,
    updatedAt: org.updated_at,
  };
}

// =========================================================================
// 9. CRUD de instancias + integración con Evolution API
// =========================================================================
function isOwner(instance, session) {
  if (isAdminRole(session.role)) return true;
  return String(instance.user_id) === String(session.id);
}

// Carga una instancia solo si la sesión puede acceder a ella (propietario o
// admin). Devuelve la fila de la instancia, o null si no existe / no es suya.
async function loadInstanceForUser(id, session) {
  if (!id) return null;
  const result = await pool.query('SELECT * FROM instances WHERE id = $1', [id]).catch(() => null);
  if (!result || result.rows.length === 0) return null;
  const inst = result.rows[0];
  if (!isOwner(inst, session)) return null;
  return inst;
}

async function getInstances(res, session) {
  const isAdmin = isAdminRole(session.role);
  const result = await pool.query(`
    SELECT i.*,
      (SELECT COUNT(*)::int FROM groups_ g WHERE g.instance_id = i.id) AS groups_count,
      u.name AS owner_name, u.email AS owner_email
    FROM instances i
    LEFT JOIN users u ON u.id = i.user_id
    ${isAdmin ? '' : 'WHERE i.user_id = $1'}
    ORDER BY i.created_at DESC
  `, isAdmin ? [] : [session.id]);
  sendJson(res, 200, { data: result.rows.map((i) => enrichInstance(i, session.role)), success: true });
}
async function getInstance(res, id, session) {
  const result = await pool.query(`
    SELECT i.*, u.name AS owner_name, u.email AS owner_email
    FROM instances i LEFT JOIN users u ON u.id = i.user_id
    WHERE i.id = $1`, [id]);
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  const inst = result.rows[0];
  if (!isOwner(inst, session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  sendJson(res, 200, { data: enrichInstance(inst, session.role), success: true });
}

// Configura automáticamente el webhook de Evolution para una instancia: entrega
// de mensajes entrantes, cambios de estado/conexión y actualizaciones/borrados
// de mensajes al endpoint /api/webhooks de la app. Los eventos se registran con
// el naming de Evolution (MESSAGES_UPSERT, ...); la entrega viaja con el event
// en formato Baileys (messages.upsert, ...) que handleWebhook normaliza.
async function configureInstanceWebhook(instance) {
  const baseUrl = (process.env.SERVER_APP_URL || 'http://host.docker.internal:3000').replace(/\/+$/, '');
  const payload = {
    webhook: {
      enabled: true,
      url: `${baseUrl}/api/webhooks`,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE', 'MESSAGES_DELETE'],
      headers: { apikey: instance.api_key },
      byEvents: false,
      base64: false,
    },
  };
  await fetchJson('POST', `${evolutionBaseUrl(instance)}/webhook/set/${evoInstanceName(instance)}`,
    { apikey: instance.api_key }, payload);
  return payload;
}

async function createInstance(res, body, session) {
  const limits = await getUserPlanLimits(session.id, session.role);
  if (limits) {
    const used = parseInt((await pool.query('SELECT COUNT(*)::int FROM instances WHERE user_id = $1', [session.id])).rows[0].count, 10);
    if (!enforceLimit(res, used, limits.maxInstances, 'instancias de WhatsApp')) return;
  }
  const id = cuid();
  // La URL y la API Key las gestiona el propietario del sistema; nunca llegan
  // desde el cliente.
  const evolutionUrl = EVO_URL;
  const apiKey = EVO_KEY;
  const phone = (body.phone || body.number || '').trim() || null;
  // Rol de verificación de la instancia: para qué envíos de código se usa.
  const verificationRole = VALID_VERIFICATION_ROLES.includes(body.verificationRole) ? body.verificationRole : 'all';
  // Emisora de seguridad (OTP): solo el admin/owner puede habilitarla; los
  // miembros no pueden marcar sus instancias para enviar códigos del sistema.
  const securitySender = body.securitySender === true || body.securitySender === 'true'
    ? isAdminRole(session.role)
    : false;
  // n8n es un entorno único del sistema (variables de entorno del admin); no se
  // persiste ni se acepta configuración por instancia.
  const result = await pool.query(
    `INSERT INTO instances (id, name, evolution_url, api_key, phone, status, user_id, verification_role, security_sender, integration)
     VALUES ($1, $2, $3, $4, $5, 'disconnected', $6, $7, $8, 'WHATSAPP-BAILEYS') RETURNING *`,
    [id, body.name, evolutionUrl, apiKey, phone, session.id, verificationRole, securitySender]
  );
  // Crea la instancia en Evolution API
  let evoInstanceId = null;
  let qrCode = null;
  try {
    const payload = { instanceName: body.name, integration: 'WHATSAPP-BAILEYS', qrcode: true };
    if (phone) payload.number = phone;
    const created = await fetchJson('POST', `${evolutionUrl}/instance/create`, { apikey: apiKey }, payload);
    evoInstanceId = created?.instance?.instanceName || created?.instance?.instanceId || null;
    qrCode = created?.qrcode?.base64 || created?.qrcode?.code || null;
    await pool.query('UPDATE instances SET evolution_instance_id = $1, status = $2 WHERE id = $3',
      [evoInstanceId, qrCode ? 'connecting' : 'disconnected', id]);
  } catch (e) {
    console.warn('Evolution create instance warning:', e.message);
  }
  const row = (await pool.query('SELECT * FROM instances WHERE id = $1', [id])).rows[0];
  if (evoInstanceId) {
    configureInstanceWebhook(row).catch((e) => console.warn('Evolution webhook config warning:', e.message));
  }
  pushInstanceUpdate(row);
  if (n8nEnabled()) {
    ensureN8nWorkflow(row).catch((e) => console.warn('[n8n] provision on create:', e.message));
  }
  sendJson(res, 201, {
    data: { ...enrichInstance({ ...row, owner_name: session.name, owner_email: session.email }, session.role), qrCode },
    success: true,
  });
}
async function updateInstance(res, id, body, session) {
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [id]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  // Solo el admin/owner puede cambiar el flag de emisor de seguridad; para los
  // miembros el valor enviado se ignora (se conserva el actual).
  const canSetSecurity = isAdminRole(session.role);
  const securitySender = body.securitySender === true || body.securitySender === 'true'
    ? true
    : body.securitySender === false || body.securitySender === 'false'
      ? false
      : null;
  const newSecuritySender = canSetSecurity ? securitySender : null;
  const result = await pool.query(
    `UPDATE instances SET name = COALESCE($1, name), status = COALESCE($2, status),
     phone = COALESCE($3, phone),
     verification_role = COALESCE($4, verification_role),
     security_sender = COALESCE($5, security_sender),
     updated_at = NOW() WHERE id = $6 RETURNING *`,
    [body.name || null, body.status || null, (body.phone || body.number || null),
      VALID_VERIFICATION_ROLES.includes(body.verificationRole) ? body.verificationRole : null,
      newSecuritySender, id]
  );
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  pushInstanceUpdate(result.rows[0]);
  // n8n es un entorno único del sistema: cualquier cambio de instancia vuelve a
  // asegurar su workflow dinámico si el admin tiene n8n configurado.
  if (n8nEnabled()) {
    ensureN8nWorkflow(result.rows[0]).catch((e) => console.warn('[n8n] provision on update:', e.message));
  }
  sendJson(res, 200, { data: enrichInstance(result.rows[0], session.role), success: true });
}
async function deleteInstance(res, id, session) {
  // Obtiene primero la instancia para borrarla de Evolution API
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [id]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  try {
    await fetchJson('DELETE', `${evolutionBaseUrl(inst.rows[0])}/instance/delete/${evoInstanceName(inst.rows[0])}`,
      { apikey: inst.rows[0].api_key });
  } catch (e) {
    console.warn('Evolution delete warning:', e.message);
  }
  await pool.query('DELETE FROM instances WHERE id = $1', [id]);
  wsBroadcast('instance:deleted', { id, userId: inst.rows[0].user_id });
  sendJson(res, 200, { success: true });
}
// Nombre con el que Evolution conoce esta instancia. Cae al nombre local para que
// las instancias creadas antes de rastrear evolution_instance_id sigan funcionando.
function evoInstanceName(i) {
  return i.evolution_instance_id || i.name;
}

// URL base de Evolution para las llamadas desde la app. La instancia guarda la
// URL que el usuario vio desde su navegador (p.ej. http://localhost:3100),
// pero cuando la app corre dentro de Docker la API de Evolution solo es
// alcanzable por la red interna (http://evolution_api:8080). Si la URL
// guardada apunta a localhost del host y el entorno (EVOLUTION_API_URL) indica
// otra red, se usa la URL del entorno.
function evolutionBaseUrl(i) {
  let url = (i && i.evolution_url) || EVO_URL || 'http://localhost:3100';
  try {
    const storedHost = new URL(url).hostname;
    const envHost = (() => { try { return new URL(EVO_URL).hostname; } catch { return ''; } })();
    if ((storedHost === 'localhost' || storedHost === '127.0.0.1')
      && envHost && envHost !== 'localhost' && envHost !== '127.0.0.1') {
      url = EVO_URL;
    }
  } catch { /* URL inválida: se usa la guardada */ }
  return url.replace(/\/+$/, '');
}

async function connectInstance(res, id, session) {
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [id]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const i = inst.rows[0];
  // Si la instancia no existe en Evolution, se crea primero
  if (!i.evolution_instance_id) {
    try {
      const created = await fetchJson('POST', `${evolutionBaseUrl(i)}/instance/create`, { apikey: i.api_key }, {
        instanceName: i.name,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      });
      await pool.query('UPDATE instances SET evolution_instance_id = $1 WHERE id = $2',
        [created?.instance?.instanceId || i.name, id]);
    } catch (e) {
      console.warn('Evolution auto-create warning:', e.message);
    }
  }
  // Obtiene el QR desde Evolution API (GET inicia/refresca la sesión de
  // WhatsApp y devuelve el QR)
  let qrData;
  try {
    qrData = await fetchJson('GET', `${evolutionBaseUrl(i)}/instance/connect/${evoInstanceName(i)}`,
      { apikey: i.api_key });
  } catch (e) {
    console.warn('Evolution connect warning:', e.message);
    qrData = null;
  }
  const qrCode = qrData?.base64 || qrData?.code || qrData?.qrcode || qrData || null;
  await pool.query('UPDATE instances SET status = $1, evolution_instance_id = COALESCE($2, evolution_instance_id) WHERE id = $3',
    ['connecting', i.evolution_instance_id || i.name, id]);
  const row = (await pool.query('SELECT * FROM instances WHERE id = $1', [id])).rows[0];
  pushInstanceUpdate(row);
  sendJson(res, 200, { data: { ...enrichInstance(row, session.role), status: 'connecting', qrCode }, success: true });
}
async function disconnectInstance(res, id, session) {
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [id]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const i = inst.rows[0];
  try {
    await fetchJson('DELETE', `${evolutionBaseUrl(i)}/instance/logout/${evoInstanceName(i)}`,
      { apikey: i.api_key });
  } catch (e) {
    console.warn('Evolution disconnect warning:', e.message);
  }
  await pool.query('UPDATE instances SET status = $1 WHERE id = $2', ['disconnected', id]);
  const row = (await pool.query('SELECT * FROM instances WHERE id = $1', [id])).rows[0];
  pushInstanceUpdate(row);
  sendJson(res, 200, { success: true });
}
async function getInstanceQr(res, id, session) {
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [id]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const i = inst.rows[0];
  let qrCode = null;
  // Asegura que la sesión de WhatsApp esté iniciada para que haya un QR
  try {
    const qrData = await fetchJson('GET', `${evolutionBaseUrl(i)}/instance/connect/${evoInstanceName(i)}`,
      { apikey: i.api_key });
    qrCode = qrData?.base64 || qrData?.code || qrData?.qrcode || qrData || null;
  } catch (e) {
    console.warn('Evolution connect warning:', e.message);
  }
  await pool.query('UPDATE instances SET status = $1 WHERE id = $2', ['connecting', id]);
  sendJson(res, 200, { data: { qrCode }, success: true });
}
async function getInstanceStatus(res, id, session) {
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [id]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const i = inst.rows[0];
  let evoStatus = 'disconnected';
  try {
    const state = await fetchJson('GET', `${evolutionBaseUrl(i)}/instance/connectionState/${evoInstanceName(i)}`,
      { apikey: i.api_key });
    evoStatus = state.state || state.instance?.state || 'disconnected';
  } catch {
    // se mantiene el estado local
  }
  const dbStatus = evoStatus === 'open' ? 'connected' : evoStatus === 'connecting' ? 'connecting' : 'disconnected';
  if (dbStatus !== i.status) {
    await pool.query('UPDATE instances SET status = $1 WHERE id = $2', [dbStatus, id]);
  }
  // Backfill: si la instancia ya está conectada pero no tiene número guardado,
  // lo obtenemos desde Evolution.
  if (evoStatus === 'open' && !i.phone) {
    syncInstancePhone(i).catch(() => {});
  }
  sendJson(res, 200, { data: { status: dbStatus, raw: evoStatus }, success: true });
}
async function syncInstances(res, body, session) {
  const evolutionUrl = body.evolutionUrl || EVO_URL;
  const apiKey = body.apiKey || EVO_KEY;
  try {
    const result = await reconcileWithEvolution(evolutionUrl, apiKey, session);
    sendJson(res, 200, result);
  } catch (e) {
    if (e && e.statusCode === 404) {
      return sendJson(res, 500, { error: 'No se pudo conectar con Evolution API: recurso no encontrado' });
    }
    sendJson(res, 500, { error: 'No se pudo conectar con Evolution API' });
  }
}

// Trae la lista de instancias desde Evolution y la concilia con la BD local
// (crea las faltantes, actualiza estado / evolution_instance_id). Devuelve resumen.
// Cuando hay sesión, el alcance es la organización del usuario (o sus instancias
// propias si aún no pertenece a una organización). Sin sesión (sync en segundo
// plano) reconcilia globalmente y asigna las huérfanas al primer admin/owner.
async function reconcileWithEvolution(evolutionUrl, apiKey, session) {
  let remoteInstances;
  try {
    remoteInstances = await fetchJson('GET', `${evolutionUrl}/instance/fetchInstances`,
      { apikey: apiKey });
  } catch (e) {
    const err = new Error('No se pudo conectar con Evolution API');
    err.statusCode = (e && e.statusCode) || 500;
    throw err;
  }
  const remoteList = Array.isArray(remoteInstances)
    ? remoteInstances
    : (remoteInstances.value || []);
  let synced = 0, created = 0;
  // Alcance de la sesión: organización del usuario (o sus propias instancias).
  let scopeOrgId = null;
  if (session) {
    try {
      const ur = await pool.query('SELECT organization_id FROM users WHERE id = $1', [session.id]);
      scopeOrgId = ur.rows[0] ? ur.rows[0].organization_id : null;
    } catch { /* sin alcance: cae a las instancias propias del usuario */ }
  }
  // Propietario por defecto para las instancias que Evolution posee y la BD no
  // conoce (solo en el sync global de segundo plano). Si no existe, no se crean
  // instancias huérfanas (evita violar la FK instances_user_id_fkey).
  let systemOwnerId = null;
  if (!session) {
    try {
      const owner = await pool.query(
        `SELECT id FROM users WHERE role IN ('admin', 'owner') ORDER BY created_at ASC LIMIT 1`
      );
      systemOwnerId = owner.rows[0] ? owner.rows[0].id : null;
    } catch { /* sin propietario: se omiten las instancias nuevas */ }
  }
  for (const remote of remoteList) {
    const name = remote.instanceName || remote.name;
    if (!name) continue;
    const rStatus = remote.connectionStatus || remote.status || remote.state || '';
    const dbStatus = rStatus === 'open' ? 'connected' : rStatus === 'connecting' ? 'connecting' : 'disconnected';
    let existing = null;
    if (session) {
      if (scopeOrgId) {
        const r = await pool.query(
          `SELECT i.* FROM instances i JOIN users u ON u.id = i.user_id
           WHERE u.organization_id = $1 AND (i.evolution_instance_id = $2 OR i.name = $2)
           LIMIT 1`, [scopeOrgId, name]
        ).catch(() => ({ rows: [] }));
        existing = r.rows[0] || null;
      }
      if (!existing) {
        const r = await pool.query(
          `SELECT * FROM instances WHERE user_id = $1 AND (evolution_instance_id = $2 OR name = $2)
           LIMIT 1`, [session.id, name]
        ).catch(() => ({ rows: [] }));
        existing = r.rows[0] || null;
      }
    } else {
      const r = await pool.query(
        `SELECT * FROM instances WHERE evolution_instance_id = $1 OR name = $2`,
        [name, name]
      ).catch(() => ({ rows: [] }));
      existing = r.rows[0] || null;
    }
    if (existing) {
      if (existing.status !== dbStatus || existing.evolution_instance_id !== name) {
        await pool.query(
          `UPDATE instances SET status = $1, evolution_instance_id = $2, updated_at = NOW() WHERE id = $3`,
          [dbStatus, name, existing.id]
        ).catch(() => {});
        synced++;
      }
    } else if (session) {
      await pool.query(
        `INSERT INTO instances (id, name, evolution_url, api_key, status, evolution_instance_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cuid(), name, evolutionUrl, apiKey, dbStatus, name, session.id]
      ).catch(() => {});
      created++;
    } else if (systemOwnerId) {
      await pool.query(
        `INSERT INTO instances (id, name, evolution_url, api_key, status, evolution_instance_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cuid(), name, evolutionUrl, apiKey, dbStatus, name, systemOwnerId]
      ).catch(() => {});
      created++;
    }
  }
  return { success: true, synced, created, total: remoteList.length };
}

// Refresca el estado de cada instancia local contra el estado real de Evolution
// API y marca como desconectadas las que Evolution ya no conoce.
async function syncInstancesWithEvolution() {
  const instances = await pool.query('SELECT * FROM instances').catch(() => null);
  if (!instances) return;
  for (const i of instances.rows) {
    let evoStatus = null;
    try {
      const state = await fetchJson('GET', `${evolutionBaseUrl(i)}/instance/connectionState/${evoInstanceName(i)}`,
        { apikey: i.api_key });
      evoStatus = state.state || state.instance?.state || null;
    } catch (e) {
      if (e && e.statusCode === 404) evoStatus = 'close';
      // otros errores (Evolution inalcanzable): se deja el estado local intacto
    }
    if (evoStatus === null) continue;
    const dbStatus = evoStatus === 'open' ? 'connected' : evoStatus === 'connecting' ? 'connecting' : 'disconnected';
    if (dbStatus !== i.status) {
      await pool.query('UPDATE instances SET status = $1, updated_at = NOW() WHERE id = $2', [dbStatus, i.id])
        .catch(() => {});
      console.log(`[instance-sync] "${i.name}": ${i.status} -> ${dbStatus}`);
      pushInstanceUpdate({ ...i, status: dbStatus });
    }
  }
  // Trae la lista remota para crear/actualizar instancias que Evolution posee
  // pero nosotros no conocemos.
  try {
    await reconcileWithEvolution(EVO_URL, EVO_KEY);
  } catch (e) {
    console.warn('[instance-sync] Evolution unreachable:', e.message);
  }
}

// =========================================================================
// 10. Campaigns
// =========================================================================
// Normaliza un valor de hora a "HH:MM". Acepta "HH:MM", "HH:MM:SS" o
// timestamps/Date; devuelve null si no hay un valor de hora utilizable.
function toTimeString(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = String(parseInt(m[1], 10)).padStart(2, '0');
    const min = String(parseInt(m[2], 10)).padStart(2, '0');
    if (parseInt(h, 10) > 23 || parseInt(min, 10) > 59) return null;
    return `${h}:${min}`;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}
function enrichInstance(i, role) {
  const canSeeCredentials = isAdminRole(role);
  return {
    id: i.id,
    name: i.name,
    evolutionUrl: canSeeCredentials ? i.evolution_url : null,
    apiKey: canSeeCredentials ? i.api_key : null,
    phone: i.phone || null,
    status: i.status,
    evolutionInstanceId: i.evolution_instance_id,
    integration: i.integration || 'WHATSAPP-BAILEYS',
    verificationRole: i.verification_role || 'all',
    securitySender: !!i.security_sender,
    groups_count: i.groups_count || 0,
    userId: i.user_id || i.userId || null,
    ownerName: i.owner_name || null,
    ownerEmail: i.owner_email || null,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

function enrichCampaign(c) {
  const instance = c.instance_name
    ? { id: c.instance_id, name: c.instance_name, evolutionUrl: c.instance_evo_url } : null;
  const template = c.template_name ? { id: c.template_id, name: c.template_name } : null;
  const metrics = {
    sent: c.total_sent || 0,
    failed: c.total_failed || 0,
    pending: Math.max(0, (c.group_ids || []).length - (c.total_sent || 0) - (c.total_failed || 0)),
  };
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    active: c.active,
    scheduledAt: c.scheduled_at,
    recurrence: c.recurrence,
    recurrenceConfig: c.recurrence_config || {},
    concurrence: c.concurrence,
    startTime: toTimeString(c.start_time),
    endTime: toTimeString(c.end_time),
    intervalValue: c.interval_value,
    intervalUnit: c.interval_unit,
    templateId: c.template_id,
    instanceId: c.instance_id,
    groupIds: c.group_ids || [],
    tags: c.tags || [],
    excludeTags: c.exclude_tags || [],
    totalSent: c.total_sent || 0,
    totalFailed: c.total_failed || 0,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    metrics,
    instance,
    template,
  };
}

const CAMPAIGN_QUERY = `
  SELECT c.*,
    i.name AS instance_name, i.evolution_url AS instance_evo_url, i.integration AS instance_integration,
    t.name AS template_name
  FROM campaigns c
  LEFT JOIN instances i ON i.id = c.instance_id
  LEFT JOIN templates t ON t.id = c.template_id
`;

function canAccessCampaign(campaign, session) {
  if (isAdminRole(session.role)) return true;
  return String(campaign.owner_user_id) === String(session.id);
}

async function loadCampaignAccess(id) {
  const result = await pool.query(
    `SELECT c.*, i.user_id AS owner_user_id FROM campaigns c
     LEFT JOIN instances i ON i.id = c.instance_id
     WHERE c.id = $1`, [id]);
  return result.rows[0] || null;
}

async function getCampaigns(res, req, session) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const limit = u.searchParams.get('limit');
  const isAdmin = isAdminRole(session.role);
  let query = CAMPAIGN_QUERY + (isAdmin ? '' : ' WHERE i.user_id = $1') + ' ORDER BY c.created_at DESC';
  const params = [];
  if (!isAdmin) params.push(session.id);
  if (limit) {
    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;
  }
  const result = await pool.query(query, params);
  sendJson(res, 200, { data: result.rows.map(enrichCampaign), success: true });
}
async function getCampaign(res, id, session) {
  const owned = await loadCampaignAccess(id);
  if (!owned) return sendJson(res, 404, { error: 'Campaña no encontrada' });
  if (!canAccessCampaign(owned, session)) return sendJson(res, 403, { error: 'No tienes acceso a esta campaña' });
  const result = await pool.query(CAMPAIGN_QUERY + ' WHERE c.id = $1', [id]);
  sendJson(res, 200, { data: enrichCampaign(result.rows[0]), success: true });
}
async function createCampaign(res, body, session) {
  const id = cuid();
  const limits = await getUserPlanLimits(session.id, session.role);
  if (limits) {
    const used = parseInt((await pool.query(
      `SELECT COUNT(*)::int FROM campaigns c LEFT JOIN instances i ON i.id = c.instance_id
       WHERE i.user_id = $1 AND c.active = TRUE`, [session.id])).rows[0].count, 10);
    if (!enforceLimit(res, used, limits.maxCampaigns, 'campañas activas')) return;
  }
  if (body.instanceId) {
    const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [body.instanceId]);
    if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
    if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  }
  const startTime = toTimeString(body.startTime);
  const endTime = toTimeString(body.endTime);
  const result = await pool.query(
    `INSERT INTO campaigns (id, name, description, status, active, scheduled_at, recurrence,
     recurrence_config, concurrence, start_time, end_time, interval_value, interval_unit,
     template_id, instance_id, group_ids, tags, exclude_tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [id, body.name, body.description || '', body.scheduledAt ? 'scheduled' : 'draft', body.active !== false,
     body.scheduledAt || null, body.recurrence || 'none', JSON.stringify(body.recurrenceConfig || {}),
     body.concurrence || 1, startTime, endTime,
     body.intervalValue || 1, body.intervalUnit || 'none',
     body.templateId || null, body.instanceId || null,
     body.groupIds || [], body.tags || [],
     body.excludeTags || []]
  );
  sendJson(res, 201, { data: enrichCampaign(result.rows[0]), success: true });
}
async function updateCampaign(res, id, body, session) {
  const owned = await loadCampaignAccess(id);
  if (!owned) return sendJson(res, 404, { error: 'Campaña no encontrada' });
  if (!canAccessCampaign(owned, session)) return sendJson(res, 403, { error: 'No tienes acceso a esta campaña' });
  if (body.instanceId) {
    const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [body.instanceId]);
    if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
    if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  }
  const startTime = toTimeString(body.startTime);
  const endTime = toTimeString(body.endTime);
  // Al editar, si el formulario envía scheduledAt se recalcula el estado:
  // con fecha futura → 'scheduled'; "enviar ahora" (sin fecha) → 'draft'.
  const status =
    body.scheduledAt !== undefined
      ? (body.scheduledAt ? 'scheduled' : 'draft')
      : (body.status || null);
  // scheduled_at, template_id, start_time y end_time se asignan directamente
  // (no COALESCE) para permitir limpiarlos al editar (p. ej. "Sin plantilla"
  // o quitar la programación); el frontend envía el formulario completo.
  const result = await pool.query(
    `UPDATE campaigns SET name = COALESCE($1, name), description = COALESCE($2, description),
     status = COALESCE($3, status), active = COALESCE($4, active),
     scheduled_at = $5, template_id = $6,
     instance_id = COALESCE($7, instance_id), group_ids = COALESCE($8, group_ids),
     tags = COALESCE($9, tags),
     recurrence = COALESCE($10, recurrence),
     recurrence_config = COALESCE($11, recurrence_config),
     concurrence = COALESCE($12, concurrence),
     start_time = $13, end_time = $14,
     interval_value = COALESCE($15, interval_value),
     interval_unit = COALESCE($16, interval_unit),
     exclude_tags = COALESCE($17, exclude_tags),
     updated_at = NOW() WHERE id = $18 RETURNING *`,
    [body.name || null, body.description !== undefined ? body.description : null,
     status, body.active !== undefined ? body.active : null,
     body.scheduledAt || null, body.templateId || null, body.instanceId || null,
     body.groupIds ? body.groupIds : null,
     body.tags ? body.tags : null,
     body.recurrence || null, body.recurrenceConfig ? JSON.stringify(body.recurrenceConfig) : null,
     body.concurrence || null, startTime, endTime,
     body.intervalValue || null, body.intervalUnit || null,
     body.excludeTags ? body.excludeTags : null, id]
  );
  sendJson(res, 200, { data: enrichCampaign(result.rows[0]), success: true });
}
async function deleteCampaign(res, id, session) {
  const owned = await loadCampaignAccess(id);
  if (!owned) return sendJson(res, 404, { error: 'Campaña no encontrada' });
  if (!canAccessCampaign(owned, session)) return sendJson(res, 403, { error: 'No tienes acceso a esta campaña' });
  await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
  sendJson(res, 200, { success: true });
}
async function getCampaignLogs(res, id, session) {
  const owned = await loadCampaignAccess(id);
  if (!owned) return sendJson(res, 404, { error: 'Campaña no encontrada' });
  if (!canAccessCampaign(owned, session)) return sendJson(res, 403, { error: 'No tienes acceso a esta campaña' });
  const result = await pool.query(
    'SELECT * FROM send_logs WHERE campaign_id = $1 ORDER BY created_at DESC', [id]
  );
  const rows = result.rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    sent: r.sent,
    failed: r.failed,
    createdAt: r.created_at,
  }));
  sendJson(res, 200, { data: rows, success: true });
}
async function sendCampaign(res, id, session) {
  const owned = await loadCampaignAccess(id);
  if (!owned) return sendJson(res, 404, { error: 'Campaña no encontrada' });
  if (!canAccessCampaign(owned, session)) return sendJson(res, 403, { error: 'No tienes acceso a esta campaña' });
  const result = await executeCampaign(id, { force: true });
  if (result.skipped) return sendJson(res, 400, { error: 'La campaña ya fue enviada o no está pendiente' });
  if (result.error) return sendJson(res, result.status || 400, { error: result.error });
  sendJson(res, 200, { data: { message: `Enviado a ${result.sent} grupos (${result.failed} fallos)` }, success: true });
}

// -------------------------------------------------------------------------
// Envío automático de campañas programadas (cron dentro del contenedor)
// -------------------------------------------------------------------------
// Ejecuta el envío de una campaña sin pasar por HTTP (lo usa tanto el endpoint
// manual como el cron). Con `force:true` (envío manual) se procesa aunque ya
// esté enviada; sin force (cron) solo se procesan campañas pendientes y se
// respeta la ventana diaria (start_time/end_time).
async function executeCampaign(id, opts = {}) {
  const campaign = await pool.query(
    `SELECT c.*, t.content as template_content, i.name as instance_name,
     i.evolution_url, i.api_key, i.status as instance_status
     FROM campaigns c
     LEFT JOIN templates t ON t.id = c.template_id
     LEFT JOIN instances i ON i.id = c.instance_id
     WHERE c.id = $1`, [id]
  );
  const c = campaign.rows[0];
  if (!c) return { error: 'Campaña no encontrada', status: 404 };

  if (!opts.force) {
    // Solo procesa campañas pendientes: activas, sin enviar y ya vencidas.
    if (!c.active) return { skipped: true };
    if (c.status !== 'draft' && c.status !== 'scheduled') return { skipped: true };
    if (c.status === 'draft' && c.scheduled_at && new Date(c.scheduled_at) > new Date()) return { skipped: true };
    if (!campaignInWindow(c)) return { skipped: true };
  }

  if (!c.template_id) return { error: 'La campaña no tiene template', status: 400 };
  if (!c.active) return { error: 'La campaña no está activa', status: 400 };
  if (c.instance_status !== 'connected') {
    return {
      error: `La instancia "${c.instance_name}" no está conectada (estado: ${c.instance_status}). Escanea el QR antes de lanzar la campaña.`,
      status: 400,
    };
  }

  // Reclama la campaña con UPDATE condicional para evitar envíos duplicados
  // cuando el cron y un envío manual coinciden en el mismo minuto.
  const claimed = await pool.query(
    `UPDATE campaigns SET status = 'sending', updated_at = NOW() WHERE id = $1
     ${opts.force ? '' : "AND status IN ('draft','scheduled')"} RETURNING id`,
    [id]
  );
  if (claimed.rows.length === 0) return { skipped: true };

  const groups = await pool.query(
    'SELECT * FROM groups_ WHERE id = ANY($1) AND excluded = FALSE',
    [c.group_ids]
  );

  let sent = 0, failed = 0;
  const tc = c.template_content || {};
  const hasMedia = !!(tc.mediaUrl && tc.mediaType);
  const evo = { baseUrl: evolutionBaseUrl(c), apiKey: c.api_key };
  const msg = tc.text || '';
  // Botones de acción (reply/url): como máximo 3, que es el límite de WhatsApp.
  const buttons = (Array.isArray(tc.buttons) ? tc.buttons : [])
    .filter((b) => b && b.text && (b.type === 'reply' || b.type === 'url'))
    .slice(0, 3);
  const hasButtons = buttons.length > 0;
  // Los botones interactivos solo se entregan de forma fiable con la Cloud API
  // oficial de Meta. En cuentas QR (Baileys) Meta los bloquea (la API responde
  // 201 pero el mensaje nunca llega), así que se degradan a texto numerado.
  const isCloudApi = /cloud|official|business/i.test(String(c.instance_integration || ''));
  const useInteractiveButtons = hasButtons && isCloudApi;
  const messageType = hasButtons ? 'buttons' : hasMedia ? 'media' : 'text';
  // CTA en texto para cuentas QR (Baileys): los botones interactivos los bloquea
  // Meta en esta vía, así que se dibujan como "botones" de texto al pie del
  // mensaje: una caja con caracteres unicode en formato código (monospace) que
  // semeja un botón real, y el enlace debajo, tappable y con vista previa.
  const ctaBox = (lines) => {
    const lns = lines.map((l) => String(l));
    const w = Math.max(...lns.map((l) => l.length));
    const hbar = '─'.repeat(w + 2);
    const body = lns.map((l) => `│ ${l}${' '.repeat(w - l.length)} │`);
    return ['```', '┌' + hbar + '┐', ...body, '└' + hbar + '┘', '```'].join('\n');
  };
  const ctaBlocks = buttons.map((b) => {
    const box = ctaBox([b.text]);
    const value = b.type === 'url' && b.value ? String(b.value).trim() : '';
    return b.type === 'url' && /^https?:\/\/\S+$/i.test(value) ? box + '\n\n' + value : box;
  });
  const textWithButtons = msg + (ctaBlocks.length ? '\n\n' + ctaBlocks.join('\n\n') : '');

  for (const group of groups.rows) {
    let ok = true;
    try {
      if (useInteractiveButtons) {
        await fetchJson('POST', `${evo.baseUrl}/message/sendButtons/${c.instance_name}`,
          { apikey: evo.apiKey }, {
            number: group.jid,
            title: msg,
            description: '',
            footer: '',
            buttons: buttons.map((b) => {
              if (b.type === 'url' && /^https?:\/\/\S+$/i.test(String(b.value || '').trim())) {
                return { type: 'url', displayText: b.text, url: b.value.trim() };
              }
              return { type: 'reply', displayText: b.text, id: b.value || b.text };
            }),
            delay: 3000,
          });
      } else if (hasMedia) {
        const mediaUrl = tc.mediaUrl.startsWith('/')
          ? `${process.env.SERVER_APP_URL || 'http://host.docker.internal:3000'}${tc.mediaUrl}`
          : tc.mediaUrl;
        await fetchJson('POST', `${evo.baseUrl}/message/sendMedia/${c.instance_name}`,
          { apikey: evo.apiKey }, {
            number: group.jid,
            mediatype: tc.mediaType,
            media: mediaUrl,
            caption: textWithButtons || msg,
            delay: 3000,
          });
      } else {
        await fetchJson('POST', `${evo.baseUrl}/message/sendText/${c.instance_name}`,
          { apikey: evo.apiKey }, {
            number: group.jid,
            text: textWithButtons || msg,
            linkPreview: true,
            delay: 3000,
          });
      }
      sent++;
    } catch (e) {
      console.warn(`Send failed to ${group.jid}:`, e.message);
      failed++;
      ok = false;
    }
    // Cada envío individual (programado o inmediato) queda registrado en
    // message_logs para que las métricas del dashboard, reportes y analítica
    // de campaña lo contabilicen por grupo.
    await pool.query(
      `INSERT INTO message_logs (id, instance_id, campaign_id, group_jid, group_name,
         content, message_type, status, direction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'outgoing')`,
      [cuid(), c.instance_id, id, group.jid, group.name || '',
       useInteractiveButtons ? msg : textWithButtons, messageType,
       ok ? 'sent' : 'failed']
    ).catch((e) => console.warn('message_logs insert failed:', e.message));
  }

  const nextAt = computeNextScheduled(c);
  if (nextAt) {
    // Recurrencia: reprograma la próxima ocurrencia y vuelve a 'scheduled'.
    await pool.query(
      "UPDATE campaigns SET status = 'scheduled', scheduled_at = $1, total_sent = $2, total_failed = $3 WHERE id = $4",
      [nextAt.toISOString(), sent, failed, id]
    );
  } else {
    await pool.query(
      'UPDATE campaigns SET status = $1, total_sent = $2, total_failed = $3 WHERE id = $4',
      [failed > 0 ? 'partial' : 'sent', sent, failed, id]
    );
  }
  await pool.query(
    'INSERT INTO send_logs (id, campaign_id, sent, failed) VALUES ($1, $2, $3, $4)',
    [cuid(), id, sent, failed]
  );

  return { sent, failed };
}

// Indica si la hora actual cae dentro de la ventana diaria de la campaña
// (start_time/end_time). Sin ventana definida siempre devuelve true.
function campaignInWindow(campaign) {
  if (!campaign.start_time && !campaign.end_time) return true;
  const d = new Date();
  const cur = d.getHours() * 60 + d.getMinutes();
  const toMin = (t) => {
    if (!t) return null;
    const p = String(t).split(':').map(Number);
    if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) return null;
    return p[0] * 60 + p[1];
  };
  const s = toMin(campaign.start_time);
  const e = toMin(campaign.end_time);
  if (s == null && e == null) return true;
  if (s != null && e != null) return cur >= s && cur <= e;
  if (s != null) return cur >= s;
  return cur <= e;
}

// Calcula la próxima fecha de envío de una campaña recurrente partiendo del
// ancla (scheduled_at) y avanzando por el período hasta quedar en el futuro.
function computeNextScheduled(campaign) {
  if (!campaign || !campaign.recurrence || campaign.recurrence === 'none') return null;
  const now = new Date();
  const anchor = campaign.scheduled_at ? new Date(campaign.scheduled_at) : now;
  const next = new Date(anchor);
  const step = () => {
    switch (campaign.recurrence) {
      case 'daily': next.setDate(next.getDate() + 1); break;
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'custom': {
        const value = (campaign.interval_value && campaign.interval_value > 0) ? campaign.interval_value : 1;
        switch (campaign.interval_unit || 'days') {
          case 'minutes': next.setMinutes(next.getMinutes() + value); break;
          case 'hours': next.setHours(next.getHours() + value); break;
          default: next.setDate(next.getDate() + value); break;
        }
        break;
      }
    }
  };
  let guard = 0;
  step();
  while (next.getTime() <= now.getTime() && guard < 10000) {
    const before = next.getTime();
    step();
    if (next.getTime() <= before) break;
    guard++;
  }
  return next;
}

// Busca campañas programadas vencidas y las envía (cron, cada minuto).
async function processDueCampaigns() {
  const due = await pool.query(
    `SELECT c.id FROM campaigns c
     LEFT JOIN instances i ON i.id = c.instance_id
     WHERE c.active = TRUE
       AND c.template_id IS NOT NULL
       AND c.status IN ('draft','scheduled')
       AND c.scheduled_at <= NOW()
       AND i.status = 'connected'
     ORDER BY c.scheduled_at ASC`
  );
  for (const row of due.rows) {
    try {
      const result = await executeCampaign(row.id);
      if (result && result.error) {
        console.warn(`[campaign-cron] campaña ${row.id} no enviada:`, result.error);
      }
    } catch (e) {
      console.warn(`[campaign-cron] fallo al enviar la campaña ${row.id}:`, e.message);
    }
  }
}

// =========================================================================
// 11. Templates
// =========================================================================
async function getTemplates(res, session) {
  const isAdmin = isAdminRole(session.role);
  const result = await pool.query(
    `SELECT * FROM templates
     ${isAdmin ? '' : 'WHERE user_id = $1'}
     ORDER BY created_at DESC`,
    isAdmin ? [] : [session.id]
  );
  sendJson(res, 200, { data: result.rows.map(enrichTemplate), success: true });
}
async function getTemplate(res, id, session) {
  const result = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Template no encontrado' });
  if (!isOwner(result.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta plantilla' });
  sendJson(res, 200, { data: enrichTemplate(result.rows[0]), success: true });
}
async function createTemplate(res, body, session) {
  const id = cuid();
  const result = await pool.query(
    `INSERT INTO templates (id, name, category, content, variables, preview, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, body.name, body.category || '', JSON.stringify(body.content || {}),
     body.variables || [], body.preview || '', session.id]
  );
  sendJson(res, 201, { data: enrichTemplate(result.rows[0]), success: true });
}
async function updateTemplate(res, id, body, session) {
  const owned = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
  if (owned.rows.length === 0) return sendJson(res, 404, { error: 'Template no encontrado' });
  if (!isOwner(owned.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta plantilla' });
  const result = await pool.query(
    `UPDATE templates SET name = COALESCE($1, name), category = COALESCE($2, category),
     content = COALESCE($3, content), variables = COALESCE($4, variables),
     preview = COALESCE($5, preview), updated_at = NOW() WHERE id = $6 RETURNING *`,
    [body.name || null, body.category !== undefined ? body.category : null,
     body.content ? JSON.stringify(body.content) : null,
     body.variables ? body.variables : null,
     body.preview !== undefined ? body.preview : null, id]
  );
  sendJson(res, 200, { data: enrichTemplate(result.rows[0]), success: true });
}
async function deleteTemplate(res, id, session) {
  const owned = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
  if (owned.rows.length === 0) return sendJson(res, 404, { error: 'Template no encontrado' });
  if (!isOwner(owned.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta plantilla' });
  await pool.query('DELETE FROM templates WHERE id = $1', [id]);
  sendJson(res, 200, { success: true });
}

function enrichTemplate(t) {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    content: typeof t.content === 'string' ? JSON.parse(t.content || '{}') : (t.content || {}),
    variables: typeof t.variables === 'string' ? JSON.parse(t.variables || '[]') : (t.variables || []),
    preview: t.preview,
    userId: t.user_id,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

// =========================================================================
// 12. Groups
// =========================================================================
function enrichGroup(g) {
  return {
    id: g.id,
    instanceId: g.instance_id,
    instanceName: g.instance_name || null,
    jid: g.jid,
    name: g.name,
    description: g.description,
    participants: g.participants || 0,
    tags: typeof g.tags === 'string' ? JSON.parse(g.tags || '[]') : (g.tags || []),
    excluded: g.excluded,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  };
}

async function getGroups(res, session) {
  const isAdmin = isAdminRole(session.role);
  const result = await pool.query(
    `SELECT g.*, i.name as instance_name FROM groups_ g
     LEFT JOIN instances i ON i.id = g.instance_id
     ${isAdmin ? '' : 'WHERE i.user_id = $1'}
     ORDER BY i.name, g.created_at DESC`,
    isAdmin ? [] : [session.id]
  );
  sendJson(res, 200, { data: result.rows.map(enrichGroup), success: true });
}
async function getGroup(res, id, session) {
  const result = await pool.query(
    `SELECT g.*, i.name as instance_name, i.user_id as inst_user_id FROM groups_ g
     LEFT JOIN instances i ON i.id = g.instance_id WHERE g.id = $1`, [id]
  );
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Grupo no encontrado' });
  if (!isOwner({ user_id: result.rows[0].inst_user_id }, session))
    return sendJson(res, 403, { error: 'No tienes acceso a este grupo' });
  sendJson(res, 200, { data: enrichGroup(result.rows[0]), success: true });
}
async function createGroup(res, body, session) {
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [body.instanceId]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const limits = await getUserPlanLimits(session.id, session.role);
  if (limits) {
    const used = parseInt((await pool.query(
      `SELECT COUNT(*)::int FROM groups_ g JOIN instances i ON i.id = g.instance_id
       WHERE i.user_id = $1 AND g.excluded = FALSE`, [session.id])).rows[0].count, 10);
    if (!enforceLimit(res, used, limits.maxGroups, 'grupos')) return;
  }
  const id = cuid();
  const result = await pool.query(
    `INSERT INTO groups_ (id, instance_id, jid, name, description, participants, tags, excluded)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, body.instanceId, body.jid, body.name || '', body.description || '',
     body.participants || 0, body.tags || [], body.excluded || false]
  );
  sendJson(res, 201, { data: enrichGroup(result.rows[0]), success: true });
}
async function updateGroup(res, id, body, session) {
  const cur = await pool.query(
    `SELECT g.*, i.user_id as inst_user_id FROM groups_ g
     LEFT JOIN instances i ON i.id = g.instance_id WHERE g.id = $1`, [id]
  );
  if (cur.rows.length === 0) return sendJson(res, 404, { error: 'Grupo no encontrado' });
  if (!isOwner({ user_id: cur.rows[0].inst_user_id }, session))
    return sendJson(res, 403, { error: 'No tienes acceso a este grupo' });
  const result = await pool.query(
    `UPDATE groups_ SET name = COALESCE($1, name), description = COALESCE($2, description),
     participants = COALESCE($3, participants), excluded = COALESCE($4, excluded),
     updated_at = NOW() WHERE id = $5 RETURNING *`,
    [body.name || null, body.description !== undefined ? body.description : null,
     body.participants || null, body.excluded !== undefined ? body.excluded : null, id]
  );
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Grupo no encontrado' });
  sendJson(res, 200, { data: enrichGroup(result.rows[0]), success: true });
}
async function deleteGroup(res, id, session) {
  const cur = await pool.query(
    `SELECT g.id, i.user_id as inst_user_id FROM groups_ g
     LEFT JOIN instances i ON i.id = g.instance_id WHERE g.id = $1`, [id]
  );
  if (cur.rows.length === 0) return sendJson(res, 404, { error: 'Grupo no encontrado' });
  if (!isOwner({ user_id: cur.rows[0].inst_user_id }, session))
    return sendJson(res, 403, { error: 'No tienes acceso a este grupo' });
  await pool.query('DELETE FROM groups_ WHERE id = $1', [id]);
  sendJson(res, 200, { success: true });
}
async function syncGroups(res, instanceId, session) {
  if (!instanceId) return sendJson(res, 400, { error: 'instanceId requerido' });
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [instanceId]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const i = inst.rows[0];
  let remoteGroups = null;
  const evoName = encodeURIComponent(evoInstanceName(i));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      remoteGroups = await fetchJson('GET', `${evolutionBaseUrl(i)}/group/fetchAllGroups/${evoName}?getParticipants=true`,
        { apikey: i.api_key });
      break;
    } catch (e) {
      if (attempt === 3) {
        return sendJson(res, 502, {
          error: 'No se pudieron obtener los grupos desde Evolution. Verifica que la instancia tenga la sesión de WhatsApp conectada.',
        });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const groupList = Array.isArray(remoteGroups)
    ? remoteGroups
    : (remoteGroups.value || remoteGroups.groups || []);
  const limits = await getUserPlanLimits(session.id, session.role);
  let synced = 0, created = 0;
  for (const g of groupList) {
    const jid = g.id || g.jid;
    const name = g.name || g.subject || '';
    const description = g.desc || g.description || '';
    const participants = g.size || (Array.isArray(g.participants) ? g.participants.length : 0) || 0;
    if (!jid) continue;
    const existing = await pool.query(
      'SELECT * FROM groups_ WHERE instance_id = $1 AND jid = $2',
      [instanceId, jid]
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].name !== name || (existing.rows[0].participants || 0) !== participants) {
        await pool.query('UPDATE groups_ SET name = $1, participants = $2, description = $3 WHERE id = $4',
          [name, participants, description, existing.rows[0].id]);
        synced++;
      }
    } else {
      if (limits) {
        const used = parseInt((await pool.query(
          `SELECT COUNT(*)::int FROM groups_ g JOIN instances i ON i.id = g.instance_id
           WHERE i.user_id = $1 AND g.excluded = FALSE`, [session.id])).rows[0].count, 10);
        if (!enforceLimit(res, used, limits.maxGroups, 'grupos')) return;
      }
      await pool.query(
        `INSERT INTO groups_ (id, instance_id, jid, name, description, participants)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cuid(), instanceId, jid, name, description, participants]
      );
      created++;
    }
  }
  const all = await pool.query(
    `SELECT g.*, i.name as instance_name FROM groups_ g
     LEFT JOIN instances i ON i.id = g.instance_id
     WHERE g.instance_id = $1 ORDER BY g.created_at DESC`, [instanceId]
  );
  sendJson(res, 200, {
    data: all.rows.map(enrichGroup),
    success: true,
    synced,
    created,
    total: groupList.length,
  });
}

// Normaliza un teléfono para participants de Evolution: números desnudos con
// código de país, o un JID ya completo (mantiene @g.us / @s.whatsapp.net).
function normalizeParticipant(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  if (s.includes('@')) return s;
  return s.replace(/[^\d]/g, '');
}

async function createRemoteGroup(res, body, session) {
  if (!body || !body.instanceId) return sendJson(res, 400, { error: 'instanceId requerido' });
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [body.instanceId]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });

  const name = String(body.name || '').trim();
  if (!name) return sendJson(res, 400, { error: 'El nombre del grupo es obligatorio' });

  const participants = [...new Set((Array.isArray(body.contacts) ? body.contacts : [])
    .map((c) => normalizeParticipant(c && c.phone))
    .filter(Boolean))];
  if (participants.length === 0) {
    return sendJson(res, 400, { error: 'Agrega al menos un contacto con número válido' });
  }

  const limits = await getUserPlanLimits(session.id, session.role);
  if (limits) {
    const used = parseInt((await pool.query(
      `SELECT COUNT(*)::int FROM groups_ g JOIN instances i ON i.id = g.instance_id
       WHERE i.user_id = $1 AND g.excluded = FALSE`, [session.id])).rows[0].count, 10);
    if (!enforceLimit(res, used, limits.maxGroups, 'grupos')) return;
  }

  const i = inst.rows[0];
  let created;
  try {
    created = await fetchJson(
      'POST',
      `${evolutionBaseUrl(i)}/group/create/${encodeURIComponent(evoInstanceName(i))}`,
      { apikey: i.api_key },
      {
        subject: name,
        name, // compat con versiones antiguas de Evolution
        description: String(body.description || ''),
        participants,
      }
    );
  } catch (e) {
    console.warn('Evolution group create failed:', e.message);
    return sendJson(res, 502, {
      error: `Evolution no pudo crear el grupo: ${e.message}. Verifica que la instancia tenga la sesión conectada y que los contactos tengan WhatsApp.`,
    });
  }

  const jid = (created && (created.group?.id || created.group?.jid || created.id || created.groupId
    || created.group?.key?.remoteJid || created.key?.remoteJid)) || '';
  if (!jid) {
    return sendJson(res, 502, { error: 'Evolution no devolvió el identificador del grupo creado' });
  }

  const existing = await pool.query(
    'SELECT * FROM groups_ WHERE instance_id = $1 AND jid = $2',
    [body.instanceId, jid]
  );
  if (existing.rows.length > 0) {
    return sendJson(res, 200, { data: enrichGroup(existing.rows[0]), success: true, duplicated: true });
  }

  const id = cuid();
  const result = await pool.query(
    `INSERT INTO groups_ (id, instance_id, jid, name, description, participants, tags, excluded)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, body.instanceId, jid, name, String(body.description || ''),
     participants.length, body.tags || [], false]
  );
  wsBroadcast('group:created', { id, instanceId: body.instanceId, jid, name });
  sendJson(res, 201, {
    data: enrichGroup(result.rows[0]),
    success: true,
    participantsAdded: participants.length,
  });
}

// =========================================================================
// 13. Chatbot
// =========================================================================
function enrichChatbotConfig(r) {
  if (!r) return null;
  return {
    id: r.id,
    instanceId: r.instance_id,
    isActive: r.is_active,
    systemPrompt: r.system_prompt,
    companyInfo: r.company_info || '',
    priceList: Array.isArray(r.price_list) ? r.price_list : (r.price_list ? JSON.parse(r.price_list) : []),
    calendar: r.calendar || '',
    maxTokens: r.max_tokens,
    temperature: r.temperature !== null && r.temperature !== undefined ? Number(r.temperature) : 0.7,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
// Arma el prompt de sistema que recibe la IA combinando el comportamiento
// definido por el usuario (system_prompt) con el conocimiento que alimentó
// por instancia: información de la empresa, lista de precios y calendario.
function buildChatbotSystemPrompt(config) {
  const parts = [];
  if (config.system_prompt && String(config.system_prompt).trim()) {
    parts.push(String(config.system_prompt).trim());
  }
  const company = (config.company_info || '').trim();
  if (company) parts.push(`INFORMACIÓN DE LA EMPRESA\n${company}`);
  const priceList = Array.isArray(config.price_list) ? config.price_list : [];
  const validPrices = priceList.filter((p) => p && String(p.name || '').trim());
  if (validPrices.length > 0) {
    const lines = validPrices.map((p) => {
      const name = String(p.name || '').trim();
      const price = String(p.price || '').trim();
      const description = String(p.description || '').trim();
      let line = `- ${name}`;
      if (price) line += `: ${price}`;
      if (description) line += ` (${description})`;
      return line;
    });
    parts.push(`LISTA DE PRECIOS\n${lines.join('\n')}`);
  }
  const calendar = (config.calendar || '').trim();
  if (calendar) parts.push(`CALENDARIO Y DISPONIBILIDAD\n${calendar}`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Documentos del bot (RAG): divide el contenido en fragmentos con solape,
// calcula embeddings con el proveedor de IA activo (cuando lo soporta) y, al
// responder, recupera los fragmentos más relevantes a la consulta para
// inyectarlos en el prompt. Si el proveedor no tiene embeddings o fallan, usa
// un score léxico por coincidencia de palabras (siempre funciona sin IA).
// ---------------------------------------------------------------------------
function chunkText(text, size = 900, overlap = 120) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const nl = clean.lastIndexOf('\n', end);
      const dot = clean.lastIndexOf('. ', end);
      const boundary = Math.max(nl, dot);
      if (boundary > start + size * 0.6) end = boundary + (boundary === dot ? 2 : 1);
    } else {
      const piece = clean.slice(start).trim();
      if (piece) chunks.push(piece);
      break;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    const next = Math.max(start + 1, end - overlap);
    if (next <= start || next >= clean.length) break;
    start = next;
  }
  return chunks;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function lexicalScore(query, text) {
  const qWords = String(query || '').toLowerCase().split(/[^a-z0-9áéíóúñüÁÉÍÓÚÑÜ]+/).filter((w) => w.length > 2);
  if (qWords.length === 0) return 0;
  const t = String(text || '').toLowerCase();
  let hits = 0;
  for (const w of qWords) if (t.includes(w)) hits++;
  return hits / qWords.length;
}

async function loadTenantAiSettingsForInstance(instance) {
  const tenantId = instance.user_id;
  if (!tenantId) return null;
  const aiConfig = (await pool.query('SELECT * FROM ai_configs WHERE user_id = $1', [tenantId])).rows[0];
  if (!aiConfig || !aiConfig.status) return null;
  return resolveAiSettings({ id: tenantId, role: 'user' }, aiConfig);
}

// Calcula embeddings de una lista de textos con la configuración de IA del
// tenant. Devuelve null si el proveedor no los soporta o falla (el llamador cae
// a búsqueda léxica).
async function embedBotTexts(instance, texts, settings) {
  let effective = settings;
  if (!effective || effective.error || !effective.provider) {
    try {
      effective = await loadTenantAiSettingsForInstance(instance);
    } catch (e) {
      return null;
    }
  }
  if (!effective || effective.error || !effective.provider || typeof effective.provider.embed !== 'function') {
    return null;
  }
  try {
    // Procesa en lotes para no saturar la API del proveedor con documentos
    // grandes (por ejemplo una hoja de cálculo importada con miles de filas).
    const BATCH = 24;
    const vectors = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const v = await effective.provider.embed(effective, batch);
      if (!Array.isArray(v) || v.length !== batch.length) return null;
      vectors.push(...v);
    }
    return vectors.map((vec) => (Array.isArray(vec) && vec.length > 0 ? vec : null));
  } catch (e) {
    console.warn('[RAG] embed falló, usando búsqueda léxica:', e.message);
    return null;
  }
}

// Recupera los fragmentos más relevantes de los documentos de la instancia.
// @param settings  configuración de IA ya resuelta (opcional, evita re-resolver)
// @param documentId  limita la búsqueda a un documento concreto
async function retrieveBotContext(instance, query, limit = 4, settings, documentId) {
  const q = String(query || '').trim();
  if (!q) return [];
  const params = [instance.id];
  let where = 'c.instance_id = $1';
  if (documentId) {
    params.push(documentId);
    where += ' AND c.document_id = $' + params.length;
  }
  const chunks = (await pool.query(
    `SELECT c.content, c.embedding, d.title FROM bot_document_chunks c
     JOIN bot_documents d ON d.id = c.document_id
     WHERE ${where} ORDER BY c.created_at DESC`, params
  )).rows;
  if (chunks.length === 0) return [];
  let queryVec = null;
  const vectors = await embedBotTexts(instance, [q], settings);
  if (vectors) queryVec = vectors[0];
  const scored = chunks.map((c) => {
    const emb = c.embedding ? (typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding) : null;
    const score = queryVec && emb ? cosineSimilarity(queryVec, emb) : lexicalScore(q, c.content);
    return { title: c.title || null, content: c.content, score };
  });
  return scored
    .filter((s) => s.score > (queryVec ? 0.15 : 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function enrichBotDocument(r) {
  if (!r) return null;
  return {
    id: r.id,
    instanceId: r.instance_id,
    title: r.title,
    status: r.status || 'stored',
    error: r.error || null,
    source: r.source || 'manual',
    sourceRef: r.source_ref || null,
    sourceUrl: r.source_url || null,
    chunkCount: parseInt(r.chunk_count, 10) || 0,
    charCount: r.content ? r.content.length : 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function getChatbotDocuments(res, req, session) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const iid = u.searchParams.get('instanceId');
  if (iid && !(await loadInstanceForUser(iid, session))) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  }
  let q = `SELECT d.*, COUNT(c.id)::int AS chunk_count FROM bot_documents d
           LEFT JOIN bot_document_chunks c ON c.document_id = d.id`;
  const params = [];
  const conds = [];
  if (iid) {
    params.push(iid);
    conds.push('d.instance_id = $' + params.length);
  }
  if (!isAdminRole(session.role)) {
    q += ' LEFT JOIN instances i ON i.id = d.instance_id';
    params.push(session.id);
    conds.push('i.user_id = $' + params.length);
  }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' GROUP BY d.id ORDER BY d.created_at DESC';
  const result = await pool.query(q, params);
  sendJson(res, 200, { data: result.rows.map(enrichBotDocument), success: true });
}

async function createChatbotDocument(res, body, session) {
  if (!body.instanceId) return sendJson(res, 400, { error: 'instanceId requerido' });
  const inst = await loadInstanceForUser(body.instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!title) return sendJson(res, 400, { error: 'El título es requerido' });
  if (!content) return sendJson(res, 400, { error: 'El contenido es requerido' });
  if (content.length < 30) return sendJson(res, 400, { error: 'El contenido es demasiado corto para alimentar al bot' });
  const saved = await storeBotDocument(inst, title, content);
  if (saved.ok === false) return sendJson(res, 400, { error: saved.error || 'El contenido no se pudo procesar' });
  const row = (await pool.query(
    `SELECT d.*, COUNT(c.id)::int AS chunk_count FROM bot_documents d
     LEFT JOIN bot_document_chunks c ON c.document_id = d.id
     WHERE d.id = $1 GROUP BY d.id`, [saved.id]
  )).rows[0];
  sendJson(res, 201, { data: enrichBotDocument(row), success: true });
}

// Divide el contenido en fragmentos, calcula embeddings (si el proveedor los
// soporta) y guarda el documento con sus chunks. Se usa tanto para los
// documentos manuales como para los importados desde Google.
async function storeBotDocument(instance, title, content, extra = {}) {
  const chunks = chunkText(content);
  if (chunks.length === 0) return { ok: false, error: 'El contenido no se pudo procesar' };
  const id = cuid();
  let embeddings = null;
  try {
    embeddings = await embedBotTexts(instance, chunks);
  } catch (e) {
    embeddings = null;
  }
  const status = embeddings ? 'stored' : 'lexical';
  const error = embeddings ? null : 'El proveedor de IA no expone embeddings o fallaron: el bot usará búsqueda por palabras.';
  await pool.query(
    `INSERT INTO bot_documents (id, instance_id, title, content, status, error, source, source_ref, source_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, instance.id, title, content, status, error, extra.source || 'manual', extra.sourceRef || null, extra.sourceUrl || null]
  );
  for (let i = 0; i < chunks.length; i++) {
    const emb = embeddings && embeddings[i];
    await pool.query(
      `INSERT INTO bot_document_chunks (id, document_id, instance_id, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [cuid(), id, instance.id, i, chunks[i], emb ? JSON.stringify(emb) : null]
    );
  }
  return { ok: true, id, status, error, chunkCount: chunks.length };
}

async function deleteChatbotDocument(res, id, session) {
  const row = (await pool.query('SELECT * FROM bot_documents WHERE id = $1', [id])).rows[0];
  if (!row) return sendJson(res, 404, { error: 'Documento no encontrado' });
  if (!isAdminRole(session.role) && !(await loadInstanceForUser(row.instance_id, session))) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  }
  await pool.query('DELETE FROM bot_documents WHERE id = $1', [id]);
  sendJson(res, 200, { success: true });
}

async function testChatbotDocumentQuery(res, body, session) {
  const instanceId = body.instanceId;
  const query = String(body.query || '').trim();
  if (!instanceId || !query) return sendJson(res, 400, { error: 'instanceId y query son requeridos' });
  const inst = await loadInstanceForUser(instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const context = await retrieveBotContext(inst, query, 4);
  sendJson(res, 200, {
    data: context.map((c) => ({
      title: c.title,
      content: c.content,
      score: Number(c.score.toFixed(4)),
    })),
    success: true,
  });
}

// ---------------------------------------------------------------------------
// Integración con Google (OAuth por instancia + fuentes de hojas/docs/agenda)
// ---------------------------------------------------------------------------
async function googleOAuthCallback(res, q) {
  const code = q.searchParams.get('code');
  const state = q.searchParams.get('state');
  const home = `${String(APP_URL).replace(/\/+$/, '')}/app/chatbot`;
  const fail = `${home}?google=error`;
  if (!code || !state) {
    res.writeHead(302, { Location: fail });
    return res.end();
  }
  try {
    await googleClient.handleCallback(code, state);
    res.writeHead(302, { Location: `${home}?google=connected` });
    return res.end();
  } catch (e) {
    console.warn('[Google] OAuth callback error:', e.message);
    res.writeHead(302, { Location: fail });
    return res.end();
  }
}

// ---------------------------------------------------------------------------
// Admin: configuración OAuth de Google del sistema (Client ID/Secret).
// Si no hay config en la BD se usan las variables de entorno.
// ---------------------------------------------------------------------------
async function getGoogleOAuthConfig(res, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar la configuración de Google' });
  const cfg = await googleClient.getOAuthConfigPublic();
  sendJson(res, 200, { data: cfg, success: true });
}

async function setGoogleOAuthConfig(res, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar la configuración de Google' });
  const clientId = (body.clientId || '').trim();
  const clientSecret = (body.clientSecret || '').trim();
  if (!clientId || !clientSecret) {
    return sendJson(res, 400, { error: 'El Client ID y el Client Secret son requeridos' });
  }
  if (!/^[\w\-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    return sendJson(res, 400, { error: 'El Client ID no tiene el formato esperado (termina en .apps.googleusercontent.com)' });
  }
  await googleClient.setOAuthConfig(clientId, clientSecret);
  logAiAudit(session, 'google_oauth_set', `Credenciales de Google OAuth configuradas (Client ID ${clientId})`);
  sendJson(res, 201, { data: { success: true }, success: true });
}

async function clearGoogleOAuthConfig(res, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar la configuración de Google' });
  await googleClient.clearOAuthConfig();
  logAiAudit(session, 'google_oauth_removed', 'Credenciales de Google OAuth eliminadas');
  sendJson(res, 200, { data: { success: true }, success: true });
}

async function handleGoogleRoutes(res, req, session, seg) {
  const method = req.method;
  const q = new URL(req.url, `http://${req.headers.host}`);
  const iid = q.searchParams.get('instanceId') || '';
  if (iid && !(await loadInstanceForUser(iid, session))) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  }
  if (method === 'GET' && seg[0] === 'auth-url') {
    if (!(await googleClient.isConfigured())) {
      return sendJson(res, 400, {
        error: 'Google no está configurado: faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (configúralo en Administración → Google OAuth o guíate por DOCUMENTACION.md)',
      });
    }
    if (!iid) return sendJson(res, 400, { error: 'Selecciona la instancia antes de conectar Google' });
    return sendJson(res, 200, { data: { url: await googleClient.buildAuthUrl(session.id, iid) }, success: true });
  }
  if (method === 'GET' && seg[0] === 'status') {
    if (!iid) return sendJson(res, 200, { data: { connected: false, email: null }, success: true });
    const conn = await googleClient.getConnection(iid).catch(() => null);
    return sendJson(res, 200, {
      data: { connected: Boolean(conn && conn.email), email: conn ? conn.email : null },
      success: true,
    });
  }
  if (method === 'DELETE' && seg.length === 0) {
    if (!iid) return sendJson(res, 400, { error: 'instanceId requerido' });
    await googleClient.disconnect(iid);
    return sendJson(res, 200, { success: true });
  }
  if (method === 'GET' && seg[0] === 'files') {
    const kind = q.searchParams.get('kind') === 'docs' ? 'docs' : 'sheets';
    try {
      const files = await googleClient.listFiles(iid, kind);
      return sendJson(res, 200, { data: files, success: true });
    } catch (e) {
      return sendJson(res, 400, { error: googleApiErrorMessage(e) });
    }
  }
  if (method === 'GET' && seg[0] === 'calendars') {
    try {
      const calendars = await googleClient.listCalendars(iid);
      return sendJson(res, 200, { data: calendars, success: true });
    } catch (e) {
      return sendJson(res, 400, { error: googleApiErrorMessage(e) });
    }
  }
  if (method === 'GET' && seg[0] === 'sources') {
    if (!iid) return sendJson(res, 400, { error: 'instanceId requerido' });
    const result = await pool.query('SELECT * FROM instance_google_sources WHERE instance_id = $1', [iid]);
    const row = result.rows[0] || null;
    return sendJson(res, 200, {
      data: row ? {
        sheetId: row.sheet_id || '',
        sheetName: row.sheet_name || '',
        sheetRange: row.sheet_range || 'A1:Z200',
        docIds: Array.isArray(row.doc_ids) ? row.doc_ids : [],
        calendarId: row.calendar_id || '',
        calendarDays: row.calendar_days || 30,
      } : null,
      success: true,
    });
  }
  if (method === 'POST' && seg[0] === 'sources') {
    return await saveGoogleSources(res, await parseBody(req), session);
  }
  if (method === 'POST' && seg[0] === 'import') {
    return await importGoogleSource(res, await parseBody(req), session);
  }
  return sendJson(res, 404, { error: 'Not found' });
}

async function saveGoogleSources(res, body, session) {
  if (!body.instanceId) return sendJson(res, 400, { error: 'instanceId requerido' });
  const inst = await loadInstanceForUser(body.instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const docIds = Array.isArray(body.docIds)
    ? body.docIds.map((d) => String(d).trim()).filter(Boolean)
    : [];
  const existing = await pool.query('SELECT * FROM instance_google_sources WHERE instance_id = $1', [body.instanceId]);
  const payload = [
    String(body.sheetId || ''),
    String(body.sheetName || ''),
    String(body.sheetRange || 'A1:Z200'),
    docIds,
    String(body.calendarId || ''),
    Math.min(Math.max(parseInt(body.calendarDays, 10) || 30, 1), 365),
  ];
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE instance_google_sources
       SET sheet_id = $1, sheet_name = $2, sheet_range = $3, doc_ids = $4,
           calendar_id = $5, calendar_days = $6, updated_at = NOW()
       WHERE instance_id = $7`,
      [...payload, body.instanceId]
    );
  } else {
    await pool.query(
      `INSERT INTO instance_google_sources
         (id, instance_id, sheet_id, sheet_name, sheet_range, doc_ids, calendar_id, calendar_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [cuid(), body.instanceId, ...payload]
    );
  }
  sendJson(res, 200, { success: true });
}

function googleApiErrorMessage(e) {
  if (e && e.code === 'NO_CONNECTION') return 'Conecta tu cuenta de Google antes de importar contenido.';
  if (e && e.status === 401) return 'La conexión con Google caducó o fue revocada. Reconecta tu cuenta.';
  if (e && e.status === 403) return 'Google rechazó el acceso a este recurso. Revisa los permisos otorgados.';
  if (e && e.status === 404) return 'No se encontró el archivo o calendario. Puede que haya sido eliminado.';
  return (e && e.message) || 'Error al comunicarse con Google';
}

async function importGoogleSource(res, body, session) {
  if (!body.instanceId) return sendJson(res, 400, { error: 'instanceId requerido' });
  const inst = await loadInstanceForUser(body.instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const type = String(body.type || 'sheet');
  let imported;
  try {
    if (type === 'sheet') {
      if (!body.fileId) return sendJson(res, 400, { error: 'Selecciona una hoja de cálculo' });
      imported = await googleClient.importSheet(inst.id, body.fileId);
    } else if (type === 'docs') {
      if (!body.fileId) return sendJson(res, 400, { error: 'Selecciona un documento' });
      imported = await googleClient.importDocs(inst.id, body.fileId);
    } else if (type === 'calendar') {
      if (!body.calendarId) return sendJson(res, 400, { error: 'Selecciona un calendario' });
      imported = await googleClient.importCalendar(inst.id, body.calendarId, body.days);
    } else {
      return sendJson(res, 400, { error: 'Tipo de fuente no válido' });
    }
  } catch (e) {
    return sendJson(res, 400, { error: googleApiErrorMessage(e) });
  }
  if (!imported || !imported.content || imported.content.length < 30) {
    return sendJson(res, 400, { error: 'La fuente importada no contiene texto suficiente para alimentar al bot' });
  }
  const saved = await storeBotDocument(inst, imported.title, imported.content, {
    source: type,
    sourceRef: type === 'calendar' ? String(body.calendarId || '') : String(body.fileId || ''),
    sourceUrl: imported.url || null,
  });
  if (saved.ok === false) return sendJson(res, 400, { error: saved.error || 'El contenido importado no se pudo procesar' });
  const row = (await pool.query(
    `SELECT d.*, COUNT(c.id)::int AS chunk_count FROM bot_documents d
     LEFT JOIN bot_document_chunks c ON c.document_id = d.id
     WHERE d.id = $1 GROUP BY d.id`, [saved.id]
  )).rows[0];
  sendJson(res, 201, { data: enrichBotDocument(row), success: true });
}

async function getChatbotConfig(res, instanceId, session) {
  const inst = await loadInstanceForUser(instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const result = await pool.query('SELECT * FROM chatbot_configs WHERE instance_id = $1', [instanceId]);
  if (result.rows.length === 0) return sendJson(res, 200, { data: null, success: true });
  sendJson(res, 200, { data: enrichChatbotConfig(result.rows[0]), success: true });
}
async function saveChatbotConfig(res, body, session) {
  if (!body.instanceId) return sendJson(res, 400, { error: 'instanceId requerido' });
  const inst = await loadInstanceForUser(body.instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  if (body.isActive !== false) {
    const limits = await getUserPlanLimits(session.id, session.role);
    if (limits && !limits.chatbotEnabled) {
      return sendJson(res, 403, {
        error: 'Tu plan no incluye el chatbot con IA. Mejora tu plan para activarlo.',
        code: 'PLAN_FEATURE_DISABLED',
      });
    }
  }
  const existing = await pool.query('SELECT * FROM chatbot_configs WHERE instance_id = $1', [body.instanceId]);
  let result;
  const temperature = body.temperature !== undefined && body.temperature !== null ? body.temperature : 0.7;
  const priceList = Array.isArray(body.priceList) ? body.priceList : [];
  const companyInfo = body.companyInfo !== undefined ? body.companyInfo : '';
  const calendar = body.calendar !== undefined ? body.calendar : '';
  if (existing.rows.length > 0) {
    result = await pool.query(
      `UPDATE chatbot_configs SET is_active = $1, system_prompt = $2, max_tokens = $3,
       temperature = $4, company_info = $5, price_list = $6, calendar = $7,
       updated_at = NOW() WHERE instance_id = $8 RETURNING *`,
      [body.isActive !== false, body.systemPrompt || existing.rows[0].system_prompt,
       body.maxTokens || existing.rows[0].max_tokens, temperature,
       companyInfo, JSON.stringify(priceList), calendar, body.instanceId]
    );
  } else {
    const id = cuid();
    result = await pool.query(
      `INSERT INTO chatbot_configs (id, instance_id, is_active, system_prompt, max_tokens, temperature, company_info, price_list, calendar)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, body.instanceId, body.isActive !== false,
       body.systemPrompt || 'Eres un vendedor experto...', body.maxTokens || 200, temperature,
       companyInfo, JSON.stringify(priceList), calendar]
    );
  }
  sendJson(res, 200, { data: enrichChatbotConfig(result.rows[0]), success: true });
}
async function togglePauseChat(res, body, session) {
  const { instanceId, senderJid, paused } = body;
  if (!instanceId || !senderJid || paused === undefined) {
    return sendJson(res, 400, { error: 'instanceId, senderJid y paused son requeridos' });
  }
  const inst = await loadInstanceForUser(instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  if (paused) {
    const id = cuid();
    await pool.query(
      'INSERT INTO chatbot_paused (id, instance_id, sender_jid) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, instanceId, senderJid]
    );
  } else {
    await pool.query(
      'DELETE FROM chatbot_paused WHERE instance_id = $1 AND sender_jid = $2',
      [instanceId, senderJid]
    );
  }
  sendJson(res, 200, { success: true });
}
async function getPausedChats(res, req, session) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const iid = u.searchParams.get('instanceId');
  const isAdmin = isAdminRole(session.role);
  if (iid && !(await loadInstanceForUser(iid, session))) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  }
  let q = `SELECT cp.*, i.name as instance_name FROM chatbot_paused cp
           LEFT JOIN instances i ON i.id = cp.instance_id`;
  const params = [];
  const conds = [];
  if (iid) conds.push('cp.instance_id = $' + (params.length + 1));
  if (!isAdmin) conds.push('i.user_id = $' + (params.length + 1));
  if (iid) params.push(iid);
  if (!isAdmin) params.push(session.id);
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY cp.created_at DESC';
  const result = await pool.query(q, params);
  const rows = result.rows.map((r) => ({
    id: r.id,
    instanceId: r.instance_id,
    instanceName: r.instance_name,
    senderJid: r.sender_jid,
    createdAt: r.created_at,
  }));
  sendJson(res, 200, { data: rows, success: true });
}
async function removePausedChat(res, req, session) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const iid = u.searchParams.get('instanceId');
  const sj = u.searchParams.get('senderJid');
  const inst = await loadInstanceForUser(iid, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  await pool.query(
    'DELETE FROM chatbot_paused WHERE instance_id = $1 AND sender_jid = $2',
    [iid, sj]
  );
  sendJson(res, 200, { success: true });
}

// =========================================================================
// 14. Auto-replies
// =========================================================================
function enrichAutoReply(r) {
  return {
    id: r.id,
    instanceId: r.instance_id,
    instanceName: r.instance_name || null,
    name: r.name,
    trigger: r.trigger,
    response: r.response,
    isActive: r.is_active,
    useAi: r.use_ai === true,
    aiInstructions: r.ai_instructions || null,
    documentId: r.document_id || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
async function getAutoReplies(res, session) {
  const isAdmin = isAdminRole(session.role);
  const result = await pool.query(
    `SELECT ar.*, i.name as instance_name FROM auto_replies ar
     LEFT JOIN instances i ON i.id = ar.instance_id
     ${isAdmin ? '' : 'WHERE i.user_id = $1'}
     ORDER BY ar.created_at DESC`,
    isAdmin ? [] : [session.id]
  );
  sendJson(res, 200, { data: result.rows.map(enrichAutoReply), success: true });
}
async function getAutoReply(res, id, session) {
  const result = await pool.query(
    `SELECT ar.*, i.name as instance_name, i.user_id as owner_user_id FROM auto_replies ar
     LEFT JOIN instances i ON i.id = ar.instance_id WHERE ar.id = $1`, [id]
  );
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Auto-reply no encontrado' });
  const row = result.rows[0];
  if (!isAdminRole(session.role) && String(row.owner_user_id) !== String(session.id)) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta auto-respuesta' });
  }
  sendJson(res, 200, { data: enrichAutoReply(row), success: true });
}
async function autoReplyDocumentValid(documentId, instanceId) {
  if (!documentId) return true;
  const row = (await pool.query(
    'SELECT id FROM bot_documents WHERE id = $1 AND instance_id = $2', [documentId, instanceId]
  )).rows[0];
  return !!row;
}

async function createAutoReply(res, body, session) {
  const useAi = body.useAi === true;
  if (!body.instanceId || !body.name || !body.trigger) {
    return sendJson(res, 400, { error: 'instanceId, name y trigger son requeridos' });
  }
  if (!useAi && !body.response) {
    return sendJson(res, 400, { error: 'response es requerido (o activa el modo IA)' });
  }
  const inst = await loadInstanceForUser(body.instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  if (body.documentId && !(await autoReplyDocumentValid(body.documentId, body.instanceId))) {
    return sendJson(res, 400, { error: 'El documento seleccionado no pertenece a esta instancia' });
  }
  const limits = await getUserPlanLimits(session.id, session.role);
  if (limits) {
    const used = parseInt((await pool.query(
      `SELECT COUNT(*)::int FROM auto_replies ar JOIN instances i ON i.id = ar.instance_id
       WHERE i.user_id = $1`, [session.id])).rows[0].count, 10);
    if (!enforceLimit(res, used, limits.maxAutoReplies, 'auto-respuestas')) return;
  }
  const id = cuid();
  const result = await pool.query(
    `INSERT INTO auto_replies (id, instance_id, name, trigger, response, is_active, use_ai, ai_instructions, document_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, body.instanceId, body.name, body.trigger, body.response || '', body.isActive !== false,
      useAi, body.aiInstructions || null, body.documentId || null]
  );
  sendJson(res, 201, { data: enrichAutoReply(result.rows[0]), success: true });
}
async function updateAutoReply(res, id, body, session) {
  const existing = await pool.query(
    'SELECT ar.*, i.user_id as owner_user_id FROM auto_replies ar LEFT JOIN instances i ON i.id = ar.instance_id WHERE ar.id = $1',
    [id]
  );
  if (existing.rows.length === 0) return sendJson(res, 404, { error: 'Auto-reply no encontrado' });
  if (!isAdminRole(session.role) && String(existing.rows[0].owner_user_id) !== String(session.id)) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta auto-respuesta' });
  }
  if (body.instanceId && !(await loadInstanceForUser(body.instanceId, session))) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  }
  const targetInstanceId = body.instanceId || existing.rows[0].instance_id;
  if (body.documentId !== undefined && body.documentId && !(await autoReplyDocumentValid(body.documentId, targetInstanceId))) {
    return sendJson(res, 400, { error: 'El documento seleccionado no pertenece a esta instancia' });
  }
  const DOC_UNSET = '___UNSET___';
  const result = await pool.query(
    `UPDATE auto_replies SET name = COALESCE($1, name), trigger = COALESCE($2, trigger),
     response = COALESCE($3, response), is_active = COALESCE($4, is_active),
     instance_id = COALESCE($5, instance_id),
     use_ai = CASE WHEN $7::boolean IS NULL THEN use_ai ELSE $7 END,
     ai_instructions = COALESCE($8, ai_instructions),
     document_id = CASE WHEN $9 = $10 THEN document_id ELSE $9::text END,
     updated_at = NOW() WHERE id = $6 RETURNING *`,
    [body.name || null, body.trigger || null, body.response || null,
     body.isActive !== undefined ? body.isActive : null, body.instanceId || null, id,
     body.useAi !== undefined ? body.useAi : null, body.aiInstructions !== undefined ? body.aiInstructions : null,
     body.documentId !== undefined ? (body.documentId || null) : DOC_UNSET, DOC_UNSET]
  );
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Auto-reply no encontrado' });
  sendJson(res, 200, { data: enrichAutoReply(result.rows[0]), success: true });
}
async function deleteAutoReply(res, id, session) {
  const existing = await pool.query(
    'SELECT ar.*, i.user_id as owner_user_id FROM auto_replies ar LEFT JOIN instances i ON i.id = ar.instance_id WHERE ar.id = $1',
    [id]
  );
  if (existing.rows.length === 0) return sendJson(res, 404, { error: 'Auto-reply no encontrado' });
  if (!isAdminRole(session.role) && String(existing.rows[0].owner_user_id) !== String(session.id)) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta auto-respuesta' });
  }
  const result = await pool.query('DELETE FROM auto_replies WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Auto-reply no encontrado' });
  sendJson(res, 200, { success: true });
}

// =========================================================================
// 15. Billing
// =========================================================================
// Máquina de estados del plan de un usuario:
//   active  -> dentro de billing_period_end
//   overdue -> período terminado, todavía dentro de la gracia (puede seguir usando)
//   blocked -> gracia terminada, cuenta suspendida hasta pagar una factura
function computeBillingState(user, now = new Date()) {
  const periodEnd = user.billing_period_end ? new Date(user.billing_period_end) : null;
  const graceEnd = user.grace_period_end ? new Date(user.grace_period_end) : null;
  let status = 'active';
  if (periodEnd && now > periodEnd) {
    // Un período que terminó sin ventana de gracia asignada sigue siendo "overdue":
    // el job abre la gracia en la siguiente revisión antes de bloquear.
    status = graceEnd ? (now <= graceEnd ? 'overdue' : 'blocked') : 'overdue';
  }
  if (user.role === 'admin') status = 'active';
  return { status, nextBillingDate: periodEnd ? periodEnd.toISOString() : null };
}

function enrichInvoice(inv) {
  const period = inv.period
    || (inv.created_at
      ? new Date(inv.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      : '');
  return {
    id: inv.id,
    number: inv.number || `INV-${String(inv.id).slice(0, 6).toUpperCase()}`,
    period,
    amount: parseFloat(inv.amount || PLAN_AMOUNT),
    status: inv.status,
    date: inv.created_at,
    dueDate: inv.due_date || null,
    paidAt: inv.paid_at || null,
  };
}

function enrichPaymentDestination(pd) {
  return {
    id: pd.id,
    type: pd.type,
    customType: pd.custom_type || null,
    name: pd.name,
    holder: pd.holder,
    detail: pd.detail,
    instructions: pd.instructions,
    isActive: !!pd.is_active,
    sortOrder: pd.sort_order,
    createdAt: pd.created_at,
  };
}

function enrichReportedPayment(rp) {
  return {
    id: rp.id,
    userId: rp.user_id,
    userName: rp.user_name,
    destinationId: rp.destination_id,
    destinationName: rp.destination_name,
    amount: parseFloat(rp.amount || 0),
    reference: rp.reference,
    paymentDate: rp.payment_date,
    status: rp.status,
    note: rp.note,
    verifiedBy: rp.verified_by,
    verifiedAt: rp.verified_at,
    createdAt: rp.created_at,
  };
}

const DESTINATION_TYPES = ['banco', 'billetera', 'pagomovil', 'binance_usdt', 'otro'];

async function getPaymentDestinations(res, session) {
  // Admin ve todos los metodos; el usuario solo los activos (donde puede pagar)
  const q = isAdminRole(session.role)
    ? 'SELECT * FROM payment_destinations ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM payment_destinations WHERE is_active = TRUE ORDER BY sort_order ASC, created_at ASC';
  const result = await pool.query(q);
  sendJson(res, 200, { data: result.rows.map(enrichPaymentDestination), success: true });
}

async function createPaymentDestination(res, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar métodos de pago' });
  const type = (body.type || 'banco').toString();
  const name = (body.name || '').toString().trim();
  if (!name) return sendJson(res, 400, { error: 'El nombre del método de pago es requerido' });
  if (!DESTINATION_TYPES.includes(type)) return sendJson(res, 400, { error: 'Tipo de método de pago inválido' });
  const customType = (body.customType || '').toString().trim() || null;
  if (type === 'otro' && !customType) return sendJson(res, 400, { error: 'Indica el tipo personalizado del método de pago' });
  const id = cuid();
  const result = await pool.query(
    `INSERT INTO payment_destinations (id, type, custom_type, name, holder, detail, instructions, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, type, customType, name, body.holder || null, body.detail || null, body.instructions || null,
     body.isActive !== false, parseInt(body.sortOrder || 0, 10) || 0]
  );
  sendJson(res, 201, { data: enrichPaymentDestination(result.rows[0]), success: true });
}

async function updatePaymentDestination(res, id, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar métodos de pago' });
  const type = (body.type || 'banco').toString();
  const name = (body.name || '').toString().trim();
  if (!name) return sendJson(res, 400, { error: 'El nombre del método de pago es requerido' });
  if (!DESTINATION_TYPES.includes(type)) return sendJson(res, 400, { error: 'Tipo de método de pago inválido' });
  const customType = (body.customType || '').toString().trim() || null;
  if (type === 'otro' && !customType) return sendJson(res, 400, { error: 'Indica el tipo personalizado del método de pago' });
  const result = await pool.query(
    `UPDATE payment_destinations SET type = $1, custom_type = $2, name = $3, holder = $4, detail = $5,
     instructions = $6, is_active = $7, sort_order = $8, updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [type, customType, name, body.holder || null, body.detail || null, body.instructions || null,
     body.isActive !== false, parseInt(body.sortOrder || 0, 10) || 0, id]
  );
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Método de pago no encontrado' });
  sendJson(res, 200, { data: enrichPaymentDestination(result.rows[0]), success: true });
}

async function deletePaymentDestination(res, id, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar métodos de pago' });
  const result = await pool.query('DELETE FROM payment_destinations WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Método de pago no encontrado' });
  sendJson(res, 200, { success: true });
}

async function reportPayment(res, body, session) {
  const destinationId = (body.destinationId || '').toString();
  const reference = (body.reference || '').toString().trim();
  if (!destinationId) return sendJson(res, 400, { error: 'Selecciona un método de pago' });
  if (!reference) return sendJson(res, 400, { error: 'Ingresa el número de referencia o comprobante del pago' });
  const dest = (await pool.query('SELECT * FROM payment_destinations WHERE id = $1 AND is_active = TRUE', [destinationId])).rows[0];
  if (!dest) return sendJson(res, 400, { error: 'Método de pago no válido' });
  const user = (await pool.query('SELECT name FROM users WHERE id = $1', [session.id])).rows[0];
  const amount = parseFloat(body.amount) || PLAN_AMOUNT;
  const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();
  const id = cuid();
  const result = await pool.query(
    `INSERT INTO reported_payments (id, user_id, user_name, destination_id, destination_name, amount, reference, payment_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
    [id, session.id, user?.name || session.name || '', dest.id, dest.name, amount, reference, paymentDate]
  );
  sendJson(res, 201, { data: enrichReportedPayment(result.rows[0]), success: true });
}

async function getReportedPayments(res, session) {
  const q = isAdminRole(session.role)
    ? 'SELECT * FROM reported_payments ORDER BY created_at DESC'
    : 'SELECT * FROM reported_payments WHERE user_id = $1 ORDER BY created_at DESC';
  const params = isAdminRole(session.role) ? [] : [session.id];
  const result = await pool.query(q, params);
  sendJson(res, 200, { data: result.rows.map(enrichReportedPayment), success: true });
}

async function verifyReportedPayment(res, id, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede verificar pagos' });
  const rp = (await pool.query('SELECT * FROM reported_payments WHERE id = $1', [id])).rows[0];
  if (!rp) return sendJson(res, 404, { error: 'Pago reportado no encontrado' });
  if (rp.status !== 'pending') return sendJson(res, 400, { error: 'Este pago ya fue procesado' });
  await pool.query(
    `UPDATE reported_payments SET status = 'verified', verified_by = $1, verified_at = NOW() WHERE id = $2`,
    [session.name || session.email, id]
  );

  // Confirmar el pago renueva el plan del usuario 30 dias y marca su factura pendiente como pagada
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86400000);
  await pool.query(
    `UPDATE users SET billing_status = 'active', billing_period_start = $1, billing_period_end = $2,
     grace_period_end = NULL, updated_at = NOW() WHERE id = $3`,
    [now, periodEnd, rp.user_id]
  );
  // Al pagar el propietario se reactiva toda la organización: se levanta el
  // bloqueo en cascada por falta de pago (dueño y miembros).
  const payer = (await pool.query(
    'SELECT role, organization_id FROM users WHERE id = $1', [rp.user_id]
  ).catch(() => ({ rows: [] }))).rows[0];
  if (payer && payer.role === 'owner' && payer.organization_id) {
    await pool.query(
      `UPDATE users SET blocked = FALSE, blocked_at = NULL, blocked_reason = NULL, updated_at = NOW()
       WHERE organization_id = $1 AND blocked_reason = $2`,
      [payer.organization_id, 'Falta de pago de la organización']
    );
  }
  const pending = (await pool.query(
    "SELECT id FROM invoices WHERE user_id = $1 AND status = 'pending' ORDER BY created_at ASC LIMIT 1",
    [rp.user_id]
  )).rows[0];
  if (pending) {
    await pool.query('UPDATE invoices SET status = $1, paid_at = $2, updated_at = $2 WHERE id = $3', ['paid', now, pending.id]);
  }
  const nextPeriod = new Date(now.getTime() + 30 * 86400000).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  await pool.query(
    `INSERT INTO invoices (id, number, period, amount, status, user_id, due_date)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
    [cuid(), `INV-${cuid().slice(0, 6).toUpperCase()}`, nextPeriod, PLAN_AMOUNT, rp.user_id, periodEnd]
  );

  sendJson(res, 200, { data: { id, status: 'verified' }, success: true });
}

async function rejectReportedPayment(res, id, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar pagos' });
  const rp = (await pool.query('SELECT * FROM reported_payments WHERE id = $1', [id])).rows[0];
  if (!rp) return sendJson(res, 404, { error: 'Pago reportado no encontrado' });
  if (rp.status !== 'pending') return sendJson(res, 400, { error: 'Este pago ya fue procesado' });
  await pool.query(
    `UPDATE reported_payments SET status = 'rejected', note = $1, verified_by = $2, verified_at = NOW() WHERE id = $3`,
    [(body.note || '').toString().trim(), session.name || session.email, id]
  );
  sendJson(res, 200, { data: { id, status: 'rejected' }, success: true });
}

function getUserIdScope(session) {
  return isAdminRole(session.role) ? null : session.id;
}

// =========================================================================
// 15b. Planes del landing (mensual / anual) administrados por el admin
// =========================================================================
// Límites por defecto cuando el usuario no tiene un plan reconocible en la BD
// de planes (fallback al plan Starter).
const DEFAULT_PLAN_LIMITS = {
  slug: 'starter',
  maxInstances: 1,
  maxMessages: 1000,
  maxCampaigns: 1,
  maxGroups: 50,
  maxAutoReplies: 5,
  chatbotEnabled: false,
  aiQuota: 0,
};

// Mapea el valor histórico de users.plan a un slug real de la tabla plans.
function normalizePlanSlug(plan) {
  const p = String(plan || '').toLowerCase();
  if (!p || p === 'mensual' || p === 'anual' || p === 'free' || p === 'gratis') return 'starter';
  return p;
}

// Devuelve los add-ons activos del usuario enriquecidos para la API.
async function getUserAddons(userId) {
  const catalog = await getAddonCatalog();
  const byKey = new Map(catalog.map((a) => [a.key, a]));
  const rows = (await pool.query(
    'SELECT * FROM user_addons WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  ).catch(() => ({ rows: [] }))).rows;
  return rows.map((r) => {
    const def = byKey.get(r.addon_key) || null;
    const quantity = parseInt(r.quantity, 10) || 0;
    const unitAmount = def ? def.unitAmount : parseFloat(r.unit_amount) || 0;
    return {
      key: r.addon_key,
      label: def ? def.label : r.addon_key,
      unitLabel: def ? def.unitLabel : '',
      quantity,
      unitAmount,
      total: Math.round(quantity * unitAmount * 100) / 100,
    };
  });
}

// Catálogo de add-ons con precios configurables por el admin (tabla
// plan_addons). Si la tabla está vacía o falla la consulta, usa los defaults.
async function getAddonCatalog() {
  try {
    const rows = (await pool.query(
      'SELECT * FROM plan_addons ORDER BY sort_order ASC, created_at ASC'
    )).rows;
    if (rows.length > 0) {
      return rows.map((r) => ({
        key: r.key,
        label: r.label,
        unitLabel: r.unit_label || '',
        unitAmount: parseFloat(r.unit_amount) || 0,
        isActive: r.is_active !== false,
        sortOrder: parseInt(r.sort_order, 10) || 0,
      }));
    }
  } catch (e) {
    console.warn('getAddonCatalog fallback a defaults:', e.message);
  }
  return PLAN_ADDONS.map((a, i) => ({ ...a, isActive: true, sortOrder: i + 1 }));
}

// Admin: lee el catálogo de add-ons para poder editar sus precios.
async function getAddonPrices(res, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar precios de adicionales' });
  const catalog = await getAddonCatalog();
  sendJson(res, 200, { data: catalog, success: true });
}

// Admin: actualiza los precios del catálogo de add-ons (unit_amount).
async function updateAddonPrices(res, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar precios de adicionales' });
  const requested = Array.isArray((body || {}).addons) ? body.addons : [];
  const catalog = await getAddonCatalog();
  const validKeys = new Set(catalog.map((a) => a.key));
  const updates = requested.filter((item) => item && validKeys.has(String(item.key)));
  if (updates.length === 0) return sendJson(res, 400, { error: 'No se recibieron precios válidos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of updates) {
      const unitAmount = Math.max(0, parseFloat(item.unitAmount) || 0);
      await client.query(
        `UPDATE plan_addons SET unit_amount = $1, updated_at = NOW() WHERE key = $2`,
        [unitAmount, String(item.key)]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  const fresh = await getAddonCatalog();
  sendJson(res, 200, { data: fresh, success: true });
}

// Total mensual del usuario = precio del plan base + total de add-ons.
// Admin no tiene cargo.
async function getUserMonthlyAmount(userId, role) {
  // Solo el rol 'admin' está exento de cargo. El owner paga igual que un
  // usuario normal; por eso los flujos de cambio de plan pasan 'user'.
  if (role === 'admin') return 0;
  let base = 0;
  try {
    const u = (await pool.query('SELECT plan FROM users WHERE id = $1', [userId])).rows[0];
    const slug = u && u.plan ? normalizePlanSlug(u.plan) : 'starter';
    const planRow = (await pool.query('SELECT price_monthly FROM plans WHERE slug = $1', [slug]).catch(() => ({ rows: [] }))).rows[0];
    base = planRow ? parseFloat(planRow.price_monthly) || 0 : 0;
  } catch { /* usar 0 */ }
  const addons = await getUserAddons(userId);
  const addonTotal = addons.reduce((acc, a) => acc + a.total, 0);
  return Math.round((base + addonTotal) * 100) / 100;
}

// Resuelve los límites del plan de un usuario. Admins no tienen límites.
async function getUserPlanLimits(userId, role) {
  if (isAdminRole(role)) return null; // null = sin límites
  let planSlug = 'starter';
  try {
    const u = (await pool.query('SELECT plan FROM users WHERE id = $1', [userId])).rows[0];
    if (u && u.plan) planSlug = normalizePlanSlug(u.plan);
  } catch { /* si la BD falla, usar el default */ }
  const row = (await pool.query('SELECT * FROM plans WHERE slug = $1 AND is_active = TRUE', [planSlug]).catch(() => ({ rows: [] }))).rows[0];
  const limits = row
    ? {
        slug: row.slug,
        maxInstances: parseInt(row.max_instances, 10) || 0,
        maxMessages: parseInt(row.max_messages, 10) || 0,
        maxCampaigns: parseInt(row.max_campaigns, 10) || 0,
        maxGroups: parseInt(row.max_groups, 10) || 0,
        maxAutoReplies: parseInt(row.max_auto_replies, 10) || 0,
        chatbotEnabled: !!row.chatbot_enabled,
        aiQuota: parseFloat(row.ai_quota) || 0,
      }
    : { ...DEFAULT_PLAN_LIMITS };

  // Suma los add-ons del usuario por encima de los límites del plan base.
  const addons = await getUserAddons(userId);
  for (const addon of addons) {
    const def = ADDON_LIMIT_MAP[addon.key];
    if (!def) continue;
    if (def.field === 'chatbotEnabled') {
      if (addon.quantity > 0) limits.chatbotEnabled = true;
      continue;
    }
    if (limits[def.field] <= 0) continue; // ya ilimitado
    limits[def.field] += addon.quantity * def.perUnit;
  }
  return limits;
}

// Bloquea la operación si `used` alcanzó el límite `max` (0 = ilimitado).
function enforceLimit(res, used, max, label) {
  if (max > 0 && used >= max) {
    sendJson(res, 429, {
      error: `Has alcanzado el límite de ${label} de tu plan (${max}). Mejora tu plan o elimina algunos recursos.`,
      code: 'PLAN_LIMIT_REACHED',
    });
    return false;
  }
  return true;
}

function enrichPlan(p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description || '',
    priceMonthly: parseFloat(p.price_monthly || 0),
    priceYearly: parseFloat(p.price_yearly || 0),
    features: Array.isArray(p.features) ? p.features : [],
    cta: p.cta || 'Empezar',
    popular: !!p.popular,
    color: p.color || '#25D366',
    isActive: !!p.is_active,
    sortOrder: parseInt(p.sort_order, 10) || 0,
    maxInstances: parseInt(p.max_instances, 10) || 0,
    maxMessages: parseInt(p.max_messages, 10) || 0,
    maxCampaigns: parseInt(p.max_campaigns, 10) || 0,
    maxGroups: parseInt(p.max_groups, 10) || 0,
    maxAutoReplies: parseInt(p.max_auto_replies, 10) || 0,
    chatbotEnabled: !!p.chatbot_enabled,
    aiQuota: parseFloat(p.ai_quota) || 0,
    createdAt: p.created_at,
  };
}

// GET público: los activos para el landing. GET admin (?id=all): todos.
async function getPlans(res, session) {
  const q = session && isAdminRole(session.role)
    ? 'SELECT * FROM plans ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM plans WHERE is_active = TRUE ORDER BY sort_order ASC, created_at ASC';
  const result = await pool.query(q);
  sendJson(res, 200, { data: result.rows.map(enrichPlan), success: true });
}

async function createPlan(res, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar planes' });
  const name = (body.name || '').toString().trim();
  if (!name) return sendJson(res, 400, { error: 'El nombre del plan es requerido' });
  const rawSlug = body.slug !== undefined ? body.slug : name;
  const slug = String(rawSlug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const id = cuid();
  try {
    const result = await pool.query(
      `INSERT INTO plans (id, name, slug, description, price_monthly, price_yearly, features, cta, popular, color, is_active, sort_order,
       max_instances, max_messages, max_campaigns, max_groups, max_auto_replies, chatbot_enabled, ai_quota)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [id, name, slug, (body.description || '').toString().trim(),
       parseFloat(body.priceMonthly) || 0, parseFloat(body.priceYearly) || 0,
       JSON.stringify(Array.isArray(body.features) ? body.features.map((f) => String(f)) : []),
       (body.cta || 'Empezar').toString(), !!body.popular, (body.color || '#25D366').toString(),
       body.isActive !== false, parseInt(body.sortOrder || 0, 10) || 0,
       parseInt(body.maxInstances, 10) >= 0 ? parseInt(body.maxInstances, 10) : 0,
       parseInt(body.maxMessages, 10) >= 0 ? parseInt(body.maxMessages, 10) : 0,
       parseInt(body.maxCampaigns, 10) >= 0 ? parseInt(body.maxCampaigns, 10) : 0,
       parseInt(body.maxGroups, 10) >= 0 ? parseInt(body.maxGroups, 10) : 0,
       parseInt(body.maxAutoReplies, 10) >= 0 ? parseInt(body.maxAutoReplies, 10) : 0,
       body.chatbotEnabled === true, parseFloat(body.aiQuota) || 0]
    );
    sendJson(res, 201, { data: enrichPlan(result.rows[0]), success: true });
  } catch (e) {
    if (e.code === '23505') return sendJson(res, 400, { error: 'Ya existe un plan con ese slug' });
    throw e;
  }
}

async function updatePlan(res, id, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar planes' });
  const existing = (await pool.query('SELECT * FROM plans WHERE id = $1', [id])).rows[0];
  if (!existing) return sendJson(res, 404, { error: 'Plan no encontrado' });
  const name = (body.name !== undefined ? body.name : existing.name).toString().trim();
  if (!name) return sendJson(res, 400, { error: 'El nombre del plan es requerido' });
  const rawSlug = body.slug !== undefined ? body.slug : existing.slug;
  const slug = String(rawSlug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const features = Array.isArray(body.features) ? body.features.map((f) => String(f)) : existing.features;
  try {
    const result = await pool.query(
      `UPDATE plans SET name=$1, slug=$2, description=$3, price_monthly=$4, price_yearly=$5, features=$6,
       cta=$7, popular=$8, color=$9, is_active=$10, sort_order=$11,
       max_instances=$13, max_messages=$14, max_campaigns=$15, max_groups=$16, max_auto_replies=$17,
       chatbot_enabled=$18, ai_quota=$19, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [name, slug,
       (body.description !== undefined ? body.description : existing.description).toString().trim(),
       body.priceMonthly !== undefined ? (parseFloat(body.priceMonthly) || 0) : parseFloat(existing.price_monthly || 0),
       body.priceYearly !== undefined ? (parseFloat(body.priceYearly) || 0) : parseFloat(existing.price_yearly || 0),
       JSON.stringify(features),
       (body.cta !== undefined ? body.cta : existing.cta).toString(),
       body.popular !== undefined ? !!body.popular : !!existing.popular,
       (body.color !== undefined ? body.color : existing.color).toString(),
       body.isActive !== undefined ? body.isActive !== false : !!existing.is_active,
       body.sortOrder !== undefined ? (parseInt(body.sortOrder, 10) || 0) : (parseInt(existing.sort_order, 10) || 0),
       id,
       body.maxInstances !== undefined ? (parseInt(body.maxInstances, 10) >= 0 ? parseInt(body.maxInstances, 10) : 0) : (parseInt(existing.max_instances, 10) || 0),
       body.maxMessages !== undefined ? (parseInt(body.maxMessages, 10) >= 0 ? parseInt(body.maxMessages, 10) : 0) : (parseInt(existing.max_messages, 10) || 0),
       body.maxCampaigns !== undefined ? (parseInt(body.maxCampaigns, 10) >= 0 ? parseInt(body.maxCampaigns, 10) : 0) : (parseInt(existing.max_campaigns, 10) || 0),
       body.maxGroups !== undefined ? (parseInt(body.maxGroups, 10) >= 0 ? parseInt(body.maxGroups, 10) : 0) : (parseInt(existing.max_groups, 10) || 0),
       body.maxAutoReplies !== undefined ? (parseInt(body.maxAutoReplies, 10) >= 0 ? parseInt(body.maxAutoReplies, 10) : 0) : (parseInt(existing.max_auto_replies, 10) || 0),
       body.chatbotEnabled !== undefined ? body.chatbotEnabled === true : !!existing.chatbot_enabled,
       body.aiQuota !== undefined ? (parseFloat(body.aiQuota) || 0) : (parseFloat(existing.ai_quota) || 0)]
    );
    sendJson(res, 200, { data: enrichPlan(result.rows[0]), success: true });
  } catch (e) {
    if (e.code === '23505') return sendJson(res, 400, { error: 'Ya existe un plan con ese slug' });
    throw e;
  }
}

async function deletePlan(res, id, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar planes' });
  const result = await pool.query('DELETE FROM plans WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Plan no encontrado' });
  sendJson(res, 200, { success: true });
}

function enrichTestimonial(t) {
  return {
    id: t.id,
    author: t.author,
    role: t.role || '',
    company: t.company || '',
    quote: t.quote,
    avatar: t.avatar || (t.author || '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    rating: parseInt(t.rating, 10) || 5,
    result: t.result || '',
    color: t.color || '#25D366',
    featured: !!t.featured,
    isActive: !!t.is_active,
    sortOrder: parseInt(t.sort_order, 10) || 0,
    createdAt: t.created_at,
  };
}

// GET público: los activos para el landing. GET admin (?id=all): todos.
async function getTestimonials(res, session) {
  const q = session && isAdminRole(session.role)
    ? 'SELECT * FROM testimonials ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM testimonials WHERE is_active = TRUE ORDER BY sort_order ASC, created_at ASC';
  const result = await pool.query(q);
  sendJson(res, 200, { data: result.rows.map(enrichTestimonial), success: true });
}

async function createTestimonial(res, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar testimonios' });
  const author = (body.author || '').toString().trim();
  const quote = (body.quote || '').toString().trim();
  if (!author) return sendJson(res, 400, { error: 'El autor es requerido' });
  if (!quote) return sendJson(res, 400, { error: 'El testimonio es requerido' });
  const id = cuid();
  const result = await pool.query(
    `INSERT INTO testimonials (id, author, role, company, quote, avatar, rating, result, color, featured, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [id, author, (body.role || '').toString().trim(), (body.company || '').toString().trim(), quote,
     (body.avatar || '').toString().trim(), parseInt(body.rating || 5, 10) || 5,
     (body.result || '').toString().trim(), (body.color || '#25D366').toString(),
     !!body.featured, body.isActive !== false, parseInt(body.sortOrder || 0, 10) || 0]
  );
  sendJson(res, 201, { data: enrichTestimonial(result.rows[0]), success: true });
}

async function updateTestimonial(res, id, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar testimonios' });
  const existing = (await pool.query('SELECT * FROM testimonials WHERE id = $1', [id])).rows[0];
  if (!existing) return sendJson(res, 404, { error: 'Testimonio no encontrado' });
  const author = (body.author !== undefined ? body.author : existing.author).toString().trim();
  const quote = (body.quote !== undefined ? body.quote : existing.quote).toString().trim();
  if (!author) return sendJson(res, 400, { error: 'El autor es requerido' });
  if (!quote) return sendJson(res, 400, { error: 'El testimonio es requerido' });
  const result = await pool.query(
    `UPDATE testimonials SET author=$1, role=$2, company=$3, quote=$4, avatar=$5, rating=$6, result=$7,
     color=$8, featured=$9, is_active=$10, sort_order=$11, updated_at=NOW()
     WHERE id=$12 RETURNING *`,
    [author,
     (body.role !== undefined ? body.role : existing.role).toString().trim(),
     (body.company !== undefined ? body.company : existing.company).toString().trim(),
     quote,
     (body.avatar !== undefined ? body.avatar : existing.avatar || '').toString().trim(),
     body.rating !== undefined ? (parseInt(body.rating, 10) || 5) : (parseInt(existing.rating, 10) || 5),
     (body.result !== undefined ? body.result : existing.result || '').toString().trim(),
     (body.color !== undefined ? body.color : existing.color).toString(),
     body.featured !== undefined ? !!body.featured : !!existing.featured,
     body.isActive !== undefined ? body.isActive !== false : !!existing.is_active,
     body.sortOrder !== undefined ? (parseInt(body.sortOrder, 10) || 0) : (parseInt(existing.sort_order, 10) || 0),
     id]
  );
  sendJson(res, 200, { data: enrichTestimonial(result.rows[0]), success: true });
}

async function deleteTestimonial(res, id, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar testimonios' });
  const result = await pool.query('DELETE FROM testimonials WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return sendJson(res, 404, { error: 'Testimonio no encontrado' });
  sendJson(res, 200, { success: true });
}

async function getUserBillingRecord(session) {
  const scope = getUserIdScope(session);
  const q = scope
    ? "SELECT * FROM users WHERE id = $1"
    : "SELECT * FROM users ORDER BY created_at ASC LIMIT 1";
  const params = scope ? [scope] : [];
  const user = (await pool.query(q, params)).rows[0] || null;
  return { user, scope };
}

async function getBillingInfo(res, session) {
  const { user, scope } = await getUserBillingRecord(session);
  if (!user) return sendJson(res, 404, { error: 'Usuario no encontrado' });
  const state = computeBillingState(user);
  const limits = await getUserPlanLimits(user.id, session.role);

  const where = scope ? ' WHERE user_id = $1' : '';
  const args = scope ? [scope] : [];
  const totalMessages = parseInt((await pool.query(`SELECT COUNT(*)::int FROM message_logs m LEFT JOIN instances i ON i.id = m.instance_id${scope ? ' WHERE i.user_id = $1' : ''}`, scope ? [scope] : [])).rows[0].count);
  const totalInstances = parseInt((await pool.query(`SELECT COUNT(*)::int FROM instances${where}`, args)).rows[0].count);
  const connectedInstances = parseInt((await pool.query(`SELECT COUNT(*)::int FROM instances WHERE status = 'connected'${scope ? ' AND user_id = $1' : ''}`, scope ? [scope] : [])).rows[0].count);
  const totalCampaigns = parseInt((await pool.query(`SELECT COUNT(*)::int FROM campaigns c LEFT JOIN instances i ON i.id = c.instance_id${scope ? ' WHERE i.user_id = $1' : ''}`, scope ? [scope] : [])).rows[0].count);
  const invoices = (await pool.query(`SELECT * FROM invoices${where} ORDER BY created_at DESC`, args)).rows;
  const destinations = (await pool.query('SELECT * FROM payment_destinations WHERE is_active = TRUE ORDER BY sort_order ASC, created_at ASC')).rows;
  const planSlug = user.plan ? normalizePlanSlug(user.plan) : 'starter';
  const planName = limits
    ? (await pool.query('SELECT name FROM plans WHERE slug = $1', [planSlug])).rows[0]?.name
    : null;
  const addons = isAdminRole(session.role) ? [] : await getUserAddons(user.id);
  const basePrice = isAdminRole(session.role)
    ? 0
    : parseFloat((await pool.query('SELECT price_monthly FROM plans WHERE slug = $1', [planSlug]).catch(() => ({ rows: [] }))).rows[0]?.price_monthly) || 0;
  const addonTotal = Math.round(addons.reduce((a, x) => a + x.total, 0) * 100) / 100;
  const total = Math.round((basePrice + addonTotal) * 100) / 100;

  sendJson(res, 200, {
    data: {
      plan: planName || user.plan || PLAN_NAME,
      planSlug,
      status: state.status,
      nextBillingDate: state.nextBillingDate,
      amount: total,
      basePrice,
      addons,
      addonTotal,
      currency: PLAN_CURRENCY,
      graceDays: GRACE_DAYS,
      currentUsage: {
        messages: totalMessages,
        maxMessages: limits ? limits.maxMessages : 0,
        instances: totalInstances,
        maxInstances: limits ? limits.maxInstances : 0,
        connectedInstances,
        campaigns: totalCampaigns,
        maxCampaigns: limits ? limits.maxCampaigns : 0,
        maxGroups: limits ? limits.maxGroups : 0,
        maxAutoReplies: limits ? limits.maxAutoReplies : 0,
        chatbotEnabled: limits ? limits.chatbotEnabled : true,
        aiQuota: limits ? limits.aiQuota : 0,
      },
      invoices: invoices.map(enrichInvoice),
      paymentDestinations: destinations.map(enrichPaymentDestination),
    },
    success: true,
  });
}

async function getInvoices(res, session) {
  const scope = getUserIdScope(session);
  const q = scope
    ? 'SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC'
    : 'SELECT * FROM invoices ORDER BY created_at DESC';
  const result = await pool.query(q, scope ? [scope] : []);
  sendJson(res, 200, { data: result.rows.map(enrichInvoice), success: true });
}

// ---------------------------------------------------------------------------
// 15c. Gestión de plan (upgrade / downgrade) y add-ons
// ---------------------------------------------------------------------------
// Información para el selector de plan: planes disponibles (starter/profesional),
// catálogo de add-ons y estado actual del usuario.
async function getPlanChangeInfo(res, session) {
  if (isAdminRole(session.role)) return sendJson(res, 403, { error: 'El administrador no gestiona un plan' });
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [session.id])).rows[0];
  if (!user) return sendJson(res, 404, { error: 'Usuario no encontrado' });

  const plans = (await pool.query(
    'SELECT * FROM plans WHERE slug = ANY($1) ORDER BY sort_order ASC, created_at ASC',
    [CHANGEABLE_PLAN_SLUGS]
  )).rows.map(enrichPlan);

  const currentSlug = normalizePlanSlug(user.plan);
  const addons = await getUserAddons(user.id);
  const currentPlan = plans.find((p) => p.slug === currentSlug);
  const basePrice = currentPlan ? currentPlan.priceMonthly : 0;
  const addonTotal = addons.reduce((a, x) => a + x.total, 0);
  const addonCatalog = (await getAddonCatalog())
    .filter((a) => a.isActive)
    .map((a) => ({ key: a.key, label: a.label, unitLabel: a.unitLabel, unitAmount: a.unitAmount }));

  sendJson(res, 200, {
    data: {
      plans,
      addonCatalog,
      current: {
        planSlug: currentSlug,
        planName: currentPlan ? currentPlan.name : currentSlug,
        basePrice,
        addons,
        addonTotal: Math.round(addonTotal * 100) / 100,
        total: Math.round((basePrice + addonTotal) * 100) / 100,
      },
    },
    success: true,
  });
}

// Cambia el plan base del usuario (solo entre los slugs permitidos).
// Se aplica de inmediato. Si el monto mensual sube, genera una factura
// pendiente por la diferencia.
async function changeUserPlan(res, body, session) {
  if (isAdminRole(session.role)) return sendJson(res, 403, { error: 'El administrador no gestiona un plan' });
  const planSlug = String((body || {}).planSlug || '').toLowerCase();
  if (!CHANGEABLE_PLAN_SLUGS.includes(planSlug)) {
    return sendJson(res, 400, { error: 'Solo puedes cambiar entre Starter y Profesional' });
  }
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [session.id])).rows[0];
  if (!user) return sendJson(res, 404, { error: 'Usuario no encontrado' });

  const currentSlug = normalizePlanSlug(user.plan);
  if (currentSlug === planSlug) {
    return sendJson(res, 200, { data: { planSlug, message: 'Ya estás en ese plan' }, success: true });
  }

  const planRow = (await pool.query('SELECT * FROM plans WHERE slug = $1', [planSlug])).rows[0];
  if (!planRow) return sendJson(res, 404, { error: 'Plan no encontrado' });

  const oldTotal = await getUserMonthlyAmount(user.id, 'user');
  await pool.query('UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2', [planSlug, user.id]);
  const newTotal = await getUserMonthlyAmount(user.id, 'user');

  if (newTotal > oldTotal) {
    const diff = Math.round((newTotal - oldTotal) * 100) / 100;
    const period = `Cambio de plan · ${new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`;
    await createPendingInvoice(user.id, diff, period, new Date(Date.now() + 30 * 86400000));
  }

  sendJson(res, 200, { data: { planSlug, message: 'Plan actualizado' }, success: true });
}

// Actualiza la cantidad de add-ons del usuario (0 = quitar). Se aplica de
// inmediato; si el monto mensual sube, genera una factura pendiente por la
// diferencia.
async function updateUserAddons(res, body, session) {
  if (isAdminRole(session.role)) return sendJson(res, 403, { error: 'El administrador no gestiona add-ons' });
  const requested = Array.isArray((body || {}).addons) ? body.addons : [];
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [session.id])).rows[0];
  if (!user) return sendJson(res, 404, { error: 'Usuario no encontrado' });

  const catalog = await getAddonCatalog();
  const validKeys = new Set(catalog.map((a) => a.key));
  const normalized = [];
  for (const item of requested) {
    const key = String((item && item.key) || '');
    if (!validKeys.has(key)) continue;
    const quantity = Math.max(0, Math.min(MAX_ADDON_QTY, parseInt(item.quantity, 10) || 0));
    const def = catalog.find((a) => a.key === key);
    normalized.push({ key, quantity, unitAmount: def ? def.unitAmount : 0 });
  }

  const oldTotal = await getUserMonthlyAmount(user.id, 'user');

  await pool.query('DELETE FROM user_addons WHERE user_id = $1', [user.id]);
  for (const item of normalized) {
    if (item.quantity <= 0) continue;
    await pool.query(
      `INSERT INTO user_addons (id, user_id, addon_key, quantity, unit_amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [cuid(), user.id, item.key, item.quantity, item.unitAmount]
    );
  }

  const newTotal = await getUserMonthlyAmount(user.id, 'user');
  if (newTotal > oldTotal) {
    const diff = Math.round((newTotal - oldTotal) * 100) / 100;
    const period = `Extras · ${new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`;
    await createPendingInvoice(user.id, diff, period, new Date(Date.now() + 30 * 86400000));
  }

  const addons = await getUserAddons(user.id);
  const addonTotal = addons.reduce((a, x) => a + x.total, 0);
  sendJson(res, 200, {
    data: {
      addons,
      addonTotal: Math.round(addonTotal * 100) / 100,
      total: newTotal,
    },
    success: true,
  });
}

async function createPendingInvoice(userId, amount, periodLabel, dueDate) {
  const period = periodLabel
    || new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const result = await pool.query(
    `INSERT INTO invoices (id, number, period, amount, status, user_id, due_date)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
    [cuid(), `INV-${cuid().slice(0, 6).toUpperCase()}`, period, amount, userId, dueDate || null]
  );
  return result.rows[0];
}

async function payInvoice(res, invoiceId, session) {
  const scope = getUserIdScope(session);
  const q = scope
    ? 'SELECT * FROM invoices WHERE id = $1 AND user_id = $2'
    : 'SELECT * FROM invoices WHERE id = $1';
  const params = scope ? [invoiceId, scope] : [invoiceId];
  const inv = (await pool.query(q, params)).rows[0];
  if (!inv) return sendJson(res, 404, { error: 'Factura no encontrada' });

  const now = new Date();
  await pool.query('UPDATE invoices SET status = $1, paid_at = $2, updated_at = $2 WHERE id = $3', ['paid', now, invoiceId]);

  const userId = inv.user_id || (scope ? scope : null);
  if (userId) {
    const periodEnd = new Date(now.getTime() + 30 * 86400000);
    await pool.query(
      `UPDATE users SET billing_status = 'active', billing_period_start = $1, billing_period_end = $2,
       grace_period_end = NULL, updated_at = NOW() WHERE id = $3`,
      [now, periodEnd, userId]
    );
    // Genera la factura del siguiente período según el plan + add-ons vigentes
    const nextAmount = await getUserMonthlyAmount(userId, 'user');
    if (nextAmount > 0) {
      const nextPeriod = periodEnd.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      await createPendingInvoice(userId, nextAmount, nextPeriod, periodEnd);
    }
  }

  sendJson(res, 200, { data: { id: invoiceId, status: 'paid' }, success: true });
}

// Job periódico: pasa los trials vencidos a overdue + genera factura, y luego
// bloquea las cuentas cuya gracia también se agotó.
async function runBillingChecks() {
  const users = (await pool.query("SELECT * FROM users WHERE role <> 'admin'")).rows;
  const now = new Date();
  for (const u of users) {
    const state = computeBillingState(u, now);
    if (u.billing_status === 'blocked' || state.status === u.billing_status) continue;
    if (state.status === 'overdue' && u.billing_status !== 'overdue') {
      // Usuarios con monto mensual 0 (plan gratis, sin add-ons) nunca deben
      // quedar bloqueados por falta de pago.
      const monthlyAmount = await getUserMonthlyAmount(u.id, 'user');
      if (monthlyAmount <= 0) {
        await pool.query(
          `UPDATE users SET billing_status = 'active', grace_period_end = NULL, updated_at = NOW() WHERE id = $1`,
          [u.id]
        );
        continue;
      }
      // Período terminado: crea la factura pendiente y abre la ventana de gracia
      const period = new Date(u.billing_period_end || now).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      const graceEnd = new Date(now.getTime() + GRACE_DAYS * 86400000);
      await pool.query(
        `UPDATE users SET billing_status = 'overdue', grace_period_end = $1, updated_at = NOW() WHERE id = $2`,
        [graceEnd, u.id]
      );
      const existingInvoice = await pool.query(
        'SELECT id FROM invoices WHERE user_id = $1 AND status = $2 AND period = $3',
        [u.id, 'pending', period]
      );
      if (existingInvoice.rows.length === 0) {
        await createPendingInvoice(u.id, monthlyAmount, period, u.billing_period_end);
      }
    } else if (state.status === 'blocked') {
      await pool.query(
        `UPDATE users SET billing_status = 'blocked', updated_at = NOW() WHERE id = $1`,
        [u.id]
      );
      // Falta de pago del propietario: la organización entera queda bloqueada
      // (dueño incluido) hasta que se confirme el pago de la factura.
      if (u.role === 'owner' && u.organization_id) {
        const reason = 'Falta de pago de la organización';
        const members = (await pool.query(
          'SELECT * FROM users WHERE organization_id = $1', [u.organization_id]
        ).catch(() => ({ rows: [] }))).rows;
        for (const m of members) {
          await pool.query(
            `UPDATE users SET blocked = TRUE, blocked_at = NOW(), blocked_reason = $1, updated_at = NOW() WHERE id = $2`,
            [reason, m.id]
          );
          await pool.query('DELETE FROM sessions WHERE user_id = $1', [m.id]).catch(() => {});
          purgeUserSessions(m.id);
          wsSendToUser(m.id, 'account:blocked', { reason, blockedAt: new Date().toISOString() });
        }
      }
    }
  }
}

// Verificación estilo middleware para endpoints que requieren un plan activo
// (no bloqueado).
async function ensureBillingActive(res, session) {
  if (isAdminRole(session.role)) return true;
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [session.id])).rows[0];
  if (!user) return false;
  const state = computeBillingState(user);
  if (state.status === 'blocked') {
    sendJson(res, 402, { error: 'Tu plan está suspendido por falta de pago. Paga tu factura para reactivar tu cuenta.', code: 'PLAN_BLOCKED' });
    return false;
  }
  return true;
}

// Verifica el tope de mensajes por cliente antes de enviar. Los admins nunca
// tienen límite.
async function checkMessageLimit(res, session) {
  if (isAdminRole(session.role)) return true;
  const limits = await getUserPlanLimits(session.id, session.role);
  const max = limits ? limits.maxMessages : 0;
  if (max > 0) {
    const count = (await pool.query(
      `SELECT COUNT(*)::int FROM message_logs
       WHERE direction = 'outgoing'
         AND instance_id IN (SELECT id FROM instances WHERE user_id = $1)`,
      [session.id]
    )).rows[0].count;
    if (count >= max) {
      sendJson(res, 429, {
        error: `Has alcanzado el límite de ${max} mensajes de tu plan mensual.`,
        code: 'PLAN_LIMIT_REACHED',
      });
      return false;
    }
  }
  return true;
}

// =========================================================================
// 16. Metrics / Analytics / Conversations
// =========================================================================
async function getDashboardMetrics(res, session) {
  const isAdmin = isAdminRole(session.role);
  // Los que no son admin solo ven métricas de sus propias instancias.
  const scope = isAdmin ? 'TRUE' : 'i.user_id = $1';
  const scopeParams = isAdmin ? [] : [session.id];
  const scopeCond = isAdmin ? '' : ' AND instance_id IN (SELECT id FROM instances WHERE user_id = $1)';
  const scopeArgs = isAdmin ? [] : [session.id];

  const totalInstances = (await pool.query(`SELECT COUNT(*)::int FROM instances i WHERE ${scope}`, scopeParams)).rows[0].count;
  const connectedInstances = (await pool.query(`SELECT COUNT(*)::int FROM instances i WHERE ${scope} AND i.status = 'connected'`, scopeParams)).rows[0].count;
  const totalGroups = (await pool.query(
    `SELECT COUNT(*)::int FROM groups_ g JOIN instances i ON i.id = g.instance_id WHERE ${scope}`, scopeParams
  )).rows[0].count;
  const totalCampaigns = (await pool.query(
    `SELECT COUNT(*)::int FROM campaigns c JOIN instances i ON i.id = c.instance_id WHERE ${scope}`, scopeParams
  )).rows[0].count;
  const activeCampaigns = (await pool.query(
    `SELECT COUNT(*)::int FROM campaigns c JOIN instances i ON i.id = c.instance_id WHERE ${scope} AND c.active = TRUE`, scopeParams
  )).rows[0].count;
  const sentCampaigns = (await pool.query(
    `SELECT COUNT(*)::int FROM campaigns c JOIN instances i ON i.id = c.instance_id WHERE ${scope} AND c.status = 'sent'`, scopeParams
  )).rows[0].count;
  const totalSent = parseInt((await pool.query(
    `SELECT COALESCE(SUM(c.total_sent), 0) FROM campaigns c JOIN instances i ON i.id = c.instance_id WHERE ${scope}`, scopeParams
  )).rows[0].coalesce);
  const totalFailed = parseInt((await pool.query(
    `SELECT COALESCE(SUM(c.total_failed), 0) FROM campaigns c JOIN instances i ON i.id = c.instance_id WHERE ${scope}`, scopeParams
  )).rows[0].coalesce);
  const totalMessages = (await pool.query(
    `SELECT COUNT(*)::int FROM message_logs WHERE TRUE${scopeCond}`, scopeArgs
  )).rows[0].count;
  const incomingMessages = (await pool.query(
    `SELECT COUNT(*)::int FROM message_logs WHERE direction = 'incoming'${scopeCond}`, scopeArgs
  )).rows[0].count;
  const responses = incomingMessages;
  const conversions = (await pool.query(
    `SELECT COUNT(DISTINCT sender_jid)::int FROM message_logs WHERE direction = 'incoming'${scopeCond}`, scopeArgs
  )).rows[0].count;
  const deliveredMessages = (await pool.query(
    `SELECT COUNT(*)::int FROM message_logs WHERE status = 'delivered'${scopeCond}`, scopeArgs
  )).rows[0].count;
  const readMessages = (await pool.query(
    `SELECT COUNT(*)::int FROM message_logs WHERE status = 'read'${scopeCond}`, scopeArgs
  )).rows[0].count;

  const weekly = await pool.query(
    `SELECT DATE(sl.created_at) AS day, COALESCE(SUM(sl.sent), 0)::int AS sent, COALESCE(SUM(sl.failed), 0)::int AS failed
     FROM send_logs sl
     JOIN campaigns c ON c.id = sl.campaign_id
     JOIN instances i ON i.id = c.instance_id
     WHERE sl.created_at >= NOW() - INTERVAL '6 days' AND ${scope}
     GROUP BY day ORDER BY day`,
    scopeParams
  );
  const weeklyByDay = new Map(weekly.rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const weeklyData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = weeklyByDay.get(key);
    weeklyData.push({
      name: d.toLocaleDateString('es-ES', { weekday: 'short' }),
      enviados: row ? row.sent : 0,
      fallidos: row ? row.failed : 0,
    });
  }

  const recentQ = isAdmin
    ? CAMPAIGN_QUERY + ' ORDER BY c.created_at DESC LIMIT 5'
    : CAMPAIGN_QUERY + ' WHERE i.user_id = $1 ORDER BY c.created_at DESC LIMIT 5';
  const recent = await pool.query(recentQ, isAdmin ? [] : [session.id]);

  sendJson(res, 200, {
    data: {
      totalInstances,
      connectedInstances,
      totalGroups,
      totalCampaigns,
      activeCampaigns,
      sentCampaigns,
      totalSent,
      totalFailed,
      totalMessages,
      incomingMessages,
      responses,
      conversions,
      deliveredMessages,
      readMessages,
      weeklyData,
      recentCampaigns: recent.rows.map(enrichCampaign),
    },
    success: true,
  });
}
async function getCampaignAnalytics(res, campaignId) {
  const campaign = await pool.query(CAMPAIGN_QUERY + ' WHERE c.id = $1', [campaignId]);
  if (campaign.rows.length === 0) return sendJson(res, 404, { error: 'Campaña no encontrada' });
  const logs = await pool.query(
    'SELECT * FROM send_logs WHERE campaign_id = $1 ORDER BY created_at DESC', [campaignId]
  );
  sendJson(res, 200, {
    data: {
      campaign: enrichCampaign(campaign.rows[0]),
      logs: logs.rows,
      sent: campaign.rows[0].total_sent || 0,
      failed: campaign.rows[0].total_failed || 0,
      delivered: campaign.rows[0].total_sent || 0,
      read: 0,
    },
    success: true,
  });
}
async function getConversations(res, req, session) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const iid = u.searchParams.get('instanceId');
  const isAdmin = isAdminRole(session.role);
  if (iid && !(await loadInstanceForUser(iid, session))) {
    return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  }
  // Los que no son admin solo ven conversaciones de sus propias instancias.
  const params = [];
  const conds = [];
  if (iid) {
    conds.push('instance_id = $' + (params.length + 1));
    params.push(iid);
  } else {
    conds.push('$' + (params.length + 1) + '::text IS NULL');
    params.push(null);
  }
  if (!isAdmin) {
    conds.push('instance_id IN (SELECT id FROM instances WHERE user_id = $' + (params.length + 1) + ')');
    params.push(session.id);
  }
  const scope = conds.join(' AND ');

  // 1) Conversaciones extraídas desde Evolution (tabla conversations)
  const syncedRows = (await pool.query(
    `SELECT c.* FROM conversations c WHERE ${scope} ORDER BY last_message_at DESC NULLS LAST`,
    params
  )).rows.map(r => ({
    jid: r.jid,
    instanceId: r.instance_id,
    name: r.name || '',
    groupJid: r.jid.includes('@g.us') ? r.jid : null,
    lastMessage: r.last_message || '',
    lastMessageType: r.last_message_type || 'text',
    lastMessageAt: r.last_message_at,
    unread: r.unread || 0,
    profilePic: r.profile_pic || '',
    fromSync: true,
  }));

  // 2) Conversaciones detectadas por el webhook (message_logs) que quizá aún
  //    no se han extraído; se fusionan con las de arriba por jid.
  const logRows = (await pool.query(
    `SELECT DISTINCT ON (sender_jid) sender_jid, sender_name, group_jid, content, message_type, created_at,
       (SELECT COUNT(*) FROM message_logs m
         WHERE m.sender_jid = message_logs.sender_jid
           AND ($1::text IS NULL OR m.instance_id = $1::text)) AS message_count
     FROM message_logs WHERE direction = 'incoming' AND ${scope}
     ORDER BY sender_jid, created_at DESC`,
    params
  )).rows;

  const map = new Map();
  for (const s of syncedRows) map.set(s.jid, s);
  for (const r of logRows) {
    if (!r.sender_jid) continue;
    const key = r.sender_jid;
    const existing = map.get(key);
    const msgAt = r.created_at;
    if (!existing || (msgAt && (!existing.lastMessageAt || new Date(msgAt) > new Date(existing.lastMessageAt)))) {
      map.set(key, {
        jid: key,
        instanceId: r.instance_id || iid || null,
        name: r.sender_name || (existing ? existing.name : '') || '',
        groupJid: r.group_jid || null,
        lastMessage: r.content || '',
        lastMessageType: r.message_type || 'text',
        lastMessageAt: r.created_at,
        unread: existing ? existing.unread : 0,
        profilePic: existing ? existing.profilePic : '',
        messageCount: parseInt(r.message_count || 0, 10),
        fromSync: !!existing,
      });
    } else if (existing && existing.fromSync) {
      existing.messageCount = parseInt(r.message_count || 0, 10) + (existing.messageCount || 0);
    }
  }

  const rows = [...map.values()]
    .sort((a, b) => (b.lastMessageAt ? new Date(b.lastMessageAt) : 0) - (a.lastMessageAt ? new Date(a.lastMessageAt) : 0))
    .map(r => ({
      instanceId: r.instanceId,
      senderJid: r.jid,
      senderName: r.name,
      groupJid: r.groupJid,
      lastMessage: r.lastMessage,
      lastMessageType: r.lastMessageType,
      lastMessageAt: r.lastMessageAt,
      messageCount: r.messageCount || 0,
      unread: r.unread || 0,
      profilePic: r.profilePic || '',
    }));

  sendJson(res, 200, { data: rows, success: true });
}

// Extrae las conversaciones existentes de la instancia desde Evolution
// (/chat/findChats) y las guarda en la tabla conversations para que aparezcan
// en el módulo aunque no hayan llegado mensajes nuevos por el webhook.
async function syncConversations(res, instanceId, session) {
  if (!instanceId) return sendJson(res, 400, { error: 'instanceId requerido' });
  const inst = await pool.query('SELECT * FROM instances WHERE id = $1', [instanceId]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  if (!isOwner(inst.rows[0], session)) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const i = inst.rows[0];
  const evoName = encodeURIComponent(evoInstanceName(i));
  let chats = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      chats = await fetchJson('POST', `${evolutionBaseUrl(i)}/chat/findChats/${evoName}`,
        { apikey: i.api_key }, { limit: 500, offset: 0 });
      break;
    } catch (e) {
      if (attempt === 3) {
        console.error('syncConversations: error obteniendo chats de Evolution:', e);
        return sendJson(res, 502, {
          error: 'No se pudieron obtener las conversaciones desde Evolution. Verifica que la instancia tenga la sesión de WhatsApp conectada.',
        });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const chatList = Array.isArray(chats) ? chats : (chats?.value || chats?.chats || []);
  let created = 0, updated = 0;
  for (const c of chatList) {
    const jid = c.id || c.jid || c.remoteJid;
    if (!jid) continue;
    const name = c.name || c.subject || c.pushName || (jid.includes('@g.us') ? 'Grupo' : jid.split('@')[0]) || '';
    const lastMsg = (typeof c.lastMessage === 'object' && c.lastMessage)
      ? (c.lastMessage.text || c.lastMessage.conversation || c.lastMessage.caption || '')
      : (c.lastMessage || '');
    const lastAt = c.timestamp
      ? new Date(Number(c.timestamp) * 1000)
      : (c.updatedAt ? new Date(c.updatedAt) : null);
    const count = typeof c.unreadCount === 'number' ? c.unreadCount : (c.unread || 0);
    const upsert = await pool.query(
      `INSERT INTO conversations (id, instance_id, jid, name, last_message, last_message_type, last_message_at, unread, profile_pic)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (instance_id, jid)
       DO UPDATE SET name = EXCLUDED.name,
         last_message = CASE WHEN EXCLUDED.last_message <> '' THEN EXCLUDED.last_message ELSE conversations.last_message END,
         last_message_type = EXCLUDED.last_message_type,
         last_message_at = CASE WHEN EXCLUDED.last_message_at IS NOT NULL THEN EXCLUDED.last_message_at ELSE conversations.last_message_at END,
         unread = EXCLUDED.unread,
         profile_pic = COALESCE(EXCLUDED.profile_pic, conversations.profile_pic),
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [cuid(), i.id, jid, name, String(lastMsg), 'text', lastAt, count, (c.profilePicUrl || c.pictureUrl || null)]
    );
    if (upsert.rows[0]?.inserted) created++; else updated++;
  }
  const total = (await pool.query(
    'SELECT COUNT(*)::int FROM conversations WHERE instance_id = $1', [i.id]
  )).rows[0].count;
  sendJson(res, 200, { data: { synced: chatList.length, created, updated, total }, success: true });
}


async function getConversationHistory(res, req, session) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const iid = u.searchParams.get('instanceId');
  const sj = u.searchParams.get('senderJid');
  if (!iid || !sj) return sendJson(res, 400, { error: 'instanceId y senderJid requeridos' });
  const inst = await loadInstanceForUser(iid, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const result = await pool.query(
    `SELECT * FROM message_logs WHERE instance_id = $1 AND sender_jid = $2
     ORDER BY created_at DESC LIMIT 100`,
    [iid, sj]
  );
  sendJson(res, 200, {
    data: result.rows.map((r) => ({
      id: r.id,
      senderName: r.sender_name || '',
      senderJid: r.sender_jid,
      content: r.content,
      direction: r.direction,
      status: r.status || 'delivered',
      createdAt: r.created_at,
      timestamp: r.created_at,
    })),
    success: true,
  });
}

// Envía un mensaje directo de WhatsApp a través de una instancia
async function sendMessage(res, body, session) {
  const { instanceId, to, text } = body;
  if (!instanceId || !to || !text) {
    return sendJson(res, 400, { error: 'instanceId, to y text son requeridos' });
  }
  const inst = await loadInstanceForUser(instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });
  const i = inst;
  if (i.status !== 'connected') {
    return sendJson(res, 400, { error: `La instancia "${i.name}" no está conectada (estado: ${i.status}). Escanea el QR para poder enviar mensajes.` });
  }
  if (!(await checkMessageLimit(res, session))) return;
  try {
    await fetchJson('POST', `${evolutionBaseUrl(i)}/message/sendText/${evoInstanceName(i)}`,
      { apikey: i.api_key }, {
        number: to,
        text,
        delay: 1000,
      });
  } catch (e) {
    console.warn('Evolution sendText warning:', e.message);
    return sendJson(res, 500, { error: `No se pudo enviar el mensaje: ${e.message}` });
  }
  // Intervención humana: cuando un usuario responde manualmente, el chatbot se
  // pausa para ese cliente hasta que un operador lo reanude.
  if (to && !to.endsWith('@g.us')) {
    await pool.query(
      'INSERT INTO chatbot_paused (id, instance_id, sender_jid) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [cuid(), instanceId, to]
    ).catch(() => {});
  }
  const id = cuid();
  await pool.query(
    `INSERT INTO message_logs (id, instance_id, sender_jid, sender_name, content, direction, status, message_type)
     VALUES ($1, $2, $3, '', $4, 'outgoing', 'delivered', 'text')`,
    [id, instanceId, to, text]
  );
  sendJson(res, 200, {
    data: { id, content: text, direction: 'outgoing', timestamp: new Date().toISOString(), status: 'delivered' },
    success: true,
  });
}

// =========================================================================
// 17. Centro de IA
//
// Toda llamada de IA pasa por la interfaz IAProvider (ProviderManager). El
// servidor nunca importa un proveedor concreto (Gemini, OpenAI, ...) directo.
// Las API keys se guardan cifradas (AES-256-GCM) y nunca se devuelven: la UI
// solo ve el valor enmascarado (****ABCD).
// =========================================================================
async function logAiAudit(session, action, detail) {
  try {
    await pool.query(
      'INSERT INTO ai_audit_logs (id, user_id, action, detail) VALUES ($1, $2, $3, $4)',
      [cuid(), session.id, action, detail || null]
    );
  } catch { /* audit must never break the request */ }
}

async function getAiConfigRow(session) {
  const r = (await pool.query('SELECT * FROM ai_configs WHERE user_id = $1', [session.id])).rows[0];
  return r || null;
}

// Resuelve la configuración efectiva de un tenant:
// - BYOK: su propia clave cifrada + base_url desde ai_configs
// - SaaS: la clave de plataforma de ai_saas_keys (activa) para el proveedor configurado
async function resolveAiSettings(session, cfg) {
  const config = cfg || (await getAiConfigRow(session));
  if (!config) return null;
  const managerSettings = providerManager.resolveSettings(config, decryptSecret);
  if (!managerSettings) return null;
  const { provider, model } = managerSettings;
  if (config.mode === 'byok') {
    if (!managerSettings.apiKey) {
      return { error: 'No hay API Key configurada para este proveedor', provider, model };
    }
    return {
      provider,
      model,
      apiKey: managerSettings.apiKey,
      baseUrl: managerSettings.baseUrl || provider.defaultBaseUrl,
      organization: managerSettings.organization,
      project: managerSettings.project,
      mode: 'byok',
    };
  }
  // Modo SaaS: usa la clave gestionada por la plataforma para este proveedor.
  const key = (await pool.query(
    'SELECT * FROM ai_saas_keys WHERE provider = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
    [config.provider]
  )).rows[0];
  if (!key) {
    return {
      error: 'El administrador aún no ha configurado una clave de sistema para este proveedor',
      provider, model, mode: 'saas',
    };
  }
  return {
    provider,
    model,
    apiKey: decryptSecret(key.api_key_enc),
    baseUrl: managerSettings.baseUrl || provider.defaultBaseUrl,
    organization: managerSettings.organization,
    project: managerSettings.project,
    mode: 'saas',
  };
}

// Costo estimado en USD para los contadores de uso (por 1M de tokens).
async function estimateCost(providerId, modelId, inputTokens, outputTokens) {
  const cat = providerManager.catalogue().find((p) => p.id === providerId);
  const m = cat && cat.models.find((mm) => mm.id === modelId);
  if (!m || m.inputCost == null) return 0;
  return Number(((inputTokens / 1e6) * m.inputCost + (outputTokens / 1e6) * m.outputCost).toFixed(6));
}

// Verifica la cuota mensual SaaS (solo aplica en modo SaaS). `res` puede ser
// null cuando se llama desde el camino del webhook del chatbot (sin respuesta
// HTTP que enviar).
async function checkAiQuota(res, session, config, mode) {
  if (mode !== 'saas') return true;
  const limits = await getUserPlanLimits(session.id, session.role);
  const planQuota = limits ? Number(limits.aiQuota) : null;
  if (planQuota !== null && planQuota <= 0) {
    logAiAudit(session, 'quota_blocked', 'El plan no incluye créditos de IA');
    if (res) {
      sendJson(res, 403, {
        error: 'Tu plan no incluye créditos de IA. Mejora tu plan para usar la IA.',
        code: 'PLAN_FEATURE_DISABLED',
      });
    }
    return false;
  }
  const configured = config && config.monthly_quota != null ? Number(config.monthly_quota) : null;
  const fallback = planQuota !== null ? planQuota : AI_SAAS_MONTHLY_QUOTA;
  const quota = configured != null && configured > 0 ? Math.min(configured, fallback) : fallback;
  const used = await aiMonthlyCost(session.id, 'saas');
  if (used >= quota) {
    logAiAudit(session, 'quota_blocked', `Cuota mensual alcanzada (${used.toFixed(2)} / ${quota} USD)`);
    if (res) {
      sendJson(res, 429, {
        error: `Has alcanzado el límite mensual del modo SaaS (${quota.toFixed(2)} USD). Cambia a BYOK o contacta al administrador.`,
        code: 'AI_QUOTA_REACHED',
      });
    }
    return false;
  }
  return true;
}

async function aiMonthlyCost(userId, mode) {
  const r = (await pool.query(
    `SELECT COALESCE(SUM(estimated_cost), 0) AS total FROM ai_usage_logs
     WHERE user_id = $1 AND mode = $2 AND created_at >= date_trunc('month', NOW())`,
    [userId, mode || 'saas']
  )).rows[0];
  return Number(r.total || 0);
}

// Helper compartido: genera una respuesta con la configuración de IA del tenant
// (SaaS o BYOK) a través de la interfaz IAProvider. Verifica cuota, registra
// uso/auditoría y devuelve el texto generado. Lo usan el modo AI de
// auto-respuestas, el asistente de conversaciones y (potencialmente) el webhook
// del chatbot.
async function generateTenantReply(instance, opts) {
  const tenantId = instance.user_id;
  if (!tenantId) {
    const err = new Error('La instancia no tiene un usuario asociado');
    err.noAi = true;
    throw err;
  }
  const aiConfig = (await pool.query('SELECT * FROM ai_configs WHERE user_id = $1', [tenantId])).rows[0];
  if (!aiConfig || !aiConfig.status || aiConfig.status === 'not_configured') {
    const err = new Error('El Centro de IA no está configurado para esta cuenta');
    err.noAi = true;
    throw err;
  }
  const session = { id: tenantId, role: 'user' };
  if (!(await checkAiQuota(null, session, aiConfig, aiConfig.mode))) {
    const err = new Error('Has alcanzado la cuota mensual de IA. Cambia a BYOK o contacta al administrador.');
    err.quota = true;
    throw err;
  }
  const settings = await resolveAiSettings(session, aiConfig);
  if (!settings || settings.error || !settings.apiKey) {
    const err = new Error((settings && settings.error) || 'Sin configuración válida de IA');
    err.noAi = true;
    throw err;
  }
  const action = opts.action || 'auto_reply';
  try {
    const result = await settings.provider.generate(
      {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        organization: settings.organization,
        project: settings.project,
      },
      {
        system: opts.system || 'Eres un asistente amable.',
        messages: opts.messages || [],
        temperature: opts.temperature != null ? Number(opts.temperature) : 0.7,
        maxTokens: opts.maxTokens != null ? Number(opts.maxTokens) : 200,
      }
    );
    const text = (result.text || '').trim();
    await recordAiUsage(session, settings, action, result.usage, 'ok');
    return text;
  } catch (e) {
    const isAuth = e && (e.statusCode === 401 || e.statusCode === 403);
    await recordAiUsage(session, settings, action, null, isAuth ? 'auth_error' : 'error', e.message);
    await logAiAudit(session, isAuth ? 'key_invalid' : 'connection_failed', `${action}: ${e.message}`);
    throw e;
  }
}

async function getAiOverview(res, session) {
  const config = await getAiConfigRow(session);
  const usage = await getAiUsageData(session);
  const effective = config ? await resolveAiSettings(session, config) : null;
  const limits = await getUserPlanLimits(session.id, session.role);
  sendJson(res, 200, {
    data: {
      config: enrichAiConfig(config),
      usage,
      effective: effective && effective.error ? { error: effective.error, mode: effective.mode, provider: effective.provider && effective.provider.id } : null,
      providers: providerManager.catalogue().map((p) => ({
        id: p.id,
        label: p.label,
        requiresApiKey: p.requiresApiKey,
        requiresBaseUrl: p.requiresBaseUrl,
      })),
      plan: {
        aiQuota: limits ? Number(limits.aiQuota) || 0 : 0,
      },
    },
    success: true,
  });
}

function enrichAiConfig(r) {
  if (!r) return null;
  return {
    id: r.id,
    mode: r.mode,
    provider: r.provider,
    model: r.model,
    apiKeyMasked: maskKey(decryptSecret(r.api_key_enc) || ''),
    hasApiKey: !!r.api_key_enc,
    baseUrl: r.base_url || null,
    organization: r.organization || null,
    project: r.project || null,
    status: r.status,
    lastError: r.last_error || null,
    lastValidatedAt: r.last_validated_at || null,
    monthlyQuota: r.monthly_quota != null ? Number(r.monthly_quota) : AI_SAAS_MONTHLY_QUOTA,
    updatedAt: r.updated_at,
  };
}

async function getAiConfig(res, session) {
  const config = await getAiConfigRow(session);
  sendJson(res, 200, { data: enrichAiConfig(config), success: true });
}

async function saveAiConfig(res, body, session) {
  const mode = body.mode === 'byok' ? 'byok' : 'saas';
  const providerId = body.provider || 'gemini';
  const provider = providerManager.get(providerId);
  if (!provider) return sendJson(res, 400, { error: 'Proveedor de IA no soportado' });

  const existing = await getAiConfigRow(session);
  let apiKeyEnc = existing ? existing.api_key_enc : null;
  let status = existing ? existing.status : 'not_configured';
  let lastError = null;

  if (mode === 'byok') {
    const rawKey = (body.apiKey || '').trim();
    if (rawKey) {
      const fmt = validateKeyFormat(providerId, rawKey);
      if (!fmt.ok) return sendJson(res, 400, { error: fmt.message });
      apiKeyEnc = encryptSecret(rawKey);
    }
    if (!apiKeyEnc) {
      return sendJson(res, 400, { error: 'La API Key es requerida en modo BYOK' });
    }
    status = 'connected';
  } else {
    // Modo SaaS: sin clave de tenant, la clave de la plataforma se usa en runtime.
    apiKeyEnc = null;
    status = existing && existing.status === 'connected' ? 'connected' : 'not_configured';
  }

  // Valida la base_url cuando el proveedor la necesita y se suministró una.
  const baseUrl = (body.baseUrl || '').trim() || null;

  if (existing) {
    await pool.query(
      `UPDATE ai_configs SET mode = $1, provider = $2, model = $3, api_key_enc = $4,
         base_url = $5, organization = $6, project = $7, status = $8, last_error = $9,
         monthly_quota = $10, updated_at = NOW() WHERE user_id = $11`,
      [mode, providerId, body.model || provider.availableModels[0]?.id || null,
        apiKeyEnc, baseUrl, (body.organization || '').trim() || null,
        (body.project || '').trim() || null, status, lastError,
        body.monthlyQuota != null ? body.monthlyQuota : (existing.monthly_quota || AI_SAAS_MONTHLY_QUOTA),
        session.id]
    );
  } else {
    await pool.query(
      `INSERT INTO ai_configs (id, user_id, mode, provider, model, api_key_enc, base_url,
         organization, project, status, last_error, monthly_quota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [cuid(), session.id, mode, providerId, body.model || provider.availableModels[0]?.id || null,
        apiKeyEnc, baseUrl, (body.organization || '').trim() || null,
        (body.project || '').trim() || null, status, lastError,
        body.monthlyQuota != null ? body.monthlyQuota : AI_SAAS_MONTHLY_QUOTA]
    );
  }

  logAiAudit(session, mode === 'byok' ? 'key_saved' : 'config_saved',
    `Proveedor ${providerId} (${mode}), clave ${apiKeyEnc ? maskKey(decryptSecret(apiKeyEnc)) : 'n/a'}`);
  const config = await getAiConfigRow(session);
  sendJson(res, 200, { data: enrichAiConfig(config), success: true });
}

async function validateAiConnection(res, body, session) {
  const providerId = body.provider || 'gemini';
  const provider = providerManager.get(providerId);
  if (!provider) return sendJson(res, 400, { error: 'Proveedor de IA no soportado' });

  // El usuario puede validar con una clave que aún no ha guardado (flujo BYOK)
  // o validar la configuración actualmente guardada.
  let apiKey = (body.apiKey || '').trim() || null;
  let baseUrl = (body.baseUrl || '').trim() || null;
  const config = await getAiConfigRow(session);

  if (!apiKey && !baseUrl && config) {
    const settings = await resolveAiSettings(session, config);
    if (settings && settings.error) return sendJson(res, 400, { error: settings.error });
    if (settings) {
      apiKey = settings.apiKey;
      baseUrl = settings.baseUrl || null;
    }
  }
  if (!apiKey) {
    return sendJson(res, 400, { error: 'Se requiere una API Key para validar' });
  }

  const result = await provider.validateConnection({ apiKey, baseUrl, project: (body.project || '').trim() || null });
  if (result.ok) {
    const status = 'connected';
    if (config) {
      await pool.query(
        `UPDATE ai_configs SET status = $1, last_error = NULL, last_validated_at = NOW(), updated_at = NOW()
         WHERE user_id = $2`, [status, session.id]);
    }
    logAiAudit(session, 'key_validated', `Proveedor ${providerId} conectado correctamente`);
    sendJson(res, 200, {
      data: { ok: true, models: result.models || [], label: provider.label },
      success: true,
    });
  } else {
    const status = result.authError ? 'invalid' : 'error';
    if (config) {
      await pool.query(
        `UPDATE ai_configs SET status = $1, last_error = $2, updated_at = NOW() WHERE user_id = $3`,
        [status, result.error, session.id]);
    }
    logAiAudit(session, result.authError ? 'key_invalid' : 'connection_failed',
      `Proveedor ${providerId}: ${result.error}`);
    sendJson(res, result.authError ? 401 : 400, { error: result.error, code: result.authError ? 'AI_AUTH_ERROR' : 'AI_CONNECTION_ERROR' });
  }
}

async function testAi(res, body, session) {
  const config = await getAiConfigRow(session);
  if (!config) return sendJson(res, 400, { error: 'Configura primero el Centro de IA' });
  if (!(await checkAiQuota(res, session, config, config.mode))) return;

  const settings = await resolveAiSettings(session, config);
  if (!settings) return sendJson(res, 400, { error: 'No se pudo resolver la configuración de IA' });
  if (settings.error) return sendJson(res, 400, { error: settings.error });

  const prompt = body.message || 'Responde con una frase breve y amable confirmando que el Centro de IA funciona.';
  try {
    const result = await settings.provider.generate(
      { apiKey: settings.apiKey, baseUrl: settings.baseUrl, model: settings.model, organization: settings.organization, project: settings.project },
      { system: 'Eres un asistente de prueba.', messages: [{ role: 'user', content: prompt }], temperature: 0.3, maxTokens: 100 }
    );
    await recordAiUsage(session, settings, 'test', result.usage, 'ok');
    sendJson(res, 200, { data: { ok: true, text: result.text }, success: true });
  } catch (e) {
    const isAuth = e && (e.statusCode === 401 || e.statusCode === 403);
    await recordAiUsage(session, settings, 'test', null, isAuth ? 'auth_error' : 'error', e.message);
    await pool.query('UPDATE ai_configs SET status = $1, last_error = $2, updated_at = NOW() WHERE user_id = $3',
      [isAuth ? 'invalid' : 'error', e.message, session.id]);
    sendJson(res, 500, { error: `Error al probar la IA: ${e.message}` });
  }
}

async function rotateAiKey(res, body, session) {
  const config = await getAiConfigRow(session);
  if (!config || config.mode !== 'byok') {
    return sendJson(res, 400, { error: 'Solo se pueden rotar claves en modo BYOK' });
  }
  const newKey = (body.apiKey || '').trim();
  if (!newKey) return sendJson(res, 400, { error: 'La nueva API Key es requerida' });
  const fmt = validateKeyFormat(config.provider, newKey);
  if (!fmt.ok) return sendJson(res, 400, { error: fmt.message });
  await pool.query(
    'UPDATE ai_configs SET api_key_enc = $1, updated_at = NOW() WHERE user_id = $2',
    [encryptSecret(newKey), session.id]);
  logAiAudit(session, 'key_rotated', `Rotada API Key de ${providerLabel(config.provider)}`);
  sendJson(res, 200, {
    data: { apiKeyMasked: maskKey(newKey), success: true },
    success: true,
  });
}

async function recordAiUsage(session, settings, action, usage, status, error) {
  if (!AI_USAGE_LOGGING_ENABLED) return;
  try {
    const inputTokens = (usage && usage.inputTokens) || 0;
    const outputTokens = (usage && usage.outputTokens) || 0;
    const cost = await estimateCost(settings.provider.id, settings.model, inputTokens, outputTokens);
    await pool.query(
      `INSERT INTO ai_usage_logs (id, user_id, provider, model, mode, action, input_tokens, output_tokens, estimated_cost, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [cuid(), session.id, settings.provider.id, settings.model || null, settings.mode, action || 'chatbot',
        inputTokens, outputTokens, cost, status || 'ok', error || null]
    );
  } catch (e) {
    console.warn('Failed to record AI usage:', e.message);
  }
}

async function getAiUsageData(session) {
  const monthlyCostSaas = await aiMonthlyCost(session.id, 'saas');
  const monthlyCostByok = await aiMonthlyCost(session.id, 'byok');
  const requests = (await pool.query(
    `SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'ok')::int AS ok,
       COUNT(*) FILTER (WHERE status = 'error' OR status = 'auth_error')::int AS failed,
       COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::int AS output_tokens
     FROM ai_usage_logs WHERE user_id = $1 AND created_at >= date_trunc('month', NOW())`,
    [session.id]
  )).rows[0];
  const recent = (await pool.query(
    `SELECT id, provider, model, mode, action, input_tokens, output_tokens, estimated_cost, status, created_at
     FROM ai_usage_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [session.id]
  )).rows;
  return {
    monthly: {
      saasCost: monthlyCostSaas,
      byokCost: monthlyCostByok,
      totalCost: monthlyCostSaas + monthlyCostByok,
      requests: requests.total || 0,
      ok: requests.ok || 0,
      failed: requests.failed || 0,
      inputTokens: requests.input_tokens || 0,
      outputTokens: requests.output_tokens || 0,
    },
    recent: recent.map((r) => ({
      id: r.id,
      provider: r.provider,
      model: r.model,
      mode: r.mode,
      action: r.action,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      estimatedCost: Number(r.estimated_cost || 0),
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}

async function getAiUsage(res, session) {
  sendJson(res, 200, { data: await getAiUsageData(session), success: true });
}

async function getAiCatalogue(res, session) {
  sendJson(res, 200, { data: providerManager.catalogue(), success: true });
}

// Asistente de conversaciones: redacta una respuesta para un chat usando la
// configuración de IA del tenant. Los últimos mensajes de la conversación se
// usan como contexto.
async function suggestAiReply(res, body, session) {
  const instanceId = (body.instanceId || '').toString();
  if (!instanceId) return sendJson(res, 400, { error: 'instanceId es requerido' });
  const inst = await loadInstanceForUser(instanceId, session);
  if (!inst) return sendJson(res, 403, { error: 'No tienes acceso a esta instancia' });

  const senderJid = (body.senderJid || '').toString();
  if (!senderJid) return sendJson(res, 400, { error: 'senderJid es requerido' });

  try {
    const history = (await pool.query(
      `SELECT sender_jid, content, direction FROM message_logs
       WHERE instance_id = $1 AND sender_jid = $2 AND content IS NOT NULL
       ORDER BY created_at DESC LIMIT 6`,
      [inst.id, senderJid]
    )).rows.reverse();

    const messages = history.map((m) => ({
      role: m.direction === 'outgoing' ? 'assistant' : 'user',
      content: m.content,
    }));
    // Gemini exige que la conversación termine en turno del usuario y que los
    // roles alternen. Se quitan los turnos de asistente finales y se fusionan
    // roles consecutivos iguales.
    while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      messages.pop();
    }
    const merged = [];
    for (const m of messages) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.content += '\n' + m.content;
      else merged.push({ ...m });
    }
    if (body.message) merged.push({ role: 'user', content: String(body.message).slice(0, 2000) });

    const system =
      'Eres un asistente de ventas y atención al cliente. Redacta una respuesta natural y breve ' +
      '(máximo 2-3 oraciones), en el mismo idioma del cliente, lista para enviar por WhatsApp. ' +
      'No inventes precios ni promesas que no puedas cumplir.';
    const text = await generateTenantReply(inst, {
      system,
      messages: merged,
      temperature: 0.7,
      maxTokens: 250,
      action: 'suggest',
    });
    if (!text) return sendJson(res, 500, { error: 'La IA no generó una respuesta' });
    sendJson(res, 200, { data: { text }, success: true });
  } catch (e) {
    if (e && e.quota) return sendJson(res, 429, { error: e.message, code: 'AI_QUOTA_REACHED' });
    if (e && e.noAi) return sendJson(res, 409, { error: e.message });
    if (e && (e.statusCode === 401 || e.statusCode === 403)) {
      return sendJson(res, 502, { error: `La IA rechazó la autenticación. Revisa la configuración del Centro de IA.` });
    }
    sendJson(res, 500, { error: e && e.message || 'Error al generar la respuesta con IA' });
  }
}

// ---------------------------------------------------------------------------
// Admin: claves gestionadas por la plataforma (modo SaaS)
// ---------------------------------------------------------------------------
async function getSaaSKeys(res, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar las claves del sistema' });
  const rows = (await pool.query('SELECT * FROM ai_saas_keys ORDER BY created_at DESC')).rows;
  sendJson(res, 200, {
    data: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      providerLabel: providerLabel(r.provider),
      apiKeyMasked: maskKey(decryptSecret(r.api_key_enc) || ''),
      label: r.label || null,
      isActive: r.is_active,
      createdAt: r.created_at,
    })),
    success: true,
  });
}

async function setSaaSKey(res, body, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar las claves del sistema' });
  const providerId = body.provider || 'gemini';
  if (!providerManager.isSupported(providerId)) return sendJson(res, 400, { error: 'Proveedor no soportado' });
  const rawKey = (body.apiKey || '').trim();
  if (!rawKey) return sendJson(res, 400, { error: 'La API Key es requerida' });
  const fmt = validateKeyFormat(providerId, rawKey);
  if (!fmt.ok) return sendJson(res, 400, { error: fmt.message });
  await pool.query('UPDATE ai_saas_keys SET is_active = FALSE WHERE provider = $1 AND is_active = TRUE', [providerId]);
  const row = (await pool.query(
    `INSERT INTO ai_saas_keys (id, provider, api_key_enc, label, is_active)
     VALUES ($1, $2, $3, $4, TRUE) RETURNING *`,
    [cuid(), providerId, encryptSecret(rawKey), (body.label || '').trim() || null]
  )).rows[0];
  logAiAudit(session, 'saas_key_set', `Clave de sistema ${providerLabel(providerId)} configurada (${maskKey(rawKey)})`);
  sendJson(res, 201, {
    data: {
      id: row.id,
      provider: row.provider,
      apiKeyMasked: maskKey(rawKey),
      label: row.label,
      isActive: row.is_active,
    },
    success: true,
  });
}

async function deleteSaaSKey(res, keyId, session) {
  if (!isAdminRole(session.role)) return sendJson(res, 403, { error: 'Solo el administrador puede gestionar las claves del sistema' });
  const row = (await pool.query('DELETE FROM ai_saas_keys WHERE id = $1 RETURNING id, provider', [keyId])).rows[0];
  if (!row) return sendJson(res, 404, { error: 'Clave no encontrada' });
  logAiAudit(session, 'saas_key_removed', `Clave de sistema de ${providerLabel(row.provider)} eliminada`);
  sendJson(res, 200, { data: { id: keyId, success: true }, success: true });
}

// =========================================================================
// 18. Webhooks (desde Evolution API)
// =========================================================================
// ---------------------------------------------------------------------------
// Auto-respuestas: se comparan con cada mensaje entrante en el webhook. Si la
// regla tiene el modo IA habilitado, la respuesta se genera con la
// configuración de IA del tenant (Centro de IA); si no, se usa la respuesta
// estática.
// ---------------------------------------------------------------------------
async function findMatchingAutoReply(instance, content) {
  const rules = (await pool.query(
    'SELECT * FROM auto_replies WHERE instance_id = $1 AND is_active = TRUE', [instance.id]
  )).rows;
  const text = String(content || '').toLowerCase();
  let best = null;
  for (const r of rules) {
    const trigger = String(r.trigger || '').toLowerCase().trim();
    if (!trigger) continue;
    if (text.includes(trigger) && (!best || trigger.length > String(best.trigger).length)) {
      best = r;
    }
  }
  return best;
}

async function sendReplyToWhatsApp(instance, to, text, groupJid, senderJid) {
  if (!text) return;
  await fetchJson('POST', `${evolutionBaseUrl(instance)}/message/sendText/${evoInstanceName(instance)}`,
    { apikey: instance.api_key }, { number: to, text, delay: 500 }).catch(() => {});
  await pool.query(
    `INSERT INTO message_logs (id, instance_id, group_jid, sender_jid, sender_name, content, direction, status, message_type)
     VALUES ($1, $2, $3, $4, '', $5, 'outgoing', 'delivered', 'text')`,
    [cuid(), instance.id, groupJid || null, senderJid || to, text]
  ).catch(() => {});
}

async function processAutoReply(instance, rule, targetJid, senderJid, senderName, content, isGroup) {
  try {
    let reply;
    if (rule.use_ai === true) {
      const instructions = rule.ai_instructions || 'Responde de forma breve y natural, en el mismo idioma del cliente.';
      // La auto-respuesta en modo IA utiliza el chatbot de su instancia (prompt
      // de sistema y conocimiento configurados) como base, y añade las reglas
      // particulares de esta respuesta junto con los datos del negocio de la
      // instancia leídos en tiempo real.
      const bot = (await pool.query(
        'SELECT * FROM chatbot_configs WHERE instance_id = $1', [instance.id]
      )).rows[0];
      const parts = [];
      const basePrompt = bot ? buildChatbotSystemPrompt(bot) : '';
      if (basePrompt) parts.push(basePrompt);
      parts.push(`Eres el asistente de atención al cliente de esta empresa. Reglas de esta auto-respuesta: ${instructions}`);
      let system = parts.join('\n\n');
      if (rule.document_id) {
        const doc = (await pool.query('SELECT title FROM bot_documents WHERE id = $1', [rule.document_id])).rows[0];
        const ctx = await retrieveBotContext(instance, content, 4, null, rule.document_id);
        if (ctx.length > 0) {
          const docs = ctx.map((c) => `- ${c.content}`).join('\n');
          system += `\n\nINFORMACIÓN DE REFERENCIA DEL DOCUMENTO${doc && doc.title ? ` "${doc.title}"` : ''} (úsala solo si responde a la consulta del cliente):\n${docs}`;
        }
      }
      try {
        const live = await buildGoogleBusinessContext(instance.id);
        if (live) {
          system += `\n\nDATOS ACTUALES DE LA CUENTA DE GOOGLE DE LA INSTANCIA (leídos en vivo al responder)\nUsa estos datos como fuente de verdad; si la pregunta no guarda relación, ignóralos:\n${live}`;
        }
      } catch (e) {
        console.warn('[google-context] auto-respuesta falló al leer datos de Google:', e.message);
      }
      const history = (await pool.query(
        `SELECT sender_jid, content, direction FROM message_logs
         WHERE instance_id = $1 AND sender_jid = $2 AND content IS NOT NULL
         ORDER BY created_at DESC LIMIT 6`,
        [instance.id, senderJid]
      )).rows.reverse();
      const messages = history.map((m) => ({
        role: m.direction === 'outgoing' ? 'assistant' : 'user',
        content: m.content,
      }));
      messages.push({ role: 'user', content });
      reply = await generateTenantReply(instance, {
        system,
        messages,
        temperature: 0.7,
        maxTokens: 200,
        action: 'auto_reply',
      });
      if (!reply) return;
    } else {
      reply = rule.response || '';
    }
    await sendReplyToWhatsApp(instance, targetJid, reply, isGroup ? targetJid : null, senderJid);
  } catch (e) {
    console.warn('Auto-reply error:', e.message);
  }
}

// Extrae el número de teléfono real de la sesión de WhatsApp desde Evolution
// (ownerJid de fetchInstances) y lo guarda en la instancia al conectar.
async function syncInstancePhone(i) {
  try {
    const list = await fetchJson('GET', `${evolutionBaseUrl(i)}/instance/fetchInstances`, { apikey: i.api_key });
    const found = (Array.isArray(list) ? list : []).find(
      (inst) => inst.name === evoInstanceName(i) || inst.id === i.evolution_instance_id
    );
    const ownerJid = (found && found.ownerJid) || '';
    const number = String(ownerJid).replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '');
    const integration = (found && (found.integration || found.clientName)) || null;
    const updates = [];
    const params = [];
    if (number && number !== i.phone) {
      updates.push('phone = $' + (params.length + 1));
      params.push(number);
    }
    if (integration && integration !== i.integration) {
      updates.push('integration = $' + (params.length + 1));
      params.push(integration);
    }
    if (updates.length === 0) return;
    params.push(i.id);
    await pool.query(`UPDATE instances SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);
    const row = (await pool.query('SELECT * FROM instances WHERE id = $1', [i.id])).rows[0];
    pushInstanceUpdate(row);
    if (number) console.log(`[evo] Número obtenido para ${i.name}: ${number}`);
  } catch (e) {
    console.warn(`[evo] sync phone error (${i.name}): ${e.message}`);
  }
}

async function handleWebhook(res, body) {
  const { event, instance, data } = body;
  if (!instance || !data) return sendJson(res, 400, { error: 'Payload inválido' });

  // Evolution v2 (Baileys) emite los eventos con otro naming
  // ("messages.upsert") mientras este servidor los espera en mayúsculas
  // ("MESSAGES_UPSERT"). Se normalizan ambos formatos para que los webhooks
  // reales de Evolution v2.3.x sean procesados igual que los simulados.
  const EVENT_MAP = {
    'messages.upsert': 'MESSAGES_UPSERT',
    'connection.update': 'CONNECTION_UPDATE',
    'messages.update': 'MESSAGES_UPDATE',
    'messages.delete': 'MESSAGES_DELETE',
  };
  const normalizedEvent = EVENT_MAP[event] || event;

  const inst = await pool.query('SELECT * FROM instances WHERE name = $1', [instance]);
  if (inst.rows.length === 0) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  const i = inst.rows[0];

  if (normalizedEvent === 'CONNECTION_UPDATE') {
    const state = data.state || '';
    const dbStatus = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';
    await pool.query('UPDATE instances SET status = $1 WHERE id = $2', [dbStatus, i.id]);
    // Al conectar, se obtiene el número real de la sesión desde Evolution.
    if (state === 'open') {
      syncInstancePhone(i).catch((e) => console.warn('Sync phone error:', e.message));
    }
  }

  if (normalizedEvent === 'MESSAGES_UPSERT') {
    const msg = data;
    const groupJid = msg.key?.remoteJid || '';
    const isGroup = groupJid.endsWith('@g.us');
    const msgKey = msg.key?.id || '';
    const senderJid = msg.key?.participant || msg.key?.remoteJid || '';
    const senderName = msg.pushName || '';
    const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

    // Mensajes enviados por nosotros (el agente) no se loguean como entrantes
    // ni disparan el chatbot / auto-respuestas.
    if (msg.key?.fromMe) return sendJson(res, 200, { ok: true, skipped: 'fromMe' });

    if (isGroup) {
      // Registra el mensaje de grupo entrante
      await pool.query(
        `INSERT INTO message_logs (id, instance_id, group_jid, message_key, sender_jid, sender_name,
         content, message_type, status, direction) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT DO NOTHING`,
        [cuid(), i.id, groupJid, msgKey, senderJid, senderName, content, 'text', 'received', 'incoming']
      ).catch(() => {});
      // Auto-respuestas (grupos): responde al grupo con la regla que coincide
      if (content) {
        const matched = await findMatchingAutoReply(i, content);
        if (matched) await processAutoReply(i, matched, groupJid, senderJid, senderName, content, true);
      }
    } else {
      // DM privado — registra + revisa auto-respuestas y chatbot
      await pool.query(
        `INSERT INTO message_logs (id, instance_id, group_jid, message_key, sender_jid, sender_name,
         content, message_type, status, direction) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [cuid(), i.id, groupJid, msgKey, senderJid, senderName, content, 'text', 'received', 'incoming']
      ).catch(() => {});
      // Las auto-respuestas tienen prioridad sobre el chatbot: si una regla
      // coincide con el mensaje (estática o IA), responde y el chatbot no corre.
      if (content) {
        const matched = await findMatchingAutoReply(i, content);
        if (matched) {
          await processAutoReply(i, matched, senderJid, senderJid, senderName, content, false);
        } else {
          // Chatbot n8n: si el entorno n8n del sistema está configurado, el DM
          // se reenvía al workflow dinámico de la instancia (que responde vía
          // Evolution). Si no, el chatbot IA integrado lo entrega directo.
          if (n8nEnabled()) {
            handleN8nChatbot(i, senderJid, senderName, content).catch((e) => {
              console.warn('Chatbot n8n error:', e.message);
            });
          } else {
            handleChatbotMessage(i, senderJid, senderName, content).catch((e) => {
              console.warn('Chatbot IA error:', e.message);
            });
          }
        }
      }
    }
  }

  if (normalizedEvent === 'MESSAGES_UPDATE') {
    const statusCode = data.status;
    const msgKey = data.key?.id || '';
    const statusMap = { 1: 'pending', 2: 'delivered', 3: 'read' };
    const newStatus = statusMap[statusCode] || 'unknown';
    await pool.query(
      'UPDATE message_logs SET status = $1 WHERE message_key = $2',
      [newStatus, msgKey]
    ).catch(() => {});
  }

  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Aprovisionamiento dinámico de n8n: cada instancia recibe su propio
// workflow/webhook (/webhook/dm-chatbot-<instanceId>) creado vía la REST API
// de n8n (X-N8N-API-KEY). El workflow llama de vuelta a este servidor
// (/api/ai/chatbot-reply) para generar la respuesta con la configuración de IA
// del tenant y la envía de vuelta por Evolution: n8n es la capa de
// orquestación/entrega y el Centro de IA (cuota, auditoría, proveedores) sigue
// siendo el motor de respuestas.
// ---------------------------------------------------------------------------
// n8n es un único entorno administrado por el sistema (variables de entorno):
// la URL y la API key son globales, nunca por instancia. Cada instancia recibe
// su workflow dinámico sobre ese mismo entorno.
function n8nBaseUrl() {
  return (process.env.N8N_URL || '').trim().replace(/\/+$/, '');
}
function n8nApiKey() {
  return (process.env.N8N_API_KEY || '').trim();
}
function n8nEnabled() {
  return !!(n8nBaseUrl() && n8nApiKey());
}
const n8nWorkflowCache = new Map();

function n8nChatbotWebhookPath(instance) {
  return `dm-chatbot-${instance.id}`;
}

function n8nRequest(method, url, apiKey, body) {
  return fetchJson(method, url, { 'X-N8N-API-KEY': apiKey }, body);
}

// Construye el JSON del workflow que n8n ejecutará para una instancia: recibe
// el DM, le pide a este servidor una respuesta (Centro de IA) y la envía de
// vuelta por Evolution.
function buildN8nChatbotWorkflow(instance, webhookPath, appUrl) {
  const baseAppUrl = appUrl.replace(/\/+$/, '');
  const evoBaseUrl = (process.env.N8N_EVOLUTION_URL || 'http://evolution_api:8080').replace(/\/+$/, '');
  const sendUrl = `${evoBaseUrl}/message/sendText/${encodeURIComponent(evoInstanceName(instance))}`;
  return {
    name: `WhatsApp Chatbot - ${instance.name}`,
    nodes: [
      {
        parameters: { httpMethod: 'POST', path: webhookPath, options: {} },
        id: 'webhook-trigger',
        name: 'DM Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [250, 300],
        webhookId: webhookPath,
      },
      {
        parameters: {
          jsCode: `const body = $input.first().json.body;
return [{ json: {
  instanceId: body.instanceId,
  sender: body.sender,
  senderName: body.senderName || '',
  content: body.content || '',
  chatJid: body.chatJid || body.sender || '',
  apiKey: body.apiKey || ''
} }];`,
        },
        id: 'parse-payload',
        name: 'Parse Payload',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [450, 300],
      },
      {
        parameters: {
          method: 'POST',
          url: `${baseAppUrl}/api/ai/chatbot-reply`,
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify({ instanceId: $json.instanceId, sender: $json.sender, senderName: $json.senderName, content: $json.content }) }}',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $json.apiKey }}' },
            ],
          },
          options: { timeout: 30000 },
        },
        id: 'generate-reply',
        name: 'Generate Reply (App IA)',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [650, 300],
      },
      {
        parameters: {
          jsCode: `const prev = $('Parse Payload').first().json;
const res = $input.first().json;
const text = (res.reply || '').trim();
if (!text) return [];
return [{ json: {
  apiKey: prev.apiKey,
  number: prev.chatJid,
  text
} }];`,
        },
        id: 'extract-reply',
        name: 'Extract Reply',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [850, 300],
      },
      {
        parameters: {
          method: 'POST',
          url: sendUrl,
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify({ number: $json.number, text: $json.text, delay: 2000 }) }}',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $json.apiKey }}' },
            ],
          },
          options: { timeout: 15000 },
        },
        id: 'send-reply',
        name: 'Send Reply',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1050, 300],
      },
    ],
    connections: {
      'DM Webhook': { main: [[{ node: 'Parse Payload', type: 'main', index: 0 }]] },
      'Parse Payload': { main: [[{ node: 'Generate Reply (App IA)', type: 'main', index: 0 }]] },
      'Generate Reply (App IA)': { main: [[{ node: 'Extract Reply', type: 'main', index: 0 }]] },
      'Extract Reply': { main: [[{ node: 'Send Reply', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  };
}

// Asegura que el workflow por instancia exista y esté activo en n8n. Devuelve
// la ruta del webhook a la que reenviar, o null si n8n no está configurado /
// no es alcanzable. Usa la API key de la instancia, cayendo a N8N_API_KEY.
async function ensureN8nWorkflow(instance) {
  const baseUrl = n8nBaseUrl();
  const apiKey = n8nApiKey();
  if (!baseUrl || !apiKey) return null;
  const webhookPath = n8nChatbotWebhookPath(instance);
  const workflowName = `WhatsApp Chatbot - ${instance.name}`;
  const appUrl = process.env.N8N_APP_URL || 'http://host.docker.internal:3000';

  try {
    const list = await n8nRequest('GET', `${baseUrl}/api/v1/workflows`, apiKey);
    const existing = (list.data || []).find((w) => (
      w.name === workflowName ||
      (w.nodes || []).some((n) => n.type === 'n8n-nodes-base.webhook' && n.parameters && n.parameters.path === webhookPath)
    ));
    if (existing) {
      if (existing.active !== true) {
        await n8nRequest('POST', `${baseUrl}/api/v1/workflows/${existing.id}/activate`, apiKey);
      }
      return webhookPath;
    }
    const created = await n8nRequest('POST', `${baseUrl}/api/v1/workflows`, apiKey,
      buildN8nChatbotWorkflow(instance, webhookPath, appUrl));
    const id = created && created.id;
    if (id) await n8nRequest('POST', `${baseUrl}/api/v1/workflows/${id}/activate`, apiKey);
    console.log(`[n8n] Workflow creado para ${instance.name} (${webhookPath})`);
    return webhookPath;
  } catch (e) {
    console.warn(`[n8n] ensure workflow error: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chatbot n8n: se llama desde el webhook cuando llega un DM privado a una
// instancia que tiene configurada una URL de n8n. Respeta el toggle de
// habilitación del chatbot y la lista de remitentes pausados, aprovisiona el
// workflow por instancia bajo demanda y reenvía el mensaje a su webhook (que
// genera la respuesta vía la IA de la app y la envía de vuelta por Evolution).
// ---------------------------------------------------------------------------
async function handleN8nChatbot(instance, senderJid, senderName, content) {
  // n8n es un entorno único del admin (variables de entorno); la URL nunca se
  // toma de la instancia.
  const n8nUrl = n8nBaseUrl();
  if (!n8nUrl || !n8nApiKey()) return;

  const config = (await pool.query(
    'SELECT * FROM chatbot_configs WHERE instance_id = $1 AND is_active = TRUE', [instance.id]
  )).rows[0];
  if (!config) return;

  const paused = (await pool.query(
    'SELECT id FROM chatbot_paused WHERE instance_id = $1 AND sender_jid = $2', [instance.id, senderJid]
  )).rows[0];
  if (paused) return;

  let webhookPath = n8nWorkflowCache.get(instance.id);
  if (!webhookPath) {
    webhookPath = await ensureN8nWorkflow(instance) || 'dm-chatbot';
    n8nWorkflowCache.set(instance.id, webhookPath);
  }

  const target = n8nUrl.replace(/\/+$/, '') + '/webhook/' + webhookPath;
  console.log(`[n8n] Forwarding DM from ${senderName} (${senderJid}) to ${target}`);
  await fetchJson('POST', target, {}, {
    instance: instance.name,
    instanceId: instance.id,
    sender: senderJid,
    senderName: senderName || '',
    content,
    chatJid: '',
    evolutionUrl: instance.evolution_url,
    apiKey: instance.api_key,
  }).catch((e) => {
    console.warn(`[n8n] Forward failed: ${e.message}`);
    n8nWorkflowCache.delete(instance.id);
  });
}

// ---------------------------------------------------------------------------
// Chatbot IA: resuelve la configuración de IA del tenant (SaaS o BYOK) a través
// de la interfaz IAProvider y genera una respuesta para un DM privado. No
// envía: el llamador decide cómo entregarla (Evolution directo, o workflow n8n).
// ---------------------------------------------------------------------------
// Lee EN VIVO la información de la cuenta de Google asociada a la instancia:
// catálogo y precios desde Google Sheets, documentos desde Google Docs/Drive y
// agenda desde Google Calendar. Reemplaza a las tablas de Negocio eliminadas.
async function buildGoogleBusinessContext(instanceId) {
  const conn = await googleClient.getConnection(instanceId).catch(() => null);
  if (!conn || !conn.accessToken) return null;
  const sources = (await pool.query('SELECT * FROM instance_google_sources WHERE instance_id = $1', [instanceId]).catch(() => ({ rows: [] }))).rows[0];
  if (!sources) return null;
  const blocks = [];

  if (sources.sheet_id) {
    try {
      const sheet = await googleClient.importSheet(instanceId, sources.sheet_id, {
        sheetName: sources.sheet_name || '',
        range: sources.sheet_range || 'A1:Z200',
      });
      if (sheet && sheet.content) {
        blocks.push(`CATÁLOGO Y PRECIOS (leídos en vivo de Google Sheets)\n${sheet.content}`);
      }
    } catch (e) {
      console.warn(`[google-context] falló la hoja de cálculo de la instancia ${instanceId}:`, e.message);
    }
  }

  const docIds = Array.isArray(sources.doc_ids) ? sources.doc_ids : [];
  if (docIds.length > 0) {
    const docs = [];
    for (const docId of docIds) {
      try {
        const doc = await googleClient.importDocs(instanceId, docId);
        if (doc && doc.content) {
          docs.push(`- [${doc.title}]: ${String(doc.content).replace(/\s+/g, ' ').slice(0, 2000)}`);
        }
      } catch (e) {
        console.warn(`[google-context] falló un documento de la instancia ${instanceId}:`, e.message);
      }
    }
    if (docs.length > 0) {
      blocks.push(`DOCUMENTOS DE LA EMPRESA (leídos en vivo de Google Docs)\n${docs.join('\n')}`);
    }
  }

  if (sources.calendar_id) {
    try {
      const cal = await googleClient.importCalendar(instanceId, sources.calendar_id, sources.calendar_days || 30);
      if (cal && cal.content) {
        blocks.push(`AGENDA Y CITAS PRÓXIMAS (leídas en vivo de Google Calendar)\n${cal.content}`);
      }
    } catch (e) {
      console.warn(`[google-context] falló el calendario de la instancia ${instanceId}:`, e.message);
    }
  }

  return blocks.length > 0 ? blocks.join('\n\n') : null;
}

async function generateChatbotReply(instance, senderJid, senderName, content) {
  const config = (await pool.query(
    'SELECT * FROM chatbot_configs WHERE instance_id = $1 AND is_active = TRUE', [instance.id]
  )).rows[0];
  if (!config) return null;

  const paused = (await pool.query(
    'SELECT id FROM chatbot_paused WHERE instance_id = $1 AND sender_jid = $2', [instance.id, senderJid]
  )).rows[0];
  if (paused) return null;

  const tenantId = instance.user_id;
  if (!tenantId) return null;
  const aiConfig = (await pool.query('SELECT * FROM ai_configs WHERE user_id = $1', [tenantId])).rows[0];
  if (!aiConfig || !aiConfig.status) return null;

  // La sesión del bot usa el rol real del tenant (owner/admin no pagan cuota SaaS).
  const tenantRow = (await pool.query('SELECT role FROM users WHERE id = $1', [tenantId]).catch(() => ({ rows: [] }))).rows[0];
  const session = { id: tenantId, role: tenantRow && tenantRow.role ? tenantRow.role : 'user' };
  if (!(await checkAiQuota(null, session, aiConfig, aiConfig.mode))) return null;

  const settings = await resolveAiSettings(session, aiConfig);
  if (!settings || settings.error || !settings.apiKey) {
    await logAiAudit(session, 'connection_failed', settings && settings.error || 'Sin configuración válida de IA');
    return null;
  }

  // Construye un contexto corto del historial reciente para que el bot
  // responda con coherencia.
  const history = (await pool.query(
    `SELECT sender_jid, content, direction FROM message_logs
     WHERE instance_id = $1 AND sender_jid = $2 AND content IS NOT NULL
     ORDER BY created_at DESC LIMIT 6`,
    [instance.id, senderJid]
  )).rows.reverse();

  const messages = history.map((m) => ({
    role: m.direction === 'outgoing' ? 'assistant' : 'user',
    content: m.content,
  }));
  messages.push({ role: 'user', content });

  try {
    let systemPrompt = buildChatbotSystemPrompt(config) || 'Eres un asistente amable.';
    try {
      const context = await retrieveBotContext(instance, content, 4, settings);
      if (context.length > 0) {
        const docs = context
          .map((c) => `- ${c.title ? `[${c.title}] ` : ''}${c.content}`)
          .join('\n');
        systemPrompt += `\n\nINFORMACIÓN EXTRAÍDA DE LOS DOCUMENTOS DE LA EMPRESA\nUsa estos datos solo si responden a lo que el cliente pregunta; si no guardan relación, ignóralos:\n${docs}`;
      }
    } catch (e) {
      console.warn('[RAG] recuperación de contexto falló:', e.message);
    }
    // Datos en vivo de la cuenta de Google de la instancia (catálogo, precios,
    // documentos y agenda), leídos desde Google en el momento de responder.
    try {
      const live = await buildGoogleBusinessContext(instance.id);
      if (live) {
        systemPrompt += `\n\nDATOS ACTUALES DE LA CUENTA DE GOOGLE DE LA INSTANCIA (leídos en vivo al responder)\nUsa estos datos como fuente de verdad para responder al cliente; si la pregunta no guarda relación, ignóralos:\n${live}`;
      }
    } catch (e) {
      console.warn('[google-context] falló al leer datos de Google:', e.message);
    }
    const result = await settings.provider.generate(
      {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        organization: settings.organization,
        project: settings.project,
      },
      {
        system: systemPrompt,
        messages,
        temperature: config.temperature != null ? Number(config.temperature) : 0.7,
        maxTokens: config.max_tokens != null ? Number(config.max_tokens) : 200,
      }
    );

    const reply = (result.text || '').trim();
    if (!reply) return null;
    await recordAiUsage(session, settings, 'chatbot', result.usage, 'ok');
    return reply;
  } catch (e) {
    const isAuth = e && (e.statusCode === 401 || e.statusCode === 403);
    await recordAiUsage(session, settings, 'chatbot', null, isAuth ? 'auth_error' : 'error', e.message);
    await logAiAudit(session, isAuth ? 'key_invalid' : 'connection_failed', `Chatbot: ${e.message}`);
    return null;
  }
}

// Entrega directa del chatbot (sin n8n): genera y envía por Evolution.
async function handleChatbotMessage(instance, senderJid, senderName, content) {
  const reply = await generateChatbotReply(instance, senderJid, senderName, content);
  if (!reply) return;
  await fetchJson('POST', `${evolutionBaseUrl(instance)}/message/sendText/${evoInstanceName(instance)}`,
    { apikey: instance.api_key }, { number: senderJid, text: reply, delay: 500 })
    .catch(() => {});
  await pool.query(
    `INSERT INTO message_logs (id, instance_id, sender_jid, sender_name, content, direction, status, message_type)
     VALUES ($1, $2, $3, '', $4, 'outgoing', 'delivered', 'text')`,
    [cuid(), instance.id, senderJid, reply]
  ).catch(() => {});
}

// Endpoint al que llaman los workflows de n8n para obtener la respuesta del
// Centro de IA. La respuesta se genera aquí (aplica cuota/auditoría) y la
// entrega n8n vía Evolution; registramos el mensaje saliente para que el
// historial de la conversación funcione.
async function chatbotReplyEndpoint(res, body, session) {
  const inst = body.instanceId
    ? (await pool.query('SELECT * FROM instances WHERE id = $1', [String(body.instanceId)])).rows[0]
    : body.instance
      ? (await pool.query('SELECT * FROM instances WHERE name = $1', [String(body.instance)])).rows[0]
      : null;
  if (!inst) return sendJson(res, 404, { error: 'Instancia no encontrada' });
  const reply = await generateChatbotReply(inst, body.sender, body.senderName || '', body.content || '');
  if (!reply) return sendJson(res, 200, { ok: true, reply: null });
  await pool.query(
    `INSERT INTO message_logs (id, instance_id, sender_jid, sender_name, content, direction, status, message_type)
     VALUES ($1, $2, $3, '', $4, 'outgoing', 'sent', 'text')`,
    [cuid(), inst.id, body.sender, reply]
  ).catch(() => {});
  sendJson(res, 200, { ok: true, reply });
}

// =========================================================================
// 19. Server
// =========================================================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (pathname.startsWith('/api/')) {
    return await handleRequest(req, res, pathname);
  }

  // El wizard de instalación es de un solo uso: una vez instalado, /setup
  // redirige a la raíz para que no se pueda volver a ingresar a instalar.
  if (INSTALLED && (pathname === '/setup' || pathname.startsWith('/setup/'))) {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  // Archivos estáticos
  let filePath = path.join(DIST, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);

  if (!ext) filePath = path.join(DIST, 'index.html');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(DIST, 'index.html'), (err2, data2) => {
        if (err2) {
          res.writeHead(500);
          return res.end('Internal server error');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': getMimeType(path.extname(filePath)) });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// WebSocket: push de estado de instancias en tiempo real
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

function maskInstanceForRole(instance, isAdmin) {
  if (isAdmin || !instance || typeof instance !== 'object') return instance;
  if ('evolutionUrl' in instance || 'apiKey' in instance) {
    return { ...instance, evolutionUrl: null, apiKey: null };
  }
  return instance;
}

function wsBroadcast(type, data) {
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    // Alcance por propiedad: los eventos de instancia van solo al propietario
    // (o al admin).
    if (type.startsWith('instance:') && data && typeof data === 'object' && data.userId) {
      if (!client.isAdmin && String(client.userId) !== String(data.userId)) continue;
    }
    try {
      client.send(JSON.stringify({ type, data: maskInstanceForRole(data, client.isAdmin) }));
    } catch { /* ignore */ }
  }
}

// Envía un evento solo a las conexiones WebSocket del usuario indicado.
function wsSendToUser(userId, type, data) {
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    if (client.userId === undefined || String(client.userId) !== String(userId)) continue;
    try {
      client.send(JSON.stringify({ type, data }));
    } catch { /* ignore */ }
  }
}

async function pushInstanceUpdate(instance) {
  try {
    const row = (await pool.query(
      `SELECT i.*,
        (SELECT COUNT(*)::int FROM groups_ g WHERE g.instance_id = i.id) AS groups_count,
        u.name AS owner_name, u.email AS owner_email
       FROM instances i LEFT JOIN users u ON u.id = i.user_id
       WHERE i.id = $1`, [instance.id])).rows[0];
    if (row) wsBroadcast('instance:update', enrichInstance(row));
  } catch {
    wsBroadcast('instance:update', enrichInstance(instance));
  }
}

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/api/ws') {
    socket.destroy();
    return;
  }
  const cookies = parseCookies(req);
  const session = await getSession(cookies['session-id']);
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, session);
  });
});

wss.on('connection', async (ws, req, session) => {
  ws.isAdmin = isAdminRole(session.role);
  ws.userId = session.id;
  ws.send(JSON.stringify({ type: 'hello', data: { user: session.email } }));
  // Envía el snapshot actual para que el cliente quede al día al conectarse
  try {
    const instances = await pool.query(`
      SELECT i.*,
        (SELECT COUNT(*)::int FROM groups_ g WHERE g.instance_id = i.id) AS groups_count,
        u.name AS owner_name, u.email AS owner_email
      FROM instances i LEFT JOIN users u ON u.id = i.user_id
      ${ws.isAdmin ? '' : 'WHERE i.user_id = $1'}
      ORDER BY i.created_at DESC`, ws.isAdmin ? [] : [session.id]);
    ws.send(JSON.stringify({
      type: 'instances:snapshot',
      data: instances.rows.map((i) => maskInstanceForRole(enrichInstance(i), ws.isAdmin)),
    }));
  } catch { /* ignore */ }
});

async function start() {
  const hasMarker = !!readSetupMarker();
  try {
    await initDb();
    const users = await pool.query('SELECT COUNT(*)::int AS n FROM users').catch(() => null);
    const hasUsers = users && users.rows[0] && users.rows[0].n > 0;
    if (hasMarker || hasUsers) {
      INSTALLED = true;
      // Migración: una base con datos previos sin marca → se da por instalada.
      if (!hasMarker) writeSetupMarker({ legacy: true });
    }
  } catch (err) {
    // Con la instalación ya hecha, una base caída es un fallo real.
    if (hasMarker) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
    // Sin marca y sin base alcanzable → modo setup (wizard de instalación).
  }

  server.listen(PORT, '0.0.0.0', () => {
    if (INSTALLED) {
      const marker = readSetupMarker();
      console.log(`WhatsApp Ads server running at http://localhost:${PORT}`);
      console.log(`Admin: ${marker && marker.adminEmail ? marker.adminEmail : ADMIN_EMAIL}`);
      console.log(`Evolution API: ${EVO_URL}`);
      console.log(`n8n: ${N8N_URL}`);
      console.log(`Instance sync every ${INSTANCE_SYNC_MS}ms`);
    } else {
      console.log(`WhatsApp Ads setup mode → open http://localhost:${PORT}/setup to configure`);
    }
  });

  if (!INSTALLED) return;

  // Mantiene las instancias sincronizadas con Evolution API
  syncInstancesWithEvolution().catch((e) => console.warn('[instance-sync] initial run failed:', e.message));
  setInterval(() => {
    syncInstancesWithEvolution().catch((e) => console.warn('[instance-sync] run failed:', e.message));
  }, INSTANCE_SYNC_MS);
  // Facturación: revisa vencimientos cada minuto
  runBillingChecks().catch((e) => console.warn('[billing] initial check failed:', e.message));
  setInterval(() => {
    runBillingChecks().catch((e) => console.warn('[billing] check failed:', e.message));
  }, BILLING_CHECK_MS);
  // Envío automático de campañas programadas: cron dentro del contenedor
  // (no depende de n8n ni de conexiones externas). Por defecto cada minuto.
  processDueCampaigns().catch((e) => console.warn('[campaign-cron] initial run failed:', e.message));
  cron.schedule(CAMPAIGN_CRON, () => {
    processDueCampaigns().catch((e) => console.warn('[campaign-cron] run failed:', e.message));
  });
  console.log(`Campaign cron: ${CAMPAIGN_CRON}`);
}

start();
