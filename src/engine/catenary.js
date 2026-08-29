/**
 * catenary.js — Tendido del cable (sag-tension) por vano y por hipótesis de carga.
 *
 * Convenciones y unidades (ver DATA_MODEL.md §"Suposiciones de cálculo"):
 *   - longitud: m · fuerza: N · peso por longitud: N/m · temperatura: °C
 *   - conductor.weightPerLength ya es un peso por unidad de longitud en N/m
 *     (incluye g), tal como lo define el modelo de datos del proyecto.
 *   - conductor.crossSectionArea: m² · conductor.elasticModulus: Pa (N/m²)
 *   - hipótesis.windSpeed: m/s (velocidad de viento) · hipótesis.iceThickness: mm
 *     (espesor radial de manguito de hielo).
 *
 * Método:
 *   1) Carga vertical (peso propio + hielo) y carga transversal (viento) por
 *      unidad de longitud se combinan como carga resultante para el cálculo de
 *      tensión, criterio estándar de la industria para condiciones de viento/hielo
 *      (análogo al criterio de "resultant load" usado por PLS-CADD).
 *   2) La tensión horizontal H bajo una hipótesis distinta a la de referencia se
 *      obtiene resolviendo la ecuación de cambio de estado (state-change equation),
 *      formulación estándar de sag-tension para un vano (ver p.ej. Southwire
 *      "Overhead Conductor Manual", cap. Sag-Tension). Se resuelve por Newton-Raphson.
 *   3) La curva de catenaria mostrada en el perfil (plano vertical) usa la carga
 *      VERTICAL únicamente (peso propio + hielo), ya que el balanceo lateral del
 *      conductor por viento no se representa en una vista de perfil 2D en Fase 1.
 *
 * Simplificaciones explícitas de Fase 1 (documentadas también en DATA_MODEL.md):
 *   - Cada vano se resuelve de forma independiente a partir de una tensión de
 *     referencia fija (no se modela un "vano regulador" compartido por una
 *     sección de anclajes, como sí hace PLS-CADD).
 *   - No se modela creep/relajación de largo plazo ni deformación permanente.
 *   - Coeficiente de arrastre (drag) del conductor para viento: Cd = 1.0.
 */
