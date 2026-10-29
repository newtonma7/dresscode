import test from 'node:test';
import assert from 'node:assert/strict';
import { fitTorso } from '../src/geometry.js';
import { buildGarmentFrame } from '../src/garment-shape.js';
import { defaultTailoring } from '../src/tailoring.js';
import { rasterizeSleeveUnion } from '../src/sleeve-raster.js';

const rasterize = (triangles, width = 16, height = 12, frameWidth = width, frameHeight = height) =>
  rasterizeSleeveUnion([{ triangles }], width, height, frameWidth, frameHeight);

function torsoFor({ roll = 0, crossed = false, raised = false } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  for (const [id, x, y] of [[11, .3, .3], [12, .7, .3], [13, .2, .52], [14, .8, .52], [15, .16, .75], [16, .84, .75], [23, .35, .8], [24, .65, .8]]) points[id] = { x, y, visibility: 1 };
  if (raised) { points[13].x = .08; points[14].x = .92; points[13].y = points[14].y = .2; }
  if (crossed) { points[13].x = .55; points[14].x = .45; points[15].x = .7; points[16].x = .3; }
  for (const point of points) {
    const x = point.x - .5, y = point.y - .5;
    point.x = .5 + x * Math.cos(roll) - y * Math.sin(roll);
    point.y = .5 + x * Math.sin(roll) + y * Math.cos(roll);
  }
  return fitTorso(points, { width: 1000, height: 1000 });
}

function intersectsPixel(triangle, x, y) {
  const axes = [[1, 0], [0, 1]];
  for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3];
    axes.push([b[1] - a[1], a[0] - b[0]]);
  }
  return axes.every(([axisX, axisY]) => {
    const projections = triangle.map(([px, py]) => px * axisX + py * axisY);
    const pixelCenter = (x + .5) * axisX + (y + .5) * axisY;
    const pixelRadius = (Math.abs(axisX) + Math.abs(axisY)) / 2;
    return Math.min(...projections) <= pixelCenter + pixelRadius
      && Math.max(...projections) >= pixelCenter - pixelRadius;
  });
}

function assertTrianglePixelsCovered(coverage, triangle, width, height, frameWidth, frameHeight) {
  const projected = triangle.map(([x, y]) => [x * width / frameWidth, y * height / frameHeight]);
  const minX = Math.max(0, Math.ceil(Math.min(...projected.map(([x]) => x)) - 1));
  const maxX = Math.min(width - 1, Math.floor(Math.max(...projected.map(([x]) => x))));
  const minY = Math.max(0, Math.ceil(Math.min(...projected.map(([, y]) => y)) - 1));
  const maxY = Math.min(height - 1, Math.floor(Math.max(...projected.map(([, y]) => y))));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (intersectsPixel(projected, x, y)) assert.equal(coverage[y * width + x], 1, `Triangle intersects pixel ${x},${y}`);
  }
}

test('triangle union covers pixel-edge contact, either winding, thin and degenerate projections', () => {
  const triangle = [[2, 2], [10, 3], [4, 9]];
  const forward = rasterize([triangle]);
  const reversed = rasterize([[triangle[0], triangle[2], triangle[1]]]);
  assert.deepEqual(reversed, forward);
  assert.equal(forward[1 * 16 + 2], 1, 'Triangle touching an integer pixel corner is covered conservatively');
  assert.equal(forward[9 * 16 + 4], 1, 'Bottom boundary touching a pixel edge is covered');

  const coverage = rasterize([
    [[-4, 4], [8, 4.01], [8, 4]],
    [[14, 8], [18, 8], [16, 8]],
    [[-2, -2], [3, 1], [1, 5]],
    [[20, 20], [22, 22], [23, 20]],
  ]);
  for (const [x, y] of [[0, 4], [7, 4], [14, 8], [15, 8], [0, 0], [1, 1], [2, 2]]) {
    assert.equal(coverage[y * 16 + x], 1, `Clipped or degenerate triangle covers ${x},${y}`);
  }
  assert.equal(coverage[11 * 16 + 15], 0, 'Off-canvas triangles do not wrap into the mask');
});

test('all projected tailored sleeve triangles remain excluded under roll, crossed and raised poses', () => {
  for (const options of [{}, { roll: .6 }, { crossed: true }, { raised: true }]) {
    const frame = buildGarmentFrame(torsoFor(options), { ...defaultTailoring(), sleeveLength: 135, sleeveOpening: 130 });
    const coverage = rasterizeSleeveUnion(frame.sleeves, 256, 171, 1000, 1000);
    for (const { triangles } of frame.sleeves) {
      for (const triangle of triangles) assertTrianglePixelsCovered(coverage, triangle, 256, 171, 1000, 1000);
    }
  }
});
