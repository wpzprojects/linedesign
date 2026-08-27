/**
 * planView.js — Vista en Planta: alineamiento + estructuras, con arrastre,
 * zoom (rueda) y pan (arrastrar el fondo). Reporta la posición del cursor y
 * el nivel de zoom para que app.js los muestre en la barra de estado.
 *
 * Estrategia de arrastre de vértices/estructuras: durante el drag se
 * redibuja localmente (sin tocar el store) usando el proyector vigente
 * (`current.projector`, fijo mientras dura el gesto), para que el trazo no
 * salte al recalcular límites en cada frame. El cambio se confirma al store
 * (dispara el re-render completo, incl. el perfil) recién al soltar el
 * puntero.
 *
 * Los listeners a nivel <svg> (wheel para zoom, pointermove/leave para el
 * hover de coordenadas) se registran UNA SOLA VEZ al crear la vista, no en
 * cada render() — <svg> es el único nodo que persiste entre renders
 * (render() limpia y reconstruye sus hijos en cada llamada). Registrarlos
 * dentro de render() los iría acumulando en cada re-render.
 */
(function (global) {
  const { svgEl, clear, toSvgPoint, buildRulerGrid } = global.LineDesignSvgUtil;
  const stationing = global.LineDesignStationing;
  const { createViewport } = global.LineDesignViewport;

  const PADDING = 40;
  const MIN_SIZE = 200;

  function pathFromPoints(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  function createPlanView(svg, callbacks) {
    const viewport = createViewport();
    // Referencias mutables al render vigente, para que los listeners
    // registrados una sola vez (wheel, hover) siempre operen sobre el
    // proyector/zoomLayer actuales y no sobre los de un render anterior.
    const current = { project: null, selection: null, projector: null, zoomLayer: null };

    const pan = viewport.attach(svg, {
      onChange: () => {
        if (current.zoomLayer) current.zoomLayer.setAttribute('transform', viewport.transformAttr());
        callbacks.onZoomChange(viewport.state.scale);
      },
      onBackgroundClick: () => callbacks.onDeselect()
    });

    svg.addEventListener('pointermove', (evt) => {
      if (!current.projector) return;
      const svgPoint = toSvgPoint(svg, evt.clientX, evt.clientY);
      const unzoomed = viewport.toUnzoomed(svgPoint);
      const dataPoint = current.projector.toData(unzoomed.x, unzoomed.y);
      callbacks.onHover({ x: dataPoint.x, y: dataPoint.y });
    });
    svg.addEventListener('pointerleave', () => callbacks.onHover(null));

    function zoomBy(factor) {
      const rect = svg.getBoundingClientRect();
      viewport.zoomAt({ x: rect.width / 2, y: rect.height / 2 }, factor);
      current.zoomLayer && current.zoomLayer.setAttribute('transform', viewport.transformAttr());
      callbacks.onZoomChange(viewport.state.scale);
    }

    function resetZoom() {
      viewport.reset();
      current.zoomLayer && current.zoomLayer.setAttribute('transform', viewport.transformAttr());
      callbacks.onZoomChange(viewport.state.scale);
    }

    function showSyncMarker(station) {
      if (!current.projector || !current.vertices || !current.syncMarker) return;
      const pos = stationing.pointAtStation(current.vertices, station);
      const p = current.projector.toScreen(pos.x, pos.y);
      current.syncMarker.setAttribute('cx', p.x);
      current.syncMarker.setAttribute('cy', p.y);
      current.syncMarker.classList.add('is-visible');
    }

    function hideSyncMarker() {
      if (current.syncMarker) current.syncMarker.classList.remove('is-visible');
    }

    function render(project, selection) {
      current.project = project;
      current.selection = selection;
      clear(svg);

      // El viewBox se ajusta al tamaño real renderizado del <svg> (que llena
      // el panel vía flexbox) para que el lienzo aproveche todo el espacio
      // disponible en vez de quedar recortado a una relación de aspecto fija.
      const rect = svg.getBoundingClientRect();
      const WIDTH = Math.max(Math.round(rect.width), MIN_SIZE);
      const HEIGHT = Math.max(Math.round(rect.height), MIN_SIZE);
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);

      const vertices = project.alignment.vertices;
      current.vertices = vertices;
      const bounds = stationing.planBounds(vertices);
      const projector = stationing.makeProjector(bounds, WIDTH, HEIGHT, PADDING);
      current.projector = projector;

      // Fondo NO transformado (fuera de la capa de zoom): así el pan se
      // puede iniciar arrastrando en cualquier parte visible del lienzo.
      const background = svgEl('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'canvas-background' });
      background.addEventListener('pointerdown', pan.startPan);
      svg.appendChild(background);

      const zoomLayer = svgEl('g', { transform: viewport.transformAttr() });
      svg.appendChild(zoomLayer);
      current.zoomLayer = zoomLayer;

      zoomLayer.appendChild(buildRulerGrid({ svgEl, niceStep: stationing.niceStep, projector, bounds, height: HEIGHT, padding: PADDING }));

      const alignmentPath = svgEl('path', {
        class: 'alignment-line',
        d: pathFromPoints(vertices.map((v) => projector.toScreen(v.x, v.y)))
      });
      zoomLayer.appendChild(alignmentPath);

      const structureLayer = svgEl('g');
      zoomLayer.appendChild(structureLayer);

      function redrawStructures(vertexList) {
        clear(structureLayer);
        const resolved = stationing.resolveStructures(vertexList, project.structures);
        resolved.forEach((structure) => {
          const p = projector.toScreen(structure.x, structure.y);
          const isSelected = selection && selection.type === 'structure' && selection.id === structure.id;
          const g = svgEl('g');
          g.appendChild(svgEl('circle', {
            class: `structure-point${isSelected ? ' is-selected' : ''}`,
            cx: p.x, cy: p.y, r: 7, 'data-id': structure.id
          }));
          g.appendChild(svgEl('text', { class: 'annotation-label', x: p.x + 10, y: p.y - 10 }, {}));
          g.lastChild.textContent = structure.id;
          structureLayer.appendChild(g);
          attachStructureDrag(g.firstChild, structure.id);
        });
      }

      redrawStructures(vertices);

      function attachVertexDrag(circle, vertexId) {
        circle.addEventListener('pointerdown', (evt) => {
          evt.stopPropagation();
          svg.setPointerCapture(evt.pointerId);
          const draft = vertices.map((v) => ({ ...v }));

          function onMove(moveEvt) {
            const svgPoint = toSvgPoint(svg, moveEvt.clientX, moveEvt.clientY);
            const unzoomed = viewport.toUnzoomed(svgPoint);
            const dataPoint = projector.toData(unzoomed.x, unzoomed.y);
            const draftVertex = draft.find((v) => v.id === vertexId);
            draftVertex.x = dataPoint.x;
            draftVertex.y = dataPoint.y;

            alignmentPath.setAttribute('d', pathFromPoints(draft.map((v) => projector.toScreen(v.x, v.y))));
            circle.setAttribute('cx', projector.toScreen(draftVertex.x, draftVertex.y).x);
            circle.setAttribute('cy', projector.toScreen(draftVertex.x, draftVertex.y).y);
            redrawStructures(draft);
          }

          function onUp() {
            svg.removeEventListener('pointermove', onMove);
            svg.removeEventListener('pointerup', onUp);
            const draftVertex = draft.find((v) => v.id === vertexId);
            callbacks.onSelect({ type: 'vertex', id: vertexId });
            callbacks.onCommitVertexMove(vertexId, draftVertex.x, draftVertex.y);
          }

          svg.addEventListener('pointermove', onMove);
          svg.addEventListener('pointerup', onUp);
        });
      }

      function attachStructureDrag(circle, structureId) {
        circle.addEventListener('pointerdown', (evt) => {
          evt.stopPropagation();
          svg.setPointerCapture(evt.pointerId);
          let lastStation = project.structures.find((s) => s.id === structureId).station;

          function onMove(moveEvt) {
            const svgPoint = toSvgPoint(svg, moveEvt.clientX, moveEvt.clientY);
            const unzoomed = viewport.toUnzoomed(svgPoint);
            const dataPoint = projector.toData(unzoomed.x, unzoomed.y);
            lastStation = stationing.nearestStation(vertices, dataPoint);
            const pos = stationing.pointAtStation(vertices, lastStation);
            const p = projector.toScreen(pos.x, pos.y);
            circle.setAttribute('cx', p.x);
            circle.setAttribute('cy', p.y);
            const label = circle.nextSibling;
            if (label) {
              label.setAttribute('x', p.x + 10);
              label.setAttribute('y', p.y - 10);
            }
          }

          function onUp() {
            svg.removeEventListener('pointermove', onMove);
            svg.removeEventListener('pointerup', onUp);
            callbacks.onSelect({ type: 'structure', id: structureId });
            callbacks.onCommitStructureMove(structureId, lastStation);
          }

          svg.addEventListener('pointermove', onMove);
          svg.addEventListener('pointerup', onUp);
        });
      }

      vertices.forEach((vertex) => {
        const p = projector.toScreen(vertex.x, vertex.y);
        const isSelected = selection && selection.type === 'vertex' && selection.id === vertex.id;
        const circle = svgEl('circle', {
          class: `vertex-point${isSelected ? ' is-selected' : ''}`,
          cx: p.x, cy: p.y, r: 6, 'data-id': vertex.id
        });
        const label = svgEl('text', { class: 'annotation-label vertex-label', x: p.x + 8, y: p.y + 18 });
        label.textContent = vertex.id;
        zoomLayer.appendChild(circle);
        zoomLayer.appendChild(label);
        attachVertexDrag(circle, vertex.id);
      });

      const syncMarker = svgEl('circle', { class: 'sync-marker', r: 9, cx: -9999, cy: -9999 });
      zoomLayer.appendChild(syncMarker);
      current.syncMarker = syncMarker;

      callbacks.onZoomChange(viewport.state.scale);
    }

    return { render, zoomBy, resetZoom, showSyncMarker, hideSyncMarker };
  }

  global.LineDesignPlanView = { createPlanView };
})(typeof window !== 'undefined' ? window : globalThis);
