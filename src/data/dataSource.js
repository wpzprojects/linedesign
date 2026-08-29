/**
 * dataSource.js — Fuente de datos de Fase 1 (SIMULADA).
 *
 * Expone la interfaz que el resto de la app consume para obtener el proyecto
 * inicial. En Fase 2 este archivo se reemplaza por un módulo que lea un KMZ
 * real y un catálogo real, SIN tocar `engine` ni `ui` (ver prompt maestro §3
 * y §7): basta con que `getInitialProject()` devuelva un objeto con la misma
 * forma (ver DATA_MODEL.md).
 */
(function (global) {
  function sampleAlignment() {
    // Proyecto real del usuario (importado/editado en la app), no un
    // trazado inventado — coordenadas en MAGNA-SIRGAS / Origen-Nacional
    // (EPSG:9377), Este/Norte en metros (ver DATA_MODEL.md y
    // src/engine/geo.js). Cae en una zona de cañón entre Cundinamarca y
    // Tolima (lat ≈ 4.49° N, lon ≈ -74.98° O), altitudes entre ~562 y 601
    // msnm, 7 vértices. Incluye el perfil de terreno real ya consultado
    // (ver terrainProfile abajo) — no hace falta presionar "Ajustar al
    // terreno real" para verlo, aunque se puede volver a consultar si se
    // editan los vértices.
    return {
      vertices: [
        { id: 'PI-01', x: 4779670.08, y: 2054088.5, z: 600.94 },
        { id: 'PI-02', x: 4779906.92, y: 2054278.75, z: 587.97 },
        { id: 'PI-03', x: 4779905.21, y: 2054413.17, z: 580.06 },
        { id: 'PI-04', x: 4779857.07, y: 2054573.82, z: 578 },
        { id: 'PI-05', x: 4780163.13, y: 2054736.88, z: 583 },
        { id: 'PI-06', x: 4780217.36, y: 2054836.42, z: 581.97 },
        { id: 'PI-07', x: 4780661.37, y: 2054964.61, z: 562 }
      ],
      terrainProfile: [
        { station: 0, elevation: 600.94 },
        { station: 25, elevation: 600.7 },
        { station: 50, elevation: 599.88 },
        { station: 75, elevation: 597.8 },
        { station: 100, elevation: 594.19 },
        { station: 125, elevation: 590.15 },
        { station: 150, elevation: 587.49 },
        { station: 175, elevation: 586.82 },
        { station: 200, elevation: 587.23 },
        { station: 225, elevation: 587.71 },
        { station: 250, elevation: 587.93 },
        { station: 275, elevation: 587.99 },
        { station: 300, elevation: 587.98 },
        { station: 303.79, elevation: 587.97 },
        { station: 325, elevation: 587.86 },
        { station: 350, elevation: 587.32 },
        { station: 375, elevation: 585.85 },
        { station: 400, elevation: 583.45 },
        { station: 425, elevation: 581.05 },
        { station: 438.22, elevation: 580.06 },
        { station: 450, elevation: 579.38 },
        { station: 475, elevation: 578.48 },
        { station: 500, elevation: 578.12 },
        { station: 525, elevation: 578.02 },
        { station: 550, elevation: 578 },
        { station: 575, elevation: 578 },
        { station: 600, elevation: 578 },
        { station: 605.93, elevation: 578 },
        { station: 625, elevation: 578.01 },
        { station: 650, elevation: 578.05 },
        { station: 675, elevation: 578.17 },
        { station: 700, elevation: 578.42 },
        { station: 725, elevation: 578.85 },
        { station: 750, elevation: 579.51 },
        { station: 775, elevation: 580.45 },
        { station: 800, elevation: 581.49 },
        { station: 825, elevation: 582.32 },
        { station: 850, elevation: 582.78 },
        { station: 875, elevation: 582.95 },
        { station: 900, elevation: 582.99 },
        { station: 925, elevation: 583 },
        { station: 950, elevation: 583 },
        { station: 952.72, elevation: 583 },
        { station: 975, elevation: 583 },
        { station: 1000, elevation: 582.98 },
        { station: 1025, elevation: 582.88 },
        { station: 1050, elevation: 582.5 },
        { station: 1066.07, elevation: 581.97 },
        { station: 1075, elevation: 581.54 },
        { station: 1100, elevation: 579.74 },
        { station: 1125, elevation: 577.47 },
        { station: 1150, elevation: 575.74 },
        { station: 1175, elevation: 575.04 },
        { station: 1200, elevation: 574.93 },
        { station: 1225, elevation: 574.92 },
        { station: 1250, elevation: 574.66 },
        { station: 1275, elevation: 573.71 },
        { station: 1300, elevation: 571.61 },
        { station: 1325, elevation: 568.7 },
        { station: 1347.59, elevation: 566.15 },
        { station: 1350, elevation: 565.91 },
        { station: 1375, elevation: 563.85 },
        { station: 1400, elevation: 562.66 },
        { station: 1425, elevation: 562.16 },
        { station: 1450, elevation: 562.03 },
        { station: 1475, elevation: 562 },
        { station: 1500, elevation: 562 },
        { station: 1525, elevation: 562 },
        { station: 1538.41, elevation: 562 }
      ]
    };
  }

  function sampleStructureCatalog() {
    return [
      {
        typeId: 'TIPO-A',
        name: 'Poste suspensión',
        type: 'Suspensión',
        heightOptions: [12, 14, 16, 20, 24, 30],
        // offsetZ es la distancia desde la PUNTA del poste hacia abajo (0 =
        // en la punta), no la altura sobre el piso — así el punto sigue
        // siendo válido sin importar cuál heightOptions se elija para una
        // estructura en particular. Ver loadTree.js#averageAttachmentHeight.
        attachmentPoints: [
          { name: 'Fase A', offsetX: -2.2, offsetZ: 0 },
          { name: 'Fase B', offsetX: 0, offsetZ: 0 },
          { name: 'Fase C', offsetX: 2.2, offsetZ: 0 }
        ],
        resistanceOptions: [750, 1050]
      },
      {
        typeId: 'TIPO-B',
        name: 'Poste ángulo',
        type: 'Ángulo',
        heightOptions: [12, 14, 16, 20, 24, 30],
        attachmentPoints: [
          { name: 'Fase A', offsetX: -2.6, offsetZ: 0 },
          { name: 'Fase B', offsetX: 0, offsetZ: 0 },
          { name: 'Fase C', offsetX: 2.6, offsetZ: 0 }
        ],
        resistanceOptions: [750, 1050, 1350],
        // Resistencia última de cable de contraviento (kgF) — cordón de
        // acero galvanizado ASTM A475, tallas comunes EHS 1/4"/5/16"/3/8".
        guyResistanceOptions: [2722, 4082, 5987]
      },
      {
        typeId: 'TIPO-C',
        name: 'Poste retención',
        type: 'Retención',
        heightOptions: [12, 14, 16, 20, 24, 30],
        attachmentPoints: [
          { name: 'Fase A', offsetX: -1.4, offsetZ: 0 },
          { name: 'Fase B', offsetX: 0, offsetZ: 0 },
          { name: 'Fase C', offsetX: 1.4, offsetZ: 0 }
        ],
        resistanceOptions: [750, 1050, 1350],
        guyResistanceOptions: [2722, 4082, 5987]
      }
    ];
  }

  function sampleStructures() {
    return [
      { id: 'EST-01', typeId: 'TIPO-C', station: 0, height: 12, resistance: 750 },
      { id: 'EST-02', typeId: 'TIPO-A', station: 115.59, height: 12, resistance: 750 },
      { id: 'EST-03', typeId: 'TIPO-C', station: 303.79, height: 12, resistance: 750 },
      { id: 'EST-04', typeId: 'TIPO-B', station: 438.22, height: 12, resistance: 750 }
    ];
  }

  // weightPerLength (kg/km), ultimateStrength y referenceHorizontalTension
  // (kgF) son las unidades en las que el proyecto GUARDA y MUESTRA estos
  // campos — lo que ves es lo que se guarda, sin conversión oculta entre
  // pantalla y JSON exportado (ver src/engine/units.js, que convierte a
  // N/N-m solo en el momento de usarlos dentro del motor de cálculo).
  // diameter/crossSectionArea/elasticModulus/thermalExpansionCoef siguen en
  // SI (m/m²/Pa/°C⁻¹): no son campos de fuerza/peso, y así se referencian
  // en cualquier tabla de fabricante.
  function sampleConductorCatalog() {
    return [
      {
        id: 'ACSR-4-0',
        name: 'ACSR 4/0 "Penguin"',
        diameter: 0.0143, // m
        weightPerLength: 931, // kg/km
        crossSectionArea: 0.0001246, // m2
        elasticModulus: 6.9e10, // Pa
        thermalExpansionCoef: 1.9e-5, // 1/°C
        ultimateStrength: 4078.86, // kgF
        referenceHypothesisId: 'H1',
        // Tensión horizontal instalada a la hipótesis de referencia. Criterio
        // simplificado de Fase 1: 20% de la carga de rotura (RTS), valor
        // típico de diseño en ausencia de curva real de sag-tension (que en
        // PLS-CADD se obtiene de una gráfica stress-strain del conductor).
        referenceHorizontalTension: 815.77 // kgF
      },
      {
        id: 'ACSR-336',
        name: 'ACSR 336.4 MCM "Linnet"',
        diameter: 0.01847,
        weightPerLength: 1239.97,
        crossSectionArea: 0.0002102,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 6393.62,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 1274.65
      },
      // El nombre estándar de la tabla de códigos ACSR para 1/0 AWG es
      // "Raven" (no "Penguin" — ese es el nombre real del 4/0 AWG, ya
      // presente arriba). Datos físicos de tablas estándar de fabricante
      // (Southwire/vendors ASTM B-232), igual que el resto del catálogo.
      {
        id: 'ACSR-1-0',
        name: 'ACSR 1/0 AWG "Raven"',
        diameter: 0.0101,
        weightPerLength: 216.18,
        crossSectionArea: 0.0000535,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 1986.41,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 397.69
      },
      {
        id: 'ACSR-266',
        name: 'ACSR 266.8 MCM "Partridge"',
        diameter: 0.01631,
        weightPerLength: 546.57,
        crossSectionArea: 0.0001352,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 5048.61,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 1009.52
      },
      {
        id: 'ACSR-795',
        name: 'ACSR 795 MCM "Drake"',
        diameter: 0.02814,
        weightPerLength: 1628.49,
        crossSectionArea: 0.0004028,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 14288.26,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 2855.21
      },
      // AAAC (All Aluminum Alloy Conductor, aleación 6201-T81) — mismo
      // criterio simplificado de Fase 1 que el resto del catálogo: se
      // reutilizan elasticModulus/thermalExpansionCoef del aluminio puro
      // (el motor no distingue aún propiedades reales por aleación).
      {
        id: 'AAAC-123',
        name: 'AAAC 123.3 MCM "Azusa"',
        diameter: 0.0101,
        weightPerLength: 171.31,
        crossSectionArea: 0.0000625,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 2023.12,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 404.83
      },
      {
        id: 'AAAC-246',
        name: 'AAAC 246.9 MCM "Alliance"',
        diameter: 0.0143,
        weightPerLength: 344.66,
        crossSectionArea: 0.0001251,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 3883.08,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 777.02
      },
      {
        id: 'AAAC-312',
        name: 'AAAC 312.8 MCM "Butte"',
        diameter: 0.01631,
        weightPerLength: 437.46,
        crossSectionArea: 0.0001585,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 4763.09,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 952.41
      },
      // ACAR (Aluminum Conductor Alloy Reinforced, núcleo de aleación 6201
      // en vez de acero) — no usa nombres de ave como ACSR/AAAC, se
      // designa directamente por su tamaño en MCM. Mismo criterio
      // simplificado de Fase 1 para elasticModulus/thermalExpansionCoef.
      {
        id: 'ACAR-350',
        name: 'ACAR 350 MCM',
        diameter: 0.01724,
        weightPerLength: 488.44,
        crossSectionArea: 0.00017735,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 3816.8,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 763.77
      },
      {
        id: 'ACAR-500',
        name: 'ACAR 500 MCM',
        diameter: 0.0206,
        weightPerLength: 697.49,
        crossSectionArea: 0.00025335,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 5344.33,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 1068.66
      },
      // Cables de guarda (hilo de guarda / OGW), no conductores de fase —
      // se agregan al mismo catálogo porque la app aún no distingue el rol
      // (fase vs. guarda) en ningún cálculo; el usuario elige cuál usar
      // como "conductor" del proyecto igual que con cualquier otro.
      {
        id: 'ALUMOWELD-7-8',
        name: 'Alumoweld 7#8 (hilo de guarda)',
        diameter: 0.00978,
        weightPerLength: 389.53,
        crossSectionArea: 0.00005857,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 7225.71,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 1444.94
      },
      // Diámetro/peso son valores típicos de la clase OPGW-70kN (varían
      // según fabricante y cantidad de fibras, a diferencia de los
      // conductores de fase de arriba que sí tienen tabla estándar única
      // por nombre/calibre) — la resistencia de rotura es la que define la
      // clase, esa sí exacta (70 kN ≈ 7138 kgF; el nombre "70 kN" es el
      // identificador comercial de la clase, no cambia porque la app
      // muestre kgF en vez de kN en otras partes).
      {
        id: 'OPGW-70KN',
        name: 'OPGW 70 kN',
        diameter: 0.0114,
        weightPerLength: 399.73,
        crossSectionArea: 0.0000561,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 7138.01,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 1427.6
      }
    ];
  }

  function sampleHypotheses() {
    return [
      { id: 'H1', name: 'Everyday (EDS)', temperature: 25, windSpeed: 0, iceThickness: 0 },
      { id: 'H2', name: 'Máxima flecha (temperatura alta)', temperature: 75, windSpeed: 0, iceThickness: 0 },
      { id: 'H3', name: 'Viento máximo', temperature: 20, windSpeed: 27.78, iceThickness: 0 },
      { id: 'H4', name: 'Manguito de hielo', temperature: -5, windSpeed: 10, iceThickness: 12 }
    ];
  }

  function sampleStringingTensions() {
    return [
      { id: 'ST-01', weatherCase: 'Everyday (EDS)', cableCondition: '', percentUltimate: 20, maxTension: null, maxCatenary: null, applicableCable: '' },
      { id: 'ST-02', weatherCase: 'Máxima flecha (temperatura alta)', cableCondition: '', percentUltimate: 30, maxTension: null, maxCatenary: null, applicableCable: '' },
      { id: 'ST-03', weatherCase: 'Viento máximo', cableCondition: '', percentUltimate: 50, maxTension: null, maxCatenary: null, applicableCable: '' }
    ];
  }

  /** Alineamiento simulado (Fase 2: se reemplaza por el KMZ real). */
  function getAlignmentData() {
    return sampleAlignment();
  }

  /** Catálogo de tipos de estructura simulado (Fase 2: catálogo real/importado). */
  function getStructureCatalog() {
    return sampleStructureCatalog();
  }

  /** Catálogo de conductores simulado. */
  function getConductorCatalog() {
    return sampleConductorCatalog();
  }

  /** Hipótesis de carga estándar sugeridas para arrancar un proyecto nuevo. */
  function getDefaultHypotheses() {
    return sampleHypotheses();
  }

  /** Proyecto de ejemplo completo, listo para cargar en el store al inicio. */
  function getInitialProject() {
    const conductorCatalog = sampleConductorCatalog();
    return {
      name: 'Línea de prueba',
      units: 'SI-métrico',
      alignment: sampleAlignment(),
      structureCatalog: sampleStructureCatalog(),
      structures: sampleStructures(),
      conductorCatalog,
      conductor: conductorCatalog[0],
      hypotheses: sampleHypotheses(),
      stringingTensions: sampleStringingTensions(),
      sectionConductors: [],
      groundClearance: 5.6,
      rightOfWayWidth: 7,
      // Ya nace en kgF/kg-km (ver sampleConductorCatalog arriba) — evita que
      // projectStore.js#migrateForceUnitsToKgf lo vuelva a convertir como si
      // fuera un proyecto viejo guardado en N/N-m.
      forceUnitsMigratedV1: true,
      // attachmentPoints[].offsetZ ya nace referenciado desde la punta del
      // poste hacia abajo (ver sampleStructureCatalog arriba) — evita que
      // projectStore.js#migrateAttachmentOffsetsFromGround lo reconvierta
      // como si fuera un proyecto viejo con offsetZ referenciado al piso.
      attachmentOffsetsMigratedV1: true,
      // Unidad en que "Parámetros de entrada" muestra/edita fuerza y peso
      // por longitud ('kgf' o 'si') — solo de interfaz, ver projectStore.js#setDisplayUnitSystem.
      displayUnitSystem: 'kgf',
      // Factor de seguridad sobre la resistencia ÚLTIMA de rotura del poste
      // (structure.resistance, kgF a 20 cm de la punta) para obtener el
      // momento admisible en la validación de "Cumple poste" — ver
      // loadTree.js#checkPoleCapacity.
      poleSafetyFactor: 2.5,
      // Ídem para el cable de contraviento (structure.guyResistance) en la
      // validación "Cumple contraviento" — factor propio, independiente del
      // del poste.
      guySafetyFactor: 2
    };
  }

  const dataSource = {
    getAlignmentData,
    getStructureCatalog,
    getConductorCatalog,
    getDefaultHypotheses,
    getInitialProject
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dataSource;
  }
  global.LineDesignDataSource = dataSource;
})(typeof window !== 'undefined' ? window : globalThis);
