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
    // Tolima (lat ≈ 4.49° N, lon ≈ -74.98° O), altitudes entre ~530 y 601
    // msnm. Incluye el perfil de terreno real ya consultado (ver
    // terrainProfile abajo) — no hace falta presionar "Ajustar al terreno
    // real" para verlo, aunque se puede volver a consultar si se editan
    // los vértices.
    return {
      vertices: [
        { id: 'PI-01', x: 4779670.08, y: 2054088.5, z: 601 },
        { id: 'PI-02', x: 4780115.55, y: 2054420.92, z: 575.55 },
        { id: 'PI-03', x: 4780158.99, y: 2054899.48, z: 579.33 },
        { id: 'PI-04', x: 4780690.65, y: 2055159.79, z: 562.39 },
        { id: 'PI-05', x: 4781087.7, y: 2055556.32, z: 533.04 },
        { id: 'PI-06', x: 4781297.09, y: 2055522.74, z: 543.97 }
      ],
      terrainProfile: [
        { station: 0, elevation: 601 },
        { station: 25, elevation: 600.97 },
        { station: 50, elevation: 600.82 },
        { station: 75, elevation: 600.26 },
        { station: 100, elevation: 598.78 },
        { station: 125, elevation: 596.12 },
        { station: 150, elevation: 592.88 },
        { station: 175, elevation: 590.21 },
        { station: 200, elevation: 588.73 },
        { station: 225, elevation: 588.17 },
        { station: 250, elevation: 588.03 },
        { station: 275, elevation: 588 },
        { station: 300, elevation: 588 },
        { station: 325, elevation: 587.98 },
        { station: 350, elevation: 587.9 },
        { station: 375, elevation: 587.55 },
        { station: 400, elevation: 586.63 },
        { station: 425, elevation: 584.92 },
        { station: 450, elevation: 582.66 },
        { station: 475, elevation: 580.34 },
        { station: 500, elevation: 578.26 },
        { station: 525, elevation: 576.67 },
        { station: 550, elevation: 575.7 },
        { station: 555.83, elevation: 575.55 },
        { station: 575, elevation: 575.23 },
        { station: 600, elevation: 575.06 },
        { station: 625, elevation: 575.01 },
        { station: 650, elevation: 575.02 },
        { station: 675, elevation: 575.1 },
        { station: 700, elevation: 575.45 },
        { station: 725, elevation: 576.36 },
        { station: 750, elevation: 578 },
        { station: 775, elevation: 580 },
        { station: 800, elevation: 581.64 },
        { station: 825, elevation: 582.55 },
        { station: 850, elevation: 582.89 },
        { station: 875, elevation: 582.97 },
        { station: 900, elevation: 582.94 },
        { station: 925, elevation: 582.76 },
        { station: 950, elevation: 582.24 },
        { station: 975, elevation: 581.32 },
        { station: 1000, elevation: 580.29 },
        { station: 1025, elevation: 579.54 },
        { station: 1036.36, elevation: 579.33 },
        { station: 1050, elevation: 579.14 },
        { station: 1075, elevation: 578.85 },
        { station: 1100, elevation: 578.37 },
        { station: 1125, elevation: 577.53 },
        { station: 1150, elevation: 576.51 },
        { station: 1175, elevation: 575.68 },
        { station: 1200, elevation: 575.22 },
        { station: 1225, elevation: 575.05 },
        { station: 1250, elevation: 575.01 },
        { station: 1275, elevation: 575 },
        { station: 1300, elevation: 574.97 },
        { station: 1325, elevation: 574.83 },
        { station: 1350, elevation: 574.27 },
        { station: 1375, elevation: 572.77 },
        { station: 1400, elevation: 570.06 },
        { station: 1425, elevation: 566.71 },
        { station: 1450, elevation: 563.84 },
        { station: 1475, elevation: 562.1 },
        { station: 1500, elevation: 561.34 },
        { station: 1525, elevation: 561.09 },
        { station: 1550, elevation: 561.03 },
        { station: 1575, elevation: 561.11 },
        { station: 1600, elevation: 561.42 },
        { station: 1625, elevation: 562.23 },
        { station: 1628.33, elevation: 562.39 },
        { station: 1650, elevation: 563.78 },
        { station: 1675, elevation: 565.99 },
        { station: 1700, elevation: 568.11 },
        { station: 1725, elevation: 569.35 },
        { station: 1750, elevation: 569.68 },
        { station: 1775, elevation: 569.19 },
        { station: 1800, elevation: 567.61 },
        { station: 1825, elevation: 564.74 },
        { station: 1850, elevation: 561.25 },
        { station: 1875, elevation: 558.35 },
        { station: 1900, elevation: 556.59 },
        { station: 1925, elevation: 555.34 },
        { station: 1950, elevation: 553.48 },
        { station: 1975, elevation: 550.37 },
        { station: 2000, elevation: 546.63 },
        { station: 2025, elevation: 543.55 },
        { station: 2050, elevation: 541.81 },
        { station: 2075, elevation: 541.02 },
        { station: 2100, elevation: 540.28 },
        { station: 2125, elevation: 538.77 },
        { station: 2150, elevation: 536.42 },
        { station: 2175, elevation: 534.07 },
        { station: 2189.47, elevation: 533.04 },
        { station: 2200, elevation: 532.51 },
        { station: 2225, elevation: 532.1 },
        { station: 2250, elevation: 533.17 },
        { station: 2275, elevation: 535.79 },
        { station: 2300, elevation: 539.12 },
        { station: 2325, elevation: 541.84 },
        { station: 2350, elevation: 543.31 },
        { station: 2375, elevation: 543.83 },
        { station: 2400, elevation: 543.97 },
        { station: 2401.54, elevation: 543.97 }
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
        attachmentPoints: [
          { name: 'Fase A', offsetX: -2.2, offsetZ: 15.5 },
          { name: 'Fase B', offsetX: 0, offsetZ: 18 },
          { name: 'Fase C', offsetX: 2.2, offsetZ: 15.5 }
        ]
      },
      {
        typeId: 'TIPO-B',
        name: 'Poste ángulo',
        type: 'Ángulo',
        heightOptions: [12, 14, 16, 20, 24, 30],
        attachmentPoints: [
          { name: 'Fase A', offsetX: -2.6, offsetZ: 18.5 },
          { name: 'Fase B', offsetX: 0, offsetZ: 21 },
          { name: 'Fase C', offsetX: 2.6, offsetZ: 18.5 }
        ]
      },
      {
        typeId: 'TIPO-C',
        name: 'Poste retención',
        type: 'Poste',
        heightOptions: [12, 14, 16, 20, 24, 30],
        attachmentPoints: [
          { name: 'Fase A', offsetX: -1.4, offsetZ: 14 },
          { name: 'Fase B', offsetX: 0, offsetZ: 14 },
          { name: 'Fase C', offsetX: 1.4, offsetZ: 14 }
        ]
      }
    ];
  }

  function sampleStructures() {
    return [
      { id: 'EST-01', typeId: 'TIPO-C', station: 0, height: 20 },
      { id: 'EST-02', typeId: 'TIPO-A', station: 287.33, height: 16 },
      { id: 'EST-03', typeId: 'TIPO-C', station: 555.83, height: 20 },
      { id: 'EST-04', typeId: 'TIPO-A', station: 791.17, height: 12 },
      { id: 'EST-05', typeId: 'TIPO-C', station: 1036.36, height: 24 }
    ];
  }

  function sampleConductorCatalog() {
    return [
      {
        id: 'ACSR-4-0',
        name: 'ACSR 4/0 "Penguin"',
        diameter: 0.0143, // m
        weightPerLength: 9.13, // N/m
        crossSectionArea: 0.0001246, // m2
        elasticModulus: 6.9e10, // Pa
        thermalExpansionCoef: 1.9e-5, // 1/°C
        ultimateStrength: 40000, // N
        referenceHypothesisId: 'H1',
        // Tensión horizontal instalada a la hipótesis de referencia. Criterio
        // simplificado de Fase 1: 20% de la carga de rotura (RTS), valor
        // típico de diseño en ausencia de curva real de sag-tension (que en
        // PLS-CADD se obtiene de una gráfica stress-strain del conductor).
        referenceHorizontalTension: 8000
      },
      {
        id: 'ACSR-336',
        name: 'ACSR 336.4 MCM "Linnet"',
        diameter: 0.01847,
        weightPerLength: 12.16,
        crossSectionArea: 0.0002102,
        elasticModulus: 6.9e10,
        thermalExpansionCoef: 1.9e-5,
        ultimateStrength: 62700,
        referenceHypothesisId: 'H1',
        referenceHorizontalTension: 12500
      }
    ];
  }

  function sampleHypotheses() {
    return [
      { id: 'H1', name: 'Everyday (EDS)', temperature: 15, windSpeed: 0, iceThickness: 0 },
      { id: 'H2', name: 'Máxima flecha (temperatura alta)', temperature: 50, windSpeed: 0, iceThickness: 0 },
      { id: 'H3', name: 'Viento máximo', temperature: 20, windSpeed: 30, iceThickness: 0 },
      { id: 'H4', name: 'Manguito de hielo', temperature: -5, windSpeed: 10, iceThickness: 12 }
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
      stringingTensions: []
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
