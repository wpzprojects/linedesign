/**
 * elevationSource.js — Consulta elevación real de terreno (Fase 2, prompt
 * maestro Apéndice A.2) vía OpenTopoData (dataset SRTM 30m), un servicio
 * público sin API key. Puede ser lento o inestable bajo carga (es un
 * servicio gratuito de terceros) — el llamador es responsable de mostrar
 * un estado de carga y manejar errores.
 *
 * Nota: la primera versión de este módulo usaba Open-Elevation. Se
 * descartó tras verificar con datos reales que devolvía el mismo valor de
 * elevación constante para tramos enteros entre vértices (un perfil en
 * "escalones" que no correspondía al terreno real) — no era un bug de
 * este módulo (se probó tanto emparejando por posición como por
 * coordenada devuelta, con el mismo resultado), sino datos degradados del
 * servidor público de demo. OpenTopoData es la alternativa que ya
 * recomendaba el prompt maestro.
 *
 * Límites del servicio público (ver https://www.opentopodata.org/#public-api):
 * máximo 100 puntos por consulta y 1 consulta por segundo — por eso este
 * módulo parte `points` en lotes y espera entre uno y otro.
 *
 * Reemplazable: si más adelante hace falta otro servicio (MapTiler
 * Elevation, un DEM propio, etc.), basta con reescribir `fetchElevations`
 * para que devuelva el mismo array paralelo de elevaciones (m).
 */
(function (global) {
  const ENDPOINT = 'https://api.opentopodata.org/v1/srtm30m';
  const MAX_LOCATIONS_PER_REQUEST = 100;
  const REQUEST_DELAY_MS = 1100; // el límite público es 1 consulta/segundo

  function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
    return chunks;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Un solo lote (máx. `MAX_LOCATIONS_PER_REQUEST` puntos). */
  async function fetchChunk(points) {
    const locations = points.map((p) => `${p.lat},${p.lon}`).join('|');
    let response;
    try {
      response = await fetch(`${ENDPOINT}?locations=${encodeURIComponent(locations)}`);
    } catch (error) {
      throw new Error('No se pudo contactar el servicio de elevación (revisa la conexión a internet).');
    }

    if (!response.ok) {
      throw new Error(`El servicio de elevación respondió con error (${response.status}).`);
    }

    const data = await response.json();
    if (!data || data.status !== 'OK' || !Array.isArray(data.results) || data.results.length !== points.length) {
      throw new Error('Respuesta inesperada del servicio de elevación.');
    }

    return data.results.map((r) => r.elevation);
  }

  /**
   * `points`: array de { lat, lon }. Devuelve un array paralelo de
   * elevaciones (m), respetando el límite de tamaño de lote y de
   * velocidad del servicio público. Lanza un Error con mensaje legible si
   * alguna consulta falla o la respuesta no tiene la forma esperada.
   */
  async function fetchElevations(points) {
    const chunks = chunk(points, MAX_LOCATIONS_PER_REQUEST);
    const elevations = [];
    for (let i = 0; i < chunks.length; i += 1) {
      elevations.push(...(await fetchChunk(chunks[i])));
      if (i < chunks.length - 1) await wait(REQUEST_DELAY_MS);
    }
    return elevations;
  }

  const elevationSource = { fetchElevations };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = elevationSource;
  }
  global.LineDesignElevationSource = elevationSource;
})(typeof window !== 'undefined' ? window : globalThis);
