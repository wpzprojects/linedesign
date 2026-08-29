/**
 * loadTree.js — Árbol de cargas por estructura.
 *
 * Para cada estructura y cada hipótesis de carga se calcula:
 *   - vertical (N): peso tributario del conductor (autopeso + hielo) de los
 *     vanos adyacentes, mitad de cada vano, sentido positivo hacia abajo.
 *   - transversal (N): carga de viento tributaria de los vanos adyacentes +
 *     componente transversal del desequilibrio de tensión entre vanos
 *     (relevante en estructuras de ángulo).
 *   - longitudinal (N): componente longitudinal del desequilibrio de tensión
 *     entre vanos adyacentes (0 en una estructura de suspensión en tangente con
 *     vanos de igual tensión; máxima en un remate/estructura terminal, donde
 *     un único vano tracciona sin contrapeso).
 *   - momentEstimate (N·m): estimación simplificada de momento de vuelco en la
 *     base = fuerza vertical total × altura de enganche promedio. No sustituye
 *     un cálculo estructural real; es un indicador orientativo de Fase 1.
 *
 * Simplificaciones de Fase 1 (ver también DATA_MODEL.md):
 *   - No se incluye peso propio de la estructura ni de herrajes/aisladores.
 *   - Todas las fases (attachmentPoints) del conductor se asumen con la misma
 *     longitud de vano que el eje de la estructura (los offsets de enganche
 *     son pequeños frente al vano, efecto despreciado en Fase 1).
 *   - No se modela el balanceo de cadenas de aisladores en remates/ángulos.
 */
(function (global) {
  const stationing = global.LineDesignStationing;
  const catenary = global.LineDesignCatenary;

  function getReferenceHypothesis(project) {
    const refId = project.conductor.referenceHypothesisId;
    return project.hypotheses.find((h) => h.id === refId) || project.hypotheses[0];
  }

  function attachmentCount(project, structure) {
    const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);
    const points = (type && type.attachmentPoints) || structure.attachmentPoints || [];
    return Math.max(points.length, 1);
  }

  function averageAttachmentHeight(project, structure) {
    const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);
    const points = (type && type.attachmentPoints) || [];
    if (!points.length) return structure.height;
    const avgOffsetZ = points.reduce((sum, p) => sum + p.offsetZ, 0) / points.length;
    return avgOffsetZ;
  }

  /**
   * Tensión y cargas por unidad de longitud de cada vano, para una
   * hipótesis dada. La tensión horizontal NO se resuelve vano por vano
   * con su propia longitud: los vanos entre dos estructuras de anclaje
   * (Retención/Ángulo — Suspensión y Paso no anclan, ver
   * stationing.isAnchorStructure) forman una sección de tensionamiento
   * que comparte una sola tensión, calculada con el vano regulador de esa
   * sección (stationing.tensionSectionRulingSpans). El vano REAL de cada
   * uno (span.length) sigue siendo el suyo propio — se usa tal cual para
   * dibujar la curva/flecha de cada vano, solo la tensión es compartida.
   */
  function computeSpanTensions(project, hypothesisId) {
    const hypothesis = project.hypotheses.find((h) => h.id === hypothesisId);
    const referenceHypothesis = getReferenceHypothesis(project);
    const resolved = stationing.resolveStructures(project.alignment.vertices, project.structures, project.alignment.terrainProfile);
    const { sorted, spans } = stationing.computeSpans(resolved);

    const spanLengths = spans.map((s) => s.length);
    const rulingSpans = stationing.tensionSectionRulingSpans(
      sorted,
      spanLengths,
      (s) => stationing.isAnchorStructure(s, project.structureCatalog)
    );

    const results = spans.map((span, i) => {
      const tension = catenary.computeSpanTension(
        project.conductor,
        referenceHypothesis,
        hypothesis,
        rulingSpans[i],
        project.stringingTensions
      );
      return { ...span, ...tension };
    });

    return { sorted, spans: results, hypothesis, referenceHypothesis };
  }

  function unitVector(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  /** Árbol de cargas completo: por estructura, por hipótesis. */
  function computeLoadTree(project) {
    const rows = [];

    project.hypotheses.forEach((hypothesis) => {
      const { sorted, spans } = computeSpanTensions(project, hypothesis.id);

      sorted.forEach((structure, index) => {
        const prevSpan = index > 0 ? spans[index - 1] : null;
        const nextSpan = index < spans.length ? spans[index] : null;
        const prevStructure = index > 0 ? sorted[index - 1] : null;
        const nextStructure = index < sorted.length - 1 ? sorted[index + 1] : null;

        const phases = attachmentCount(project, structure);

        let vertical = 0;
        let windTransversal = 0;
        let tensionVector = { x: 0, y: 0 };

        if (prevSpan) {
          vertical += prevSpan.verticalUnitWeight * (prevSpan.length / 2);
          windTransversal += prevSpan.windUnitLoad * (prevSpan.length / 2);
          const dir = unitVector(structure, prevStructure);
          tensionVector.x += dir.x * prevSpan.horizontalTension;
          tensionVector.y += dir.y * prevSpan.horizontalTension;
        }
        if (nextSpan) {
          vertical += nextSpan.verticalUnitWeight * (nextSpan.length / 2);
          windTransversal += nextSpan.windUnitLoad * (nextSpan.length / 2);
          const dir = unitVector(structure, nextStructure);
          tensionVector.x += dir.x * nextSpan.horizontalTension;
          tensionVector.y += dir.y * nextSpan.horizontalTension;
        }

        vertical *= phases;
        windTransversal *= phases;
        tensionVector = { x: tensionVector.x * phases, y: tensionVector.y * phases };

        const lineRef = nextStructure || prevStructure || structure;
        const lineFrom = prevStructure || structure;
        const longAxis = unitVector(lineFrom, lineRef);
        const transAxis = { x: -longAxis.y, y: longAxis.x };

        const longitudinal = Math.abs(tensionVector.x * longAxis.x + tensionVector.y * longAxis.y);
        const transversalFromTension = tensionVector.x * transAxis.x + tensionVector.y * transAxis.y;
        const transversal = Math.abs(transversalFromTension) + windTransversal;

        const attachHeight = averageAttachmentHeight(project, structure) || structure.height;
        const momentEstimate = vertical * attachHeight;

        rows.push({
          structureId: structure.id,
          hypothesisId: hypothesis.id,
          forces: {
            vertical,
            transversal,
            longitudinal
          },
          momentEstimate
        });
      });
    });

    return rows;
  }

  const loadTree = { computeSpanTensions, computeLoadTree, getReferenceHypothesis };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = loadTree;
  }
  global.LineDesignLoadTree = loadTree;
})(typeof window !== 'undefined' ? window : globalThis);
