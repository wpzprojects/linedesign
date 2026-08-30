/**
 * loadTree.js — Árbol de cargas por estructura.
 *
 * Para cada estructura y cada hipótesis de carga se calcula (en N/N·m, SI —
 * son resultados de cálculo, no campos guardados; loadTreeView.js los
 * convierte a kgF/kgF·m tanto en la tabla en pantalla como en el JSON que
 * exporta):
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
 *
 * checkPoleCapacity(project) (más abajo) valida, aparte, si el poste (y su
 * contraviento, si tiene) resisten estas cargas — ver su propio docstring.
 */
(function (global) {
  const stationing = global.LineDesignStationing;
  const catenary = global.LineDesignCatenary;
  const units = global.LineDesignUnits;

  function getReferenceHypothesis(project) {
    const refId = project.conductor.referenceHypothesisId;
    return project.hypotheses.find((h) => h.id === refId) || project.hypotheses[0];
  }

  /**
   * Conductor efectivo de una sección de tensionamiento: por defecto el
   * del proyecto (`project.conductor`), salvo que la sección (identificada
   * por las estructuras de anclaje que la delimitan) tenga su propio
   * conductor asignado en `project.sectionConductors` — p. ej. un salto o
   * derivación con un conductor distinto al resto de la línea.
   */
  function resolveSectionConductor(project, fromId, toId) {
    const override = (project.sectionConductors || []).find((s) => s.fromId === fromId && s.toId === toId);
    if (!override) return project.conductor;
    return project.conductorCatalog.find((c) => c.id === override.conductorId) || project.conductor;
  }

  function referenceHypothesisFor(project, conductor) {
    return project.hypotheses.find((h) => h.id === conductor.referenceHypothesisId) || project.hypotheses[0];
  }

  function attachmentCount(project, structure) {
    const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);
    const points = (type && type.attachmentPoints) || structure.attachmentPoints || [];
    return Math.max(points.length, 1);
  }

  /**
   * Profundidad de empotramiento/enterramiento (m) de un poste, criterio
   * estándar de postes de distribución/transmisión: 10% de la altura
   * total (de catálogo) + 0.6 m.
   */
  function embedmentDepth(totalHeight) {
    return totalHeight * 0.1 + 0.6;
  }

  /**
   * Altura libre sobre el terreno de una estructura: por defecto,
   * structure.height completo (mismo comportamiento histórico de la app —
   * se asume todo el poste del catálogo libre sobre el piso). Si el tipo
   * tiene "considerEmbedment" activado (Catálogo de estructuras), se le
   * resta la profundidad de empotramiento — esa parte queda bajo tierra,
   * no disponible como altura libre. Todo lo que en el resto de la app
   * representa "la punta real del poste visible" (dónde cuelga el
   * conductor, dónde termina el trazo en Perfil/DXF, el brazo de palanca
   * de "Cumple poste") debe usar ESTA función, no structure.height directo.
   */
  function structureAboveGroundHeight(project, structure) {
    const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);
    if (!type || !type.considerEmbedment) return structure.height;
    return Math.max(structure.height - embedmentDepth(structure.height), 0);
  }

  /**
   * `attachmentPoints[].offsetZ` se referencia desde la PUNTA del poste
   * hacia abajo (0 = en la punta), no desde el piso — así el punto de
   * fijación sigue siendo válido sin importar cuál de las heightOptions
   * del catálogo se elija para una estructura en particular (si se
   * referenciara desde el piso, cambiar la altura del poste dejaría el
   * offset apuntando a un punto distinto en la realidad). La altura real
   * sobre el piso, para el cálculo de momento, es la altura libre
   * (structureAboveGroundHeight, que ya descuenta el empotramiento si
   * aplica) menos ese offset — ver catalogView.js para el editor/esquema.
   */
  function averageAttachmentHeight(project, structure) {
    const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);
    const points = (type && type.attachmentPoints) || [];
    const tipHeight = structureAboveGroundHeight(project, structure);
    if (!points.length) return tipHeight;
    const avgOffsetZ = points.reduce((sum, p) => sum + p.offsetZ, 0) / points.length;
    return Math.max(tipHeight - avgOffsetZ, 0);
  }

  /**
   * Tensión y cargas por unidad de longitud de cada vano, para una
   * hipótesis dada. La tensión horizontal NO se resuelve vano por vano
   * con su propia longitud: los vanos entre dos estructuras de anclaje
   * (Retención/Ángulo — Suspensión y Paso no anclan, ver
   * stationing.isAnchorStructure) forman una sección de tensionamiento
   * que comparte una sola tensión, calculada con el vano regulador de esa
   * sección. El vano REAL de cada uno (span.length) sigue siendo el suyo
   * propio — se usa tal cual para dibujar la curva/flecha de cada vano,
   * solo la tensión es compartida. Cada sección puede tener su propio
   * conductor (`resolveSectionConductor`) y por lo tanto su propia
   * hipótesis de referencia — no se asume la del conductor del proyecto
   * para todas las secciones.
   */
  function computeSpanTensions(project, hypothesisId) {
    const hypothesis = project.hypotheses.find((h) => h.id === hypothesisId);
    const resolved = stationing.resolveStructures(project.alignment.vertices, project.structures, project.alignment.terrainProfile);
    const { sorted, spans } = stationing.computeSpans(resolved);

    const spanLengths = spans.map((s) => s.length);
    const sections = stationing.computeTensionSections(
      sorted,
      spanLengths,
      (s) => stationing.isAnchorStructure(s, project.structureCatalog)
    );

    const results = spans.map((span, i) => {
      const section = sections.find((sec) => i >= sec.spanFromIndex && i <= sec.spanToIndex);
      const conductor = resolveSectionConductor(project, section.fromId, section.toId);
      const tension = catenary.computeSpanTension(
        conductor,
        referenceHypothesisFor(project, conductor),
        hypothesis,
        section.rulingSpan,
        project.stringingTensions
      );
      return { ...span, ...tension, conductorId: conductor.id, sectionFromId: section.fromId, sectionToId: section.toId };
    });

    return { sorted, spans: results, hypothesis, referenceHypothesis: getReferenceHypothesis(project) };
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

        // Eje "longitudinal" local en esta estructura: la cuerda entre su
        // vecino anterior y el siguiente (aproxima el bisector del ángulo
        // ahí) — en un extremo del alineamiento, sin uno de los dos
        // vecinos, se usa la propia estructura como ese extremo faltante,
        // NUNCA reutilizar el mismo vecino en lineFrom y lineRef (daría un
        // vector (0,0) y anularía longitudinal/transversal-por-tensión
        // justo donde la tensión del único vano está más desbalanceada).
        const lineFrom = prevStructure || structure;
        const lineRef = nextStructure || structure;
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
          momentEstimate,
          attachHeight,
          // Para checkPoleCapacity: windTransversal aislado del desequilibrio
          // de tensión (transversal ya lo mezcla), y la tensión horizontal de
          // cada vano adyacente por separado (ya multiplicada por `phases`,
          // igual que el resto de fuerzas de esta fila) — un contraviento en
          // una estructura de Retención ancla cada vano por su cuenta, no la
          // resultante combinada.
          windTransversal,
          tensionPrevN: prevSpan ? prevSpan.horizontalTension * phases : null,
          tensionNextN: nextSpan ? nextSpan.horizontalTension * phases : null
        });
      });
    });

    return rows;
  }

  // 20 cm: convención de fabricante/norma (RETIE/NTC) para la carga de
  // ensayo de rotura de un poste — se aplica cerca de la punta, no en la
  // punta misma.
  const RESISTANCE_TEST_OFFSET_FROM_TIP = 0.2;

  /**
   * Validación "Cumple poste" y "Cumple contraviento" — ver también
   * DATA_MODEL.md. Para cada estructura evalúa, bajo TODAS las hipótesis
   * climáticas (se toma la peor, no solo la de referencia):
   *
   * POSTE: compara el momento flector en la base (línea de terreno) contra
   * el momento admisible del poste, si tiene `resistance` (kgF, resistencia
   * ÚLTIMA a rotura, ensayada a 20 cm de la punta) asignada. Como el poste
   * es de sección circular (sin eje débil/fuerte), la demanda SIN
   * contraviento es la resultante de las fuerzas horizontales (transversal
   * + longitudinal) aplicada a la altura promedio de enganche.
   *
   * Capacidad del poste: `resistance × (height − 0.20)` (momento último en
   * la base) dividido entre `project.poleSafetyFactor`.
   *
   * CONTRAVIENTO (solo estructuras Retención/Ángulo con `structure.hasGuy`):
   * el contraviento se instala en la dirección que absorbe el desequilibrio
   * de tensión del conductor — dos contravientos independientes, uno
   * opuesto a cada vano adyacente, en Retención (cada uno cancela por
   * completo la tensión de SU vano, sin importar el ángulo entre vanos); un
   * único contraviento opuesto a la resultante de tensión, en Ángulo. En
   * ambos casos, simplificación de Fase 1: el contraviento cancela POR
   * COMPLETO la componente de la demanda inducida por el desequilibrio de
   * tensión del conductor (se asume orientado exactamente para eso) — la
   * demanda residual sobre el poste queda entonces limitada al viento
   * (`windTransversal`), que el contraviento no resiste al no estar
   * orientado para ello.
   *
   * La tracción que debe resistir el contraviento (kgF) se obtiene
   * proyectando esa fuerza resistida sobre `guyAnchorAngle` (ángulo del
   * cable respecto a la VERTICAL del poste, en grados — no depende de la
   * altura del anclaje, solo del ángulo): `tensión_cable =
   * fuerza_horizontal_resistida / sen(ángulo)`, comparada contra
   * `structure.guyResistance / project.guySafetyFactor`. `guyAnchorHeight`
   * (distancia desde la PUNTA del poste al punto de enganche — mismo
   * criterio que attachmentPoints[].offsetZ) es solo informativo/geometría
   * real de referencia, no entra en este cálculo simplificado.
   *
   * LIMITACIÓN CONOCIDA (Fase 1, pendiente — ver IDEAS_FUTURAS.md): al no
   * usar `guyAnchorHeight` en el cálculo, el modelo asume implícitamente que
   * el contraviento está enganchado a la misma altura que el conductor, de
   * modo que cancela el desequilibrio de tensión en todo el tramo del poste
   * por encima del anclaje. Si en la instalación real el contraviento queda
   * enganchado más abajo que el punto de amarre del conductor, el segmento
   * de poste entre ambos puntos sigue sometido a un momento flector no
   * cancelado por el contraviento, que hoy no se verifica. El campo de
   * altura de enganche se deja bloqueado en la UI mientras esto no se
   * implemente, precisamente para no sugerir una precisión que el cálculo
   * todavía no ofrece.
   *
   * Devuelve `structureId -> { pole, guy }`:
   *   pole.status: 'ok' | 'fail' | 'undefined' (sin `resistance` asignada)
   *   guy.status: 'ok' | 'fail' | 'undefined' (sin resistencia/geometría) |
   *               'none' (hasGuy=false) | 'not-applicable' (Suspensión/Paso)
   */
  function checkPoleCapacity(project) {
    const rows = computeLoadTree(project);
    const structuresById = new Map(project.structures.map((s) => [s.id, s]));
    const typesById = new Map(project.structureCatalog.map((t) => [t.typeId, t]));
    const poleSafetyFactor = project.poleSafetyFactor || 1;
    const guySafetyFactor = project.guySafetyFactor || 1;

    function isGuyableType(type) {
      return !!type && (type.type === 'Retención' || type.type === 'Ángulo');
    }

    const worstPoleByStructure = new Map();
    const worstGuyByStructure = new Map();

    rows.forEach((row) => {
      const structure = structuresById.get(row.structureId);
      if (!structure) return;
      const type = typesById.get(structure.typeId);
      const isGuyed = structure.hasGuy && isGuyableType(type);

      const poleDemandN = isGuyed
        ? row.windTransversal
        : Math.hypot(row.forces.transversal, row.forces.longitudinal);
      const poleDemandKgfm = units.newtonsToKgf(poleDemandN) * row.attachHeight;
      const prevPole = worstPoleByStructure.get(row.structureId);
      if (!prevPole || poleDemandKgfm > prevPole.momentDemandKgfm) {
        worstPoleByStructure.set(row.structureId, { momentDemandKgfm: poleDemandKgfm, hypothesisId: row.hypothesisId });
      }

      if (isGuyed) {
        let guyForceN;
        if (type.type === 'Retención') {
          guyForceN = Math.max(row.tensionPrevN || 0, row.tensionNextN || 0);
        } else {
          const transversalFromTensionN = row.forces.transversal - row.windTransversal;
          guyForceN = Math.hypot(row.forces.longitudinal, transversalFromTensionN);
        }
        const guyForceKgf = units.newtonsToKgf(guyForceN);
        const prevGuy = worstGuyByStructure.get(row.structureId);
        if (!prevGuy || guyForceKgf > prevGuy.forceKgf) {
          worstGuyByStructure.set(row.structureId, { forceKgf: guyForceKgf, hypothesisId: row.hypothesisId });
        }
      }
    });

    const result = {};
    project.structures.forEach((structure) => {
      const type = typesById.get(structure.typeId);
      const worstPole = worstPoleByStructure.get(structure.id);

      let pole;
      if (structure.resistance == null || !worstPole) {
        pole = { status: 'undefined' };
      } else {
        const lever = Math.max(structureAboveGroundHeight(project, structure) - RESISTANCE_TEST_OFFSET_FROM_TIP, 0);
        const capacityKgfm = (structure.resistance * lever) / poleSafetyFactor;
        const ratio = capacityKgfm > 0 ? worstPole.momentDemandKgfm / capacityKgfm : Infinity;
        pole = {
          status: ratio <= 1 ? 'ok' : 'fail',
          ratio,
          momentDemandKgfm: worstPole.momentDemandKgfm,
          capacityKgfm,
          governingHypothesisId: worstPole.hypothesisId
        };
      }

      let guy;
      if (!isGuyableType(type)) {
        guy = { status: 'not-applicable' };
      } else if (!structure.hasGuy) {
        guy = { status: 'none' };
      } else {
        const worstGuy = worstGuyByStructure.get(structure.id);
        const { guyResistance, guyAnchorAngle } = structure;
        if (guyResistance == null || !guyAnchorAngle || !worstGuy) {
          guy = { status: 'undefined' };
        } else {
          const tensionKgf = worstGuy.forceKgf / Math.sin(guyAnchorAngle * Math.PI / 180);
          const capacityKgf = guyResistance / guySafetyFactor;
          const ratio = capacityKgf > 0 ? tensionKgf / capacityKgf : Infinity;
          guy = {
            status: ratio <= 1 ? 'ok' : 'fail',
            ratio,
            tensionKgf,
            capacityKgf,
            governingHypothesisId: worstGuy.hypothesisId
          };
        }
      }

      result[structure.id] = { pole, guy };
    });
    return result;
  }

  const loadTree = {
    computeSpanTensions, computeLoadTree, checkPoleCapacity, getReferenceHypothesis, resolveSectionConductor,
    averageAttachmentHeight, structureAboveGroundHeight
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = loadTree;
  }
  global.LineDesignLoadTree = loadTree;
})(typeof window !== 'undefined' ? window : globalThis);
