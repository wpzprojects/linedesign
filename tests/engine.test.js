/**
 * Pruebas manuales del motor de cálculo y del store (sin framework).
 * Ejecutar con: node tests/engine.test.js
 *
 * Nota: en el entorno de desarrollo original de la Fase 1 no había Node.js
 * disponible; esta suite se validó ejecutando el mismo código en un motor V8
 * real vía Python (py_mini_racer) — ver README.md. Debe pasar igual bajo Node.
 */
const assert = require('assert');

// projectStore.js usa localStorage (API de navegador); se stubea para Node.
const storageState = {};
global.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(storageState, k) ? storageState[k] : null),
  setItem: (k, v) => { storageState[k] = String(v); },
  removeItem: (k) => { delete storageState[k]; }
};

const stationing = require('../src/engine/stationing.js');
const catenary = require('../src/engine/catenary.js');
const loadTree = require('../src/engine/loadTree.js');
const geo = require('../src/engine/geo.js');
const dataSource = require('../src/data/dataSource.js');
require('../src/data/projectStore.js');
const store = global.LineDesignStore;

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// --- stationing ---
const vertices = [
  { id: 'PI-1', x: 0, y: 0, z: 10 },
  { id: 'PI-2', x: 100, y: 0, z: 20 },
  { id: 'PI-3', x: 200, y: 0, z: 10 }
];

check('totalLength suma segmentos rectos', () => {
  assert.strictEqual(stationing.totalLength(vertices), 200);
});

check('pointAtStation interpola en el primer segmento', () => {
  const p = stationing.pointAtStation(vertices, 50);
  assert.strictEqual(p.x, 50);
  assert.strictEqual(p.z, 15);
});

check('pointAtStation interpola en el segundo segmento', () => {
  const p = stationing.pointAtStation(vertices, 150);
  assert.strictEqual(p.x, 150);
  assert.strictEqual(p.z, 15);
});

check('nearestStation ubica el punto más cercano sobre la polilínea', () => {
  const s = stationing.nearestStation(vertices, { x: 120, y: 5 });
  assert.ok(Math.abs(s - 120) < 1e-6);
});

check('sampleStations incluye 0, la longitud total y las stations de cada vértice', () => {
  const stations = stationing.sampleStations(vertices, 40);
  assert.strictEqual(stations[0], 0);
  assert.strictEqual(stations[stations.length - 1], 200);
  assert.ok(stations.includes(100), 'debe incluir la station del vértice intermedio (100)');
  // Está ordenada y sin duplicados.
  for (let i = 1; i < stations.length; i += 1) assert.ok(stations[i] > stations[i - 1]);
});

check('computeSpans genera N-1 vanos ordenados por station', () => {
  const structures = [
    { id: 'B', station: 100 },
    { id: 'A', station: 0 },
    { id: 'C', station: 200 }
  ];
  const { spans, sorted } = stationing.computeSpans(structures);
  assert.strictEqual(spans.length, 2);
  assert.strictEqual(sorted[0].id, 'A');
  assert.strictEqual(spans[0].length, 100);
});

check('resolveStructures deriva x,y,z desde la station vigente', () => {
  const structures = [{ id: 'EST-01', typeId: 'T', station: 50, height: 18 }];
  const resolved = stationing.resolveStructures(vertices, structures);
  assert.strictEqual(resolved[0].x, 50);
  assert.strictEqual(resolved[0].z, 15);
});

check('elevationAtStation interpola entre las dos muestras reales más cercanas', () => {
  const terrainProfile = [
    { station: 0, elevation: 100 },
    { station: 100, elevation: 200 },
    { station: 200, elevation: 150 }
  ];
  assert.strictEqual(stationing.elevationAtStation(terrainProfile, 50), 150);
  assert.strictEqual(stationing.elevationAtStation(terrainProfile, 150), 175);
  assert.strictEqual(stationing.elevationAtStation(terrainProfile, -50), 100, 'se recorta al extremo inferior');
  assert.strictEqual(stationing.elevationAtStation(terrainProfile, 500), 150, 'se recorta al extremo superior');
});

