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
  const units = global.LineDesignUnits;

  let project = null;
  let nextIdCounters = { vertex: 0, structure: 0, catalog: 0, hypothesis: 0, stringingTension: 0, sectionConductor: 0 };
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
      stringingTension: maxFrom(project.stringingTensions, 'ST-'),
      sectionConductor: maxFrom(project.sectionConductors, 'SC-')
    };
  }

  function formatSequentialId(prefix, n) {
    return `${prefix}${String(n).padStart(2, '0')}`;
  }

  function nextId(kind, prefix) {
    nextIdCounters[kind] += 1;
    return formatSequentialId(prefix, nextIdCounters[kind]);
  }

  /**
   * Los proyectos guardados ANTES de que el peso/fuerza del conductor
   * pasaran a guardarse en kgF/kg-km (en vez de N/N-m, la unidad interna
   * del motor de cálculo — ver src/engine/units.js y catenary.js) quedaron
   * con esos campos todavía en N/N-m. Se convierten una sola vez (el flag
   * `forceUnitsMigratedV1` evita repetirlo en cada carga, lo que
   * arruinaría el valor con una segunda conversión) y se persiste el
   * resultado. Un proyecto NUEVO (dataSource.getInitialProject()) ya nace
   * marcado como migrado, así que esta función no le hace nada.
   */
  function migrateForceUnitsToKgf(proj) {
    if (proj.forceUnitsMigratedV1) return;
    const seen = new Set();
    function convertConductor(c) {
      if (!c || seen.has(c)) return;
      seen.add(c);
      if (c.weightPerLength != null) c.weightPerLength = units.newtonsPerMeterToKgPerKm(c.weightPerLength);
      if (c.ultimateStrength != null) c.ultimateStrength = units.newtonsToKgf(c.ultimateStrength);
      if (c.referenceHorizontalTension != null) c.referenceHorizontalTension = units.newtonsToKgf(c.referenceHorizontalTension);
    }
    (proj.conductorCatalog || []).forEach(convertConductor);
    convertConductor(proj.conductor);
    (proj.stringingTensions || []).forEach((row) => {
      if (row.maxTension != null) row.maxTension = units.newtonsToKgf(row.maxTension);
    });
    proj.forceUnitsMigratedV1 = true;
  }

  /**
   * `attachmentPoints[].offsetZ` pasó de referenciarse desde el PISO (la
   * altura real sobre el terreno) a referenciarse desde la PUNTA del
   * poste hacia abajo (0 = en la punta) — ver loadTree.js#
   * averageAttachmentHeight. Un proyecto guardado antes de este cambio
   * tiene esos valores todavía en el criterio viejo; se convierten una
   * sola vez usando heightOptions[0] de cada tipo como la altura de
   * referencia con la que se calibraron originalmente (mismo criterio
   * que usaba el default de addCatalogType antes de este cambio).
   */
  function migrateAttachmentOffsetsFromGround(proj) {
    if (proj.attachmentOffsetsMigratedV1) return;
    (proj.structureCatalog || []).forEach((type) => {
      const refHeight = type.heightOptions && type.heightOptions.length ? type.heightOptions[0] : null;
      if (refHeight == null) return;
      (type.attachmentPoints || []).forEach((p) => {
        if (p.offsetZ != null) p.offsetZ = Math.max(refHeight - p.offsetZ, 0);
      });
    });
    proj.attachmentOffsetsMigratedV1 = true;
  }

  /**
   * Completa con defaults los campos que un proyecto más viejo (guardado
   * antes de que existieran, o un JSON exportado de una versión anterior)
   * puede no traer, y corre la migración de unidades de fuerza. Compartida
   * por load() (proyecto restaurado de localStorage) e importJSON() (antes
   * llamaba a una función de este mismo nombre que nunca llegó a
   * escribirse — "Importar JSON" fallaba siempre con un ReferenceError).
   *
   * `mergeMissingConductors`: agrega al conductorCatalog los conductores
   * del catálogo base (dataSource.js) que falten por id, sin tocar los
   * existentes — un proyecto guardado/exportado antes de que se agregara
   * un conductor nuevo al catálogo base nunca lo vería si no. No aplica al
   * proyecto de ejemplo recién creado (ya trae el catálogo al día).
   */
  function normalizeProject(raw, { mergeMissingConductors = false } = {}) {
    const proj = raw;
    if (!proj.stringingTensions) proj.stringingTensions = [];
    if (!proj.sectionConductors) proj.sectionConductors = [];
    if (proj.groundClearance == null) proj.groundClearance = 0;
    if (proj.rightOfWayWidth == null) proj.rightOfWayWidth = 0;
    if (proj.displayUnitSystem == null) proj.displayUnitSystem = 'kgf';
    if (proj.poleSafetyFactor == null) proj.poleSafetyFactor = 2;
    if (proj.guySafetyFactor == null) proj.guySafetyFactor = 2;
    migrateForceUnitsToKgf(proj);
    migrateAttachmentOffsetsFromGround(proj);
    if (mergeMissingConductors) {
      const existingIds = new Set(proj.conductorCatalog.map((c) => c.id));
      const missing = dataSource.getConductorCatalog().filter((c) => !existingIds.has(c.id));
      if (missing.length) proj.conductorCatalog = proj.conductorCatalog.concat(missing);
    }
    return proj;
  }

  function load() {
    let restored = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) restored = JSON.parse(raw);
    } catch (error) {
      console.warn('No se pudo leer el proyecto guardado, se usará el proyecto de ejemplo:', error);
    }
    project = normalizeProject(restored || dataSource.getInitialProject(), { mergeMissingConductors: !!restored });
    recalculateIdCounters();
    persist();
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

  /** `insertIndex` (opcional): posición del arreglo donde insertar el
   * vértice — sin él (o fuera de rango), se agrega al final, como
   * antes. Necesario para insertar un vértice intermedio (p. ej. a
   * mitad de un tramo): sin esto, el vértice quedaba bien ubicado en el
   * espacio pero conectado al final de la secuencia, no entre los dos
   * vértices correctos — el alineamiento se dibujaba "disparado" hacia
   * él en vez de pasar por ahí en orden. */
  function addVertex(coords, insertIndex) {
    const vertices = project.alignment.vertices;
    const last = vertices[vertices.length - 1];
    const secondLast = vertices[vertices.length - 2] || last;
    const vertex = {
      id: nextId('vertex', 'PI-'),
      x: coords && Number.isFinite(coords.x) ? coords.x : last.x + (last.x - secondLast.x || 60),
      y: coords && Number.isFinite(coords.y) ? coords.y : last.y + (last.y - secondLast.y || 0),
      z: last.z
    };
    if (Number.isInteger(insertIndex) && insertIndex >= 0 && insertIndex <= vertices.length) {
      vertices.splice(insertIndex, 0, vertex);
    } else {
      vertices.push(vertex);
    }
    // Renumera todos los PI- en orden del alineamiento: sin esto, uno
    // insertado en medio se queda con el siguiente número del contador
    // (p. ej. PI-11) aunque geométricamente quede antes de vértices ya
    // numerados con un consecutivo menor — el número deja de reflejar
    // el orden real. Los vértices no se referencian por id desde otro
    // lado del modelo (estructuras/secciones usan station, no id de
    // vértice), así que renumerar es seguro.
    vertices.forEach((v, i) => { v.id = formatSequentialId('PI-', i + 1); });
    nextIdCounters.vertex = vertices.length;
    persist();
    notify();
    return vertex;
  }

  function removeVertex(id) {
    if (project.alignment.vertices.length <= 2) {
      return { ok: false, reason: 'El alineamiento necesita al menos 2 vértices.' };
    }
    project.alignment.vertices = project.alignment.vertices.filter((v) => v.id !== id);
    // Mismo criterio que addVertex: renumera para que no queden huecos
    // (p. ej. borrar PI-03 dejaba PI-01, PI-02, PI-04...).
    project.alignment.vertices.forEach((v, i) => { v.id = formatSequentialId('PI-', i + 1); });
    nextIdCounters.vertex = project.alignment.vertices.length;
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
      resistanceOptions: partial.resistanceOptions || [],
      guyResistanceOptions: partial.guyResistanceOptions || [],
      // Por defecto Sí (es lo real en la mayoría de postes) — ver
      // catalogView.js y loadTree.js#structureAboveGroundHeight.
      considerEmbedment: partial.considerEmbedment !== undefined ? partial.considerEmbedment : true,
      attachmentPoints: partial.attachmentPoints && partial.attachmentPoints.length
        ? partial.attachmentPoints
        : [{ name: 'Fase A', offsetX: 0, offsetZ: 0 }]
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

  /** Mismo criterio que con los vértices (ver addVertex/removeVertex):
   * renumera todos los EST- en orden de station tras agregar o quitar
   * una estructura, para que el id no vaya dejando huecos ni siga
   * subiendo sin límite (si no, borrar todas menos una y agregar una
   * nueva la nombraba "EST-12" en vez de "EST-02"). A diferencia de un
   * vértice, un id de estructura SÍ puede estar referenciado desde otro
   * lado del modelo — project.sectionConductors (fromId/toId, el
   * conductor propio de una sección) — así que la renumeración también
   * remapea esas referencias con el mismo cambio de id, para no dejarlas
   * apuntando a un id que ya no existe. */
  function renumberStructures() {
    const sorted = [...project.structures].sort((a, b) => a.station - b.station);
    const idMap = new Map();
    sorted.forEach((s, i) => {
      const oldId = s.id;
      const newId = formatSequentialId('EST-', i + 1);
      if (newId !== oldId) idMap.set(oldId, newId);
      s.id = newId;
    });
    if (idMap.size) {
      project.sectionConductors.forEach((sc) => {
        if (idMap.has(sc.fromId)) sc.fromId = idMap.get(sc.fromId);
        if (idMap.has(sc.toId)) sc.toId = idMap.get(sc.toId);
      });
    }
    nextIdCounters.structure = sorted.length;
  }

  function addStructure({ typeId, station, height }) {
    const type = project.structureCatalog.find((t) => t.typeId === typeId) || project.structureCatalog[0];
    const totalLength = global.LineDesignStationing.totalLength(project.alignment.vertices);
    const structure = {
      id: nextId('structure', 'EST-'),
      // Nombre propio, aparte del id (EST-XX): opcional, no participa en
      // ninguna referencia interna (secciones, selección, arrastre...),
      // así que renombrar nunca puede romper nada — solo cambia lo que
      // se muestra. Vacío por defecto (se ve el id).
      name: '',
      typeId: type.typeId,
      station: Math.min(Math.max(station ?? totalLength / 2, 0), totalLength),
      height: height || type.heightOptions[0],
      resistance: type.resistanceOptions && type.resistanceOptions.length ? type.resistanceOptions[0] : undefined
    };
    project.structures.push(structure);
    renumberStructures();
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
    if (!structure) return { ok: false, reason: 'La estructura ya no existe.' };
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      // Vacío siempre se permite (varias estructuras sin nombre propio
      // no es un choque real — todas se ven por su id). Un nombre no
      // vacío sí debe ser único: si dos quedan mostrando lo mismo, deja
      // de quedar claro cuál es cuál en el combo de Propiedades y en
      // las etiquetas de Planta/Perfil. Se compara contra el nombre
      // EFECTIVO de cada estructura (su nombre propio, o si no tiene, su
      // id — s.name || s.id) y no solo contra s.name: si no, escribir
      // "EST-03" como nombre nuevo no chocaba contra la estructura
      // EST-03 mientras esta no tuviera nombre propio, aunque las dos
      // terminaran mostrando exactamente lo mismo.
      if (trimmed && project.structures.some((s) => s.id !== id && (s.name || s.id).trim() === trimmed)) {
        return { ok: false, reason: `Ya hay otra estructura llamada "${trimmed}".` };
      }
      patch = { ...patch, name: trimmed };
    }
    Object.assign(structure, patch);
    persist();
    notify();
    return { ok: true };
  }

  function removeStructure(id) {
    project.structures = project.structures.filter((s) => s.id !== id);
    // Cualquier conductor propio de sección que tuviera a esta estructura
    // como límite (fromId/toId) deja de tener sentido — esa sección ya no
    // existe con esos límites (renumberStructures solo remapea ids de
    // estructuras que SIGUEN existiendo, no limpia las que apuntaban a la
    // que se acaba de borrar).
    project.sectionConductors = project.sectionConductors.filter((sc) => sc.fromId !== id && sc.toId !== id);
    renumberStructures();
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

  /* A diferencia de removeHypothesis, no hay un mínimo de filas (la tabla
   * puede quedar vacía del todo — ver DATA_MODEL.md/Ayuda). Lo único que
   * se bloquea es borrar la fila que coincide con la hipótesis de
   * referencia del conductor (item.weatherCase === nombre de esa
   * hipótesis) — es la que realmente está fijando la tensión instalada
   * (ver catenary.resolveReferenceTension); aunque la app se recupera
   * sola si desaparece (cae a otra hipótesis con fila, o al valor manual
   * con aviso — ver hypothesesView.js), se evita el borrado accidental de
   * la fila marcada como "en uso" en la tabla. */
  function removeStringingTension(id) {
    const item = project.stringingTensions.find((t) => t.id === id);
    if (!item) return { ok: false, reason: 'No se encontró esa fila.' };
    const referenceHypothesis = project.hypotheses.find((h) => h.id === project.conductor.referenceHypothesisId);
    if (referenceHypothesis && item.weatherCase === referenceHypothesis.name) {
      return { ok: false, reason: 'Esta fila está fijando la tensión instalada del conductor (coincide con su hipótesis de referencia). Cambia la referencia primero.' };
    }
    project.stringingTensions = project.stringingTensions.filter((t) => t.id !== id);
    persist();
    notify();
    return { ok: true };
  }

  // ---------- Conductor por sección de tensionamiento ----------

  /**
   * Asigna (o reemplaza) el conductor de una sección de tensionamiento,
   * identificada por las estructuras de anclaje que la delimitan
   * (fromId/toId — ver stationing.computeTensionSections). Una sección
   * sin entrada aquí usa el conductor del proyecto (comportamiento por
   * defecto, ver loadTree.resolveSectionConductor).
   */
  function setSectionConductor(fromId, toId, conductorId) {
    const existing = project.sectionConductors.find((s) => s.fromId === fromId && s.toId === toId);
    if (existing) {
      existing.conductorId = conductorId;
    } else {
      project.sectionConductors.push({ id: nextId('sectionConductor', 'SC-'), fromId, toId, conductorId });
    }
    persist();
    notify();
  }

  /** Quita el conductor propio de una sección — vuelve a usar el del proyecto. */
  function clearSectionConductor(fromId, toId) {
    project.sectionConductors = project.sectionConductors.filter((s) => !(s.fromId === fromId && s.toId === toId));
    persist();
    notify();
  }

  // ---------- Terreno ----------

  function setGroundClearance(value) {
    project.groundClearance = Math.max(0, value || 0);
    persist();
    notify();
  }

  function setRightOfWayWidth(value) {
    project.rightOfWayWidth = Math.max(0, value || 0);
    persist();
    notify();
  }

  /**
   * Unidad en que "Parámetros de entrada" muestra y edita fuerza/peso por
   * longitud ('kgf' = kgF/kg-km, 'si' = N/N-m). Es solo de interfaz: lo
   * guardado en el proyecto (conductorCatalog, stringingTensions) y lo
   * exportado en el árbol de cargas siguen siempre en kgF/kg-km, su unidad
   * propia — cambiar esta preferencia no convierte ni reescribe ningún
   * dato, solo cómo se despliegan/capturan los campos en pantalla.
   */
  function setDisplayUnitSystem(system) {
    project.displayUnitSystem = system === 'si' ? 'si' : 'kgf';
    persist();
    notify();
  }

  /** Factor de seguridad sobre la resistencia última del poste — ver loadTree.js#checkPoleCapacity. */
  function setPoleSafetyFactor(value) {
    project.poleSafetyFactor = Math.max(1, value || 1);
    persist();
    notify();
  }

  /** Factor de seguridad sobre la resistencia última del contraviento — ver loadTree.js#checkPoleCapacity. */
  function setGuySafetyFactor(value) {
    project.guySafetyFactor = Math.max(1, value || 1);
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

  /** ID legible a partir del nombre (p. ej. "ACSR 4/0 Penguin" -> "ACSR-4-0-PENGUIN"),
   * con sufijo numérico si ya existe — mismo espíritu que los ids del
   * catálogo de conductores base (dataSource.js), a diferencia del
   * catálogo de estructuras (secuencial TIPO-01, TIPO-02...). */
  function slugifyConductorId(name) {
    const base = (name || 'Conductor')
      .toUpperCase()
      .normalize('NFD') // separa tildes/diéresis de su letra base (é -> e + ´)
      .replace(/[^A-Z0-9]+/g, '-') // el acento separado ya no es A-Z0-9, cae acá igual que cualquier símbolo
      .replace(/^-+|-+$/g, '') || 'CONDUCTOR';
    const existingIds = new Set(project.conductorCatalog.map((c) => c.id));
    let id = base;
    let suffix = 1;
    while (existingIds.has(id)) {
      suffix += 1;
      id = `${base}-${suffix}`;
    }
    return id;
  }

  /** Agrega un conductor nuevo al catálogo del proyecto (no lo selecciona
   * como el conductor activo — eso lo decide quien llama, vía setConductor). */
  function addConductor(partial) {
    const ultimateStrength = partial.ultimateStrength || 0;
    const conductor = {
      id: slugifyConductorId(partial.name),
      name: partial.name || 'Conductor sin nombre',
      diameter: partial.diameter || 0,
      weightPerLength: partial.weightPerLength || 0,
      crossSectionArea: partial.crossSectionArea || 0,
      elasticModulus: partial.elasticModulus || 6.9e10,
      thermalExpansionCoef: partial.thermalExpansionCoef != null ? partial.thermalExpansionCoef : 1.9e-5,
      ultimateStrength,
      referenceHypothesisId: partial.referenceHypothesisId || (project.hypotheses[0] && project.hypotheses[0].id),
      // Sin valor propio: 20% de la carga de rotura (RTS) en vez de 0 —
      // mismo criterio simplificado que ya documenta dataSource.js para el
      // catálogo base ("valor típico de diseño en ausencia de curva real
      // de sag-tension"). Un conductor recién creado no tiene fila propia
      // en "Tensiones de tendido" todavía, así que este es el valor con el
      // que arranca hasta que el usuario lo ajuste o agregue una fila —
      // mejor un punto de partida razonable que un 0 sin sentido.
      referenceHorizontalTension: partial.referenceHorizontalTension || Math.round(ultimateStrength * 0.2)
    };
    project.conductorCatalog.push(conductor);
    persist();
    notify();
    return conductor;
  }

  /** Quita un conductor del catálogo. No permite dejar el catálogo vacío
   * (mínimo 1, mismo criterio que un vértice — ver removeVertex). Si era
   * el conductor activo del proyecto, cae al primero que quede; las
   * secciones que lo tenían asignado como conductor propio (ver
   * setSectionConductor) vuelven a usar el del proyecto en vez de quedar
   * apuntando a un id que ya no existe. */
  function removeConductor(conductorId) {
    if (project.conductorCatalog.length <= 1) {
      return { ok: false, reason: 'El catálogo debe tener al menos un conductor.' };
    }
    project.conductorCatalog = project.conductorCatalog.filter((c) => c.id !== conductorId);
    project.sectionConductors = project.sectionConductors.filter((sc) => sc.conductorId !== conductorId);
    if (project.conductor.id === conductorId) {
      project.conductor = project.conductorCatalog[0];
    }
    persist();
    notify();
    return { ok: true };
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
    project = normalizeProject(parsed, { mergeMissingConductors: true });
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
    setSectionConductor,
    clearSectionConductor,
    setGroundClearance,
    setRightOfWayWidth,
    setDisplayUnitSystem,
    setPoleSafetyFactor,
    setGuySafetyFactor,
    setConductor,
    updateConductor,
    addConductor,
    removeConductor,
    setProjectName,
    exportJSON,
    importJSON
  };

  global.LineDesignStore = projectStore;
})(typeof window !== 'undefined' ? window : globalThis);
