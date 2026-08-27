/**
 * viewport.js — Controlador reutilizable de zoom/pan para lienzos SVG.
 *
 * Separa dos capas de transformación:
 *   1) El "proyector" base (stationing.makeProjector) ajusta los datos del
 *      proyecto al viewBox disponible (fit-to-view) — se recalcula en cada
 *      render porque el viewBox cambia con el tamaño del panel.
 *   2) Este controlador aplica una transformación adicional (escala +
 *      desplazamiento) ENCIMA de esa proyección base, vía un <g transform="…">
 *      que envuelve todo el contenido dibujado. Al hacer zoom/pan el estado
 *      vive aquí (no se pierde entre renders) y NO hay que recalcular ni
 *      un solo punto de datos — solo se actualiza el atributo transform.
 *
 * Uso típico en una vista:
 *   const viewport = createViewport({ minScale: 0.4, maxScale: 10 });
 *   ...
 *   const zoomLayer = svgEl('g', { transform: viewport.transformAttr() });
 *   viewport.attach(svg, zoomLayer, { onChange: () => render(...) });
 *
 * Para convertir un punto de pantalla a coordenadas de datos (drag, hover):
 *   const svgPoint = toSvgPoint(svg, evt.clientX, evt.clientY);
 *   const unzoomed = viewport.toUnzoomed(svgPoint);
 *   const dataPoint = projector.toData(unzoomed.x, unzoomed.y);
 */
(function (global) {
  const { toSvgPoint } = global.LineDesignSvgUtil;

  function createViewport({ minScale = 0.35, maxScale = 12, zoomStep = 1.15 } = {}) {
    const state = { scale: 1, tx: 0, ty: 0 };

    function clampScale(s) {
      return Math.min(Math.max(s, minScale), maxScale);
    }

    function transformAttr() {
      return `translate(${state.tx} ${state.ty}) scale(${state.scale})`;
    }

    /** Deshace la transformación de zoom/pan: espacio pantalla -> espacio del proyector base. */
    function toUnzoomed(point) {
      return {
        x: (point.x - state.tx) / state.scale,
        y: (point.y - state.ty) / state.scale
      };
    }

    function zoomAt(point, factor) {
      const next = clampScale(state.scale * factor);
      if (next === state.scale) return;
      // Mantiene fijo bajo el cursor el punto de datos que estaba bajo él.
      state.tx = point.x - ((point.x - state.tx) / state.scale) * next;
      state.ty = point.y - ((point.y - state.ty) / state.scale) * next;
      state.scale = next;
    }

    function reset() {
      state.scale = 1;
      state.tx = 0;
      state.ty = 0;
    }

    /**
     * Conecta el controlador a un <svg> UNA SOLA VEZ por vista (en la
     * fábrica de la vista, no dentro de render()): registra el listener de
     * `wheel` directamente sobre el <svg>, que es el único nodo que
     * persiste entre renders (sus hijos se destruyen y recrean en cada
     * render() vía clear(svg)). Si se llamara dentro de render() los
     * listeners se irían acumulando en cada re-render — un wheel real
     * dispararía el zoom N veces y el zoom se dispararía sin control.
     *
     * callbacks.onChange() debe actualizar el transform del zoomLayer
     * VIGENTE (usar una referencia mutable actualizada en cada render, no
     * capturar el zoomLayer de un render anterior).
     *
     * Devuelve `startPan(evt)`, para conectar a pointerdown del rectángulo
     * de fondo — ese sí se re-conecta en cada render porque el fondo mismo
     * se recrea (no hay acumulación: el nodo viejo y su listener se
     * descartan juntos).
     */
    function attach(svg, callbacks) {
      let panState = null;

      svg.addEventListener('wheel', (evt) => {
        evt.preventDefault();
        const svgPoint = toSvgPoint(svg, evt.clientX, evt.clientY);
        const factor = evt.deltaY < 0 ? zoomStep : 1 / zoomStep;
        zoomAt(svgPoint, factor);
        callbacks.onChange();
      }, { passive: false });

      function startPan(evt) {
        if (evt.button !== undefined && evt.button !== 0) return;
        panState = { startClientX: evt.clientX, startClientY: evt.clientY, startTx: state.tx, startTy: state.ty, moved: false };
        svg.setPointerCapture(evt.pointerId);

        function onMove(moveEvt) {
          const dx = moveEvt.clientX - panState.startClientX;
          const dy = moveEvt.clientY - panState.startClientY;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panState.moved = true;
          if (!panState.moved) return;
          // dx/dy están en px de pantalla; se convierten a unidades del
          // viewBox usando la misma relación que toSvgPoint.
          const rect = svg.getBoundingClientRect();
          const viewBox = svg.viewBox.baseVal;
          const scaleX = viewBox.width / rect.width;
          const scaleY = viewBox.height / rect.height;
          state.tx = panState.startTx + dx * scaleX;
          state.ty = panState.startTy + dy * scaleY;
          callbacks.onChange();
        }

        function onUp() {
          svg.removeEventListener('pointermove', onMove);
          svg.removeEventListener('pointerup', onUp);
          if (!panState.moved && callbacks.onBackgroundClick) callbacks.onBackgroundClick();
          panState = null;
        }

        svg.addEventListener('pointermove', onMove);
        svg.addEventListener('pointerup', onUp);
      }

      return { startPan };
    }

    return { state, transformAttr, toUnzoomed, zoomAt, reset, attach };
  }

  global.LineDesignViewport = { createViewport };
})(typeof window !== 'undefined' ? window : globalThis);
