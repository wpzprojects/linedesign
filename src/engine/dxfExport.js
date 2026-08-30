/**
 * dxfExport.js — Exporta Planta o Perfil a DXF R12 (AC1009) mínimo: SOLO
 * la sección ENTITIES, sin HEADER/TABLES/BLOCKS — la capa "0" y demás
 * valores por defecto ya existen implícitamente en cualquier lector, y R12
 * no necesita handles/objetos con id (a diferencia de R2000+, que BricsCAD/
 * AutoCAD sí validan estrictamente — de ahí el error "Null object Id" al
 * probar con un HEADER declarando AC1015 sin las tablas que ese formato
 * espera). El color va por índice ACI (código 62, paleta estándar de 255
 * colores) en vez de color verdadero (420, que requiere R2000+). Sin
 * TABLES tampoco hay linetypes propios (DASHED, etc.) — la servidumbre se
 * dibuja "punteada a mano": tramos LINE cortos con huecos entre ellos, en
 * vez de un linetype real, para no depender de ninguna sección extra.
 *
 * Coordenadas reales (1 unidad de dibujo = 1 metro) — pensado para
 * overlay/medición en CAD, no para verse "bonito". Cada elemento va en su
 * propia capa (ALINEAMIENTO, ESTRUCTURAS, CIRCUITO, SERVIDUMBRE, CUADRICULA
 * en Planta; TERRENO, ESTRUCTURAS, CONDUCTOR, VERTICES, ANOTACIONES,
 * CUADRICULA en Perfil).
 *
 * Módulo puro (sin DOM), igual que el resto de src/engine — ver stationing.js.
 */
