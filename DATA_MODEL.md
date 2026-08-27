# Data Model — LineDesign HTML (Fase 1)

## Unidades (fijas para todo el proyecto)

| Magnitud | Unidad |
|---|---|
| Longitud, coordenadas, altura | metros (m) |
| Fuerza | newtons (N) |
| Peso por longitud (conductor) | N/m |
| Temperatura | °C |
| Velocidad de viento | m/s |
| Espesor de hielo (manguito) | mm (radial) |
| Presión (interna, viento) | Pa |
| Módulo de elasticidad, esfuerzo | Pa (N/m²) |
| Área de sección del conductor | m² |
| Momento (estimado) | N·m |

`weightPerLength` del conductor ya es un peso por unidad de longitud en N/m (incluye g); no se vuelve a multiplicar por gravedad al usarlo directamente. El peso adicional por hielo y la carga de viento sí se derivan desde magnitudes físicas (densidad, velocidad) — ver `src/engine/catenary.js`.

## Proyecto (forma completa, ver `src/data/dataSource.js#getInitialProject`)

```json
{
  "name": "string",
  "units": "SI-métrico",
  "alignment": { "vertices": [{ "id": "PI-1", "x": 0, "y": 0, "z": 1180 }] },
  "structureCatalog": [
    {
      "typeId": "TIPO-A",
      "name": "Torre suspensión 18 m",
      "type": "Suspensión",
      "heightOptions": [15, 18, 21],
      "attachmentPoints": [{ "name": "Fase A", "offsetX": -2.2, "offsetZ": 15.5 }]
    }
  ],
  "structures": [
    { "id": "EST-01", "typeId": "TIPO-A", "station": 60, "height": 18 }
  ],
  "conductorCatalog": [ "...", ],
  "conductor": {
    "id": "ACSR-4-0", "name": "ACSR 4/0",
    "diameter": 0.0143, "weightPerLength": 9.13,
    "crossSectionArea": 0.0001246, "elasticModulus": 6.9e10,
    "thermalExpansionCoef": 1.9e-5, "ultimateStrength": 40000,
    "referenceHypothesisId": "H1", "referenceHorizontalTension": 8000
  },
  "hypotheses": [
    { "id": "H1", "name": "Everyday (EDS)", "temperature": 15, "windSpeed": 0, "iceThickness": 0 }
  ]
}
```

### Decisión clave: posición de estructuras derivada, no almacenada

`structures[i]` **no** guarda `x`/`y`/`z`. Guarda `station` (distancia acumulada sobre el alineamiento) y `height`. La posición (x, y, z) se deriva en caliente con `stationing.resolveStructures(vertices, structures)` interpolando sobre la polilínea vigente. Esto es lo que permite que mover un vértice del alineamiento reubique automáticamente las estructuras y recalcule vanos, catenaria y árbol de cargas sin lógica de sincronización adicional (criterios de aceptación §10.2 y §10.4 del prompt maestro).

### `attachmentPoints`

Pertenecen al **tipo de estructura** (catálogo), no a cada instancia — todas las estructuras de un mismo tipo comparten geometría de fijación. `offsetX` es el desplazamiento lateral (m) respecto al eje de la estructura; `offsetZ` es la elevación del punto de enganche sobre el terreno (m). Se usan para: (a) la elevación de enganche de la catenaria en el perfil (se usa `structure.height`, ver limitación abajo) y (b) el número de fases para el árbol de cargas (`loadTree.js` multiplica las fuerzas por vano por `attachmentPoints.length`).

**Simplificación de Fase 1**: la curva de catenaria dibujada en el perfil usa `structure.height` como elevación de enganche única (no una fase concreta), para mantener el perfil 2D legible con una sola curva representativa por vano. El árbol de cargas, en cambio, sí pondera por el número de fases reales del tipo. Los `offsetX`/`offsetZ` de cada fase no se usan aún para separar geometría 3D — Fase 3 (vista 3D).

