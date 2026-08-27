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
    return {
      vertices: [
        { id: 'PI-1', x: 0, y: 0, z: 1180 },
        { id: 'PI-2', x: 180, y: 60, z: 1195 },
        { id: 'PI-3', x: 360, y: 40, z: 1230 },
        { id: 'PI-4', x: 540, y: 110, z: 1205 },
        { id: 'PI-5', x: 720, y: 90, z: 1240 },
        { id: 'PI-6', x: 900, y: 150, z: 1215 }
      ]
    };
  }

  function sampleStructureCatalog() {
    return [
      {
        typeId: 'TIPO-A',
        name: 'Torre suspensión 18 m',
        type: 'Suspensión',
        heightOptions: [15, 18, 21],
        attachmentPoints: [
          { name: 'Fase A', offsetX: -2.2, offsetZ: 15.5 },
          { name: 'Fase B', offsetX: 0, offsetZ: 18 },
          { name: 'Fase C', offsetX: 2.2, offsetZ: 15.5 }
        ]
      },
      {
        typeId: 'TIPO-B',
        name: 'Torre ángulo 21 m',
        type: 'Ángulo',
        heightOptions: [18, 21, 24],
        attachmentPoints: [
          { name: 'Fase A', offsetX: -2.6, offsetZ: 18.5 },
          { name: 'Fase B', offsetX: 0, offsetZ: 21 },
          { name: 'Fase C', offsetX: 2.6, offsetZ: 18.5 }
        ]
      },
      {
        typeId: 'TIPO-C',
        name: 'Poste mono 16 m',
        type: 'Poste',
        heightOptions: [14, 16],
        attachmentPoints: [
          { name: 'Fase A', offsetX: -1.4, offsetZ: 14 },
          { name: 'Fase B', offsetX: 1.4, offsetZ: 14 }
        ]
      }
    ];
  }

  function sampleStructures() {
    return [
      { id: 'EST-01', typeId: 'TIPO-A', station: 60, height: 18 },
      { id: 'EST-02', typeId: 'TIPO-A', station: 260, height: 18 },
      { id: 'EST-03', typeId: 'TIPO-B', station: 460, height: 21 },
      { id: 'EST-04', typeId: 'TIPO-A', station: 660, height: 18 },
      { id: 'EST-05', typeId: 'TIPO-A', station: 860, height: 18 }
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
      hypotheses: sampleHypotheses()
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
