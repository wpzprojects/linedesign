# LineDesign HTML

PWA que emula el flujo central de diseño de líneas de transmisión (alineamiento → estructuras → hipótesis de carga → tendido/catenaria → árbol de cargas), inspirada en PLS-CADD. Fase 1: todo con datos simulados, sin backend.

## Estado actual — Fase 1 completa

Cumple los 8 criterios de aceptación de Fase 1 del prompt maestro (`Archivos_Referenciales/PROMPT_MAESTRO_LineDesign_HTML.md` §10):

1. ✅ Alineamiento de ejemplo en planta y perfil.
2. ✅ Mover vértices por arrastre (drag) en planta; planta y perfil se recalculan (la posición de las estructuras se deriva de la station sobre el alineamiento, no se almacena fija).
3. ✅ Pantalla "Catálogo de estructuras": crear/editar/eliminar tipos, alturas y puntos de fijación.
4. ✅ Pantalla "Planta y Perfil": agregar/mover (drag)/eliminar estructuras sobre el alineamiento; los vanos se recalculan solos.
5. ✅ Hipótesis de carga (pantalla "Criterios"): 4 hipótesis precargadas (Everyday, máxima flecha, viento máximo, manguito de hielo), totalmente editables/añadibles/eliminables.
6. ✅ Catenaria del conductor calculada (forma exacta, no parabólica) y dibujada en el perfil para la hipótesis seleccionada en el selector de la barra de herramientas.
7. ✅ Árbol de cargas por estructura y por hipótesis en tabla, exportable a JSON.
8. ✅ PWA instalable: manifest + Service Worker + íconos reales (192/512) + funcionamiento offline con datos persistidos en localStorage.

Ver `DATA_MODEL.md` para el modelo de datos completo, las fórmulas del motor de cálculo y las simplificaciones explícitas de esta fase.

## Cómo ejecutar

Debe servirse por HTTP (no abrir el archivo directamente), para que el Service Worker pueda registrarse:

```bash
cd "d:\OneDrive - CELSIA S.A E.S.P\10 General\00 IA\01 VSC\LineDesing_HTML"
python -m http.server 8000
```

Abrir `http://localhost:8000/`. El navegador ofrecerá el botón de instalación ("Instalar aplicación" / ícono en la barra de direcciones); una vez instalada abre en ventana propia y sigue funcionando sin conexión, conservando el proyecto guardado en `localStorage`.

## Interfaz

Shell de aplicación de escritorio (no una página que hace scroll), con la estructura que comparten PLS-CADD, AutoCAD, QGIS y Figma: barra de actividad fija + pantallas por función + lienzo central con zoom/pan + panel de propiedades + barra de estado. Ver "Fundamento de diseño" abajo.

- **Barra de actividad** (extremo izquierdo, ~56px, nunca se esconde): íconos para cambiar de pantalla (Criterios / Planta y Perfil / Catálogo / Árbol de cargas / Resumen), más el toggle de tema al fondo.
- **Criterios**: nombre del proyecto, sistema de unidades y las hipótesis de carga (conductor, hipótesis de referencia, tabla de hipótesis) — todo lo que condiciona el cálculo, agrupado en un solo lugar; pensada para ir sumando más ajustes globales.
- **Resumen**: Explorador (árbol de vértices y estructuras — clic para seleccionar y saltar a Planta y Perfil), tarjeta de Proyecto (exportar/importar/reiniciar) y Resumen del proyecto.
- **Planta y Perfil**: lado a lado, cada una llenando el alto disponible — el `viewBox` del SVG se recalcula según el tamaño real del panel. **Zoom con rueda del mouse y pan arrastrando el fondo** (independiente por lienzo, con botones +/−/ajustar en cada cabecera). El proyector centra el contenido dentro del panel (no lo ancla a una esquina) y dibuja una regla con marcas numeradas en ambos ejes. **Las dos vistas están sincronizadas**: al pasar el cursor sobre una, aparece un marcador en la posición correspondiente de la otra — igual que en PLS-CADD. Arrastra vértices o estructuras para moverlos; un clic (sin arrastrar) los selecciona. El botón de mapa en la cabecera de Planta muestra/oculta un **mapa base real** (Leaflet: calles/OpenStreetMap o satélite/Esri, con control para alternar) detrás del alineamiento, ubicado según la georreferencia del proyecto (`alignment.origin`, editable en Criterios) — ver "Mapa base" abajo.
- **Panel de propiedades** (derecha): edición del vértice o estructura seleccionada — reemplaza cualquier formulario flotante por un inspector fijo, como en Figma/AutoCAD/QGIS.
- **Barra de estado** (inferior, siempre visible): coordenadas en vivo bajo el cursor (X/Y en Planta, station/elevación en Perfil), resumen del proyecto, mensajes transitorios de las últimas acciones, y el zoom vigente de cada lienzo.
- **Catálogo de estructuras**: crear/editar tipos (nombre, categoría, alturas disponibles, puntos de fijación del conductor por fase).
- **Árbol de cargas**: tabla de fuerzas (vertical/transversal/longitudinal + momento estimado) por estructura y por hipótesis; botón "Exportar JSON".

