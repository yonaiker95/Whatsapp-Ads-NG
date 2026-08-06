const { IAProvider } = require('./ia-provider');
const { requestJson, buildAuthError } = require('./http');

class AzureProvider extends IAProvider {
  get id() {
    return 'azure';
  }

  get label() {
    return 'Azure OpenAI';
  }

  get defaultBaseUrl() {
    return null;
  }

  get availableModels() {
    return [
      { id: 'gpt-4o', label: 'GPT-4o (deployment)', inputCost: 2.5, outputCost: 10 },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (deployment)', inputCost: 0.15, outputCost: 0.6 },
      { id: 'gpt-4.1', label: 'GPT-4.1 (deployment)', inputCost: 2, outputCost: 8 },
    ];
  }

  get helpGuide() {
    return [
      'Entra en el Portal de Azure: https://portal.azure.com',
      'Crea un recurso "Azure OpenAI" en tu suscripción.',
      'Abre el recurso y ve a "Keys and Endpoint".',
      'Copia la URL del endpoint (base) y una de las dos API Keys.',
      'Ve a "Model deployments" y crea/consulta tu deployment (nombre del modelo).',
      'Indica Endpoint, API Key y el nombre del deployment en el Centro de IA.',
      'Pulsa "Validar conexión" y luego "Guardar".',
    ];
  }

  async validateConnection({ apiKey, baseUrl, project }) {
    if (!apiKey) return { ok: false, error: 'La API Key es requerida' };
    if (!baseUrl) return { ok: false, error: 'El Endpoint de Azure es requerido' };
    const deployment = project || 'gpt-4o-mini';
    try {
      const base = baseUrl.replace(/\/$/, '');
      const url = `${base}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
      await requestJson('POST', url, { 'api-key': apiKey }, {
        model: deployment,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return { ok: true, models: this.availableModels.map((m) => m.id) };
    } catch (err) {
      const code = err && (err.statusCode || err.status);
      if (code === 400 || code === 404) return { ok: true, models: this.availableModels.map((m) => m.id) };
      return buildAuthError(this.label, err);
    }
  }

  async generate({ apiKey, baseUrl, model, project }, { system, messages, temperature, maxTokens }) {
    const deployment = model || project || 'gpt-4o-mini';
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const url = `${base}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
    const chatMessages = [];
    if (system) chatMessages.push({ role: 'system', content: system });
    for (const m of messages || []) {
      chatMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    }
    const data = await requestJson('POST', url, { 'api-key': apiKey }, {
      model: deployment,
      messages: chatMessages,
      temperature: temperature != null ? temperature : 0.7,
      max_tokens: maxTokens != null ? maxTokens : 200,
    });
    const choice = data.choices && data.choices[0];
    return {
      text: (choice && choice.message && choice.message.content) || '',
      usage: {
        inputTokens: (data.usage && data.usage.prompt_tokens) || 0,
        outputTokens: (data.usage && data.usage.completion_tokens) || 0,
      },
    };
  }
}

module.exports = { AzureProvider };
