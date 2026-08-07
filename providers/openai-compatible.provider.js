const { IAProvider } = require('./ia-provider');
const { requestJson, buildAuthError } = require('./http');

// Clase base para proveedores que exponen un endpoint compatible con OpenAI
// /chat/completions (OpenAI, DeepSeek, Mistral, OpenRouter, Azure). Los
// proveedores concretos solo definen id/label/baseUrl/headers/manejo de errores.
class OpenAICompatibleProvider extends IAProvider {
  get defaultBaseUrl() {
    return 'https://api.openai.com/v1';
  }

  // Modelos que aceptan un id de modelo en el body para /chat/completions.
  get availableModels() {
    return [];
  }

  get helpGuide() {
    return [];
  }

  get authScheme() {
    return 'Bearer';
  }

  // Modelo de embeddings: los proveedores compatibles con OpenAI que expongan
  // uno lo definen; si devuelve null el sistema usa búsqueda léxica.
  get embedModel() {
    return null;
  }

  _buildUrl(baseUrl, model) {
    return `${(baseUrl || this.defaultBaseUrl).replace(/\/$/, '')}/chat/completions`;
  }

  _headers(apiKey, extra) {
    const h = { 'Content-Type': 'application/json', ...(extra || {}) };
    if (apiKey) h.Authorization = `${this.authScheme} ${apiKey}`;
    return h;
  }

  async validateConnection({ apiKey, baseUrl }) {
    if (!apiKey) {
      return { ok: false, error: 'La API Key es requerida' };
    }
    try {
      await requestJson(
        'POST',
        this._buildUrl(baseUrl, null),
        this._headers(apiKey),
        { model: this._probeModel, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }
      );
      return { ok: true, models: this.availableModels.map((m) => m.id) };
    } catch (err) {
      const code = err && (err.statusCode || err.status);
      // Algunos proveedores rechazan un modelo vacío/desconocido pero la
      // autenticación es correcta.
      if (code === 400 || code === 404) return { ok: true, models: this.availableModels.map((m) => m.id) };
      return buildAuthError(this.label, err);
    }
  }

  async generate({ apiKey, baseUrl, model, organization, project }, { system, messages, temperature, maxTokens }) {
    const chatMessages = [];
    if (system) chatMessages.push({ role: 'system', content: system });
    for (const m of messages || []) {
      chatMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    }
    const body = {
      model: model || this._defaultModel,
      messages: chatMessages,
      temperature: temperature != null ? temperature : 0.7,
      max_tokens: maxTokens != null ? maxTokens : 200,
    };
    const headers = this._headers(apiKey);
    if (organization) headers['OpenAI-Organization'] = organization;
    if (project) headers['OpenAI-Project'] = project;
    const data = await requestJson('POST', this._buildUrl(baseUrl, model), headers, body);
    const choice = data.choices && data.choices[0];
    return {
      text: (choice && choice.message && choice.message.content) || '',
      usage: {
        inputTokens: (data.usage && data.usage.prompt_tokens) || 0,
        outputTokens: (data.usage && data.usage.completion_tokens) || 0,
      },
    };
  }

  async embed({ apiKey, baseUrl, organization, project }, texts) {
    const model = this.embedModel;
    if (!model) {
      throw new Error(`El proveedor ${this.label} no expone un modelo de embeddings`);
    }
    const headers = this._headers(apiKey);
    if (organization) headers['OpenAI-Organization'] = organization;
    if (project) headers['OpenAI-Project'] = project;
    const data = await requestJson(
      'POST',
      `${(baseUrl || this.defaultBaseUrl).replace(/\/$/, '')}/embeddings`,
      headers,
      { model, input: (texts || []).map((t) => String(t || '')) }
    );
    return (data.data || [])
      .slice()
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((e) => e.embedding);
  }
}

module.exports = { OpenAICompatibleProvider };
