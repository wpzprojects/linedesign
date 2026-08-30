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
  const units = window.LineDesignUnits;
  const geo = window.LineDesignGeo;
  const elevationSource = window.LineDesignElevationSource;
  const kmzImport = window.LineDesignKmzImport;
  const dxfExport = window.LineDesignDxfExport;
  const { el, clear } = window.LineDesignDomUtil;
  const { downloadFile, resolveExportTheme, rgbStringToHex } = window.LineDesignSvgUtil;

  const planSvg = document.getElementById('plan-svg');
  const planMapContainer = document.getElementById('plan-map');
  const planMapToggle = document.getElementById('plan-map-toggle');
  const circuitToggle = document.getElementById('circuit-toggle');
  const splitView = document.querySelector('.split-view');
  const splitDivider = document.getElementById('split-divider');
  const profileSvg = document.getElementById('profile-svg');
  const planExportBtn = document.getElementById('plan-export-btn');
  const profileExportBtn = document.getElementById('profile-export-btn');
  const summaryList = document.getElementById('summary-list');
  const projectNameInput = document.getElementById('project-name-input');
  const themeToggle = document.getElementById('theme-toggle');
  const conductorColorInput = document.getElementById('conductor-color-input');
  const structureColorInput = document.getElementById('structure-color-input');
  const alignmentColorInput = document.getElementById('alignment-color-input');
  const terrainColorInput = document.getElementById('terrain-color-input');
  const conductorWidthInput = document.getElementById('conductor-width-input');
  const structureWidthInput = document.getElementById('structure-width-input');
  const alignmentWidthInput = document.getElementById('alignment-width-input');
  const terrainWidthInput = document.getElementById('terrain-width-input');
  const resetColorsBtn = document.getElementById('reset-colors-btn');
  const inspectorPanel = document.getElementById('inspector-body');
  const inspectorAside = document.getElementById('inspector-panel');
  const inspectorToggle = document.getElementById('inspector-toggle');
  const structuresTableBody = document.getElementById('structures-table-body');
  const structuresTableCount = document.getElementById('structures-table-count');
  const alignmentTableBody = document.getElementById('alignment-table-body');
  const alignmentTableCount = document.getElementById('alignment-table-count');
  const newVertexX = document.getElementById('new-vertex-x');
  const newVertexY = document.getElementById('new-vertex-y');
  const newStructureType = document.getElementById('new-structure-type');
  const newStructureStation = document.getElementById('new-structure-station');
  const planHypothesisSelect = document.getElementById('plan-hypothesis-select');
  const planProfileVisibilityBtn = document.getElementById('plan-profile-visibility-btn');
  const groundClearanceInput = document.getElementById('ground-clearance-input');
  const rightOfWayInput = document.getElementById('right-of-way-input');
  const poleSafetyFactorInput = document.getElementById('pole-safety-factor-input');
  const guySafetyFactorInput = document.getElementById('guy-safety-factor-input');
  const profileVExagSelect = document.getElementById('profile-vexag-select');
  const terrainFetchBtn = document.getElementById('terrain-fetch-btn');
  const sagLabelsToggle = document.getElementById('sag-labels-toggle');
  const clearanceLabelsToggle = document.getElementById('clearance-labels-toggle');
  const vertexLinesToggle = document.getElementById('vertex-lines-toggle');
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
  // Preferencia de UI (no del proyecto): qué panel(es) mostrar en la
  // pantalla Planta y Perfil — cicla "both" -> "plan" -> "profile" -> "both".
  let planProfileVisibility = 'both';

  const PLAN_PROFILE_VISIBILITY_CYCLE = { both: 'plan', plan: 'profile', profile: 'both' };
  const PLAN_PROFILE_VISIBILITY_LABEL = { both: 'Planta y Perfil', plan: 'Solo Planta', profile: 'Solo Perfil' };

  function applyPlanProfileVisibility() {
    splitView.classList.toggle('split-view--plan-only', planProfileVisibility === 'plan');
    splitView.classList.toggle('split-view--profile-only', planProfileVisibility === 'profile');
    planProfileVisibilityBtn.textContent = PLAN_PROFILE_VISIBILITY_LABEL[planProfileVisibility];
  }

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
  // selector "Hipótesis mostrada" de Planta y Perfil — ese solo
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

  try {
    const savedVisibility = localStorage.getItem('linedesign-plan-profile-visibility');
    if (savedVisibility === 'plan' || savedVisibility === 'profile') planProfileVisibility = savedVisibility;
  } catch (error) {
    console.warn('No se pudo leer la visibilidad guardada de Planta/Perfil:', error);
  }
  applyPlanProfileVisibility();

  function setCircuitVisible(visible) {
    planView.setCircuitVisible(visible);
    circuitToggle.setAttribute('aria-pressed', String(visible));
    circuitToggle.classList.toggle('is-active', visible);
    circuitToggle.title = visible ? 'Ocultar circuito entre estructuras' : 'Mostrar circuito entre estructuras';
  }

  try {
    setCircuitVisible(localStorage.getItem('linedesign-circuit-visible') === 'true');
  } catch (error) {
    console.warn('No se pudo leer el estado del circuito:', error);
  }

  function setSagLabelsVisible(visible) {
    profileView.setSagLabelsVisible(visible);
    sagLabelsToggle.setAttribute('aria-pressed', String(visible));
    sagLabelsToggle.classList.toggle('is-active', visible);
    sagLabelsToggle.title = visible ? 'Ocultar valores de flecha' : 'Mostrar valores de flecha';
  }

  try {
    setSagLabelsVisible(localStorage.getItem('linedesign-sag-labels') === 'true');
  } catch (error) {
    console.warn('No se pudo leer el estado de los valores de flecha:', error);
  }

  function setClearanceLabelsVisible(visible) {
    profileView.setClearanceLabelsVisible(visible);
    clearanceLabelsToggle.setAttribute('aria-pressed', String(visible));
    clearanceLabelsToggle.classList.toggle('is-active', visible);
    clearanceLabelsToggle.title = visible ? 'Ocultar distancia mínima al terreno' : 'Mostrar distancia mínima al terreno';
  }

  // Apagado por defecto (a diferencia de la flecha): es una etiqueta
  // nueva, arranca oculta hasta que el usuario la active — así no le
  // agrega ruido de entrada a quien ya usaba Perfil sin pedirla.
  try {
    setClearanceLabelsVisible(localStorage.getItem('linedesign-clearance-labels') === 'true');
  } catch (error) {
    console.warn('No se pudo leer el estado de la distancia mínima al terreno:', error);
  }

  function setVertexLinesVisible(visible) {
    profileView.setVertexLinesVisible(visible);
    vertexLinesToggle.setAttribute('aria-pressed', String(visible));
    vertexLinesToggle.classList.toggle('is-active', visible);
    vertexLinesToggle.title = visible ? 'Ocultar líneas de los vértices' : 'Mostrar líneas de los vértices';
  }

  // Apagado por defecto, igual que la distancia mínima al terreno: es una
  // línea de referencia nueva, no algo que quien ya usaba Perfil esperaría
  // ver de entrada.
  try {
    setVertexLinesVisible(localStorage.getItem('linedesign-vertex-lines') === 'true');
  } catch (error) {
    console.warn('No se pudo leer el estado de las líneas de los vértices:', error);
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

  function defaultAlignmentColor() {
    return document.body.classList.contains('dark-theme') ? '#5b9dff' : '#2563eb';
  }

  function defaultTerrainColor() {
    return '#7a8f5c';
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

  try {
    const savedAlignmentColor = localStorage.getItem('linedesign-alignment-color');
    if (savedAlignmentColor) document.documentElement.style.setProperty('--alignment-color', savedAlignmentColor);
    alignmentColorInput.value = savedAlignmentColor || defaultAlignmentColor();
  } catch (error) {
    console.warn('No se pudo leer el color de alineamiento guardado:', error);
    alignmentColorInput.value = defaultAlignmentColor();
  }

  try {
    const savedTerrainColor = localStorage.getItem('linedesign-terrain-color');
    if (savedTerrainColor) document.documentElement.style.setProperty('--terrain-color', savedTerrainColor);
    terrainColorInput.value = savedTerrainColor || defaultTerrainColor();
  } catch (error) {
    console.warn('No se pudo leer el color de terreno guardado:', error);
    terrainColorInput.value = defaultTerrainColor();
  }

  // Grosores del lienzo (Configuración): mismo patrón que los colores de
  // arriba (override inline en <html>, con la propia var(--x, fallback)
  // en styles.css cubriendo el valor por defecto cuando no hay override)
  // — a diferencia del color, el grosor no depende del tema, así que el
  // valor por defecto es una sola constante, no una función condicional.
  const DEFAULT_CONDUCTOR_WIDTH = 1.5;
  const DEFAULT_STRUCTURE_WIDTH = 2;
  const DEFAULT_ALIGNMENT_WIDTH = 4;
  const DEFAULT_TERRAIN_WIDTH = 1.5;

  function loadLineWidth(key, cssVar, input, defaultValue) {
    try {
      const saved = localStorage.getItem(key);
      if (saved) document.documentElement.style.setProperty(cssVar, saved);
      input.value = saved || defaultValue;
    } catch (error) {
      console.warn(`No se pudo leer el grosor guardado (${key}):`, error);
      input.value = defaultValue;
    }
  }

  loadLineWidth('linedesign-conductor-width', '--conductor-line-width', conductorWidthInput, DEFAULT_CONDUCTOR_WIDTH);
  loadLineWidth('linedesign-structure-width', '--structure-line-width', structureWidthInput, DEFAULT_STRUCTURE_WIDTH);
  loadLineWidth('linedesign-alignment-width', '--alignment-line-width', alignmentWidthInput, DEFAULT_ALIGNMENT_WIDTH);
  loadLineWidth('linedesign-terrain-width', '--terrain-line-width', terrainWidthInput, DEFAULT_TERRAIN_WIDTH);

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

  // Tolerancia (m) para considerar que una estructura "está sobre" un
  // vértice — evita que un desfase de unos centímetros entre la station
  // de la estructura y la del vértice (redondeos, arrastres previos)
  // haga que se trate como si estuviera en tangente en vez de en el PI.
  const VERTEX_STATION_TOLERANCE = 1;

  /**
   * Station sugerida para "+ estructura" cuando el campo se deja vacío
   * (se muestra como placeholder, no como valor — así el usuario ve la
   * sugerencia en gris sin que cuente como algo que ya escribió):
   * - Vértice seleccionado: la station exacta de ese vértice.
   * - Estructura seleccionada: si tiene una estructura siguiente (vano
   *   adelante), la mitad de ese vano; si es la última, esa station + 10 m.
   * - Nada seleccionado (o una sección): la de la última estructura del
   *   alineamiento + 10 m; sin estructuras todavía, 0.
   * Recortada a [0, largo total] — si un +10 se pasa del final del
   * alineamiento, queda en el final (se traslapa con la anterior, sin
   * problema).
   */
  function computeSuggestedStructureStation(project) {
    const vertices = project.alignment.vertices;
    const totalLength = stationing.totalLength(vertices);

    if (selection && selection.type === 'vertex') {
      const index = vertices.findIndex((v) => v.id === selection.id);
      if (index !== -1) return stationing.cumulativeDistances(vertices)[index];
    }

    if (selection && selection.type === 'structure') {
      const sorted = [...project.structures].sort((a, b) => a.station - b.station);
      const index = sorted.findIndex((s) => s.id === selection.id);
      if (index !== -1) {
        const structure = sorted[index];
        const next = sorted[index + 1];
        if (next) return (structure.station + next.station) / 2;
        return Math.min(structure.station + 10, totalLength);
      }
    }

    if (!project.structures.length) return 0;
    const lastStation = project.structures.reduce((max, s) => Math.max(max, s.station), 0);
    return Math.min(lastStation + 10, totalLength);
  }

  function updateNewStructureStationPlaceholder(project) {
    newStructureStation.placeholder = computeSuggestedStructureStation(project).toFixed(1);
  }

  /** Punto extrapolado tras el último vértice — mismo cálculo que el
   * default de store.addVertex() (continúa la dirección del último
   * tramo), expuesto acá para poder mostrarlo como sugerencia ANTES de
   * agregar el vértice, no solo aplicarlo al agregar. */
  function extrapolateNextVertex(vertices) {
    const last = vertices[vertices.length - 1];
    const secondLast = vertices[vertices.length - 2] || last;
    return {
      x: last.x + (last.x - secondLast.x || 60),
      y: last.y + (last.y - secondLast.y || 0)
    };
  }

  /** Índice del vértice cuya station cae dentro de VERTEX_STATION_TOLERANCE
   * de `station`, o -1 si ninguno — el más cercano si hay más de uno. */
  function findVertexIndexNearStation(vertices, station, tolerance) {
    const distances = stationing.cumulativeDistances(vertices);
    let bestIndex = -1;
    let bestDiff = Infinity;
    distances.forEach((d, i) => {
      const diff = Math.abs(d - station);
      if (diff <= tolerance && diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    });
    return bestIndex;
  }

  /** Índice del tramo (i, i+1) del alineamiento donde cae `station` —
   * para saber entre qué dos vértices insertar uno nuevo cuando la
   * sugerencia viene de una estructura que no está sobre un vértice. */
  function findSegmentIndexForStation(vertices, station) {
    const distances = stationing.cumulativeDistances(vertices);
    for (let i = 0; i < distances.length - 1; i += 1) {
      if (station >= distances[i] - 1e-6 && station <= distances[i + 1] + 1e-6) return i;
    }
    return Math.max(distances.length - 2, 0);
  }

  /**
   * Posición (x, y) e índice de inserción sugeridos para "+ vértice"
   * cuando X/Y se dejan vacíos — el índice es indispensable: sin él,
   * store.addVertex() agrega siempre al final del arreglo, y un vértice
   * "de en medio" quedaría bien ubicado en el espacio pero conectado al
   * final de la secuencia en vez de entre los dos vértices correctos.
   * - Vértice seleccionado: si tiene un vértice siguiente, la mitad de
   *   ese tramo (para meter uno intermedio, insertIndex justo después de
   *   él); si es el último, el punto extrapolado tras él (al final).
   * - Estructura seleccionada: si esa estructura está sobre un vértice
   *   (dentro de VERTEX_STATION_TOLERANCE), se trata igual que si ese
   *   vértice estuviera seleccionado; si no, se sugiere la posición
   *   exacta de la estructura (para "promoverla" a vértice/PI ahí mismo),
   *   insertada en el tramo donde realmente cae su station.
   * - Nada seleccionado (o una sección): el punto extrapolado tras el
   *   último vértice (al final).
   */
  function computeSuggestedVertexInsertion(project) {
    const vertices = project.alignment.vertices;

    function midpointOrExtrapolate(index) {
      const vertex = vertices[index];
      const next = vertices[index + 1];
      if (next) return { x: (vertex.x + next.x) / 2, y: (vertex.y + next.y) / 2, insertIndex: index + 1 };
      const p = extrapolateNextVertex(vertices);
      return { x: p.x, y: p.y, insertIndex: vertices.length };
    }

    if (selection && selection.type === 'vertex') {
      const index = vertices.findIndex((v) => v.id === selection.id);
      if (index !== -1) return midpointOrExtrapolate(index);
    }

    if (selection && selection.type === 'structure') {
      const structure = project.structures.find((s) => s.id === selection.id);
      if (structure) {
        const nearIndex = findVertexIndexNearStation(vertices, structure.station, VERTEX_STATION_TOLERANCE);
        if (nearIndex !== -1) return midpointOrExtrapolate(nearIndex);
        const pos = stationing.pointAtStation(vertices, structure.station);
        const segmentIndex = findSegmentIndexForStation(vertices, structure.station);
        return { x: pos.x, y: pos.y, insertIndex: segmentIndex + 1 };
      }
    }

    const p = extrapolateNextVertex(vertices);
    return { x: p.x, y: p.y, insertIndex: vertices.length };
  }

  function updateNewVertexPlaceholders(project) {
    const pos = computeSuggestedVertexInsertion(project);
    newVertexX.placeholder = pos.x.toFixed(2);
    newVertexY.placeholder = pos.y.toFixed(2);
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
    const poleCheck = loadTree.checkPoleCapacity(project);
    const hypothesisById = Object.fromEntries(project.hypotheses.map((h) => [h.id, h.name]));

    sorted.forEach((structure, index) => {
      const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);
      const span = spans[index]; // vano hacia sorted[index + 1], undefined en la última estructura
      let vanoAdelante = null;
      let flecha = null;
      let minClearance = null;

      if (span) {
        const to = sorted[index + 1];
        // Una curva por fase (mismo criterio que profileView.js/dxfExport.js
        // — ver el comentario ahí): cada punto de fijación cuelga desde su
        // propia altura real (structure.height - offsetZ), emparejados por
        // posición en la lista. Flecha/distancia al terreno se toman de la
        // fase físicamente más baja, la que de verdad arriesga el "Cumple"
        // de distancia de seguridad — antes usaba la punta del poste
        // directo, sin descontar ningún offsetZ.
        const toType = project.structureCatalog.find((t) => t.typeId === to.typeId);
        const fromPoints = (type && type.attachmentPoints) || [];
        const toPoints = (toType && toType.attachmentPoints) || [];
        const fromFreeHeight = loadTree.structureAboveGroundHeight(project, structure);
        const toFreeHeight = loadTree.structureAboveGroundHeight(project, to);
        const phases = (fromPoints.length && toPoints.length)
          ? Array.from({ length: Math.min(fromPoints.length, toPoints.length) }, (_, p) => ({
            fromTop: structure.z + Math.max(fromFreeHeight - fromPoints[p].offsetZ, 0),
            toTop: to.z + Math.max(toFreeHeight - toPoints[p].offsetZ, 0)
          }))
          : [{
            fromTop: structure.z + loadTree.averageAttachmentHeight(project, structure),
            toTop: to.z + loadTree.averageAttachmentHeight(project, to)
          }];
        let lowestIndex = 0;
        phases.forEach((ph, idx) => {
          if (Math.min(ph.fromTop, ph.toTop) < Math.min(phases[lowestIndex].fromTop, phases[lowestIndex].toTop)) lowestIndex = idx;
        });
        const lowest = phases[lowestIndex];
        const curve = catenary.catenaryCurve({
          span: span.length,
          heightDiff: lowest.toTop - lowest.fromTop,
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
          return Math.min(min, (lowest.fromTop + p.y) - terrainZ);
        }, Infinity);
      }

      const check = poleCheck[structure.id];

      let poleCell;
      if (!check || check.pole.status === 'undefined') {
        poleCell = el('td', {}, '—');
      } else {
        const pole = check.pole;
        const pct = Math.round(pole.ratio * 100);
        const hypName = hypothesisById[pole.governingHypothesisId] || pole.governingHypothesisId;
        poleCell = el('td', {
          class: pole.status === 'ok' ? 'check-ok' : 'check-fail',
          title: `Momento demandado ${pole.momentDemandKgfm.toFixed(0)} kgF·m / admisible ${pole.capacityKgfm.toFixed(0)} kgF·m — caso gobernante: ${hypName}`
        }, `${pole.status === 'ok' ? '✓' : '✗'} ${pct}%`);
      }

      let guyCell;
      const guy = check && check.guy;
      if (!guy || guy.status === 'not-applicable' || guy.status === 'none') {
        guyCell = el('td', {}, '—');
      } else if (guy.status === 'undefined') {
        guyCell = el('td', { title: 'Contraviento habilitado pero sin resistencia o geometría de anclaje completa' }, '⚠');
      } else {
        const pct = Math.round(guy.ratio * 100);
        const hypName = hypothesisById[guy.governingHypothesisId] || guy.governingHypothesisId;
        guyCell = el('td', {
          class: guy.status === 'ok' ? 'check-ok' : 'check-fail',
          title: `Tracción demandada ${guy.tensionKgf.toFixed(0)} kgF / admisible ${guy.capacityKgf.toFixed(0)} kgF — caso gobernante: ${hypName}`
        }, `${guy.status === 'ok' ? '✓' : '✗'} ${pct}%`);
      }

      const isSelected = selection && selection.type === 'structure' && selection.id === structure.id;
      structuresTableBody.appendChild(el('tr', {
        class: `is-clickable${isSelected ? ' is-active' : ''}`,
        onClick: rowClickTo('structure', structure.id)
      }, [
        el('td', {}, structure.name || structure.id),
        el('td', {}, type ? type.name : structure.typeId),
        el('td', {}, fmtNum(structure.station, 1)),
        el('td', {}, fmtNum(structure.height, 1)),
        el('td', {}, fmtNum(structure.z, 1)),
        // Cota de la punta LIBRE (sobre el terreno) — descuenta el
        // empotramiento si el tipo lo tiene activado, no structure.height
        // directo (ver loadTree.js#structureAboveGroundHeight). "Altura
        // (m)" arriba sigue siendo la del catálogo tal cual (qué poste se
        // compró), esta es la elevación real de la punta visible.
        el('td', {}, fmtNum(structure.z + loadTree.structureAboveGroundHeight(project, structure), 1)),
        el('td', {}, structure.resistance ? fmtNum(structure.resistance, 0) : '—'),
        el('td', {}, fmtNum(vanoAdelante, 1)),
        el('td', {}, fmtNum(flecha, 2)),
        el('td', {}, fmtNum(minClearance, 1)),
        poleCell,
        guyCell
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

  /** Secciones de tensionamiento vigentes (compartido entre el combo de
   * Propiedades y el detalle de un vano seleccionado — ver comentario en
   * la rama selection.type === 'section' más abajo). */
  function computeSections(project) {
    const resolvedStructures = stationing.resolveStructures(project.alignment.vertices, project.structures, project.alignment.terrainProfile);
    const { sorted, spans } = stationing.computeSpans(resolvedStructures);
    const spanLengths = spans.map((s) => s.length);
    return stationing.computeTensionSections(
      sorted, spanLengths, (s) => stationing.isAnchorStructure(s, project.structureCatalog)
    );
  }

  function propCategory(text) {
    return el('div', { class: 'prop-category' }, `− ${text}`);
  }

  /** Fila etiqueta:valor de la grilla de Propiedades. `disabled` solo
   * atenúa/marca en cursiva (el control ya trae su propio `disabled`
   * nativo pasado por quien lo crea) — no aplica pointer-events:none. */
  // `title` (opcional): tooltip de la etiqueta — por defecto, el propio
  // texto completo de la etiqueta (".prop-row-label" trunca con "…" si no
  // cabe en el panel angosto de Propiedades, y sin esto no había forma de
  // ver el texto completo salvo ensanchar el panel).
  function propRow(labelText, control, { disabled = false, title = '' } = {}) {
    return el('div', { class: `prop-row${disabled ? ' is-disabled' : ''}` }, [
      el('span', { class: 'prop-row-label', title: title || labelText }, labelText),
      control
    ]);
  }

  /** Fila de solo lectura (valores calculados, no editables — p. ej. las
   * specs del conductor de un vano): mismo look que propRow, pero el
   * valor es texto plano en vez de un input/select. */
  function propRowStatic(labelText, valueText) {
    return propRow(labelText, el('span', { class: 'prop-value-text' }, valueText));
  }

  /** Combo del encabezado de Propiedades: mismo panel para vértice,
   * estructura o vano — deja saltar de uno a otro sin volver al lienzo. */
  function buildInspectorObjectSelect(project) {
    const sections = computeSections(project);
    return el('select', {
      class: 'prop-object-select',
      onChange: (e) => {
        const [type, a, b] = e.target.value.split('|');
        if (type === 'vertex') selection = { type: 'vertex', id: a };
        else if (type === 'structure') selection = { type: 'structure', id: a };
        else selection = { type: 'section', fromId: a, toId: b };
        render(store.getProject());
      }
    }, [
      el('optgroup', { label: 'Vértices' }, project.alignment.vertices.map((v) => el('option', {
        value: `vertex|${v.id}`,
        selected: !!(selection && selection.type === 'vertex' && selection.id === v.id)
      }, `Vértice ${v.id}`))),
      el('optgroup', { label: 'Estructuras' }, project.structures.map((s) => el('option', {
        value: `structure|${s.id}`,
        selected: !!(selection && selection.type === 'structure' && selection.id === s.id)
      }, `Estructura ${s.name || s.id}`))),
      el('optgroup', { label: 'Vanos' }, sections.map((sec) => el('option', {
        value: `section|${sec.fromId}|${sec.toId}`,
        selected: !!(selection && selection.type === 'section' && selection.fromId === sec.fromId && selection.toId === sec.toId)
      }, `Vano ${sec.fromId} → ${sec.toId}`)))
    ]);
  }

  function renderInspector(project) {
    if (selection && selection.type === 'vertex' && !project.alignment.vertices.some((v) => v.id === selection.id)) selection = null;
    if (selection && selection.type === 'structure' && !project.structures.some((s) => s.id === selection.id)) selection = null;
    if (selection && selection.type === 'section') {
      const stillExists = project.structures.some((s) => s.id === selection.fromId) && project.structures.some((s) => s.id === selection.toId);
      if (!stillExists) selection = null;
    }

    clear(inspectorPanel);

    if (!selection) {
      inspectorPanel.appendChild(el('p', { class: 'muted inspector-hint' },
        'Selecciona un vértice, estructura o vano en el lienzo para ver y editar sus propiedades.'));
      return;
    }

    inspectorPanel.appendChild(el('div', { class: 'prop-toolbar' }, buildInspectorObjectSelect(project)));

    if (selection.type === 'vertex') {
      const vertex = project.alignment.vertices.find((v) => v.id === selection.id);

      inspectorPanel.appendChild(el('div', { class: 'prop-section' }, [
        propCategory('General'),
        propRow('Este (m) — EPSG:9377', el('input', {
          class: 'prop-control', type: 'number', step: '0.5', value: roundTo4(vertex.x),
          onChange: (e) => store.moveVertex(vertex.id, parseFloat(e.target.value) || 0, vertex.y)
        })),
        propRow('Norte (m) — EPSG:9377', el('input', {
          class: 'prop-control', type: 'number', step: '0.5', value: roundTo4(vertex.y),
          onChange: (e) => store.moveVertex(vertex.id, vertex.x, parseFloat(e.target.value) || 0)
        })),
        propRow('Elevación z (m)', el('input', {
          class: 'prop-control', type: 'number', step: '0.5', value: roundTo4(vertex.z),
          onChange: (e) => store.setVertexElevation(vertex.id, parseFloat(e.target.value) || 0)
        }))
      ]));

      inspectorPanel.appendChild(el('div', { class: 'prop-actions' }, [
        el('button', {
          class: 'btn btn-small btn-danger', type: 'button',
          onClick: () => {
            const result = store.removeVertex(vertex.id);
            if (result && !result.ok) { alert(result.reason); return; }
            showStatusMessage(`Vértice ${vertex.id} eliminado.`);
            selection = null;
            render(store.getProject());
          }
        }, 'Eliminar vértice')
      ]));
    } else if (selection.type === 'structure') {
      const structure = project.structures.find((s) => s.id === selection.id);
      const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);

      // Contravientos: solo tiene sentido en estructuras que anclan la
      // línea (Retención/Ángulo) — ver stationing.isAnchorStructure. En
      // Retención se instalan dos, uno opuesto a cada vano adyacente; en
      // Ángulo uno solo, opuesto a la resultante de tensión — ver
      // loadTree.js#checkPoleCapacity para cómo entra esto en "Cumple
      // poste"/"Cumple contraviento". Los campos de contraviento se
      // muestran SIEMPRE (atenuados/en cursiva si no aplican, vía
      // propRow({disabled})) en vez de aparecer/desaparecer del todo —
      // así el usuario ve que existen aunque no pueda editarlos ahora.
      const isAnchorType = type && (type.type === 'Retención' || type.type === 'Ángulo');
      const hasGuy = isAnchorType && !!structure.hasGuy;
      // Sugerido: la misma altura de enganche real del conductor en esta
      // estructura (loadTree.averageAttachmentHeight), pero EXPRESADA como
      // distancia desde la punta del poste (no desde el piso) — mismo
      // criterio que attachmentPoints[].offsetZ, así el valor sigue
      // teniendo sentido sin importar qué heightOption tenga la estructura.
      // El contraviento amarra naturalmente cerca de donde está el
      // conductor que se quiere contrarrestar.
      // Redondeado a 2 decimales — la resta de dos alturas calculadas
      // (structureAboveGroundHeight - averageAttachmentHeight) arrastra
      // más precisión de la que tiene sentido mostrar/editar acá.
      const suggestedGuyHeightFromTip = Math.round(Math.max(
        loadTree.structureAboveGroundHeight(project, structure) - loadTree.averageAttachmentHeight(project, structure), 0
      ) * 100) / 100;
      const previewGuyHeight = structure.guyAnchorHeight != null ? structure.guyAnchorHeight : suggestedGuyHeightFromTip;
      // Ángulo de la retenida respecto a la VERTICAL del poste (no al
      // piso) — 30° es el valor de referencia por defecto (ver
      // loadTree.js#checkPoleCapacity para cómo entra en la tensión del
      // cable: mientras más cerrado/vertical el ángulo, más tensión
      // necesita el cable para la misma carga).
      const previewGuyAngle = structure.guyAnchorAngle != null ? structure.guyAnchorAngle : 30;
      const guyResistanceOptions = (type && type.guyResistanceOptions && type.guyResistanceOptions.length)
        ? type.guyResistanceOptions
        : [structure.guyResistance != null ? structure.guyResistance : 0];

      inspectorPanel.appendChild(el('div', { class: 'prop-section' }, [
        propCategory('General'),
        propRow('Nombre', el('input', {
          class: 'prop-control', type: 'text', value: structure.name || '', placeholder: structure.id,
          onChange: (e) => {
            const result = store.updateStructure(structure.id, { name: e.target.value });
            if (result && !result.ok) {
              alert(result.reason);
              render(store.getProject()); // el cambio no se aplicó — revierte el campo al valor guardado
            }
          }
        })),
        propRow('Tipo', el('select', {
          class: 'prop-control',
          onChange: (e) => {
            const newType = project.structureCatalog.find((t) => t.typeId === e.target.value);
            const resistance = newType.resistanceOptions && newType.resistanceOptions.length ? newType.resistanceOptions[0] : undefined;
            store.updateStructure(structure.id, { typeId: newType.typeId, height: newType.heightOptions[0], resistance });
          }
        }, project.structureCatalog.map((t) => el('option', { value: t.typeId, selected: t.typeId === structure.typeId }, t.name)))),
        propRow('Station (m)', el('input', {
          class: 'prop-control', type: 'number', step: '1', value: structure.station.toFixed(1),
          onChange: (e) => store.moveStructure(structure.id, parseFloat(e.target.value) || 0)
        }))
      ]));

      const geometryRows = [
        propRow('Altura (m)', el('select', {
          class: 'prop-control',
          onChange: (e) => store.updateStructure(structure.id, { height: parseFloat(e.target.value) })
        }, (type ? type.heightOptions : [structure.height]).map((h) => el('option', { value: h, selected: h === structure.height }, `${h} m`))))
      ];
      if (type && type.resistanceOptions && type.resistanceOptions.length) {
        geometryRows.push(propRow('Resistencia (kgF)', el('select', {
          class: 'prop-control',
          onChange: (e) => store.updateStructure(structure.id, { resistance: parseFloat(e.target.value) })
        }, type.resistanceOptions.map((r) => el('option', { value: r, selected: r === structure.resistance }, `${r} kgF`)))));
      }
      inspectorPanel.appendChild(el('div', { class: 'prop-section' }, [propCategory('Geometría'), ...geometryRows]));

      inspectorPanel.appendChild(el('div', { class: 'prop-section' }, [
        propCategory('Accesorios'),
        propRow('Instalar contravientos', el('select', {
          class: 'prop-control', disabled: !isAnchorType,
          onChange: (e) => {
            const checked = e.target.value === 'si';
            const patch = { hasGuy: checked };
            if (checked && structure.guyAnchorHeight == null) {
              patch.guyAnchorHeight = suggestedGuyHeightFromTip;
              patch.guyAnchorAngle = 30;
              if (type && type.guyResistanceOptions && type.guyResistanceOptions.length) {
                patch.guyResistance = type.guyResistanceOptions[0];
              }
            }
            store.updateStructure(structure.id, patch);
          }
        }, [
          el('option', { value: 'no', selected: !structure.hasGuy }, 'No'),
          el('option', { value: 'si', selected: !!structure.hasGuy }, 'Sí')
        ]), {
          disabled: !isAnchorType,
          title: 'Agrega, internamente, un cable de contraviento opuesto a la tensión del conductor — solo disponible en estructuras de Retención o Ángulo (que anclan la línea).'
        }),
        propRow('Resistencia contraviento (kgF)', el('select', {
          class: 'prop-control', disabled: !hasGuy,
          onChange: (e) => store.updateStructure(structure.id, { guyResistance: parseFloat(e.target.value) })
        }, guyResistanceOptions.map((r) => el('option', {
          value: r, selected: r === (structure.guyResistance != null ? structure.guyResistance : guyResistanceOptions[0])
        }, `${r} kgF`))), {
          disabled: !hasGuy,
          title: 'Resistencia última a rotura del cable de contraviento (kgF) — opciones definidas en el catálogo de estructuras. Se compara contra la tensión que le exige la carga, dividida entre el "Factor de seguridad de contravientos".'
        }),
        propRow('Altura de enganche desde la punta (m)', el('input', {
          class: 'prop-control', type: 'number', step: '0.5', min: '0', disabled: !hasGuy,
          title: 'Distancia desde la PUNTA del poste hacia abajo (no altura sobre el piso) — mismo criterio que los puntos de fijación del conductor, sugerido según la altura real de enganche del conductor en esta estructura.',
          value: hasGuy ? Math.round(structure.guyAnchorHeight * 100) / 100 : previewGuyHeight,
          onChange: (e) => store.updateStructure(structure.id, { guyAnchorHeight: parseFloat(e.target.value) || 0 })
        }), {
          disabled: !hasGuy,
          title: 'Distancia desde la PUNTA del poste hacia abajo (no altura sobre el piso) — geometría de referencia; no entra en el cálculo de tensión del cable, que depende solo del ángulo.'
        }),
        propRow('Ángulo de la retenida (°, respecto al poste)', el('input', {
          class: 'prop-control', type: 'number', step: '1', min: '5', max: '85', disabled: !hasGuy,
          title: 'Ángulo del cable de contraviento respecto a la VERTICAL del poste — mientras más cerrado (más vertical), más tensión necesita el cable para la misma carga. Sugerido: 30°.',
          value: hasGuy ? structure.guyAnchorAngle : previewGuyAngle,
          onChange: (e) => store.updateStructure(structure.id, { guyAnchorAngle: parseFloat(e.target.value) || 0 })
        }), {
          disabled: !hasGuy,
          title: 'Ángulo del cable respecto a la VERTICAL del poste — determina la tensión que debe resistir el cable (tensión = fuerza / sen(ángulo)).'
        })
      ]));

      inspectorPanel.appendChild(el('div', { class: 'prop-actions' }, [
        el('button', {
          class: 'btn btn-small toolbar-card-btn btn-fixed-height', type: 'button',
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
            showStatusMessage(`Estructura ${structure.name || structure.id} ajustada al vértice ${vertices[nearestIndex].id}.`);
          }
        }, 'Ajustar al vértice'),
        el('button', {
          class: 'btn btn-small btn-danger btn-fixed-height', type: 'button',
          onClick: () => {
            store.removeStructure(structure.id);
            showStatusMessage(`Estructura ${structure.name || structure.id} eliminada.`);
            selection = null;
            render(store.getProject());
          }
        }, 'Eliminar')
      ]));
    } else {
      // selection.type === 'section': un clic en cualquier vano selecciona
      // la sección de tensionamiento COMPLETA (todos los vanos entre dos
      // estructuras de anclaje, ver profileView.js) — el conductor se
      // asigna a la sección entera, no vano por vano.
      const { fromId, toId } = selection;
      const sections = computeSections(project);
      const section = sections.find((sec) => sec.fromId === fromId && sec.toId === toId);
      const vanoCount = section ? section.spanToIndex - section.spanFromIndex + 1 : 0;
      const conductor = loadTree.resolveSectionConductor(project, fromId, toId);
      const override = project.sectionConductors.find((s) => s.fromId === fromId && s.toId === toId);

      inspectorPanel.appendChild(el('div', { class: 'prop-section' }, [
        propCategory('General'),
        propRow('Conductor de la sección', el('select', {
          class: 'prop-control',
          onChange: (e) => {
            if (e.target.value === '') store.clearSectionConductor(fromId, toId);
            else store.setSectionConductor(fromId, toId, e.target.value);
          }
        }, [
          el('option', { value: '', selected: !override }, `Usar el del proyecto (${project.conductor.name})`),
          ...project.conductorCatalog.map((c) => el('option', { value: c.id, selected: c.id === conductor.id && !!override }, c.name))
        ]))
      ]));

      const isSI = project.displayUnitSystem === 'si';
      const weightDisplay = isSI ? units.kgPerKmToNewtonsPerMeter(conductor.weightPerLength) : conductor.weightPerLength;
      const strengthDisplay = isSI ? units.kgfToNewtons(conductor.ultimateStrength) : conductor.ultimateStrength;

      inspectorPanel.appendChild(el('div', { class: 'prop-section' }, [
        propCategory('Conductor'),
        propRowStatic('Vanos', String(vanoCount)),
        propRowStatic('Vano regulador (m)', section ? section.rulingSpan.toFixed(1) : '—'),
        propRowStatic('Diámetro (m)', String(conductor.diameter)),
        propRowStatic(`Peso (${isSI ? 'N/m' : 'kg/km'})`, weightDisplay.toFixed(1)),
        propRowStatic(`Carga de rotura (${isSI ? 'N' : 'kgF'})`, strengthDisplay.toFixed(1))
      ]));
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
    poleSafetyFactorInput.value = project.poleSafetyFactor;
    guySafetyFactorInput.value = project.guySafetyFactor;
    renderSummary(project);
    syncStructureTypeOptions(project);
    updateNewStructureStationPlaceholder(project);
    updateNewVertexPlaceholders(project);
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
      // Vacío -> la sugerencia mostrada como placeholder (ver
      // computeSuggestedVertexInsertion), no el default propio de
      // store.addVertex (siempre extrapola tras el último). Cada campo
      // es independiente: si solo escribiste X, Y toma la sugerencia.
      // insertIndex viaja siempre desde la sugerencia (según la
      // selección vigente), incluso si X/Y se escribieron a mano —
      // decide DÓNDE en la secuencia va, no en qué coordenadas.
      const suggested = computeSuggestedVertexInsertion(store.getProject());
      const x = newVertexX.value === '' ? suggested.x : parseFloat(newVertexX.value);
      const y = newVertexY.value === '' ? suggested.y : parseFloat(newVertexY.value);
      const vertex = store.addVertex({ x, y }, suggested.insertIndex);
      newVertexX.value = '';
      newVertexY.value = '';
      showStatusMessage(`Vértice ${vertex.id} agregado.`);
    });

    document.getElementById('add-structure-btn').addEventListener('click', () => {
      const typeId = newStructureType.value;
      // Vacío -> la sugerencia mostrada como placeholder (ver
      // computeSuggestedStructureStation), no el default propio de
      // store.addStructure (mitad del alineamiento).
      const stationValue = newStructureStation.value === ''
        ? computeSuggestedStructureStation(store.getProject())
        : parseFloat(newStructureStation.value);
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
    poleSafetyFactorInput.addEventListener('change', (e) => store.setPoleSafetyFactor(parseFloat(e.target.value) || 1));
    guySafetyFactorInput.addEventListener('change', (e) => store.setGuySafetyFactor(parseFloat(e.target.value) || 1));

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

    alignmentColorInput.addEventListener('input', (e) => {
      document.documentElement.style.setProperty('--alignment-color', e.target.value);
      try {
        localStorage.setItem('linedesign-alignment-color', e.target.value);
      } catch (error) {
        console.warn('No se pudo guardar el color de alineamiento:', error);
      }
    });

    terrainColorInput.addEventListener('input', (e) => {
      document.documentElement.style.setProperty('--terrain-color', e.target.value);
      try {
        localStorage.setItem('linedesign-terrain-color', e.target.value);
      } catch (error) {
        console.warn('No se pudo guardar el color de terreno:', error);
      }
    });

    function wireLineWidthInput(input, key, cssVar) {
      input.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!Number.isFinite(value) || value <= 0) return;
        document.documentElement.style.setProperty(cssVar, String(value));
        try {
          localStorage.setItem(key, String(value));
        } catch (error) {
          console.warn(`No se pudo guardar el grosor (${key}):`, error);
        }
      });
    }

    wireLineWidthInput(conductorWidthInput, 'linedesign-conductor-width', '--conductor-line-width');
    wireLineWidthInput(structureWidthInput, 'linedesign-structure-width', '--structure-line-width');
    wireLineWidthInput(alignmentWidthInput, 'linedesign-alignment-width', '--alignment-line-width');
    wireLineWidthInput(terrainWidthInput, 'linedesign-terrain-width', '--terrain-line-width');

    resetColorsBtn.addEventListener('click', () => {
      document.documentElement.style.removeProperty('--conductor-color');
      document.documentElement.style.removeProperty('--structure-color');
      document.documentElement.style.removeProperty('--alignment-color');
      document.documentElement.style.removeProperty('--terrain-color');
      document.documentElement.style.removeProperty('--conductor-line-width');
      document.documentElement.style.removeProperty('--structure-line-width');
      document.documentElement.style.removeProperty('--alignment-line-width');
      document.documentElement.style.removeProperty('--terrain-line-width');
      try {
        localStorage.removeItem('linedesign-conductor-color');
        localStorage.removeItem('linedesign-structure-color');
        localStorage.removeItem('linedesign-alignment-color');
        localStorage.removeItem('linedesign-terrain-color');
        localStorage.removeItem('linedesign-conductor-width');
        localStorage.removeItem('linedesign-structure-width');
        localStorage.removeItem('linedesign-alignment-width');
        localStorage.removeItem('linedesign-terrain-width');
      } catch (error) {
        console.warn('No se pudo restablecer los colores/grosores guardados:', error);
      }
      conductorColorInput.value = defaultConductorColor();
      structureColorInput.value = defaultStructureColor();
      alignmentColorInput.value = defaultAlignmentColor();
      terrainColorInput.value = defaultTerrainColor();
      conductorWidthInput.value = DEFAULT_CONDUCTOR_WIDTH;
      structureWidthInput.value = DEFAULT_STRUCTURE_WIDTH;
      alignmentWidthInput.value = DEFAULT_ALIGNMENT_WIDTH;
      terrainWidthInput.value = DEFAULT_TERRAIN_WIDTH;
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

    planProfileVisibilityBtn.addEventListener('click', () => {
      planProfileVisibility = PLAN_PROFILE_VISIBILITY_CYCLE[planProfileVisibility];
      applyPlanProfileVisibility();
      try {
        localStorage.setItem('linedesign-plan-profile-visibility', planProfileVisibility);
      } catch (error) {
        console.warn('No se pudo guardar la visibilidad de Planta/Perfil:', error);
      }
      // El panel que vuelve a ocupar el 100% del ancho necesita recalcular
      // su viewBox/zoom para ese nuevo tamaño — igual que el toggle del
      // mapa base, se dispara un render completo tras el cambio.
      render(store.getProject());
    });

    circuitToggle.addEventListener('click', () => {
      const next = circuitToggle.getAttribute('aria-pressed') !== 'true';
      setCircuitVisible(next);
      try {
        localStorage.setItem('linedesign-circuit-visible', String(next));
      } catch (error) {
        console.warn('No se pudo guardar el estado del circuito:', error);
      }
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

    clearanceLabelsToggle.addEventListener('click', () => {
      const next = clearanceLabelsToggle.getAttribute('aria-pressed') !== 'true';
      setClearanceLabelsVisible(next);
      try {
        localStorage.setItem('linedesign-clearance-labels', String(next));
      } catch (error) {
        console.warn('No se pudo guardar el estado de la distancia mínima al terreno:', error);
      }
    });

    vertexLinesToggle.addEventListener('click', () => {
      const next = vertexLinesToggle.getAttribute('aria-pressed') !== 'true';
      setVertexLinesVisible(next);
      try {
        localStorage.setItem('linedesign-vertex-lines', String(next));
      } catch (error) {
        console.warn('No se pudo guardar el estado de las líneas de los vértices:', error);
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
      resizeTimer = window.setTimeout(() => {
        // En móvil, abrir el teclado virtual (al enfocar un input) también
        // dispara "resize" (el viewport visible se achica) — un render()
        // completo acá reconstruye el campo desde cero (clear() + rebuild
        // en renderInspector), y al destruirse el <input> enfocado el
        // teclado se cierra solo. Si hay un campo con foco, se asume que
        // el resize es el teclado, no un cambio real de tamaño de
        // ventana, y se salta el render (el redimensionado real de los
        // lienzos de Planta/Perfil se retoma en el próximo resize sin un
        // campo enfocado, o al soltar/cambiar de campo).
        const active = document.activeElement;
        const isEditingField = active && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName);
        if (isEditingField) return;
        render(store.getProject());
      }, 150);
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

  // Nombre de archivo: nombre del proyecto + qué lienzo es, saneado a algo
  // seguro para el sistema de archivos (sin tildes/espacios/símbolos — un
  // nombre de proyecto con "/" o ":" rompería la descarga en varios
  // sistemas operativos).
  function exportBaseName(project, kind) {
    const safeName = (project.name || 'proyecto')
      .normalize('NFD') // separa tildes/diéresis de su letra base (é -> e + ´)
      .replace(/[^a-zA-Z0-9]+/g, '_') // el acento separado ya no es alfanumérico, cae acá igual que cualquier símbolo
      .replace(/^_+|_+$/g, '') || 'proyecto';
    return `${safeName}_${kind === 'plan' ? 'planta' : 'perfil'}`;
  }

  // Botón "Exportar" de Planta/Perfil: por ahora solo DXF (se descartó
  // PNG/SVG — una captura de pantalla ya cubre esa necesidad). Un clic
  // pide confirmación (confirm del navegador) antes de disparar la
  // descarga, para que nunca se descargue nada sin que el usuario lo
  // confirme explícitamente.
  function wireExportButton(btn, kind) {
    btn.addEventListener('click', () => {
      const project = store.getProject();
      const filename = `${exportBaseName(project, kind)}.dxf`;
      if (!confirm(`¿Descargar "${filename}"?`)) return;
      const { colors } = resolveExportTheme();
      const hex = (name) => rgbStringToHex(colors[name]);
      const content = kind === 'plan'
        ? dxfExport.buildPlanDxf(project, {
          colors: {
            alignment: hex('--alignment-color'), structure: hex('--structure-color'),
            servidumbre: hex('--muted'), circuit: hex('--conductor-color'), grid: hex('--muted')
          },
          showCircuit: planView.getCircuitVisible()
        })
        : dxfExport.buildProfileDxf(project, planHypothesisId, {
          verticalExaggeration: profileView.getVerticalExaggeration(),
          colors: {
            terrain: hex('--terrain-color'), structure: hex('--structure-color'),
            conductor: hex('--conductor-color'), vertexLine: hex('--vertex-line-color'),
            grid: hex('--muted'), clearance: hex('--muted')
          },
          showSag: profileView.getSagLabelsVisible(),
          showClearance: profileView.getClearanceLabelsVisible(),
          showVertexLines: profileView.getVertexLinesVisible()
        });
      downloadFile(filename, content, 'application/dxf');
    });
  }

  function wireExportButtons() {
    wireExportButton(planExportBtn, 'plan');
    wireExportButton(profileExportBtn, 'profile');
  }

  function init() {
    window.LineDesignTheme.initTheme(themeToggle);
    initInspectorCollapse();
    wireToolbar();
    wireExportButtons();
    wireResize();
    updateStatusZoom();
    store.subscribe(render);
    store.load();
  }

  init();
})();
