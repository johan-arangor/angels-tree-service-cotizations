/**
 * ═══════════════════════════════════════════════════════════════
 *  ArborQuote — Google Apps Script Backend
 *  Archivo: Code.gs
 *
 *  Publicar como:
 *    Ejecutar como: Yo (mi cuenta)
 *    Quién tiene acceso: Cualquiera (Anyone)
 *
 *  Estructura de Sheets esperada:
 *    Hoja "Usuarios":     ID | Usuario | PasswordHash | Rol | FechaCreacion | Estado
 *    Hoja "Cotizaciones": ID_Cotizacion | Usuario | Cliente | Fecha | ItemsJSON |
 *                         Subtotal | Impuestos | Descuento | Total | Estado
 *    Hoja "Tokens":       Token | Usuario | CreadoEn | ExpiraEn | Activo
 * ═══════════════════════════════════════════════════════════════
 */

// ── Constantes ──────────────────────────────────────────────────

var SPREADSHEET_ID   = "TU_SPREADSHEET_ID_AQUI"; // Reemplazar
var SHEET_USUARIOS   = "Usuarios";
var SHEET_COTIZACIONES = "Cotizaciones";
var SHEET_TOKENS     = "Tokens";
var TOKEN_TTL_MS     = 4 * 60 * 60 * 1000; // 4 horas

// ── Entry point ─────────────────────────────────────────────────

/**
 * Maneja todas las peticiones POST.
 * Routing por campo "action" en el body JSON.
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action;

    Logger.log("doPost action: " + action);

    switch (action) {
      case "login":
        return _respond(handleLogin(payload));
      case "logout":
        return _respond(handleLogout(payload, e));
      case "crear_cotizacion":
        return _respond(handleCrearCotizacion(payload, e));
      case "obtener_cotizaciones":
        return _respond(handleObtenerCotizaciones(payload, e));
      default:
        return _respond(_error("Acción no reconocida: " + action));
    }
  } catch (err) {
    Logger.log("doPost ERROR: " + err.message);
    return _respond(_error("Error interno del servidor: " + err.message));
  }
}

/**
 * Preflight CORS para peticiones OPTIONS.
 * Algunos clientes lo requieren antes de POST.
 */
function doGet(e) {
  return _respond({ success: true, message: "ArborQuote API activa." });
}

// ── Auth handlers ────────────────────────────────────────────────

/**
 * POST /login
 * Valida usuario+passwordHash contra hoja Usuarios.
 * Si es correcto, genera y almacena un token de sesión.
 *
 * @param {{ username: string, passwordHash: string }} payload
 */
function handleLogin(payload) {
  var username     = _sanitize(payload.username || "");
  var passwordHash = _sanitize(payload.passwordHash || "");

  if (!username || !passwordHash) {
    return _error("Usuario y contraseña son requeridos.");
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_USUARIOS);
  var data  = sheet.getDataRange().getValues();
  var headers = data[0]; // ID | Usuario | PasswordHash | Rol | FechaCreacion | Estado

  // Buscar usuario (case-insensitive)
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowUsuario = String(row[_col(headers, "Usuario")] || "").toLowerCase();
    var rowHash    = String(row[_col(headers, "PasswordHash")] || "");
    var rowEstado  = String(row[_col(headers, "Estado")] || "");

    if (rowUsuario === username.toLowerCase()) {
      if (rowEstado.toLowerCase() !== "activo") {
        return _error("Cuenta desactivada. Contacta al administrador.");
      }
      if (rowHash !== passwordHash) {
        return _error("Contraseña incorrecta.");
      }

      // Credenciales correctas: generar token
      var token = _generateToken();
      var now   = new Date().getTime();

      _saveToken(token, username, now, now + TOKEN_TTL_MS);

      return _success({
        token: token,
        user: {
          id:      row[_col(headers, "ID")],
          usuario: row[_col(headers, "Usuario")],
          rol:     row[_col(headers, "Rol")],
        }
      }, "Login exitoso.");
    }
  }

  return _error("Usuario no encontrado.");
}

