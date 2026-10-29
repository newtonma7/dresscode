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

test('fit anchors to shoulders and returns finite shirt bounds', () => {
  const result = fitTorso(pose(), { width: 1280, height: 720 });
  assert.equal(result.kind, 'torso');
  assert.ok(Number.isFinite(result.center.x));
  assert.ok(Number.isFinite(result.width));
  assert.ok(result.width > result.shoulderSpan);
  for (const u of [0, 0.25, 0.5, 0.75, 1]) for (const v of [0, 0.5, 1]) {
    const point = garmentPoint(result, u, v);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x >= 0 && point.x <= 1280);
    assert.ok(point.y >= 0 && point.y <= 720);
  }
});

test('no shoulders and turned torso are unavailable, not stale fits', () => {
  assert.deepEqual(fitTorso([], { width: 640, height: 480 }), { kind: 'unavailable', reason: 'Shoulders not visible' });
  const turned = pose();
  turned[12] = { x: 0.325, y: 0.42, visibility: 1 };
  assert.equal(fitTorso(turned, { width: 640, height: 480 }).reason, 'Turn toward the camera');
});

test('cropped hips fall back to shoulder-scaled length', () => {
  const landmarks = pose();
  landmarks[23].visibility = 0.1;
  landmarks[24].visibility = 0.1;
  const result = fitTorso(landmarks, { width: 600, height: 800 });
  assert.equal(result.kind, 'torso');
  assert.equal(result.hipsVisible, false);
  assert.ok(Math.abs(result.height / 800 - result.shoulderSpan / 600 * 1.55) < 1e-8);
});

test('arm corridor restores arm pixels without restoring the torso', () => {
  const result = fitTorso(pose(), { width: 1000, height: 1000 });
  assert.equal(pointInArmCorridor(300, 320, result), false);
  assert.equal(pointInArmCorridor(260, 400, result), false);
  assert.equal(pointInArmCorridor(200, 610, result), true);
  assert.equal(pointInArmCorridor(500, 500, result), false);
});
