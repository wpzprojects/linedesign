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
    const current = { projector: null, zoomLayer: null, height: 0, vExaggeration: 1 };

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
      callbacks.onHover({ station: dataPoint.x, elevation: dataPoint.y });
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
      const rect = svg.getBoundingClientRect();
      const WIDTH = Math.max(Math.round(rect.width), MIN_SIZE);
      const HEIGHT = Math.max(Math.round(rect.height), MIN_SIZE);
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
      current.height = HEIGHT;

      const vertices = project.alignment.vertices;
      const distances = stationing.cumulativeDistances(vertices);
      const terrainProfile = project.alignment.terrainProfile;
      const resolved = stationing.resolveStructures(vertices, project.structures, terrainProfile)
        .sort((a, b) => a.station - b.station);
      const bounds = stationing.profileBounds(vertices, resolved, terrainProfile);
      const projector = stationing.makeProjector(bounds, WIDTH, HEIGHT, PADDING, current.vExaggeration);
      current.projector = projector;

      const background = svgEl('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'canvas-background' });
      background.addEventListener('pointerdown', pan.startPan);
      svg.appendChild(background);

      const zoomLayer = svgEl('g', { transform: viewport.transformAttr() });
      svg.appendChild(zoomLayer);
      current.zoomLayer = zoomLayer;

      zoomLayer.appendChild(buildRulerGrid({ svgEl, niceStep: stationing.niceStep, projector, bounds, padding: PADDING }));

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

      const hypothesis = project.hypotheses.find((h) => h.id === hypothesisId) || project.hypotheses[0];
      const referenceHypothesis = loadTree.getReferenceHypothesis(project);

      for (let i = 0; i < resolved.length - 1; i += 1) {
        const from = resolved[i];
        const to = resolved[i + 1];
        const spanLength = to.station - from.station;
        if (spanLength <= 0) continue;

        const tension = catenary.computeSpanTension(project.conductor, referenceHypothesis, hypothesis, spanLength);
        const fromTop = from.z + from.height;
        const toTop = to.z + to.height;
        const curve = catenary.catenaryCurve({
          span: spanLength,
          heightDiff: toTop - fromTop,
          H: tension.horizontalTension,
          unitWeight: tension.verticalUnitWeight
        });

        const screenPoints = curve.points.map((p) => projector.toScreen(from.station + p.x, fromTop + p.y));
        zoomLayer.appendChild(svgEl('path', { class: 'conductor-line', d: pathFromPoints(screenPoints) }));

        const midScreen = projector.toScreen(from.station + spanLength / 2, Math.min(fromTop, toTop));
        const sagLabel = svgEl('text', { class: 'sag-label', x: midScreen.x, y: midScreen.y + 16 });
        sagLabel.textContent = `flecha ${curve.sag.toFixed(2)} m`;
        zoomLayer.appendChild(sagLabel);
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
        zoomLayer.appendChild(svgEl('circle', { class: 'structure-point', cx: topScreen.x, cy: topScreen.y, r: 6 }));
        const label = svgEl('text', { class: 'annotation-label', x: topScreen.x + 8, y: topScreen.y - 8 });
        label.textContent = structure.id;
        zoomLayer.appendChild(label);
      });

      const syncMarker = svgEl('line', { class: 'sync-marker sync-marker--line', x1: -9999, y1: 0, x2: -9999, y2: HEIGHT });
      zoomLayer.appendChild(syncMarker);
      current.syncMarker = syncMarker;

      callbacks.onZoomChange(viewport.state.scale);
    }

    function setVerticalExaggeration(factor) {
      current.vExaggeration = factor;
    }

    function getVerticalExaggeration() {
      return current.vExaggeration;
    }

    return { render, zoomBy, resetZoom, showSyncMarker, hideSyncMarker, setVerticalExaggeration, getVerticalExaggeration };
  }

  global.LineDesignProfileView = { createProfileView };
})(typeof window !== 'undefined' ? window : globalThis);
