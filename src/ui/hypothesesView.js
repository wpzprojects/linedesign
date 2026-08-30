/**
 * hypothesesView.js — Editor de hipótesis de carga y de la configuración
 * base del conductor (catálogo, hipótesis de referencia, tensión instalada).
 */
(function (global) {
  const { el, clear } = global.LineDesignDomUtil;
  const catenary = global.LineDesignCatenary;
  const units = global.LineDesignUnits;

  function createHypothesesView(container, store) {
    // Selector embebido en la tarjeta "Unidades" de Parámetros de entrada
    // (index.html), no en `container` — vive fuera del flujo de
    // hypotheses-container porque conceptualmente es parte de esa tarjeta,
    // no una tarjeta propia.
    const unitSystemContainer = document.getElementById('unit-system-container');
    // Mismo criterio: la tarjeta Conductor se movió a la fila de arriba
    // (Parámetros de entrada), en el lugar que antes ocupaba "Importar
    // alineamiento" — vive fuera de `container` (hypotheses-container).
    const conductorCardContainer = document.getElementById('conductor-card');

    // Ventana emergente genérica (index.html#modal-overlay), compartida —
    // esta vista es hoy su único consumidor (el formulario de "+ Agregar"
    // conductor), pero el contenedor en sí no es propio de esta vista.
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    function openModal(title, contentNode) {
      modalTitle.textContent = title;
      clear(modalBody);
      modalBody.appendChild(contentNode);
      modalOverlay.hidden = false;
    }

    function closeModal() {
      modalOverlay.hidden = true;
      clear(modalBody);
    }

    modalCloseBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('pointerdown', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
    });

    // Unidad de INTERFAZ (kgF/kg-km o N/N-m) para mostrar y editar fuerza y
    // peso por longitud — puramente de despliegue, ver
    // projectStore.js#setDisplayUnitSystem. Lo guardado en el proyecto y lo
    // exportado en el árbol de cargas siempre queda en kgF/kg-km, su unidad
    // propia, sin importar esta preferencia.
    function isSI(project) { return project.displayUnitSystem === 'si'; }
    function forceUnitLabel(project) { return isSI(project) ? 'N' : 'kgF'; }
    // Mismo campo/conversión que forceUnitLabel (weightPerLength es, en
    // rigor, un peso-fuerza por longitud, no una masa — así entra a las
    // ecuaciones de catenaria), pero se rotula "kg" sin la F en modo
    // kgF/kg-km: escribir "kgF/km" generaba dudas sin aportar nada en la
    // práctica (el número es el mismo que si dijeras kg/km).
    function weightUnitLabel(project) { return isSI(project) ? 'N' : 'kg'; }
    function toDisplayForce(project, kgf) { return isSI(project) ? units.kgfToNewtons(kgf) : kgf; }
    function fromDisplayForce(project, value) { return isSI(project) ? units.newtonsToKgf(value) : value; }

    // Formulario de "+ Agregar" conductor (ventana emergente): los campos
    // de fuerza/peso por longitud se piden en la unidad de INTERFAZ vigente
    // (kgF/kg-km o N/N-m, igual que el resto de la tarjeta Conductor) y se
    // convierten de vuelta a kgF/kg-km al guardar — ver toDisplayForce/
    // fromDisplayForce arriba. diameter/crossSectionArea/elasticModulus/
    // thermalExpansionCoef son siempre SI (m/m²/Pa/°C⁻¹), no tienen selector.
    function openAddConductorForm(project) {
      const forceUnit = forceUnitLabel(project);
      const nameInput = el('input', { type: 'text', required: true });
      const diameterInput = el('input', { type: 'number', step: 'any', min: '0' });
      const weightInput = el('input', { type: 'number', step: 'any', min: '0' });
      const areaInput = el('input', { type: 'number', step: 'any', min: '0' });
      const elasticModulusInput = el('input', { type: 'number', step: 'any', min: '0', value: '69000000000' });
      const thermalCoefInput = el('input', { type: 'number', step: 'any', value: '0.000019' });
      const strengthInput = el('input', { type: 'number', step: 'any', min: '0' });

      const form = el('form', {
        onSubmit: (e) => {
          e.preventDefault();
          const name = nameInput.value.trim();
          if (!name) {
            alert('El conductor necesita un nombre.');
            return;
          }
          // Hipótesis de referencia y tensión horizontal de referencia NO
          // se piden acá: quedan con su valor por defecto (ver
          // projectStore.js#addConductor) y se terminan de configurar en
          // la propia tarjeta Conductor justo después de crear — este
          // conductor queda seleccionado ahí mismo (setConductor abajo),
          // así que pedirlas dos veces sería redundante.
          const conductor = store.addConductor({
            name,
            diameter: parseFloat(diameterInput.value) || 0,
            weightPerLength: fromDisplayForce(project, parseFloat(weightInput.value) || 0),
            crossSectionArea: parseFloat(areaInput.value) || 0,
            elasticModulus: parseFloat(elasticModulusInput.value) || 0,
            thermalExpansionCoef: parseFloat(thermalCoefInput.value) || 0,
            ultimateStrength: fromDisplayForce(project, parseFloat(strengthInput.value) || 0)
          });
          store.setConductor(conductor.id);
          closeModal();
        }
      }, [
        el('label', {}, 'Nombre'), nameInput,
        el('label', {}, 'Diámetro (m)'), diameterInput,
        el('label', {}, `Peso por longitud (${weightUnitLabel(project)}/km)`), weightInput,
        el('label', {}, 'Área de sección (m²)'), areaInput,
        el('label', {}, 'Módulo de elasticidad (Pa)'), elasticModulusInput,
        el('label', {}, 'Coef. de expansión térmica (1/°C)'), thermalCoefInput,
        el('label', {}, `Carga de rotura (${forceUnit})`), strengthInput,
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'btn toolbar-card-btn', type: 'submit' }, 'Agregar conductor'),
          el('button', { class: 'btn btn-small', type: 'button', onClick: closeModal }, 'Cancelar')
        ])
      ]);

      openModal('Agregar conductor', form);
      nameInput.focus();
    }

    function confirmRemoveConductor(project) {
      if (!confirm(`¿Eliminar el conductor "${project.conductor.name}" del catálogo? Esta acción no se puede deshacer.`)) return;
      const result = store.removeConductor(project.conductor.id);
      if (result && !result.ok) alert(result.reason);
    }

    function renderUnitSystemSelect(project) {
      const select = el('select', {
        onChange: (e) => store.setDisplayUnitSystem(e.target.value)
      }, [
        el('option', { value: 'kgf', selected: !isSI(project) }, 'kgF / kg-km'),
        el('option', { value: 'si', selected: isSI(project) }, 'N / N-m (SI)')
      ]);
      clear(unitSystemContainer);
      unitSystemContainer.appendChild(el('label', { for: 'unit-system-select' }, 'Sistema de unidades'));
      select.id = 'unit-system-select';
      unitSystemContainer.appendChild(select);
    }

    function render(project) {
      renderUnitSystemSelect(project);
      renderConductorCard(project);
      clear(container);
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
        title: usingCalculated
          ? `Calculada desde "Tensiones de tendido" para "${referenceHypothesis.name}" — campo deshabilitado mientras aplique.`
          : '',
        onChange: (e) => store.updateConductor({ referenceHorizontalTension: fromDisplayForce(project, parseFloat(e.target.value) || 0) })
      });

      clear(conductorCardContainer);
      conductorCardContainer.append(...[
        el('h2', {}, 'Conductor'),
        el('label', {}, 'Catálogo'),
        conductorSelect,
        el('div', { class: 'row-actions' }, [
          el('button', {
            class: 'btn btn-small btn-danger', type: 'button',
            title: 'Elimina del catálogo el conductor seleccionado arriba',
            onClick: () => confirmRemoveConductor(project)
          }, 'Eliminar'),
          el('button', {
            class: 'btn btn-small toolbar-card-btn', type: 'button',
            onClick: () => openAddConductorForm(project)
          }, 'Agregar nuevo')
        ]),
        el('label', {}, 'Hipótesis de referencia (tensión instalada)'),
        refHypSelect,
        el('label', {}, `Tensión horizontal de referencia (${forceUnitLabel(project)})`),
        tensionInput,
        usingManualFallback
          ? el('div', { class: 'stringing-warning' },
            `Se está usando esta tensión de referencia manual: ningún caso climático tiene una fila en "Tensiones de tendido" para "${project.conductor.name}".`)
          : null
      ].filter(Boolean));
    }

    function renderHypothesesCard(project) {
      const rows = project.hypotheses.map((h) => renderRow(h, project));
      return el('div', { class: 'card' }, [
        el('h2', {}, 'Casos climáticos'),
        el('p', { class: 'muted' }, 'Mínimo 1 hipótesis.'),
        el('div', { class: 'table-wrap' }, [
          el('table', { class: 'data-table' }, [
            el('thead', {}, el('tr', {}, [
              el('th', {}, 'Nombre'),
              el('th', {}, 'Temp (°C)'),
              el('th', {}, 'Viento (m/s)'),
              el('th', {}, 'Hielo (mm)'),
              el('th', { class: 'col-actions' }, '')
            ])),
            el('tbody', {}, rows)
          ])
        ]),
        el('button', {
          class: 'btn toolbar-card-btn table-add-btn', type: 'button',
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
        el('td', { class: 'col-actions' }, el('button', {
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
              el('th', { class: 'col-actions' }, '')
            ])),
            el('tbody', {}, rows)
          ])
        ]),
        el('button', {
          class: 'btn toolbar-card-btn table-add-btn', type: 'button',
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

      // Misma marca visual (.is-reference) que ya usa la fila de la
      // hipótesis de referencia en Casos climáticos: acá se aplica a la
      // fila cuyo "Caso climático" coincide con esa hipótesis — la que
      // realmente está fijando la tensión instalada del conductor (ver
      // renderConductorCard/catenary.resolveReferenceTension), en vez de
      // dejar todas las filas con el mismo peso visual.
      const referenceHypothesis = project.hypotheses.find((h) => h.id === project.conductor.referenceHypothesisId) || project.hypotheses[0];
      const isReference = !!referenceHypothesis && item.weatherCase === referenceHypothesis.name;

      return el('tr', { class: isReference ? 'is-reference' : '' }, [
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
        el('td', { class: 'col-actions' }, el('button', {
          class: 'btn btn-small btn-danger', type: 'button',
          onClick: () => store.removeStringingTension(item.id)
        }, '×'))
      ]);
    }

    return { render };
  }

  global.LineDesignHypothesesView = { createHypothesesView };
})(typeof window !== 'undefined' ? window : globalThis);
