# Prompt Maestro — LineDesign HTML (emulador ligero de PLS-CADD)

> Documento de instrucciones para el agente de Claude Code (VSC). Léelo completo antes de escribir la primera línea de código. Está organizado por fases: **no avances a una fase sin cerrar los criterios de aceptación de la anterior.**

---

## 1. Contexto y objetivo

Estamos construyendo un aplicativo web **instalable como PWA (Progressive Web App)** — es decir, que además de funcionar en el navegador, el usuario pueda "instalarlo" en su equipo o dispositivo (ícono propio, ventana independiente sin barra del navegador, y funcionamiento offline) — que replique **las funciones más relevantes de PLS-CADD** (software de referencia en la industria para diseño de líneas de transmisión). El objetivo no es igualar PLS-CADD en cobertura, sino tener una herramienta propia, liviana y personalizable que cubra el flujo de trabajo central: cargar/definir un alineamiento, distribuir estructuras sobre él, tender el cable, calcular esfuerzos bajo distintas hipótesis de carga, y emitir el árbol de cargas por estructura.

El desarrollo es **incremental y con datos simulados primero**: en la Fase 1 no se conecta a mapas reales ni se procesa un KMZ real — se simula la entrada de datos para poder construir y probar toda la lógica de edición, distribución de estructuras y cálculo mecánico. La integración con datos geográficos reales (KMZ, DEM/elevaciones desde un mapa) es la Fase 2.

Los manuales de referencia de PLS-CADD (inglés v20 y español v19) están disponibles en `Archivos_Referenciales/Manuales PLS CADD/` dentro de este proyecto. Úsalos como fuente de verdad para terminología, fórmulas y comportamiento esperado cuando tengas dudas — pero no busques replicar la totalidad del software, solo lo que se describe en este documento.

### 1.1 Suposiciones de cálculo y unidades

Antes de comenzar la implementación, el agente debe dejar fijado y documentado un conjunto mínimo de convenciones para evitar inconsistencias entre módulos:

- Sistema de unidades: **SI métrico**
  - longitud: metros (m)
  - fuerza: newtons (N)
  - peso por longitud: N/m
  - temperatura: °C
  - carga por viento: N/m² o equivalente según criterio del agente, siempre documentado
- La catenaria del conductor se modelará con una **aproximación exacta de la catenaria** cuando sea posible, y con una **aproximación parabólica** solo como simplificación documentada cuando la diferencia no sea significativa para la Fase 1.
- En la Fase 1, se asume que el conductor es un cable homogéneo, sin creep ni relajación de largo plazo; no se modelan efectos de amortiguación ni cambios progresivos de tensión por tiempo.
- Las direcciones de fuerza se normalizarán explícitamente:
  - vertical: positiva hacia abajo cuando se calcula el peso del conductor
  - transversal: en dirección perpendicular al alineamiento según el sentido del viento
  - longitudinal: en dirección del eje del alineamiento, con signo según tensión diferencial entre vanos
- El cálculo de árbol de cargas por estructura debe reportar, como mínimo:
  - fuerza vertical total
  - fuerza transversal total
  - fuerza longitudinal total
  - y, si se considera necesario para el diseño, momento de flexión o punta de estructura
- Cuando una decisión no esté claramente definida por este documento, se debe consultar el manual de referencia y dejar constancia de la referencia usada en el código o en `DATA_MODEL.md`.

---

## 2. Glosario de dominio (para que las decisiones de diseño sean consistentes)

- **Alineamiento (alignment/route)**: la traza en planta de la línea, definida por una polilínea de vértices (PI — Points of Intersection) con coordenadas (X, Y o lat/lon) y, eventualmente, elevación (Z).
- **Perfil (profile)**: la vista lateral del terreno y la línea a lo largo del alineamiento (distancia acumulada en X, elevación en Y).
- **Planta (plan view)**: vista en planta (mapa/top-down) del alineamiento y las estructuras.
- **Estructura (structure)**: torre o poste ubicado en un punto del alineamiento. Tiene tipo, altura, geometría de crucetas/puntos de fijación del conductor, y coordenadas (X, Y, Z de cimentación).
- **Vano (span)**: tramo de cable entre dos estructuras consecutivas.
- **Catenaria / tendido (sag-tension / stringing)**: la curva que forma el conductor entre dos estructuras según su peso, tensión horizontal, temperatura y condiciones de carga.
- **Hipótesis de carga (load case / weather case)**: combinación de condiciones (temperatura, viento, hielo/manguito de hielo, condición de "everyday", máxima carga, etc.) bajo la cual se calculan tensión y flecha del conductor.
- **Árbol de cargas (load tree / structure loading)**: el resumen de todas las fuerzas (verticales, transversales, longitudinales) que actúan sobre cada estructura, resultado de aplicar cada hipótesis a los vanos adyacentes. Es el entregable clave para el diseño estructural de la torre/poste.
- **Spotting**: proceso de ubicar/optimizar estructuras a lo largo del perfil para cumplir alturas mínimas y vanos.
- **Clearance**: distancia mínima normativa entre el conductor y el terreno/obstáculos (fuera de alcance en Fase 1, mencionado para Fase 3).

