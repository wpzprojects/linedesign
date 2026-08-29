/**
 * app.js — Orquestador de la aplicación: estado de UI (selección, pantalla
 * activa, hipótesis mostrada en el perfil), wiring de la navegación entre
 * pantallas, la barra de herramientas y la barra de estado, y disparo de
 * render de cada vista al cambiar el proyecto (patrón: store.subscribe(render)).
 */
(function () {
  const store = window.LineDesignStore;
  const stationing = window.LineDesignStationing;
  const geo = window.LineDesignGeo;
  const elevationSource = window.LineDesignElevationSource;
  const kmzImport = window.LineDesignKmzImport;
  const { el, clear } = window.LineDesignDomUtil;
  const { downloadFile } = window.LineDesignSvgUtil;

  const planSvg = document.getElementById('plan-svg');
  const planMapContainer = document.getElementById('plan-map');
  const planMapToggle = document.getElementById('plan-map-toggle');
  const profileSvg = document.getElementById('profile-svg');
  const summaryList = document.getElementById('summary-list');
  const projectNameInput = document.getElementById('project-name-input');
  const themeToggle = document.getElementById('theme-toggle');
  const inspectorPanel = document.getElementById('inspector-body');
  const inspectorAside = document.getElementById('inspector-panel');
  const inspectorToggle = document.getElementById('inspector-toggle');
  const explorerVertices = document.getElementById('explorer-vertices');
  const explorerStructures = document.getElementById('explorer-structures');
  const explorerVerticesCount = document.getElementById('explorer-vertices-count');
  const explorerStructuresCount = document.getElementById('explorer-structures-count');
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

  function renderExplorer(project) {
    explorerVerticesCount.textContent = `(${project.alignment.vertices.length})`;
    explorerStructuresCount.textContent = `(${project.structures.length})`;

    clear(explorerVertices);
    project.alignment.vertices.forEach((vertex) => {
      const isSelected = selection && selection.type === 'vertex' && selection.id === vertex.id;
      explorerVertices.appendChild(el('li', {
        class: `explorer-item${isSelected ? ' is-active' : ''}`,
        onClick: () => { selection = { type: 'vertex', id: vertex.id }; goToPlanScreen(); render(store.getProject()); }
      }, [
        el('span', { class: 'explorer-item-id' }, vertex.id),
        el('span', { class: 'explorer-item-meta' }, `z=${vertex.z.toFixed(1)}`)
      ]));
    });

    clear(explorerStructures);
    const sorted = [...project.structures].sort((a, b) => a.station - b.station);
    sorted.forEach((structure) => {
      const isSelected = selection && selection.type === 'structure' && selection.id === structure.id;
      explorerStructures.appendChild(el('li', {
        class: `explorer-item${isSelected ? ' is-active' : ''}`,
        onClick: () => { selection = { type: 'structure', id: structure.id }; goToPlanScreen(); render(store.getProject()); }
      }, [
        el('span', { class: 'explorer-item-id' }, structure.id),
        el('span', { class: 'explorer-item-meta' }, `${structure.station.toFixed(0)} m`)
      ]));
    });
  }

  function renderInspector(project) {
    if (selection && selection.type === 'vertex' && !project.alignment.vertices.some((v) => v.id === selection.id)) selection = null;
    if (selection && selection.type === 'structure' && !project.structures.some((s) => s.id === selection.id)) selection = null;

    clear(inspectorPanel);

    if (!selection) {
      inspectorPanel.appendChild(el('p', { class: 'muted inspector-hint' },
        'Selecciona un vértice o una estructura en el lienzo (o en el Explorador) para ver y editar sus propiedades aquí.'));
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
    } else {
      const structure = project.structures.find((s) => s.id === selection.id);
      const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);

      inspectorPanel.appendChild(el('div', { class: 'inspector-title' }, `Estructura ${structure.id}`));

      inspectorPanel.appendChild(el('label', {}, 'Tipo'));
      inspectorPanel.appendChild(el('select', {
        onChange: (e) => {
          const newType = project.structureCatalog.find((t) => t.typeId === e.target.value);
          store.updateStructure(structure.id, { typeId: newType.typeId, height: newType.heightOptions[0] });
        }
      }, project.structureCatalog.map((t) => el('option', { value: t.typeId, selected: t.typeId === structure.typeId }, t.name))));

      inspectorPanel.appendChild(el('label', {}, 'Altura (m)'));
      inspectorPanel.appendChild(el('select', {
        onChange: (e) => store.updateStructure(structure.id, { height: parseFloat(e.target.value) })
      }, (type ? type.heightOptions : [structure.height]).map((h) => el('option', { value: h, selected: h === structure.height }, `${h} m`))));

      inspectorPanel.appendChild(el('label', {}, 'Station (m)'));
      inspectorPanel.appendChild(el('input', {
        type: 'number', step: '1', value: structure.station.toFixed(1),
        onChange: (e) => store.moveStructure(structure.id, parseFloat(e.target.value) || 0)
      }));

      inspectorPanel.appendChild(el('button', {
        class: 'btn btn-small', type: 'button',
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
    renderExplorer(project);
    renderInspector(project);

    planView.render(project, selection);
    profileView.render(project, planHypothesisId, selection);
    catalogView.render(project);
    hypothesesView.render(project);
    loadTreeView.render(project);

    if (workspaceBody) workspaceBody.scrollTop = scrollTop;
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