/**
 * POST /logout
 * Invalida el token de sesión.
 */
function handleLogout(payload, e) {
  var token = _extractToken(e);
  if (token) {
    _invalidateToken(token);
  }
  return _success(null, "Sesión cerrada.");
}

// ── Cotizaciones handlers ────────────────────────────────────────

/**
 * POST /crear_cotizacion
 * Crea una nueva cotización en la hoja Cotizaciones.
 */
function handleCrearCotizacion(payload, e) {
  var auth = _requireAuth(e);
  if (auth.error) return auth;

  var qd = payload.quoteData;
  if (!qd) return _error("Datos de cotización no proporcionados.");

  // Validación backend
  if (!qd.cliente || String(qd.cliente).trim() === "") {
    return _error("El nombre del cliente es obligatorio.");
  }
  if (!qd.itemsJSON) {
    return _error("Detalle del servicio no proporcionado.");
  }

  var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet  = ss.getSheetByName(SHEET_COTIZACIONES);
  var lastRow = sheet.getLastRow();
  var newId  = lastRow; // ID secuencial (row offset)

  var now = new Date().toISOString();

  // Sanitizar campos críticos
  var cliente   = _sanitize(String(qd.cliente || "").trim());
  var itemsJSON = _sanitize(String(qd.itemsJSON || "{}"));
  var estado    = "Activa";

  sheet.appendRow([
    newId,                          // ID_Cotizacion
    auth.username,                  // Usuario
    cliente,                        // Cliente
    now,                            // Fecha
    itemsJSON,                      // ItemsJSON
    Number(qd.subtotal  || 0),      // Subtotal
    Number(qd.impuestos || 0),      // Impuestos
    Number(qd.descuento || 0),      // Descuento
    Number(qd.total     || 0),      // Total
    estado,                         // Estado
  ]);

  Logger.log("Cotización creada: " + newId + " por " + auth.username);

  return _success({ id_cotizacion: newId }, "Cotización guardada exitosamente.");
}

/**
 * POST /obtener_cotizaciones
 * Retorna las cotizaciones del usuario autenticado.
 * Filtra por columna Usuario para multi-tenant básico.
 */
function handleObtenerCotizaciones(payload, e) {
  var auth = _requireAuth(e);
  if (auth.error) return auth;

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_COTIZACIONES);
  var data  = sheet.getDataRange().getValues();

  if (data.length < 2) return _success([], "Sin cotizaciones.");

  var headers = data[0];
  var userCol = _col(headers, "Usuario");
  var result  = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[userCol]).toLowerCase() === auth.username.toLowerCase()) {
      var obj = {};
      headers.forEach(function(h, idx) {
        obj[h] = row[idx];
      });
      // Convertir fecha a ISO si es Date object
      if (obj["Fecha"] instanceof Date) {
        obj["Fecha"] = obj["Fecha"].toISOString();
      }
      result.push(obj);
    }
  }

  // Ordenar por fecha descendente
  result.sort(function(a, b) {
    return new Date(b.Fecha) - new Date(a.Fecha);
  });

  return _success(result);
}

// ── Gestión de tokens ────────────────────────────────────────────

/**
 * Guarda un token en la hoja Tokens.
 * Hoja: Token | Usuario | CreadoEn | ExpiraEn | Activo
 */
function _saveToken(token, username, createdAt, expiresAt) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TOKENS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TOKENS);
    sheet.appendRow(["Token", "Usuario", "CreadoEn", "ExpiraEn", "Activo"]);
  }
  sheet.appendRow([token, username, createdAt, expiresAt, "true"]);
}

/**
 * Valida que un token exista, esté activo y no haya expirado.
 * @returns {{ valid: boolean, username: string|null }}
 */
