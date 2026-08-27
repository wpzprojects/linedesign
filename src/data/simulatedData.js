window.sampleProject = {
  name: 'Línea de prueba',
  alignment: {
    vertices: [
      { id: 'PI-1', x: 0, y: 0, z: 12 },
      { id: 'PI-2', x: 90, y: 24, z: 15 },
      { id: 'PI-3', x: 180, y: 34, z: 18 },
      { id: 'PI-4', x: 270, y: 18, z: 13 },
      { id: 'PI-5', x: 360, y: 40, z: 16 },
      { id: 'PI-6', x: 450, y: 28, z: 20 }
    ]
  },
  structures: [
    { id: 'EST-01', name: 'Estructura 01', station: 45, x: 45, y: 12, z: 18, height: 18 },
    { id: 'EST-02', name: 'Estructura 02', station: 150, x: 150, y: 26, z: 18, height: 18 },
    { id: 'EST-03', name: 'Estructura 03', station: 255, x: 255, y: 18, z: 18, height: 18 },
    { id: 'EST-04', name: 'Estructura 04', station: 355, x: 355, y: 32, z: 18, height: 18 }
  ],
  conductor: {
    name: 'ACSR 4/0',
    diameter: 0.0143,
    weightPerLength: 4.5,
    elasticModulus: 6.9e10,
    thermalExpansionCoef: 1.9e-5,
    ultimateStrength: 40000
  },
  hypotheses: [
    { id: 'H1', name: 'Everyday', temperature: 15, wind: 0, ice: 0 },
    { id: 'H2', name: 'Máxima flecha', temperature: 35, wind: 0, ice: 0 },
    { id: 'H3', name: 'Viento máximo', temperature: 25, wind: 40, ice: 0 }
  ]
};
