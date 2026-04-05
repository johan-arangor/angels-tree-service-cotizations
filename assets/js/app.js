/**
 * app.js — Controlador principal de la SPA
 *
 * Actúa como orquestador: inicializa módulos, gestiona rutas de vistas
 * y conecta eventos DOM con servicios (Api, Auth, Calculator).
 *
 * Arquitectura: MVC ligero sin framework
 *   Model   → Api + Auth + Calculator (archivos separados)
 *   View    → QuoteView + DOM directo
 *   Controller → App (este archivo)
 */
const App = (() => {
  // ── Estado reactivo mínimo ──────────────────────────────────
  let _quotes = [];           // Cache de cotizaciones del usuario
  let _currentView = null;    // Vista activa

  // ── Inicialización ──────────────────────────────────────────

  function init() {
    // Si ya hay sesión válida, ir al dashboard directamente
    if (Auth.isAuthenticated()) {
      _showApp();
    } else {
      _showLogin();
    }

    _bindEvents();
  }

  // ── Binding de eventos ──────────────────────────────────────

  function _bindEvents() {
    // Login
    document.getElementById("login-form")
      .addEventListener("submit", _handleLogin);

    // Toggle password visibility
    document.querySelector(".toggle-pass")
      .addEventListener("click", _togglePassword);

    // Logout
    document.getElementById("logout-btn")
      .addEventListener("click", _handleLogout);

    // Nav items
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => navigate(btn.dataset.view));
    });

    // Formulario de cotización
    document.getElementById("quote-form")
      .addEventListener("submit", _handleCreateQuote);

    // Recalcular precio en tiempo real
    const calcFields = [
      "q-servicio","q-espacio","q-cables","q-objetos","q-acceso",
      "q-altura","q-diametro","q-riesgo","q-tarifa","q-horas-manual",
      "q-descuento","q-impuesto",
    ];
    calcFields.forEach(id => {
      document.getElementById(id)?.addEventListener("input", _updatePriceSummary);
      document.getElementById(id)?.addEventListener("change", _updatePriceSummary);
    });

    // Adicionales (checkboxes)
    document.querySelectorAll('[name="adicional"]').forEach(cb => {
      cb.addEventListener("change", _updatePriceSummary);
    });

    // Búsqueda de cotizaciones
    document.getElementById("search-quotes")
      ?.addEventListener("input", _handleSearch);

    // Cerrar modal al hacer click fuera
    document.getElementById("quote-modal")
      .addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeModal();
      });
  }

  // ── Handlers de login/logout ────────────────────────────────

  async function _handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const errorEl  = document.getElementById("login-error");
    const btn      = document.getElementById("login-btn");

    // Validación básica
    if (!username || !password) {
      _showFieldError(errorEl, "Completa todos los campos.");
      return;
    }

    _setLoading(btn, true);
    errorEl.classList.add("hidden");

    try {
      const { token, user } = await Api.login(username, password);
      Auth.saveSession(token, user);
      _showApp();
    } catch (err) {
      _showFieldError(
        errorEl,
        err instanceof ApiError ? err.message : "Error de conexión. Intenta más tarde."
      );
    } finally {
      _setLoading(btn, false);
    }
  }

  async function _handleLogout() {
    const token = Auth.getToken();
    Auth.clearSession();
    await Api.logout(token);
    _showLogin();
    showToast("Sesión cerrada correctamente.");
  }

  // ── Handlers de cotización ──────────────────────────────────

  async function _handleCreateQuote(e) {
    e.preventDefault();

    const form   = e.target;
    const btn    = document.getElementById("quote-btn");
    const errorEl = document.getElementById("quote-error");

    // Leer campos
    const raw = _readFormData(form);
    const validation = _validateQuoteForm(raw);
    if (!validation.ok) {
      _showFieldError(errorEl, validation.message);
      return;
    }

    // Calcular precio final
    const calc = Calculator.calculate({
      servicio:    raw.servicio,
      espacio:     raw.espacio,
      cables:      raw.cables,
      objetos:     raw.objetos,
      acceso:      raw.acceso,
      altura:      raw.altura,
      diametro:    raw.diametro,
      riesgo:      raw.riesgo,
      tarifa:      Number(raw.tarifa),
      horasManual: raw.horas_manual ? Number(raw.horas_manual) : null,
      adicionales: raw.adicionales,
      descuentoPct: Number(raw.descuento),
      impuestoPct:  Number(raw.impuesto),
    });

    // Construir payload
    const quoteData = {
      cliente:    raw.cliente,
      telefono:   raw.telefono,
      direccion:  raw.direccion,
      itemsJSON: JSON.stringify({
        servicio:     raw.servicio,
        espacio:      raw.espacio,
        cables:       raw.cables,
        objetos:      raw.objetos,
        acceso:       raw.acceso,
        altura:       raw.altura,
        diametro:     raw.diametro,
        riesgo:       raw.riesgo,
        tarifa:       raw.tarifa,
        horas:        calc.horasFinales,
        laborCost:    calc.laborCost,
        adicionales:  raw.adicionales,
        descuentoPct: raw.descuento,
        impuestoPct:  raw.impuesto,
        notas:        raw.notas,
        telefono:     raw.telefono,
        direccion:    raw.direccion,
      }),
      subtotal:   calc.subtotal,
      impuestos:  calc.impuestoAmt,
      descuento:  calc.descuentoAmt,
      total:      calc.total,
      estado:     "Activa",
    };

    _setLoading(btn, true);
    errorEl.classList.add("hidden");

    try {
      await Api.createQuote(quoteData, Auth.getToken());
      showToast("✓ Cotización guardada exitosamente.", "success");
      form.reset();
      _updatePriceSummary();
      navigate("mis-cotizaciones");
      _loadQuotes(true); // forzar reload
    } catch (err) {
      _showFieldError(
        errorEl,
        err instanceof ApiError ? err.message : "No se pudo guardar la cotización."
      );
    } finally {
      _setLoading(btn, false);
    }
  }

  // ── Cálculo reactivo de precio ──────────────────────────────

  function _updatePriceSummary() {
    const form = document.getElementById("quote-form");
    const data = _readFormData(form);

    // Si no hay suficientes datos, mostrar placeholders
    if (!data.servicio) {
      document.getElementById("sum-horas").textContent     = "—";
      document.getElementById("sum-subtotal").textContent  = "$0";
      document.getElementById("sum-adicionales").textContent = "$0";
      document.getElementById("sum-descuento").textContent = "—";
      document.getElementById("sum-impuesto").textContent  = "—";
      document.getElementById("sum-total").textContent     = "$0";
      document.getElementById("sum-rango").textContent     = "$800–$1,000 / hr";
      return;
    }

    const calc = Calculator.calculate({
      servicio:    data.servicio,
      espacio:     data.espacio,
      cables:      data.cables,
      objetos:     data.objetos,
      acceso:      data.acceso,
      altura:      data.altura,
      diametro:    data.diametro,
      riesgo:      data.riesgo,
      tarifa:      Number(data.tarifa) || 900,
      horasManual: data.horas_manual ? Number(data.horas_manual) : null,
      adicionales: data.adicionales,
      descuentoPct: Number(data.descuento) || 0,
      impuestoPct:  Number(data.impuesto)  || 0,
    });

    document.getElementById("sum-horas").textContent =
      `${Fmt.decimal(calc.horasFinales)} hrs`;
    document.getElementById("sum-subtotal").textContent =
      Fmt.currency(calc.laborCost);
    document.getElementById("sum-adicionales").textContent =
      Fmt.currency(calc.adicionalesTotal);
    document.getElementById("sum-descuento").textContent =
      calc.descuentoAmt > 0
        ? `−${Fmt.currency(calc.descuentoAmt)}`
        : "—";
    document.getElementById("sum-impuesto").textContent =
      calc.impuestoAmt > 0
        ? Fmt.currency(calc.impuestoAmt)
        : "—";
    document.getElementById("sum-total").textContent =
      Fmt.currency(calc.total);
    document.getElementById("sum-rango").textContent =
      `${Fmt.currency(calc.totalMin)} – ${Fmt.currency(calc.totalMax)}`;
  }

  // ── Lectura de formulario ───────────────────────────────────

  function _readFormData(form) {
    const d = new FormData(form);
    const adicionales = [];

    document.querySelectorAll('[name="adicional"]:checked').forEach(cb => {
      adicionales.push({
        nombre: cb.value,
        monto:  Number(cb.dataset.monto) || 0,
      });
    });

    return {
      cliente:     (d.get("cliente")    || "").trim(),
      telefono:    (d.get("telefono")   || "").trim(),
      direccion:   (d.get("direccion")  || "").trim(),
      servicio:    d.get("servicio")    || "",
      espacio:     d.get("espacio")     || "",
      cables:      d.get("cables")      || "",
      objetos:     d.get("objetos")     || "",
      acceso:      d.get("acceso")      || "",
      altura:      d.get("altura")      || "",
      diametro:    d.get("diametro")    || "",
      riesgo:      d.get("riesgo")      || "",
      tarifa:      d.get("tarifa")      || "900",
      horas_manual: d.get("horas_manual") || "",
      adicionales,
      descuento:   d.get("descuento")   || "0",
      impuesto:    d.get("impuesto")    || "0",
      notas:       (d.get("notas")      || "").trim(),
    };
  }

  // ── Validación ──────────────────────────────────────────────

  function _validateQuoteForm(data) {
    const required = [
      ["cliente",  "Nombre del cliente"],
      ["direccion","Dirección del servicio"],
      ["servicio", "Tipo de servicio"],
      ["espacio",  "Espacio de trabajo"],
      ["cables",   "Cables eléctricos"],
      ["objetos",  "Objetos cercanos"],
      ["acceso",   "Acceso"],
      ["altura",   "Altura del árbol"],
      ["diametro", "Diámetro del tronco"],
      ["riesgo",   "Nivel de riesgo"],
    ];

    for (const [field, label] of required) {
      if (!data[field]) {
        return { ok: false, message: `El campo "${label}" es obligatorio.` };
      }
    }

    // Sanitización básica: verificar que cliente no tenga caracteres peligrosos
    if (/[<>"']/.test(data.cliente)) {
      return { ok: false, message: "El nombre del cliente contiene caracteres no permitidos." };
    }

    return { ok: true };
  }

  // ── Carga de cotizaciones ───────────────────────────────────

  async function _loadQuotes(forceRefresh = false) {
    if (!forceRefresh && _quotes.length > 0) {
      _renderQuoteLists();
      return;
    }

    try {
      _quotes = await Api.getQuotes(Auth.getToken());
      _renderQuoteLists();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Error al cargar cotizaciones.";
      document.getElementById("recent-list").innerHTML =
        `<div class="empty-state">${msg}</div>`;
      document.getElementById("quotes-list").innerHTML =
        `<div class="empty-state">${msg}</div>`;
    }
  }

  function _renderQuoteLists() {
    // Dashboard: últimas 5
    const recent = [..._quotes]
      .sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha))
      .slice(0, 5);

    document.getElementById("recent-list").innerHTML =
      QuoteView.renderTable(recent);

    // Lista completa
    document.getElementById("quotes-list").innerHTML =
      QuoteView.renderTable(_quotes);

    // Stats
    _updateStats();
  }

  function _updateStats() {
    const total = _quotes.length;
    const now   = new Date();
    const mes   = _quotes.filter(q => {
      const d = new Date(q.Fecha);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    const totalMonto = _quotes.reduce((s, q) => s + (Number(q.Total) || 0), 0);
    const promedio   = total > 0 ? totalMonto / total : 0;

    document.getElementById("stat-total").textContent   = total;
    document.getElementById("stat-mes").textContent     = mes;
    document.getElementById("stat-monto").textContent   = Fmt.currency(totalMonto);
    document.getElementById("stat-promedio").textContent = Fmt.currency(promedio);
  }

  function _handleSearch(e) {
    const q = e.target.value.toLowerCase().trim();
    const filtered = q
      ? _quotes.filter(c =>
          (c.Cliente ?? "").toLowerCase().includes(q) ||
          (c.ID_Cotizacion ?? "").toString().includes(q)
        )
      : _quotes;

    document.getElementById("quotes-list").innerHTML =
      QuoteView.renderTable(filtered);
  }

  // ── Navegación ──────────────────────────────────────────────

  function navigate(viewId) {
    // Guardia: bloquear acceso a vista admin si no es Admin
    if (viewId === "admin-usuarios") {
      const user = Auth.getUser();
      const isAdmin = (user?.rol ?? "").toLowerCase() === "admin";
      if (!isAdmin) {
        showToast("Acceso denegado: se requiere rol Admin.", "error");
        return;
      }
    }

    // Update nav
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.view === viewId);
    });

    // Hide all views, show target
    document.querySelectorAll(".view").forEach(v => {
      v.classList.remove("active");
      v.classList.add("hidden");
    });

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
      target.classList.remove("hidden");
      target.classList.add("active");
    }

    _currentView = viewId;

    // Side effects por vista
    if (viewId === "dashboard" || viewId === "mis-cotizaciones") {
      _loadQuotes();
    }
    if (viewId === "nueva-cotizacion") {
      _updatePriceSummary();
    }
  }

  // ── Modal de cotización ─────────────────────────────────────

  function viewQuote(rawJson) {
    const q = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    document.getElementById("modal-content").innerHTML =
      QuoteView.renderPrintView(q);
    document.getElementById("quote-modal").classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("quote-modal").classList.add("hidden");
  }

  // ── Toast ───────────────────────────────────────────────────

  function showToast(msg, type = "") {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className   = `toast ${type}`;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 3500);
  }

  // ── Pantallas ───────────────────────────────────────────────

  function _showLogin() {
    document.body.classList.add("login-page");
    document.getElementById("login-screen").className = "screen active";
    document.getElementById("app-screen").className   = "screen hidden";
  }

  function _showApp() {
    document.body.classList.remove("login-page");
    document.getElementById("login-screen").className = "screen hidden";
    document.getElementById("app-screen").className   = "screen"; // flex via CSS

    // Poblar info de usuario en sidebar
    const user = Auth.getUser();
    if (user) {
      document.getElementById("user-name").textContent =
        user.usuario ?? user.id ?? "Usuario";
      document.getElementById("user-role").textContent =
        user.rol ?? "Asesor";
      document.getElementById("user-avatar").textContent =
        (user.usuario ?? "U")[0].toUpperCase();

      // Mostrar sección Admin solo si el rol es "Admin" (case-insensitive)
      const isAdmin = (user.rol ?? "").toLowerCase() === "admin";
      document.querySelectorAll(".admin-only").forEach(el => {
        el.classList.toggle("hidden", !isAdmin);
      });
    }

    navigate("dashboard");
  }

  // ── Helpers UI ──────────────────────────────────────────────

  function _setLoading(btn, on) {
    btn.disabled = on;
    btn.querySelector(".btn-text").classList.toggle("hidden", on);
    btn.querySelector(".btn-icon")?.classList.toggle("hidden", on);
    btn.querySelector(".btn-loader")?.classList.toggle("hidden", !on);
  }

  function _showFieldError(el, msg) {
    el.textContent = msg;
    el.classList.remove("hidden");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function _togglePassword() {
    const input = document.getElementById("password");
    input.type = input.type === "password" ? "text" : "password";
  }

  // ── API pública del módulo ──────────────────────────────────
  return {
    init,
    navigate,
    viewQuote,
    closeModal,
    showToast,
  };
})();

