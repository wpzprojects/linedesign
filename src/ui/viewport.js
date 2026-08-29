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
      // Dedos activos en pantalla (pointerType 'touch'), para detectar el
      // segundo dedo y pasar de pan a pinch-zoom. El pan de un solo dedo
      // sigue el mismo camino que el mouse (panState); el pinch es un modo
      // aparte que toma el control exclusivo mientras haya 2+ dedos.
      const activeTouches = new Map();

      svg.addEventListener('wheel', (evt) => {
        evt.preventDefault();
        const svgPoint = toSvgPoint(svg, evt.clientX, evt.clientY);
        const factor = evt.deltaY < 0 ? zoomStep : 1 / zoomStep;
        zoomAt(svgPoint, factor);
        callbacks.onChange();
      }, { passive: false });

      function endPan() {
        if (!panState) return;
        svg.removeEventListener('pointermove', panState.onMove);
        svg.removeEventListener('pointerup', panState.onUp);
        svg.removeEventListener('pointercancel', panState.onUp);
        panState = null;
      }

      /**
       * Arranca (o retoma) el pan de un solo puntero. `moved: true` se usa
       * al retomar tras un pinch — el gesto ya se movió, así que soltar sin
       * arrastrar más no debe disparar onBackgroundClick como si fuera un
       * tap simple.
       */
      function beginPan(pointerId, clientX, clientY, { moved = false } = {}) {
        panState = { pointerId, startClientX: clientX, startClientY: clientY, startTx: state.tx, startTy: state.ty, moved };
        svg.setPointerCapture(pointerId);

        function onMove(moveEvt) {
          if (moveEvt.pointerId !== pointerId || activeTouches.size >= 2) return;
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

        function onUp(upEvt) {
          if (upEvt.pointerId !== pointerId) return;
          activeTouches.delete(upEvt.pointerId);
          const wasPan = panState && !panState.moved;
          endPan();
          if (wasPan && callbacks.onBackgroundClick) callbacks.onBackgroundClick();
        }

        panState.onMove = onMove;
        panState.onUp = onUp;
        svg.addEventListener('pointermove', onMove);
        svg.addEventListener('pointerup', onUp);
        svg.addEventListener('pointercancel', onUp);
      }

      function startPinch() {
        function currentPair() {
          return [...activeTouches.entries()];
        }
        const [[, p1], [, p2]] = currentPair();
        const startDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const startScale = state.scale;
        const startTx = state.tx;
        const startTy = state.ty;
        // Punto medio inicial, en coordenadas del SVG (mismo espacio que
        // zoomAt): se mantiene fijo bajo los dedos mientras se pellizca.
        const startMid = toSvgPoint(svg, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);

        function onMove(moveEvt) {
          if (!activeTouches.has(moveEvt.pointerId)) return;
          activeTouches.set(moveEvt.pointerId, { x: moveEvt.clientX, y: moveEvt.clientY });
          if (activeTouches.size < 2) return;
          const [[, a], [, b]] = currentPair();
          const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const nextScale = clampScale(startScale * (dist / startDist));
          state.tx = startMid.x - ((startMid.x - startTx) / startScale) * nextScale;
          state.ty = startMid.y - ((startMid.y - startTy) / startScale) * nextScale;
          state.scale = nextScale;
          callbacks.onChange();
        }

        function onUp(upEvt) {
          activeTouches.delete(upEvt.pointerId);
          if (activeTouches.size >= 2) return;
          svg.removeEventListener('pointermove', onMove);
          svg.removeEventListener('pointerup', onUp);
          svg.removeEventListener('pointercancel', onUp);
          // Queda un solo dedo sobre el lienzo: retoma el pan con él en vez
          // de exigirle al usuario soltar y volver a tocar.
          if (activeTouches.size === 1) {
            const [[survivorId, pos]] = currentPair();
            beginPan(survivorId, pos.x, pos.y, { moved: true });
          }
        }

        svg.addEventListener('pointermove', onMove);
        svg.addEventListener('pointerup', onUp);
        svg.addEventListener('pointercancel', onUp);
      }

      function startPan(evt) {
        if (evt.button !== undefined && evt.button !== 0) return;

        if (evt.pointerType === 'touch') {
          activeTouches.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
          svg.setPointerCapture(evt.pointerId);
          if (activeTouches.size >= 2) {
            endPan();
            startPinch();
            return;
          }
        }

        beginPan(evt.pointerId, evt.clientX, evt.clientY);
      }

      return { startPan };
    }

    return { state, transformAttr, toUnzoomed, zoomAt, reset, attach };
  }

  global.LineDesignViewport = { createViewport };
})(typeof window !== 'undefined' ? window : globalThis);