(function (global) {
  const stationing = global.LineDesignStationing;
  const catenary = global.LineDesignCatenary;
  const loadTree = global.LineDesignLoadTree;

  function fmt(n) {
    if (!Number.isFinite(n)) return '0';
    // Fijo (nunca notación científica) — algunos lectores de DXF no
    // aceptan "1.23e+5" en un group code de coordenada.
    return n.toFixed(4);
  }

  function formatTick(value, step) {
    return value.toFixed(step < 1 ? 1 : 0);
  }

  function escapeDxfText(text) {
    // DXF usa "%%" como prefijo de códigos especiales (%%d = °, etc.) — se
    // duplica cualquier "%" literal para que no se interprete como uno.
    return String(text).replace(/%/g, '%%');
  }

  // Paleta reducida del índice de color de AutoCAD (ACI, código 62) — el
  // valor real de cada índice 1-255 depende de una tabla fija que no vale
  // la pena reproducir entera acá; esta docena cubre razonablemente los
  // colores de tema de la app (naranja/verde azulado/azul/oliva/gris).
  const ACI_PALETTE = [
    [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]],
    [5, [0, 0, 255]], [6, [255, 0, 255]], [7, [255, 255, 255]], [8, [128, 128, 128]],
    [9, [191, 191, 191]], [30, [255, 165, 0]], [92, [0, 128, 128]], [102, [128, 128, 0]]
  ];

  function hexToRgb(hex) {
    const int = parseInt(hex.replace('#', ''), 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }

  function nearestAciColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    let best = 7;
    let bestDist = Infinity;
    ACI_PALETTE.forEach(([aci, [pr, pg, pb]]) => {
      const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = aci;
      }
    });
    return best;
  }

  /** Código de color por índice ACI (62) a partir de un "#rrggbb" —
   * opcional: sin color, la entidad hereda el color por defecto de su capa
   * (blanco/negro según el lector). */
  function colorCodes(hex) {
    if (!hex) return [];
    return ['62', String(nearestAciColor(hex))];
  }

  function dxfLine(x1, y1, x2, y2, layer, color) {
    return ['0', 'LINE', '8', layer, ...colorCodes(color), '10', fmt(x1), '20', fmt(y1), '30', '0', '11', fmt(x2), '21', fmt(y2), '31', '0'];
  }

  function dxfCircle(x, y, r, layer, color) {
    return ['0', 'CIRCLE', '8', layer, ...colorCodes(color), '10', fmt(x), '20', fmt(y), '30', '0', '40', fmt(r)];
  }

  function dxfText(x, y, height, text, layer, color) {
    return ['0', 'TEXT', '8', layer, ...colorCodes(color), '10', fmt(x), '20', fmt(y), '30', '0', '40', fmt(height), '1', escapeDxfText(text)];
  }

  /** Serie de LINE conectando puntos consecutivos — más simple y compatible
   * entre lectores que una POLYLINE/LWPOLYLINE real. */
  function polylineAsLines(points, layer, color) {
    const lines = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      lines.push(...dxfLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, layer, color));
    }
    return lines;
  }

  /** Misma polilínea, pero "punteada a mano" (tramos LINE cortos con huecos
   * — ver comentario del módulo, no hay linetype propio sin TABLES). */
  function dashedPolylineAsLines(points, layer, color, dashLen = 2, gapLen = 1.2) {
    const lines = [];
    let remaining = dashLen;
    let drawing = true;
    for (let i = 0; i < points.length - 1; i += 1) {
      const x1 = points[i].x;
      const y1 = points[i].y;
      const x2 = points[i + 1].x;
      const y2 = points[i + 1].y;
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      if (segLen < 1e-9) continue;
      const dx = (x2 - x1) / segLen;
      const dy = (y2 - y1) / segLen;
      let pos = 0;
      while (pos < segLen) {
        const step = Math.min(remaining, segLen - pos);
        if (drawing) {
          lines.push(...dxfLine(x1 + dx * pos, y1 + dy * pos, x1 + dx * (pos + step), y1 + dy * (pos + step), layer, color));
        }
        pos += step;
        remaining -= step;
        if (remaining <= 1e-9) {
          drawing = !drawing;
          remaining = drawing ? dashLen : gapLen;
        }
      }
    }
    return lines;
  }

  function buildDxfDocument(entityGroups) {
    return ['0', 'SECTION', '2', 'ENTITIES', ...entityGroups.flat(), '0', 'ENDSEC', '0', 'EOF'].join('\n');
  }

  /** Cuadrícula de referencia (mismo criterio que buildRulerGrid en
   * svgUtil.js — ver también ese archivo): marcas "redondas" (niceStep) en
   * X y en Y, como líneas que cruzan todo el rango, con su valor como
   * TEXT. `valueBounds` está siempre en el espacio de datos REAL (nunca
   * escalado) — el paso y las marcas se calculan ahí; `toDrawX`/`toDrawY`
   * (opcionales, por defecto la identidad) convierten cada posición al
   * espacio en el que de verdad se dibuja — en Perfil, toDrawY aplica la
   * exageración vertical (ver scaleY en buildProfileDxf), así el paso
   * sigue siendo un número de elevación "redondo" aunque su POSICIÓN en
   * el dibujo esté estirada. */
  function buildGridEntities(valueBounds, layer, color, toDrawX = (x) => x, toDrawY = (y) => y) {
    const entities = [];
    const stepX = stationing.niceStep(valueBounds.maxX - valueBounds.minX);
    const stepY = stationing.niceStep(valueBounds.maxY - valueBounds.minY);
    const drawMinX = toDrawX(valueBounds.minX);
    const drawMaxX = toDrawX(valueBounds.maxX);
    const drawMinY = toDrawY(valueBounds.minY);
    const drawMaxY = toDrawY(valueBounds.maxY);
    const labelHeightX = Math.max(Math.abs(drawMaxY - drawMinY) * 0.03, 0.5);
    const labelHeightY = Math.max(Math.abs(drawMaxX - drawMinX) * 0.03, 0.5);
    if (stepX > 0) {
      const startX = Math.ceil(valueBounds.minX / stepX) * stepX;
      for (let x = startX; x <= valueBounds.maxX + 1e-9; x += stepX) {
        const dx = toDrawX(x);
        entities.push(dxfLine(dx, drawMinY, dx, drawMaxY, layer, color));
        entities.push(dxfText(dx, drawMinY, labelHeightX, formatTick(x, stepX), layer, color));
      }
    }
    if (stepY > 0) {
      const startY = Math.ceil(valueBounds.minY / stepY) * stepY;
      for (let y = startY; y <= valueBounds.maxY + 1e-9; y += stepY) {
        const dy = toDrawY(y);
        entities.push(dxfLine(drawMinX, dy, drawMaxX, dy, layer, color));
        entities.push(dxfText(drawMinX, dy, labelHeightY, formatTick(y, stepY), layer, color));
      }
    }
    return entities;
  }

  /** Planta: coordenadas reales del proyecto (MAGNA-SIRGAS / Origen-Nacional,
   * EPSG:9377 — ver geo.js), en metros.
   * `colors` (opcional, hex): { alignment, structure, servidumbre,
   * circuit, grid }. `showCircuit` refleja el mismo toggle ya activo en
   * pantalla (ver planView.js#getCircuitVisible) — el circuito y sus cotas
   * (distancia entre estructuras consecutivas) solo se agregan si está
   * activo. */
  function buildPlanDxf(project, { colors = {}, showCircuit = false } = {}) {
    const vertices = project.alignment.vertices;
    const entities = [];

    entities.push(polylineAsLines(vertices, 'ALINEAMIENTO', colors.alignment));
    vertices.forEach((v) => {
      entities.push(dxfCircle(v.x, v.y, 1, 'ALINEAMIENTO', colors.alignment));
      entities.push(dxfText(v.x + 1.5, v.y + 1.5, 2, v.id, 'ALINEAMIENTO', colors.alignment));
    });

    const rightOfWayWidth = project.rightOfWayWidth || 0;
    if (rightOfWayWidth > 0 && vertices.length >= 2) {
      const half = rightOfWayWidth / 2;
      [half, -half].forEach((offset) => {
        entities.push(dashedPolylineAsLines(stationing.offsetPolyline(vertices, offset), 'SERVIDUMBRE', colors.servidumbre));
      });
    }

    const resolved = stationing.resolveStructures(vertices, project.structures);
    resolved.forEach((structure) => {
      entities.push(dxfCircle(structure.x, structure.y, 1.5, 'ESTRUCTURAS', colors.structure));
      entities.push(dxfText(structure.x + 2, structure.y + 2, 2.5, structure.name || structure.id, 'ESTRUCTURAS', colors.structure));
    });

    // Circuito entre estructuras consecutivas (recto, no sigue los quiebres
    // del alineamiento) + la distancia de cada tramo — mismo criterio que
    // planView.js#updateCircuit.
    if (showCircuit && resolved.length >= 2) {
      const sorted = [...resolved].sort((a, b) => a.station - b.station);
      const points = sorted.map((s) => stationing.pointAtStation(vertices, s.station));
      entities.push(polylineAsLines(points, 'CIRCUITO', colors.circuit));
      for (let i = 0; i < points.length - 1; i += 1) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        const label = `${(sorted[i + 1].station - sorted[i].station).toFixed(1)} m`;
        entities.push(dxfText(midX, midY, 2, label, 'CIRCUITO', colors.circuit));
      }
    }

    const gridBounds = stationing.padBoundsByStep(stationing.planBounds(vertices, rightOfWayWidth / 2));
    entities.push(buildGridEntities(gridBounds, 'CUADRICULA', colors.grid));

    return buildDxfDocument(entities);
  }

  /**
   * Perfil: eje X = station (m). Eje Y = elevación, escalada según
   * `verticalExaggeration` (mismo control "Escala vertical" de la pantalla,
   * ver profileView.js#getVerticalExaggeration) — 1× = elevación real; con
   * cualquier otro valor, se estira la elevación RELATIVA a la cota mínima
   * del propio perfil (no se escala en torno a 0, que dejaría todo el
   * dibujo desplazado lejos de sus coordenadas reales sin necesidad).
   *
   * Terreno/cuadrícula se recortan a la station de la primera a la última
   * estructura — más allá de eso no hay circuito real (el alineamiento
   * puede seguir, pero ya no hay nada tendido ahí).
   *
   * `colors` (opcional, hex): { terrain, structure, conductor, vertexLine, grid }.
   * `showSag`/`showClearance`/`showVertexLines`: reflejan los mismos
   * toggles ya activos en la pantalla de Perfil (ver los getters de
   * profileView.js) — cada uno agrega o no su contenido correspondiente.
   */
  function buildProfileDxf(project, hypothesisId, options = {}) {
    const { verticalExaggeration = 1, colors = {}, showSag = false, showClearance = false, showVertexLines = false } = options;
    const vertices = project.alignment.vertices;
    const distances = stationing.cumulativeDistances(vertices);
    const terrainProfile = project.alignment.terrainProfile;
    const entities = [];

    const resolvedAll = stationing.resolveStructures(vertices, project.structures, terrainProfile)
      .sort((a, b) => a.station - b.station);
    const clipStart = resolvedAll.length ? resolvedAll[0].station : 0;
    const clipEnd = resolvedAll.length ? resolvedAll[resolvedAll.length - 1].station : (distances[distances.length - 1] || 0);

    const terrainPointsFull = terrainProfile
      ? terrainProfile.map((p) => ({ x: p.station, y: p.elevation }))
      : vertices.map((v, i) => ({ x: distances[i], y: v.z }));

    // Recorta el terreno a [clipStart, clipEnd] — con un punto interpolado
    // exacto en cada extremo (en vez de solo filtrar) para que el corte
    // quede limpio justo en la station de la primera/última estructura, no
    // en el punto muestreado más cercano.
    const elevationAt = (station) => (terrainProfile
      ? stationing.elevationAtStation(terrainProfile, station)
      : stationing.pointAtStation(vertices, station).z);
    const terrainPointsRaw = [
      { x: clipStart, y: elevationAt(clipStart) },
      ...terrainPointsFull.filter((p) => p.x > clipStart && p.x < clipEnd),
      { x: clipEnd, y: elevationAt(clipEnd) }
    ];

    const baseline = Math.min(...terrainPointsRaw.map((p) => p.y));
    const scaleY = (y) => baseline + (y - baseline) * verticalExaggeration;

    const terrainPoints = terrainPointsRaw.map((p) => ({ x: p.x, y: scaleY(p.y) }));
    entities.push(polylineAsLines(terrainPoints, 'TERRENO', colors.terrain));

    // Distancia de seguridad al terreno (Parámetros de entrada § Terreno) —
    // mismo criterio que .clearance-line en profileView.js: la forma del
    // terreno desplazada esa distancia hacia arriba, punteada. Solo si está
    // configurada (> 0), igual que en pantalla.
    const groundClearance = project.groundClearance || 0;
    if (groundClearance > 0) {
      const clearancePoints = terrainPointsRaw.map((p) => ({ x: p.x, y: scaleY(p.y + groundClearance) }));
      entities.push(dashedPolylineAsLines(clearancePoints, 'DISTANCIA_SEGURIDAD', colors.clearance));
    }

    if (showVertexLines) {
      const terrainTopY = scaleY(Math.max(...terrainPointsRaw.map((p) => p.y)));
      const terrainBottomY = scaleY(Math.min(...terrainPointsRaw.map((p) => p.y)));
      vertices.forEach((v, i) => {
        if (distances[i] < clipStart || distances[i] > clipEnd) return;
        entities.push(dxfLine(distances[i], terrainBottomY, distances[i], terrainTopY, 'VERTICES', colors.vertexLine));
      });
    }

    const resolved = resolvedAll;
    resolved.forEach((structure) => {
      const baseY = scaleY(structure.z);
      const topY = scaleY(structure.z + structure.height);
      entities.push(dxfLine(structure.station, baseY, structure.station, topY, 'ESTRUCTURAS', colors.structure));
      entities.push(dxfText(structure.station + 1, topY + 1, 2, structure.name || structure.id, 'ESTRUCTURAS', colors.structure));
    });

    const hypothesis = project.hypotheses.find((h) => h.id === hypothesisId) || project.hypotheses[0];
    const spanLengthsRaw = resolved.slice(0, -1).map((s, i) => resolved[i + 1].station - s.station);
    const sections = stationing.computeTensionSections(
      resolved,
      spanLengthsRaw,
      (s) => stationing.isAnchorStructure(s, project.structureCatalog)
    );
    let structureTopMax = -Infinity;
    for (let i = 0; i < resolved.length - 1; i += 1) {
      const from = resolved[i];
      const to = resolved[i + 1];
      const spanLength = to.station - from.station;
      if (spanLength <= 0) continue;
      const section = sections.find((sec) => i >= sec.spanFromIndex && i <= sec.spanToIndex);
      const conductor = loadTree.resolveSectionConductor(project, section.fromId, section.toId);
      const referenceHypothesis = project.hypotheses.find((h) => h.id === conductor.referenceHypothesisId) || project.hypotheses[0];
      const tension = catenary.computeSpanTension(conductor, referenceHypothesis, hypothesis, section.rulingSpan, project.stringingTensions);

      // Una curva por FASE, igual que en pantalla (ver profileView.js) —
      // cada punto de fijación del catálogo cuelga desde su propia altura
      // real (structure.height - offsetZ), emparejados por posición en la
      // lista. Si a algún extremo le falta esa info, se cae a una sola
      // curva con la altura promedio de siempre.
      const fromType = project.structureCatalog.find((t) => t.typeId === from.typeId);
      const toType = project.structureCatalog.find((t) => t.typeId === to.typeId);
      const fromPoints = (fromType && fromType.attachmentPoints) || [];
      const toPoints = (toType && toType.attachmentPoints) || [];
      const phases = (fromPoints.length && toPoints.length)
        ? Array.from({ length: Math.min(fromPoints.length, toPoints.length) }, (v, p) => ({
          fromTop: from.z + Math.max(from.height - fromPoints[p].offsetZ, 0),
          toTop: to.z + Math.max(to.height - toPoints[p].offsetZ, 0)
        }))
        : [{
          fromTop: from.z + loadTree.averageAttachmentHeight(project, from),
          toTop: to.z + loadTree.averageAttachmentHeight(project, to)
        }];

      let lowestIndex = 0;
      phases.forEach((ph, idx) => {
        if (Math.min(ph.fromTop, ph.toTop) < Math.min(phases[lowestIndex].fromTop, phases[lowestIndex].toTop)) lowestIndex = idx;
      });

      let lowestCurve = null;
      let lowestFromTop = null;
      phases.forEach((ph, idx) => {
        structureTopMax = Math.max(structureTopMax, ph.fromTop, ph.toTop);
        const curve = catenary.catenaryCurve({
          span: spanLength, heightDiff: ph.toTop - ph.fromTop, H: tension.horizontalTension, unitWeight: tension.verticalUnitWeight
        });
        const points = curve.points.map((p) => ({ x: from.station + p.x, y: scaleY(ph.fromTop + p.y) }));
        entities.push(polylineAsLines(points, 'CONDUCTOR', colors.conductor));
        if (idx === lowestIndex) {
          lowestCurve = curve;
          lowestFromTop = ph.fromTop;
        }
      });

      if (showSag || showClearance) {
        const midStation = from.station + spanLength / 2;
        const midTopY = scaleY(Math.min(phases[lowestIndex].fromTop, phases[lowestIndex].toTop));
        if (showSag) {
          entities.push(dxfText(midStation, midTopY + 1, 1.5, `${lowestCurve.sag.toFixed(2)} m`, 'ANOTACIONES', colors.conductor));
        }
        if (showClearance) {
          const minClearance = lowestCurve.points.reduce((min, p) => {
            const station = from.station + p.x;
            const terrainZ = elevationAt(station);
            return Math.min(min, (lowestFromTop + p.y) - terrainZ);
          }, Infinity);
          entities.push(dxfText(midStation, midTopY - 2, 1.5, `${minClearance.toFixed(2)} m`, 'ANOTACIONES', colors.terrain));
        }
      }
    }

    const allZ = terrainPointsRaw.map((p) => p.y)
      .concat(groundClearance > 0 ? terrainPointsRaw.map((p) => p.y + groundClearance) : [])
      .concat(resolved.map((s) => s.z), resolved.map((s) => s.z + s.height));
    const gridBounds = { minX: clipStart, maxX: clipEnd, minY: Math.min(...allZ), maxY: Math.max(...allZ, structureTopMax) };
    entities.push(buildGridEntities(gridBounds, 'CUADRICULA', colors.grid, (x) => x, scaleY));

    return buildDxfDocument(entities);
  }

  const dxfExport = { buildPlanDxf, buildProfileDxf };
  if (typeof module !== 'undefined' && module.exports) module.exports = dxfExport;
  global.LineDesignDxfExport = dxfExport;
})(typeof window !== 'undefined' ? window : globalThis);
