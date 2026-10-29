import test from 'node:test';
import assert from 'node:assert/strict';
import { fitTorso, garmentPoint, pointInArmCorridor } from '../src/geometry.js';

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

test('the body covers the torso below the sleeves instead of narrowing to a bib', () => {
  const torso = fitTorso(pose(), { width: 1000, height: 1000 });
  for (const v of [0.3, 0.5, 0.8, 1]) {
    const width = distance(garmentPoint(torso, 0, v), garmentPoint(torso, 1, v));
    assert.ok(width >= torso.shoulderSpan, `Body width ${width} must cover ${torso.shoulderSpan}px shoulders`);
  }
  for (let row = 0; row < 100; row++) {
    const a = garmentPoint(torso, 0, row / 100);
    const b = garmentPoint(torso, 0, (row + 1) / 100);
    assert.ok(distance(a, b) < torso.height * 0.025, 'The body edge must not jump at the sleeve transition');
  }
});

test('the top boundary dips into an open crew neck', () => {
  const torso = fitTorso(pose(), { width: 1000, height: 1000 });
  const shoulder = garmentPoint(torso, 0, 0);
  const neck = garmentPoint(torso, 0.5, 0);
  assert.ok(neck.y > shoulder.y + torso.shoulderSpan * 0.12);
  assert.ok(neck.y < shoulder.y + torso.shoulderSpan * 0.25);
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
  for (const u of [0, 0.5, 1]) for (const v of [0, 0.3, 1]) {
    assert.deepEqual(garmentPoint(reversed, u, v), garmentPoint(torso, u, v));
  }
  assert.equal(pointInArmCorridor(200, 610, reversed), true);
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
  for (const u of [0, 0.5, 1]) for (const v of [0, 0.3, 1]) {
    const p = garmentPoint(a, u, v);
    const expected = rotate({ x: p.x / 1000, y: p.y / 1000 });
    assert.ok(distance(garmentPoint(b, u, v), { x: expected.x * 1000, y: expected.y * 1000 }) < 1e-8);
  }
});

test('valid fits stay finite over aspect ratios, fit controls, and missing elbows', () => {
  const landmarks = pose();
  landmarks[13].visibility = landmarks[14].visibility = 0;
  for (const frame of [{ width: 1280, height: 720 }, { width: 600, height: 800 }]) {
    for (const fit of [{ width: 0.8, length: 0.7, vertical: -0.2 }, { width: 1.3, length: 1.3, vertical: 0.2 }]) {
      const torso = fitTorso(landmarks, frame, fit);
      assert.equal(torso.kind, 'torso');
      for (let row = 0; row <= 40; row++) for (let column = 0; column <= 40; column++) {
        const p = garmentPoint(torso, column / 40, row / 40);
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      }
    }
  }
});

test('arm corridor restores exposed upper arm and forearm without restoring torso skin', () => {
  const torso = fitTorso(pose(), { width: 1000, height: 1000 });
  assert.equal(pointInArmCorridor(300, 320, torso), false);
  assert.equal(pointInArmCorridor(260, 400, torso), false);
  assert.equal(pointInArmCorridor(236, 460, torso), true);
  assert.equal(pointInArmCorridor(200, 610, torso), true);
  assert.equal(pointInArmCorridor(500, 500, torso), false);
});
