/**
 * profileView.js — Vista en Perfil: terreno, estructuras y catenaria del
 * conductor por vano, para la hipótesis de carga seleccionada. Con zoom
 * (rueda), pan (arrastrar fondo), arrastre de estructuras (reubica su
 * station, con reflejo en vivo en Planta) y marcador de sincronización con
 * Planta.
 *
 * Ver comentario equivalente en planView.js: los listeners a nivel <svg>
 * (wheel, hover) se registran una sola vez al crear la vista, no en cada
 * render().
 */
(function (global) {
  const { svgEl, clear, toSvgPoint, buildRulerGrid } = global.LineDesignSvgUtil;
  const stationing = global.LineDesignStationing;
  const catenary = global.LineDesignCatenary;
  const loadTree = global.LineDesignLoadTree;
  const { createViewport } = global.LineDesignViewport;

  const PADDING = 40;
  const MIN_SIZE = 200;

  function pathFromPoints(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  function createProfileView(svg, callbacks) {
    const viewport = createViewport();
    const current = { projector: null, zoomLayer: null, height: 0, vExaggeration: 1, markers: [], showSag: true, showClearance: false };

    // Marcadores (círculos de poste, sus etiquetas y las de "flecha"): viven
    // dentro de zoomLayer para que su posición pan/zoquee junto con el resto
    // del dibujo, pero cada uno lleva su propia escala inversa (1/scale)
    // para que su tamaño en pantalla (incl. el font-size de las etiquetas)
    // se mantenga constante — si no, al hacer zoom-in crecerían igual que el
    // resto de la geometría (mismo motivo que vector-effect en los trazos,
    // pero eso no aplica al radio de un <circle> ni al tamaño de <text>).
    function updateMarkers() {
      const inv = 1 / viewport.state.scale;
      current.markers.forEach((m) => {
        m.el.setAttribute('transform', `translate(${m.x} ${m.y}) scale(${inv})`);
      });
    }

    const pan = viewport.attach(svg, {
      onChange: () => {
        if (current.zoomLayer) current.zoomLayer.setAttribute('transform', viewport.transformAttr());
        updateMarkers();
        callbacks.onZoomChange(viewport.state.scale);
      },
      onBackgroundClick: () => callbacks.onDeselect()
    });

    svg.addEventListener('pointermove', (evt) => {
      if (!current.projector) return;
      const svgPoint = toSvgPoint(svg, evt.clientX, evt.clientY);
      const unzoomed = viewport.toUnzoomed(svgPoint);
      const dataPoint = current.projector.toData(unzoomed.x, unzoomed.y);
      // La elevación mostrada es la del PERFIL en esa station (proyección
      // vertical del cursor sobre el terreno), no la altura cruda a la que
      // esté apuntando el mouse — que es lo que devolvía dataPoint.y antes
      // (dependía de dónde el usuario tuviera la mano en pantalla, no del
      // terreno real).
      const elevation = current.terrainProfile
        ? stationing.elevationAtStation(current.terrainProfile, dataPoint.x)
        : stationing.pointAtStation(current.vertices, dataPoint.x).z;
      callbacks.onHover({ station: dataPoint.x, elevation });
    });
    svg.addEventListener('pointerleave', () => callbacks.onHover(null));

    function zoomBy(factor) {
      const rect = svg.getBoundingClientRect();
      viewport.zoomAt({ x: rect.width / 2, y: rect.height / 2 }, factor);
      current.zoomLayer && current.zoomLayer.setAttribute('transform', viewport.transformAttr());
      updateMarkers();
      callbacks.onZoomChange(viewport.state.scale);
    }

    function resetZoom() {
      viewport.reset();
      current.zoomLayer && current.zoomLayer.setAttribute('transform', viewport.transformAttr());
      updateMarkers();
      callbacks.onZoomChange(viewport.state.scale);
    }

    function showSyncMarker(station) {
      if (!current.projector || !current.syncMarker) return;
      const x = current.projector.toScreen(station, 0).x;
      current.syncMarker.setAttribute('x1', x);
      current.syncMarker.setAttribute('x2', x);
      current.syncMarker.classList.add('is-visible');
    }

    function hideSyncMarker() {
      if (current.syncMarker) current.syncMarker.classList.remove('is-visible');
    }

    function render(project, hypothesisId, selection) {
      clear(svg);
      current.markers = [];
      const rect = svg.getBoundingClientRect();
      const WIDTH = Math.max(Math.round(rect.width), MIN_SIZE);
      const HEIGHT = Math.max(Math.round(rect.height), MIN_SIZE);
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
      current.height = HEIGHT;

      const vertices = project.alignment.vertices;
      const distances = stationing.cumulativeDistances(vertices);
      const terrainProfile = project.alignment.terrainProfile;
      current.vertices = vertices;
      current.terrainProfile = terrainProfile;
      const resolved = stationing.resolveStructures(vertices, project.structures, terrainProfile)
        .sort((a, b) => a.station - b.station);
      const groundClearance = project.groundClearance || 0;
      // `bounds` (sin extender) se conserva para el clamp de arrastre de
      // estructuras más abajo — station nunca puede ser negativa ni pasar
      // el largo total del alineamiento. `viewBounds` es lo que realmente
      // ve el proyector/la regla: un paso más allá en cada dirección,
      // salvo hacia atrás en X (padMinX: false — el eje de estación
      // siempre arranca en 0, no tiene sentido extenderlo a negativos).
      const bounds = stationing.profileBounds(vertices, resolved, terrainProfile, groundClearance);
      const viewBounds = stationing.padBoundsByStep(bounds, { padMinX: false });
      const projector = stationing.makeProjector(viewBounds, WIDTH, HEIGHT, PADDING, current.vExaggeration);
      current.projector = projector;

      const background = svgEl('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'canvas-background' });
      background.addEventListener('pointerdown', pan.startPan);
      svg.appendChild(background);

      const zoomLayer = svgEl('g', { transform: viewport.transformAttr() });
      svg.appendChild(zoomLayer);
      current.zoomLayer = zoomLayer;

      zoomLayer.appendChild(buildRulerGrid({ svgEl, niceStep: stationing.niceStep, projector, bounds: viewBounds, dataBounds: bounds, padding: PADDING }));

      // Con terreno real consultado (Fase 2, botón "Ajustar al terreno
      // real"), se dibuja el perfil denso en vez de la interpolación lineal
      // entre vértices — más fiel al terreno, incl. picos/valles entre PIs.
      const terrainPoints = terrainProfile
        ? terrainProfile.map((p) => projector.toScreen(p.station, p.elevation))
        : vertices.map((v, i) => projector.toScreen(distances[i], v.z));
      zoomLayer.appendChild(svgEl('path', {
        class: `profile-line${terrainProfile ? ' profile-line--real' : ''}`,
        d: pathFromPoints(terrainPoints)
      }));

      // Línea de distancia de seguridad al terreno (Parámetros de entrada
      // § Terreno): misma forma que el terreno, desplazada `groundClearance`
      // metros hacia arriba (en espacio de datos, antes de proyectar, para
      // que respete la exageración vertical igual que el resto del perfil).
      if (groundClearance > 0) {
        const clearancePoints = terrainProfile
          ? terrainProfile.map((p) => projector.toScreen(p.station, p.elevation + groundClearance))
          : vertices.map((v, i) => projector.toScreen(distances[i], v.z + groundClearance));
        zoomLayer.appendChild(svgEl('path', {
          class: 'clearance-line',
          d: pathFromPoints(clearancePoints)
        }));
      }

      const hypothesis = project.hypotheses.find((h) => h.id === hypothesisId) || project.hypotheses[0];

      // Los vanos entre dos estructuras de anclaje (Retención/Ángulo) forman
      // una sección de tensionamiento que comparte una sola tensión (con el
      // vano regulador de la sección, no la longitud real de cada vano
      // individual — esa se sigue usando tal cual para dibujar la
      // curva/flecha de cada uno) y puede tener su propio conductor
      // asignado (project.sectionConductors) — ver loadTree.js para el
      // mismo criterio aplicado al árbol de cargas / Tabla de estructuras.
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
          span: spanLength,
          heightDiff: toTop - fromTop,
          H: tension.horizontalTension,
          unitWeight: tension.verticalUnitWeight
        });

        const screenPoints = curve.points.map((p) => projector.toScreen(from.station + p.x, fromTop + p.y));

        // Un clic sobre CUALQUIER vano de la sección selecciona la sección
        // COMPLETA (todos sus vanos se resaltan juntos) — así se puede
        // cambiar el conductor de toda la sección de tensionamiento de una
        // vez desde Propiedades, no vano por vano.
        const isSectionSelected = selection && selection.type === 'section'
          && selection.fromId === section.fromId && selection.toId === section.toId;
        const pathD = pathFromPoints(screenPoints);

        // Área de clic invisible (más ancha que el trazo visible, que es
        // delgado y difícil de acertar): mismo trazado, sin color, encima
        // de la línea real. Ambas comparten el mismo listener.
        const conductorHit = svgEl('path', { class: 'conductor-hit', d: pathD });
        const conductorLine = svgEl('path', {
          class: `conductor-line${isSectionSelected ? ' is-selected' : ''}`,
          d: pathD
        });
        conductorHit.addEventListener('pointerdown', (evt) => {
          evt.stopPropagation();
          callbacks.onSelect({ type: 'section', fromId: section.fromId, toId: section.toId });
        });
        zoomLayer.appendChild(conductorLine);
        zoomLayer.appendChild(conductorHit);

        const midScreen = projector.toScreen(from.station + spanLength / 2, Math.min(fromTop, toTop));
        const sagMarker = svgEl('g', { class: 'sag-marker' });
        const sagLabel = svgEl('text', { class: 'sag-label', x: 0, y: 16 });
        sagLabel.textContent = `${curve.sag.toFixed(2)} m`;
        if (!current.showSag) sagLabel.style.display = 'none';
        sagMarker.appendChild(sagLabel);

        // Distancia mínima real del conductor al terreno dentro del vano
        // (no la distancia de seguridad configurada — esa es la línea
        // punteada; esto es lo que realmente hay). Mismo cálculo que la
        // columna "Distancia mínima al piso" de la Tabla de estructuras
        // (Resumen) — ver app.js#renderStructuresTable.
        const minClearance = curve.points.reduce((min, p) => {
          const station = from.station + p.x;
          const terrainZ = terrainProfile
            ? stationing.elevationAtStation(terrainProfile, station)
            : stationing.pointAtStation(vertices, station).z;
          return Math.min(min, (fromTop + p.y) - terrainZ);
        }, Infinity);
        const clearanceLabel = svgEl('text', { class: 'clearance-label', x: 0, y: 32 });
        clearanceLabel.textContent = `${minClearance.toFixed(2)} m`;
        if (!current.showClearance) clearanceLabel.style.display = 'none';
        sagMarker.appendChild(clearanceLabel);

        zoomLayer.appendChild(sagMarker);
        current.markers.push({ el: sagMarker, x: midScreen.x, y: midScreen.y });
      }

      // Arrastre horizontal de estructuras (mueve su station a lo largo del
      // alineamiento): a diferencia del arrastre en Planta/vértices, aquí no
      // se parcha el DOM localmente porque mover una estructura cambia la
      // forma de la catenaria de sus dos vanos adyacentes — se reusa esta
      // misma render() con un proyecto borrador en cada pointermove (project,
      // hypothesisId y selection quedan fijos, capturados del cierre de esta
      // llamada). El eje X del perfil ES la station acumulada, así que la
      // conversión pantalla->dato ya da directamente el valor a usar.
      function attachStructureDrag(pole, structureId) {
        pole.addEventListener('pointerdown', (evt) => {
          evt.stopPropagation();
          svg.setPointerCapture(evt.pointerId);
          let lastStation = project.structures.find((s) => s.id === structureId).station;

          function onMove(moveEvt) {
            const svgPoint = toSvgPoint(svg, moveEvt.clientX, moveEvt.clientY);
            const unzoomed = viewport.toUnzoomed(svgPoint);
            const dataPoint = current.projector.toData(unzoomed.x, unzoomed.y);
            lastStation = Math.min(Math.max(dataPoint.x, bounds.minX), bounds.maxX);
            if (callbacks.onStructureDragMove) callbacks.onStructureDragMove(structureId, lastStation);
            const draftProject = {
              ...project,
              structures: project.structures.map((s) => (s.id === structureId ? { ...s, station: lastStation } : s))
            };
            render(draftProject, hypothesisId, selection);
          }

          function onUp() {
            svg.removeEventListener('pointermove', onMove);
            svg.removeEventListener('pointerup', onUp);
            callbacks.onSelect({ type: 'structure', id: structureId });
            if (callbacks.onCommitStructureMove) callbacks.onCommitStructureMove(structureId, lastStation);
          }

          svg.addEventListener('pointermove', onMove);
          svg.addEventListener('pointerup', onUp);
        });
      }

      resolved.forEach((structure) => {
        const baseScreen = projector.toScreen(structure.station, structure.z);
        const topScreen = projector.toScreen(structure.station, structure.z + structure.height);
        const isSelected = selection && selection.type === 'structure' && selection.id === structure.id;

        const pole = svgEl('line', {
          class: `structure-pole${isSelected ? ' is-selected' : ''}`,
          x1: baseScreen.x, y1: baseScreen.y, x2: topScreen.x, y2: topScreen.y, 'data-id': structure.id
        });
        zoomLayer.appendChild(pole);
        attachStructureDrag(pole, structure.id);
        const marker = svgEl('g');
        const label = svgEl('text', { class: 'annotation-label', x: 8, y: -8 });
        label.textContent = structure.id;
        marker.appendChild(label);
        zoomLayer.appendChild(marker);
        current.markers.push({ el: marker, x: topScreen.x, y: topScreen.y });
      });

      const syncMarker = svgEl('line', { class: 'sync-marker sync-marker--line', x1: -9999, y1: 0, x2: -9999, y2: HEIGHT });
      zoomLayer.appendChild(syncMarker);
      current.syncMarker = syncMarker;

      updateMarkers();
      callbacks.onZoomChange(viewport.state.scale);
    }

    function setVerticalExaggeration(factor) {
      current.vExaggeration = factor;
    }

    function getVerticalExaggeration() {
      return current.vExaggeration;
    }

    // Alterna solo la visibilidad de las etiquetas ya dibujadas (sin
    // re-render completo, para que responda al instante); el estado queda
    // en current.showSag/showClearance para que los vanos que se dibujen
    // después (nuevo render, p. ej. al cambiar de hipótesis) también
    // respeten la elección. Cada etiqueta se oculta por separado (no todo
    // el .sag-marker) para que flecha y distancia al terreno se puedan
    // mostrar/ocultar de forma independiente, aunque compartan posición.
    function setSagLabelsVisible(visible) {
      current.showSag = visible;
      svg.querySelectorAll('.sag-label').forEach((el) => {
        el.style.display = visible ? '' : 'none';
      });
    }

    function getSagLabelsVisible() {
      return current.showSag;
    }

    function setClearanceLabelsVisible(visible) {
      current.showClearance = visible;
      svg.querySelectorAll('.clearance-label').forEach((el) => {
        el.style.display = visible ? '' : 'none';
      });
    }

    function getClearanceLabelsVisible() {
      return current.showClearance;
    }

    return {
      render, zoomBy, resetZoom, showSyncMarker, hideSyncMarker,
      setClearanceLabelsVisible, getClearanceLabelsVisible,
      setVerticalExaggeration, getVerticalExaggeration,
      setSagLabelsVisible, getSagLabelsVisible
    };
  }

  global.LineDesignProfileView = { createProfileView };
})(typeof window !== 'undefined' ? window : globalThis);
