const { OpenAICompatibleProvider } = require('./openai-compatible.provider');

class OpenAIProvider extends OpenAICompatibleProvider {
  get id() {
    return 'openai';
  }

  get label() {
    return 'OpenAI';
  }

  get availableModels() {
    return [
      { id: 'gpt-4o', label: 'GPT-4o', inputCost: 2.5, outputCost: 10 },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputCost: 0.15, outputCost: 0.6 },
      { id: 'gpt-4.1', label: 'GPT-4.1', inputCost: 2, outputCost: 8 },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', inputCost: 0.4, outputCost: 1.6 },
      { id: 'o4-mini', label: 'o4-mini', inputCost: 1.1, outputCost: 4.4 },
    ];
  }

  get _defaultModel() {
    return 'gpt-4o-mini';
  }

  get _probeModel() {
    return 'gpt-4o-mini';
  }

  get embedModel() {
    return 'text-embedding-3-small';
  }

  get helpGuide() {
    return [
      'Abre https://platform.openai.com y crea una cuenta o inicia sesión.',
      'Ve a "API Keys" en el panel izquierdo.',
      'Pulsa "Create new secret key".',
      'Copia la clave (empieza por "sk-...").',
      'Pégala en el Centro de IA y pulsa "Validar conexión".',
      'Si es válida, pulsa "Guardar".',
    ];
  }
}

module.exports = { OpenAIProvider };
