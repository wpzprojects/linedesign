# LineDesign HTML

PWA que emula el flujo central de diseño de líneas de transmisión (alineamiento → estructuras → hipótesis de carga → tendido/catenaria → árbol de cargas), inspirada en PLS-CADD. Fase 1: todo con datos simulados, sin backend.

## Estado actual — Fase 1 completa

Cumple los 8 criterios de aceptación de Fase 1 del prompt maestro (`Archivos_Referenciales/PROMPT_MAESTRO_LineDesign_HTML.md` §10):

1. ✅ Alineamiento de ejemplo en planta y perfil.
2. ✅ Mover vértices por arrastre (drag) en planta; planta y perfil se recalculan (la posición de las estructuras se deriva de la station sobre el alineamiento, no se almacena fija).
3. ✅ Pantalla "Catálogo de estructuras": crear/editar/eliminar tipos, alturas y puntos de fijación.
4. ✅ Pantalla "Planta y Perfil": agregar/mover (drag)/eliminar estructuras sobre el alineamiento; los vanos se recalculan solos.
5. ✅ Pantalla "Hipótesis de carga": 4 hipótesis precargadas (Everyday, máxima flecha, viento máximo, manguito de hielo), totalmente editables/añadibles/eliminables.
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

Layout de aplicación a pantalla completa (no una página que hace scroll): un menú lateral colapsable a la izquierda (navegación por pantallas + panel de proyecto/resumen) y un área de trabajo a la derecha que aprovecha todo el espacio disponible.

- **Menú lateral colapsable**: el botón ☰ en la esquina superior izquierda lo esconde/muestra — al esconderlo, el contenido de la derecha ocupa el espacio liberado (no queda hueco). El estado (abierto/cerrado) se recuerda entre sesiones. En pantallas angostas, el menú abierto se muestra como panel flotante sobre el contenido en vez de empujarlo.
- **Barra superior**: siempre visible — botón de menú, título de la pantalla activa, alternar tema claro/oscuro.
- **Planta y Perfil**: se muestran lado a lado (no apiladas), cada una llenando el alto disponible de la ventana — el `viewBox` del SVG se recalcula dinámicamente según el tamaño real del panel (al redimensionar la ventana o colapsar el menú). Arrastra vértices (círculos blancos) o estructuras (círculos verdes) para moverlos; un clic (sin arrastrar) los selecciona y muestra un panel de edición rápida (elevación del vértice, tipo/altura/station de la estructura, eliminar). La barra de herramientas permite agregar vértices/estructuras y elegir bajo qué hipótesis se dibuja la catenaria.
- **Catálogo de estructuras**: crear/editar tipos (nombre, categoría, alturas disponibles, puntos de fijación del conductor por fase).
- **Hipótesis de carga**: editar temperatura/viento/hielo de cada hipótesis, elegir el conductor activo y su hipótesis/tensión de referencia.
- **Árbol de cargas**: tabla de fuerzas (vertical/transversal/longitudinal + momento estimado) por estructura y por hipótesis; botón "Exportar JSON".
- **Panel del menú lateral**: nombre del proyecto, resumen, exportar/importar el proyecto completo como JSON, reiniciar a los datos de ejemplo.

## Consideraciones PWA

- `manifest.webmanifest` define nombre, íconos (192/512, generados con `generate_icons.py`), `display: standalone`.
- `sw.js` cachea el app-shell completo (HTML/CSS/JS/íconos) con estrategia cache-first y versión de caché (`CACHE_NAME`).
- **Tarea recurrente**: cada vez que se agregue un archivo nuevo al proyecto (nueva vista, librería, etc.), hay que añadirlo a `APP_SHELL` en `sw.js` **y** subir `CACHE_NAME`, o los usuarios con la app instalada quedarán en una versión vieja.
- Fase 2 (mapas/KMZ reales) probablemente sume una librería de mapas vía CDN: si no se cachea una copia local, la app instalada no funcionará offline para esa parte — evaluarlo en su momento.

## Estructura del proyecto

- `src/data/` — `dataSource.js` (interfaz de datos simulados, reemplazable en Fase 2) y `projectStore.js` (estado del proyecto, mutaciones, persistencia).
- `src/engine/` — `stationing.js` (geometría del alineamiento/perfil), `catenary.js` (sag-tension), `loadTree.js` (árbol de cargas). Sin dependencias de DOM: se pueden probar de forma aislada.
- `src/ui/` — una vista por pantalla (`planView`, `profileView`, `catalogView`, `hypothesesView`, `loadTreeView`), más `app.js` (orquestador), `theme.js`, `domUtil.js`/`svgUtil.js` (helpers).
- `assets/` — íconos PWA.
- `tests/engine.test.js` — pruebas del motor de cálculo sin framework (`node tests/engine.test.js`; requiere Node.js, no incluido en este entorno de desarrollo — ver nota abajo).

## Nota sobre pruebas del motor

`tests/engine.test.js` verifica `stationing`, `catenary` (incl. dirección física correcta de la tensión ante cambios de temperatura/carga) y `loadTree` mediante aserciones simples de Node (`assert`), sin dependencias externas. Este entorno de desarrollo no tenía Node.js disponible al momento de escribir la Fase 1, así que la fórmula de tensión se validó numéricamente con un script Python equivalente (solución autoconsistente, no linealizada) antes de fijarla en `catenary.js`. Ejecutar `node tests/engine.test.js` en un entorno con Node para correr la suite completa.

## Próximo paso (Fase 2)

- Importar KMZ real y sustituir `dataSource.js` por una fuente real, sin tocar `engine`/`ui`.
- Perfil de elevación desde un servicio de terreno/DEM real.
- Mostrar la planta sobre un mapa real (Leaflet + OSM u otro).
