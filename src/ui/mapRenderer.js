/**
 * mapRenderer.js — Mapa base (Leaflet) para la vista en Planta (Fase 2,
 * Apéndice A del prompt maestro). Es una capa de RENDERIZADO detrás del SVG
 * existente, no una fuente de datos: el alineamiento se sigue dibujando con
 * el proyector local de siempre (metros); este módulo solo se encarga de
 * que Leaflet quede centrado y a la escala correcta en todo momento.
 *
 * Nota de diseño: la primera versión de este módulo "congelaba" la vista de
 * Leaflet y solo le aplicaba un transform CSS (translate/scale) para
 * simular el zoom/pan, evitando llamar a sus métodos nativos en cada frame.
 * Eso resultó ser un error: Leaflet nunca se enteraba de que el usuario
 * había hecho zoom/pan, así que nunca pedía teselas nuevas — solo se veía
 * la porción cargada en el primer render, sin importar cuánto te alejaras o
 * acercaras. Ahora se usa `map.setView()`/`panBy()` (reales, sin animación)
 * en cada cambio del viewport, acotados a un máximo de una vez por frame
 * (`requestAnimationFrame`) para no saturar durante un wheel/drag rápido.
 */
(function (global) {
  const geo = global.LineDesignGeo;

  function createMapRenderer(container) {
    let map = null;
    let visible = false;
    let pendingUpdate = null;

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

    function applyUpdate({ origin, projector, width, height, viewportState }) {
      if (!visible || !map) return;
      const effectiveScale = projector.scale * viewportState.scale;
      const metersPerPixel = 1 / effectiveScale;
      const zoom = geo.zoomForScale(metersPerPixel, origin.lat);
      map.setView([origin.lat, origin.lon], zoom, { animate: false });

      // Punto local (0,0) = `origin`, en pantalla, con el zoom/pan vigente
      // del SVG aplicado (misma fórmula que usa el <g> de zoomLayer).
      const p0 = projector.toScreen(0, 0);
      const screenX = viewportState.scale * p0.x + viewportState.tx;
      const screenY = viewportState.scale * p0.y + viewportState.ty;
      map.panBy([screenX - width / 2, screenY - height / 2], { animate: false });
    }

    /**
     * Centra/escala Leaflet para que el punto local (0,0) — `origin` — caiga
     * en `projector.toScreen(0,0)` transformado por el zoom/pan vigente del
     * SVG (`viewportState`), y su escala coincida con la del proyector. Se
     * llama tanto en cada render() como en cada cambio de zoom/pan (acotado
     * a 1 vez por frame) para que Leaflet siempre sepa dónde está y pida
     * las teselas que le correspondan.
     */
    function updateView(origin, projector, width, height, viewportState) {
      if (!visible || !map) return;
      const args = { origin, projector, width, height, viewportState };
      if (pendingUpdate !== null) {
        pendingUpdate = args;
        return;
      }
      pendingUpdate = args;
      global.requestAnimationFrame(() => {
        const next = pendingUpdate;
        pendingUpdate = null;
        applyUpdate(next);
      });
    }

    return { setVisible, isVisible, updateView };
  }

  global.LineDesignMapRenderer = { createMapRenderer };
})(typeof window !== 'undefined' ? window : globalThis);
