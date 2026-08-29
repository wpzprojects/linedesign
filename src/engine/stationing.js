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

  /**
   * `margin` (opcional, m): agranda el rango en las cuatro direcciones —
   * usado para que la franja de servidumbre (ver `offsetPolyline` abajo)
   * quepa completa aunque se salga del cajón que forman los vértices. Un
   * margen uniforme es más simple que proyectar el offset real y siempre
   * es suficiente (el offset nunca se aleja más de `margin` del trazado).
   */
  function planBounds(vertices, margin = 0) {
    const xs = vertices.map((v) => v.x);
    const ys = vertices.map((v) => v.y);
    return {
      minX: Math.min(...xs) - margin,
      maxX: Math.max(...xs) + margin,
      minY: Math.min(...ys) - margin,
      maxY: Math.max(...ys) + margin
    };
  }

  /**
   * `terrainProfile` (opcional): perfil real denso (Fase 2, ver
   * elevationSource.js), array de `{ station, elevation }`. Cuando está
   * presente se incluye en el rango de elevaciones — puede tener picos/
   * valles entre vértices que la sola interpolación lineal no captura.
   * `groundClearance` (opcional, m): distancia de seguridad al terreno —
   * se incluye terreno+distancia en el rango para que la línea punteada
   * de distancia de seguridad (ver profileView.js) nunca quede recortada.
   */
  function profileBounds(vertices, structures, terrainProfile, groundClearance = 0) {
    const distances = cumulativeDistances(vertices);
    const elevations = vertices.map((v) => v.z);
    const structureTops = structures.map((s) => s.z + s.height);
    const terrainZ = (terrainProfile || []).map((p) => p.elevation);
    const clearanceZ = groundClearance > 0 ? terrainZ.map((z) => z + groundClearance) : [];
    const allZ = elevations.concat(structureTops.length ? structureTops : elevations, terrainZ, clearanceZ);
    return {
      minX: 0,
      maxX: distances[distances.length - 1] || 1,
      minY: Math.min(...allZ),
      maxY: Math.max(...allZ)
    };
  }

  /**
   * Lista de stations (m) para muestrear el alineamiento a un paso
   * aproximadamente uniforme (`step`), incluyendo siempre 0, la longitud
   * total y la station exacta de cada vértice (para poder actualizar su
   * elevación con el mismo lote de consultas — ver Fase 2, botón "Ajustar
   * al terreno real" en Perfil).
   */
  function sampleStations(vertices, step) {
    const distances = cumulativeDistances(vertices);
    const total = distances[distances.length - 1] || 0;
    const stationSet = new Set([0, Math.round(total * 100) / 100]);
    for (let s = 0; s < total; s += step) stationSet.add(Math.round(s * 100) / 100);
    distances.forEach((d) => stationSet.add(Math.round(d * 100) / 100));
    return Array.from(stationSet).sort((a, b) => a - b);
  }

  /**
   * "Paso agradable" para marcas de regla (1/2/5 × 10^n) dado un rango de
   * datos y una cantidad objetivo de divisiones — algoritmo estándar de
   * ejes de gráficos (ver p.ej. D3 array.ticks).
   */
  function niceStep(span, targetDivisions = 6) {
    if (!Number.isFinite(span) || span <= 0) return 1;
    const rough = span / targetDivisions;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const residual = rough / magnitude;
    let niceResidual;
    if (residual > 5) niceResidual = 10;
    else if (residual > 2) niceResidual = 5;
    else if (residual > 1) niceResidual = 2;
    else niceResidual = 1;
    return niceResidual * magnitude;
  }

  /**
   * Extiende cada límite un `niceStep` más allá del rango real de datos —
   * así el plano no queda exactamente pegado a los extremos del
   * alineamiento (donde la primera/última marca de regla "agradable"
   * suele caer bien adentro del rango, dejando una franja sin ninguna
   * marca en la esquina). `padMinX`/`padMaxX`/`padMinY`/`padMaxY` dejan
   * desactivar un lado puntual — usado por Perfil, donde el eje de
   * estación siempre arranca en 0 y no debe extenderse hacia atrás.
   */
  function padBoundsByStep(bounds, { padMinX = true, padMaxX = true, padMinY = true, padMaxY = true } = {}) {
    const stepX = niceStep(bounds.maxX - bounds.minX);
    const stepY = niceStep(bounds.maxY - bounds.minY);
    return {
      minX: padMinX ? bounds.minX - stepX : bounds.minX,
      maxX: padMaxX ? bounds.maxX + stepX : bounds.maxX,
      minY: padMinY ? bounds.minY - stepY : bounds.minY,
      maxY: padMaxY ? bounds.maxY + stepY : bounds.maxY
    };
  }

  /**
   * Crea un proyector data->SVG y su inverso SVG->data para un viewport
   * dado ("zoom extents": ajusta y CENTRA el contenido dentro del área con
   * padding, igual que cualquier CAD/GIS). Si la proporción de los datos no
   * coincide con la del panel, el excedente se reparte como margen a ambos
   * lados del eje limitante — no se ancla el contenido a una esquina, que
   * dejaría todo el espacio libre acumulado de un solo lado.
   *
   * `verticalExaggeration` desacopla la escala vertical de la horizontal
   * (uso normal en vistas de Perfil: la escala horizontal siempre ajusta al
   * ancho disponible, y la vertical se multiplica por este factor para
   * aprovechar el alto del panel en vez de heredar la misma escala diminuta
   * que exige el rango horizontal, típicamente mucho mayor). Con el valor
   * por defecto (1) el eje Y usa la misma escala que el eje X, que es el
   * comportamiento original de esta función (usado tal cual por la vista en
   * Planta, donde X e Y deben conservar la misma escala para no distorsionar
   * la geometría).
   */
  function makeProjector(bounds, width, height, padding, verticalExaggeration = 1) {
    const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
    const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
    const availableW = width - padding * 2;
    const availableH = height - padding * 2;
    const scaleX = verticalExaggeration === 1
      ? Math.min(availableW / spanX, availableH / spanY)
      : availableW / spanX;
    const scaleY = scaleX * verticalExaggeration;
    const offsetX = padding + (availableW - spanX * scaleX) / 2;
    const offsetY = padding + (availableH - spanY * scaleY) / 2;

    function toScreen(dataX, dataY) {
      return {
        x: offsetX + (dataX - bounds.minX) * scaleX,
        y: height - offsetY - (dataY - bounds.minY) * scaleY
      };
    }

    function toData(screenX, screenY) {
      return {
        x: bounds.minX + (screenX - offsetX) / scaleX,
        y: bounds.minY + (height - offsetY - screenY) / scaleY
      };
    }

    return { toScreen, toData, scale: scaleX };
  }

  /**
   * Elevación interpolada linealmente en `station` sobre un perfil de
   * terreno real denso (Fase 2, ver elevationSource.js): `terrainProfile`
   * es un array de `{ station, elevation }` ordenado por station
   * ascendente (como lo produce `sampleStations`/el botón "Ajustar al
   * terreno real"). Fuera del rango cubierto, se recorta al extremo más
   * cercano en vez de extrapolar.
   */
  function elevationAtStation(terrainProfile, station) {
    if (!terrainProfile || !terrainProfile.length) return null;
    if (station <= terrainProfile[0].station) return terrainProfile[0].elevation;
    const last = terrainProfile[terrainProfile.length - 1];
    if (station >= last.station) return last.elevation;

    let hi = terrainProfile.findIndex((p) => p.station >= station);
    if (hi <= 0) hi = 1;
    const a = terrainProfile[hi - 1];
    const b = terrainProfile[hi];
    const segLen = b.station - a.station;
    const t = segLen > 0 ? (station - a.station) / segLen : 0;
    return a.elevation + (b.elevation - a.elevation) * t;
  }

  /**
   * Suaviza un perfil de terreno real crudo (Fase 2, ver
   * elevationSource.js) con un promedio ponderado gaussiano por distancia
   * en station — cada punto se recalcula como el promedio de TODOS los
   * puntos del perfil, pesados por qué tan cerca están de él (`sigma`, m:
   * a esa distancia el peso cae a ~61%; a 2×sigma, a ~14%). Conserva las
   * mismas stations, solo cambia `elevation`.
   *
   * Por qué hace falta: el dato que devuelven los servicios de elevación
   * gratuitos puede venir "saltado" (ver Apéndice de `DATA_MODEL.md`) —
   * este suavizado no es solo cosmético para la curva dibujada: al usarse
   * también para la elevación de las estructuras (`resolveStructures`),
   * evita postes con una base que salta de forma poco realista de un
   * punto muestreado al siguiente.
   */
  function smoothTerrainProfile(terrainProfile, sigma = 40) {
    if (!terrainProfile || terrainProfile.length < 3) return terrainProfile;
    return terrainProfile.map((point) => {
      let weightedSum = 0;
      let weightTotal = 0;
      terrainProfile.forEach((other) => {
        const d = other.station - point.station;
        const weight = Math.exp(-(d * d) / (2 * sigma * sigma));
        weightedSum += other.elevation * weight;
        weightTotal += weight;
      });
      return { station: point.station, elevation: weightedSum / weightTotal };
    });
  }

  function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    return Math.hypot(point.x - projX, point.y - projY);
  }

  /**
   * Simplificación de Douglas-Peucker: reduce una polilínea de `[{x, y}]`
   * a los vértices que realmente definen su forma, dentro de una
   * tolerancia (m) — usada para importar KMZ/KML (Fase 2, ver
   * kmzImport.js), cuyos trazados suelen venir sobre-muestreados
   * (cientos de puntos siguiendo un trazo dibujado a mano) frente a un
   * alineamiento de diseño real, que se define por unos pocos PIs.
   */
  function simplifyPolyline(points, tolerance) {
    if (points.length < 3) return points.slice();
    let maxDist = 0;
    let splitIndex = 0;
    const lastIndex = points.length - 1;
    for (let i = 1; i < lastIndex; i += 1) {
      const dist = perpendicularDistance(points[i], points[0], points[lastIndex]);
      if (dist > maxDist) {
        maxDist = dist;
        splitIndex = i;
      }
    }
    if (maxDist > tolerance) {
      const left = simplifyPolyline(points.slice(0, splitIndex + 1), tolerance);
      const right = simplifyPolyline(points.slice(splitIndex), tolerance);
      return left.slice(0, -1).concat(right);
    }
    return [points[0], points[lastIndex]];
  }

  /**
   * Devuelve las estructuras con su posición (x, y, z) derivada de la station
   * sobre el alineamiento vigente. La posición NO se almacena en el proyecto:
   * se deriva siempre a partir de `station`, de modo que mover un vértice del
   * alineamiento reubica automáticamente las estructuras (criterio de
   * aceptación §10.2 del prompt maestro).
   *
   * `terrainProfile` (opcional, Fase 2): si está presente, la elevación (z)
   * se toma de ahí (interpolación entre las dos muestras reales más
   * cercanas) en vez de interpolar linealmente entre los dos vértices
   * vecinos — así la base de cada estructura queda sobre el terreno real
   * dibujado en Perfil, no "flotando" sobre una aproximación más gruesa.
   */
  function resolveStructures(vertices, structures, terrainProfile) {
    return structures.map((structure) => {
      const pos = pointAtStation(vertices, structure.station);
      const realZ = terrainProfile ? elevationAtStation(terrainProfile, structure.station) : null;
      return { ...structure, x: pos.x, y: pos.y, z: realZ !== null ? realZ : pos.z };
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

  /**
   * ¿Es esta estructura un "anclaje" (delimita una sección de
   * tensionamiento) o un simple paso/suspensión donde el conductor
   * atraviesa sin anclarse (la cadena de aisladores se balancea para
   * igualar la tensión con el vano vecino)? Retención y Ángulo anclan;
   * Suspensión y Paso no. Una estructura con un tipo huérfano (no está en
   * el catálogo) se trata como anclaje, por seguridad — mejor una sección
   * de más que asumir que el cable pasa de largo sin anclarse.
   */
  function isAnchorStructure(structure, structureCatalog) {
    const type = (structureCatalog || []).find((t) => t.typeId === structure.typeId);
    const category = type ? type.type : null;
    return category !== 'Suspensión' && category !== 'Paso';
  }

  /**
   * Vano regulador (ruling/equivalent span) de una serie de longitudes de
   * vano: L = √(Σ Li³ / Σ Li). Estándar de la industria para representar
   * varios vanos que comparten una tensión horizontal común (los que caen
   * dentro de una misma sección de tensionamiento, ver
   * `tensionSectionRulingSpans`) con un único vano equivalente en la
   * ecuación de cambio de estado.
   */
  function rulingSpan(spanLengths) {
    const sumL = spanLengths.reduce((a, b) => a + b, 0);
    if (sumL <= 0) return 0;
    const sumL3 = spanLengths.reduce((a, b) => a + b * b * b, 0);
    return Math.sqrt(sumL3 / sumL);
  }

  /**
   * Agrupa los vanos de un alineamiento en secciones de tensionamiento
   * delimitadas por estructuras de anclaje (`isAnchorStructure`) — la
   * primera y la última estructura del alineamiento cierran sección
   * SIEMPRE, tengan o no un tipo de anclaje real asignado (la línea tiene
   * que amarrarse en sus dos extremos), sin necesidad de un caso especial:
   * toda sección arranca en el índice 0 o donde terminó la anterior, y la
   * última se cierra al llegar al final del arreglo pase lo que pase.
   *
   * Devuelve un objeto por sección: `fromId`/`toId` (ids de las
   * estructuras de anclaje que la delimitan — sirven para seleccionarla
   * como conjunto y para asignarle un conductor propio, ver
   * DATA_MODEL.md § sectionConductors), `spanFromIndex`/`spanToIndex`
   * (rango de índices en el arreglo de vanos que le pertenecen) y
   * `rulingSpan` (el vano regulador de esa sección).
   */
  function computeTensionSections(sortedStructures, spanLengths, isAnchor) {
    const sections = [];
    let sectionStart = 0;
    for (let i = 1; i < sortedStructures.length; i += 1) {
      if (i === sortedStructures.length - 1 || isAnchor(sortedStructures[i])) {
        sections.push({
          fromId: sortedStructures[sectionStart].id,
          toId: sortedStructures[i].id,
          spanFromIndex: sectionStart,
          spanToIndex: i - 1,
          rulingSpan: rulingSpan(spanLengths.slice(sectionStart, i))
        });
        sectionStart = i;
      }
    }
    return sections;
  }

  /**
   * Igual que `computeTensionSections`, pero devuelve el vano regulador ya
   * expandido por vano (mismo orden/índice que `spanLengths`) en vez de
   * agrupado por sección — para pasarlo directo a
   * `catenary.computeSpanTension` en vez de la longitud real de cada vano
   * individual (que sigue usándose tal cual para dibujar la curva/flecha
   * de cada vano con `catenary.catenaryCurve`).
   */
  function tensionSectionRulingSpans(sortedStructures, spanLengths, isAnchor) {
    const sections = computeTensionSections(sortedStructures, spanLengths, isAnchor);
    const rulingSpanBySpan = new Array(spanLengths.length).fill(0);
    sections.forEach((section) => {
      for (let i = section.spanFromIndex; i <= section.spanToIndex; i += 1) rulingSpanBySpan[i] = section.rulingSpan;
    });
    return rulingSpanBySpan;
  }

  /**
   * Desplaza el alineamiento `distance` metros perpendicular a su propio
   * trazado (positivo/negativo = un lado u otro) — usado para dibujar el
   * borde de la franja de servidumbre en Planta. En cada vértice interior
   * el desplazamiento usa la dirección promedio de los dos segmentos que
   * se cruzan ahí (aproximación de "miter" simple, sin corrección de
   * longitud en el ángulo — suficiente para los quiebres graduales típicos
   * de un alineamiento de línea de transmisión; en un ángulo muy cerrado
   * el borde quedaría un poco más angosto que `distance` justo en el PI).
   */
  function offsetPolyline(vertices, distance) {
    if (vertices.length < 2) return vertices.map((v) => ({ x: v.x, y: v.y }));
    const dirs = [];
    for (let i = 0; i < vertices.length - 1; i += 1) {
      const dx = vertices[i + 1].x - vertices[i].x;
      const dy = vertices[i + 1].y - vertices[i].y;
      const len = Math.hypot(dx, dy) || 1;
      dirs.push({ x: dx / len, y: dy / len });
    }
    return vertices.map((v, i) => {
      let dir;
      if (i === 0) {
        dir = dirs[0];
      } else if (i === vertices.length - 1) {
        dir = dirs[dirs.length - 1];
      } else {
        const a = dirs[i - 1];
        const b = dirs[i];
        const mx = a.x + b.x;
        const my = a.y + b.y;
        const mlen = Math.hypot(mx, my);
        dir = mlen > 1e-9 ? { x: mx / mlen, y: my / mlen } : { x: -a.y, y: a.x };
      }
      // Perpendicular (rotación de 90°) de la dirección del trazado.
      return { x: v.x + -dir.y * distance, y: v.y + dir.x * distance };
    });
  }

  const stationing = {
    segmentLength,
    cumulativeDistances,
    totalLength,
    pointAtStation,
    planBounds,
    profileBounds,
    padBoundsByStep,
    makeProjector,
    resolveStructures,
    elevationAtStation,
    smoothTerrainProfile,
    simplifyPolyline,
    nearestStation,
    computeSpans,
    isAnchorStructure,
    rulingSpan,
    computeTensionSections,
    tensionSectionRulingSpans,
    niceStep,
    sampleStations,
    offsetPolyline
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = stationing;
  }
  global.LineDesignStationing = stationing;
})(typeof window !== 'undefined' ? window : globalThis);
