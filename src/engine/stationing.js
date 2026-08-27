/**
 * stationing.js — Geometría del alineamiento (planta) y derivación del perfil.
 *
 * Unidades: metros (m) en X/Y/Z. "Station" (abscisado) es la distancia acumulada
 * en planta desde el primer vértice, medida a lo largo de la polilínea del
 * alineamiento (no en línea recta al punto final).
 *
 * Este módulo es puro (sin DOM) para poder probarlo de forma aislada — ver /tests.
 */
(function (global) {
  function segmentLength(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  /** Distancia acumulada (station) en cada vértice: [0, ..., longitudTotal] */
  function cumulativeDistances(vertices) {
    const distances = [0];
    for (let i = 1; i < vertices.length; i += 1) {
      distances.push(distances[i - 1] + segmentLength(vertices[i - 1], vertices[i]));
    }
    return distances;
  }

  function totalLength(vertices) {
    const distances = cumulativeDistances(vertices);
    return distances[distances.length - 1] || 0;
  }

  /**
   * Punto (x, y, z) y dirección unitaria en planta a una distancia "station"
   * medida a lo largo del alineamiento. z se interpola linealmente entre
   * vértices (perfil de terreno simulado).
   */
  function pointAtStation(vertices, station) {
    if (!vertices.length) return { x: 0, y: 0, z: 0, heading: { x: 1, y: 0 } };
    const distances = cumulativeDistances(vertices);
    const total = distances[distances.length - 1];
    const s = Math.min(Math.max(station, 0), total);

    if (vertices.length === 1) {
      return { x: vertices[0].x, y: vertices[0].y, z: vertices[0].z, heading: { x: 1, y: 0 } };
    }

    let segIndex = distances.findIndex((d, i) => i > 0 && d >= s);
    if (segIndex === -1) segIndex = distances.length - 1;

    const a = vertices[segIndex - 1];
    const b = vertices[segIndex];
    const segLen = distances[segIndex] - distances[segIndex - 1];
    const t = segLen > 0 ? (s - distances[segIndex - 1]) / segLen : 0;

    const heading = segLen > 0
      ? { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen }
      : { x: 1, y: 0 };

    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      heading
    };
  }

  function planBounds(vertices) {
    const xs = vertices.map((v) => v.x);
    const ys = vertices.map((v) => v.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  }

  function profileBounds(vertices, structures) {
    const distances = cumulativeDistances(vertices);
    const elevations = vertices.map((v) => v.z);
    const structureTops = structures.map((s) => s.z + s.height);
    const allZ = elevations.concat(structureTops.length ? structureTops : elevations);
    return {
      minX: 0,
      maxX: distances[distances.length - 1] || 1,
      minY: Math.min(...allZ),
      maxY: Math.max(...allZ)
    };
  }

  /** Crea un proyector data->SVG y su inverso SVG->data para un viewport dado. */
  function makeProjector(bounds, width, height, padding) {
    const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
    const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);

    function toScreen(dataX, dataY) {
      return {
        x: padding + (dataX - bounds.minX) * scale,
        y: height - padding - (dataY - bounds.minY) * scale
      };
    }

    function toData(screenX, screenY) {
      return {
        x: bounds.minX + (screenX - padding) / scale,
        y: bounds.minY + (height - padding - screenY) / scale
      };
    }

    return { toScreen, toData, scale };
  }

  /**
   * Devuelve las estructuras con su posición (x, y, z) derivada de la station
   * sobre el alineamiento vigente. La posición NO se almacena en el proyecto:
   * se deriva siempre a partir de `station`, de modo que mover un vértice del
   * alineamiento reubica automáticamente las estructuras (criterio de
   * aceptación §10.2 del prompt maestro).
   */
  function resolveStructures(vertices, structures) {
    return structures.map((structure) => {
      const pos = pointAtStation(vertices, structure.station);
      return { ...structure, x: pos.x, y: pos.y, z: pos.z };
    });
  }

  /**
   * Station (distancia acumulada) del punto de la polilínea más cercano a un
   * punto (x, y) arbitrario. Se usa para convertir la posición de arrastre
   * (drag) de una estructura en planta de vuelta a una station válida sobre
   * el alineamiento.
   */
  function nearestStation(vertices, point) {
    const distances = cumulativeDistances(vertices);
    let best = { station: 0, distanceSq: Infinity };

    for (let i = 1; i < vertices.length; i += 1) {
      const a = vertices[i - 1];
      const b = vertices[i];
      const segLen = distances[i] - distances[i - 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq > 0 ? ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq : 0;
      t = Math.min(Math.max(t, 0), 1);

      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const distanceSq = (point.x - px) ** 2 + (point.y - py) ** 2;

      if (distanceSq < best.distanceSq) {
        best = { station: distances[i - 1] + t * segLen, distanceSq };
      }
    }

    return best.station;
  }

  /** Estructuras ordenadas por station, agrupadas en vanos consecutivos. */
  function computeSpans(structures) {
    const sorted = [...structures].sort((a, b) => a.station - b.station);
    const spans = [];
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const from = sorted[i];
      const to = sorted[i + 1];
      spans.push({
        id: `${from.id}->${to.id}`,
        fromId: from.id,
        toId: to.id,
        length: to.station - from.station
      });
    }
    return { sorted, spans };
  }

  const stationing = {
    segmentLength,
    cumulativeDistances,
    totalLength,
    pointAtStation,
    planBounds,
    profileBounds,
    makeProjector,
    resolveStructures,
    nearestStation,
    computeSpans
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = stationing;
  }
  global.LineDesignStationing = stationing;
})(typeof window !== 'undefined' ? window : globalThis);
