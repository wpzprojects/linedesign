/**
 * mapRenderer.js — Mapa base (Leaflet) para la vista en Planta (Fase 2,
 * Apéndice A del prompt maestro). Es una capa de RENDERIZADO detrás del SVG
 * existente, no una fuente de datos: el alineamiento se sigue dibujando con
 * el proyector local de siempre (metros), y este módulo solo se encarga de
 * que las teselas del mapa se vean alineadas y se muevan en sincronía con
 * el zoom/pan del SVG.
 *
 * Truco de sincronización: en vez de decirle a Leaflet que haga pan/zoom
 * cada vez que el usuario mueve la rueda o arrastra (lo que dispararía
 * recargas de teselas en cada frame), el mapa se deja fijo en una vista
 * base — calibrada para que su escala (metros/píxel) coincida con la del
 * proyector — y se le aplica el MISMO transform CSS `translate(...)
 * scale(...)` que ya usa `viewport.js` para el `<g>` del SVG. Con
 * `transform-origin: 0 0` en ambos, esa transformación escala/traslada
 * igual en los dos, así que quedan pegados durante todo el gesto. Solo al
 * terminar un render() (no en cada frame) se recalibra la vista base con
 * `syncBase()`, igual que el proyector del SVG se recalcula en cada
 * render() y no en cada frame de zoom/pan.
 */
(function (global) {
  const geo = global.LineDesignGeo;

  function createMapRenderer(container) {
    let map = null;
    let visible = false;

    function ensureMap() {
      if (map) return;
      map = L.map(container, {
        zoomSnap: 0, // zoom fraccional: necesario para calibrar la escala exacta del proyector
        zoomControl: false,
        attributionControl: true,
        dragging: false, // el pan lo maneja el viewport propio del SVG, no Leaflet
        scrollWheelZoom: false, // ídem con el zoom
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        inertia: false,
        fadeAnimation: false,
        zoomAnimation: false
      });

      const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri'
      });
      streets.addTo(map);
      L.control.layers({ Calles: streets, Satélite: satellite }, {}, { position: 'topright' }).addTo(map);

      container.style.transformOrigin = '0 0';
    }

    function setVisible(nextVisible) {
      visible = nextVisible;
      container.style.display = nextVisible ? 'block' : 'none';
      if (nextVisible) {
        ensureMap();
        // El contenedor estaba con display:none (tamaño 0) mientras el mapa
        // no se mostraba; Leaflet necesita remedir su tamaño real ahora que
        // vuelve a ser visible, si no las teselas quedan mal recortadas.
        global.requestAnimationFrame(() => map && map.invalidateSize());
      }
    }

    function isVisible() {
      return visible;
    }

    /**
     * Recalibra y centra la vista base del mapa: zoom tal que su escala
     * (metros/píxel) coincida con la del proyector SVG en `origin.lat`, y
     * centrado de forma que el punto local (0,0) — que por definición es
     * `origin` — caiga exactamente en `projector.toScreen(0, 0)`, el mismo
     * punto donde el SVG dibuja ese vértice antes de aplicar el zoom/pan
     * vigente. Se llama una vez por render(), no en cada frame de zoom/pan.
     */
    function syncBase(origin, projector, width, height) {
      if (!visible || !map) return;
      const metersPerPixel = 1 / projector.scale;
      const zoom = geo.zoomForScale(metersPerPixel, origin.lat);
      map.setView([origin.lat, origin.lon], zoom, { animate: false });

      const p0 = projector.toScreen(0, 0);
      map.panBy([p0.x - width / 2, p0.y - height / 2], { animate: false });
    }

    /** Aplica el mismo transform que el <g> de zoom del SVG (ver viewport.js). */
    function applyTransform(viewportState) {
      if (!map) return;
      container.style.transform = `translate(${viewportState.tx}px, ${viewportState.ty}px) scale(${viewportState.scale})`;
    }

    return { setVisible, isVisible, syncBase, applyTransform };
  }

  global.LineDesignMapRenderer = { createMapRenderer };
})(typeof window !== 'undefined' ? window : globalThis);
