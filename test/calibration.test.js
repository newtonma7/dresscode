import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_POINTS, shoulderBasis, correctedLandmarks, correctionForPoint, containedRect, sourceToView, viewToSource } from '../src/calibration.js';

const points = () => {
  const result = Array(33).fill(null);
  for (const { id } of BODY_POINTS) result[id] = { x: .4, y: .6, visibility: .8, z: -.1 };
  result[11] = { x: .3, y: .3, visibility: .9 };
  result[12] = { x: .7, y: .4, visibility: .9 };
  return result;
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('offsets use a fixed raw pixel shoulder basis and do not mutate raw landmarks or confidence', () => {
  const raw = points(), snapshot = structuredClone(raw), frame = { width: 1000, height: 500 };
  const basis = shoulderBasis(raw, frame);
  close(basis.span, Math.hypot(400, 50));
  const target = { x: .2, y: .5 };
  const offset = correctionForPoint(raw, frame, 11, target);
  const moved = correctedLandmarks(raw, frame, { 11: offset, 13: { across: .1, down: .2 } });
  close(moved[11].x, target.x); close(moved[11].y, target.y);
  close(moved[13].x, .4 + (40 - 10) / 1000);
  close(moved[13].y, .6 + (5 + 80) / 500);
  assert.equal(moved[13].visibility, raw[13].visibility);
  assert.deepEqual(raw, snapshot);
});

test('body-relative offsets follow scale, translation and shoulder roll', () => {
  const raw = points(); raw[11].y = raw[12].y = .3;
  const frame = { width: 1000, height: 1000 };
  const offset = correctionForPoint(raw, frame, 13, { x: .5, y: .7 });
  const transformed = raw.map((p) => p && ({ ...p, x: .8 - p.y / 2, y: .1 + p.x / 2 }));
  const corrected = correctedLandmarks(transformed, frame, { 13: offset });
  close(corrected[13].x, .45); close(corrected[13].y, .35);
});

test('unusable raw points cannot be corrected and missing shoulders cannot be revived by offsets', () => {
  for (const point of [null, { x: .2, y: .3 }, { x: .2, y: .3, visibility: .1 }, { x: -1, y: .3, visibility: 1 }, { x: .3, y: NaN, visibility: 1 }]) {
    const raw = points(); raw[13] = point;
    assert.equal(correctionForPoint(raw, { width: 600, height: 800 }, 13, { x: .2, y: .3 }), null);
    assert.equal(correctedLandmarks(raw, { width: 600, height: 800 }, { 13: { across: 1, down: 1 } })[13], null);
    raw[11] = point;
    assert.equal(correctedLandmarks(raw, { width: 600, height: 800 }, { 11: { across: 1, down: 1 } }), null);
  }
});

test('anatomical IDs remain stable when shoulders cross screen ordering', () => {
  const raw = points(); [raw[11], raw[12]] = [raw[12], raw[11]];
  const frame = { width: 600, height: 800 };
  const offset = correctionForPoint(raw, frame, 11, { x: .8, y: .5 });
  const corrected = correctedLandmarks(raw, frame, { 11: offset });
  close(corrected[11].x, .8); close(corrected[11].y, .5);
  assert.deepEqual(corrected[12], raw[12]);
});

test('contained-image transforms exclude letterboxing, invert mirror and ignore DPR', () => {
  const frame = { width: 600, height: 800 };
  const rect = containedRect({ left: 20, top: 30, width: 1000, height: 400 }, frame);
  assert.deepEqual(rect, { left: 370, top: 30, width: 300, height: 400 });
  for (const mirror of [true, false]) {
    const point = { x: .2, y: .6 };
    const mapped = viewToSource(sourceToView(point, rect, mirror), rect, mirror);
    close(mapped.x, point.x); close(mapped.y, point.y);
    assert.equal(viewToSource({ x: 21, y: 50 }, rect, mirror), null);
  }
  assert.deepEqual(sourceToView({ x: .2, y: .6 }, rect, true), { x: 610, y: 270 });
  const resized = containedRect({ left: 0, top: 0, width: 300, height: 800 }, frame);
  assert.deepEqual(resized, { left: 0, top: 200, width: 300, height: 400 });
});
