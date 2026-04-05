/**
 * config.js — Configuración global de la aplicación
 *
 * IMPORTANTE: Reemplaza APPS_SCRIPT_URL con la URL de tu Web App publicada.
 * Guarda este archivo en tu repositorio, pero en proyectos reales considera
 * usar variables de entorno o un archivo .env con un build step.
 */

const CONFIG = Object.freeze({
  /**
   * URL del Web App de Google Apps Script.
   * Tras publicar el script, pega aquí la URL completa.
   * Ejemplo: "https://script.google.com/macros/s/AKfycby.../exec"
   */
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxp_vftmgdTHMN38LC9iFbVnNuwFbqawVCvUyhwyRDQe5nd3KwSCz6WucEd9SDgNj-UHw/exec",

  /** Duración de la sesión en milisegundos (4 horas) */
  SESSION_DURATION_MS: 4 * 60 * 60 * 1000,

  /** Clave para sessionStorage */
  SESSION_KEY: "aq_session",

  /** Versión de la aplicación */
  APP_VERSION: "1.0.0",

  /** Tablas de multiplicadores (espejo del Excel para cálculo offline) */
  TABLES: {
    servicios: {
      "Poda de árboles":    { horas: 1.5 },
      "Limpieza de ramas":  { horas: 2.0 },
      "Corte parcial":      { horas: 3.0 },
      "Remoción completa":  { horas: 6.0 },
      "Emergencia":         { horas: 4.0 },
    },
    espacio: {
      "Amplio":   1.00,
      "Medio":    1.15,
      "Reducido": 1.30,
      "Crítico":  1.50,
    },
    cables: {
      "No":                    1.00,
      "Sí, a distancia segura": 1.25,
      "Sí, muy cerca":          1.50,
    },
    objetos: {
      "No":              1.00,
      "Algunos":         1.15,
      "Muchos / críticos": 1.30,
    },
    acceso: {
      "Fácil":    1.0,
      "Moderado": 1.1,
      "Difícil":  1.2,
    },
    altura: {
      "0–20 ft":  0.9,
      "20–40 ft": 1.0,
      "40–70 ft": 1.2,
      "+70 ft":   1.5,
    },
    diametro: {
      "Delgado":    1.00,
      "Medio":      1.15,
      "Grueso":     1.35,
      "Muy grueso": 1.60,
    },
    riesgo: {
      "Bajo":  1.00,
      "Medio": 1.15,
      "Alto":  1.35,
    },
  },
});
