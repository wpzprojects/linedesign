/**
 * domUtil.js — Helper mínimo para construir HTML sin innerHTML (evita
 * problemas de reinserción de listeners y de escape de texto).
 */
(function (global) {
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'class') {
        node.className = value;
      } else if (key === 'dataset') {
        Object.entries(value).forEach(([dKey, dValue]) => { node.dataset[dKey] = dValue; });
      } else if (key in node) {
        node[key] = value;
      } else {
        node.setAttribute(key, value);
      }
    });
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' || typeof child === 'number'
        ? document.createTextNode(String(child))
        : child);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  global.LineDesignDomUtil = { el, clear };
})(typeof window !== 'undefined' ? window : globalThis);
