/**
 * api.js — Capa de comunicación con Google Apps Script
 *
 * Principios SOLID aplicados:
 *   S — Cada método tiene una responsabilidad única (login, crear, obtener)
 *   O — Extendible mediante herencia o composición sin modificar la clase base
 *   L — ApiService puede ser sustituido por un mock en tests
 *   I — Interfaz mínima necesaria por cliente
 *   D — Depende de CONFIG (abstracción), no de strings hardcodeados
 *
 * Patrón: Service Object (no singleton global mutable)
 */
class ApiService {
  /**
   * @param {string} baseUrl - URL base del Web App de Apps Script
   */
  constructor(baseUrl) {
    this._baseUrl = baseUrl;
  }

  // ── Métodos privados ────────────────────────────────────────

  /**
   * Realiza una petición POST al backend y parsea la respuesta JSON.
   * Apps Script con doPost solo acepta POST. Usamos URLSearchParams
   * porque Apps Script espera application/x-www-form-urlencoded o
   * bien JSON en e.postData.contents.
   *
   * @param {string} action - Ruta/acción del backend
   * @param {Object} payload - Datos a enviar
   * @param {string|null} token - Token de sesión (si aplica)
   * @returns {Promise<{success: boolean, data: any, message: string}>}
   */
  async _post(action, payload = {}, token = null) {
    const body = JSON.stringify({ action, ...payload });
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Session-Token"] = token;

    // Apps Script publicado como "Cualquiera" con doPost puede recibir fetch normal.
    // Sin embargo, por limitaciones de CORS en GAS, usamos mode: "no-cors" con
    // GET si es necesario. Aquí preferimos POST estándar con CORS habilitado desde GAS.
    const resp = await fetch(this._baseUrl, {
      method: "POST",
      headers,
      body,
    });

    if (!resp.ok) {
      throw new ApiError(`HTTP ${resp.status}: ${resp.statusText}`, resp.status);
    }

    const json = await resp.json();

    if (!json.success) {
      throw new ApiError(json.message || "Error del servidor", 400, json);
    }

    return json;
  }

  // ── Métodos públicos ────────────────────────────────────────

  /**
   * Autentica al usuario contra la hoja Usuarios.
   * El hash SHA-256 de la contraseña se computa en el FRONTEND antes de enviar,
   * para que la contraseña en texto plano NUNCA viaje por la red.
   *
   * @param {string} username
   * @param {string} passwordPlain - Contraseña en texto plano
   * @returns {Promise<{token: string, user: Object}>}
   */
  async login(username, passwordPlain) {
    const passwordHash = await CryptoUtils.sha256(passwordPlain);
    const result = await this._post("login", { username, passwordHash });
    return result.data; // { token, user: { id, usuario, rol } }
  }

  /**
   * Cierra la sesión en el backend (invalida el token).
   * @param {string} token
   */
  async logout(token) {
    try {
      await this._post("logout", {}, token);
    } catch (_) {
      // Silencioso: el token local ya se elimina aunque falle el backend
    }
  }

  /**
   * Crea una cotización en la hoja Cotizaciones.
   * @param {Object} quoteData - Datos de la cotización
   * @param {string} token - Token de sesión activo
   * @returns {Promise<{id_cotizacion: string}>}
   */
  async createQuote(quoteData, token) {
    const result = await this._post("crear_cotizacion", { quoteData }, token);
    return result.data;
  }

  /**
   * Obtiene las cotizaciones del usuario autenticado.
   * @param {string} token
   * @returns {Promise<Array>}
   */
  async getQuotes(token) {
    const result = await this._post("obtener_cotizaciones", {}, token);
    return result.data; // Array de cotizaciones
  }
}

/**
 * Error tipado para respuestas del API.
 */
class ApiError extends Error {
  constructor(message, statusCode = 0, raw = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.raw = raw;
  }
}

/**
 * Utilidades criptográficas usando la Web Crypto API nativa del navegador.
 * No requiere librerías externas.
 */
const CryptoUtils = {
  /**
   * Genera hash SHA-256 de un string y retorna hex string.
   * @param {string} message
   * @returns {Promise<string>}
   */
  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  },
};

// Instancia global del servicio (inyectable en tests)
const Api = new ApiService(CONFIG.APPS_SCRIPT_URL);