check('resolveStructures usa el terreno real (no interpolación entre vértices) cuando está presente', () => {
  const structures = [{ id: 'EST-01', typeId: 'T', station: 50, height: 18 }];
  // Sin terrainProfile: z=15 (interpolación lineal entre PI-1 z=10 y PI-2 z=20, ver `vertices` arriba).
  // Con terrainProfile: debe usar el valor real (muy distinto), no el interpolado.
  const terrainProfile = [{ station: 0, elevation: 10 }, { station: 100, elevation: 10 }];
  const resolved = stationing.resolveStructures(vertices, structures, terrainProfile);
  assert.strictEqual(resolved[0].z, 10, `debería tomar el terreno real (10), no la interpolación entre vértices (15); z=${resolved[0].z}`);
});

check('smoothTerrainProfile reduce un salto puntual sin mover las stations', () => {
  const jagged = [
    { station: 0, elevation: 100 },
    { station: 25, elevation: 100 },
    { station: 50, elevation: 100 },
    { station: 75, elevation: 250 }, // salto puntual, aislado
    { station: 100, elevation: 100 },
    { station: 125, elevation: 100 },
    { station: 150, elevation: 100 }
  ];
  const smooth = stationing.smoothTerrainProfile(jagged, 40);
  assert.strictEqual(smooth.length, jagged.length);
  smooth.forEach((p, i) => assert.strictEqual(p.station, jagged[i].station, 'las stations no cambian'));
  const spike = smooth.find((p) => p.station === 75);
  assert.ok(spike.elevation < 250 && spike.elevation > 100, `el salto puntual debería atenuarse; elevation=${spike.elevation}`);
  const flat = smooth.find((p) => p.station === 0);
  assert.ok(flat.elevation > 100 && flat.elevation < 250, `un punto lejano al salto debería subir un poco por su influencia; elevation=${flat.elevation}`);
});

check('smoothTerrainProfile no toca un perfil ya perfectamente plano', () => {
  const flat = [0, 25, 50, 75, 100].map((s) => ({ station: s, elevation: 1000 }));
  const smooth = stationing.smoothTerrainProfile(flat, 40);
  smooth.forEach((p) => assert.ok(Math.abs(p.elevation - 1000) < 1e-9));
});

// --- catenary ---
const conductor = {
  name: 'ACSR 4/0',
  diameter: 0.0143,
  weightPerLength: 9.13,
  crossSectionArea: 0.0001246,
  elasticModulus: 6.9e10,
  thermalExpansionCoef: 1.9e-5,
  ultimateStrength: 40000,
  referenceHypothesisId: 'H1',
  referenceHorizontalTension: 8000
};

const hEveryday = { id: 'H1', name: 'Everyday', temperature: 15, windSpeed: 0, iceThickness: 0 };
const hHot = { id: 'H2', name: 'Máxima flecha', temperature: 50, windSpeed: 0, iceThickness: 0 };
const hCold = { id: 'H3', name: 'Frío', temperature: -10, windSpeed: 0, iceThickness: 0 };
const hWind = { id: 'H4', name: 'Viento máximo', temperature: 15, windSpeed: 30, iceThickness: 0 };
const hIce = { id: 'H5', name: 'Hielo', temperature: -5, windSpeed: 10, iceThickness: 12 };

check('H2 baja respecto a H1 cuando sube la temperatura (dilatación térmica)', () => {
  const w1 = catenary.resultantUnitWeight(conductor, hEveryday);
  const w2 = catenary.resultantUnitWeight(conductor, hHot);
  const H2 = catenary.solveHorizontalTension({
    conductor, spanLength: 200, H1: 8000, w1, w2, T1: 15, T2: 50
  });
  assert.ok(H2 < 8000, `H2=${H2} debería ser menor que H1`);
  assert.ok(H2 > 0);
});

