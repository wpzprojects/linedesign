/**
 * dxfExport.js — Exporta Planta o Perfil a DXF (AutoCAD 2000 / AC1015 —
 * necesario para el código de color verdadero 420; solo HEADER (para
 * declarar la versión) + ENTITIES, sin TABLES/BLOCKS: la capa "0" y demás
 * valores por defecto ya existen implícitamente en cualquier lector).
 * Coordenadas reales (1 unidad de dibujo = 1 metro) — pensado para
 * overlay/medición en CAD, no para verse "bonito".
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

  function escapeDxfText(text) {
    // DXF usa "%%" como prefijo de códigos especiales (%%d = °, etc.) — se
    // duplica cualquier "%" literal para que no se interprete como uno.
    return String(text).replace(/%/g, '%%');
  }

  /** Código de color verdadero (420, 24 bits) a partir de un "#rrggbb" —
   * opcional: sin color, la entidad hereda el color por defecto de su capa
   * (blanco/negro según el lector, de ahí que antes se viera "en blanco"). */
  function colorCodes(hex) {
    if (!hex) return [];
    const int = parseInt(hex.replace('#', ''), 16);
    if (!Number.isFinite(int)) return [];
    return ['420', String(int)];
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

  function buildDxfDocument(entityGroups) {
    return [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$ACADVER', '1', 'AC1015',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      ...entityGroups.flat(),
      '0', 'ENDSEC',
      '0', 'EOF'
    ].join('\n');
  }

  /** Planta: coordenadas reales del proyecto (MAGNA-SIRGAS / Origen-Nacional,
   * EPSG:9377 — ver geo.js), en metros. `colors` (opcional): hex por capa
   * ({ alignment, structure, servidumbre }) — sin esto, color por defecto
   * del lector. */
  function buildPlanDxf(project, { colors = {} } = {}) {
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
        entities.push(polylineAsLines(stationing.offsetPolyline(vertices, offset), 'SERVIDUMBRE', colors.servidumbre));
      });
    }

    const resolved = stationing.resolveStructures(vertices, project.structures);
    resolved.forEach((structure) => {
      entities.push(dxfCircle(structure.x, structure.y, 1.5, 'ESTRUCTURAS', colors.structure));
      entities.push(dxfText(structure.x + 2, structure.y + 2, 2.5, structure.name || structure.id, 'ESTRUCTURAS', colors.structure));
    });

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
   * `colors` (opcional, hex): { terrain, structure, conductor, vertexLine }.
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

    const terrainPointsRaw = terrainProfile
      ? terrainProfile.map((p) => ({ x: p.station, y: p.elevation }))
      : vertices.map((v, i) => ({ x: distances[i], y: v.z }));

    const baseline = Math.min(...terrainPointsRaw.map((p) => p.y));
    const scaleY = (y) => baseline + (y - baseline) * verticalExaggeration;

    const terrainPoints = terrainPointsRaw.map((p) => ({ x: p.x, y: scaleY(p.y) }));
    entities.push(polylineAsLines(terrainPoints, 'TERRENO', colors.terrain));

    if (showVertexLines) {
      const terrainTopY = scaleY(Math.max(...terrainPointsRaw.map((p) => p.y)));
      const terrainBottomY = scaleY(Math.min(...terrainPointsRaw.map((p) => p.y)));
      vertices.forEach((v, i) => {
        entities.push(dxfLine(distances[i], terrainBottomY, distances[i], terrainTopY, 'VERTICES', colors.vertexLine));
      });
    }

    const resolved = stationing.resolveStructures(vertices, project.structures, terrainProfile)
      .sort((a, b) => a.station - b.station);
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
    for (let i = 0; i < resolved.length - 1; i += 1) {
      const from = resolved[i];
      const to = resolved[i + 1];
      const spanLength = to.station - from.station;
      if (spanLength <= 0) continue;
      const section = sections.find((sec) => i >= sec.spanFromIndex && i <= sec.spanToIndex);
      const conductor = loadTree.resolveSectionConductor(project, section.fromId, section.toId);
      const referenceHypothesis = project.hypotheses.find((h) => h.id === conductor.referenceHypothesisId) || project.hypotheses[0];
      const tension = catenary.computeSpanTension(conductor, referenceHypothesis, hypothesis, section.rulingSpan, project.stringingTensions);
      const fromTop = from.z + from.height;
      const toTop = to.z + to.height;
      const curve = catenary.catenaryCurve({
        span: spanLength, heightDiff: toTop - fromTop, H: tension.horizontalTension, unitWeight: tension.verticalUnitWeight
      });
      const points = curve.points.map((p) => ({ x: from.station + p.x, y: scaleY(fromTop + p.y) }));
      entities.push(polylineAsLines(points, 'CONDUCTOR', colors.conductor));

      if (showSag || showClearance) {
        const midStation = from.station + spanLength / 2;
        const midTopY = scaleY(Math.min(fromTop, toTop));
        if (showSag) {
          entities.push(dxfText(midStation, midTopY + 1, 1.5, `${curve.sag.toFixed(2)} m`, 'ANOTACIONES', colors.conductor));
        }
        if (showClearance) {
          const minClearance = curve.points.reduce((min, p) => {
            const station = from.station + p.x;
            const terrainZ = terrainProfile
              ? stationing.elevationAtStation(terrainProfile, station)
              : stationing.pointAtStation(vertices, station).z;
            return Math.min(min, (fromTop + p.y) - terrainZ);
          }, Infinity);
          entities.push(dxfText(midStation, midTopY - 2, 1.5, `${minClearance.toFixed(2)} m`, 'ANOTACIONES', colors.terrain));
        }
      }
    }

    return buildDxfDocument(entities);
  }

  const dxfExport = { buildPlanDxf, buildProfileDxf };
  if (typeof module !== 'undefined' && module.exports) module.exports = dxfExport;
  global.LineDesignDxfExport = dxfExport;
})(typeof window !== 'undefined' ? window : globalThis);