### Mapa base (Fase 2)

`src/ui/mapRenderer.js` monta un mapa de [Leaflet](https://leafletjs.com/) (cargado por CDN, ver `index.html`) como capa de fondo **detrás** del `<svg>` de Planta, no como reemplazo del lienzo: el alineamiento se sigue dibujando exactamente igual que siempre (mismas coordenadas locales en metros, mismo drag, mismo zoom/pan). Para que el mapa se mueva/escale en sincronía con el SVG sin recargar teselas en cada frame, se le aplica el mismo `transform: translate(...) scale(...)` que ya usa `viewport.js` para el `<g>` de zoom del SVG — el mapa queda "congelado" en una vista base (calibrada para que su escala en metros/píxel coincida con la del proyector) y solo esa transformación CSS se actualiza durante el gesto; la vista base se recalcula una vez por `render()`, no en cada frame. El punto de anclaje es `alignment.origin` (lat/lon del vértice local `(0,0)` + rumbo del eje Y), editable en la pantalla "Criterios" — ver `src/engine/geo.js` y `DATA_MODEL.md`.

### Fundamento de diseño

La distribución no es una preferencia estética: se investigó la interfaz real de PLS-CADD (menú Terreno/Estructuras/Líneas, vistas Planta/Perfil/3D sincronizadas por un marcador de cursor compartido) y el patrón que comparten AutoCAD, QGIS, Figma y VS Code — navegación fija + pantallas por función + lienzo con zoom/pan + inspector de propiedades + barra de estado con lectura de coordenadas — para construir un "cascarón" de Fase 1 que ya tiene la forma de la herramienta final, no una demo que habrá que rehacer en Fase 2.

## Consideraciones PWA

- `manifest.webmanifest` define nombre, íconos (192/512, generados con `generate_icons.py` a partir del logo fuente `assets/Logo.jfif`; el mismo script produce `assets/logo-mark.png`, un recorte circular con fondo transparente para la marca dentro de la UI), `display: standalone`.
- `sw.js` cachea el app-shell completo (HTML/CSS/JS/íconos) con estrategia cache-first y versión de caché (`CACHE_NAME`).
- **Tarea recurrente**: cada vez que se agregue un archivo nuevo al proyecto (nueva vista, librería, etc.), hay que añadirlo a `APP_SHELL` en `sw.js` **y** subir `CACHE_NAME`, o los usuarios con la app instalada quedarán en una versión vieja.
- El mapa base (Leaflet, CDN) y sus teselas de OpenStreetMap/Esri **no** funcionan offline: `leaflet.js`/`leaflet.min.css` sí están en `APP_SHELL` (URLs versionadas de cdnjs, estables), pero las teselas son ilimitadas/dinámicas y no se pueden precachear — sin conexión, la app sigue funcionando 100% para el cálculo, y el mapa simplemente no carga teselas nuevas (documentado en el Apéndice A del prompt maestro).

## Estructura del proyecto

- `src/data/` — `dataSource.js` (interfaz de datos simulados, reemplazable en Fase 2) y `projectStore.js` (estado del proyecto, mutaciones, persistencia).
- `src/engine/` — `stationing.js` (geometría del alineamiento/perfil), `catenary.js` (sag-tension), `loadTree.js` (árbol de cargas), `geo.js` (conversión local↔lat/lon, Fase 2). Sin dependencias de DOM: se pueden probar de forma aislada.
- `src/ui/` — una vista por pantalla (`planView`, `profileView`, `catalogView`, `hypothesesView`, `loadTreeView`), más `app.js` (orquestador), `theme.js`, `viewport.js` (controlador de zoom/pan reutilizable), `mapRenderer.js` (mapa base de Planta, Fase 2), `domUtil.js`/`svgUtil.js` (helpers, incl. construcción de la regla numerada).
- `assets/` — íconos PWA.
- `tests/engine.test.js` — pruebas del motor de cálculo sin framework (`node tests/engine.test.js`; requiere Node.js, no incluido en este entorno de desarrollo — ver nota abajo).

## Nota sobre pruebas del motor

`tests/engine.test.js` verifica `stationing`, `catenary` (incl. dirección física correcta de la tensión ante cambios de temperatura/carga) y `loadTree` mediante aserciones simples de Node (`assert`), sin dependencias externas. Este entorno de desarrollo no tenía Node.js disponible al momento de escribir la Fase 1, así que la fórmula de tensión se validó numéricamente con un script Python equivalente (solución autoconsistente, no linealizada) antes de fijarla en `catenary.js`. Ejecutar `node tests/engine.test.js` en un entorno con Node para correr la suite completa.

## Fase 2 — en curso

- ✅ Mapa base real en Planta (Leaflet: calles/OpenStreetMap + satélite/Esri), georreferenciado vía `alignment.origin` (editable en Criterios).
- ⬜ Importar KMZ real y sustituir `dataSource.js` por una fuente real, sin tocar `engine`/`ui` — reemplazaría el origen manual por coordenadas reales del archivo.
- ⬜ Perfil de elevación desde un servicio de terreno/DEM real.
