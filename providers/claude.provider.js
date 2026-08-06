const { IAProvider } = require('./ia-provider');
const { requestJson, buildAuthError } = require('./http');

class ClaudeProvider extends IAProvider {
  get id() {
    return 'claude';
  }

  get label() {
    return 'Anthropic Claude';
  }

  get defaultBaseUrl() {
    return 'https://api.anthropic.com/v1';
  }

  get availableModels() {
    return [
      { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', inputCost: 15, outputCost: 75 },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', inputCost: 3, outputCost: 15 },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', inputCost: 1, outputCost: 5 },
    ];
  }

  get helpGuide() {
    return [
      'Abre https://console.anthropic.com y crea una cuenta.',
      'Ve a "API Keys".',
      'Pulsa "Create Key".',
      'Copia la clave (empieza por "sk-ant-...").',
      'Pégala en el Centro de IA y pulsa "Validar conexión".',
      'Si es válida, pulsa "Guardar".',
    ];
  }

  _headers(apiKey) {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }

  async validateConnection({ apiKey, baseUrl }) {
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    try {
      await requestJson(
        'POST',
        `${base}/messages`,
        this._headers(apiKey),
        { model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }
      );
      return { ok: true, models: this.availableModels.map((m) => m.id) };
    } catch (err) {
      const code = err && (err.statusCode || err.status);
      if (code === 400 || code === 404) return { ok: true, models: this.availableModels.map((m) => m.id) };
      return buildAuthError(this.label, err);
    }
  }

  async generate({ apiKey, baseUrl, model }, { system, messages, temperature, maxTokens }) {
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const body = {
      model: model || 'claude-sonnet-4-5',
      max_tokens: maxTokens != null ? maxTokens : 200,
      temperature: temperature != null ? temperature : 0.7,
      messages: (messages || []).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };
    if (system) body.system = system;
    const data = await requestJson('POST', `${base}/messages`, this._headers(apiKey), body);
    return {
      text: (data.content || []).map((c) => c.text || '').join('').trim(),
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    };
  }
}

module.exports = { ClaudeProvider };
