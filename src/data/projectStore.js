/**
 * projectStore.js — Estado del proyecto en memoria + persistencia.
 *
 * Único punto de mutación del proyecto. La UI nunca edita `project` de forma
 * directa: llama a estos métodos, que validan, mutan y notifican a los
 * suscriptores (patrón observer simple, sin dependencias externas).
 *
 * Persistencia Fase 1: localStorage (clave STORAGE_KEY) con autoguardado en
 * cada mutación, más exportación/importación manual como archivo JSON.
 */
(function (global) {
  const STORAGE_KEY = 'linedesign.project.v1';
  const dataSource = global.LineDesignDataSource;

  let project = null;
  let nextIdCounters = { vertex: 0, structure: 0, catalog: 0, hypothesis: 0, stringingTension: 0 };
  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => fn(project));
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch (error) {
      console.warn('No se pudo guardar el proyecto en localStorage:', error);
    }
  }

  function recalculateIdCounters() {
    const maxFrom = (items, prefix) => items.reduce((max, item) => {
      const match = /^(\d+)$/.exec(String(item.id).replace(prefix, ''));
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);

    nextIdCounters = {
      vertex: maxFrom(project.alignment.vertices, 'PI-'),
      structure: maxFrom(project.structures, 'EST-'),
      catalog: maxFrom(project.structureCatalog, 'TIPO-'),
      hypothesis: maxFrom(project.hypotheses, 'H'),
      stringingTension: maxFrom(project.stringingTensions, 'ST-')
    };
  }

  function nextId(kind, prefix) {
    nextIdCounters[kind] += 1;
    return `${prefix}${String(nextIdCounters[kind]).padStart(2, '0')}`;
  }

  function load() {
    let restored = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) restored = JSON.parse(raw);
    } catch (error) {
      console.warn('No se pudo leer el proyecto guardado, se usará el proyecto de ejemplo:', error);
    }
    project = restored || dataSource.getInitialProject();
    if (!project.stringingTensions) project.stringingTensions = [];
    if (project.groundClearance == null) project.groundClearance = 0;
    recalculateIdCounters();
    notify();
  }

  function resetToSample() {
    project = dataSource.getInitialProject();
    recalculateIdCounters();
    persist();
    notify();
  }

  function getProject() {
    return project;
  }

  // ---------- Alineamiento ----------

  function moveVertex(id, x, y) {
    const vertex = project.alignment.vertices.find((v) => v.id === id);
    if (!vertex) return;
    vertex.x = x;
    vertex.y = y;
    persist();
    notify();
  }

  function setVertexElevation(id, z) {
    const vertex = project.alignment.vertices.find((v) => v.id === id);
    if (!vertex) return;
    vertex.z = z;
    persist();
    notify();
  }

  /**
   * Aplica un perfil de terreno real consultado a un servicio de elevación
   * (Fase 2, ver elevationSource.js): guarda el perfil denso completo (para
   * dibujar la línea de terreno real en Perfil) y actualiza la elevación de
   * cada vértice a su valor real correspondiente (mismo lote de consultas),
   * de modo que la posición derivada de las estructuras también se ajuste.
   * `terrainProfile`: [{ station, elevation }]. `vertexElevations`: [{ id, z }].
   */
  function applyTerrainProfile(terrainProfile, vertexElevations) {
    project.alignment.terrainProfile = terrainProfile;
    vertexElevations.forEach(({ id, z }) => {
      const vertex = project.alignment.vertices.find((v) => v.id === id);
      if (vertex) vertex.z = z;
    });
    persist();
    notify();
  }

  /**
   * Reemplaza el alineamiento completo a partir de un trazado importado
   * (Fase 2, ver kmzImport.js): `points` es `[{ x, y, z }]` ya en
   * coordenadas locales (EPSG:9377) y ya simplificado — este método solo
   * les asigna id (PI-1, PI-2, ...) y reemplaza `alignment.vertices`.
   * Las estructuras y el perfil de terreno del proyecto anterior quedan
   * sin sentido sobre la geometría nueva (stations, elevaciones reales
   * puntuales), así que se limpian — el usuario vuelve a agregar
   * estructuras sobre el trazado importado.
   */
  function importAlignment(points) {
    if (!points || points.length < 2) return { ok: false, reason: 'El trazado importado necesita al menos 2 vértices.' };
    nextIdCounters.vertex = 0;
    nextIdCounters.structure = 0;
    project.alignment.vertices = points.map((p) => ({ id: nextId('vertex', 'PI-'), x: p.x, y: p.y, z: p.z }));
    delete project.alignment.terrainProfile;
    project.structures = [];
    persist();
    notify();
    return { ok: true };
  }

  function addVertex() {
    const vertices = project.alignment.vertices;
    const last = vertices[vertices.length - 1];
    const secondLast = vertices[vertices.length - 2] || last;
    const vertex = {
      id: nextId('vertex', 'PI-'),
      x: last.x + (last.x - secondLast.x || 60),
      y: last.y + (last.y - secondLast.y || 0),
      z: last.z
    };
    vertices.push(vertex);
    persist();
    notify();
    return vertex;
  }

  function removeVertex(id) {
    if (project.alignment.vertices.length <= 2) {
      return { ok: false, reason: 'El alineamiento necesita al menos 2 vértices.' };
    }
    project.alignment.vertices = project.alignment.vertices.filter((v) => v.id !== id);
    persist();
    notify();
    return { ok: true };
  }

  // ---------- Catálogo de estructuras ----------

  function addCatalogType(partial) {
    const type = {
      typeId: nextId('catalog', 'TIPO-'),
      name: partial.name || 'Nuevo tipo',
      type: partial.type || 'Suspensión',
      heightOptions: partial.heightOptions && partial.heightOptions.length ? partial.heightOptions : [15],
      attachmentPoints: partial.attachmentPoints && partial.attachmentPoints.length
        ? partial.attachmentPoints
        : [{ name: 'Fase A', offsetX: 0, offsetZ: partial.heightOptions ? partial.heightOptions[0] : 15 }]
    };
    project.structureCatalog.push(type);
    persist();
    notify();
    return type;
  }

  function updateCatalogType(typeId, patch) {
    const type = project.structureCatalog.find((t) => t.typeId === typeId);
    if (!type) return;
    Object.assign(type, patch);
    persist();
    notify();
  }

  function removeCatalogType(typeId) {
    const inUse = project.structures.some((s) => s.typeId === typeId);
    if (inUse) {
      return { ok: false, reason: 'Hay estructuras distribuidas que usan este tipo. Elimínalas o reasígnalas primero.' };
    }
    project.structureCatalog = project.structureCatalog.filter((t) => t.typeId !== typeId);
    persist();
    notify();
    return { ok: true };
  }

  // ---------- Distribución de estructuras ----------

  function addStructure({ typeId, station, height }) {
    const type = project.structureCatalog.find((t) => t.typeId === typeId) || project.structureCatalog[0];
    const totalLength = global.LineDesignStationing.totalLength(project.alignment.vertices);
    const structure = {
      id: nextId('structure', 'EST-'),
      typeId: type.typeId,
      station: Math.min(Math.max(station ?? totalLength / 2, 0), totalLength),
      height: height || type.heightOptions[0]
    };
    project.structures.push(structure);
    persist();
    notify();
    return structure;
  }

  function moveStructure(id, station) {
    const structure = project.structures.find((s) => s.id === id);
    if (!structure) return;
    const totalLength = global.LineDesignStationing.totalLength(project.alignment.vertices);
    structure.station = Math.min(Math.max(station, 0), totalLength);
    persist();
    notify();
  }

  function updateStructure(id, patch) {
    const structure = project.structures.find((s) => s.id === id);
    if (!structure) return;
    Object.assign(structure, patch);
    persist();
    notify();
  }

  function removeStructure(id) {
    project.structures = project.structures.filter((s) => s.id !== id);
    persist();
    notify();
  }

  // ---------- Hipótesis de carga ----------

  function addHypothesis(partial) {
    const hypothesis = {
      id: nextId('hypothesis', 'H'),
      name: partial.name || 'Nueva hipótesis',
      temperature: partial.temperature ?? 15,
      windSpeed: partial.windSpeed ?? 0,
      iceThickness: partial.iceThickness ?? 0
    };
    project.hypotheses.push(hypothesis);
    persist();
    notify();
    return hypothesis;
  }

  function updateHypothesis(id, patch) {
    const hypothesis = project.hypotheses.find((h) => h.id === id);
    if (!hypothesis) return;
    Object.assign(hypothesis, patch);
    persist();
    notify();
  }

  function removeHypothesis(id) {
    if (project.hypotheses.length <= 1) {
      return { ok: false, reason: 'Debe existir al menos una hipótesis de carga.' };
    }
    if (project.conductor.referenceHypothesisId === id) {
      return { ok: false, reason: 'No se puede eliminar la hipótesis de referencia del conductor. Cambia la referencia primero.' };
    }
    project.hypotheses = project.hypotheses.filter((h) => h.id !== id);
    persist();
    notify();
    return { ok: true };
  }

  // ---------- Tensiones de tendido ----------

  function addStringingTension(partial = {}) {
    const item = {
      id: nextId('stringingTension', 'ST-'),
      weatherCase: partial.weatherCase || '',
      cableCondition: partial.cableCondition || '',
      percentUltimate: partial.percentUltimate ?? 0,
      maxTension: partial.maxTension ?? null,
      maxCatenary: partial.maxCatenary ?? null,
      applicableCable: partial.applicableCable || ''
    };
    project.stringingTensions.push(item);
    persist();
    notify();
    return item;
  }

  function updateStringingTension(id, patch) {
    const item = project.stringingTensions.find((t) => t.id === id);
    if (!item) return;
    Object.assign(item, patch);
    persist();
    notify();
  }

  function removeStringingTension(id) {
    project.stringingTensions = project.stringingTensions.filter((t) => t.id !== id);
    persist();
    notify();
  }

  // ---------- Terreno ----------

  function setGroundClearance(value) {
    project.groundClearance = Math.max(0, value || 0);
    persist();
    notify();
  }

  // ---------- Conductor ----------

  function setConductor(conductorId) {
    const conductor = project.conductorCatalog.find((c) => c.id === conductorId);
    if (!conductor) return;
    project.conductor = conductor;
    persist();
    notify();
  }

  function updateConductor(patch) {
    Object.assign(project.conductor, patch);
    persist();
    notify();
  }

  // ---------- Proyecto / import-export ----------

  function setProjectName(name) {
    project.name = name;
    persist();
    notify();
  }

  function exportJSON() {
    return JSON.stringify(project, null, 2);
  }

  function importJSON(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (error) {
      return { ok: false, reason: 'JSON inválido: ' + error.message };
    }
    if (!parsed.alignment || !parsed.structures || !parsed.structureCatalog || !parsed.hypotheses || !parsed.conductor || !parsed.conductorCatalog) {
      return { ok: false, reason: 'El archivo no tiene la forma esperada de un proyecto LineDesign.' };
    }
    project = normalizeProject(parsed);
    recalculateIdCounters();
    persist();
    notify();
    return { ok: true };
  }

  const projectStore = {
    load,
    resetToSample,
    getProject,
    subscribe,
    moveVertex,
    setVertexElevation,
    applyTerrainProfile,
    importAlignment,
    addVertex,
    removeVertex,
    addCatalogType,
    updateCatalogType,
    removeCatalogType,
    addStructure,
    moveStructure,
    updateStructure,
    removeStructure,
    addHypothesis,
    updateHypothesis,
    removeHypothesis,
    addStringingTension,
    updateStringingTension,
    removeStringingTension,
    setGroundClearance,
    setConductor,
    updateConductor,
    setProjectName,
    exportJSON,
    importJSON
  };

  global.LineDesignStore = projectStore;
})(typeof window !== 'undefined' ? window : globalThis);