function _validateToken(token) {
  if (!token) return { valid: false, username: null };

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TOKENS);
  if (!sheet) return { valid: false, username: null };

  var data    = sheet.getDataRange().getValues();
  var headers = data[0]; // Token | Usuario | CreadoEn | ExpiraEn | Activo
  var now     = new Date().getTime();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[_col(headers, "Token")] === token) {
      var activo   = String(row[_col(headers, "Activo")]).toLowerCase() === "true";
      var expiraEn = Number(row[_col(headers, "ExpiraEn")]);
      if (activo && now < expiraEn) {
        return { valid: true, username: String(row[_col(headers, "Usuario")]) };
      }
      return { valid: false, username: null }; // expirado o inactivo
    }
  }

  return { valid: false, username: null };
}

/** Marca un token como inactivo (logout). */
function _invalidateToken(token) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TOKENS);
  if (!sheet) return;

  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var tokenCol = _col(headers, "Token");
  var activoCol = _col(headers, "Activo");

  for (var i = 1; i < data.length; i++) {
    if (data[i][tokenCol] === token) {
      sheet.getRange(i + 1, activoCol + 1).setValue("false");
      return;
    }
  }
}

// ── Helpers internos ─────────────────────────────────────────────

/**
 * Extrae y valida el token de sesión del header X-Session-Token.
 * Si no es válido, retorna un objeto de error.
 * @returns {{ error: boolean, message: string }|{ error: false, username: string }}
 */
function _requireAuth(e) {
  var token = _extractToken(e);
  if (!token) return _error("Token de sesión no proporcionado.");

  var result = _validateToken(token);
  if (!result.valid) return _error("Sesión inválida o expirada. Inicia sesión nuevamente.");

  return { error: false, username: result.username };
}

/** Lee el token del header de la petición. */
function _extractToken(e) {
  try {
    return (e && e.parameter && e.parameter["X-Session-Token"])
      || (e && e.headers && e.headers["X-Session-Token"])
      || null;
  } catch (_) {
    return null;
  }
}

/**
 * Genera un token UUID v4 aleatorio.
 * No usa librerías externas; usa Math.random() + timestamp para entropía básica.
 * Para producción crítica, considerar UUID real o JWT firmado.
 */
function _generateToken() {
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  var token = "";
  for (var i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token + Date.now().toString(36);
}

/**
 * Sanitización básica: elimina caracteres peligrosos para Google Sheets.
 * Previene fórmula injection (cells que empiecen con =, +, -, @).
 */
function _sanitize(str) {
  if (typeof str !== "string") return str;
  // Eliminar caracteres de control
  str = str.replace(/[\x00-\x1F\x7F]/g, "");
  // Prevenir inyección de fórmulas en Sheets
  if (str.match(/^[=+\-@]/)) str = "'" + str;
  return str;
}

/**
 * Encuentra el índice de columna por nombre de header.
 * @param {Array} headers
 * @param {string} name
 * @returns {number}
 */
function _col(headers, name) {
  var idx = headers.indexOf(name);
  if (idx === -1) throw new Error("Columna no encontrada: " + name);
  return idx;
}

// ── Constructores de respuesta ───────────────────────────────────

/**
 * Respuesta exitosa estándar.
 * @param {*} data
 * @param {string} message
 */
function _success(data, message) {
  return { success: true, data: data || null, message: message || "OK" };
}

/**
 * Respuesta de error estándar.
 * @param {string} message
 */
function _error(message) {
  Logger.log("ERROR: " + message);
  return { success: false, data: null, message: message, error: true };
}

/**
 * Envuelve la respuesta con headers CORS y la serializa como JSON.
 * CRÍTICO: sin esto, el frontend recibe un error CORS.
 */
function _respond(obj) {
  var output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  // Nota: GAS no permite setHeader en ContentService directamente.
  // Los headers CORS se configuran a nivel de la Web App al publicarla como
  // "Cualquiera" (Anyone). Si necesitas CORS explícito, usa HtmlService:
  //
  // return HtmlService.createHtmlOutput(JSON.stringify(obj))
  //   .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  //
  // O mejor: configura un proxy en tu hosting (Netlify/Vercel redirect rules).

  return output;
}