/**
 * catalogView.js — Pantalla de catálogo/editor de tipos de estructura.
 * Fase 1: dato simulado y editable en la propia app (ver prompt maestro §6.4).
 */
(function (global) {
  const { el, clear } = global.LineDesignDomUtil;
  const { svgEl } = global.LineDesignSvgUtil;

  // Retención y Ángulo anclan la línea (delimitan una sección de
  // tensionamiento); Suspensión y Paso no — el conductor las atraviesa sin
  // anclarse. Ver stationing.isAnchorStructure, que lee este mismo campo
  // `type` para el cálculo de tendido (vano regulador por sección).
  const STRUCTURE_TYPES = ['Suspensión', 'Ángulo', 'Retención', 'Paso'];

  // Cordón de acero galvanizado EHS (mismo material que dataSource.js#
  // sampleStructureCatalog usa para las resistencias de contraviento de
  // ejemplo) — referencia de qué talla comercial corresponde a cada
  // resistencia típica, para que no sean solo números sueltos.
  const GUY_RESISTANCE_REFERENCE = 'Valores típicos de cordón EHS galvanizado: 2722 kgF (1/4″) · 4082 kgF (5/16″) · 5987 kgF (3/8″) · 10896 kgF (1/2″).';

  function createCatalogView(container, store) {
    let editingId = null;
    let draftPoints = [];
    let diagramGroup = null; // <g> vigente del diagrama — se repuebla en updateDiagram(), sin rehacer el resto del formulario.

    function startNew() {
      editingId = null;
      draftPoints = [{ name: 'Fase A', offsetX: 0, offsetZ: 0 }];
      render(store.getProject());
    }

    function startEdit(type) {
      editingId = type.typeId;
      draftPoints = type.attachmentPoints.map((p) => ({ ...p }));
      render(store.getProject());
    }

    function render(project) {
      clear(container);

      const listCard = el('div', { class: 'card' }, [
        el('h2', {}, 'Tipos de estructura'),
        el('div', { class: 'catalog-grid' }, project.structureCatalog.map((type) => renderCard(type, project)))
      ]);

      container.appendChild(listCard);
      container.appendChild(renderForm(project));
    }

    function renderCard(type, project) {
      const inUse = project.structures.some((s) => s.typeId === type.typeId);
      return el('div', { class: 'catalog-card' }, [
        el('h3', {}, `${type.name}`),
        el('p', { class: 'muted' }, type.type),
        el('p', {}, `Alturas: ${type.heightOptions.join(', ')} m`),
        type.resistanceOptions && type.resistanceOptions.length
          ? el('p', {}, `Resistencias: ${type.resistanceOptions.join(', ')} kgF`)
          : null,
        type.guyResistanceOptions && type.guyResistanceOptions.length
          ? el('p', {}, `Resistencias de contraviento: ${type.guyResistanceOptions.join(', ')} kgF`)
          : null,
        el('p', {}, `Puntos de fijación: ${type.attachmentPoints.length}`),
        type.considerEmbedment ? el('p', { class: 'muted' }, 'Considera profundidad de enterramiento') : null,
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'btn btn-small', type: 'button', onClick: () => startEdit(type) }, 'Editar'),
          el('button', {
            class: 'btn btn-small btn-danger',
            type: 'button',
            disabled: inUse,
            title: inUse ? 'En uso por estructuras distribuidas' : '',
            onClick: () => {
              const result = store.removeCatalogType(type.typeId);
              if (result && !result.ok) alert(result.reason);
            }
          }, 'Eliminar')
        ])
      ]);
    }

    /**
     * Redibuja SOLO el diagrama (limpia y repuebla `diagramGroup`), sin
     * tocar el resto del formulario — así se puede llamar en cada tecla
     * que cambia un offsetX/offsetZ (ver renderPointRow) sin destruir el
     * <input> que tiene el foco (el mismo problema que ya se corrigió con
     * el resize del teclado virtual en móvil: reconstruir un campo con
     * foco le hace perder ese foco).
     */
    function updateDiagram() {
      if (!diagramGroup) return;
      clear(diagramGroup);

      const CX = 90; // centro horizontal del diagrama (offsetX = 0)
      const TOP_Y = 20; // la PUNTA del poste (offsetZ = 0) — offsetZ crece hacia abajo desde acá
      const GROUND_Y = 210; // el poste sigue hasta el piso (largo ilustrativo, no una heightOption específica)
      // Rango de referencia para la escala vertical: el punto más alejado
      // de la punta + margen, con un mínimo para que el diagrama no se
      // vea vacío con pocos puntos o todos muy cerca de la punta.
      const maxOffsetZ = Math.max(3, ...draftPoints.map((p) => p.offsetZ || 0)) * 1.3;
      const scaleZ = Math.min((GROUND_Y - TOP_Y) / maxOffsetZ, 14);
      // Ancho de referencia: el offsetX más alejado del eje + margen, con
      // un mínimo para que un solo punto centrado no quede sin escala.
      const maxOffsetX = Math.max(1.5, ...draftPoints.map((p) => Math.abs(p.offsetX || 0))) * 1.3;
      const scaleX = 70 / maxOffsetX;

      diagramGroup.appendChild(svgEl('line', {
        class: 'catalog-diagram-pole', x1: CX, y1: TOP_Y, x2: CX, y2: GROUND_Y
      }));
      diagramGroup.appendChild(svgEl('line', {
        class: 'catalog-diagram-ground', x1: 10, y1: GROUND_Y, x2: 170, y2: GROUND_Y
      }));

      draftPoints.forEach((p) => {
        const cx = CX + (p.offsetX || 0) * scaleX;
        const cy = TOP_Y + (p.offsetZ || 0) * scaleZ;
        diagramGroup.appendChild(svgEl('line', { class: 'catalog-diagram-arm', x1: CX, y1: cy, x2: cx, y2: cy }));
        diagramGroup.appendChild(svgEl('circle', { class: 'catalog-diagram-point', cx, cy, r: 4 }));
        // Centrada y encima del punto (no a los lados, con text-anchor
        // start/end): un punto cerca del borde izquierdo/derecho hacía que
        // la etiqueta se saliera del viewBox y quedara recortada.
        const label = svgEl('text', {
          class: 'catalog-diagram-label', x: cx, y: cy - 8, 'text-anchor': 'middle'
        });
        label.textContent = p.name || '';
        diagramGroup.appendChild(label);
      });
    }

    function renderPointRow(point, index) {
      return el('div', { class: 'point-row' }, [
        el('input', {
          type: 'text', value: point.name, placeholder: 'Nombre (fase)',
          onInput: (e) => { draftPoints[index].name = e.target.value; updateDiagram(); }
        }),
        el('input', {
          type: 'number', step: '0.1', value: point.offsetX,
          onInput: (e) => { draftPoints[index].offsetX = parseFloat(e.target.value) || 0; updateDiagram(); }
        }),
        el('input', {
          type: 'number', step: '0.1', value: point.offsetZ,
          onInput: (e) => { draftPoints[index].offsetZ = parseFloat(e.target.value) || 0; updateDiagram(); }
        }),
        el('button', {
          class: 'btn btn-small btn-danger', type: 'button',
          onClick: () => {
            draftPoints.splice(index, 1);
            render(store.getProject());
          }
        }, '×')
      ]);
    }

    function renderForm(project) {
      const editingType = editingId ? project.structureCatalog.find((t) => t.typeId === editingId) : null;
      const nameInput = el('input', { type: 'text', value: editingType ? editingType.name : '', id: 'catalog-name-input' });
      const typeSelect = el('select', { id: 'catalog-type-select' },
        STRUCTURE_TYPES.map((t) => el('option', { value: t, selected: editingType && editingType.type === t }, t)));
      const heightInput = el('input', {
        type: 'text', id: 'catalog-heights-input',
        value: editingType ? editingType.heightOptions.join(', ') : '15, 18',
        placeholder: 'Ej: 12, 15, 18'
      });
      const resistanceInput = el('input', {
        type: 'text', id: 'catalog-resistances-input',
        value: editingType && editingType.resistanceOptions ? editingType.resistanceOptions.join(', ') : '',
        placeholder: 'Ej: 510, 750, 1050, 1350'
      });
      const guyResistanceInput = el('input', {
        type: 'text', id: 'catalog-guy-resistances-input',
        value: editingType && editingType.guyResistanceOptions ? editingType.guyResistanceOptions.join(', ') : '',
        placeholder: 'Ej: 2722, 4082, 5987, 10896 (solo aplica a Ángulo/Retención)'
      });
      // Si se activa, la "altura" del catálogo deja de ser toda libre sobre
      // el terreno: se le resta la profundidad de enterramiento/empotramiento
      // (criterio estándar de postes: 10% de la altura + 0.6 m) — esa parte
      // queda bajo tierra. Afecta dónde se dibuja la punta del poste en
      // Perfil, dónde cuelga el conductor (attachmentPoints) y el momento
      // admisible de "Cumple poste" — ver loadTree.js#structureAboveGroundHeight.
      // Por defecto ENCENDIDO para un tipo nuevo (es lo real en la mayoría
      // de postes) — al editar uno existente se respeta su valor guardado,
      // aunque no se haya definido explícitamente (proyectos de antes de
      // esta opción se tratan como "No" para no cambiarles el cálculo de
      // golpe sin que el usuario lo pida — ver loadTree.js#structureAboveGroundHeight).
      const defaultConsiderEmbedment = editingType ? !!editingType.considerEmbedment : true;
      const embedmentSelect = el('select', { id: 'catalog-embedment-select' }, [
        el('option', { value: 'no', selected: !defaultConsiderEmbedment }, 'No'),
        el('option', { value: 'si', selected: defaultConsiderEmbedment }, 'Sí')
      ]);

      // Fila de encabezado (mismas columnas que .point-row, ver CSS): antes
      // solo el placeholder decía qué campo era cuál, y desaparecía en
      // cuanto se escribía algo — quedaba ambiguo cuál offset es horizontal
      // y cuál vertical.
      const pointsHeader = el('div', { class: 'point-row point-row--header' }, [
        el('span', { class: 'point-row-label' }, 'Nombre'),
        el('span', { class: 'point-row-label' }, 'X — horizontal (m)'),
        el('span', { class: 'point-row-label', title: 'Distancia bajo la punta del poste, no altura sobre el piso — así el punto sigue siendo válido sin importar qué altura (de las disponibles) se elija para una estructura en particular.' }, 'Z — bajo la punta (m)'),
        el('span', {})
      ]);
      const pointsContainer = el('div', { class: 'points-editor' }, [pointsHeader, ...draftPoints.map(renderPointRow)]);

      const diagramSvg = svgEl('svg', { class: 'catalog-diagram', viewBox: '0 0 180 220', role: 'img', 'aria-label': 'Esquema de puntos de fijación' });
      diagramGroup = svgEl('g');
      diagramSvg.appendChild(diagramGroup);
      updateDiagram();

      const form = el('form', {
        class: 'form-card catalog-form',
        onSubmit: (evt) => {
          evt.preventDefault();
          const heightOptions = heightInput.value.split(',').map((v) => parseFloat(v.trim())).filter((v) => !Number.isNaN(v));
          if (!heightOptions.length) {
            alert('Ingresa al menos una altura válida.');
            return;
          }
          if (!draftPoints.length) {
            alert('Agrega al menos un punto de fijación.');
            return;
          }
          const resistanceOptions = resistanceInput.value.split(',').map((v) => parseFloat(v.trim())).filter((v) => !Number.isNaN(v));
          const guyResistanceOptions = guyResistanceInput.value.split(',').map((v) => parseFloat(v.trim())).filter((v) => !Number.isNaN(v));
          const payload = {
            name: nameInput.value.trim() || 'Sin nombre',
            type: typeSelect.value,
            heightOptions,
            resistanceOptions,
            guyResistanceOptions,
            considerEmbedment: embedmentSelect.value === 'si',
            attachmentPoints: draftPoints.map((p) => ({ ...p }))
          };
          if (editingId) {
            store.updateCatalogType(editingId, payload);
          } else {
            store.addCatalogType(payload);
          }
          startNew();
        }
      }, [
        el('h2', {}, editingType ? `Editar ${editingType.name}` : 'Nuevo tipo de estructura'),
        el('div', { class: 'catalog-form-split' }, [
          el('div', { class: 'catalog-form-fields' }, [
            el('label', {}, 'Nombre'),
            nameInput,
            el('label', {}, 'Categoría'),
            typeSelect,
            el('label', {}, 'Alturas disponibles (m, separadas por coma)'),
            heightInput,
            el('label', {
              title: 'Resta la profundidad de enterramiento (10% de la altura + 0.6 m) de la altura disponible — esa parte del poste queda bajo tierra, no libre sobre el terreno. Afecta cómo se dibuja en Perfil y el cálculo de "Cumple poste".'
            }, 'Tener en cuenta profundidad de enterramiento/empotramiento'),
            embedmentSelect,
            el('label', {}, 'Resistencias disponibles (kgF, separadas por coma)'),
            resistanceInput,
            el('label', {}, 'Resistencias de contraviento disponibles (kgF, separadas por coma)'),
            guyResistanceInput,
            el('p', { class: 'muted conductor-specs' }, GUY_RESISTANCE_REFERENCE),
            el('label', {}, 'Puntos de fijación del conductor'),
            pointsContainer,
            el('button', {
              class: 'btn btn-small add-point-btn', type: 'button',
              onClick: () => {
                draftPoints.push({ name: `Fase ${draftPoints.length + 1}`, offsetX: 0, offsetZ: 0 });
                render(store.getProject());
              }
            }, '+ agregar punto de fijación')
          ]),
          // Esquema del poste con los puntos de fijación ubicados a escala
          // (X horizontal desde el eje, Z altura desde el piso) — se
          // actualiza en vivo con cada tecla vía updateDiagram(), sin
          // reconstruir el formulario (ver comentario ahí).
          el('div', { class: 'catalog-form-diagram' }, [diagramSvg])
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'btn toolbar-card-btn', type: 'submit' }, editingId ? 'Guardar cambios' : 'Crear tipo'),
          editingId ? el('button', { class: 'btn btn-small', type: 'button', onClick: startNew }, 'Cancelar') : null
        ])
      ]);

      return form;
    }

    if (!draftPoints.length) draftPoints = [{ name: 'Fase A', offsetX: 0, offsetZ: 0 }];

    return { render };
  }

  global.LineDesignCatalogView = { createCatalogView };
})(typeof window !== 'undefined' ? window : globalThis);
