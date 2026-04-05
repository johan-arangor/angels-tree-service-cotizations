/**
 * SAGA TREE — Google Apps Script Backend
 * Publicar: Ejecutar como Yo · Acceso: Cualquiera
 * CORS: Content-Type text/plain (sin preflight) · token en body._token
 */

var SPREADSHEET_ID     = "1hfi-R3jbtmgoSYbWiqvsl0Q4uFlYa8JkskfAcGmeKY0";
var SHEET_USUARIOS     = "Usuarios";
var SHEET_COTIZACIONES = "Cotizaciones";
var SHEET_TOKENS       = "Tokens";
var TOKEN_TTL_MS       = 4 * 60 * 60 * 1000;

// ── Caché de spreadsheet (una sola apertura por invocación) ───────
var _ss = null;
function _getSS() {
  if (!_ss) _ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _ss;
}

// ── Inicialización de hojas ───────────────────────────────────────

function _initSheets() {
  var ss = _getSS();

  var sheets = {
    Usuarios:      ["ID", "Usuario", "PasswordHash", "Rol", "FechaCreacion", "Estado"],
    Cotizaciones:  ["ID_Cotizacion", "Usuario", "Cliente", "Fecha", "ItemsJSON",
                    "Subtotal", "Impuestos", "Descuento", "Total", "Estado"],
    Tokens:        ["Token", "Usuario", "CreadoEn", "ExpiraEn", "Activo"],
  };

  Object.keys(sheets).forEach(function(name) {
    var s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name);
      s.appendRow(sheets[name]);
      Logger.log("Hoja creada: " + name);
    } else {
      // Si existe pero está vacía, poner encabezados
      if (s.getLastRow() === 0) {
        s.appendRow(sheets[name]);
        Logger.log("Encabezados agregados a hoja existente vacía: " + name);
      }
    }
  });
}

// ── Entry points ──────────────────────────────────────────────────

function doPost(e) {
  try {
    _initSheets();
    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action;
    Logger.log("► action: " + action);

    switch (action) {
      case "login":                return _respond(handleLogin(payload));
      case "logout":               return _respond(handleLogout(payload));
      case "crear_cotizacion":     return _respond(handleCrearCotizacion(payload));
      case "obtener_cotizaciones": return _respond(handleObtenerCotizaciones(payload));
      default:                     return _respond(_error("Accion no reconocida: " + action));
    }
  } catch (err) {
    Logger.log("✗ doPost ERROR: " + err.message + "\n" + err.stack);
    return _respond(_error("Error interno: " + err.message));
  }
}

function doGet(e) {
  _initSheets();
  return _respond({ success: true, message: "SagaTreeQuote API activa." });
}

// ── Login ─────────────────────────────────────────────────────────

