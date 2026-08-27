/**
 * svgUtil.js — Helpers de DOM/SVG compartidos por las vistas.
 */
(function (global) {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Crea un elemento SVG con atributos y listeners, sin usar innerHTML. */
  function svgEl(tag, attrs = {}, listeners = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== null && value !== undefined) node.setAttribute(key, value);
    });
    Object.entries(listeners).forEach(([event, handler]) => {
      node.addEventListener(event, handler);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /** Convierte coordenadas de puntero (cliente) a coordenadas de usuario del SVG. */
  function toSvgPoint(svg, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    return {
      x: viewBox.x + (clientX - rect.left) * scaleX,
      y: viewBox.y + (clientY - rect.top) * scaleY
    };
  }

  function formatTick(value, step) {
    return value.toFixed(step < 1 ? 1 : 0);
  }

  /**
   * Construye una grilla con marcas de regla numeradas (líneas + etiquetas)
   * para un eje X/Y de datos, usando stationing.niceStep para elegir el
   * espaciado. Vive en el mismo espacio de datos que el contenido dibujado
   * (dentro de la capa de zoom), así que la grilla se mueve/escala junto
   * con el dibujo — comportamiento estándar en herramientas CAD.
   */
  function buildRulerGrid({ svgEl: makeEl, niceStep, projector, bounds, height, padding }) {
    const group = makeEl('g', { class: 'ruler-grid' });
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const stepX = niceStep(spanX);
    const stepY = niceStep(spanY);

    if (stepX > 0) {
      const startX = Math.ceil(bounds.minX / stepX) * stepX;
      for (let x = startX; x <= bounds.maxX + 1e-9; x += stepX) {
        const p1 = projector.toScreen(x, bounds.minY);
        const p2 = projector.toScreen(x, bounds.maxY);
        group.appendChild(makeEl('line', { class: 'ruler-line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
        const label = makeEl('text', { class: 'ruler-label', x: p1.x + 3, y: height - padding + 14 });
        label.textContent = formatTick(x, stepX);
        group.appendChild(label);
      }
    }

    if (stepY > 0) {
      const startY = Math.ceil(bounds.minY / stepY) * stepY;
      for (let y = startY; y <= bounds.maxY + 1e-9; y += stepY) {
        const p1 = projector.toScreen(bounds.minX, y);
        const p2 = projector.toScreen(bounds.maxX, y);
        group.appendChild(makeEl('line', { class: 'ruler-line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
        const label = makeEl('text', { class: 'ruler-label', x: padding - 6, y: p1.y + 3, 'text-anchor': 'end' });
        label.textContent = formatTick(y, stepY);
        group.appendChild(label);
      }
    }

    return group;
  }

  function downloadFile(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const svgUtil = { svgEl, clear, toSvgPoint, buildRulerGrid, downloadFile };
  global.LineDesignSvgUtil = svgUtil;
})(typeof window !== 'undefined' ? window : globalThis);
