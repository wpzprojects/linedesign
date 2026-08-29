/**
 * planView.js — Vista en Planta: alineamiento + estructuras, con arrastre,
 * zoom (rueda) y pan (arrastrar el fondo). Reporta la posición del cursor y
 * el nivel de zoom para que app.js los muestre en la barra de estado.
 * Opcionalmente muestra un mapa real (mapRenderer.js) detrás del SVG,
 * sincronizado con el mismo zoom/pan — ver comentario en mapRenderer.js.
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
  const { createMapRenderer } = global.LineDesignMapRenderer;

  const PADDING = 40;
  const MIN_SIZE = 200;

  function pathFromPoints(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  function createPlanView(svg, mapContainer, callbacks) {
    const viewport = createViewport();
    const mapRenderer = createMapRenderer(mapContainer);
    // Referencias mutables al render vigente, para que los listeners
    // registrados una sola vez (wheel, hover) siempre operen sobre el
    // proyector/zoomLayer actuales y no sobre los de un render anterior.
    const current = { project: null, selection: null, projector: null, zoomLayer: null, markers: [] };

    // Marcadores (círculos de vértice/estructura, sus etiquetas y el
    // sync-marker): viven dentro de zoomLayer para que su posición
    // pan/zoquee junto al resto del dibujo, pero cada uno lleva su propia
    // escala inversa (1/scale) al zoom actual para que su tamaño en
    // pantalla (incl. el font-size de las etiquetas) se mantenga constante
    // (mismo motivo que en profileView.js — un <circle>/<text> no tiene
    // equivalente a vector-effect para su radio/tamaño, solo para el
    // stroke). La etiqueta de cada marcador vive DENTRO del mismo <g> que
    // su círculo, con un desplazamiento local fijo — así se mueve/escala
    // junto con él sin necesidad de actualizarla aparte.
    function markerTransform(x, y) {
      return `translate(${x} ${y}) scale(${1 / viewport.state.scale})`;
    }

    function setMarkerPos(marker, x, y) {
      marker.x = x;
      marker.y = y;
      marker.el.setAttribute('transform', markerTransform(x, y));
    }

    function updateMarkers() {
      current.markers.forEach((m) => m.el.setAttribute('transform', markerTransform(m.x, m.y)));
    }

    function updateMapView() {
      if (!current.bounds || !current.projector) return;
      const refPoint = {
        x: (current.bounds.minX + current.bounds.maxX) / 2,
        y: (current.bounds.minY + current.bounds.maxY) / 2
      };
      mapRenderer.updateView(refPoint, current.projector, current.width, current.height, viewport.state);
    }

    function applyTransform() {
      if (current.zoomLayer) current.zoomLayer.setAttribute('transform', viewport.transformAttr());
      updateMapView();
      updateMarkers();
    }

    const pan = viewport.attach(svg, {
      onChange: () => {
        applyTransform();
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
      applyTransform();
      callbacks.onZoomChange(viewport.state.scale);
    }

    function resetZoom() {
      viewport.reset();
      applyTransform();
      callbacks.onZoomChange(viewport.state.scale);
    }

    function setMapVisible(visible) {
      mapRenderer.setVisible(visible);
    }

    function isMapVisible() {
      return mapRenderer.isVisible();
    }

    function showSyncMarker(station) {
      if (!current.projector || !current.vertices || !current.syncMarker) return;
      const pos = stationing.pointAtStation(current.vertices, station);
      const p = current.projector.toScreen(pos.x, pos.y);
      setMarkerPos(current.syncMarkerRecord, p.x, p.y);
      current.syncMarker.classList.add('is-visible');
    }

    function hideSyncMarker() {
      if (current.syncMarker) current.syncMarker.classList.remove('is-visible');
    }

    function render(project, selection) {
      current.project = project;
      current.selection = selection;
      current.markers = [];
      clear(svg);

      // El viewBox se ajusta al tamaño real renderizado del <svg> (que llena
      // el panel vía flexbox) para que el lienzo aproveche todo el espacio
      // disponible en vez de quedar recortado a una relación de aspecto fija.
      const rect = svg.getBoundingClientRect();
      const WIDTH = Math.max(Math.round(rect.width), MIN_SIZE);
      const HEIGHT = Math.max(Math.round(rect.height), MIN_SIZE);
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
      current.width = WIDTH;
      current.height = HEIGHT;

      const vertices = project.alignment.vertices;
      current.vertices = vertices;
      const rightOfWayWidth = project.rightOfWayWidth || 0;
      // Un paso de regla más allá del rango real en las cuatro direcciones,
      // para que el plano no quede pegado exactamente a los extremos del
      // alineamiento (ver stationing.padBoundsByStep).
      const bounds = stationing.padBoundsByStep(stationing.planBounds(vertices, rightOfWayWidth / 2));
      current.bounds = bounds;
      const projector = stationing.makeProjector(bounds, WIDTH, HEIGHT, PADDING);
      current.projector = projector;

      updateMapView();

      // Fondo NO transformado (fuera de la capa de zoom): así el pan se
      // puede iniciar arrastrando en cualquier parte visible del lienzo.
      const background = svgEl('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'canvas-background' });
      background.addEventListener('pointerdown', pan.startPan);
      svg.appendChild(background);

      const zoomLayer = svgEl('g', { transform: viewport.transformAttr() });
      svg.appendChild(zoomLayer);
      current.zoomLayer = zoomLayer;

      zoomLayer.appendChild(buildRulerGrid({ svgEl, niceStep: stationing.niceStep, projector, bounds, padding: PADDING }));

      // Franja de servidumbre (Parámetros de entrada § Terreno): dos líneas
      // punteadas paralelas al alineamiento, cada una a la mitad del ancho
      // configurado (offsetPolyline calcula el desplazamiento perpendicular
      // al propio trazado, no a los ejes X/Y). Se dibujan antes que el
      // alineamiento para que este quede por encima.
      if (rightOfWayWidth > 0) {
        const half = rightOfWayWidth / 2;
        [half, -half].forEach((offset) => {
          const side = stationing.offsetPolyline(vertices, offset).map((p) => projector.toScreen(p.x, p.y));
          zoomLayer.appendChild(svgEl('path', { class: 'row-line', d: pathFromPoints(side) }));
        });
      }

      const alignmentPath = svgEl('path', {
        class: 'alignment-line',
        d: pathFromPoints(vertices.map((v) => projector.toScreen(v.x, v.y)))
      });
      zoomLayer.appendChild(alignmentPath);

      // structureLayer se crea aquí (redrawStructures y el arrastre de
      // vértices ya lo necesitan) pero se agrega al DOM más abajo, DESPUÉS
      // de los marcadores de vértice: en SVG el orden de pintado sigue el
      // orden del DOM, así que si un poste queda justo sobre un vértice,
      // el poste debe estar "encima" para recibir el arrastre en vez de
      // mover el vértice de abajo por accidente.
      const structureLayer = svgEl('g');

      function redrawStructures(vertexList) {
        clear(structureLayer);
        current.markers = current.markers.filter((m) => m.type !== 'structure');
        const resolved = stationing.resolveStructures(vertexList, project.structures);
        resolved.forEach((structure) => {
          const p = projector.toScreen(structure.x, structure.y);
          const isSelected = selection && selection.type === 'structure' && selection.id === structure.id;
          const marker = svgEl('g', { transform: markerTransform(p.x, p.y) });
          const circle = svgEl('circle', {
            class: `structure-point${isSelected ? ' is-selected' : ''}`,
            cx: 0, cy: 0, r: 7, 'data-id': structure.id
          });
          marker.appendChild(circle);
          // La etiqueta vive DENTRO del mismo marcador (mismo <g> con escala
          // inversa que el círculo) con un desplazamiento local fijo (10,-10)
          // en vez de sumarlo a p.x/p.y: así el offset y el tamaño de fuente
          // se mantienen constantes en pantalla en cualquier zoom, y no hace
          // falta reposicionarla aparte durante el arrastre.
          const label = svgEl('text', { class: 'annotation-label', x: 10, y: -10 });
          label.textContent = structure.id;
          marker.appendChild(label);
          const markerRecord = { el: marker, x: p.x, y: p.y, type: 'structure' };
          current.markers.push(markerRecord);

          structureLayer.appendChild(marker);
          attachStructureDrag(circle, structure.id, markerRecord);
        });
      }

      redrawStructures(vertices);

      function attachVertexDrag(circle, vertexId, markerRecord) {
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

            const screenPos = projector.toScreen(draftVertex.x, draftVertex.y);
            alignmentPath.setAttribute('d', pathFromPoints(draft.map((v) => projector.toScreen(v.x, v.y))));
            setMarkerPos(markerRecord, screenPos.x, screenPos.y);
            redrawStructures(draft);
            if (callbacks.onVertexDragMove) callbacks.onVertexDragMove(vertexId, draftVertex.x, draftVertex.y);
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

      function attachStructureDrag(circle, structureId, markerRecord) {
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
            setMarkerPos(markerRecord, p.x, p.y);
            if (callbacks.onStructureDragMove) callbacks.onStructureDragMove(structureId, lastStation);
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
        const marker = svgEl('g', { transform: markerTransform(p.x, p.y) });
        const circle = svgEl('circle', {
          class: `vertex-point${isSelected ? ' is-selected' : ''}`,
          cx: 0, cy: 0, r: 6, 'data-id': vertex.id
        });
        marker.appendChild(circle);
        const label = svgEl('text', { class: 'annotation-label vertex-label', x: 8, y: 18 });
        label.textContent = vertex.id;
        marker.appendChild(label);
        const markerRecord = { el: marker, x: p.x, y: p.y, type: 'vertex' };
        current.markers.push(markerRecord);
        zoomLayer.appendChild(marker);
        attachVertexDrag(circle, vertex.id, markerRecord);
      });

      zoomLayer.appendChild(structureLayer);

      const syncMarker = svgEl('circle', { class: 'sync-marker', r: 9, cx: 0, cy: 0 });
      const syncMarkerGroup = svgEl('g', { transform: markerTransform(-9999, -9999) });
      syncMarkerGroup.appendChild(syncMarker);
      zoomLayer.appendChild(syncMarkerGroup);
      current.syncMarker = syncMarker;
      current.syncMarkerRecord = { el: syncMarkerGroup, x: -9999, y: -9999, type: 'sync' };
      current.markers.push(current.syncMarkerRecord);

      callbacks.onZoomChange(viewport.state.scale);
    }

    return { render, zoomBy, resetZoom, showSyncMarker, hideSyncMarker, setMapVisible, isMapVisible };
  }

  global.LineDesignPlanView = { createPlanView };
})(typeof window !== 'undefined' ? window : globalThis);