// Arrancar cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", App.init);

// ═══════════════════════════════════════════════════════════════
//  AdminPanel — Módulo de gestión de usuarios (solo rol Admin)
//
//  Responsabilidad única: generar hashes SHA-256 y filas listas
//  para pegar en Google Sheets. Opera completamente en el cliente;
//  ninguna contraseña sale del navegador.
// ═══════════════════════════════════════════════════════════════
const AdminPanel = (() => {

  // ── Helpers internos ────────────────────────────────────────

  async function _sha256(message) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(message)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function _sanitizeUsername(str) {
    // Solo alfanumérico, guión y guión bajo
    return str.trim().replace(/[^a-zA-Z0-9_\-]/g, "");
  }

  function _today() {
    return new Date().toISOString().slice(0, 10);
  }

  function _nextId() {
    // ID pseudo-aleatorio de 3 dígitos para la plantilla (el admin lo ajusta en Sheets)
    return Math.floor(Math.random() * 900) + 100;
  }

  function _showError(msg) {
    const el = document.getElementById("admin-error");
    el.textContent = msg;
    el.classList.remove("hidden");
    document.getElementById("admin-success").classList.add("hidden");
  }

  function _showSuccess(msg) {
    const el = document.getElementById("admin-success");
    el.textContent = msg;
    el.classList.remove("hidden");
    document.getElementById("admin-error").classList.add("hidden");
  }

  function _clearMessages() {
    document.getElementById("admin-error").classList.add("hidden");
    document.getElementById("admin-success").classList.add("hidden");
  }

  // ── API pública ──────────────────────────────────────────────

  /**
   * Genera el hash SHA-256 de la contraseña y construye la fila
   * lista para copiar a Google Sheets (separada por tabulaciones).
   */
  async function generate() {
    _clearMessages();

    const rawUser = document.getElementById("a-user").value;
    const pass    = document.getElementById("a-pass").value;
    const rol     = document.getElementById("a-rol").value;

    // Validaciones
    const username = _sanitizeUsername(rawUser);
    if (!username) {
      _showError("El nombre de usuario es obligatorio y solo puede contener letras, números, - y _.");
      return;
    }
    if (!pass || pass.length < 6) {
      _showError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (rawUser !== username) {
      _showError(`El usuario fue ajustado a "${username}" (se eliminaron caracteres no permitidos).`);
    }

    // Generar hash
    const hash = await _sha256(pass);
    const id   = _nextId();
    const date = _today();

    // Fila con tabulaciones (lista para pegar en Sheets y usar "Dividir en columnas")
    const row  = `${id}\t${username}\t${hash}\t${rol}\t${date}\tActivo`;

    // Mostrar resultado
    document.getElementById("a-hash-val").textContent = hash;
    document.getElementById("a-row-val").textContent  = row;
    document.getElementById("admin-result-empty").classList.add("hidden");
    document.getElementById("admin-result-content").classList.remove("hidden");

    _showSuccess(`✓ Hash generado para "${username}". Copia la fila y pégala en Google Sheets.`);
  }

  /**
   * Copia el contenido de un elemento al portapapeles y da feedback visual.
   * @param {string} elementId
   * @param {HTMLElement} btn
   */
  function copy(elementId, btn) {
    const text = document.getElementById(elementId)?.textContent?.trim();
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = "✓ Copiado";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("copied");
      }, 2000);
    }).catch(() => {
      // Fallback para navegadores sin clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity  = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      btn.textContent = "✓ Copiado";
      setTimeout(() => btn.textContent = elementId.includes("hash") ? "Copiar" : "Copiar fila", 2000);
    });
  }

  /** Alterna visibilidad del campo de contraseña. */
  function togglePass() {
    const input = document.getElementById("a-pass");
    input.type = input.type === "password" ? "text" : "password";
  }

  return { generate, copy, togglePass };
})();
