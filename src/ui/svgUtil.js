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

  const svgUtil = { svgEl, clear, toSvgPoint, downloadFile };
  global.LineDesignSvgUtil = svgUtil;
})(typeof window !== 'undefined' ? window : globalThis);
