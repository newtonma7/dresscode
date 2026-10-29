export function rasterizeSleeveUnion(sleeves, width, height, frameWidth, frameHeight) {
  const coverage = new Uint8Array(width * height);
  const scaleX = width / frameWidth;
  const scaleY = height / frameHeight;

  for (const { triangles } of sleeves) {
    for (const triangle of triangles) {
      const ax = triangle[0][0] * scaleX, ay = triangle[0][1] * scaleY;
      const bx = triangle[1][0] * scaleX, by = triangle[1][1] * scaleY;
      const cx = triangle[2][0] * scaleX, cy = triangle[2][1] * scaleY;
      const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
      const firstRow = Math.max(0, Math.ceil(minY) - 1);
      const lastRow = Math.min(height - 1, Math.floor(maxY));

      for (let row = firstRow; row <= lastRow; row++) {
        const top = row, bottom = row + 1;
        let minX = Infinity, maxX = -Infinity;
        for (let edge = 0; edge < 3; edge++) {
          const point = triangle[edge], next = triangle[(edge + 1) % 3];
          const x1 = point[0] * scaleX, y1 = point[1] * scaleY;
          const x2 = next[0] * scaleX, y2 = next[1] * scaleY;
          if (y1 >= top && y1 <= bottom) { minX = Math.min(minX, x1); maxX = Math.max(maxX, x1); }
          if (y1 !== y2) {
            const lowY = Math.min(y1, y2), highY = Math.max(y1, y2);
            if (top >= lowY && top <= highY) {
              const x = x1 + (top - y1) * (x2 - x1) / (y2 - y1);
              minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            }
            if (bottom >= lowY && bottom <= highY) {
              const x = x1 + (bottom - y1) * (x2 - x1) / (y2 - y1);
              minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            }
          }
        }
        if (minX === Infinity) continue;
        const firstColumn = Math.max(0, Math.ceil(minX) - 1);
        const lastColumn = Math.min(width - 1, Math.floor(maxX));
        coverage.fill(1, row * width + firstColumn, row * width + lastColumn + 1);
      }
    }
  }

  return coverage;
}
