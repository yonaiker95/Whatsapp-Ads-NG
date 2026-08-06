const { OpenAICompatibleProvider } = require('./openai-compatible.provider');

class DeepSeekProvider extends OpenAICompatibleProvider {
  get id() {
    return 'deepseek';
  }

  get label() {
    return 'DeepSeek';
  }

  get defaultBaseUrl() {
    return 'https://api.deepseek.com/v1';
  }

  get availableModels() {
    return [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)', inputCost: 0.27, outputCost: 1.1 },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', inputCost: 0.55, outputCost: 2.19 },
    ];
  }

  get _defaultModel() {
    return 'deepseek-chat';
  }

  get _probeModel() {
    return 'deepseek-chat';
  }

  get helpGuide() {
    return [
      'Abre https://platform.deepseek.com y crea una cuenta.',
      'Ve a "API Keys".',
      'Pulsa "Create new API key".',
      'Copia la clave (empieza por "sk-...").',
      'Pégala en el Centro de IA y pulsa "Validar conexión".',
      'Si es válida, pulsa "Guardar".',
    ];
  }
}

module.exports = { DeepSeekProvider };
