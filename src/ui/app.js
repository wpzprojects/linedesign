(function () {
  const project = window.sampleProject;
  const geometry = window.LineDesignGeometry;

  const planSvg = document.getElementById('plan-svg');
  const profileSvg = document.getElementById('profile-svg');
  const summaryList = document.getElementById('summary-list');
  const hypothesisList = document.getElementById('hypothesis-list');
  const projectName = document.getElementById('project-name');

  function renderSummary() {
    const spans = geometry.spanSummary(project.alignment.vertices, project.structures);
    projectName.textContent = project.name;

    summaryList.innerHTML = `
      <li>Vértices: ${project.alignment.vertices.length}</li>
      <li>Estructuras: ${project.structures.length}</li>
      <li>Vanos: ${spans.spanList.length}</li>
      <li>Conductor: ${project.conductor.name}</li>
    `;

    hypothesisList.innerHTML = project.hypotheses
      .map(
        (h) => `
          <li>
            <strong>${h.name}</strong><br>
            ${h.temperature}°C · viento ${h.wind} · hielo ${h.ice}
          </li>
        `
      )
      .join('');
  }

  function renderPlan() {
    const width = 700;
    const height = 260;
    const padding = 26;
    const pathData = geometry.planPath(project.alignment.vertices, width, height, padding);

    const structurePoints = project.structures
      .map((structure) => {
        const { x, y } = geometry.projectPoint(structure, width, height, padding, pathData.bounds);
        return `
          <g>
            <circle class="structure-point" cx="${x}" cy="${y}" r="7"></circle>
            <text class="annotation-label" x="${x + 12}" y="${y - 10}">${structure.id}</text>
          </g>
        `;
      })
      .join('');

    planSvg.innerHTML = `
      <g>
        <line class="grid-line" x1="26" y1="234" x2="674" y2="234"></line>
        <line class="grid-line" x1="26" y1="26" x2="26" y2="234"></line>
        <path class="alignment-line" d="${pathData.path}"></path>
        ${structurePoints}
      </g>
    `;
  }

  function renderProfile() {
    const width = 700;
    const height = 260;
    const padding = 26;
    const profile = geometry.profilePath(project.alignment.vertices, width, height, padding);

    const structurePoints = project.structures
      .map((structure) => {
        const station = structure.station;
        const maxX = profile.bounds.maxX;
        const x = padding + (station / Math.max(maxX, 1)) * (width - padding * 2);
        const y = height - padding - ((structure.z - profile.bounds.minY) / Math.max(profile.bounds.maxY - profile.bounds.minY, 1)) * (height - padding * 2);
        return `
          <g>
            <circle class="structure-point" cx="${x}" cy="${y}" r="7"></circle>
            <text class="annotation-label" x="${x + 10}" y="${y - 10}">${structure.id}</text>
          </g>
        `;
      })
      .join('');

    const conductorSegments = project.structures.slice(0, -1)
      .map((structure, index) => {
        const next = project.structures[index + 1];
        const x1 = padding + (structure.station / Math.max(profile.bounds.maxX, 1)) * (width - padding * 2);
        const y1 = height - padding - ((structure.z - profile.bounds.minY) / Math.max(profile.bounds.maxY - profile.bounds.minY, 1)) * (height - padding * 2);
        const x2 = padding + (next.station / Math.max(profile.bounds.maxX, 1)) * (width - padding * 2);
        const y2 = height - padding - ((next.z - profile.bounds.minY) / Math.max(profile.bounds.maxY - profile.bounds.minY, 1)) * (height - padding * 2);
        return `<line class="conductor-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
      })
      .join('');

    profileSvg.innerHTML = `
      <g>
        <line class="grid-line" x1="26" y1="234" x2="674" y2="234"></line>
        <line class="grid-line" x1="26" y1="26" x2="26" y2="234"></line>
        <path class="profile-line" d="${profile.path}"></path>
        ${conductorSegments}
        ${structurePoints}
        <text class="axis-text" x="320" y="252">Distancia acumulada (m)</text>
        <text class="axis-text" x="8" y="140" transform="rotate(-90 8 140)">Elevación (m)</text>
      </g>
    `;
  }

  renderSummary();
  renderPlan();
  renderProfile();
})();
