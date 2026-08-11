// Integración con la cuenta de Google de CADA instancia (OAuth 2.0) para
// alimentar el conocimiento del chatbot: hojas de cálculo (Sheets), documentos
// (Docs) y agenda (Calendar). Las fuentes configuradas en instance_google_sources
// se leen EN VIVO al responder (buildGoogleBusinessContext), nunca se copian.
//
// Configuración (variables de entorno):
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  -> credenciales OAuth (Web client)
//   GOOGLE_REDIRECT_URI                       -> opcional, sobreescribe la URL de
//                                                retorno (por defecto
//                                                {APP_URL}/api/chatbot/google/callback)
//
// Los tokens se guardan cifrados en la tabla google_connections (una por
// instancia, instance_id único) con encryptSecret/decryptSecret (AES-256-GCM).
// Los access tokens se renuevan automáticamente con el refresh token antes de
// cada llamada.
const crypto = require('crypto');

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

// Límites por defecto al importar (evita traer gigas de texto o explotar la
// llamada de embeddings). Se pueden ajustar con variables de entorno.
const MAX_SHEET_ROWS = parseInt(process.env.GOOGLE_SHEET_MAX_ROWS || '5000', 10);
const MAX_SHEETS_PER_SPREADSHEET = 20;
const MAX_CALENDAR_EVENTS = parseInt(process.env.GOOGLE_CALENDAR_MAX_EVENTS || '500', 10);

