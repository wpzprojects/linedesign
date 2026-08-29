/**
 * kmzImport.js — Lee un archivo KMZ/KML (p.ej. exportado de Google Earth)
 * y extrae los trazados (`LineString`) que contiene, listos para que
 * app.js los convierta a coordenadas locales (EPSG:9377) y los simplifique
 * (`stationing.simplifyPolyline`) antes de reemplazar el alineamiento del
 * proyecto (Fase 2, prompt maestro Apéndice B).
 *
 * Este módulo es deliberadamente "tonto": solo sabe leer el archivo y
 * devolver candidatos en lat/lon — no conoce el sistema de coordenadas del
 * proyecto ni decide cuál usar, eso lo resuelve la UI (el usuario elige
 * cuando hay más de uno, ver Apéndice B.1 del prompt maestro).
 *
 * Un KMZ es un ZIP que contiene un .kml (se descomprime con JSZip, cargado
 * por CDN — ver index.html); un .kml suelto se lee directo como texto. La
 * altitud que trae el KML (si trae) se ignora a propósito: no debe usarse
 * como perfil de terreno (Apéndice B.3) — para eso está el botón "Ajustar
 * al terreno real" en Perfil, que consulta un servicio de elevación real.
 */
(function (global) {
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

  async function readKmlFromKmz(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('No se pudo cargar el lector de KMZ (JSZip). Revisa la conexión a internet e intenta de nuevo.');
    }
    let zip;
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch (error) {
      throw new Error('El archivo no es un KMZ válido (no se pudo abrir como ZIP).');
    }
    const kmlEntry = Object.values(zip.files).find((entry) => !entry.dir && /\.kml$/i.test(entry.name));
    if (!kmlEntry) {
      throw new Error('El KMZ no contiene ningún archivo .kml.');
    }
    return kmlEntry.async('text');
  }

  function parseCoordinates(text) {
    return text
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((tuple) => {
        const [lonStr, latStr] = tuple.split(',');
        const lon = parseFloat(lonStr);
        const lat = parseFloat(latStr);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          throw new Error(`Coordenada inválida en el KML: "${tuple}".`);
        }
        return { lat, lon };
      });
  }

  /** `[{ name, points: [{lat,lon}] }]` — un candidato por cada LineString con ≥2 puntos. */
  function extractCandidates(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('El archivo KML no es un XML válido.');
    }

    const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
    const candidates = [];
    placemarks.forEach((placemark) => {
      const lineString = placemark.getElementsByTagName('LineString')[0];
      if (!lineString) return;
      const coordsEl = lineString.getElementsByTagName('coordinates')[0];
      if (!coordsEl || !coordsEl.textContent.trim()) return;

      const points = parseCoordinates(coordsEl.textContent);
      if (points.length < 2) return;

      const nameEl = placemark.getElementsByTagName('name')[0];
      const name = (nameEl && nameEl.textContent.trim()) || `Trazado ${candidates.length + 1}`;
      candidates.push({ name, points });
    });

    if (!candidates.length) {
      throw new Error('El archivo no contiene ningún trazado (LineString) reconocible.');
    }
    return candidates;
  }

  /** `file`: File de un <input type="file">. Devuelve `[{ name, points: [{lat,lon}] }]`. */
  async function parseKmzOrKml(file) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`El archivo es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB, máx. 20 MB).`);
    }
    const isKmz = /\.kmz$/i.test(file.name);
    const kmlText = isKmz ? await readKmlFromKmz(file) : await file.text();
    return extractCandidates(kmlText);
  }

  const kmzImport = { parseKmzOrKml };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = kmzImport;
  }
  global.LineDesignKmzImport = kmzImport;
})(typeof window !== 'undefined' ? window : globalThis);
