# Data Model — LineDesign HTML (Fase 1)

## Unidades (fijas para todo el proyecto)

| Magnitud | Unidad |
|---|---|
| Longitud, altura | metros (m) |
| Coordenadas del alineamiento (`vertex.x`/`vertex.y`) | metros (m), MAGNA-SIRGAS / Origen-Nacional (EPSG:9377) — ver abajo |
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
  "alignment": {
    "vertices": [{ "id": "PI-01", "x": 4779670.08, "y": 2054088.5, "z": 601 }]
  },
  "structureCatalog": [
    {
      "typeId": "TIPO-A",
      "name": "Torre suspensión 18 m",
      "type": "Suspensión",
      "heightOptions": [15, 18, 21],
      "resistanceOptions": [510, 750, 1050, 1350],
      "attachmentPoints": [{ "name": "Fase A", "offsetX": -2.2, "offsetZ": 15.5 }]
    }
  ],
  "structures": [
    { "id": "EST-01", "typeId": "TIPO-A", "station": 60, "height": 18, "resistance": 750 }
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
  ],
  "stringingTensions": [
    {
      "id": "ST-01", "weatherCase": "Everyday (EDS)", "cableCondition": "",
      "percentUltimate": 22, "maxTension": null, "maxCatenary": null, "applicableCable": ""
    }
  ],
  "groundClearance": 0,
  "rightOfWayWidth": 0,
  "sectionConductors": [{ "id": "SC-01", "fromId": "EST-01", "toId": "EST-03", "conductorId": "ACSR-336" }]
}
```

`stringingTensions` (Parámetros de entrada § Tensiones de tendido): equivalente al "Automatic Sagging Criteria" de PLS-CADD — determina la tensión horizontal instalada (H1) por vano, en vez de usar siempre el valor fijo `conductor.referenceHorizontalTension`. `weatherCase`/`applicableCable` guardan el *nombre* (no el id) del caso climático/conductor elegido en el desplegable — texto libre en la práctica, no una referencia validada; `applicableCable` en blanco aplica a todos los conductores. `maxTension`/`maxCatenary` son `null` cuando el campo queda en blanco (opcional); `maxCatenary` es el parámetro de catenaria `C = H/w` (m), no una distancia física.

`catenary.resolveReferenceTension(conductor, referenceHypothesis, stringingTensions)` busca filas donde `weatherCase` coincida con el nombre de la hipótesis de referencia (`conductor.referenceHypothesisId`, NO el selector "Catenaria bajo hipótesis" de Planta y Perfil, que solo cambia qué hipótesis se dibuja) y `applicableCable` esté vacío o coincida con el conductor. Por cada fila que aplique calcula `H = min(%rotura·RTS, tensión máxima, peso_vertical·catenaria_máxima)` (solo los límites presentes, piso de 1 N); si aplican varias filas, se usa la más restrictiva (mínima). Ningún criterio depende de la longitud del vano (la catenaria máxima, C = H/w, es por definición independiente del vano — para eso existe, a diferencia de un límite de flecha máxima que esta app no modela), por eso la función no recibe `spanLength`.

Si la hipótesis de referencia vigente NO tiene fila que aplique, `app.js#checkStringingCriteria` no cae en silencio al valor manual: busca otra hipótesis del proyecto que sí tenga fila para ese conductor y cambia `conductor.referenceHypothesisId` a esa automáticamente (`store.updateConductor`, con aviso transitorio en la barra de estado). Solo si NINGUNA hipótesis tiene fila para el conductor se usa `conductor.referenceHorizontalTension` (el campo manual) como último recurso — ahí `hypothesesView.js#renderConductorCard` muestra un aviso persistente (`.stringing-warning`, no un popup que se cierra solo) justo debajo de ese campo, mientras la condición siga vigente. Cuando SÍ hay fila que aplica, el campo manual se deshabilita y muestra el valor calculado (no el guardado), para que no parezca editable sin serlo. Si la tabla está vacía del todo no se muestra nada — eso es "no se usa este criterio", no una configuración incompleta. Este chequeo automático solo mira el conductor **del proyecto** (`project.conductor`), no las secciones con conductor propio (siguiente párrafo) — una sección con override y sin fila que aplique no dispara ningún aviso todavía.