---

## 3. Filosofía de desarrollo por fases

1. **Fase 1 — MVP con datos simulados** (alcance de este documento en detalle): todo el flujo funcional con entrada manual o generada de forma sintética. Vistas en **planta** y **perfil** únicamente (nada de 3D todavía).
2. **Fase 2 — Datos reales**: importar KMZ real, entrada manual coordenada-por-coordenada validada, y cálculo de perfil de elevación consultando un servicio de terreno/mapa real.
3. **Fase 3 — Extensiones futuras**: vista 3D, verificación de clearances contra normativa, optimización automática de spotting, catálogos extensos de estructuras/conductores, exportación de reportes.

El agente debe construir la Fase 1 de forma que los módulos de datos "simulados" (alineamiento, catálogo de estructuras) sean fácilmente reemplazables por fuentes reales en la Fase 2 — es decir, aislar la fuente de datos detrás de una interfaz/función clara (por ejemplo `getAlignmentData()`, `getStructureCatalog()`) en vez de hardcodear datos dispersos en la UI.

---

## 4. Arquitectura técnica (Fase 1)

- **Aplicación 100% cliente**: HTML + CSS + JavaScript, servida como estáticos (no basta con "abrir el archivo" localmente para PWA — ver requisito de instalabilidad abajo), sin backend obligatorio en esta fase.
- **Requisito de instalabilidad (PWA)** — esto aplica desde la Fase 1, no es algo para después:
  - `manifest.json` con nombre, íconos (varios tamaños, incluyendo al menos 192x192 y 512x512), `display: standalone` (o `fullscreen`), color de tema y de fondo.
  - **Service Worker** que cachee los assets estáticos (HTML/CSS/JS/íconos) para que la app cargue y funcione **offline** una vez instalada, y con una estrategia de actualización clara (ej. cache-first con invalidación por versión) para que el usuario reciba nuevas versiones sin quedar atascado en una caché vieja.
  - Servir la app por HTTPS o `localhost` durante desarrollo (requisito técnico de los navegadores para registrar el Service Worker e instalar la PWA) — el agente debe indicar cómo se sirve en desarrollo (ej. un servidor estático simple) y documentarlo en el `README.md`.
  - Verificar visualmente que el navegador ofrece el botón/opción de "Instalar aplicación" y que, una vez instalada, abre en ventana propia y conserva los datos guardados (ver persistencia abajo).
  - Como el proyecto crecerá en fases, el Service Worker y el manifest deben actualizarse a medida que se agreguen nuevos assets (ej. librería de mapas en Fase 2) — dejar esto anotado en `README.md` como tarea recurrente, no un paso único.
- Se permite el uso de librerías de terceros vía CDN para acelerar desarrollo, pero **cuidado con la instalabilidad/offline**: si se usa un recurso de CDN, el Service Worker debe cachearlo también (o preferir una copia local del recurso) para que la app instalada siga funcionando sin conexión. Ejemplos:
  - Renderizado 2D (planta/perfil): SVG nativo, `Canvas 2D`, o una librería ligera (ej. Konva.js) — a criterio del agente, pero debe justificar la elección.
  - Gráficas auxiliares (si se requieren): Chart.js.
- Estructura de proyecto modular: separar claramente **modelo de datos**, **motor de cálculo** (catenaria, esfuerzos, árbol de cargas) y **UI** (planta, perfil, editor de estructuras, editor de hipótesis). El motor de cálculo debe poder probarse de forma aislada (idealmente con pruebas unitarias simples en JS, aunque sea manual/consola).
- Persistencia en Fase 1: `localStorage` o IndexedDB (preferible si se espera guardar proyectos más grandes u offline de forma más robusta) y exportar/importar el proyecto como JSON — no se requiere backend ni base de datos.
- La estructura inicial del proyecto debe seguir esta organización sugerida:
  - `/src/data` — tipos, museos de datos_simulados, serialización del proyecto, catálogo de conductores/estructuras.
  - `/src/engine` — catenaria, cálculo de perfiles, distribución de estructuras, árboles de cargas, hipótesis de carga.
  - `/src/ui` — componentes de planta, perfil, paneles de edición, tablas, formularios.
  - `/src/pwa` — manifest, service worker, instalación y caché offline.
  - `/src/utils` — helpers generales, validaciones, formato/parseo.
  - `/public` — HTML base, assets estáticos, íconos, favicon.
  - `/tests` — pruebas pequeñas del motor, especialmente catenaria y carga por estructura.
  - `/README.md` — instrucciones de uso y estado.
  - `/DATA_MODEL.md` — documentación del modelo final de datos.
