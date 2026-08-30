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
   *
   * niceStep elige el paso solo en función del rango de datos (~6
   * divisiones), sin saber cuántos píxeles hay realmente disponibles —
   * a exageración vertical baja (1×/2× en Perfil) el rango de elevación
   * ocupa pocos píxeles y esas mismas ~6 marcas terminan encimadas. Para
   * evitarlo, cada eje se filtra en pantalla: si una marca cae a menos de
   * `MIN_LABEL_GAP` px de la última dibujada, se salta (línea + etiqueta
   * juntas, no solo el texto — una línea sin su número no aporta), en vez
   * de reducir el tamaño de letra o el paso de datos.
   *
   * `dataBounds` (opcional, por defecto `bounds`): el paso se calcula a
   * partir de ESTE rango, no del que realmente se dibuja (`bounds`).
   * Cuando el llamador extiende `bounds` un paso más allá de los datos
   * reales (stationing.padBoundsByStep, para que el plano no quede pegado
   * a los extremos del alineamiento), recalcular el paso con el rango YA
   * extendido puede caer en un paso distinto (p. ej. 200 → 500) que no
   * alinea con el borde extendido, dejando un hueco sin marca ahí. Con
   * `dataBounds` el paso es siempre el mismo que sin extender, y el rango
   * más ancho de `bounds` simplemente agrega una marca más a cada lado.
   */
  function buildRulerGrid({ svgEl: makeEl, niceStep, projector, bounds, dataBounds = bounds, padding }) {
    const MIN_LABEL_GAP_X = 34;
    const MIN_LABEL_GAP_Y = 16;
    const group = makeEl('g', { class: 'ruler-grid' });
    const stepX = niceStep(dataBounds.maxX - dataBounds.minX);
    const stepY = niceStep(dataBounds.maxY - dataBounds.minY);

    if (stepX > 0) {
      const startX = Math.ceil(bounds.minX / stepX) * stepX;
      let lastScreenX = null;
      for (let x = startX; x <= bounds.maxX + 1e-9; x += stepX) {
        const p1 = projector.toScreen(x, bounds.minY);
        if (lastScreenX !== null && Math.abs(p1.x - lastScreenX) < MIN_LABEL_GAP_X) continue;
        lastScreenX = p1.x;
        const p2 = projector.toScreen(x, bounds.maxY);
        group.appendChild(makeEl('line', { class: 'ruler-line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
        const label = makeEl('text', { class: 'ruler-label', x: p1.x + 3, y: p1.y + 14 });
        label.textContent = formatTick(x, stepX);
        group.appendChild(label);
      }
    }

    if (stepY > 0) {
      const startY = Math.ceil(bounds.minY / stepY) * stepY;
      let lastScreenY = null;
      for (let y = startY; y <= bounds.maxY + 1e-9; y += stepY) {
        const p1 = projector.toScreen(bounds.minX, y);
        if (lastScreenY !== null && Math.abs(p1.y - lastScreenY) < MIN_LABEL_GAP_Y) continue;
        lastScreenY = p1.y;
        const p2 = projector.toScreen(bounds.maxX, y);
        group.appendChild(makeEl('line', { class: 'ruler-line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
        const label = makeEl('text', { class: 'ruler-label', x: padding - 6, y: p1.y + 3, 'text-anchor': 'end' });
        label.textContent = formatTick(y, stepY);
        group.appendChild(label);
      }
    }

    return group;
  }

  // Variables de color de tema que usan #plan-svg/#profile-svg — ver
  // styles.css. Por DEFECTO son indirectas (ej. --conductor-color:
  // var(--warning)) — solo se vuelven un hex literal si el usuario las
  // personaliza en Configuración. getComputedStyle().getPropertyValue()
  // de una custom property devuelve el valor tal cual quedó ESPECIFICADO
  // (sin expandir var() anidados dentro de ella — así lo define el spec),
  // así que por defecto esto devolvería el texto literal "var(--warning)",
  // no un color real. Ver resolveThemeColor más abajo para el arreglo.
  const EXPORT_COLOR_VARS = [
    '--panel', '--muted', '--text', '--line', '--primary',
    '--conductor-color', '--structure-color', '--alignment-color', '--terrain-color', '--vertex-line-color'
  ];
  // Estas sí son literales siempre — las fija directamente el propio JS de
  // Configuración (setProperty con un número, nunca otra var) —, no
  // necesitan el mismo arreglo.
  const EXPORT_WIDTH_VARS = ['--conductor-line-width', '--structure-line-width', '--alignment-line-width', '--terrain-line-width'];

  /** Valor YA resuelto (nunca "var(--x)" sin expandir) de una custom
   * property de color: se aplica a un elemento real fuera de pantalla
   * como "color" (una propiedad normal, que el navegador SÍ resuelve del
   * todo, var() anidados incluidos) y se lee de vuelta su computed style
   * — "rgb(r, g, b)". Mismo truco de siempre para leer el valor real de
   * una custom property que el spec no expande por sí solo. */
  function resolveThemeColor(varName) {
    const probe = document.createElement('div');
    probe.style.display = 'none';
    probe.style.color = `var(${varName})`;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    return rgb;
  }

  function rgbStringToHex(rgbString) {
    const parts = (rgbString.match(/\d+/g) || ['0', '0', '0']).map(Number);
    return `#${parts.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }

  /** Todos los colores/grosores de tema usados por Planta/Perfil, ya
   * resueltos a valores concretos ("rgb(...)"/hex y números) — un solo
   * lugar para armarlos, lo reusan tanto el <style> del SVG exportado
   * como los colores del DXF (ver app.js). */
  function resolveExportTheme() {
    const colors = {};
    EXPORT_COLOR_VARS.forEach((name) => { colors[name] = resolveThemeColor(name); });
    const computed = getComputedStyle(document.body);
    const widths = {};
    EXPORT_WIDTH_VARS.forEach((name) => { widths[name] = computed.getPropertyValue(name).trim(); });
    return { colors, widths };
  }

  /** Bloque <style> autocontenido con los valores de tema YA resueltos (no
   * var(--x)) y solo las reglas que usan las vistas de Planta/Perfil —
   * portable: el archivo exportado se ve igual sin la app/el CSS externo. */
  function buildExportStyleBlock() {
    const { colors: v, widths } = resolveExportTheme();
    const cw = widths['--conductor-line-width'] || '1.5';
    const sw = widths['--structure-line-width'] || '3';
    const aw = widths['--alignment-line-width'] || '4';
    const tw = widths['--terrain-line-width'] || '1.5';
    return `
      .canvas-background { fill: transparent; }
      .ruler-line { stroke: ${v['--line']}; stroke-width: 1; }
      .ruler-label { fill: ${v['--muted']}; font-size: 10px; font-variant-numeric: tabular-nums; }
      .row-line { stroke: ${v['--muted']}; stroke-width: 1; stroke-dasharray: 4 3; fill: none; }
      .alignment-line { stroke: ${v['--alignment-color']}; stroke-width: ${aw}; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .circuit-line { stroke: ${v['--conductor-color']}; stroke-width: 1; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .vano-label { fill: ${v['--conductor-color']}; font-size: 10px; }
      .structure-point { fill: ${v['--structure-color']}; stroke: ${v['--panel']}; stroke-width: 2; }
      .structure-point.is-selected { fill: ${v['--primary']}; }
      .structure-pole { stroke: ${v['--structure-color']}; stroke-width: ${sw}; }
      .structure-pole.is-selected { stroke: ${v['--primary']}; stroke-width: calc(${sw} + 1); }
      .vertex-point { fill: ${v['--panel']}; stroke: ${v['--alignment-color']}; stroke-width: 3; }
      .annotation-label { fill: ${v['--text']}; font-size: 11px; font-weight: 600; }
      .vertex-label { font-size: 10px; opacity: 0.8; fill: ${v['--text']}; }
      .profile-line { stroke: ${v['--terrain-color']}; stroke-width: ${tw}; fill: none; }
      .profile-line--real { stroke: ${v['--terrain-color']}; }
      .clearance-line { stroke: ${v['--muted']}; stroke-width: 1; stroke-dasharray: 4 3; fill: none; }
      .vertex-line { stroke: ${v['--vertex-line-color']}; stroke-width: 1; stroke-dasharray: 5 4; }
      .conductor-line { stroke: ${v['--conductor-color']}; stroke-width: ${cw}; fill: none; }
      .conductor-line.is-selected { stroke: ${v['--primary']}; stroke-width: calc(${cw} + 1); }
      .sag-label { fill: ${v['--conductor-color']}; font-size: 10px; text-anchor: middle; }
      .clearance-label { fill: ${v['--terrain-color']}; font-size: 10px; text-anchor: middle; }
      text { font-family: "Segoe UI", "Inter", Roboto, Tahoma, Geneva, Verdana, sans-serif; }
    `;
  }

  /** Serializa un <svg> del lienzo (Planta/Perfil) a un string XML
   * autocontenido y portable — ver buildExportStyleBlock. */
  function exportSvgString(svgElement) {
    const clone = svgElement.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);
    const rect = svgElement.getBoundingClientRect();
    clone.setAttribute('width', Math.round(rect.width));
    clone.setAttribute('height', Math.round(rect.height));
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = buildExportStyleBlock();
    clone.insertBefore(style, clone.firstChild);
    const serialized = new XMLSerializer().serializeToString(clone);
    return `<?xml version="1.0" standalone="no"?>\r\n${serialized}`;
  }

  /** Convierte el mismo SVG portable a PNG (canvas, @2x por defecto) —
   * asíncrono porque la carga de la imagen SVG lo es; `callback` recibe el
   * Blob PNG resultante (o null si algo falla). */
  function exportSvgAsPng(svgElement, callback, scale = 2) {
    const rect = svgElement.getBoundingClientRect();
    const width = Math.round(rect.width * scale);
    const height = Math.round(rect.height * scale);
    const svgString = exportSvgString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // El SVG en sí tiene fondo transparente (.canvas-background) — se
      // pinta el panel del tema vigente para que la imagen no quede con
      // fondo transparente/inesperado al abrirla fuera de la app.
      ctx.fillStyle = resolveThemeColor('--panel') || '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => callback(blob), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      callback(null);
    };
    img.src = url;
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

  const svgUtil = {
    svgEl, clear, toSvgPoint, buildRulerGrid, downloadFile, exportSvgString, exportSvgAsPng,
    resolveExportTheme, rgbStringToHex
  };
  global.LineDesignSvgUtil = svgUtil;
})(typeof window !== 'undefined' ? window : globalThis);
