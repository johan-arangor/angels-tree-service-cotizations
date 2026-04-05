/**
 * auth.js — Gestión de sesiones y autenticación
 *
 * Responsabilidad única: controlar el ciclo de vida de la sesión del usuario.
 * No tiene dependencias circulares; solo lee CONFIG y escribe en sessionStorage.
 */
class AuthService {
  constructor(sessionKey, sessionDurationMs) {
    this._key = sessionKey;
    this._duration = sessionDurationMs;
  }

  // ── Persistencia de sesión ──────────────────────────────────

  /**
   * Persiste la sesión en sessionStorage.
   * @param {string} token
   * @param {{ id, usuario, rol }} user
   */
  saveSession(token, user) {
    const session = {
      token,
      user,
      expiresAt: Date.now() + this._duration,
    };
    sessionStorage.setItem(this._key, JSON.stringify(session));
  }

  /**
   * Lee y valida la sesión almacenada.
   * @returns {{ token: string, user: Object } | null}
   */
  getSession() {
    try {
      const raw = sessionStorage.getItem(this._key);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (Date.now() > session.expiresAt) {
        this.clearSession();
        return null;
      }
      return session;
    } catch {
      this.clearSession();
      return null;
    }
  }

  /** Elimina la sesión del almacenamiento local. */
  clearSession() {
    sessionStorage.removeItem(this._key);
  }

  /** Retorna true si hay sesión válida. */
  isAuthenticated() {
    return this.getSession() !== null;
  }

  /** Retorna el token activo o null. */
  getToken() {
    return this.getSession()?.token ?? null;
  }

  /** Retorna el objeto usuario o null. */
  getUser() {
    return this.getSession()?.user ?? null;
  }
}

// Instancia singleton
const Auth = new AuthService(CONFIG.SESSION_KEY, CONFIG.SESSION_DURATION_MS);