check('H2 sube respecto a H1 cuando baja la temperatura (contracción)', () => {
  const w = catenary.resultantUnitWeight(conductor, hEveryday);
  const H2 = catenary.solveHorizontalTension({
    conductor, spanLength: 200, H1: 8000, w1: w, w2: w, T1: 15, T2: -10
  });
  assert.ok(H2 > 8000, `H2=${H2} debería ser mayor que H1`);
});

check('H2 sube respecto a H1 bajo carga de viento a igual temperatura', () => {
  const w1 = catenary.resultantUnitWeight(conductor, hEveryday);
  const w2 = catenary.resultantUnitWeight(conductor, hWind);
  assert.ok(w2 > w1);
  const H2 = catenary.solveHorizontalTension({
    conductor, spanLength: 200, H1: 8000, w1, w2, T1: 15, T2: 15
  });
  assert.ok(H2 > 8000, `H2=${H2} debería ser mayor que H1`);
});

check('el hielo agrega peso vertical por unidad de longitud', () => {
  const wNoIce = catenary.verticalUnitWeight(conductor, hEveryday);
  const wIce = catenary.verticalUnitWeight(conductor, hIce);
  assert.ok(wIce > wNoIce);
});

check('catenaryCurve es simétrica cuando los apoyos tienen la misma altura', () => {
  const curve = catenary.catenaryCurve({ span: 200, heightDiff: 0, H: 8000, unitWeight: 9.13 });
  const first = curve.points[0].y;
  const last = curve.points[curve.points.length - 1].y;
  assert.ok(Math.abs(first - last) < 1e-6);
  assert.ok(curve.sag > 0);
});

check('catenaryCurve produce mayor flecha con menor tensión', () => {
  const lowTension = catenary.catenaryCurve({ span: 200, heightDiff: 0, H: 3000, unitWeight: 9.13 });
  const highTension = catenary.catenaryCurve({ span: 200, heightDiff: 0, H: 12000, unitWeight: 9.13 });
  assert.ok(lowTension.sag > highTension.sag);
});

check('catenaryCurve coincide con los apoyos a distinta altura', () => {
  const curve = catenary.catenaryCurve({ span: 200, heightDiff: 8, H: 8000, unitWeight: 9.13 });
  assert.ok(Math.abs(curve.points[0].y) < 1e-6);
  assert.ok(Math.abs(curve.points[curve.points.length - 1].y - 8) < 1e-6);
});

check('computeSpanTension devuelve H1 sin cambios en la hipótesis de referencia', () => {
  const r = catenary.computeSpanTension(conductor, hEveryday, hEveryday, 200);
  assert.ok(Math.abs(r.horizontalTension - 8000) < 1e-6);
});

// --- loadTree ---
const project = {
  conductor,
  alignment: { vertices: [{ id: 'PI-1', x: 0, y: 0, z: 10 }, { id: 'PI-2', x: 400, y: 0, z: 10 }] },
  hypotheses: [hEveryday, hHot],
  structureCatalog: [
    {
      typeId: 'TIPO-A',
      name: 'Torre suspensión',
      attachmentPoints: [
        { name: 'fase-A', offsetX: -2, offsetZ: 15 },
        { name: 'fase-B', offsetX: 0, offsetZ: 17 },
        { name: 'fase-C', offsetX: 2, offsetZ: 15 }
      ]
    }
  ],
  structures: [
    { id: 'EST-01', typeId: 'TIPO-A', station: 0, height: 18 },
    { id: 'EST-02', typeId: 'TIPO-A', station: 200, height: 18 },
    { id: 'EST-03', typeId: 'TIPO-A', station: 400, height: 18 }
  ]
};

