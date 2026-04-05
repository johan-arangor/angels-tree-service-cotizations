/**
 * quotes.js — Renderizado de cotizaciones
 *
 * Fix: el botón "ver" ya no incrusta el JSON en el onclick
 * (doble stringify rompe las comillas). Ahora usa un índice
 * de caché en window.__quoteCache para pasar el objeto limpio.
 */
class QuoteRenderer {

  renderTable(quotes) {
    if (!quotes || quotes.length === 0) {
      return `<div class="empty-state">
        <p>No tienes cotizaciones aún.</p>
        <p style="margin-top:.5rem;font-size:.8rem;color:var(--ink-3)">
          Crea tu primera cotización con el botón "Nueva Cotización".
        </p>
      </div>`;
    }

    // Guardar cotizaciones en caché global para que el onclick las lea por índice
    window.__quoteCache = quotes;

    const rows = quotes.map((q, idx) => this._tableRow(q, idx)).join("");

    return `
      <table class="quotes-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Cliente</th>
            <th>Servicio</th>
            <th>Fecha</th>
            <th>Total</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  _tableRow(q, idx) {
    const items   = this._parseItems(q.ItemsJSON);
    const servicio = items?.servicio ?? "—";
    const badge   = this._badgeHtml(q.Estado);
    const fecha   = q.Fecha ? Fmt.date(q.Fecha) : "—";
    const total   = q.Total ? Fmt.currency(q.Total) : "—";
    // Usar el ID compuesto directamente, sin padStart
    const idDisplay = this._esc(String(q.ID_Cotizacion || "—"));

    return `
      <tr>
        <td><code style="font-size:.78rem;color:var(--sage)">${idDisplay}</code></td>
        <td><strong>${this._esc(q.Cliente)}</strong></td>
        <td>${this._esc(servicio)}</td>
        <td>${fecha}</td>
        <td><strong style="color:var(--forest)">${total}</strong></td>
        <td>${badge}</td>
        <td>
          <button class="action-btn" title="Ver detalle"
            onclick="App.viewQuote(${idx})">
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M1 10S4 4 10 4s9 6 9 6-3 6-9 6-9-6-9-6Z"
                stroke="currentColor" stroke-width="1.5"/>
              <circle cx="10" cy="10" r="2.5"
                stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }

  renderPrintView(q) {
    const items        = this._parseItems(q.ItemsJSON) ?? {};
    const adicionales  = items.adicionales ?? [];
    const fecha        = q.Fecha ? Fmt.date(q.Fecha) : "—";
    const idDisplay    = this._esc(String(q.ID_Cotizacion || "—"));

    const adicionalesRows = adicionales.length
      ? adicionales.map(a =>
          `<tr>
            <td>${this._esc(a.nombre)}</td>
            <td>—</td>
            <td>${Fmt.currency(a.monto)}</td>
          </tr>`
        ).join("")
      : "";

    return `
      <div class="print-quote">
        <div class="print-header">
          <div class="print-brand">
            <h2>Saga Tree Quote</h2>
            <p>Sistema profesional de cotizaciones arbóreas</p>
          </div>
          <div class="print-meta">
            <p class="quote-id">Cotización #${idDisplay}</p>
            <p>Fecha: ${fecha}</p>
            <p>Asesor: ${this._esc(q.Usuario)}</p>
          </div>
        </div>

        <div class="print-section">
          <h4>Información del Cliente</h4>
          <div class="print-client-grid">
            <span>Cliente</span>
            <strong>${this._esc(q.Cliente)}</strong>
            <span>Teléfono</span>
            <strong>${this._esc(items.telefono ?? "—")}</strong>
            <span>Dirección</span>
            <strong>${this._esc(items.direccion ?? "—")}</strong>
          </div>
        </div>

        <div class="print-section">
          <h4>Detalle del Servicio</h4>
          <table class="print-items-table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Horas</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${this._esc(items.servicio ?? "Servicio arbóreo")}</td>
                <td>${Fmt.decimal(items.horas ?? 0)} hrs</td>
                <td>${Fmt.currency(items.laborCost ?? 0)}</td>
              </tr>
              ${adicionalesRows}
            </tbody>
          </table>
        </div>

        <div class="print-section">
          <h4>Condiciones del Servicio</h4>
          <div class="print-client-grid" style="grid-template-columns:repeat(3,1fr)">
            <span>Espacio</span>
            <strong>${this._esc(items.espacio ?? "—")}</strong>
            <span></span>
            <span>Cables eléctricos</span>
            <strong>${this._esc(items.cables ?? "—")}</strong>
            <span></span>
            <span>Acceso</span>
            <strong>${this._esc(items.acceso ?? "—")}</strong>
            <span></span>
            <span>Altura</span>
            <strong>${this._esc(items.altura ?? "—")}</strong>
            <span></span>
            <span>Diámetro tronco</span>
            <strong>${this._esc(items.diametro ?? "—")}</strong>
            <span></span>
            <span>Nivel de riesgo</span>
            <strong>${this._esc(items.riesgo ?? "—")}</strong>
            <span></span>
          </div>
        </div>

        <div class="print-section">
          <h4>Resumen Económico</h4>
          <div class="print-totals">
            <div class="row">
              <span>Subtotal</span>
              <span>${Fmt.currency(q.Subtotal ?? 0)}</span>
            </div>
            ${Number(q.Descuento) > 0 ? `
            <div class="row">
              <span>Descuento (${items.descuentoPct ?? 0}%)</span>
              <span style="color:var(--rose)">−${Fmt.currency(q.Descuento)}</span>
            </div>` : ""}
            ${Number(q.Impuestos) > 0 ? `
            <div class="row">
              <span>Impuesto (${items.impuestoPct ?? 0}%)</span>
              <span>${Fmt.currency(q.Impuestos)}</span>
            </div>` : ""}
            <div class="row total-row">
              <span>TOTAL</span>
              <span>${Fmt.currency(q.Total ?? 0)}</span>
            </div>
          </div>
        </div>

        ${items.notas ? `
        <div class="print-section">
          <h4>Notas</h4>
          <p style="font-size:.85rem;color:var(--ink-2);line-height:1.5">
            ${this._esc(items.notas)}
          </p>
        </div>` : ""}

        <p style="font-size:.75rem;color:var(--ink-3);text-align:center;margin-top:2rem;
          border-top:1px solid var(--border);padding-top:.8rem">
          Esta cotización es válida por 15 días a partir de la fecha de emisión.
          Generado por CodeCloud </> v${CONFIG.APP_VERSION}.
        </p>
      </div>
    `;
  }

  _badgeHtml(estado) {
    const map = { "Activa": "badge-green", "Enviada": "badge-amber", "Cancelada": "badge-gray" };
    return `<span class="badge ${map[estado] ?? "badge-gray"}">${estado ?? "—"}</span>`;
  }

  _parseItems(raw) {
    try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? null); }
    catch { return null; }
  }

  _esc(str) {
    if (str == null) return "—";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

const QuoteView = new QuoteRenderer();