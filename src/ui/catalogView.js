/**
 * catalogView.js — Pantalla de catálogo/editor de tipos de estructura.
 * Fase 1: dato simulado y editable en la propia app (ver prompt maestro §6.4).
 */
(function (global) {
  const { el, clear } = global.LineDesignDomUtil;

  // Retención y Ángulo anclan la línea (delimitan una sección de
  // tensionamiento); Suspensión y Paso no — el conductor las atraviesa sin
  // anclarse. Ver stationing.isAnchorStructure, que lee este mismo campo
  // `type` para el cálculo de tendido (vano regulador por sección).
  const STRUCTURE_TYPES = ['Suspensión', 'Ángulo', 'Retención', 'Paso'];

  function createCatalogView(container, store) {
    let editingId = null;
    let draftPoints = [];

    function startNew() {
      editingId = null;
      draftPoints = [{ name: 'Fase A', offsetX: 0, offsetZ: 15 }];
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
        el('p', { class: 'muted' }, `${type.type} · ${type.typeId}`),
        el('p', {}, `Alturas: ${type.heightOptions.join(', ')} m`),
        type.resistanceOptions && type.resistanceOptions.length
          ? el('p', {}, `Resistencias: ${type.resistanceOptions.join(', ')} kgF`)
          : null,
        el('p', {}, `Puntos de fijación: ${type.attachmentPoints.length}`),
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

    function renderPointRow(point, index) {
      return el('div', { class: 'point-row' }, [
        el('input', {
          type: 'text', value: point.name, placeholder: 'Nombre (fase)',
          onInput: (e) => { draftPoints[index].name = e.target.value; }
        }),
        el('input', {
          type: 'number', step: '0.1', value: point.offsetX, placeholder: 'offsetX (m)',
          onInput: (e) => { draftPoints[index].offsetX = parseFloat(e.target.value) || 0; }
        }),
        el('input', {
          type: 'number', step: '0.1', value: point.offsetZ, placeholder: 'offsetZ (m)',
          onInput: (e) => { draftPoints[index].offsetZ = parseFloat(e.target.value) || 0; }
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

      const pointsContainer = el('div', { class: 'points-editor' }, draftPoints.map(renderPointRow));

      const form = el('form', {
        class: 'form-card',
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
          const payload = {
            name: nameInput.value.trim() || 'Sin nombre',
            type: typeSelect.value,
            heightOptions,
            resistanceOptions,
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
        el('h2', {}, editingId ? `Editar ${editingId}` : 'Nuevo tipo de estructura'),
        el('label', {}, 'Nombre'),
        nameInput,
        el('label', {}, 'Categoría'),
        typeSelect,
        el('label', {}, 'Alturas disponibles (m, separadas por coma)'),
        heightInput,
        el('label', {}, 'Resistencias disponibles (kgF, separadas por coma)'),
        resistanceInput,
        el('label', {}, 'Puntos de fijación del conductor'),
        pointsContainer,
        el('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            draftPoints.push({ name: `Fase ${draftPoints.length + 1}`, offsetX: 0, offsetZ: 15 });
            render(store.getProject());
          }
        }, '+ agregar punto de fijación'),
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'btn btn-primary', type: 'submit' }, editingId ? 'Guardar cambios' : 'Crear tipo'),
          editingId ? el('button', { class: 'btn btn-small', type: 'button', onClick: startNew }, 'Cancelar') : null
        ])
      ]);

      return form;
    }

    if (!draftPoints.length) draftPoints = [{ name: 'Fase A', offsetX: 0, offsetZ: 15 }];

    return { render };
  }

  global.LineDesignCatalogView = { createCatalogView };
})(typeof window !== 'undefined' ? window : globalThis);
