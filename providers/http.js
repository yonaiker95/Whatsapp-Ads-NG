// Helper HTTP mínimo compartido por todos los proveedores (usa fetch global en Node >= 18).
async function requestJson(method, url, headers, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(
      (data && (data.error?.message || data.message || data.error)) || `HTTP ${res.status}`
    );
    err.statusCode = res.status;
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function buildAuthError(providerLabel, err) {
  const code = err && (err.statusCode || err.status);
  if (code === 401 || code === 403) {
    return {
      ok: false,
      authError: true,
      error: `${providerLabel} rechazó la autenticación (${code}). Revisa la API Key.`,
    };
  }
  return {
    ok: false,
    error: (err && err.message) || 'No se pudo conectar con el proveedor',
  };
}

module.exports = { requestJson, buildAuthError };
