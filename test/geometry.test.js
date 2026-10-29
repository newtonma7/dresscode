import test from 'node:test';
import assert from 'node:assert/strict';
import { fitTorso, buildArmCorridors, pointInArmCorridor } from '../src/geometry.js';
import { buildGarmentFrame, garmentTopology, pointInSleeve } from '../src/garment-shape.js';
import { defaultTailoring } from '../src/tailoring.js';

const pose = () => {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  points[11] = { x: 0.3, y: 0.3, visibility: 0.95 };
  points[12] = { x: 0.7, y: 0.3, visibility: 0.95 };
  points[13] = { x: 0.22, y: 0.5, visibility: 0.9 };
  points[14] = { x: 0.78, y: 0.5, visibility: 0.9 };
  points[15] = { x: 0.18, y: 0.72, visibility: 0.9 };
  points[16] = { x: 0.82, y: 0.72, visibility: 0.9 };
  points[23] = { x: 0.36, y: 0.72, visibility: 0.9 };
  points[24] = { x: 0.64, y: 0.72, visibility: 0.9 };
  return points;
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('rounded body covers the torso below the sleeves and has a dipped open crew neck', () => {
  const torso = fitTorso(pose(), { width: 1000, height: 1000 });
  const { positions } = buildGarmentFrame(torso, defaultTailoring());
  for (const y of [450, 550, 700, 800]) {
    const row = positions.filter((p) => Math.abs(p[1] - y) < 20);
    assert.ok(Math.max(...row.map((p) => p[0])) - Math.min(...row.map((p) => p[0])) >= torso.shoulderSpan);
  }
  const neck = positions.filter((p) => Math.abs(p[0] - 500) < 2 && p[2] > 90).sort((a, b) => a[1] - b[1])[0];
  assert.ok(neck[1] > 315 && neck[1] < 380, 'Front neckline dips below the shoulders');
  assert.ok(Math.max(...positions.map((p) => p[2])) > 90, 'Volume is not a shallow front panel');
  assert.ok(Math.min(...positions.map((p) => p[2])) < -90, 'The garment has a back');
});

test('no pose, invalid frame, and collapsed shoulders cannot produce a fit', () => {
  assert.equal(fitTorso([], { width: 640, height: 480 }).kind, 'unavailable');
  assert.equal(fitTorso(pose(), { width: 0, height: 480 }).kind, 'unavailable');
  const collapsed = pose();
  collapsed[12] = { ...collapsed[11] };
  assert.equal(fitTorso(collapsed, { width: 640, height: 480 }).kind, 'unavailable');
});

test('cropped hips use pixel shoulder span regardless of frame aspect', () => {
  const landmarks = pose();
  landmarks[23].visibility = landmarks[24].visibility = 0.1;
  for (const frame of [{ width: 600, height: 800 }, { width: 600, height: 400 }]) {
    const torso = fitTorso(landmarks, frame);
    assert.equal(torso.kind, 'torso');
    assert.equal(torso.hipsVisible, false);
    assert.ok(Math.abs(torso.height - torso.shoulderSpan * 1.55) < 1e-8);
  }
  landmarks[23].visibility = landmarks[24].visibility = 1;
  landmarks[23].y = landmarks[24].y = 1.4;
  assert.equal(fitTorso(landmarks, { width: 600, height: 400 }).hipsVisible, false);
});

test('anatomical label swapping preserves the image silhouette and arm occlusion', () => {
  const original = pose();
  const swapped = pose();
  for (const [a, b] of [[11, 12], [13, 14], [15, 16], [23, 24]]) {
    [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
  }
  const frame = { width: 1000, height: 1000 };
  const torso = fitTorso(original, frame);
  const reversed = fitTorso(swapped, frame);
  assert.deepEqual(reversed.shoulders, torso.shoulders);
  assert.deepEqual(reversed.elbows, torso.elbows);
  assert.deepEqual(reversed.wrists, torso.wrists);
  assert.deepEqual(buildGarmentFrame(reversed, defaultTailoring()), buildGarmentFrame(torso, defaultTailoring()));
  assert.equal(pointInArmCorridor(200, 610, buildArmCorridors(reversed, buildGarmentFrame(reversed, defaultTailoring()).sleeves)), true);
});

test('a rolled frontal torso rotates the garment instead of being rejected as yaw', () => {
  const frame = { width: 1000, height: 1000 };
  const original = pose();
  const angle = Math.PI / 3;
  const rotate = ({ x, y }) => ({
    x: 0.5 + (x - 0.5) * Math.cos(angle) - (y - 0.5) * Math.sin(angle),
    y: 0.5 + (x - 0.5) * Math.sin(angle) + (y - 0.5) * Math.cos(angle),
  });
  const tilted = original.map((p) => ({ ...rotate(p), visibility: 1 }));
  const a = fitTorso(original, frame);
  const b = fitTorso(tilted, frame);
  assert.equal(b.kind, 'torso');
  assert.ok(Math.abs(a.height - b.height) < 1e-8);
  const before = buildGarmentFrame(a, defaultTailoring()).positions;
  const after = buildGarmentFrame(b, defaultTailoring()).positions;
  before.forEach((p, i) => {
    const expected = rotate({ x: p[0] / 1000, y: p[1] / 1000 });
    assert.ok(distance({ x: after[i][0], y: after[i][1] }, { x: expected.x * 1000, y: expected.y * 1000 }) < 1e-8);
    assert.ok(Math.abs(after[i][2] - p[2]) < 1e-8);
  });
});

test('valid fits stay finite over aspect ratios, fit controls, and missing elbows', () => {
  const landmarks = pose();
  landmarks[13].visibility = landmarks[14].visibility = 0;
  for (const frame of [{ width: 1280, height: 720 }, { width: 600, height: 800 }]) {
    for (const fit of [{ width: 0.8, length: 0.7, vertical: -0.2 }, { width: 1.3, length: 1.3, vertical: 0.2 }]) {
      const torso = fitTorso(landmarks, frame, fit);
      assert.equal(torso.kind, 'torso');
      const shape = buildGarmentFrame(torso, defaultTailoring());
      assert.ok(shape.positions.flat().every(Number.isFinite));
      assert.equal(pointInArmCorridor(200, 600, buildArmCorridors(torso, shape.sleeves)), false);
    }
  }
});

test('sleeves remain welded and follow corrected upper-arm directions', () => {
  for (const raised of [false, true]) {
    const landmarks = pose();
    if (raised) {
      landmarks[13] = { x: 0.1, y: 0.25, visibility: 1 };
      landmarks[14] = { x: 0.9, y: 0.25, visibility: 1 };
    }
    const torso = fitTorso(landmarks, { width: 1000, height: 1000 });
    const shape = buildGarmentFrame(torso, defaultTailoring());
    shape.sleeves.forEach(({ cuff }, side) => {
      const center = cuff.reduce((p, v) => [p[0] + v[0] / cuff.length, p[1] + v[1] / cuff.length], [0, 0]);
      const shoulder = torso.shoulders[side];
      const elbow = torso.elbows[side];
      const dx = elbow.x - shoulder.x, dy = elbow.y - shoulder.y;
      const progress = ((center[0] - shoulder.x) * dx + (center[1] - shoulder.y) * dy) / (dx * dx + dy * dy);
      assert.ok(progress > 0.4 && progress < 0.8, 'Short sleeves end along the upper arm');
      assert.ok(Math.max(...cuff.map((p) => p[1])) - Math.min(...cuff.map((p) => p[1])) > 20);
    });
    const edges = new Map();
    for (const face of garmentTopology.faces) face.forEach((id, i) => {
      const next = face[(i + 1) % face.length];
      const key = [id, next].sort((a, b) => a - b).join(':');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
    assert.ok([...edges.values()].every((n) => n === 1 || n === 2), 'No split or non-manifold sleeve seam');
  }
});

test('cuff-derived corridor restores distal arms but not proximal arm or bare torso', () => {
  const torso = fitTorso(pose(), { width: 1000, height: 1000 });
  const { sleeves } = buildGarmentFrame(torso, defaultTailoring());
  assert.equal(pointInArmCorridor(300, 320, buildArmCorridors(torso, sleeves)), false);
  assert.equal(pointInArmCorridor(260, 400, buildArmCorridors(torso, sleeves)), false);
  assert.equal(pointInArmCorridor(236, 460, buildArmCorridors(torso, sleeves)), true);
  assert.equal(pointInArmCorridor(200, 610, buildArmCorridors(torso, sleeves)), true);
  assert.equal(pointInArmCorridor(500, 500, buildArmCorridors(torso, sleeves)), false);
  assert.equal(pointInSleeve(260, 400, sleeves), true);
});