- El agente debe proponer y documentar la arquitectura elegida (estructura de carpetas y archivos) antes de generar código extenso, y validarla conmigo si hay ambigüedad relevante.
- El flujo de trabajo debe entregarse en iteraciones verificables en este orden:
  1. alineación + vista en planta + vista en perfil
  2. catálogo de estructuras + distribución de estructuras
  3. hipótesis de carga + cálculo de catenaria
  4. árbol de cargas + exportación JSON
  5. PWA instalable + persistencia offline

---

---

## 5. Modelo de datos (borrador — el agente puede refinarlo)

```json
{
  "alignment": {
    "vertices": [{"id": "PI-1", "x": 0, "y": 0, "z": 0}, "..."]
  },
  "structures": [
    {
      "id": "EST-01",
      "typeId": "TIPO-A",
      "stationing": 120.5,
      "x": 0, "y": 0, "z": 0,
      "attachmentPoints": [{"name": "fase-A", "offsetX": -2, "offsetZ": 15}]
    }
  ],
  "structureCatalog": [
    {
      "typeId": "TIPO-A",
      "name": "Torre Suspensión 15m",
      "heightOptions": [12, 15, 18],
      "attachmentPoints": ["..."]
    }
  ],
  "conductor": {
    "name": "ACSR 4/0",
    "diameter": 0.0143,
    "weightPerLength": 4.5,
    "elasticModulus": 6.9e10,
    "thermalExpansionCoef": 1.9e-5,
    "ultimateStrength": 40000
  },
  "hypotheses": [
    {
      "id": "H1",
      "name": "Everyday (15°C, sin viento)",
      "temperature": 15,
      "wind": 0,
      "ice": 0
    }
  ],
  "loadTree": {
    "structureId": "EST-01",
    "hypothesisId": "H1",
    "forces": {"vertical": 0, "transversal": 0, "longitudinal": 0}
  }
}
```

El agente debe ajustar nombres/unidades (definir explícitamente sistema de unidades: métrico, SI) y documentar el modelo final en un archivo `DATA_MODEL.md`.

---

## 6. Requisitos funcionales — Fase 1 (detallado)

### 6.1 Alineamiento simulado
- Generar o cargar un alineamiento de ejemplo (polilínea con varios vértices) sin depender de KMZ real.
- Permitir **mover vértices** del alineamiento (drag en la vista en planta) y ver el perfil recalcularse en consecuencia.
- Permitir agregar/eliminar vértices.

### 6.2 Vista en Planta
- Mostrar el alineamiento como polilínea, con las estructuras ubicadas sobre él.
- Interacción: seleccionar, mover estructuras y vértices; hacer zoom/pan.

### 6.3 Vista en Perfil
- Mostrar el perfil longitudinal (distancia acumulada vs. elevación) derivado del alineamiento simulado.
- Mostrar las estructuras ubicadas sobre el perfil, con su altura.
- Mostrar la catenaria del conductor entre estructuras consecutivas (ver 6.8).

### 6.4 Catálogo/editor de estructuras (pantalla separada)
- Pantalla dedicada para crear/editar tipos de estructura (torres/postes): nombre, altura(s) disponibles, puntos de fijación del conductor (offsets respecto al eje de la estructura).
- Estos tipos alimentan el catálogo que se usa al distribuir estructuras sobre el alineamiento (dato simulado en esta fase, reemplazable luego por un catálogo real/importado).

### 6.5 Distribución de estructuras sobre el alineamiento
- Insertar estructuras del catálogo en puntos (stationing) del alineamiento, manual o de forma asistida (ej. espaciado sugerido).
- Recalcular vanos automáticamente al mover o insertar estructuras.

### 6.6 Definición de hipótesis de carga
- Editor de hipótesis: temperatura, viento, hielo/manguito, y las que el agente considere estándar en PLS-CADD (consultar el manual de referencia) — como mínimo: condición "everyday", condición de máxima flecha (temperatura alta), condición de viento máximo, condición de hielo (si aplica a la zona de trabajo).
- Debe poder definirse más de una hipótesis y seleccionar cuál se usa para cada cálculo.

### 6.7 Tendido del cable (sag-tension)
- Dado un conductor (catálogo simulado con propiedades físicas), calcular la catenaria (flecha y tensión) por vano, para cada hipótesis definida.
- Mostrar la curva del conductor sobre el perfil.
- Documentar claramente las fórmulas usadas (catenaria parabólica simplificada vs. catenaria exacta) y las suposiciones (ej. sin considerar fluencia/creep del conductor en esta fase).

