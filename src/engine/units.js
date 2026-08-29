/**
 * units.js — Conversión de fuerza / peso por longitud entre kgF/kg-km (la
 * unidad en la que el proyecto GUARDA y MUESTRA estos campos — lo que ves
 * es lo que se guarda, sin unidades distintas entre pantalla y JSON
 * exportado) y el SI (N, N/m) que necesita el motor de cálculo
 * internamente para que sus fórmulas físicas (presión dinámica de viento
 * en Pa, módulo de elasticidad en Pa, etc. — ver catenary.js) sean
 * dimensionalmente consistentes. `catenary.js` convierte con este módulo
 * en el momento de usar `conductor.weightPerLength` / `.ultimateStrength`
 * / `.referenceHorizontalTension` y `stringingTensions[].maxTension` — el
 * resto de la app nunca ve el valor en SI.
 *
 * Vive en `src/engine/` (no en `src/ui/`) porque lo usa el motor de
 * cálculo, no solo la interfaz.
 */
(function (global) {
  const G = 9.80665; // m/s², gravedad estándar — factor N <-> kgf

  function newtonsToKgf(n) {
    return n / G;
  }

  function kgfToNewtons(kgf) {
    return kgf * G;
  }

  function newtonsPerMeterToKgPerKm(nPerM) {
    return (nPerM / G) * 1000;
  }

  function kgPerKmToNewtonsPerMeter(kgPerKm) {
    return (kgPerKm / 1000) * G;
  }

  const units = { G, newtonsToKgf, kgfToNewtons, newtonsPerMeterToKgPerKm, kgPerKmToNewtonsPerMeter };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = units;
  }
  global.LineDesignUnits = units;
})(typeof window !== 'undefined' ? window : globalThis);
