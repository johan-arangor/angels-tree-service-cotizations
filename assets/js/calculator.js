/**
 * calculator.js — Motor de cálculo de precios para servicios arbóreos
 *
 * Espejo en JavaScript de la lógica del Excel cotizacion_arboles_automatica.xlsx.
 * Principio: este módulo es PURO (sin efectos secundarios, sin DOM).
 * Puede probarse de forma aislada con cualquier framework de testing.
 *
 * Fórmula base:
 *   horas = horasBase * multEspacio * multCables * multObjetos *
 *           multAcceso * multAltura * multDiametro * multRiesgo
 *   laborCost = horas * tarifaHora
 *   adicionales = sum(adicionales seleccionados)
 *   subtotal = laborCost + adicionales
 *   descuentoAmt = subtotal * (descuento / 100)
 *   impuestoAmt = (subtotal - descuentoAmt) * (impuesto / 100)
 *   total = subtotal - descuentoAmt + impuestoAmt
 */
class PriceCalculator {
  /**
   * @param {Object} tables - CONFIG.TABLES con todos los multiplicadores
   */
  constructor(tables) {
    this._t = tables;
  }

  /**
   * Calcula el precio completo a partir de los parámetros del formulario.
   *
   * @param {Object} params
   * @param {string}   params.servicio
   * @param {string}   params.espacio
   * @param {string}   params.cables
   * @param {string}   params.objetos
   * @param {string}   params.acceso
   * @param {string}   params.altura
   * @param {string}   params.diametro
   * @param {string}   params.riesgo
   * @param {number}   params.tarifa         - $/hora
   * @param {number|null} params.horasManual - override manual de horas
   * @param {Array<{monto: number}>} params.adicionales
   * @param {number}   params.descuentoPct   - porcentaje (0-100)
   * @param {number}   params.impuestoPct    - porcentaje (0-100)
   *
   * @returns {{
   *   horasBase: number, horasAjustadas: number, horasFinales: number,
   *   laborCost: number, adicionalesTotal: number, subtotal: number,
   *   descuentoAmt: number, impuestoAmt: number, total: number,
   *   totalMin: number, totalMax: number
   * }}
   */
  calculate(params) {
    const {
      servicio, espacio, cables, objetos, acceso,
      altura, diametro, riesgo,
      tarifa = 900, horasManual = null,
      adicionales = [],
      descuentoPct = 0, impuestoPct = 0,
    } = params;

    const t = this._t;

    // 1. Horas base según tipo de servicio
    const horasBase = t.servicios[servicio]?.horas ?? 1;

    // 2. Multiplicadores acumulados
    const mult =
      (t.espacio[espacio]   ?? 1) *
      (t.cables[cables]     ?? 1) *
      (t.objetos[objetos]   ?? 1) *
      (t.acceso[acceso]     ?? 1) *
      (t.altura[altura]     ?? 1) *
      (t.diametro[diametro] ?? 1) *
      (t.riesgo[riesgo]     ?? 1);

    // 3. Horas ajustadas (redondeadas a 0.5)
    const horasAjustadas = Math.ceil(horasBase * mult * 2) / 2;

    // 4. Horas finales (manual override si se proporcionó)
    const horasFinales =
      horasManual && horasManual > 0 ? Number(horasManual) : horasAjustadas;

    // 5. Costo laboral
    const laborCost = horasFinales * Number(tarifa);

    // 6. Adicionales
    const adicionalesTotal = adicionales.reduce(
      (sum, a) => sum + (Number(a.monto) || 0), 0
    );

    // 7. Subtotal
    const subtotal = laborCost + adicionalesTotal;

    // 8. Descuento
    const descuentoAmt = subtotal * (Number(descuentoPct) / 100);

    // 9. Base imponible
    const baseImpuesto = subtotal - descuentoAmt;

    // 10. Impuesto
    const impuestoAmt = baseImpuesto * (Number(impuestoPct) / 100);

    // 11. Total
    const total = baseImpuesto + impuestoAmt;

    // 12. Rango sugerido (800–1000/hr según el Excel)
    const totalMin = horasFinales * 800 + adicionalesTotal;
    const totalMax = horasFinales * 1000 + adicionalesTotal;

    return {
      horasBase,
      horasAjustadas,
      horasFinales,
      laborCost,
      adicionalesTotal,
      subtotal,
      descuentoAmt,
      impuestoAmt,
      total,
      totalMin,
      totalMax,
    };
  }
}

// Instancia global
const Calculator = new PriceCalculator(CONFIG.TABLES);

// ── Helpers de formato ──────────────────────────────────────────

const Fmt = {
  /** Formatea número como moneda USD */
  currency(n) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  },

  /** Formatea número con 1 decimal */
  decimal(n) {
    return Number(n).toFixed(1);
  },

  /** Fecha legible */
  date(iso) {
    return new Date(iso).toLocaleDateString("es-CO", {
      year: "numeric", month: "short", day: "numeric",
    });
  },
};