function handleLogin(payload) {
  var username     = _sanitize(String(payload.username     || "").trim());
  var passwordHash = _sanitize(String(payload.passwordHash || "").trim());

  if (!username || !passwordHash) return _error("Usuario y contrasena requeridos.");

  var ss    = _getSS();
  var sheet = ss.getSheetByName(SHEET_USUARIOS);
  var data  = sheet.getDataRange().getValues();

  Logger.log("Usuarios hoja filas: " + data.length);

  if (data.length < 2) return _error("No hay usuarios registrados en la hoja Usuarios.");

  var headers   = data[0].map(function(h){ return String(h).trim(); });
  var colUser   = headers.indexOf("Usuario");
  var colHash   = headers.indexOf("PasswordHash");
  var colEstado = headers.indexOf("Estado");
  var colID     = headers.indexOf("ID");
  var colRol    = headers.indexOf("Rol");

  Logger.log("Columnas encontradas → Usuario:" + colUser + " Hash:" + colHash + " Estado:" + colEstado);

  if (colUser === -1 || colHash === -1 || colEstado === -1) {
    return _error("Encabezados incorrectos en Usuarios. Esperado: ID|Usuario|PasswordHash|Rol|FechaCreacion|Estado");
  }

  for (var i = 1; i < data.length; i++) {
    var row        = data[i];
    var rowUsuario = String(row[colUser]   || "").trim().toLowerCase();
    var rowHash    = String(row[colHash]   || "").trim();
    var rowEstado  = String(row[colEstado] || "").trim().toLowerCase();

    Logger.log("Fila " + i + ": usuario='" + rowUsuario + "' estado='" + rowEstado + "'");

    if (rowUsuario !== username.toLowerCase()) continue;

    if (rowEstado !== "activo") return _error("Cuenta desactivada.");
    if (rowHash   !== passwordHash) return _error("Contrasena incorrecta.");

    // Credenciales OK → generar token
    var token = _generateToken();
    var now   = new Date().getTime();

    // Guardar token directamente (sin llamar a _saveToken para evitar doble apertura)
    var tokenSheet = _getSS().getSheetByName(SHEET_TOKENS);
    tokenSheet.appendRow([token, row[colUser], now, now + TOKEN_TTL_MS, "true"]);

    Logger.log("✓ Login OK para " + row[colUser] + " token=" + token.substring(0, 12) + "...");

    return _success({
      token: token,
      user: {
        id:      String(row[colID]   || i),
        usuario: String(row[colUser] || username),
        rol:     String(row[colRol]  || "Vendedor"),
      }
    }, "Login exitoso.");
  }

  return _error("Usuario no encontrado.");
}

// ── Logout ────────────────────────────────────────────────────────

function handleLogout(payload) {
  var token = String(payload._token || "");
  if (token) _invalidateToken(token);
  return _success(null, "Sesion cerrada.");
}

// ── Cotizaciones ──────────────────────────────────────────────────

function handleCrearCotizacion(payload) {
  var auth = _requireAuth(payload);
  if (auth.error) return auth;

  var qd = payload.quoteData;
  if (!qd)                                       return _error("Datos de cotizacion no proporcionados.");
  if (!qd.cliente || !String(qd.cliente).trim()) return _error("El nombre del cliente es obligatorio.");
  if (!qd.itemsJSON)                             return _error("Detalle del servicio no proporcionado.");

  var sheet   = _getSS().getSheetByName(SHEET_COTIZACIONES);
  var newId   = sheet.getLastRow();
  var now     = new Date().toISOString();

  sheet.appendRow([
    newId,
    auth.username,
    _sanitize(String(qd.cliente   || "").trim()),
    now,
    _sanitize(String(qd.itemsJSON || "{}")),
    Number(qd.subtotal  || 0),
    Number(qd.impuestos || 0),
    Number(qd.descuento || 0),
    Number(qd.total     || 0),
    "Activa",
  ]);

  Logger.log("✓ Cotizacion " + newId + " creada por " + auth.username);
  return _success({ id_cotizacion: newId }, "Cotizacion guardada.");
}

function handleObtenerCotizaciones(payload) {
  var auth = _requireAuth(payload);
  if (auth.error) return auth;

  var sheet   = _getSS().getSheetByName(SHEET_COTIZACIONES);
  var data    = sheet.getDataRange().getValues();

  if (data.length < 2) return _success([], "Sin cotizaciones.");

  var headers = data[0].map(function(h){ return String(h).trim(); });
  var colUser = headers.indexOf("Usuario");
  if (colUser === -1) return _error("Columna Usuario no encontrada en Cotizaciones.");

  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[colUser]).trim().toLowerCase() === auth.username.toLowerCase()) {
      var obj = {};
      headers.forEach(function(h, idx) {
        obj[h] = row[idx] instanceof Date ? row[idx].toISOString() : row[idx];
      });
      result.push(obj);
    }
  }

  result.sort(function(a, b) { return new Date(b.Fecha) - new Date(a.Fecha); });
  return _success(result);
}