check('computeLoadTree devuelve una fila por estructura y por hipótesis', () => {
  const rows = loadTree.computeLoadTree(project);
  assert.strictEqual(rows.length, project.structures.length * project.hypotheses.length);
});

check('estructura intermedia en tangente tiene longitudinal ~0 (vanos balanceados, misma hipótesis)', () => {
  const rows = loadTree.computeLoadTree(project);
  const middle = rows.find((r) => r.structureId === 'EST-02' && r.hypothesisId === 'H1');
  assert.ok(middle.forces.longitudinal < 1e-6, `longitudinal=${middle.forces.longitudinal}`);
  assert.ok(middle.forces.vertical > 0);
});

check('estructura extrema tiene carga vertical de un solo vano tributario', () => {
  const rows = loadTree.computeLoadTree(project);
  const end = rows.find((r) => r.structureId === 'EST-01' && r.hypothesisId === 'H1');
  const middle = rows.find((r) => r.structureId === 'EST-02' && r.hypothesisId === 'H1');
  assert.ok(end.forces.vertical < middle.forces.vertical);
});

check('vanos desbalanceados en hipótesis no-referencia producen longitudinal no nulo', () => {
  // En la hipótesis de referencia (H1) todos los vanos reciben la misma
  // tensión instalada por diseño, así que un desbalance de longitud de vano
  // por sí solo NO genera longitudinal ahí (ver DATA_MODEL.md). Bajo otra
  // hipótesis, cada vano resuelve su propia H2 según su longitud (término L²
  // de la ecuación de cambio de estado), así que el desbalance sí aparece.
  const project2 = JSON.parse(JSON.stringify(project));
  project2.structures[1].station = 50; // vanos 50 y 350
  const rows = loadTree.computeLoadTree(project2);
  const midRef = rows.find((r) => r.structureId === 'EST-02' && r.hypothesisId === 'H1');
  const midHot = rows.find((r) => r.structureId === 'EST-02' && r.hypothesisId === 'H2');
  assert.ok(midRef.forces.longitudinal < 1e-6, `ref longitudinal=${midRef.forces.longitudinal}`);
  assert.ok(midHot.forces.longitudinal > 1e-6, `hot longitudinal=${midHot.forces.longitudinal}`);
});

// --- geo (EPSG:9377 <-> lat/lon) ---
const sampleLatLon = { lat: 3.4372, lon: -76.5225 }; // zona rural cerca de Cali

check('latLonToEpsg9377 / epsg9377ToLatLon son inversas (roundtrip)', () => {
  const xy = geo.latLonToEpsg9377(sampleLatLon.lat, sampleLatLon.lon);
  const back = geo.epsg9377ToLatLon(xy.x, xy.y);
  assert.ok(Math.abs(back.lat - sampleLatLon.lat) < 1e-8, `lat=${back.lat}`);
  assert.ok(Math.abs(back.lon - sampleLatLon.lon) < 1e-8, `lon=${back.lon}`);
});

check('latLonToEpsg9377 da coordenadas con la magnitud esperada (falso este/norte)', () => {
  const xy = geo.latLonToEpsg9377(sampleLatLon.lat, sampleLatLon.lon);
  // Cerca de Cali: al oeste del meridiano central (73°O) y al sur del
  // paralelo de origen (4°N), así que debe quedar por debajo del falso
  // este (5 000 000) y del falso norte (2 000 000).
  assert.ok(xy.x > 4000000 && xy.x < 5000000, `x=${xy.x}`);
  assert.ok(xy.y > 1000000 && xy.y < 2000000, `y=${xy.y}`);
});

check('epsg9377ToLatLon: al aumentar Este (x), aumenta la longitud', () => {
  const xy = geo.latLonToEpsg9377(sampleLatLon.lat, sampleLatLon.lon);
  const east = geo.epsg9377ToLatLon(xy.x + 1000, xy.y);
  assert.ok(east.lon > sampleLatLon.lon);
});

