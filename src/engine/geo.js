/**
 * geo.js — Conversión entre el sistema de coordenadas nativo del proyecto
 * (MAGNA-SIRGAS / Origen-Nacional, EPSG:9377 — Este/Norte en metros, el
 * mismo que usan `vertex.x`/`vertex.y` en todo el motor de cálculo) y
 * lat/lon (WGS84/MAGNA-SIRGAS geográficas, EPSG:4326), que es lo que
 * necesita el mapa base (Leaflet) para ubicarse.
 *
 * Proyección Transversa de Mercator (fórmulas de Snyder / EPSG Coordinate
 * Operation Method 9807 "Transverse Mercator"), sobre el elipsoide GRS80,
 * con los parámetros del Origen Único Nacional de Colombia (IGAC):
 *   - Latitud de origen: 4° N
 *   - Longitud de origen (meridiano central): 73° O
 *   - Factor de escala: 0.9992
 *   - Falso este: 5 000 000 m
 *   - Falso norte: 2 000 000 m
 *
 * Como todo el país queda dentro de una franja angosta alrededor del
 * meridiano central, esta única zona (a diferencia de UTM, que usa varias
 * franjas de 6°) es la que usa IGAC como sistema de referencia nacional
 * único — de ahí el nombre "Origen Único Nacional".
 */
(function (global) {
  // Elipsoide GRS80 (el que usa MAGNA-SIRGAS)
  const A = 6378137;
  const INV_F = 298.257222101;
  const F = 1 / INV_F;
  const E2 = F * (2 - F);
  const EP2 = E2 / (1 - E2);

  // Parámetros de EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional)
  const LAT0 = toRad(4);
  const LON0 = toRad(-73);
  const K0 = 0.9992;
  const FALSE_EASTING = 5000000;
  const FALSE_NORTHING = 2000000;

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  /** Longitud de arco de meridiano desde el ecuador hasta la latitud `phi` (rad). */
  function meridianArc(phi) {
    return A * (
      (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi
      - ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi)
      + ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi)
      - ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi)
    );
  }

  const M0 = meridianArc(LAT0);

  /** lat/lon (grados, WGS84/MAGNA-SIRGAS) -> { x, y } (Este/Norte EPSG:9377, m). */
  function latLonToEpsg9377(lat, lon) {
    const phi = toRad(lat);
    const lambda = toRad(lon);
    const T = Math.tan(phi) ** 2;
    const C = EP2 * Math.cos(phi) ** 2;
    const Aa = (lambda - LON0) * Math.cos(phi);
    const nu = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);

    const x = FALSE_EASTING + K0 * nu * (
      Aa + ((1 - T + C) * Aa ** 3) / 6
      + ((5 - 18 * T + T ** 2 + 72 * C - 58 * EP2) * Aa ** 5) / 120
    );
    const y = FALSE_NORTHING + K0 * (
      meridianArc(phi) - M0
      + nu * Math.tan(phi) * (
        Aa ** 2 / 2
        + ((5 - T + 9 * C + 4 * C ** 2) * Aa ** 4) / 24
        + ((61 - 58 * T + T ** 2 + 600 * C - 330 * EP2) * Aa ** 6) / 720
      )
    );
    return { x, y };
  }

  /** { x, y } (Este/Norte EPSG:9377, m) -> { lat, lon } (grados, WGS84/MAGNA-SIRGAS). */
  function epsg9377ToLatLon(x, y) {
    const M1 = M0 + (y - FALSE_NORTHING) / K0;
    const mu1 = M1 / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
    const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));

    const phi1 = mu1
      + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu1)
      + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu1)
      + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu1)
      + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu1);

    const C1 = EP2 * Math.cos(phi1) ** 2;
    const T1 = Math.tan(phi1) ** 2;
    const nu1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2);
    const rho1 = (A * (1 - E2)) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5;
    const D = (x - FALSE_EASTING) / (nu1 * K0);

    const phi = phi1 - ((nu1 * Math.tan(phi1)) / rho1) * (
      D ** 2 / 2
      - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4) / 24
      + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6) / 720
    );
    const lambda = LON0 + (
      D - ((1 + 2 * T1 + C1) * D ** 3) / 6
      + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5) / 120
    ) / Math.cos(phi1);

    return { lat: toDeg(phi), lon: toDeg(lambda) };
  }

  /**
   * Metros por píxel de un tile de mapa web estándar (256px, Web Mercator)
   * a un nivel de zoom dado, en una latitud dada. Usado para calibrar el
   * zoom de Leaflet de forma que su escala coincida con la del proyector
   * SVG (ver mapRenderer.js).
   */
  function metersPerPixel(zoom, lat) {
    const earthCircumference = 2 * Math.PI * A;
    return (earthCircumference * Math.cos(toRad(lat))) / (256 * 2 ** zoom);
  }

  /** Zoom (fraccional) cuya escala en `lat` coincide con `metersPerPx` dados. */
  function zoomForScale(metersPerPx, lat) {
    const earthCircumference = 2 * Math.PI * A;
    return Math.log2((earthCircumference * Math.cos(toRad(lat))) / (256 * metersPerPx));
  }

  const geo = { latLonToEpsg9377, epsg9377ToLatLon, metersPerPixel, zoomForScale };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = geo;
  }
  global.LineDesignGeo = geo;
})(typeof window !== 'undefined' ? window : globalThis);