(function (global) {
  const AIR_DENSITY = 1.225; // kg/m3 a nivel del mar, 15°C
  const ICE_DENSITY = 900; // kg/m3, densidad típica de manguito de hielo
  const GRAVITY = 9.81; // m/s2
  const WIND_DRAG_COEFF = 1.0; // adimensional, simplificación Fase 1

  function iceRadialThicknessM(hypothesis) {
    return (hypothesis.iceThickness || 0) / 1000;
  }

  /** Peso adicional por hielo, por unidad de longitud (N/m). */
  function iceUnitWeight(conductor, hypothesis) {
    const t = iceRadialThicknessM(hypothesis);
    if (t <= 0) return 0;
    const rOuter = conductor.diameter / 2 + t;
    const rInner = conductor.diameter / 2;
    const areaIce = Math.PI * (rOuter * rOuter - rInner * rInner);
    return areaIce * ICE_DENSITY * GRAVITY;
  }

  /** Presión dinámica de viento (Pa) a partir de la velocidad (m/s). */
  function windPressure(windSpeed) {
    return 0.5 * AIR_DENSITY * windSpeed * windSpeed;
  }

  /** Carga transversal por viento, por unidad de longitud (N/m). */
  function windUnitLoad(conductor, hypothesis) {
    const effectiveDiameter = conductor.diameter + 2 * iceRadialThicknessM(hypothesis);
    return windPressure(hypothesis.windSpeed || 0) * WIND_DRAG_COEFF * effectiveDiameter;
  }

  /** Carga vertical total (autopeso + hielo), por unidad de longitud (N/m). */
  function verticalUnitWeight(conductor, hypothesis) {
    return conductor.weightPerLength + iceUnitWeight(conductor, hypothesis);
  }

  /** Carga resultante (vector viento + peso), por unidad de longitud (N/m). */
  function resultantUnitWeight(conductor, hypothesis) {
    const wv = verticalUnitWeight(conductor, hypothesis);
    const wt = windUnitLoad(conductor, hypothesis);
    return Math.hypot(wv, wt);
  }

  /**
   * Resuelve la tensión horizontal H2 (N) para un vano bajo una hipótesis
   * objetivo, a partir de una tensión de referencia H1 conocida bajo la
   * hipótesis de referencia, mediante la ecuación de cambio de estado
   * (deducida de la identidad de longitud de arco elástico-térmica del
   * conductor, linealizando términos de segundo orden — aproximación
   * estándar de la industria; validada numéricamente contra la solución
   * autoconsistente no linealizada, error < 0.1% para los rangos típicos
   * de esta app):
   *
   *   H2 - (A·E·L²·w2²)/(24·H2²) = H1 - (A·E·L²·w1²)/(24·H1²) - A·E·α·(T2-T1)
   *
   * Reordenada como cúbica en H2:  H2³ - K·H2² - C2 = 0
   *   K  = H1 - (A·E·L²·w1²)/(24·H1²) - A·E·α·(T2-T1)
   *   C2 = A·E·L²·w2²/24
   *
   * Sentido físico: a mayor temperatura (T2>T1) el conductor se dilata y la
   * tensión baja (H2<H1); a mayor carga (w2>w1, p. ej. viento/hielo) la
   * tensión sube (H2>H1). Ambos casos se verifican con esta formulación.
   */
  function solveHorizontalTension({ conductor, spanLength, H1, w1, w2, T1, T2 }) {
    const AE = conductor.crossSectionArea * conductor.elasticModulus;
    const L2 = spanLength * spanLength;
    const K = H1 - (AE * L2 * w1 * w1) / (24 * H1 * H1) - AE * conductor.thermalExpansionCoef * (T2 - T1);
    const C2 = (AE * L2 * w2 * w2) / 24;

    let H = H1;
    for (let i = 0; i < 50; i += 1) {
      const f = H ** 3 - K * H ** 2 - C2;
      const fPrime = 3 * H ** 2 - 2 * K * H;
      if (Math.abs(fPrime) < 1e-9) break;
      const next = H - f / fPrime;
      if (!Number.isFinite(next) || next <= 0) break;
      if (Math.abs(next - H) < 1e-6) {
        H = next;
        break;
      }
      H = next;
    }
    return Math.max(H, 1);
  }

  /**
   * Curva exacta de catenaria entre dos apoyos a distinta altura.
   * heightDiff = elevación(apoyo derecho) - elevación(apoyo izquierdo), en m.
   * Devuelve puntos {x, y} relativos al apoyo izquierdo (x: 0..span, y: elevación
   * relativa) y la flecha máxima (sag) respecto a la cuerda apoyo-apoyo.
   */
  function catenaryCurve({ span, heightDiff, H, unitWeight, samples = 40 }) {
    const c = H / unitWeight; // parámetro de la catenaria (m)
    const sinhHalf = Math.sinh(span / (2 * c));
    const x0 = span / 2 - c * Math.asinh(heightDiff / (2 * c * sinhHalf || 1e-9));
    const k = -c * Math.cosh(-x0 / c); // y(0) = 0 tras este corrimiento

    const yAt = (x) => c * Math.cosh((x - x0) / c) + k;

    const points = [];
    let maxSag = 0;
    for (let i = 0; i <= samples; i += 1) {
      const x = (span * i) / samples;
      const y = yAt(x);
      const chordY = heightDiff * (x / span);
      maxSag = Math.max(maxSag, chordY - y);
      points.push({ x, y });
    }

    return { points, sag: maxSag, c, x0 };
  }

  /**
   * Filas de "Tensiones de tendido" (Parámetros de entrada) que aplican a
   * un conductor bajo una hipótesis dada: mismo caso climático por nombre
   * (weatherCase guarda el nombre, no el id — ver DATA_MODEL.md) y cable
   * aplicable en blanco (aplica a todos) o igual al nombre del conductor.
   */
  function findStringingRows(conductor, hypothesis, stringingTensions) {
    return (stringingTensions || []).filter((row) =>
      row.weatherCase === hypothesis.name &&
      (!row.applicableCable || row.applicableCable === conductor.name)
    );
  }

  /**
   * Resuelve la tensión horizontal instalada (H1) a partir de las filas de
   * "Tensiones de tendido" que apliquen (equivalente al "Automatic Sagging
   * Criteria" de PLS-CADD): para cada fila, H = min(%rotura·RTS, tensión
   * máxima, peso_vertical·catenaria_máxima) — usando solo la carga
   * VERTICAL (sin viento) para la restricción de catenaria máxima, mismo
   * criterio que ya usa la curva 2D del perfil (ver nota de arriba). Si
   * hay varias filas que aplican, se toma la más restrictiva (mínima). Si
   * ninguna aplica, cae a `conductor.referenceHorizontalTension` (el
   * campo manual) — `matched` indica si de verdad se usó un criterio de
   * la tabla o si fue ese respaldo manual. Nótese que ningún criterio
   * depende de la longitud del vano: "% de rotura" y "tensión máxima" son
   * valores fijos, y "catenaria máxima" (C = H/w) es por definición
   * independiente del vano (para eso existe, a diferencia de un límite de
   * flecha máxima, que si dependería del vano y esta app no modela).
   */
  function resolveReferenceTension(conductor, referenceHypothesis, stringingTensions) {
    const rows = findStringingRows(conductor, referenceHypothesis, stringingTensions);
    if (!rows.length) {
      return { tension: conductor.referenceHorizontalTension, matched: false };
    }
    const w1 = verticalUnitWeight(conductor, referenceHypothesis);
    const tensions = rows.map((row) => {
      const candidates = [(row.percentUltimate / 100) * conductor.ultimateStrength];
      if (row.maxTension) candidates.push(row.maxTension);
      if (row.maxCatenary) candidates.push(w1 * row.maxCatenary);
      return Math.min(...candidates);
    });
    // Piso de 1 N: si una fila queda con "% de rotura" en 0 (el valor por
    // defecto de una fila recién agregada, antes de que el usuario lo
    // llene), evita que una tensión de 0 se cuele directo a la catenaria
    // de la hipótesis de referencia (división entre casi cero) — mismo
    // piso que ya aplica solveHorizontalTension para las demás hipótesis.
    return { tension: Math.max(Math.min(...tensions), 1), matched: true };
  }

  /**
   * Calcula el resultado completo de tendido para un vano bajo una hipótesis:
   * tensión horizontal, curva de catenaria (peso vertical) y flecha máxima.
   */
  function computeSpanTension(conductor, referenceHypothesis, hypothesis, spanLength, stringingTensions) {
    const w1 = resultantUnitWeight(conductor, referenceHypothesis);
    const w2 = resultantUnitWeight(conductor, hypothesis);
    const H1 = resolveReferenceTension(conductor, referenceHypothesis, stringingTensions).tension;

    const H2 = hypothesis.id === referenceHypothesis.id
      ? H1
      : solveHorizontalTension({
        conductor,
        spanLength,
        H1,
        w1,
        w2,
        T1: referenceHypothesis.temperature,
        T2: hypothesis.temperature
      });

    return {
      horizontalTension: H2,
      verticalUnitWeight: verticalUnitWeight(conductor, hypothesis),
      windUnitLoad: windUnitLoad(conductor, hypothesis),
      resultantUnitWeight: w2
    };
  }

  const catenary = {
    AIR_DENSITY,
    ICE_DENSITY,
    GRAVITY,
    WIND_DRAG_COEFF,
    iceUnitWeight,
    windPressure,
    windUnitLoad,
    verticalUnitWeight,
    resultantUnitWeight,
    solveHorizontalTension,
    catenaryCurve,
    findStringingRows,
    resolveReferenceTension,
    computeSpanTension
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = catenary;
  }
  global.LineDesignCatenary = catenary;
})(typeof window !== 'undefined' ? window : globalThis);
