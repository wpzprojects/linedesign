/**
 * loadTreeView.js — Árbol de cargas por estructura y por hipótesis, en tabla,
 * con exportación a JSON (ver prompt maestro §6.8).
 */
(function (global) {
  const { el, clear } = global.LineDesignDomUtil;
  const { downloadFile } = global.LineDesignSvgUtil;
  const loadTree = global.LineDesignLoadTree;

  function fmt(value) {
    return Number.isFinite(value) ? value.toFixed(1) : '—';
  }

  function createLoadTreeView(container) {
    function render(project) {
      clear(container);
      const rows = loadTree.computeLoadTree(project);

      const hypothesisById = Object.fromEntries(project.hypotheses.map((h) => [h.id, h.name]));

      const tableRows = rows.map((row) => el('tr', {}, [
        el('td', {}, row.structureId),
        el('td', {}, hypothesisById[row.hypothesisId] || row.hypothesisId),
        el('td', { class: 'num' }, fmt(row.forces.vertical)),
        el('td', { class: 'num' }, fmt(row.forces.transversal)),
        el('td', { class: 'num' }, fmt(row.forces.longitudinal)),
        el('td', { class: 'num' }, fmt(row.momentEstimate))
      ]));

      const card = el('div', { class: 'card' }, [
        el('div', { class: 'panel-head' }, [
          el('h2', {}, 'Árbol de cargas'),
          el('button', {
            class: 'btn btn-primary btn-small', type: 'button',
            onClick: () => exportLoadTree(project, rows)
          }, 'Exportar JSON')
        ]),
        el('p', { class: 'muted' }, 'Fuerzas por estructura para cada hipótesis: vertical (peso del conductor), transversal (viento + desequilibrio de tensión) y longitudinal (desequilibrio de tensión entre vanos adyacentes). Momento: estimación simplificada = vertical × altura de enganche promedio.'),
        el('div', { class: 'table-wrap' }, [
          el('table', { class: 'data-table' }, [
            el('thead', {}, el('tr', {}, [
              el('th', {}, 'Estructura'),
              el('th', {}, 'Hipótesis'),
              el('th', {}, 'Vertical (N)'),
              el('th', {}, 'Transversal (N)'),
              el('th', {}, 'Longitudinal (N)'),
              el('th', {}, 'Momento est. (N·m)')
            ])),
            el('tbody', {}, tableRows)
          ])
        ])
      ]);

      container.appendChild(card);
    }

    function exportLoadTree(project, rows) {
      const payload = {
        generatedAt: new Date().toISOString(),
        project: project.name,
        conductor: project.conductor.name,
        units: { force: 'N', moment: 'N·m' },
        loadTree: rows
      };
      downloadFile(`arbol-de-cargas-${project.name.replace(/\s+/g, '_')}.json`, JSON.stringify(payload, null, 2));
    }

    return { render };
  }

  global.LineDesignLoadTreeView = { createLoadTreeView };
})(typeof window !== 'undefined' ? window : globalThis);
