/**
 * hypothesesView.js — Editor de hipótesis de carga y de la configuración
 * base del conductor (catálogo, hipótesis de referencia, tensión instalada).
 */
(function (global) {
  const { el, clear } = global.LineDesignDomUtil;
  const catenary = global.LineDesignCatenary;
  const units = global.LineDesignUnits;

  function createHypothesesView(container, store) {
    // Unidad de INTERFAZ (kgF/kg-km o N/N-m) para mostrar y editar fuerza y
    // peso por longitud — puramente de despliegue, ver
    // projectStore.js#setDisplayUnitSystem. Lo guardado en el proyecto y lo
    // exportado en el árbol de cargas siempre queda en kgF/kg-km, su unidad
    // propia, sin importar esta preferencia.
    function isSI(project) { return project.displayUnitSystem === 'si'; }
    function forceUnitLabel(project) { return isSI(project) ? 'N' : 'kgF'; }
    function weightUnitLabel(project) { return isSI(project) ? 'N/m' : 'kg/km'; }
    function toDisplayForce(project, kgf) { return isSI(project) ? units.kgfToNewtons(kgf) : kgf; }
    function fromDisplayForce(project, value) { return isSI(project) ? units.newtonsToKgf(value) : value; }
    function toDisplayWeight(project, kgKm) { return isSI(project) ? units.kgPerKmToNewtonsPerMeter(kgKm) : kgKm; }

    function renderUnitSystemSelect(project) {
      const select = el('select', {
        onChange: (e) => store.setDisplayUnitSystem(e.target.value)
      }, [
        el('option', { value: 'kgf', selected: !isSI(project) }, 'kgF / kg-km'),
        el('option', { value: 'si', selected: isSI(project) }, 'N / N-m (SI)')
      ]);
      return el('div', { class: 'card' }, [
        el('h2', {}, 'Unidades de la interfaz'),
        el('p', { class: 'muted' }, 'Solo cambia cómo se muestran y editan los campos de fuerza y peso por longitud en esta pantalla. El proyecto guardado y el árbol de cargas exportado siempre usan kgF/kg-km, su unidad propia.'),
        el('label', {}, 'Sistema de unidades'),
        select
      ]);
    }

    function render(project) {
      clear(container);
      container.appendChild(renderUnitSystemSelect(project));
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

      // Si alguna fila de "Tensiones de tendido" aplica a este conductor
      // bajo su hipótesis de referencia, ESA tensión calculada es la que se
      // usa de verdad (ver catenary.resolveReferenceTension) — el campo
      // manual de abajo queda deshabilitado y muestra el valor calculado
      // en vez del guardado, para que no parezca editable sin serlo. Si
      // NINGUNA hipótesis tiene fila para el conductor (ni siquiera otra a
      // la que app.js pudiera cambiar automáticamente), sí se usa el valor
      // manual de respaldo, con un aviso grande y persistente.
      const referenceHypothesis = project.hypotheses.find((h) => h.id === project.conductor.referenceHypothesisId) || project.hypotheses[0];
      const resolved = catenary.resolveReferenceTension(project.conductor, referenceHypothesis, project.stringingTensions);
      const usingCalculated = resolved.matched;
      const usingManualFallback = project.stringingTensions.length > 0 && !usingCalculated;

      // resolved.tension es un resultado del motor (siempre en N, SI — ver
      // catenary.js): se convierte a kgF y de ahí a la unidad de interfaz
      // elegida. project.conductor.* ya está guardado en kgF/kg-km (ver
      // dataSource.js): se convierte directo a la unidad de interfaz.
      const tensionInput = el('input', {
        type: 'number', step: '10', value: Math.round(toDisplayForce(project, units.newtonsToKgf(resolved.tension))),
        disabled: usingCalculated,
        onChange: (e) => store.updateConductor({ referenceHorizontalTension: fromDisplayForce(project, parseFloat(e.target.value) || 0) })
      });

      return el('div', { class: 'card' }, [
        el('h2', {}, 'Conductor'),
        el('label', {}, 'Catálogo'),
        conductorSelect,
        el('p', { class: 'muted conductor-specs' },
          `Diámetro ${project.conductor.diameter} m · Peso ${toDisplayWeight(project, project.conductor.weightPerLength).toFixed(1)} ${weightUnitLabel(project)} · RTS ${toDisplayForce(project, project.conductor.ultimateStrength).toFixed(1)} ${forceUnitLabel(project)}`),
        el('label', {}, 'Hipótesis de referencia (tensión instalada)'),
        refHypSelect,
        el('label', {}, `Tensión horizontal de referencia (${forceUnitLabel(project)})`),
        tensionInput,
        usingCalculated
          ? el('p', { class: 'muted conductor-specs' },
            `Calculada automáticamente desde "Tensiones de tendido" para "${referenceHypothesis.name}" — el campo de arriba queda deshabilitado mientras aplique ese criterio.`)
          : null,
        usingManualFallback
          ? el('div', { class: 'stringing-warning' },
            `Se está usando esta tensión de referencia manual: ningún caso climático tiene una fila en "Tensiones de tendido" para "${project.conductor.name}".`)
          : null
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
    // Criteria" de PLS-CADD): determina la tensión horizontal instalada
    // (H1) por vano en vez del valor fijo de "Tensión horizontal de
    // referencia" — ver catenary.resolveReferenceTension. Sigue sin haber
    // modelo de creep en esta fase (la columna "Condición del cable" es
    // solo dato, sin efecto en el cálculo). "Caso climático" y "Cable
    // aplicable" se enlazan a las listas ya existentes (Casos climáticos,
    // catálogo de conductores) para evitar valores sueltos que no
    // correspondan a nada del proyecto.
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
              el('th', {}, `Tensión máx. (${forceUnitLabel(project)})`),
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
          type: 'number', value: item.maxTension == null ? '' : toDisplayForce(project, item.maxTension), step: '10', min: '0', placeholder: '—',
          onChange: (e) => store.updateStringingTension(item.id, { maxTension: e.target.value === '' ? null : fromDisplayForce(project, parseFloat(e.target.value)) })
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