`sectionConductors` (opcional): asigna un conductor distinto al del proyecto a UNA sección de tensionamiento puntual — p. ej. un salto o derivación con un cable más liviano. `fromId`/`toId` son los ids de las estructuras de anclaje que delimitan esa sección (ver más abajo), no ids de vértices ni de vanos individuales. `loadTree.resolveSectionConductor(project, fromId, toId)` devuelve el conductor de esa entrada si existe, o `project.conductor` si no — así una sección sin entrada aquí simplemente usa el del proyecto, comportamiento por defecto. Se edita seleccionando cualquier vano de la sección en Perfil (selecciona la sección completa, no un vano suelto) y cambiando "Conductor de la sección" en Propiedades; la opción "Usar el del proyecto" llama a `store.clearSectionConductor` en vez de guardar una entrada.

`groundClearance` (Parámetros de entrada § Terreno, m): distancia de seguridad al terreno. Cuando es mayor que 0, `profileView.js` dibuja una línea punteada gris con la misma forma del terreno, desplazada esa distancia hacia arriba (en espacio de datos, antes de proyectar — respeta la exageración vertical igual que el resto del perfil).

`rightOfWayWidth` (Parámetros de entrada § Terreno, m): ancho de la franja de servidumbre. Cuando es mayor que 0, `planView.js` dibuja dos líneas punteadas grises paralelas al alineamiento, cada una a `rightOfWayWidth / 2` de distancia — `stationing.offsetPolyline(vertices, distance)` desplaza cada vértice perpendicular al propio trazado (no a los ejes X/Y), promediando la dirección de los dos segmentos que se cruzan en cada vértice interior (aproximación de miter simple, sin corrección de longitud en el ángulo — en un quiebre muy cerrado el borde queda un poco más angosto que el ancho configurado justo en ese PI).

`structureCatalog[i].resistanceOptions` (kgF, opcional): resistencias mecánicas disponibles del tipo de estructura, análogo a `heightOptions` — solo dato de catálogo por ahora, sin usarse todavía en `loadTree.js` ni en ningún cálculo (no hay verificación de resistencia vs. carga en esta fase). Los tipos que no lo traen (p.ej. proyectos guardados antes de este campo) simplemente no muestran esa línea en la tarjeta del catálogo.

`structures[i].resistance` (kgF, opcional): la resistencia elegida para esa estructura puntual, análoga a `height` — solo aparece en el panel de Propiedades cuando su tipo trae `resistanceOptions`. `undefined` si el tipo no tiene resistencias configuradas.

### Decisión clave: posición de estructuras derivada, no almacenada

`structures[i]` **no** guarda `x`/`y`/`z`. Guarda `station` (distancia acumulada sobre el alineamiento) y `height`. La posición (x, y, z) se deriva en caliente con `stationing.resolveStructures(vertices, structures)` interpolando sobre la polilínea vigente. Esto es lo que permite que mover un vértice del alineamiento reubique automáticamente las estructuras y recalcule vanos, catenaria y árbol de cargas sin lógica de sincronización adicional (criterios de aceptación §10.2 y §10.4 del prompt maestro).

### Sistema de coordenadas: MAGNA-SIRGAS / Origen-Nacional (EPSG:9377)

`vertex.x`/`vertex.y` (y por lo tanto todo lo que se deriva de ellos: station, posición de estructuras, distancias) son directamente **Este/Norte reales** en el sistema de referencia oficial de Colombia para cartografía a escala nacional (IGAC), no un sistema local arbitrario: `x` = Este, `y` = Norte, en metros, sin rotación ni desplazamiento adicional. El proyecto de ejemplo (`x ≈ 4 994 467, y ≈ 2 198 889`) cae, en el mundo real, en zona montañosa de Boyacá (Cordillera Oriental, cerca de Duitama/Nobsa) — son coordenadas de 7 cifras porque incluyen el falso este (5 000 000 m) y falso norte (2 000 000 m) de la proyección.

