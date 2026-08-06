// ProviderManager - único punto de entrada que usa el resto de la aplicación
// para hablar con los proveedores de IA. Los proveedores se registran aquí y se
// resuelven por id.
//
// La aplicación DEBE pasar siempre por este manager (nunca importar un proveedor
// concreto directamente), de modo que añadir un proveedor nuevo no toque código
// de funcionalidad.
const { GeminiProvider } = require('./gemini.provider');
const { OpenAIProvider } = require('./openai.provider');
const { ClaudeProvider } = require('./claude.provider');
const { DeepSeekProvider } = require('./deepseek.provider');
const { MistralProvider } = require('./mistral.provider');
const { OpenRouterProvider } = require('./openrouter.provider');
const { AzureProvider } = require('./azure.provider');

const PROVIDER_IDS = [
  'gemini',
  'openai',
  'claude',
  'deepseek',
  'mistral',
  'openrouter',
  'azure',
];

class ProviderManager {
  constructor() {
    this.providers = new Map();
    for (const P of [GeminiProvider, OpenAIProvider, ClaudeProvider, DeepSeekProvider, MistralProvider, OpenRouterProvider, AzureProvider]) {
      const p = new P();
      this.providers.set(p.id, p);
    }
  }

  list() {
    return [...this.providers.values()];
  }

  get(id) {
    return this.providers.get(id) || null;
  }

  isSupported(id) {
    return this.providers.has(id);
  }

  // Metadatos públicos para la UI (sin secretos).
  catalogue() {
    return this.list().map((p) => ({
      id: p.id,
      label: p.label,
      defaultBaseUrl: p.defaultBaseUrl,
      models: p.availableModels,
      helpGuide: p.helpGuide,
      requiresApiKey: true,
      requiresBaseUrl: p.id === 'azure',
    }));
  }

  // Resuelve la configuración efectiva para una fila de configuración: la clave
  // gestionada por la plataforma (modo SaaS) o la clave propia cifrada del
  // cliente (modo BYOK).
  // @param config  Fila de BD de ai_configs
  // @param decrypt (key) => string   descifra el texto cifrado almacenado
  // @returns { apiKey, baseUrl, organization, project, model, provider }
  resolveSettings(config, decrypt) {
    if (!config) return null;
    const provider = this.get(config.provider);
    if (!provider) return null;
    return {
      provider,
      apiKey: decrypt(config.api_key_enc),
      baseUrl: config.base_url || null,
      organization: config.organization || null,
      project: config.project || null,
      model: config.model || (provider.availableModels[0] && provider.availableModels[0].id) || null,
    };
  }
}

// Singleton - toda la aplicación comparte un único registro.
module.exports = {
  ProviderManager,
  providerManager: new ProviderManager(),
  PROVIDER_IDS,
};