// ── Validación de token ───────────────────────────────────────────

function _validateToken(token) {
  if (!token || token === "undefined" || token === "null") {
    Logger.log("_validateToken: token vacío o inválido");
    return { valid: false, username: null };
  }

  var sheet = _getSS().getSheetByName(SHEET_TOKENS);
  if (!sheet) {
    Logger.log("_validateToken: hoja Tokens no existe");
    return { valid: false, username: null };
  }

  var data = sheet.getDataRange().getValues();
  Logger.log("_validateToken: hoja Tokens tiene " + data.length + " filas");

  if (data.length < 2) {
    Logger.log("_validateToken: hoja Tokens sin datos");
    return { valid: false, username: null };
  }

  var headers   = data[0].map(function(h){ return String(h).trim(); });
  var colToken  = headers.indexOf("Token");
  var colUser   = headers.indexOf("Usuario");
  var colExpira = headers.indexOf("ExpiraEn");
  var colActivo = headers.indexOf("Activo");

  Logger.log("_validateToken headers: " + JSON.stringify(headers));
  Logger.log("_validateToken cols → Token:" + colToken + " Usuario:" + colUser + " ExpiraEn:" + colExpira + " Activo:" + colActivo);

  if (colToken === -1 || colUser === -1 || colExpira === -1 || colActivo === -1) {
    Logger.log("_validateToken: encabezados incorrectos en Tokens");
    return { valid: false, username: null };
  }

  var now = new Date().getTime();
  var tokenShort = token.substring(0, 12) + "...";

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var rowToken = String(row[colToken] || "").trim();

    if (rowToken === token) {
      var activo   = String(row[colActivo]).trim().toLowerCase() === "true";
      var expiraEn = Number(row[colExpira]);
      Logger.log("Token encontrado en fila " + i + " activo=" + activo + " expira=" + expiraEn + " now=" + now);

      if (!activo)      { Logger.log("Token inactivo");  return { valid: false, username: null }; }
      if (now > expiraEn) { Logger.log("Token expirado"); return { valid: false, username: null }; }

      Logger.log("✓ Token válido para: " + row[colUser]);
      return { valid: true, username: String(row[colUser]).trim() };
    }
  }

  Logger.log("Token " + tokenShort + " no encontrado en " + (data.length - 1) + " registros");
  return { valid: false, username: null };
}

function _invalidateToken(token) {
  var sheet = _getSS().getSheetByName(SHEET_TOKENS);
  if (!sheet) return;

  var data      = sheet.getDataRange().getValues();
  var headers   = data[0].map(function(h){ return String(h).trim(); });
  var colToken  = headers.indexOf("Token");
  var colActivo = headers.indexOf("Activo");
  if (colToken === -1 || colActivo === -1) return;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colToken]).trim() === token) {
      sheet.getRange(i + 1, colActivo + 1).setValue("false");
      return;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function _requireAuth(payload) {
  var token = String(payload._token || "").trim();
  Logger.log("_requireAuth token=" + (token ? token.substring(0, 12) + "..." : "VACÍO"));
  if (!token) return _error("Token de sesion no proporcionado.");

  var result = _validateToken(token);
  if (!result.valid) return _error("Sesion invalida o expirada. Inicia sesion nuevamente.");
  return { error: false, username: result.username };
}

function _generateToken() {
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  var t = "";
  for (var i = 0; i < 48; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
  return t + Date.now().toString(36);
}

function _sanitize(str) {
  if (typeof str !== "string") return str;
  str = str.replace(/[\x00-\x1F\x7F]/g, "");
  if (/^[=+\-@]/.test(str)) str = "'" + str;
  return str;
}

function _success(data, message) {
  return { success: true, data: data || null, message: message || "OK" };
}

function _error(message) {
  Logger.log("✗ ERROR: " + message);
  return { success: false, data: null, message: message, error: true };
}

function _respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
