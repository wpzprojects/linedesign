/**
 * dxfExport.js — Exporta Planta o Perfil a DXF (R12, solo sección ENTITIES —
 * un DXF mínimo válido no necesita HEADER/TABLES/BLOCKS: la capa "0" y los
 * demás valores por defecto ya existen implícitamente en cualquier lector).
 * Coordenadas reales (1 unidad de dibujo = 1 metro), sin exageración vertical
 * en Perfil — pensado para overlay/medición en CAD, no para verse "bonito".
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

  function dxfLine(x1, y1, x2, y2, layer) {
    return ['0', 'LINE', '8', layer, '10', fmt(x1), '20', fmt(y1), '30', '0', '11', fmt(x2), '21', fmt(y2), '31', '0'];
  }

  function dxfCircle(x, y, r, layer) {
    return ['0', 'CIRCLE', '8', layer, '10', fmt(x), '20', fmt(y), '30', '0', '40', fmt(r)];
  }

  function dxfText(x, y, height, text, layer) {
    return ['0', 'TEXT', '8', layer, '10', fmt(x), '20', fmt(y), '30', '0', '40', fmt(height), '1', escapeDxfText(text)];
  }

  /** Serie de LINE conectando puntos consecutivos — más simple y compatible
   * entre lectores que una POLYLINE/LWPOLYLINE real. */
  function polylineAsLines(points, layer) {
    const lines = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      lines.push(...dxfLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, layer));
    }
    return lines;
  }

  function buildDxfDocument(entityGroups) {
    return ['0', 'SECTION', '2', 'ENTITIES', ...entityGroups.flat(), '0', 'ENDSEC', '0', 'EOF'].join('\n');
  }

  /** Planta: coordenadas reales del proyecto (MAGNA-SIRGAS / Origen-Nacional,
   * EPSG:9377 — ver geo.js), en metros. */
  function buildPlanDxf(project) {
    const vertices = project.alignment.vertices;
    const entities = [];

    entities.push(polylineAsLines(vertices, 'ALINEAMIENTO'));
    vertices.forEach((v) => {
      entities.push(dxfCircle(v.x, v.y, 1, 'ALINEAMIENTO'));
      entities.push(dxfText(v.x + 1.5, v.y + 1.5, 2, v.id, 'ALINEAMIENTO'));
    });

    const rightOfWayWidth = project.rightOfWayWidth || 0;
    if (rightOfWayWidth > 0 && vertices.length >= 2) {
      const half = rightOfWayWidth / 2;
      [half, -half].forEach((offset) => {
        entities.push(polylineAsLines(stationing.offsetPolyline(vertices, offset), 'SERVIDUMBRE'));
      });
    }

    const resolved = stationing.resolveStructures(vertices, project.structures);
    resolved.forEach((structure) => {
      entities.push(dxfCircle(structure.x, structure.y, 1.5, 'ESTRUCTURAS'));
      entities.push(dxfText(structure.x + 2, structure.y + 2, 2.5, structure.name || structure.id, 'ESTRUCTURAS'));
    });

    return buildDxfDocument(entities);
  }

  /** Perfil: eje X = station (m), eje Y = elevación real (msnm) — sin la
   * exageración vertical que usa la vista en pantalla (Configuración/
   * "Escala vertical"), para que sirva de referencia real en CAD. */
  function buildProfileDxf(project, hypothesisId) {
    const vertices = project.alignment.vertices;
    const distances = stationing.cumulativeDistances(vertices);
    const terrainProfile = project.alignment.terrainProfile;
    const entities = [];

    const terrainPoints = terrainProfile
      ? terrainProfile.map((p) => ({ x: p.station, y: p.elevation }))
      : vertices.map((v, i) => ({ x: distances[i], y: v.z }));
    entities.push(polylineAsLines(terrainPoints, 'TERRENO'));

    const resolved = stationing.resolveStructures(vertices, project.structures, terrainProfile)
      .sort((a, b) => a.station - b.station);
    resolved.forEach((structure) => {
      entities.push(dxfLine(structure.station, structure.z, structure.station, structure.z + structure.height, 'ESTRUCTURAS'));
      entities.push(dxfText(structure.station + 1, structure.z + structure.height + 1, 2, structure.name || structure.id, 'ESTRUCTURAS'));
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
      const points = curve.points.map((p) => ({ x: from.station + p.x, y: fromTop + p.y }));
      entities.push(polylineAsLines(points, 'CONDUCTOR'));
    }

    return buildDxfDocument(entities);
  }

  const dxfExport = { buildPlanDxf, buildProfileDxf };
  if (typeof module !== 'undefined' && module.exports) module.exports = dxfExport;
  global.LineDesignDxfExport = dxfExport;
})(typeof window !== 'undefined' ? window : globalThis);
