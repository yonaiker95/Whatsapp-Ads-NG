const { OpenAICompatibleProvider } = require('./openai-compatible.provider');

class OpenRouterProvider extends OpenAICompatibleProvider {
  get id() {
    return 'openrouter';
  }

  get label() {
    return 'OpenRouter';
  }

  get defaultBaseUrl() {
    return 'https://openrouter.ai/api/v1';
  }

  get availableModels() {
    return [
      { id: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet', inputCost: 3, outputCost: 15 },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', inputCost: 0.15, outputCost: 0.6 },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', inputCost: 0.1, outputCost: 0.4 },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', inputCost: 0.27, outputCost: 1.1 },
    ];
  }

  get _defaultModel() {
    return 'openai/gpt-4o-mini';
  }

  get _probeModel() {
    return 'openai/gpt-4o-mini';
  }

  get helpGuide() {
    return [
      'Abre https://openrouter.ai y crea una cuenta.',
      'Ve a "Keys" en tu panel.',
      'Pulsa "Create Key".',
      'Copia la clave (empieza por "sk-or-v1-...").',
      'Pégala en el Centro de IA y pulsa "Validar conexión".',
      'Si es válida, pulsa "Guardar".',
    ];
  }
}

module.exports = { OpenRouterProvider };
