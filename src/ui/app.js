/**
 * app.js — Orquestador de la aplicación: estado de UI (selección, pantalla
 * activa, hipótesis mostrada en el perfil), wiring de la navegación entre
 * pantallas, la barra de herramientas y la barra de estado, y disparo de
 * render de cada vista al cambiar el proyecto (patrón: store.subscribe(render)).
 */
(function () {
  const store = window.LineDesignStore;
  const stationing = window.LineDesignStationing;
  const catenary = window.LineDesignCatenary;
  const loadTree = window.LineDesignLoadTree;
  const geo = window.LineDesignGeo;
  const elevationSource = window.LineDesignElevationSource;
  const kmzImport = window.LineDesignKmzImport;
  const { el, clear } = window.LineDesignDomUtil;
  const { downloadFile } = window.LineDesignSvgUtil;

  const planSvg = document.getElementById('plan-svg');
  const planMapContainer = document.getElementById('plan-map');
  const planMapToggle = document.getElementById('plan-map-toggle');
  const splitView = document.querySelector('.split-view');
  const splitDivider = document.getElementById('split-divider');
  const profileSvg = document.getElementById('profile-svg');
  const summaryList = document.getElementById('summary-list');
  const projectNameInput = document.getElementById('project-name-input');
  const themeToggle = document.getElementById('theme-toggle');
  const conductorColorInput = document.getElementById('conductor-color-input');
  const structureColorInput = document.getElementById('structure-color-input');
  const resetColorsBtn = document.getElementById('reset-colors-btn');
  const inspectorPanel = document.getElementById('inspector-body');
  const inspectorAside = document.getElementById('inspector-panel');
  const inspectorToggle = document.getElementById('inspector-toggle');
  const structuresTableBody = document.getElementById('structures-table-body');
  const structuresTableCount = document.getElementById('structures-table-count');
  const alignmentTableBody = document.getElementById('alignment-table-body');
  const alignmentTableCount = document.getElementById('alignment-table-count');
  const newStructureType = document.getElementById('new-structure-type');
  const newStructureStation = document.getElementById('new-structure-station');
  const planHypothesisSelect = document.getElementById('plan-hypothesis-select');
  const groundClearanceInput = document.getElementById('ground-clearance-input');
  const rightOfWayInput = document.getElementById('right-of-way-input');
  const profileVExagSelect = document.getElementById('profile-vexag-select');
  const terrainFetchBtn = document.getElementById('terrain-fetch-btn');
  const sagLabelsToggle = document.getElementById('sag-labels-toggle');
  const kmzImportBtn = document.getElementById('kmz-import-btn');
  const kmzImportFile = document.getElementById('kmz-import-file');
  const kmzImportPicker = document.getElementById('kmz-import-picker');
  const kmzImportCandidates = document.getElementById('kmz-import-candidates');
  const kmzImportInvert = document.getElementById('kmz-import-invert');
  const kmzImportConfirm = document.getElementById('kmz-import-confirm');
  const kmzImportCancel = document.getElementById('kmz-import-cancel');
  const screenTitle = document.getElementById('screen-title');
  const statusCoords = document.getElementById('status-coords');
  const statusSummary = document.getElementById('status-summary');
  const statusZoom = document.getElementById('status-zoom');
  const statusMessage = document.getElementById('status-message');
  const workspaceBody = document.querySelector('.workspace-body');

  let selection = null;
  let planHypothesisId = null;
  const zoomLevels = { plan: 1, profile: 1 };
  let statusMessageTimer = null;
  let kmzCandidates = [];

  function roundTo4(value) {
    return Math.round(value * 10000) / 10000;
  }

  function onSelect(sel) {
    selection = sel;
    render(store.getProject());
  }

  function onDeselect() {
    selection = null;
    render(store.getProject());
  }

  function showStatusMessage(text) {
    statusMessage.textContent = text;
    window.clearTimeout(statusMessageTimer);
    statusMessageTimer = window.setTimeout(() => { statusMessage.textContent = ''; }, 2500);
  }

  function updateStatusZoom() {
    statusZoom.textContent = `Planta ${Math.round(zoomLevels.plan * 100)}% · Perfil ${Math.round(zoomLevels.profile * 100)}%`;
  }

  // Si "Tensiones de tendido" tiene filas cargadas pero ninguna aplica al
  // conductor + caso climático de referencia vigentes (el que define
  // conductor.referenceHypothesisId en la tarjeta Conductor, NO el
  // selector "Catenaria bajo hipótesis" de Planta y Perfil — ese solo
  // cambia qué hipótesis se VE dibujada), NO se usa la tensión horizontal
  // de referencia manual como respaldo silencioso: se busca otra hipótesis
  // que sí tenga fila para este conductor y se cambia la referencia a esa
  // automáticamente (store.updateConductor dispara notify() -> render(),
  // así que este mismo chequeo se vuelve a correr y ya coincidirá). Si
  // NINGUNA hipótesis tiene fila para el conductor, no hay a qué cambiar —
  // ahí sí se cae al valor manual, pero el aviso persistente (no un popup
  // que se cierra solo) vive directamente en la tarjeta Conductor, ver
  // hypothesesView.js#renderConductorCard.
  function checkStringingCriteria(project) {
    if (!project.stringingTensions.length) return;
    const referenceHypothesis = loadTree.getReferenceHypothesis(project);
    const currentMatched = catenary.findStringingRows(project.conductor, referenceHypothesis, project.stringingTensions).length > 0;
    if (currentMatched) return;

    const candidate = project.hypotheses.find((h) =>
      h.id !== referenceHypothesis.id &&
      catenary.findStringingRows(project.conductor, h, project.stringingTensions).length > 0
    );
    if (candidate) {
      store.updateConductor({ referenceHypothesisId: candidate.id });
      showStatusMessage(`Hipótesis de referencia cambiada automáticamente a "${candidate.name}" — es la que tiene datos en "Tensiones de tendido" para "${project.conductor.name}".`);
    }
  }

  const planView = window.LineDesignPlanView.createPlanView(planSvg, planMapContainer, {
    onSelect,
    onDeselect,
    onCommitVertexMove: (id, x, y) => store.moveVertex(id, x, y),
    onCommitStructureMove: (id, station) => store.moveStructure(id, station),
    onStructureDragMove: (id, station) => {
      const project = store.getProject();
      const draftProject = { ...project, structures: project.structures.map((s) => (s.id === id ? { ...s, station } : s)) };
      profileView.render(draftProject, planHypothesisId, { type: 'structure', id });
    },
    onVertexDragMove: (id, x, y) => {
      const project = store.getProject();
      const draftProject = {
        ...project,
        alignment: {
          ...project.alignment,
          vertices: project.alignment.vertices.map((v) => (v.id === id ? { ...v, x, y } : v))
        }
      };
      profileView.render(draftProject, planHypothesisId, { type: 'vertex', id });
    },
    onZoomChange: (scale) => { zoomLevels.plan = scale; updateStatusZoom(); },
    onHover: (dataPoint) => {
      if (!dataPoint) {
        statusCoords.textContent = '—';
        profileView.hideSyncMarker();
        return;
      }
      let text = `E: ${dataPoint.x.toFixed(1)} m · N: ${dataPoint.y.toFixed(1)} m`;
      try {
        const latLon = geo.epsg9377ToLatLon(dataPoint.x, dataPoint.y);
        text += ` · ${latLon.lat.toFixed(5)}, ${latLon.lon.toFixed(5)}`;
      } catch (error) {
        console.warn('No se pudo calcular lat/lon:', error);
      }
      statusCoords.textContent = text;
      const station = stationing.nearestStation(store.getProject().alignment.vertices, dataPoint);
      profileView.showSyncMarker(station);
    }
  });

  const profileView = window.LineDesignProfileView.createProfileView(profileSvg, {
    onSelect,
    onDeselect,
    onCommitStructureMove: (id, station) => store.moveStructure(id, station),
    onStructureDragMove: (id, station) => {
      const project = store.getProject();
      const draftProject = { ...project, structures: project.structures.map((s) => (s.id === id ? { ...s, station } : s)) };
      planView.render(draftProject, { type: 'structure', id });
    },
    onZoomChange: (scale) => { zoomLevels.profile = scale; updateStatusZoom(); },
    onHover: (data) => {
      if (!data) {
        statusCoords.textContent = '—';
        planView.hideSyncMarker();
        return;
      }
      statusCoords.textContent = `Station: ${data.station.toFixed(1)} m · Elevación: ${data.elevation.toFixed(1)} m`;
      planView.showSyncMarker(data.station);
    }
  });

  try {
    const savedVExag = parseFloat(localStorage.getItem('linedesign-profile-vexag'));
    if (Number.isFinite(savedVExag) && savedVExag > 0) profileView.setVerticalExaggeration(savedVExag);
  } catch (error) {
    console.warn('No se pudo leer la exageración vertical guardada:', error);
  }
  profileVExagSelect.value = String(profileView.getVerticalExaggeration());

  function setPlanMapVisible(visible) {
    planView.setMapVisible(visible);
    planMapToggle.setAttribute('aria-pressed', String(visible));
    planMapToggle.classList.toggle('is-active', visible);
    planMapToggle.title = visible ? 'Ocultar mapa base' : 'Mostrar mapa base';
  }

  try {
    setPlanMapVisible(localStorage.getItem('linedesign-plan-map') === 'true');
  } catch (error) {
    console.warn('No se pudo leer el estado del mapa base:', error);
  }

  function setSagLabelsVisible(visible) {
    profileView.setSagLabelsVisible(visible);
    sagLabelsToggle.setAttribute('aria-pressed', String(visible));
    sagLabelsToggle.classList.toggle('is-active', visible);
    sagLabelsToggle.title = visible ? 'Ocultar valores de flecha' : 'Mostrar valores de flecha';
  }

  try {
    setSagLabelsVisible(localStorage.getItem('linedesign-sag-labels') !== 'false');
  } catch (error) {
    console.warn('No se pudo leer el estado de los valores de flecha:', error);
  }

  // Reparto Planta/Perfil (arrastre del divisor entre las dos ventanas):
  // --split-plan es el ancho de Planta como porcentaje; Perfil toma el
  // resto (flex: 1 1 auto). Clampado para que ninguna de las dos quede
  // demasiado angosta para ser útil.
  function setSplitRatio(percent) {
    const clamped = Math.min(80, Math.max(20, percent));
    splitView.style.setProperty('--split-plan', `${clamped}%`);
    return clamped;
  }

  try {
    const savedSplit = parseFloat(localStorage.getItem('linedesign-split-ratio'));
    setSplitRatio(Number.isFinite(savedSplit) ? savedSplit : 50);
  } catch (error) {
    console.warn('No se pudo leer el reparto Planta/Perfil guardado:', error);
  }

  // Colores del lienzo (Configuración): por defecto siguen al tema
  // (--conductor-color/--structure-color referencian --warning/--accent en
  // styles.css), pero el usuario puede fijar un color propio — se guarda
  // como override inline en <html>, que gana sobre la referencia de tema
  // sin importar si después se cambia claro/oscuro.
  function defaultConductorColor() {
    return document.body.classList.contains('dark-theme') ? '#f0a63f' : '#b45309';
  }

  function defaultStructureColor() {
    return document.body.classList.contains('dark-theme') ? '#2dd4bf' : '#0d9488';
  }

  try {
    const savedConductorColor = localStorage.getItem('linedesign-conductor-color');
    if (savedConductorColor) document.documentElement.style.setProperty('--conductor-color', savedConductorColor);
    conductorColorInput.value = savedConductorColor || defaultConductorColor();
  } catch (error) {
    console.warn('No se pudo leer el color de conductores guardado:', error);
    conductorColorInput.value = defaultConductorColor();
  }

  try {
    const savedStructureColor = localStorage.getItem('linedesign-structure-color');
    if (savedStructureColor) document.documentElement.style.setProperty('--structure-color', savedStructureColor);
    structureColorInput.value = savedStructureColor || defaultStructureColor();
  } catch (error) {
    console.warn('No se pudo leer el color de postes guardado:', error);
    structureColorInput.value = defaultStructureColor();
  }

  const catalogView = window.LineDesignCatalogView.createCatalogView(document.getElementById('catalog-container'), store);
  const hypothesesView = window.LineDesignHypothesesView.createHypothesesView(document.getElementById('hypotheses-container'), store);
  const loadTreeView = window.LineDesignLoadTreeView.createLoadTreeView(document.getElementById('loadtree-container'));

  function renderSummary(project) {
    const { spans } = stationing.computeSpans(project.structures);
    const totalLength = stationing.totalLength(project.alignment.vertices);
    summaryList.innerHTML = '';
    [
      `Vértices: ${project.alignment.vertices.length}`,
      `Estructuras: ${project.structures.length}`,
      `Vanos: ${spans.length}`,
      `Longitud: ${totalLength.toFixed(1)} m`,
      `Conductor: ${project.conductor.name}`,
      `Hipótesis: ${project.hypotheses.length}`
    ].forEach((text) => summaryList.appendChild(el('li', {}, text)));

    statusSummary.textContent = `Vértices ${project.alignment.vertices.length} · Estructuras ${project.structures.length} · Vanos ${spans.length} · ${totalLength.toFixed(1)} m`;
  }

  function syncStructureTypeOptions(project) {
    const current = newStructureType.value;
    clear(newStructureType);
    project.structureCatalog.forEach((type) => {
      newStructureType.appendChild(el('option', { value: type.typeId }, type.name));
    });
    if (project.structureCatalog.some((t) => t.typeId === current)) newStructureType.value = current;
  }

  function syncPlanHypothesisOptions(project) {
    if (!project.hypotheses.some((h) => h.id === planHypothesisId)) {
      planHypothesisId = project.conductor.referenceHypothesisId || project.hypotheses[0].id;
    }
    clear(planHypothesisSelect);
    project.hypotheses.forEach((h) => {
      planHypothesisSelect.appendChild(el('option', { value: h.id, selected: h.id === planHypothesisId }, h.name));
    });
  }

  function goToPlanScreen() {
    const planBtn = document.querySelector('.nav-btn[data-screen="plan"]');
    if (planBtn && !planBtn.classList.contains('is-active')) planBtn.click();
  }

  function fmtNum(value, decimals) {
    return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(decimals);
  }

  function rowClickTo(type, id) {
    return () => { selection = { type, id }; goToPlanScreen(); render(store.getProject()); };
  }

  /**
   * Tabla de estructuras (Resumen): una fila por estructura con su vano,
   * flecha y distancia al terreno del VANO ADELANTE (hacia la siguiente
   * estructura) — la última estructura no tiene vano adelante, esas
   * columnas quedan en "—". Reusa loadTree.computeSpanTensions (misma
   * tensión/hipótesis de referencia que ya usa el árbol de cargas) en vez
   * de recalcular la tensión de vano por separado.
   */
  function renderStructuresTable(project) {
    structuresTableCount.textContent = `(${project.structures.length})`;
    clear(structuresTableBody);

    const referenceHypothesis = loadTree.getReferenceHypothesis(project);
    const { sorted, spans } = loadTree.computeSpanTensions(project, referenceHypothesis.id);
    const terrainProfile = project.alignment.terrainProfile;
    const vertices = project.alignment.vertices;

    sorted.forEach((structure, index) => {
      const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);
      const span = spans[index]; // vano hacia sorted[index + 1], undefined en la última estructura
      let vanoAdelante = null;
      let flecha = null;
      let minClearance = null;

      if (span) {
        const to = sorted[index + 1];
        const fromTop = structure.z + structure.height;
        const toTop = to.z + to.height;
        const curve = catenary.catenaryCurve({
          span: span.length,
          heightDiff: toTop - fromTop,
          H: span.horizontalTension,
          unitWeight: span.verticalUnitWeight
        });
        vanoAdelante = span.length;
        flecha = curve.sag;
        minClearance = curve.points.reduce((min, p) => {
          const station = structure.station + p.x;
          const terrainZ = terrainProfile
            ? stationing.elevationAtStation(terrainProfile, station)
            : stationing.pointAtStation(vertices, station).z;
          return Math.min(min, (fromTop + p.y) - terrainZ);
        }, Infinity);
      }

      const isSelected = selection && selection.type === 'structure' && selection.id === structure.id;
      structuresTableBody.appendChild(el('tr', {
        class: `is-clickable${isSelected ? ' is-active' : ''}`,
        onClick: rowClickTo('structure', structure.id)
      }, [
        el('td', {}, structure.id),
        el('td', {}, type ? type.name : structure.typeId),
        el('td', {}, fmtNum(structure.station, 1)),
        el('td', {}, fmtNum(structure.height, 1)),
        el('td', {}, fmtNum(structure.z, 1)),
        el('td', {}, fmtNum(structure.z + structure.height, 1)),
        el('td', {}, structure.resistance ? fmtNum(structure.resistance, 0) : '—'),
        el('td', {}, fmtNum(vanoAdelante, 1)),
        el('td', {}, fmtNum(flecha, 2)),
        el('td', {}, fmtNum(minClearance, 1))
      ]));
    });
  }

  function renderAlignmentTable(project) {
    const vertices = project.alignment.vertices;
    alignmentTableCount.textContent = `(${vertices.length})`;
    clear(alignmentTableBody);

    const distances = stationing.cumulativeDistances(vertices);
    vertices.forEach((vertex, index) => {
      const isSelected = selection && selection.type === 'vertex' && selection.id === vertex.id;
      alignmentTableBody.appendChild(el('tr', {
        class: `is-clickable${isSelected ? ' is-active' : ''}`,
        onClick: rowClickTo('vertex', vertex.id)
      }, [
        el('td', {}, vertex.id),
        el('td', {}, fmtNum(distances[index], 1)),
        el('td', {}, fmtNum(vertex.x, 2)),
        el('td', {}, fmtNum(vertex.y, 2)),
        el('td', {}, fmtNum(vertex.z, 1))
      ]));
    });
  }

  function renderInspector(project) {
    if (selection && selection.type === 'vertex' && !project.alignment.vertices.some((v) => v.id === selection.id)) selection = null;
    if (selection && selection.type === 'structure' && !project.structures.some((s) => s.id === selection.id)) selection = null;
    if (selection && selection.type === 'span') {
      const [fromId, toId] = selection.id.split('->');
      const stillExists = project.structures.some((s) => s.id === fromId) && project.structures.some((s) => s.id === toId);
      if (!stillExists) selection = null;
    }

    clear(inspectorPanel);

    if (!selection) {
      inspectorPanel.appendChild(el('p', { class: 'muted inspector-hint' },
        'Selecciona un vértice, estructura o vano en el lienzo para ver y editar sus propiedades.'));
      return;
    }

    if (selection.type === 'vertex') {
      const vertex = project.alignment.vertices.find((v) => v.id === selection.id);
      inspectorPanel.appendChild(el('div', { class: 'inspector-title' }, `Vértice ${vertex.id}`));
      inspectorPanel.appendChild(el('label', {}, 'Este (m) — EPSG:9377'));
      inspectorPanel.appendChild(el('input', {
        type: 'number', step: '0.5', value: roundTo4(vertex.x),
        onChange: (e) => store.moveVertex(vertex.id, parseFloat(e.target.value) || 0, vertex.y)
      }));
      inspectorPanel.appendChild(el('label', {}, 'Norte (m) — EPSG:9377'));
      inspectorPanel.appendChild(el('input', {
        type: 'number', step: '0.5', value: roundTo4(vertex.y),
        onChange: (e) => store.moveVertex(vertex.id, vertex.x, parseFloat(e.target.value) || 0)
      }));
      inspectorPanel.appendChild(el('label', {}, 'Elevación z (m)'));
      inspectorPanel.appendChild(el('input', {
        type: 'number', step: '0.5', value: vertex.z,
        onChange: (e) => store.setVertexElevation(vertex.id, parseFloat(e.target.value) || 0)
      }));
      inspectorPanel.appendChild(el('button', {
        class: 'btn btn-small btn-danger inspector-delete', type: 'button',
        onClick: () => {
          const result = store.removeVertex(vertex.id);
          if (result && !result.ok) { alert(result.reason); return; }
          showStatusMessage(`Vértice ${vertex.id} eliminado.`);
          selection = null;
          render(store.getProject());
        }
      }, 'Eliminar vértice'));
    } else if (selection.type === 'structure') {
      const structure = project.structures.find((s) => s.id === selection.id);
      const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);

      inspectorPanel.appendChild(el('div', { class: 'inspector-title' }, `Estructura ${structure.id}`));

      inspectorPanel.appendChild(el('label', {}, 'Tipo'));
      inspectorPanel.appendChild(el('select', {
        onChange: (e) => {
          const newType = project.structureCatalog.find((t) => t.typeId === e.target.value);
          const resistance = newType.resistanceOptions && newType.resistanceOptions.length ? newType.resistanceOptions[0] : undefined;
          store.updateStructure(structure.id, { typeId: newType.typeId, height: newType.heightOptions[0], resistance });
        }
      }, project.structureCatalog.map((t) => el('option', { value: t.typeId, selected: t.typeId === structure.typeId }, t.name))));

      inspectorPanel.appendChild(el('label', {}, 'Altura (m)'));
      inspectorPanel.appendChild(el('select', {
        onChange: (e) => store.updateStructure(structure.id, { height: parseFloat(e.target.value) })
      }, (type ? type.heightOptions : [structure.height]).map((h) => el('option', { value: h, selected: h === structure.height }, `${h} m`))));

      if (type && type.resistanceOptions && type.resistanceOptions.length) {
        inspectorPanel.appendChild(el('label', {}, 'Resistencia (kgF)'));
        inspectorPanel.appendChild(el('select', {
          onChange: (e) => store.updateStructure(structure.id, { resistance: parseFloat(e.target.value) })
        }, type.resistanceOptions.map((r) => el('option', { value: r, selected: r === structure.resistance }, `${r} kgF`))));
      }

      inspectorPanel.appendChild(el('label', {}, 'Station (m)'));
      inspectorPanel.appendChild(el('input', {
        type: 'number', step: '1', value: structure.station.toFixed(1),
        onChange: (e) => store.moveStructure(structure.id, parseFloat(e.target.value) || 0)
      }));

      inspectorPanel.appendChild(el('button', {
        class: 'btn btn-small inspector-action', type: 'button',
        onClick: () => {
          const vertices = project.alignment.vertices;
          const distances = stationing.cumulativeDistances(vertices);
          let nearestIndex = 0;
          let nearestDiff = Infinity;
          distances.forEach((d, i) => {
            const diff = Math.abs(d - structure.station);
            if (diff < nearestDiff) { nearestDiff = diff; nearestIndex = i; }
          });
          store.moveStructure(structure.id, distances[nearestIndex]);
          showStatusMessage(`Estructura ${structure.id} ajustada al vértice ${vertices[nearestIndex].id}.`);
        }
      }, 'Ajustar al vértice más cercano'));

      inspectorPanel.appendChild(el('button', {
        class: 'btn btn-small btn-danger inspector-delete', type: 'button',
        onClick: () => {
          store.removeStructure(structure.id);
          showStatusMessage(`Estructura ${structure.id} eliminada.`);
          selection = null;
          render(store.getProject());
        }
      }, 'Eliminar estructura'));
    } else {
      // selection.type === 'span': por ahora la única propiedad editable
      // de un vano es el conductor del proyecto (uno solo, global — no hay
      // todavía un conductor distinto por vano, ver comentario en
      // profileView.js).
      const [fromId, toId] = selection.id.split('->');
      inspectorPanel.appendChild(el('div', { class: 'inspector-title' }, `Vano ${fromId} → ${toId}`));

      inspectorPanel.appendChild(el('label', {}, 'Conductor'));
      inspectorPanel.appendChild(el('select', {
        onChange: (e) => store.setConductor(e.target.value)
      }, project.conductorCatalog.map((c) => el('option', { value: c.id, selected: c.id === project.conductor.id }, c.name))));

      inspectorPanel.appendChild(el('p', { class: 'muted conductor-specs' },
        `Diámetro ${project.conductor.diameter} m · Peso ${project.conductor.weightPerLength} N/m · RTS ${project.conductor.ultimateStrength} N`));
    }
  }

  function render(project) {
    // Cada vista rehace su contenido con clear()+rebuild (no hay diffing):
    // al vaciar un contenedor dentro de .workspace-body, su scrollHeight cae
    // a 0 por un instante y el navegador recorta scrollTop a ese mínimo de
    // inmediato — el efecto visible es que la pantalla "salta" al inicio en
    // cada edición (más notorio en tarjetas largas, como Tensiones de
    // tendido, que quedan más abajo). Se guarda y restaura el scroll
    // alrededor del rebuild para que la posición no se pierda.
    const scrollTop = workspaceBody ? workspaceBody.scrollTop : 0;

    projectNameInput.value = project.name;
    groundClearanceInput.value = project.groundClearance;
    rightOfWayInput.value = project.rightOfWayWidth;
    renderSummary(project);
    syncStructureTypeOptions(project);
    syncPlanHypothesisOptions(project);
    renderStructuresTable(project);
    renderAlignmentTable(project);
    renderInspector(project);

    planView.render(project, selection);
    profileView.render(project, planHypothesisId, selection);
    catalogView.render(project);
    hypothesesView.render(project);
    loadTreeView.render(project);

    if (workspaceBody) workspaceBody.scrollTop = scrollTop;

    checkStringingCriteria(project);
  }

  function wireToolbar() {
    document.getElementById('add-vertex-btn').addEventListener('click', () => {
      const vertex = store.addVertex();
      showStatusMessage(`Vértice ${vertex.id} agregado.`);
    });

    document.getElementById('add-structure-btn').addEventListener('click', () => {
      const typeId = newStructureType.value;
      const stationValue = newStructureStation.value === '' ? undefined : parseFloat(newStructureStation.value);
      const structure = store.addStructure({ typeId, station: stationValue });
      selection = { type: 'structure', id: structure.id };
      newStructureStation.value = '';
      showStatusMessage(`Estructura ${structure.id} agregada.`);
      render(store.getProject());
    });

    planHypothesisSelect.addEventListener('change', (e) => {
      planHypothesisId = e.target.value;
      render(store.getProject());
    });

    profileVExagSelect.addEventListener('change', (e) => {
      const factor = parseFloat(e.target.value);
      profileView.setVerticalExaggeration(factor);
      try {
        localStorage.setItem('linedesign-profile-vexag', String(factor));
      } catch (error) {
        console.warn('No se pudo guardar la exageración vertical:', error);
      }
      render(store.getProject());
    });

    terrainFetchBtn.addEventListener('click', async () => {
      const project = store.getProject();
      const vertices = project.alignment.vertices;
      const totalLength = stationing.totalLength(vertices);
      if (totalLength <= 0) {
        alert('El alineamiento necesita más de un vértice para consultar el terreno.');
        return;
      }

      // Paso de muestreo: Open-Elevation sirve datos SRTM con resolución
      // real de ~30 m — pedir puntos más seguido que eso no agrega detalle
      // de terreno real, solo repite el valor de la misma celda del modelo
      // muchas veces (se ve como "escalones" en vez de una curva de
      // terreno). 25 m es un paso denso sin caer en esa redundancia; para
      // trazados largos (>10 km) se cae a un paso más grueso que deje un
      // lote manejable en una sola consulta.
      const MAX_POINTS = 500;
      const step = totalLength / MAX_POINTS > 25 ? totalLength / MAX_POINTS : 25;
      const stations = stationing.sampleStations(vertices, step);
      const points = stations.map((s) => {
        const pos = stationing.pointAtStation(vertices, s);
        return geo.epsg9377ToLatLon(pos.x, pos.y);
      });

      terrainFetchBtn.disabled = true;
      terrainFetchBtn.classList.add('is-loading');
      showStatusMessage(`Consultando elevación real (${points.length} puntos)...`);

      try {
        const rawElevations = await elevationSource.fetchElevations(points);
        const rawTerrainProfile = stations.map((s, i) => ({ station: s, elevation: rawElevations[i] }));
        // El dato crudo de los servicios de elevación gratuitos puede venir
        // "saltado" entre puntos consecutivos — se suaviza antes de
        // guardarlo, así tanto la curva dibujada como la elevación que
        // toman las estructuras (resolveStructures) usan el dato ya
        // suave, no el crudo.
        const terrainProfile = stationing.smoothTerrainProfile(rawTerrainProfile);

        // Cada vértice ya tiene su station exacta incluida en `stations`
        // (ver stationing.sampleStations), así que se reusa el mismo lote
        // de resultados (ya suavizado) para actualizar su elevación — sin
        // otra consulta.
        const distances = stationing.cumulativeDistances(vertices);
        const vertexElevations = vertices.map((v, i) => {
          const targetStation = Math.round(distances[i] * 100) / 100;
          const idx = stations.findIndex((s) => Math.abs(s - targetStation) < 0.01);
          return { id: v.id, z: idx >= 0 ? terrainProfile[idx].elevation : v.z };
        });

        store.applyTerrainProfile(terrainProfile, vertexElevations);
        showStatusMessage('Perfil ajustado al terreno real.');
      } catch (error) {
        console.warn('No se pudo consultar el terreno real:', error);
        alert(`No se pudo consultar el terreno real: ${error.message}`);
      } finally {
        terrainFetchBtn.disabled = false;
        terrainFetchBtn.classList.remove('is-loading');
      }
    });

    function renderKmzCandidates() {
      clear(kmzImportCandidates);
      kmzCandidates.forEach((candidate, i) => {
        kmzImportCandidates.appendChild(el('label', { class: 'kmz-candidate-option' }, [
          el('input', { type: 'radio', name: 'kmz-candidate', value: String(i), checked: i === 0 }),
          `${candidate.name} (${candidate.points.length} puntos)`
        ]));
      });
    }

    function resetKmzImportPicker() {
      kmzImportPicker.hidden = true;
      kmzImportInvert.checked = false;
      kmzCandidates = [];
      clear(kmzImportCandidates);
    }

    kmzImportBtn.addEventListener('click', () => kmzImportFile.click());

    kmzImportFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        kmzCandidates = await kmzImport.parseKmzOrKml(file);
        renderKmzCandidates();
        kmzImportPicker.hidden = false;
      } catch (error) {
        alert(`No se pudo leer el archivo: ${error.message}`);
      } finally {
        kmzImportFile.value = '';
      }
    });

    kmzImportCancel.addEventListener('click', resetKmzImportPicker);

    kmzImportConfirm.addEventListener('click', () => {
      const selected = kmzImportCandidates.querySelector('input[name="kmz-candidate"]:checked');
      if (!selected) return;
      const candidate = kmzCandidates[parseInt(selected.value, 10)];
      const orderedPoints = kmzImportInvert.checked ? [...candidate.points].reverse() : candidate.points;

      // lat/lon (KML) -> Este/Norte (EPSG:9377, el sistema nativo del
      // proyecto), conservando la altitud del KML como z; y luego
      // simplificado: los trazados de Google Earth suelen venir
      // sobre-muestreados (cientos de puntos siguiendo el trazo dibujado a
      // mano) — 5 m de tolerancia es denso mientras sigue reduciendo bien
      // ese sobre-muestreo; el usuario puede seguir ajustando vértices a
      // mano en Planta después. simplifyPolyline solo descarta puntos (no
      // interpola nuevos), así que la z de cada punto sobreviviente sigue
      // siendo la altitud real de ESE punto del archivo, sin inventar nada.
      const localPoints = orderedPoints.map((p) => ({ ...geo.latLonToEpsg9377(p.lat, p.lon), z: p.alt }));
      const simplified = stationing.simplifyPolyline(localPoints, 5);
      const vertexPoints = simplified.map((p) => ({ x: p.x, y: p.y, z: p.z }));
      const hasAltitude = orderedPoints.some((p) => p.alt !== 0);

      const result = store.importAlignment(vertexPoints);
      if (!result.ok) {
        alert(result.reason);
        return;
      }

      const altitudeNote = hasAltitude
        ? '(altitud del KML)'
        : '(el KML no traía altitud — z quedó en 0; usa "Ajustar al terreno real" en Perfil)';
      showStatusMessage(`Alineamiento importado: ${orderedPoints.length} puntos → ${vertexPoints.length} vértices ${altitudeNote}.`);
      resetKmzImportPicker();
      selection = null;
      goToPlanScreen();
    });

    projectNameInput.addEventListener('change', (e) => store.setProjectName(e.target.value.trim() || 'Proyecto sin nombre'));

    groundClearanceInput.addEventListener('change', (e) => store.setGroundClearance(parseFloat(e.target.value) || 0));
    rightOfWayInput.addEventListener('change', (e) => store.setRightOfWayWidth(parseFloat(e.target.value) || 0));

    conductorColorInput.addEventListener('input', (e) => {
      document.documentElement.style.setProperty('--conductor-color', e.target.value);
      try {
        localStorage.setItem('linedesign-conductor-color', e.target.value);
      } catch (error) {
        console.warn('No se pudo guardar el color de conductores:', error);
      }
    });

    structureColorInput.addEventListener('input', (e) => {
      document.documentElement.style.setProperty('--structure-color', e.target.value);
      try {
        localStorage.setItem('linedesign-structure-color', e.target.value);
      } catch (error) {
        console.warn('No se pudo guardar el color de postes:', error);
      }
    });

    resetColorsBtn.addEventListener('click', () => {
      document.documentElement.style.removeProperty('--conductor-color');
      document.documentElement.style.removeProperty('--structure-color');
      try {
        localStorage.removeItem('linedesign-conductor-color');
        localStorage.removeItem('linedesign-structure-color');
      } catch (error) {
        console.warn('No se pudo restablecer los colores guardados:', error);
      }
      conductorColorInput.value = defaultConductorColor();
      structureColorInput.value = defaultStructureColor();
    });

    planMapToggle.addEventListener('click', () => {
      const next = planMapToggle.getAttribute('aria-pressed') !== 'true';
      setPlanMapVisible(next);
      try {
        localStorage.setItem('linedesign-plan-map', String(next));
      } catch (error) {
        console.warn('No se pudo guardar el estado del mapa base:', error);
      }
      render(store.getProject());
    });

    sagLabelsToggle.addEventListener('click', () => {
      const next = sagLabelsToggle.getAttribute('aria-pressed') !== 'true';
      setSagLabelsVisible(next);
      try {
        localStorage.setItem('linedesign-sag-labels', String(next));
      } catch (error) {
        console.warn('No se pudo guardar el estado de los valores de flecha:', error);
      }
    });

    // Arrastre del divisor Planta/Perfil: cambia --split-plan en cada frame
    // (rAF, para no recalcular más seguido de lo que el navegador pinta) y
    // re-renderiza esas dos vistas — su <svg> mide su propio ancho real vía
    // getBoundingClientRect(), así que necesitan un render para tomar el
    // tamaño nuevo (mismo motivo que el resize al cambiar de pantalla).
    splitDivider.addEventListener('pointerdown', (evt) => {
      evt.preventDefault();
      splitDivider.setPointerCapture(evt.pointerId);
      splitDivider.classList.add('is-dragging');
      let rafId = null;
      let lastPercent = null;

      function applyPending() {
        rafId = null;
        if (lastPercent === null) return;
        const project = store.getProject();
        planView.render(project, selection);
        profileView.render(project, planHypothesisId, selection);
      }

      function onMove(moveEvt) {
        const rect = splitView.getBoundingClientRect();
        const percent = ((moveEvt.clientX - rect.left) / rect.width) * 100;
        lastPercent = setSplitRatio(percent);
        if (rafId === null) rafId = requestAnimationFrame(applyPending);
      }

      function onUp() {
        splitDivider.removeEventListener('pointermove', onMove);
        splitDivider.removeEventListener('pointerup', onUp);
        splitDivider.classList.remove('is-dragging');
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (lastPercent !== null) {
          try {
            localStorage.setItem('linedesign-split-ratio', String(lastPercent));
          } catch (error) {
            console.warn('No se pudo guardar el reparto Planta/Perfil:', error);
          }
        }
      }

      splitDivider.addEventListener('pointermove', onMove);
      splitDivider.addEventListener('pointerup', onUp);
    });

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        document.querySelectorAll('.screen').forEach((screen) => {
          screen.classList.toggle('is-active', screen.id === `screen-${btn.dataset.screen}`);
        });
        // La barra de estado (coordenadas en vivo, zoom) solo tiene sentido
        // con un lienzo de Planta/Perfil visible debajo — en el resto de
        // pantallas (formularios/tablas) queda oculta.
        document.body.classList.toggle('screen-plan-active', btn.dataset.screen === 'plan');
        screenTitle.textContent = btn.dataset.title || btn.textContent.trim();
        // planView/profileView miden su <svg> con getBoundingClientRect():
        // mientras la pantalla estaba oculta (display:none) esa medida daba
        // 0x0. Al volver a mostrarla hay que re-renderizar para que tomen su
        // tamaño real ya visible, si no quedan con el viewBox mínimo de antes.
        render(store.getProject());
      });
    });

    document.querySelectorAll('.icon-btn--tiny[data-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view === 'plan' ? planView : profileView;
        if (btn.dataset.zoom === 'in') view.zoomBy(1.3);
        else if (btn.dataset.zoom === 'out') view.zoomBy(1 / 1.3);
        else view.resetZoom();
      });
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      const project = store.getProject();
      downloadFile(`${project.name.replace(/\s+/g, '_')}.json`, store.exportJSON());
      showStatusMessage('Proyecto exportado.');
    });

    const importFile = document.getElementById('import-file');
    document.getElementById('import-btn').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const result = store.importJSON(text);
      if (!result.ok) alert(result.reason);
      else showStatusMessage('Proyecto importado.');
      importFile.value = '';
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('¿Reiniciar el proyecto a los datos de ejemplo? Se perderán los cambios actuales.')) {
        selection = null;
        store.resetToSample();
        showStatusMessage('Proyecto reiniciado a los datos de ejemplo.');
      }
    });
  }

  function wireResize() {
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => render(store.getProject()), 150);
    });
  }

  function setInspectorCollapsed(collapsed) {
    inspectorAside.classList.toggle('is-collapsed', collapsed);
    const label = collapsed ? 'Mostrar panel de propiedades' : 'Colapsar panel de propiedades';
    inspectorToggle.setAttribute('aria-label', label);
    inspectorToggle.setAttribute('title', label);
  }

  function initInspectorCollapse() {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem('linedesign-inspector-collapsed') === 'true';
    } catch (error) {
      console.warn('No se pudo leer el estado del panel de propiedades:', error);
    }
    setInspectorCollapsed(collapsed);

    inspectorToggle.addEventListener('click', () => {
      const next = !inspectorAside.classList.contains('is-collapsed');
      setInspectorCollapsed(next);
      try {
        localStorage.setItem('linedesign-inspector-collapsed', String(next));
      } catch (error) {
        console.warn('No se pudo guardar el estado del panel de propiedades:', error);
      }
      // planView/profileView ajustan su viewBox al ancho real del panel;
      // se re-renderiza al terminar la transición CSS del colapso (200ms)
      // para que los lienzos tomen el espacio recién liberado/ocupado.
      window.setTimeout(() => render(store.getProject()), 220);
    });
  }

  function init() {
    window.LineDesignTheme.initTheme(themeToggle);
    initInspectorCollapse();
    wireToolbar();
    wireResize();
    updateStatusZoom();
    store.subscribe(render);
    store.load();
  }

  init();
})();
