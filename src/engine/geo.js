/**
 * geo.js — Conversión entre coordenadas locales (X/Y en metros, el sistema
 * que usa todo el motor de cálculo) y coordenadas geográficas (lat/lon),
 * dado un origen del proyecto (`alignment.origin`: lat, lon, bearingDeg).
 *
 * Aproximación de "plano tangente" centrado en el origen (ver Apéndice A.3
 * del prompt maestro): suficiente para líneas de transmisión de longitud
 * típica (unos pocos km) — no es una proyección cartográfica rigurosa
 * (UTM/proj4js), que solo haría falta para trazados muy largos.
 *
 * Convención: con bearingDeg = 0, el eje Y local apunta al norte y el eje X
 * local al este. bearingDeg gira el eje Y local en sentido horario desde el
 * norte (p.ej. bearingDeg = 90 hace que el eje Y local apunte al este).
 */
(function (global) {
  const EARTH_RADIUS = 6378137; // m (WGS84, radio ecuatorial — aproximación suficiente aquí)

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  /** Local (x, y) en metros -> { lat, lon }, dado el origen del proyecto. */
  function localToLatLon(origin, point) {
    const bearing = toRad(origin.bearingDeg || 0);
    const east = point.x * Math.cos(bearing) + point.y * Math.sin(bearing);
    const north = -point.x * Math.sin(bearing) + point.y * Math.cos(bearing);

    const lat = origin.lat + toDeg(north / EARTH_RADIUS);
    const lon = origin.lon + toDeg(east / (EARTH_RADIUS * Math.cos(toRad(origin.lat))));
    return { lat, lon };
  }

  /** { lat, lon } -> local (x, y) en metros, dado el origen del proyecto. */
  function latLonToLocal(origin, latLon) {
    const bearing = toRad(origin.bearingDeg || 0);
    const north = toRad(latLon.lat - origin.lat) * EARTH_RADIUS;
    const east = toRad(latLon.lon - origin.lon) * EARTH_RADIUS * Math.cos(toRad(origin.lat));

    const x = east * Math.cos(bearing) - north * Math.sin(bearing);
    const y = east * Math.sin(bearing) + north * Math.cos(bearing);
    return { x, y };
  }

  /**
   * Metros por píxel de un tile de mapa web estándar (256px, Web Mercator)
   * a un nivel de zoom dado, en una latitud dada. Usado para calibrar el
   * zoom de Leaflet de forma que su escala coincida con la del proyector
   * SVG (ver mapRenderer.js).
   */
  function metersPerPixel(zoom, lat) {
    const earthCircumference = 2 * Math.PI * EARTH_RADIUS;
    return (earthCircumference * Math.cos(toRad(lat))) / (256 * 2 ** zoom);
  }

  /** Zoom (fraccional) cuya escala en `lat` coincide con `metersPerPx` dados. */
  function zoomForScale(metersPerPx, lat) {
    const earthCircumference = 2 * Math.PI * EARTH_RADIUS;
    return Math.log2((earthCircumference * Math.cos(toRad(lat))) / (256 * metersPerPx));
  }

  const geo = { localToLatLon, latLonToLocal, metersPerPixel, zoomForScale };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = geo;
  }
  global.LineDesignGeo = geo;
})(typeof window !== 'undefined' ? window : globalThis);
