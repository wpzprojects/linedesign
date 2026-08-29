/**
 * loadTreeView.js — Árbol de cargas por estructura y por hipótesis, en tabla,
 * con exportación a JSON (ver prompt maestro §6.8).
 */
(function (global) {
  const { el, clear } = global.LineDesignDomUtil;
  const { downloadFile } = global.LineDesignSvgUtil;
  const loadTree = global.LineDesignLoadTree;
  const units = global.LineDesignUnits;

  function fmt(value) {
    return Number.isFinite(value) ? value.toFixed(1) : '—';
  }

  // La tabla en pantalla respeta la unidad de interfaz elegida en
  // "Parámetros de entrada" (project.displayUnitSystem, kgF/kg-km o
  // N/N-m — ver hypothesesView.js). El JSON exportado, en cambio, siempre
  // queda en kgF/kgF·m: su propia unidad, fija, para no romper nada aguas
  // abajo si alguien cambia la preferencia de interfaz.
  function fmtDisplay(newtons, project) {
    return fmt(project.displayUnitSystem === 'si' ? newtons : units.newtonsToKgf(newtons));
  }

  function createLoadTreeView(container) {
    function render(project) {
      clear(container);
      const rows = loadTree.computeLoadTree(project);
      const unitLabel = project.displayUnitSystem === 'si' ? 'N' : 'kgF';
      const momentUnitLabel = project.displayUnitSystem === 'si' ? 'N·m' : 'kgF·m';

      const hypothesisById = Object.fromEntries(project.hypotheses.map((h) => [h.id, h.name]));

      const tableRows = rows.map((row) => el('tr', {}, [
        el('td', {}, row.structureId),
        el('td', {}, hypothesisById[row.hypothesisId] || row.hypothesisId),
        el('td', { class: 'num' }, fmtDisplay(row.forces.vertical, project)),
        el('td', { class: 'num' }, fmtDisplay(row.forces.transversal, project)),
        el('td', { class: 'num' }, fmtDisplay(row.forces.longitudinal, project)),
        el('td', { class: 'num' }, fmtDisplay(row.momentEstimate, project))
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
              el('th', { class: 'num' }, `Vertical (${unitLabel})`),
              el('th', { class: 'num' }, `Transversal (${unitLabel})`),
              el('th', { class: 'num' }, `Longitudinal (${unitLabel})`),
              el('th', { class: 'num' }, `Momento est. (${momentUnitLabel})`)
            ])),
            el('tbody', {}, tableRows)
          ])
        ])
      ]);

      container.appendChild(card);
    }

    function exportLoadTree(project, rows) {
      // El JSON exportado debe quedar en las mismas unidades que se ven en
      // pantalla (kgF/kgF·m) — nada de exportar en N/N·m con la tabla ya
      // convertida a la vista, que es justo la confusión que se quiere
      // evitar (unidad distinta entre lo que se ve y lo que se guarda).
      const rowsKgf = rows.map((row) => ({
        ...row,
        forces: {
          vertical: units.newtonsToKgf(row.forces.vertical),
          transversal: units.newtonsToKgf(row.forces.transversal),
          longitudinal: units.newtonsToKgf(row.forces.longitudinal)
        },
        momentEstimate: units.newtonsToKgf(row.momentEstimate)
      }));
      const payload = {
        generatedAt: new Date().toISOString(),
        project: project.name,
        conductor: project.conductor.name,
        units: { force: 'kgF', moment: 'kgF·m' },
        loadTree: rowsKgf
      };
      downloadFile(`arbol-de-cargas-${project.name.replace(/\s+/g, '_')}.json`, JSON.stringify(payload, null, 2));
    }

    return { render };
  }

  global.LineDesignLoadTreeView = { createLoadTreeView };
})(typeof window !== 'undefined' ? window : globalThis);