### 6.8 Cálculo de esfuerzos y árbol de cargas
- Para cada estructura, calcular las fuerzas resultantes (verticales por peso del conductor, transversales por viento, longitudinales por desequilibrio de tensión entre vanos adyacentes) bajo cada hipótesis.
- Emitir el "árbol de cargas": una tabla/reporte por estructura mostrando las fuerzas por cada hipótesis, exportable como JSON y visualizable en la interfaz (tabla).

---

## 7. Fase 2 — Integración con datos reales (no implementar aún, solo diseñar pensando en esto)

- Importar un **KMZ real** y extraer la polilínea del alineamiento.
- Permitir entrada manual del alineamiento coordenada por coordenada (lat/lon), validando formato.
- Mostrar el alineamiento en planta **sobre un mapa real** (ej. Leaflet + capa de OpenStreetMap o similar).
- Calcular el perfil de elevación consultando un servicio de elevación/DEM (ej. Open-Elevation, Mapbox Terrain, o el que se decida según acceso a internet/licencias) en vez del perfil simulado.
- El resto del flujo (estructuras, hipótesis, tendido, árbol de cargas) debe reutilizarse sin reescritura, gracias a la separación lograda en la Fase 1.

---

## 8. Fase 3 — Futuro (solo mencionado, no detallar aún)

- Vista 3D interactiva.
- Verificación de clearances según normativa (NESC, RETIE u otra que se defina).
- Optimización automática de spotting (ubicación óptima de estructuras).
- Catálogos extensos y exportación de reportes formales (PDF).

---

## 9. Requisitos no funcionales

- Código organizado en módulos claros (ej. `/data`, `/engine`, `/ui`, `/assets`), con nombres de archivo descriptivos.
- Comentarios en el motor de cálculo explicando fórmulas y unidades.
- Un archivo `README.md` con instrucciones de uso y estado del proyecto (qué está simulado, qué es real), incluyendo cómo servir la app localmente para probar la instalación como PWA.
- Un archivo `DATA_MODEL.md` documentando el modelo de datos final.
- Commits/avances incrementales: entregar primero el flujo de planta+perfil con alineamiento y estructuras simuladas navegable, antes de sumar hipótesis y cálculos.
- Ante cualquier ambigüedad de fórmula o comportamiento esperado de PLS-CADD, consultar los manuales en `Archivos_Referenciales/Manuales PLS CADD/` y dejar constancia de la referencia usada (sección/página) en el comentario del código o en `DATA_MODEL.md`.

---

## 10. Criterios de aceptación — Fase 1

La Fase 1 se considera lista cuando, con datos simulados, se puede de principio a fin:

1. Ver un alineamiento de ejemplo en planta y en perfil.
2. Mover vértices del alineamiento y ver planta/perfil actualizarse.
3. Crear/editar tipos de estructura en la pantalla de catálogo.
4. Distribuir estructuras del catálogo sobre el alineamiento y ver los vanos resultantes.
5. Definir al menos 3 hipótesis de carga distintas.
6. Ver la catenaria del conductor calculada en el perfil para cada vano.
7. Obtener el árbol de cargas por estructura, para cada hipótesis, en una tabla exportable.
8. La app cumple los requisitos de instalabilidad (manifest + Service Worker): el navegador ofrece instalarla, y una vez instalada abre en ventana propia y sigue funcionando sin conexión a internet con los datos guardados.

---

## 11. Cómo debe trabajar el agente

- Antes de escribir código extenso, proponer la estructura de carpetas/archivos y un plan de trabajo por pasos, y esperar validación si hay dudas de alcance.
- Avanzar en incrementos verificables (no intentar construir todo el flujo en un solo paso).
- Preguntar explícitamente cuando una decisión de PLS-CADD no esté clara en este documento (ej. fórmula exacta de catenaria a usar, unidades por defecto, campos exactos del árbol de cargas) en lugar de asumir en silencio.
- Mantener separados los datos simulados de la lógica de negocio, para que la Fase 2 sea un reemplazo de fuente de datos, no una reescritura.

---

## 12. Referencias disponibles en el proyecto

- `Archivos_Referenciales/Manuales PLS CADD/PLS-CADD ESP v19.pdf` (manual en español)
- `Archivos_Referenciales/Manuales PLS CADD/PLS-CADD ENG v20.pdf` (manual en inglés, más reciente)
- `Archivos_Referenciales/Manuales PLS CADD/Integración con Google Earth.pdf` (referencia para la futura integración con KMZ/mapas de la Fase 2)
