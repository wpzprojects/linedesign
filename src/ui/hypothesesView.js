/**
 * hypothesesView.js — Editor de hipótesis de carga y de la configuración
 * base del conductor (catálogo, hipótesis de referencia, tensión instalada).
 */
(function (global) {
  const { el, clear } = global.LineDesignDomUtil;

  function createHypothesesView(container, store) {
    function render(project) {
      clear(container);
      container.appendChild(renderConductorCard(project));
      container.appendChild(renderHypothesesCard(project));
      container.appendChild(renderStringingTensionsCard(project));
    }

    function renderConductorCard(project) {
      const conductorSelect = el('select', {
        onChange: (e) => store.setConductor(e.target.value)
      }, project.conductorCatalog.map((c) => el('option', {
        value: c.id, selected: c.id === project.conductor.id
      }, c.name)));

      const refHypSelect = el('select', {
        onChange: (e) => store.updateConductor({ referenceHypothesisId: e.target.value })
      }, project.hypotheses.map((h) => el('option', {
        value: h.id, selected: h.id === project.conductor.referenceHypothesisId
      }, h.name)));

      const tensionInput = el('input', {
        type: 'number', step: '10', value: project.conductor.referenceHorizontalTension,
        onChange: (e) => store.updateConductor({ referenceHorizontalTension: parseFloat(e.target.value) || 0 })
      });

      return el('div', { class: 'card' }, [
        el('h2', {}, 'Conductor'),
        el('label', {}, 'Catálogo'),
        conductorSelect,
        el('p', { class: 'muted' }, `Diámetro ${project.conductor.diameter} m · Peso ${project.conductor.weightPerLength} N/m · RTS ${project.conductor.ultimateStrength} N`),
        el('label', {}, 'Hipótesis de referencia (tensión instalada)'),
        refHypSelect,
        el('label', {}, 'Tensión horizontal de referencia (N)'),
        tensionInput
      ]);
    }

    function renderHypothesesCard(project) {
      const rows = project.hypotheses.map((h) => renderRow(h, project));
      return el('div', { class: 'card' }, [
        el('h2', {}, 'Casos climáticos'),
        el('p', { class: 'muted' }, 'Mínimo 1 hipótesis. La app requiere al menos 3 para el criterio de aceptación de Fase 1 (everyday, temperatura alta, viento).'),
        el('div', { class: 'table-wrap' }, [
          el('table', { class: 'data-table' }, [
            el('thead', {}, el('tr', {}, [
              el('th', {}, 'Nombre'),
              el('th', {}, 'Temp (°C)'),
              el('th', {}, 'Viento (m/s)'),
              el('th', {}, 'Hielo (mm)'),
              el('th', {}, '')
            ])),
            el('tbody', {}, rows)
          ])
        ]),
        el('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => store.addHypothesis({ name: 'Nueva hipótesis', temperature: 15, windSpeed: 0, iceThickness: 0 })
        }, '+ agregar hipótesis')
      ]);
    }

    function renderRow(hypothesis, project) {
      const isReference = project.conductor.referenceHypothesisId === hypothesis.id;
      return el('tr', { class: isReference ? 'is-reference' : '' }, [
        el('td', {}, el('input', {
          type: 'text', value: hypothesis.name,
          onChange: (e) => store.updateHypothesis(hypothesis.id, { name: e.target.value })
        })),
        el('td', {}, el('input', {
          type: 'number', value: hypothesis.temperature, step: '1',
          onChange: (e) => store.updateHypothesis(hypothesis.id, { temperature: parseFloat(e.target.value) || 0 })
        })),
        el('td', {}, el('input', {
          type: 'number', value: hypothesis.windSpeed, step: '1', min: '0',
          onChange: (e) => store.updateHypothesis(hypothesis.id, { windSpeed: Math.max(0, parseFloat(e.target.value) || 0) })
        })),
        el('td', {}, el('input', {
          type: 'number', value: hypothesis.iceThickness, step: '1', min: '0',
          onChange: (e) => store.updateHypothesis(hypothesis.id, { iceThickness: Math.max(0, parseFloat(e.target.value) || 0) })
        })),
        el('td', {}, el('button', {
          class: 'btn btn-small btn-danger', type: 'button',
          onClick: () => {
            const result = store.removeHypothesis(hypothesis.id);
            if (result && !result.ok) alert(result.reason);
          }
        }, '×'))
      ]);
    }

    // Criterios de tendido/flechado (equivalente al "Automatic Sagging
    // Criteria" de PLS-CADD): por ahora es solo una tabla de datos de
    // entrada, sin motor de cálculo detrás (no hay modelo de creep en esta
    // fase) — "Caso climático" y "Cable aplicable" se enlazan a las listas
    // ya existentes (Casos climáticos, catálogo de conductores) para evitar
    // valores sueltos que no correspondan a nada del proyecto.
    function renderStringingTensionsCard(project) {
      const rows = project.stringingTensions.map((t) => renderStringingTensionRow(t, project));
      return el('div', { class: 'card' }, [
        el('h2', {}, 'Tensiones de tendido'),
        el('div', { class: 'table-wrap' }, [
          el('table', { class: 'data-table' }, [
            el('thead', {}, el('tr', {}, [
              el('th', {}, 'Caso climático'),
              el('th', {}, 'Condición del cable'),
              el('th', {}, '% de rotura'),
              el('th', {}, 'Tensión máx. (daN)'),
              el('th', {}, 'Catenaria máx. (m)'),
              el('th', {}, 'Cable aplicable'),
              el('th', {}, '')
            ])),
            el('tbody', {}, rows)
          ])
        ]),
        el('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => store.addStringingTension({ weatherCase: project.hypotheses[0] ? project.hypotheses[0].name : '' })
        }, '+ agregar tensión de tendido')
      ]);
    }

    function renderStringingTensionRow(item, project) {
      const weatherCaseSelect = el('select', {
        onChange: (e) => store.updateStringingTension(item.id, { weatherCase: e.target.value })
      }, project.hypotheses.map((h) => el('option', {
        value: h.name, selected: h.name === item.weatherCase
      }, h.name)));

      const applicableCableSelect = el('select', {
        onChange: (e) => store.updateStringingTension(item.id, { applicableCable: e.target.value })
      }, [
        el('option', { value: '', selected: item.applicableCable === '' }, 'Todos'),
        ...project.conductorCatalog.map((c) => el('option', {
          value: c.name, selected: c.name === item.applicableCable
        }, c.name))
      ]);

      return el('tr', {}, [
        el('td', {}, weatherCaseSelect),
        el('td', {}, el('input', {
          type: 'text', value: item.cableCondition,
          onChange: (e) => store.updateStringingTension(item.id, { cableCondition: e.target.value })
        })),
        el('td', {}, el('input', {
          type: 'number', value: item.percentUltimate, step: '0.1', min: '0',
          onChange: (e) => store.updateStringingTension(item.id, { percentUltimate: parseFloat(e.target.value) || 0 })
        })),
        el('td', {}, el('input', {
          type: 'number', value: item.maxTension ?? '', step: '10', min: '0', placeholder: '—',
          onChange: (e) => store.updateStringingTension(item.id, { maxTension: e.target.value === '' ? null : parseFloat(e.target.value) })
        })),
        el('td', {}, el('input', {
          type: 'number', value: item.maxCatenary ?? '', step: '0.1', min: '0', placeholder: '—',
          onChange: (e) => store.updateStringingTension(item.id, { maxCatenary: e.target.value === '' ? null : parseFloat(e.target.value) })
        })),
        el('td', {}, applicableCableSelect),
        el('td', {}, el('button', {
          class: 'btn btn-small btn-danger', type: 'button',
          onClick: () => store.removeStringingTension(item.id)
        }, '×'))
      ]);
    }

    return { render };
  }

  global.LineDesignHypothesesView = { createHypothesesView };
})(typeof window !== 'undefined' ? window : globalThis);