## Motor de cálculo

### Tendido del cable / sag-tension (`src/engine/catenary.js`)

1. **Cargas por unidad de longitud**: vertical = autopeso + peso de hielo (sección de corona de hielo, densidad 900 kg/m³); transversal = presión dinámica de viento (`0.5·ρ_aire·v²`, ρ=1.225 kg/m³) × Cd (=1.0, simplificación) × diámetro efectivo (diámetro + 2×hielo). Carga resultante = combinación vectorial de ambas, usada para resolver la tensión (criterio estándar de "resultant load" para condiciones de viento/hielo).
2. **Tensión bajo una hipótesis distinta a la de referencia**: ecuación de cambio de estado (state-change equation), deducida de la identidad de longitud de arco elástico-térmica del conductor (ver comentario extenso en `catenary.js`), resuelta por Newton-Raphson. Validada numéricamente contra la solución autoconsistente no linealizada (error < 0.1% en los rangos de esta app). Es la formulación estándar de la industria para sag-tension de un vano (análoga conceptualmente al método de PLS-CADD, sin reproducir su algoritmo interno exacto).
3. **Curva de catenaria**: forma exacta (`H/w·cosh(...)`, no aproximación parabólica) para apoyos a distinta elevación, con solución cerrada para el punto bajo (no requiere iteración).

**Simplificaciones documentadas** (Fase 1, explícitas también en el código):
- Cada vano se resuelve de forma **independiente** a partir de una tensión de referencia fija por conductor (`conductor.referenceHorizontalTension`, criterio de diseño simplificado = 20% RTS). No se modela un vano regulador compartido por una sección de anclajes.
- No se modela creep/relajación de largo plazo ni deformación permanente (consistente con el alcance de Fase 1 del prompt maestro §1.1).
- La catenaria del perfil usa solo la carga vertical (autopeso + hielo); el balanceo lateral del conductor por viento no se representa en la vista 2D de perfil.

### Árbol de cargas (`src/engine/loadTree.js`)

Por estructura y por hipótesis:
- **Vertical**: peso tributario (mitad de cada vano adyacente) × N° de fases.
- **Transversal**: carga de viento tributaria + componente transversal del desequilibrio vectorial de tensión entre vanos adyacentes (relevante en estructuras de ángulo).
- **Longitudinal**: componente longitudinal de ese mismo desequilibrio vectorial (≈0 en tangente con vanos balanceados; máxima en una estructura terminal/remate, donde un único vano tracciona sin contrapeso).
- **Momento estimado** (N·m): `vertical × altura de enganche promedio` — indicador orientativo simplificado, no un cálculo estructural (el prompt maestro lo marca como opcional, §6.1).

**Simplificaciones documentadas**: no incluye peso propio de estructura/herrajes/aisladores; asume igual longitud de vano para todas las fases (offsets pequeños frente al vano); no modela balanceo de cadenas de aisladores.

## Hipótesis de carga

Mínimo recomendado (y precargado) 4: Everyday, máxima flecha (temperatura alta), viento máximo, manguito de hielo — cumple el mínimo de 3 exigido por el criterio de aceptación §10.5. Editable en la pantalla "Hipótesis de carga"; no se permite eliminar la hipótesis de referencia vigente del conductor ni la última hipótesis restante.

## Persistencia y exportación

- Autoguardado en `localStorage` (`linedesign.project.v1`) en cada mutación del store.
- Exportar/Importar el proyecto completo como JSON (botones de la barra lateral).
- Exportar el árbol de cargas como JSON independiente (botón en la pantalla "Árbol de cargas"), con metadatos (`generatedAt`, conductor, unidades).

## Reemplazo en Fase 2

`src/data/dataSource.js` es el único punto que Fase 2 necesita reemplazar (KMZ real, catálogo real). `engine` y `ui` no conocen el origen de los datos — consumen siempre la forma de `project` descrita arriba.
