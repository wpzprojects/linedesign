/**
 * app.js — Orquestador de la aplicación: estado de UI (selección, pantalla
 * activa, hipótesis mostrada en el perfil), wiring de la barra lateral y
 * de la barra de herramientas, y disparo de render de cada vista al cambiar
 * el proyecto (patrón: store.subscribe(render)).
 */
(function () {
  const store = window.LineDesignStore;
  const stationing = window.LineDesignStationing;
  const { el, clear } = window.LineDesignDomUtil;
  const { downloadFile } = window.LineDesignSvgUtil;

  const planSvg = document.getElementById('plan-svg');
  const profileSvg = document.getElementById('profile-svg');
  const summaryList = document.getElementById('summary-list');
  const projectNameInput = document.getElementById('project-name-input');
  const themeToggle = document.getElementById('theme-toggle');
  const selectionPanel = document.getElementById('selection-panel');
  const newStructureType = document.getElementById('new-structure-type');
  const newStructureStation = document.getElementById('new-structure-station');
  const planHypothesisSelect = document.getElementById('plan-hypothesis-select');
  const shell = document.getElementById('shell');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const screenTitle = document.getElementById('screen-title');

  let selection = null;
  let planHypothesisId = null;

  function onSelect(sel) {
    selection = sel;
    render(store.getProject());
  }

  function onDeselect() {
    selection = null;
    render(store.getProject());
  }

  const planView = window.LineDesignPlanView.createPlanView(planSvg, {
    onSelect,
    onDeselect,
    onCommitVertexMove: (id, x, y) => store.moveVertex(id, x, y),
    onCommitStructureMove: (id, station) => store.moveStructure(id, station)
  });

  const profileView = window.LineDesignProfileView.createProfileView(profileSvg, { onSelect, onDeselect });
  const catalogView = window.LineDesignCatalogView.createCatalogView(document.getElementById('catalog-container'), store);
  const hypothesesView = window.LineDesignHypothesesView.createHypothesesView(document.getElementById('hypotheses-container'), store);
  const loadTreeView = window.LineDesignLoadTreeView.createLoadTreeView(document.getElementById('loadtree-container'));

  function renderSummary(project) {
    const { spans } = stationing.computeSpans(project.structures);
    summaryList.innerHTML = '';
    [
      `Vértices: ${project.alignment.vertices.length}`,
      `Estructuras: ${project.structures.length}`,
      `Vanos: ${spans.length}`,
      `Conductor: ${project.conductor.name}`,
      `Hipótesis: ${project.hypotheses.length}`
    ].forEach((text) => summaryList.appendChild(el('li', {}, text)));
  }

  function syncStructureTypeOptions(project) {
    const current = newStructureType.value;
    clear(newStructureType);
    project.structureCatalog.forEach((type) => {
      newStructureType.appendChild(el('option', { value: type.typeId }, type.name));
    });
    if (project.structureCatalog.some((t) => t.typeId === current)) newStructureType.value = current;
  }

  function syncPlanHypothesisOptions(project) {
    if (!project.hypotheses.some((h) => h.id === planHypothesisId)) {
      planHypothesisId = project.conductor.referenceHypothesisId || project.hypotheses[0].id;
    }
    clear(planHypothesisSelect);
    project.hypotheses.forEach((h) => {
      planHypothesisSelect.appendChild(el('option', { value: h.id, selected: h.id === planHypothesisId }, h.name));
    });
  }

  function renderSelectionPanel(project) {
    if (selection && selection.type === 'vertex' && !project.alignment.vertices.some((v) => v.id === selection.id)) selection = null;
    if (selection && selection.type === 'structure' && !project.structures.some((s) => s.id === selection.id)) selection = null;

    clear(selectionPanel);
    if (!selection) {
      selectionPanel.hidden = true;
      return;
    }
    selectionPanel.hidden = false;

    if (selection.type === 'vertex') {
      const vertex = project.alignment.vertices.find((v) => v.id === selection.id);
      selectionPanel.appendChild(el('strong', {}, `Vértice ${vertex.id}`));
      selectionPanel.appendChild(el('span', { class: 'muted' }, ` · x=${vertex.x.toFixed(1)} y=${vertex.y.toFixed(1)}`));
      selectionPanel.appendChild(el('label', {}, 'Elevación z (m)'));
      selectionPanel.appendChild(el('input', {
        type: 'number', step: '0.5', value: vertex.z,
        onChange: (e) => store.setVertexElevation(vertex.id, parseFloat(e.target.value) || 0)
      }));
      selectionPanel.appendChild(el('button', {
        class: 'btn btn-small btn-danger', type: 'button',
        onClick: () => {
          const result = store.removeVertex(vertex.id);
          if (result && !result.ok) alert(result.reason);
          else { selection = null; render(store.getProject()); }
        }
      }, 'Eliminar vértice'));
    } else {
      const structure = project.structures.find((s) => s.id === selection.id);
      const type = project.structureCatalog.find((t) => t.typeId === structure.typeId);

      selectionPanel.appendChild(el('strong', {}, `Estructura ${structure.id}`));

      selectionPanel.appendChild(el('label', {}, 'Tipo'));
      selectionPanel.appendChild(el('select', {
        onChange: (e) => {
          const newType = project.structureCatalog.find((t) => t.typeId === e.target.value);
          store.updateStructure(structure.id, { typeId: newType.typeId, height: newType.heightOptions[0] });
        }
      }, project.structureCatalog.map((t) => el('option', { value: t.typeId, selected: t.typeId === structure.typeId }, t.name))));

      selectionPanel.appendChild(el('label', {}, 'Altura (m)'));
      selectionPanel.appendChild(el('select', {
        onChange: (e) => store.updateStructure(structure.id, { height: parseFloat(e.target.value) })
      }, (type ? type.heightOptions : [structure.height]).map((h) => el('option', { value: h, selected: h === structure.height }, `${h} m`))));

      selectionPanel.appendChild(el('label', {}, 'Station (m)'));
      selectionPanel.appendChild(el('input', {
        type: 'number', step: '1', value: structure.station.toFixed(1),
        onChange: (e) => store.moveStructure(structure.id, parseFloat(e.target.value) || 0)
      }));

      selectionPanel.appendChild(el('button', {
        class: 'btn btn-small btn-danger', type: 'button',
        onClick: () => { store.removeStructure(structure.id); selection = null; render(store.getProject()); }
      }, 'Eliminar estructura'));
    }
  }

  function render(project) {
    projectNameInput.value = project.name;
    renderSummary(project);
    syncStructureTypeOptions(project);
    syncPlanHypothesisOptions(project);
    renderSelectionPanel(project);

    planView.render(project, selection);
    profileView.render(project, planHypothesisId, selection);
    catalogView.render(project);
    hypothesesView.render(project);
    loadTreeView.render(project);
  }

  function wireToolbar() {
    document.getElementById('add-vertex-btn').addEventListener('click', () => store.addVertex());

    document.getElementById('add-structure-btn').addEventListener('click', () => {
      const typeId = newStructureType.value;
      const stationValue = newStructureStation.value === '' ? undefined : parseFloat(newStructureStation.value);
      const structure = store.addStructure({ typeId, station: stationValue });
      selection = { type: 'structure', id: structure.id };
      newStructureStation.value = '';
      render(store.getProject());
    });

    planHypothesisSelect.addEventListener('change', (e) => {
      planHypothesisId = e.target.value;
      render(store.getProject());
    });

    projectNameInput.addEventListener('change', (e) => store.setProjectName(e.target.value.trim() || 'Proyecto sin nombre'));

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        document.querySelectorAll('.screen').forEach((screen) => {
          screen.classList.toggle('is-active', screen.id === `screen-${btn.dataset.screen}`);
        });
        screenTitle.textContent = btn.dataset.title || btn.textContent.trim();
        // planView/profileView miden su <svg> con getBoundingClientRect():
        // mientras la pantalla estaba oculta (display:none) esa medida daba
        // 0x0. Al volver a mostrarla hay que re-renderizar para que tomen su
        // tamaño real ya visible, si no quedan con el viewBox mínimo de antes.
        render(store.getProject());
      });
    });

    sidebarToggle.addEventListener('click', () => {
      const collapsed = shell.dataset.sidebar === 'collapsed';
      shell.dataset.sidebar = collapsed ? 'expanded' : 'collapsed';
      try {
        localStorage.setItem('linedesign-sidebar', shell.dataset.sidebar);
      } catch (error) {
        console.warn('No se pudo guardar el estado del menú lateral:', error);
      }
      // planView/profileView ajustan su viewBox al tamaño real del panel;
      // se re-renderiza al terminar la transición CSS del sidebar (220ms)
      // para que el lienzo tome el nuevo ancho disponible.
      window.setTimeout(() => render(store.getProject()), 240);
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      const project = store.getProject();
      downloadFile(`${project.name.replace(/\s+/g, '_')}.json`, store.exportJSON());
    });

    const importFile = document.getElementById('import-file');
    document.getElementById('import-btn').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const result = store.importJSON(text);
      if (!result.ok) alert(result.reason);
      importFile.value = '';
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('¿Reiniciar el proyecto a los datos de ejemplo? Se perderán los cambios actuales.')) {
        selection = null;
        store.resetToSample();
      }
    });
  }

  function initSidebar() {
    try {
      const saved = localStorage.getItem('linedesign-sidebar');
      if (saved === 'collapsed' || saved === 'expanded') shell.dataset.sidebar = saved;
    } catch (error) {
      console.warn('No se pudo leer el estado del menú lateral:', error);
    }
  }

  function wireResize() {
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => render(store.getProject()), 150);
    });
  }

  function init() {
    window.LineDesignTheme.initTheme(themeToggle);
    initSidebar();
    wireToolbar();
    wireResize();
    store.subscribe(render);
    store.load();
  }

  init();
})();
