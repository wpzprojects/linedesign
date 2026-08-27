/**
 * profileView.js — Vista en Perfil: terreno, estructuras y catenaria del
 * conductor por vano, para la hipótesis de carga seleccionada en la UI.
 */
(function (global) {
  const { svgEl, clear } = global.LineDesignSvgUtil;
  const stationing = global.LineDesignStationing;
  const catenary = global.LineDesignCatenary;
  const loadTree = global.LineDesignLoadTree;

  const PADDING = 36;
  const MIN_SIZE = 200;

  function pathFromPoints(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  function createProfileView(svg, callbacks) {
    function render(project, hypothesisId, selection) {
      clear(svg);
      // Ver comentario equivalente en planView.js: el viewBox se ajusta al
      // tamaño real renderizado para aprovechar todo el panel disponible.
      const rect = svg.getBoundingClientRect();
      const WIDTH = Math.max(Math.round(rect.width), MIN_SIZE);
      const HEIGHT = Math.max(Math.round(rect.height), MIN_SIZE);
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);

      const vertices = project.alignment.vertices;
      const distances = stationing.cumulativeDistances(vertices);
      const resolved = stationing.resolveStructures(vertices, project.structures)
        .sort((a, b) => a.station - b.station);
      const bounds = stationing.profileBounds(vertices, resolved);
      const projector = stationing.makeProjector(bounds, WIDTH, HEIGHT, PADDING);

      const root = svgEl('g');
      svg.appendChild(root);

      root.appendChild(svgEl('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: 'transparent' }, {
        pointerdown: () => callbacks.onDeselect()
      }));
      root.appendChild(svgEl('line', { class: 'grid-line', x1: PADDING, y1: HEIGHT - PADDING, x2: WIDTH - PADDING, y2: HEIGHT - PADDING }));
      root.appendChild(svgEl('line', { class: 'grid-line', x1: PADDING, y1: PADDING, x2: PADDING, y2: HEIGHT - PADDING }));

      const terrainPoints = vertices.map((v, i) => projector.toScreen(distances[i], v.z));
      root.appendChild(svgEl('path', { class: 'profile-line', d: pathFromPoints(terrainPoints) }));

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
        root.appendChild(svgEl('path', { class: 'conductor-line', d: pathFromPoints(screenPoints) }));

        const midScreen = projector.toScreen(from.station + spanLength / 2, Math.min(fromTop, toTop));
        const sagLabel = svgEl('text', { class: 'sag-label', x: midScreen.x, y: midScreen.y + 16 });
        sagLabel.textContent = `flecha ${curve.sag.toFixed(2)} m`;
        root.appendChild(sagLabel);
      }

      resolved.forEach((structure) => {
        const baseScreen = projector.toScreen(structure.station, structure.z);
        const topScreen = projector.toScreen(structure.station, structure.z + structure.height);
        const isSelected = selection && selection.type === 'structure' && selection.id === structure.id;

        const pole = svgEl('line', {
          class: `structure-pole${isSelected ? ' is-selected' : ''}`,
          x1: baseScreen.x, y1: baseScreen.y, x2: topScreen.x, y2: topScreen.y, 'data-id': structure.id
        }, {
          pointerdown: (evt) => {
            evt.stopPropagation();
            callbacks.onSelect({ type: 'structure', id: structure.id });
          }
        });
        root.appendChild(pole);
        root.appendChild(svgEl('circle', { class: 'structure-point', cx: topScreen.x, cy: topScreen.y, r: 6 }));
        const label = svgEl('text', { class: 'annotation-label', x: topScreen.x + 8, y: topScreen.y - 8 });
        label.textContent = structure.id;
        root.appendChild(label);
      });

      root.appendChild(svgEl('text', { class: 'axis-text', x: WIDTH / 2 - 60, y: HEIGHT - 6 }, {})).textContent = 'Distancia acumulada (m)';
      const yLabel = svgEl('text', { class: 'axis-text', x: 10, y: HEIGHT / 2, transform: `rotate(-90 10 ${HEIGHT / 2})` });
      yLabel.textContent = 'Elevación (m)';
      root.appendChild(yLabel);
    }

    return { render };
  }

  global.LineDesignProfileView = { createProfileView };
})(typeof window !== 'undefined' ? window : globalThis);
