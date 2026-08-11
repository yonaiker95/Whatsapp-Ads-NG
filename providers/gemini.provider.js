const { IAProvider } = require('./ia-provider');
const { requestJson, buildAuthError } = require('./http');

class GeminiProvider extends IAProvider {
  get id() {
    return 'gemini';
  }

  get label() {
    return 'Google Gemini';
  }

  get defaultBaseUrl() {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  get availableModels() {
    return [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', inputCost: 0.1, outputCost: 0.4 },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', inputCost: 1.25, outputCost: 10 },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini Flash Lite', inputCost: 0.025, outputCost: 0.075 },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', inputCost: 0.1, outputCost: 0.4 },
    ];
  }

  get helpGuide() {
    return [
      'Abre Google AI Studio: https://aistudio.google.com',
      'Inicia sesión con tu cuenta de Google.',
      'Ve a "Get API key" (Obtener clave de API).',
      'Crea una nueva API Key (o selecciona una existente).',
      'Copia la clave (empieza por "AIza...").',
      'Pégala en el Centro de IA y pulsa "Validar conexión".',
      'Si es válida, pulsa "Guardar" y ya puedes usar el chatbot con IA.',
    ];
  }

  get embedModel() {
    return 'gemini-embedding-001';
  }

  _headers(apiKey) {
    return { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
  }

  async validateConnection({ apiKey, baseUrl }) {
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    try {
      const data = await requestJson('GET', `${base}/models`, this._headers(apiKey));
      const models = (Array.isArray(data.models) ? data.models : [])
        .map((m) => m.name && m.name.replace(/^models\//, ''))
        .filter(Boolean)
        .filter((name) => /^gemini-/.test(name));
      return { ok: true, models };
    } catch (err) {
      return buildAuthError(this.label, err);
    }
  }

  async generate({ apiKey, baseUrl, model }, { system, messages, temperature, maxTokens }) {
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const m = model || 'gemini-2.5-flash';
    const contents = [];
    for (const msg of messages || []) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: msg.content }] });
    }
    if (contents.length === 0) contents.push({ role: 'user', parts: [{ text: '' }] });
    // Gemini 2.5 es un modelo "thinking": consume tokens del presupuesto de
    // salida para razonar (thoughtsTokenCount). Se separa un presupuesto de
    // razonamiento para que la respuesta visible conserve su límite real.
    let maxOut = maxTokens != null ? maxTokens : 200;
    const isThinkingModel = /^gemini-2\.5-/.test(m);
    let thinkingBudget;
    if (isThinkingModel) {
      thinkingBudget = Math.min(512, Math.max(0, Math.round(maxOut * 2)));
      maxOut = maxOut + thinkingBudget;
    }
    const body = {
      contents,
      generationConfig: {
        temperature: temperature != null ? temperature : 0.7,
        maxOutputTokens: maxOut,
      },
    };
    if (isThinkingModel) {
      body.generationConfig.thinkingConfig = { thinkingBudget };
    }
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const data = await requestJson('POST', `${base}/models/${m}:generateContent`, this._headers(apiKey), body);
    const candidate = data.candidates && data.candidates[0];
    const text = (candidate && candidate.content && candidate.content.parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim();
    const usage = data.usageMetadata || {};
    return {
      text,
      usage: {
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
      },
    };
  }

  async embed({ apiKey, baseUrl }, texts) {
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const model = this.embedModel || 'gemini-embedding-001';
    const items = (texts || []).filter((t) => String(t || '').trim());
    if (items.length === 0) return [];
    const results = await Promise.all(
      items.map(async (t) => {
        const data = await requestJson(
          'POST',
          `${base}/models/${model}:embedContent`,
          this._headers(apiKey),
          { model: `models/${model}`, content: { parts: [{ text: String(t || '') }] } }
        );
        return data.embedding && data.embedding.values;
      })
    );
    return results;
  }
}

module.exports = { GeminiProvider };
