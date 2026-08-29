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

    // No se asume que el orden de `data.results` coincida con el de
    // `points` — cada resultado trae de vuelta la coordenada que
    // corresponde a su elevación, así que se empareja por coordenada más
    // cercana en vez de por posición en el array. Confiar en el orden
    // producía un desfase station↔elevación (el perfil se dibujaba con las
    // stations bien ordenadas pero las elevaciones "revueltas", como un
    // terreno en escalones que no correspondía al real).
    const results = data.results;
    const hasCoords = results.every((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    if (!hasCoords) {
      // La respuesta no trae coordenadas para emparejar — se confía en el
      // orden como última alternativa (mejor eso que fallar del todo).
      return results.map((r) => r.elevation);
    }

    return points.map((p) => {
      let best = null;
      let bestDist = Infinity;
      for (let i = 0; i < results.length; i += 1) {
        const r = results[i];
        const dist = Math.abs(r.latitude - p.lat) + Math.abs(r.longitude - p.lon);
        if (dist < bestDist) {
          bestDist = dist;
          best = r;
        }
      }
      return best.elevation;
    });
  }

  const elevationSource = { fetchElevations };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = elevationSource;
  }
  global.LineDesignElevationSource = elevationSource;
})(typeof window !== 'undefined' ? window : globalThis);
