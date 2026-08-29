/**
 * elevationSource.js — Consulta elevación real de terreno (Fase 2, prompt
 * maestro Apéndice A.2).
 *
 * Por defecto ("auto"), prueba dos servicios públicos SIN API key, en
 * orden, y usa el primero que responda:
 *
 *   1) OpenTopoData (dataset SRTM 30m) — mejor calidad de dato, pero su
 *      API pública no parece soportar CORS de forma consistente: `fetch()`
 *      desde el navegador puede fallar directamente (sin ni siquiera
 *      llegar a responder con un error HTTP).
 *   2) Open-Elevation — sí acepta peticiones desde el navegador, pero en
 *      zonas montañosas con vacíos en el dataset puede devolver el mismo
 *      valor de elevación para tramos enteros entre vértices (un perfil
 *      en "escalones" que no corresponde al terreno real) — limitación
 *      del dato gratuito, no un bug de esta app.
 *
 * Si esos dos no alcanzan (terreno muy accidentado), la pantalla
 * Configuración permite elegir la Google Elevation API en su lugar
 * (`provider: 'google'`, requiere una API key propia — ver ese apartado).
 * El llamador (app.js) es responsable de leer esa preferencia guardada,
 * mostrar un estado de carga y manejar el error final si todo falla.
 *
 * Reemplazable/ampliable: cada proveedor expone la misma forma
 * `(points) => Promise<number[]>` — agregar uno nuevo es una función más
 * en este archivo.
 */
(function (global) {
  function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
    return chunks;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------- OpenTopoData ----------

  const OPENTOPODATA_ENDPOINT = 'https://api.opentopodata.org/v1/srtm30m';
  const OPENTOPODATA_MAX_LOCATIONS = 100;
  const OPENTOPODATA_DELAY_MS = 1100; // límite público: 1 consulta/segundo

  async function fetchOpenTopoDataChunk(points) {
    const locations = points.map((p) => `${p.lat},${p.lon}`).join('|');
    const response = await fetch(`${OPENTOPODATA_ENDPOINT}?locations=${encodeURIComponent(locations)}`);
    if (!response.ok) {
      throw new Error(`OpenTopoData respondió con error (${response.status}).`);
    }
    const data = await response.json();
    if (!data || data.status !== 'OK' || !Array.isArray(data.results) || data.results.length !== points.length) {
      throw new Error('Respuesta inesperada de OpenTopoData.');
    }
    return data.results.map((r) => r.elevation);
  }

  async function fetchFromOpenTopoData(points) {
    const chunks = chunk(points, OPENTOPODATA_MAX_LOCATIONS);
    const elevations = [];
    for (let i = 0; i < chunks.length; i += 1) {
      elevations.push(...(await fetchOpenTopoDataChunk(chunks[i])));
      if (i < chunks.length - 1) await wait(OPENTOPODATA_DELAY_MS);
    }
    return elevations;
  }

  // ---------- Open-Elevation ----------

  const OPEN_ELEVATION_ENDPOINT = 'https://api.open-elevation.com/api/v1/lookup';

  async function fetchFromOpenElevation(points) {
    const response = await fetch(OPEN_ELEVATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: points.map((p) => ({ latitude: p.lat, longitude: p.lon }))
      })
    });
    if (!response.ok) {
      throw new Error(`Open-Elevation respondió con error (${response.status}).`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.results) || data.results.length !== points.length) {
      throw new Error('Respuesta inesperada de Open-Elevation.');
    }

    // No se asume que el orden de `data.results` coincida con el de
    // `points` — se empareja por la coordenada que cada resultado trae de
    // vuelta, con respaldo al orden posicional si no trajera coordenadas.
    const results = data.results;
    const hasCoords = results.every((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    if (!hasCoords) return results.map((r) => r.elevation);

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

  // ---------- Google Elevation API (requiere API key propia) ----------

  const GOOGLE_ENDPOINT = 'https://maps.googleapis.com/maps/api/elevation/json';
  const GOOGLE_MAX_LOCATIONS = 300; // margen prudente bajo el límite de URL, no un límite documentado de Google

  async function fetchGoogleChunk(points, apiKey) {
    const locations = points.map((p) => `${p.lat},${p.lon}`).join('|');
    const url = `${GOOGLE_ENDPOINT}?locations=${encodeURIComponent(locations)}&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    const data = await response.json().catch(() => null);
    if (!data || data.status !== 'OK' || !Array.isArray(data.results) || data.results.length !== points.length) {
      const reason = data && data.error_message ? data.error_message : (data && data.status) || `HTTP ${response.status}`;
      throw new Error(`Google Elevation API respondió con error (${reason}). Revisa que la API key sea válida y tenga la Elevation API habilitada.`);
    }
    return data.results.map((r) => r.elevation);
  }

  function fetchFromGoogle(apiKey) {
    return async (points) => {
      if (!apiKey) throw new Error('Falta configurar la API key de Google en Configuración.');
      const chunks = chunk(points, GOOGLE_MAX_LOCATIONS);
      const elevations = [];
      for (let i = 0; i < chunks.length; i += 1) {
        elevations.push(...(await fetchGoogleChunk(chunks[i], apiKey)));
      }
      return elevations;
    };
  }

  const FREE_PROVIDERS = [
    { name: 'OpenTopoData', fetch: fetchFromOpenTopoData },
    { name: 'Open-Elevation', fetch: fetchFromOpenElevation }
  ];

  /**
   * `points`: array de { lat, lon }. `options.provider`: `'auto'` (los dos
   * servicios gratuitos, en orden, ver arriba) o `'google'` (Google
   * Elevation API, requiere `options.apiKey`). Devuelve un array paralelo
   * de elevaciones (m). Lanza un Error con mensaje legible (incluyendo lo
   * que falló en cada proveedor probado) si ninguno responde.
   */
  async function fetchElevations(points, options = {}) {
    const providers = options.provider === 'google'
      ? [{ name: 'Google Elevation API', fetch: fetchFromGoogle(options.apiKey) }]
      : FREE_PROVIDERS;

    const failures = [];
    for (const provider of providers) {
      try {
        return await provider.fetch(points);
      } catch (error) {
        failures.push(`${provider.name}: ${error.message}`);
      }
    }
    throw new Error(`No se pudo consultar ningún servicio de elevación. ${failures.join(' — ')}`);
  }

  const elevationSource = { fetchElevations };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = elevationSource;
  }
  global.LineDesignElevationSource = elevationSource;
})(typeof window !== 'undefined' ? window : globalThis);