check('epsg9377ToLatLon: al aumentar Norte (y), aumenta la latitud', () => {
  const xy = geo.latLonToEpsg9377(sampleLatLon.lat, sampleLatLon.lon);
  const north = geo.epsg9377ToLatLon(xy.x, xy.y + 1000);
  assert.ok(north.lat > sampleLatLon.lat);
});

check('zoomForScale / metersPerPixel son inversas', () => {
  const zoom = geo.zoomForScale(2.5, sampleLatLon.lat);
  const metersPerPx = geo.metersPerPixel(zoom, sampleLatLon.lat);
  assert.ok(Math.abs(metersPerPx - 2.5) < 1e-9, `metersPerPx=${metersPerPx}`);
});

// --- dataSource / projectStore ---
check('dataSource.getInitialProject tiene una forma coherente', () => {
  const p = dataSource.getInitialProject();
  assert.ok(p.alignment.vertices.length >= 2);
  assert.ok(p.structureCatalog.length > 0);
  assert.ok(p.structures.length > 0);
  assert.ok(p.hypotheses.length >= 3);
  assert.ok(p.hypotheses.some((h) => h.id === p.conductor.referenceHypothesisId));
});

check('store.load() carga un proyecto', () => {
  store.load();
  assert.ok(store.getProject().structures.length > 0);
});

check('store.addVertex agrega un vértice con id nuevo', () => {
  const before = store.getProject().alignment.vertices.length;
  const v = store.addVertex();
  assert.strictEqual(store.getProject().alignment.vertices.length, before + 1);
  assert.ok(v.id);
});

check('store.removeVertex no permite bajar de 2 vértices', () => {
  const p = store.getProject();
  while (p.alignment.vertices.length > 2) {
    store.removeVertex(p.alignment.vertices[p.alignment.vertices.length - 1].id);
  }
  const lastId = p.alignment.vertices[p.alignment.vertices.length - 1].id;
  const result = store.removeVertex(lastId);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(p.alignment.vertices.length, 2);
});

check('store.moveStructure limita la station a [0, longitudTotal]', () => {
  const p = store.getProject();
  const total = stationing.totalLength(p.alignment.vertices);
  const s = p.structures[0];
  store.moveStructure(s.id, total + 500);
  assert.ok(Math.abs(s.station - total) < 1e-6);
  store.moveStructure(s.id, -500);
  assert.ok(Math.abs(s.station - 0) < 1e-6);
});

check('store.addStructure / removeStructure es reversible', () => {
  const before = store.getProject().structures.length;
  const type = store.getProject().structureCatalog[0];
  const s = store.addStructure({ typeId: type.typeId, station: 10 });
  assert.strictEqual(store.getProject().structures.length, before + 1);
  store.removeStructure(s.id);
  assert.strictEqual(store.getProject().structures.length, before);
});

check('store.removeCatalogType bloquea el borrado si el tipo está en uso', () => {
  const p = store.getProject();
  const usedTypeId = p.structures[0].typeId;
  const result = store.removeCatalogType(usedTypeId);
  assert.strictEqual(result.ok, false);
});

check('store.removeHypothesis bloquea el borrado de la hipótesis de referencia', () => {
  const p = store.getProject();
  const result = store.removeHypothesis(p.conductor.referenceHypothesisId);
  assert.strictEqual(result.ok, false);
});

check('store.exportJSON / importJSON son un roundtrip válido', () => {
  const json = store.exportJSON();
  const before = store.getProject().structures.length;
  const result = store.importJSON(json);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.getProject().structures.length, before);
});

check('store.importJSON rechaza JSON inválido o incompleto', () => {
  assert.strictEqual(store.importJSON('{not valid json').ok, false);
  assert.strictEqual(store.importJSON(JSON.stringify({ foo: 'bar' })).ok, false);
});

console.log(`\n${passed} pruebas pasaron.`);
