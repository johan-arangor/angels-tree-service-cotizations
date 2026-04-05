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
 * SOLUCIÓN CORS para Google Apps Script:
 *   GAS tiene 3 restricciones que rompen fetch() estándar:
 *   1. No soporta preflight OPTIONS → usar Content-Type: text/plain (header "simple")
 *   2. No expone headers custom (X-Session-Token) → token viaja en el body JSON
 *   3. Redirige internamente (302) → fetch necesita redirect: "follow"
 */
class ApiService {
  constructor(baseUrl) {
    this._baseUrl = baseUrl;
  }

  /**
   * POST al backend. Usa text/plain para evitar preflight CORS en GAS.
   * El token de sesión se incluye en el body (no en headers).
   */
  async _post(action, payload = {}, token = null) {
    const bodyObj = { action, ...payload };
    if (token) bodyObj._token = token;

    const resp = await fetch(this._baseUrl, {
      method:   "POST",
      redirect: "follow",
      headers:  { "Content-Type": "text/plain" },
      body:     JSON.stringify(bodyObj),
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

  /**
   * Autentica al usuario. El hash SHA-256 se genera en el browser
   * para que la contraseña nunca viaje en texto plano.
   */
  async login(username, passwordPlain) {
    const passwordHash = await CryptoUtils.sha256(passwordPlain);
    const result = await this._post("login", { username, passwordHash });
    return result.data;
  }

  async logout(token) {
    try {
      await this._post("logout", {}, token);
    } catch (_) {
      // Silencioso: sesión local ya se limpió antes de llamar aquí
    }
  }

  async createQuote(quoteData, token) {
    const result = await this._post("crear_cotizacion", { quoteData }, token);
    return result.data;
  }

  async getQuotes(token) {
    const result = await this._post("obtener_cotizaciones", {}, token);
    return result.data;
  }
}

class ApiError extends Error {
  constructor(message, statusCode = 0, raw = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.raw = raw;
  }
}

const CryptoUtils = {
  async sha256(message) {
    const msgBuffer  = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  },
};

const Api = new ApiService(CONFIG.APPS_SCRIPT_URL);
