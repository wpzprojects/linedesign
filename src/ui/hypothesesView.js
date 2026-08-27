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
        el('h2', {}, 'Hipótesis de carga'),
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

    return { render };
  }

  global.LineDesignHypothesesView = { createHypothesesView };
})(typeof window !== 'undefined' ? window : globalThis);