function createGoogleClient(deps) {
  const { getPool, encryptSecret, decryptSecret, appUrl } = deps;

  function clientConfig() {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    const redirectUri = (
      process.env.GOOGLE_REDIRECT_URI ||
      `${String(appUrl()).replace(/\/+$/, '')}/api/chatbot/google/callback`
    );
    return { clientId, clientSecret, redirectUri };
  }

  function isConfigured() {
    const { clientId, clientSecret } = clientConfig();
    return Boolean(clientId && clientSecret);
  }

  // -------------------------------------------------------------------------
  // HTTP helper hacia las APIs de Google
  // -------------------------------------------------------------------------
  async function googleFetch(accessToken, url, options = {}) {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      ...(options.body ? { body: options.body } : {}),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const err = new Error(
        (data && (data.error?.message || data.error_description || data.error)) || `Google API HTTP ${res.status}`
      );
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  function postForm(url, fields) {
    const body = new URLSearchParams(fields).toString();
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }).then(async (res) => {
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) {
        const err = new Error(
          (data && (data.error_description || data.error)) || `Google OAuth HTTP ${res.status}`
        );
        err.status = res.status;
        err.body = data;
        throw err;
      }
      return data;
    });
  }

  // -------------------------------------------------------------------------
  // Conexión de la cuenta de Google asociada a UNA INSTANCIA. La tabla
  // google_connections ahora se indexa por instance_id: cada WhatsApp puede
  // conectar su propia cuenta de Google y el bot lee de ahí en tiempo real.
  // -------------------------------------------------------------------------
  async function getConnection(instanceId) {
    const pool = getPool();
    const row = (await pool.query('SELECT * FROM google_connections WHERE instance_id = $1', [instanceId])).rows[0];
    if (!row) return null;
    const refreshToken = decryptSecret(row.refresh_token_enc);
    let accessToken = decryptSecret(row.access_token_enc);
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;

    // Renueva el access token si está a punto de caducar (margen de 1 min).
    if (refreshToken && Date.now() > expiresAt - 60 * 1000) {
      const { clientId, clientSecret } = clientConfig();
      const fresh = await postForm(TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });
      accessToken = fresh.access_token;
      await pool.query(
        `UPDATE google_connections
         SET access_token_enc = $1, expires_at = $2, updated_at = NOW()
         WHERE instance_id = $3`,
        [
          encryptSecret(accessToken),
          new Date(Date.now() + parseInt(fresh.expires_in || '3600', 10) * 1000),
          instanceId,
        ]
      ).catch(() => {});
    }
    return {
      instanceId,
      email: row.google_email,
      accessToken,
      refreshToken,
      scopes: row.scopes || null,
    };
  }

  // Exige una conexión activa: si no hay tokens, lanza un error con status 401
  // para que los endpoints devuelvan un mensaje claro ("conecta tu cuenta").
  async function requireConnection(instanceId) {
    const conn = await getConnection(instanceId);
    if (!conn || !conn.accessToken) {
      const err = new Error('Conecta la cuenta de Google de esta instancia');
      err.status = 401;
      err.code = 'NO_CONNECTION';
      throw err;
    }
    return conn;
  }

  // -------------------------------------------------------------------------
  // OAuth 2.0 (flow authorization code con state para asociar instancia)
  // -------------------------------------------------------------------------
  const oauthStates = new Map(); // state -> { userId, instanceId, expiresAt }

  function buildAuthUrl(userId, instanceId) {
    const { clientId, redirectUri } = clientConfig();
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { userId, instanceId, expiresAt: Date.now() + 10 * 60 * 1000 });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async function handleCallback(code, state) {
    const entry = oauthStates.get(state);
    oauthStates.delete(state);
    if (!entry || entry.expiresAt < Date.now()) {
      const err = new Error('El estado de autorización de Google no es válido o caducó');
      err.stateInvalid = true;
      throw err;
    }
    const { clientId, clientSecret, redirectUri } = clientConfig();
    const data = await postForm(TOKEN_URL, {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (!data.access_token) {
      throw new Error('Google no devolvió un access token');
    }
    const info = await googleFetch(data.access_token, 'https://www.googleapis.com/oauth2/v2/userinfo');
    const pool = getPool();
    // Elimina las conexiones legacy a nivel de usuario (la misma cuenta solía
    // ser compartida entre todas las instancias) y luego inserta/actualiza la
    // conexión de esta instancia.
    await pool.query('DELETE FROM google_connections WHERE user_id = $1 AND instance_id IS NULL', [entry.userId]).catch(() => {});
    await pool.query(
      `INSERT INTO google_connections
         (user_id, instance_id, google_email, access_token_enc, refresh_token_enc, scopes, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (instance_id) WHERE instance_id IS NOT NULL DO UPDATE SET
         user_id = EXCLUDED.user_id,
         google_email = EXCLUDED.google_email,
         access_token_enc = EXCLUDED.access_token_enc,
         refresh_token_enc = EXCLUDED.refresh_token_enc,
         scopes = EXCLUDED.scopes,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [
        entry.userId,
        entry.instanceId,
        info.email || 'cuenta de Google',
        encryptSecret(data.access_token),
        encryptSecret(data.refresh_token),
        (data.scope || '').split(' ').join(','),
        new Date(Date.now() + parseInt(data.expires_in || '3600', 10) * 1000),
      ]
    );
    return { email: info.email };
  }

  async function disconnect(instanceId) {
    const conn = await getConnection(instanceId).catch(() => null);
    if (conn && conn.accessToken) {
      try {
        await fetch(`${REVOKE_URL}?token=${encodeURIComponent(conn.accessToken)}`, { method: 'POST' }).catch(() => {});
      } catch {
        // el revoke es best-effort
      }
    }
    const pool = getPool();
    await pool.query('DELETE FROM google_connections WHERE instance_id = $1', [instanceId]);
  }

  // -------------------------------------------------------------------------
  // Listados (Drive para hojas/documentos, Calendar para la agenda)
  // -------------------------------------------------------------------------
  async function listFiles(instanceId, kind) {
    const conn = await requireConnection(instanceId);
    const mime = kind === 'docs'
      ? 'application/vnd.google-apps.document'
      : 'application/vnd.google-apps.spreadsheet';
    const q = `mimeType='${mime}' and trashed=false`;
    const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&pageSize=100&orderBy=folder,name&fields=files(id,name,mimeType),nextPageToken`;
    const data = await googleFetch(conn.accessToken, url);
    return (data.files || [])
      .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async function listCalendars(instanceId) {
    const conn = await requireConnection(instanceId);
    const data = await googleFetch(conn.accessToken, 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
    return (data.items || [])
      .map((c) => ({ id: c.id, summary: c.summary, primary: Boolean(c.primary) }))
      .sort((a, b) => String(a.summary).localeCompare(String(b.summary)));
  }

  // -------------------------------------------------------------------------
  // Conversión de contenido a texto
  // -------------------------------------------------------------------------
  function sheetToText(meta, values) {
    const rows = (values || []).filter((r) => Array.isArray(r) && r.some((c) => String(c == null ? '' : c).trim()));
    if (rows.length === 0) return '';
    const headers = rows[0].map((h) => String(h == null ? '' : h).trim());
    const lines = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      const pairs = [];
      for (let ci = 0; ci < cells.length; ci++) {
        const val = String(cells[ci] == null ? '' : cells[ci]).trim();
        if (!val) continue;
        const label = (headers[ci] && headers[ci].trim()) || `Columna ${ci + 1}`;
        pairs.push(`${label}: ${val}`);
      }
      if (pairs.length) lines.push(pairs.join(' | '));
    }
    const name = (meta && meta.properties && meta.properties.title) || 'Hoja de cálculo';
    return lines.length ? `${name}:\n${lines.join('\n')}` : '';
  }

  function docStructuralToText(content) {
    if (!Array.isArray(content)) return '';
    const out = [];
    const walk = (elements) => {
      for (const el of elements || []) {
        if (!el) continue;
        if (el.paragraph) {
          for (const pe of el.paragraph.elements || []) {
            if (pe.textRun && pe.textRun.content) out.push(pe.textRun.content);
          }
          out.push('\n');
        } else if (el.table) {
          for (const tr of el.table.tableRows || []) {
            const cells = [];
            for (const tc of tr.tableCells || []) {
              cells.push(collectText(tc.content).replace(/\n+/g, ' ').trim());
            }
            out.push(` | ${cells.join(' | ')} |\n`);
          }
        } else if (el.tableOfContents) {
          walk(el.tableOfContents.content);
        } else if (el.sectionBreak) {
          out.push('\n');
        }
      }
    };
    // Recoge el texto de un fragmento sin mezclarlo con el acumulador global.
    const collectText = (elements) => {
      const tmp = [];
      const inner = (items) => {
        for (const it of items || []) {
          if (!it) continue;
          if (it.paragraph) {
            for (const pe of it.paragraph.elements || []) {
              if (pe.textRun && pe.textRun.content) tmp.push(pe.textRun.content);
            }
            tmp.push('\n');
          } else if (it.table) {
            for (const tr of it.table.tableRows || []) {
              for (const tc of tr.tableCells || []) {
                tmp.push(collectText(tc.content).replace(/\n+/g, ' ').trim(), ' | ');
              }
              tmp.push('\n');
            }
          } else if (it.tableOfContents) {
            inner(it.tableOfContents.content);
          }
        }
      };
      inner(items);
      return tmp.join('');
    };
    walk(content);
    return out.join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  function formatCalendarEvent(e) {
    const raw = e.start && (e.start.dateTime || e.start.date);
    let when = raw || '';
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        when = d.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
      }
    }
    const parts = [];
    if (e.summary) parts.push(`Evento: ${e.summary}`);
    if (when) parts.push(`Fecha: ${when}`);
    if (e.location) parts.push(`Lugar: ${e.location}`);
    if (e.description) parts.push(`Descripción: ${String(e.description).replace(/\s+/g, ' ')}`);
    return parts.join(' | ');
  }

  // -------------------------------------------------------------------------
  // Lectura de fuentes a texto { title, content, url }: usadas para construir
  // el contexto en vivo de cada mensaje (buildGoogleBusinessContext).
  // -------------------------------------------------------------------------
  async function importSheet(instanceId, fileId, opts = {}) {
    const conn = await requireConnection(instanceId);
    const meta = await googleFetch(
      conn.accessToken,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=properties(title),sheets.properties(title,gridProperties)`
    );
    const sheetName = opts.sheetName || '';
    const range = opts.range || 'A1:Z200';
    const sheets = (meta.sheets || [])
      .filter((s) => !sheetName || (s.properties && s.properties.title === sheetName))
      .slice(0, MAX_SHEETS_PER_SPREADSHEET);
    const blocks = [];
    for (const s of sheets) {
      const st = s.properties && s.properties.title;
      if (!st) continue;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}/values/${encodeURIComponent(st)}!${encodeURIComponent(range)}?majorDimension=ROWS`;
      const res = await googleFetch(conn.accessToken, url);
      const rows = (res.values || []).slice(0, MAX_SHEET_ROWS);
      blocks.push(sheetToText({ properties: { title: `${(meta.properties && meta.properties.title) || 'Hoja de cálculo'} / ${st}` } }, rows));
    }
    const content = blocks.filter(Boolean).join('\n\n').trim();
    const title = (meta.properties && meta.properties.title) || 'Hoja de cálculo';
    return {
      title,
      content,
      url: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/edit`,
    };
  }

  async function importDocs(instanceId, fileId) {
    const conn = await requireConnection(instanceId);
    const data = await googleFetch(
      conn.accessToken,
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}`
    );
    const content = docStructuralToText(data.body && data.body.content);
    return {
      title: data.title || 'Documento de Google',
      content,
      url: `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/edit`,
    };
  }

  async function importCalendar(instanceId, calendarId, days = 30) {
    const conn = await requireConnection(instanceId);
    const safeDays = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
    const calList = await googleFetch(conn.accessToken, 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
    const cal = (calList.items || []).find((c) => c.id === calendarId) || { id: calendarId, summary: 'Agenda' };
    const timeMin = new Date();
    const timeMax = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
      `?timeMin=${encodeURIComponent(timeMin.toISOString())}` +
      `&timeMax=${encodeURIComponent(timeMax.toISOString())}` +
      `&singleEvents=true&orderBy=startTime&maxResults=${MAX_CALENDAR_EVENTS}`;
    const data = await googleFetch(conn.accessToken, url);
    const events = data.items || [];
    const from = timeMin.toLocaleDateString('es');
    const to = timeMax.toLocaleDateString('es');
    const lines = [
      `Agenda del calendario "${cal.summary}"`,
      `Período: del ${from} al ${to}`,
      `Total de eventos: ${events.length}`,
      '',
    ];
    events.forEach((e) => {
      const line = formatCalendarEvent(e);
      if (line) lines.push(line);
    });
    return {
      title: `Agenda (${cal.summary})`,
      content: lines.join('\n').trim(),
      url: 'https://calendar.google.com/calendar/r',
    };
  }

  return {
    isConfigured,
    buildAuthUrl,
    handleCallback,
    disconnect,
    getConnection,
    listFiles,
    listCalendars,
    importSheet,
    importDocs,
    importCalendar,
    GOOGLE_SCOPES,
  };
}

module.exports = { createGoogleClient };
