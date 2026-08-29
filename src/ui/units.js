/**
 * units.js — Conversión de fuerza / peso por longitud entre el SI que usa
 * el motor de cálculo internamente (N, N/m — ver DATA_MODEL.md
 * "Suposiciones de cálculo") y las unidades que la interfaz le muestra al
 * usuario (kgF, kg/km), de uso más común en ingeniería de líneas en
 * español. Es una conversión SOLO de presentación: el proyecto (JSON
 * exportado, motor de cálculo) sigue guardándose y calculándose siempre en
 * SI — cada campo editable que use estas unidades convierte al mostrar el
 * valor y vuelve a convertir a N/N-m al guardarlo.
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