`src/engine/geo.js` implementa la conversión Este/Norte (EPSG:9377) ↔ lat/lon (WGS84/MAGNA-SIRGAS, EPSG:4326) — Transversa de Mercator sobre elipsoide GRS80, meridiano central 73° O, latitud de origen 4° N, factor de escala 0.9992 — que usa `src/ui/mapRenderer.js` para ubicar el mapa base de Planta (Leaflet solo entiende lat/lon) y `app.js` para mostrar lat/lon bajo el cursor en la barra de estado. El motor de cálculo (`stationing`, `catenary`, `loadTree`) nunca necesita lat/lon — trabaja siempre en Este/Norte, como cualquier distancia relativa.

### `alignment.terrainProfile` (Fase 2 — perfil de terreno real)

Opcional; ausente hasta que el usuario presiona el botón "Ajustar al terreno real" en la cabecera de Perfil. Array de `{ station, elevation }` — un muestreo del alineamiento cada 25 m (paso más grueso si el trazado supera unos 12.5 km, para no exceder ~500 puntos en una sola operación) de la elevación real, consultada a un servicio de elevación (`src/data/elevationSource.js`) vía `geo.epsg9377ToLatLon` para convertir cada punto muestreado a lat/lon, y **suavizado** con `stationing.smoothTerrainProfile` (promedio ponderado gaussiano por distancia en station, `sigma = 40 m` por defecto) antes de guardarse — el dato crudo de los servicios gratuitos puede venir con saltos entre puntos consecutivos que no son terreno real, así que se guarda ya suavizado, no crudo. **Por qué 25 m de muestreo y no menos**: los datasets tipo SRTM que sirven estos servicios gratuitos tienen resolución real de ~30 m — muestrear más seguido que eso no agrega detalle de terreno. Cuando el perfil está presente, `profileView.js` lo dibuja en vez de la interpolación lineal entre vértices (más fiel al terreno real, incl. picos/valles entre PIs que la sola `vertex.z` no captura) — ver `.profile-line--real` en `styles.css`.

`stationing.resolveStructures(vertices, structures, terrainProfile)` también usa este perfil (con `elevationAtStation`, interpolando entre las dos muestras reales más cercanas a la station de cada estructura) para la elevación de la BASE de cada estructura, en vez de interpolar linealmente entre los dos vértices vecinos — así el poste queda apoyado sobre el terreno real dibujado, no "flotando" sobre una aproximación más gruesa (bug real que se detectó comparando visualmente dónde caía cada poste contra la curva de terreno). Se usa en `profileView.js` y `loadTree.js` (ambos reciben `project.alignment.terrainProfile`); `planView.js` no lo necesita porque en Planta la elevación no se dibuja.

**`elevationSource.js` prueba dos servicios públicos sin API key, en orden, y usa el primero que responda** (`PROVIDERS`, ver el propio archivo para el detalle):

