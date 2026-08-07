const { OpenAICompatibleProvider } = require('./openai-compatible.provider');

class MistralProvider extends OpenAICompatibleProvider {
  get id() {
    return 'mistral';
  }

  get label() {
    return 'Mistral';
  }

  get defaultBaseUrl() {
    return 'https://api.mistral.ai/v1';
  }

  get availableModels() {
    return [
      { id: 'mistral-large-latest', label: 'Mistral Large', inputCost: 2, outputCost: 6 },
      { id: 'mistral-medium-latest', label: 'Mistral Medium', inputCost: 2.7, outputCost: 8.1 },
      { id: 'mistral-small-latest', label: 'Mistral Small', inputCost: 0.2, outputCost: 0.6 },
    ];
  }

  get _defaultModel() {
    return 'mistral-small-latest';
  }

  get _probeModel() {
    return 'mistral-small-latest';
  }

  get embedModel() {
    return 'mistral-embed';
  }

  get helpGuide() {
    return [
      'Abre https://console.mistral.ai y crea una cuenta.',
      'Ve a "API Keys" en el panel lateral.',
      'Pulsa "Create new key".',
      'Copia la clave.',
      'Pégala en el Centro de IA y pulsa "Validar conexión".',
      'Si es válida, pulsa "Guardar".',
    ];
  }
}

module.exports = { MistralProvider };
