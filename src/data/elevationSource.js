/**
 * elevationSource.js — Consulta elevación real de terreno (Fase 2, prompt
 * maestro Apéndice A.2) vía Open-Elevation, un servicio público sin API key
 * que acepta lotes de puntos en una sola consulta POST. Puede ser lento o
 * inestable bajo carga (es un servicio gratuito de terceros) — el llamador
 * es responsable de mostrar un estado de carga y manejar errores.
 *
 * Reemplazable: si más adelante se prefiere OpenTopoData, MapTiler
 * Elevation u otro servicio, basta con reescribir `fetchElevations` para
 * que devuelva el mismo array paralelo de elevaciones (m).
 */
(function (global) {
  const ENDPOINT = 'https://api.open-elevation.com/api/v1/lookup';

  /**
   * `points`: array de { lat, lon }. Devuelve un array paralelo de
   * elevaciones (m). Lanza un Error con mensaje legible si la consulta
   * falla o la respuesta no tiene la forma esperada.
   */
  async function fetchElevations(points) {
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: points.map((p) => ({ latitude: p.lat, longitude: p.lon }))
        })
      });
    } catch (error) {
      throw new Error('No se pudo contactar el servicio de elevación (revisa la conexión a internet).');
    }

    if (!response.ok) {
      throw new Error(`El servicio de elevación respondió con error (${response.status}).`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.results) || data.results.length !== points.length) {
      throw new Error('Respuesta inesperada del servicio de elevación.');
    }

    return data.results.map((r) => r.elevation);
  }

  const elevationSource = { fetchElevations };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = elevationSource;
  }
  global.LineDesignElevationSource = elevationSource;
})(typeof window !== 'undefined' ? window : globalThis);
