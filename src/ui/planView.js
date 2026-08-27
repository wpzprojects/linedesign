/**
 * planView.js — Vista en Planta: alineamiento + estructuras, con arrastre.
 *
 * Estrategia de arrastre: durante el drag se redibuja localmente (sin tocar
 * el store) usando un proyector fijo calculado al iniciar el gesto, para que
 * el trazo no salte al recalcular límites en cada frame. El cambio se
 * confirma al store (y dispara el re-render completo de toda la app, incl.
 * el perfil) recién al soltar el puntero (pointerup).
 */
(function (global) {
  const { svgEl, clear, toSvgPoint } = global.LineDesignSvgUtil;
  const stationing = global.LineDesignStationing;

  const PADDING = 36;
  const MIN_SIZE = 200;

  function pathFromPoints(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  function createPlanView(svg, callbacks) {
    function render(project, selection) {
      clear(svg);
      // El viewBox se ajusta al tamaño real renderizado del <svg> (que llena
      // el panel vía flexbox) para que el lienzo aproveche todo el espacio
      // disponible en vez de quedar recortado a una relación de aspecto fija.
      const rect = svg.getBoundingClientRect();
      const WIDTH = Math.max(Math.round(rect.width), MIN_SIZE);
      const HEIGHT = Math.max(Math.round(rect.height), MIN_SIZE);
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);

      const vertices = project.alignment.vertices;
      const bounds = stationing.planBounds(vertices);
      const projector = stationing.makeProjector(bounds, WIDTH, HEIGHT, PADDING);
      const resolvedStructures = stationing.resolveStructures(vertices, project.structures);

      const root = svgEl('g');
      svg.appendChild(root);

      // Fondo clicable para deseleccionar.
      root.appendChild(svgEl('rect', {
        x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: 'transparent'
      }, {
        pointerdown: () => callbacks.onDeselect()
      }));

      root.appendChild(svgEl('line', {
        class: 'grid-line', x1: PADDING, y1: HEIGHT - PADDING, x2: WIDTH - PADDING, y2: HEIGHT - PADDING
      }));
      root.appendChild(svgEl('line', {
        class: 'grid-line', x1: PADDING, y1: PADDING, x2: PADDING, y2: HEIGHT - PADDING
      }));

      const alignmentPath = svgEl('path', {
        class: 'alignment-line',
        d: pathFromPoints(vertices.map((v) => projector.toScreen(v.x, v.y)))
      });
      root.appendChild(alignmentPath);

      const structureLayer = svgEl('g');
      root.appendChild(structureLayer);

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

      // La captura de puntero y los listeners de move/up se ponen en el
      // <svg> raíz (persiste entre renders), no en el círculo arrastrado.
      // Y callbacks.onSelect() se llama recién en pointerup, no en
      // pointerdown: onSelect dispara un re-render completo de toda la app
      // (clear(svg) + reconstrucción), y si eso ocurriera al iniciar el
      // gesto, todas las referencias capturadas en este closure (circle,
      // alignmentPath, structureLayer) quedarían huérfanas —el arrastre
      // seguiría escribiendo en nodos ya desmontados, invisible hasta soltar.
      function attachVertexDrag(circle, vertexId) {
        circle.addEventListener('pointerdown', (evt) => {
          evt.stopPropagation();
          svg.setPointerCapture(evt.pointerId);
          const draft = vertices.map((v) => ({ ...v }));

          function onMove(moveEvt) {
            const svgPoint = toSvgPoint(svg, moveEvt.clientX, moveEvt.clientY);
            const dataPoint = projector.toData(svgPoint.x, svgPoint.y);
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
            const dataPoint = projector.toData(svgPoint.x, svgPoint.y);
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
        root.appendChild(circle);
        root.appendChild(label);
        attachVertexDrag(circle, vertex.id);
      });
    }

    return { render };
  }

  global.LineDesignPlanView = { createPlanView };
})(typeof window !== 'undefined' ? window : globalThis);
