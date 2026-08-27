(function () {
  const geometry = {
    getVertexBounds(vertices) {
      const xs = vertices.map((v) => v.x);
      const ys = vertices.map((v) => v.y);

      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      };
    },

    getProfileBounds(vertices) {
      const distances = this.getCumulativeDistance(vertices);
      const elevations = vertices.map((v) => v.z);

      return {
        minX: 0,
        maxX: distances[distances.length - 1],
        minY: Math.min(...elevations),
        maxY: Math.max(...elevations)
      };
    },

    getCumulativeDistance(vertices) {
      let total = 0;
      const distances = [0];

      for (let i = 1; i < vertices.length; i += 1) {
        const prev = vertices[i - 1];
        const current = vertices[i];
        const dx = current.x - prev.x;
        const dy = current.y - prev.y;
        total += Math.hypot(dx, dy);
        distances.push(total);
      }

      return distances;
    },

    projectPoint(point, width, height, padding, bounds) {
      const spanX = Math.max(bounds.maxX - bounds.minX, 1);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1);
      const scale = Math.min(
        (width - padding * 2) / spanX,
        (height - padding * 2) / spanY
      );

      const x = padding + (point.x - bounds.minX) * scale;
      const y = height - padding - (point.y - bounds.minY) * scale;

      return { x, y };
    },

    projectProfilePoint(point, index, profileDistances, width, height, padding) {
      const bounds = this.getProfileBounds(profileDistances.vertices || []);
      const x = padding + (profileDistances[index] / Math.max(bounds.maxX, 1)) * (width - padding * 2);
      const y = height - padding - ((point.z - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 1)) * (height - padding * 2);

      return { x, y };
    },

    planPath(vertices, width, height, padding = 26) {
      const bounds = this.getVertexBounds(vertices);
      const path = vertices
        .map((vertex, index) => {
          const p = this.projectPoint(vertex, width, height, padding, bounds);
          return `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
        })
        .join(' ');

      return { path, bounds };
    },

    profilePath(vertices, width, height, padding = 26) {
      const distances = this.getCumulativeDistance(vertices);
      const bounds = this.getProfileBounds(vertices);
      const points = vertices.map((vertex, index) => {
        const x = padding + (distances[index] / Math.max(bounds.maxX, 1)) * (width - padding * 2);
        const y = height - padding - ((vertex.z - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 1)) * (height - padding * 2);
        return { x, y };
      });

      const path = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');

      return { path, bounds, points, distances };
    },

    spanSummary(vertices, structures) {
      const distances = this.getCumulativeDistance(vertices);
      const spanList = [];

      for (let i = 0; i < structures.length - 1; i += 1) {
        const left = structures[i];
        const right = structures[i + 1];
        const length = right.station - left.station;

        spanList.push({
          from: left.id,
          to: right.id,
          stationStart: left.station,
          stationEnd: right.station,
          length,
          sag: (length / 18) * 0.6
        });
      }

      return { distances, spanList };
    }
  };

  window.LineDesignGeometry = geometry;
})();
