// IAProvider - la interfaz única que todo proveedor de IA debe implementar.
//
// El resto de la aplicación (chatbot, centro de IA, etc.) DEBE consumir esta
// interfaz a través del ProviderManager. Nunca debe depender de un proveedor
// concreto (Gemini, OpenAI, ...) directamente.
//
// @abstract
class IAProvider {
  constructor() {
    if (this.constructor === IAProvider) {
      throw new TypeError('IAProvider es una interfaz abstracta');
    }
  }

  // Identificador de máquina: 'gemini', 'openai', ...
  get id() {
    throw new Error('Se requiere IAProvider.id');
  }

  // Etiqueta visible en la UI: 'Google Gemini', ...
  get label() {
    throw new Error('Se requiere IAProvider.label');
  }

  // Endpoint por defecto usado cuando el usuario no proporciona uno.
  get defaultBaseUrl() {
    return null;
  }

  // Lista de modelos que expone el proveedor para el catálogo SaaS / selector BYOK.
  // Cada elemento: { id, label, inputCost?, outputCost?, isPreview? }
  get availableModels() {
    return [];
  }

  // Guía paso a paso (arreglo de strings) para obtener la API key.
  get helpGuide() {
    return [];
  }

  // Valida que la configuración de conexión indicada sea correcta.
  // @returns Promise<{ ok: boolean, error?: string, models?: string[], label?: string }>
  async validateConnection(/* { apiKey, baseUrl, organization, project } */) {
    throw new Error('IAProvider.validateConnection no está implementado');
  }

  // Genera una respuesta (completion) para un chat.
  // @param settings { apiKey, baseUrl, organization, project, model }
  // @param request  { system, messages: [{role, content}], temperature, maxTokens }
  // @returns Promise<{ text: string, usage?: { inputTokens, outputTokens } }>
  async generate(/* settings, request */) {
    throw new Error('IAProvider.generate no está implementado');
  }
}

module.exports = { IAProvider };