1. [OpenTopoData](https://www.opentopodata.org/) (dataset SRTM 30m) — mejor calidad de dato, pero su API pública no pareció soportar CORS de forma consistente en las pruebas (`fetch()` falla directamente desde el navegador, sin llegar a responder).
2. [Open-Elevation](https://open-elevation.com/) — sí acepta peticiones desde el navegador, pero se observó (con datos reales exportados de un proyecto) que a veces devuelve el mismo valor de elevación para tramos enteros entre vértices — un perfil en "escalones" que no corresponde al terreno real, por datos degradados del servidor público de demo (se descartó que fuera un problema de cómo se emparejaban los resultados: se probó tanto por posición como por la coordenada que el propio servicio devuelve, con el mismo resultado).

Ninguno de los dos es perfecto — son servicios gratuitos de terceros ("pueden ser lentos o inestables bajo carga", prompt maestro Apéndice A.2) — así que el fallback automático entre ambos, más el suavizado (arriba), es más robusto que apostarlo todo a uno solo.

**Se evaluó** sumar la Google Elevation API como alternativa con key propia del usuario (configurable desde la pantalla "Configuración") para cuando el terreno saliera "en escalones" en zonas muy accidentadas. Se descartó: exige una cuenta de facturación de Google Cloud activa incluso para el nivel gratuito, y el suavizado del dato gratuito ya resuelve el problema que la motivaba — no vale la pena esa fricción para el usuario. La pantalla "Configuración" queda otra vez sin contenido, lista para otro ajuste de la app a futuro.

### Importar alineamiento desde KMZ/KML (Fase 2, prompt maestro Apéndice B)

Botón "Importar alineamiento" en la pantalla "Parámetros de entrada". Flujo completo:

1. `src/data/kmzImport.js#parseKmzOrKml(file)` lee el archivo — si es `.kmz` (un ZIP), lo descomprime con [JSZip](https://stuk.github.io/jszip/) (CDN) y toma el primer `.kml` que encuentre adentro; si es `.kml` suelto, lo lee directo como texto. Límite de tamaño: 20 MB.
2. `extractCandidates(kmlText)` parsea el XML con `DOMParser` nativo (sin librería) y junta un candidato por cada `Placemark` que tenga un `LineString` con ≥2 puntos: `{ name, points: [{lat, lon, alt}] }` — `alt` es la altitud que trae la tupla `lon,lat,alt` del KML (0 si el KML no la trae; es opcional en el formato).
3. Si hay más de un candidato, `app.js` muestra una lista (nombre + cantidad de puntos) para que el usuario elija cuál importar — no se asume el primero (Apéndice B.1). También ofrece un checkbox para invertir el orden del trazado, por si el KML viene desde el extremo "equivocado".
4. Las coordenadas del candidato elegido se convierten a Este/Norte (EPSG:9377) con `geo.latLonToEpsg9377` (conservando `alt` como `z`), y se simplifican con `stationing.simplifyPolyline(points, 5)` (Douglas-Peucker, tolerancia 5 m) — los trazados de Google Earth suelen venir sobre-muestreados (cientos de puntos siguiendo el trazo a mano) frente a un alineamiento de diseño real (unos pocos PIs en los quiebres de ángulo); como el algoritmo solo DESCARTA puntos (nunca interpola ninguno nuevo), la `z` de cada punto que sobrevive sigue siendo la altitud real de ese punto del archivo. La tolerancia queda fija por ahora; el usuario sigue pudiendo editar vértices a mano en Planta después de importar (agregar/mover/eliminar), la importación es un punto de partida, no un resultado final.
5. `store.importAlignment(points)` (`points`: `[{x, y, z}]`, ya en local) reemplaza `alignment.vertices` y limpia `structures`/`terrainProfile`, que ya no tendrían sentido sobre la geometría nueva (stations y elevaciones puntuales de otro trazado). Reinicia los contadores de id de vértice/estructura, así que los nuevos vértices vuelven a numerarse desde PI-1. **Sobre la `z` importada**: si el KML no traía altitud (`alt = 0` en todos los puntos), la app lo avisa en la barra de estado y sugiere usar "Ajustar al terreno real" en Perfil — la altitud de un KML puede venir "sujeta al suelo" o en un datum vertical distinto, así que sigue siendo responsabilidad del usuario decidir si le sirve tal cual o prefiere la elevación real de un servicio de terreno.
6. `app.js` navega automáticamente a "Planta y Perfil" para que el usuario vea el resultado.

Validaciones: archivo corrupto o sin ningún `.kml`/`LineString` reconocible, coordenadas fuera de rango (`lat` fuera de `[-90, 90]`, `lon` fuera de `[-180, 180]`) — todo con mensajes de error claros vía `alert()`, sin fallar en silencio (Apéndice B.5).

`store.applyTerrainProfile(terrainProfile, vertexElevations)` guarda este array **y**, en la misma mutación, actualiza `vertex.z` de cada vértice a su elevación real (la station de cada vértice ya está incluida en el muestreo, así que reusa el mismo lote de resultados sin otra consulta) — así la posición derivada de las estructuras (`stationing.resolveStructures`, que interpola `vertex.z` linealmente) también se ajusta al terreno real en los PIs, aunque siga siendo una interpolación lineal *entre* vértices (no usa el perfil denso para eso — simplificación de Fase 2, ver limitación arriba sobre catenaria/perfil 2D).

### `attachmentPoints`

Pertenecen al **tipo de estructura** (catálogo), no a cada instancia — todas las estructuras de un mismo tipo comparten geometría de fijación. `offsetX` es el desplazamiento lateral (m) respecto al eje de la estructura; `offsetZ` es la elevación del punto de enganche sobre el terreno (m). Se usan para: (a) la elevación de enganche de la catenaria en el perfil (se usa `structure.height`, ver limitación abajo) y (b) el número de fases para el árbol de cargas (`loadTree.js` multiplica las fuerzas por vano por `attachmentPoints.length`).

**Simplificación de Fase 1**: la curva de catenaria dibujada en el perfil usa `structure.height` como elevación de enganche única (no una fase concreta), para mantener el perfil 2D legible con una sola curva representativa por vano. El árbol de cargas, en cambio, sí pondera por el número de fases reales del tipo. Los `offsetX`/`offsetZ` de cada fase no se usan aún para separar geometría 3D — Fase 3 (vista 3D).

## Motor de cálculo

### Tendido del cable / sag-tension (`src/engine/catenary.js`)

1. **Cargas por unidad de longitud**: vertical = autopeso + peso de hielo (sección de corona de hielo, densidad 900 kg/m³); transversal = presión dinámica de viento (`0.5·ρ_aire·v²`, ρ=1.225 kg/m³) × Cd (=1.0, simplificación) × diámetro efectivo (diámetro + 2×hielo). Carga resultante = combinación vectorial de ambas, usada para resolver la tensión (criterio estándar de "resultant load" para condiciones de viento/hielo).
2. **Secciones de tensionamiento y vano regulador** (`stationing.isAnchorStructure`/`computeTensionSections`/`tensionSectionRulingSpans`): los vanos NO se resuelven cada uno con su propia tensión — los que caen entre dos estructuras de anclaje forman una sección de tensionamiento que comparte una sola tensión horizontal, calculada con el **vano regulador** de esa sección: `L = √(Σ Lᵢ³ / Σ Lᵢ)`, fórmula estándar de la industria (equivalente conceptual al criterio de PLS-CADD). Ancla la línea el `type` (categoría) del tipo de estructura: `Retención`/`Ángulo` anclan, `Suspensión`/`Paso` no (el conductor las atraviesa, la cadena de aisladores se balancea para igualar tensión con el vano vecino). La primera y la última estructura del alineamiento cierran sección siempre, tengan o no un tipo de anclaje real asignado — la línea tiene que amarrarse en sus dos extremos. La longitud REAL de cada vano (no la reguladora) se sigue usando tal cual para dibujar su propia curva/flecha. `computeTensionSections` devuelve cada sección con `fromId`/`toId` (ids de las estructuras de anclaje que la delimitan) — son los mismos ids que usa `sectionConductors` (arriba) para asignarle un conductor propio a una sección puntual; sin asignación, la sección usa `project.conductor` y su propia `referenceHypothesisId` (cada conductor resuelve su propia hipótesis de referencia — no se asume la del conductor del proyecto para todas las secciones).
3. **Tensión bajo una hipótesis distinta a la de referencia**: ecuación de cambio de estado (state-change equation), deducida de la identidad de longitud de arco elástico-térmica del conductor (ver comentario extenso en `catenary.js`), resuelta por Newton-Raphson, usando el vano regulador de la sección (punto 2) como longitud. Validada numéricamente contra la solución autoconsistente no linealizada (error < 0.1% en los rangos de esta app). Es la formulación estándar de la industria para sag-tension de un vano (análoga conceptualmente al método de PLS-CADD, sin reproducir su algoritmo interno exacto).
4. **Curva de catenaria**: forma exacta (`H/w·cosh(...)`, no aproximación parabólica) para apoyos a distinta elevación, con solución cerrada para el punto bajo (no requiere iteración) — con la longitud REAL de cada vano individual, no la reguladora de su sección.

**Simplificaciones documentadas** (Fase 1, explícitas también en el código):
- No se modela creep/relajación de largo plazo ni deformación permanente (consistente con el alcance de Fase 1 del prompt maestro §1.1).
- La catenaria del perfil usa solo la carga vertical (autopeso + hielo); el balanceo lateral del conductor por viento no se representa en la vista 2D de perfil.
- El vano regulador de una sección no se recalcula por hipótesis — usa siempre las longitudes reales de los vanos, invariables entre hipótesis (correcto: el vano regulador es geométrico, no depende de la carga).

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
