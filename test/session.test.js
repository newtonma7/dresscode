import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewSession } from '../src/session.js';

class FakeTrack extends EventTarget {
  kind = 'video';
  endedListeners = new Set();
  stopped = 0;
  addEventListener(type, listener, options) {
    if (type === 'ended') this.endedListeners.add(listener);
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    if (type === 'ended') this.endedListeners.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  stop() { this.stopped += 1; }
  end() { this.dispatchEvent(new Event('ended')); }
}

class FakeWorker {
  static instances = [];
  onmessage = null;
  onerror = null;
  terminated = 0;
  postMessage(message) { this.lastMessage = message; }
  terminate() { this.terminated += 1; }
  send(data) { this.onmessage?.({ data }); }
}

function setup() {
  const tracks = [];
  const stream = { getTracks: () => tracks };
  const track = new FakeTrack();
  tracks.push(track);
  const video = {
    srcObject: null,
    play: async () => {},
    requestVideoFrameCallback: (callback) => { video.capture = (...args) => { video.capture = null; return callback(...args); }; return 1; },
    cancelVideoFrameCallback: () => { video.capture = null; },
  };
  const clears = [];
  const renders = [];
  let retained;
  const renderer = {
    render(input) {
      if (input.bitmap && input.bitmap !== retained) { retained?.close(); retained = input.bitmap; }
      renders.push(input);
    },
    setSegmentation() {},
    clear() { retained?.close(); retained = undefined; clears.push('clear'); },
  };
  const statuses = [];
  const tracking = [];
  const prior = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    Worker: Object.getOwnPropertyDescriptor(globalThis, 'Worker'),
    createImageBitmap: Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap'),
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => stream } },
  });
  FakeWorker.instances = [];
  globalThis.Worker = class extends FakeWorker {
    constructor(...args) { super(...args); FakeWorker.instances.push(this); }
  };
  const session = createPreviewSession({ video, renderer, onStatus: (value) => statuses.push(value), onTracking: (value) => tracking.push(value) });
  return {
    session, track, video, renderer, clears, renders, statuses, tracking,
    worker: (index = 0) => FakeWorker.instances[index],
    restore() {
      if (prior.navigator) Object.defineProperty(globalThis, 'navigator', prior.navigator);
      else delete globalThis.navigator;
      if (prior.createImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', prior.createImageBitmap);
      else delete globalThis.createImageBitmap;
      if (prior.Worker) Object.defineProperty(globalThis, 'Worker', prior.Worker);
      else delete globalThis.Worker;
    },
  };
}

test('camera track ending clears preview and reports a reconnect action', async () => {
  const app = setup();
  try {
    await app.session.start();
    app.worker().send({ type: 'ready' });
    assert.equal(app.session.state, 'running');

    app.track.end();

    assert.equal(app.session.state, 'error');
    assert.equal(app.video.srcObject, null);
    assert.equal(app.track.stopped, 1);
    assert.equal(app.track.endedListeners.size, 0);
    assert.equal(app.clears.length, 1);
    assert.match(app.tracking.at(-1).torso.reason, /disconnected.*start again/i);
  } finally { app.restore(); }
});

test('camera permission denial keeps an actionable reason in status and tracking', async () => {
  const app = setup();
  try {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    };

    await app.session.start();

    const reason = 'Camera access was denied. Allow camera access for this site, then try again.';
    assert.equal(app.session.state, 'error');
    assert.equal(app.statuses.at(-1).detail, reason);
    assert.equal(app.tracking.at(-1).torso.reason, reason);
    assert.equal(app.video.srcObject, null);
    assert.equal(FakeWorker.instances.length, 0);
  } finally { app.restore(); }
});

test('tracking failures keep their actionable reason after cleanup', async () => {
  const app = setup();
  try {
    await app.session.start();
    app.worker().send({ type: 'failure', message: 'Model load failed. Run npm run assets and retry.' });

    assert.equal(app.session.state, 'error');
    assert.equal(app.video.srcObject, null);
    assert.equal(app.statuses.at(-1).detail, 'Model load failed. Run npm run assets and retry.');
    assert.equal(app.tracking.at(-1).torso.reason, 'Model load failed. Run npm run assets and retry.');
  } finally { app.restore(); }
});

test('worker errors keep the event message and stop the stream', async () => {
  const app = setup();
  try {
    await app.session.start();
    const event = new Event('error');
    Object.defineProperty(event, 'message', { value: 'Tracking worker boot failed. Run npm run assets.' });

    app.worker().onerror(event);

    assert.equal(app.session.state, 'error');
    assert.equal(app.statuses.at(-1).detail, 'Tracking worker boot failed. Run npm run assets.');
    assert.equal(app.tracking.at(-1).torso.reason, 'Tracking worker boot failed. Run npm run assets.');
    assert.equal(app.video.srcObject, null);
    assert.equal(app.track.stopped, 1);
    assert.equal(app.worker().terminated, 1);
  } finally { app.restore(); }
});

test('worker errors without a message report an actionable fallback', async () => {
  const app = setup();
  try {
    await app.session.start();
    app.worker().onerror(new Event('error'));

    const reason = 'Tracking worker failed. Run npm run assets and try again.';
    assert.equal(app.statuses.at(-1).detail, reason);
    assert.equal(app.tracking.at(-1).torso.reason, reason);
    assert.equal(app.track.stopped, 1);
    assert.equal(app.worker().terminated, 1);
  } finally { app.restore(); }
});

test('stopping during camera acquisition releases the late stream', async () => {
  const app = setup();
  let resolveCamera;
  const lateTrack = new FakeTrack();
  const lateStream = { getTracks: () => [lateTrack] };
  try {
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { resolveCamera = resolve; });
    const starting = app.session.start();
    app.session.stop();
    resolveCamera(lateStream);
    await starting;

    assert.equal(app.session.state, 'stopped');
    assert.equal(lateTrack.stopped, 1);
    assert.equal(app.video.srcObject, null);
    assert.equal(FakeWorker.instances.length, 0);
  } finally { app.restore(); }
});

test('a stopped camera owner cannot fail the replacement session', async () => {
  const app = setup();
  let replacementTrack;
  try {
    await app.session.start();
    const endedOwnerTrack = app.track;
    const replacement = { track: new FakeTrack(), getTracks() { return [this.track]; } };
    replacementTrack = replacement.track;
    navigator.mediaDevices.getUserMedia = async () => replacement;
    app.session.stop();
    assert.equal(endedOwnerTrack.endedListeners.size, 0);
    await app.session.start();
    app.worker(1).send({ type: 'ready' });

    endedOwnerTrack.end();

    assert.equal(app.session.state, 'running');
    assert.equal(app.video.srcObject, replacement);
    assert.equal(replacementTrack.stopped, 0);
  } finally { app.session.stop(); app.restore(); }
});

const bodyPoints = () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  for (const [id, x, y] of [[11, .3, .3], [12, .7, .3], [13, .2, .5], [14, .8, .5], [23, .35, .8], [24, .65, .8]]) points[id] = { x, y, visibility: .9 };
  return points;
};
const fakeBitmap = () => ({ width: 600, height: 800, closed: 0, close() { this.closed++; } });
async function trackedCamera(app) {
  globalThis.createImageBitmap = async () => fakeBitmap();
  await app.session.start();
  app.worker().send({ type: 'ready' });
  return replyFrame(app);
}
async function replyFrame(app, landmarks = bodyPoints()) {
  await app.video.capture(0, { mediaTime: 1 });
  const request = app.worker().lastMessage;
  app.worker().send({ ...request, type: 'result', landmarks, inferenceMs: 1 });
  return request;
}

test('worker loader error takes priority over playback rejection during startup', async () => {
  const app = setup();
  let rejectPlay;
  try {
    app.video.play = () => new Promise((_resolve, reject) => { rejectPlay = reject; });
    const starting = app.session.start();
    await Promise.resolve();
    app.worker().onerror({ message: 'Tracking worker loader failed.' });
    rejectPlay(new DOMException('The play request was interrupted.', 'AbortError'));
    await starting;

    assert.equal(app.session.state, 'error');
    assert.equal(app.statuses.at(-1).detail, 'Tracking worker loader failed.');
    assert.equal(app.tracking.at(-1).torso.reason, 'Tracking worker loader failed.');
    assert.equal(app.video.srcObject, null);
    assert.equal(app.track.stopped, 1);
    assert.equal(app.worker().terminated, 1);
    assert.equal(app.worker().lastMessage, undefined);
  } finally { app.restore(); }
});

test('occlusion revisions discard an in-flight old mask and capture the new intent', async () => {
  const app = setup();
  let capture;
  let closed = 0;
  const segmentation = [];
  try {
    app.renderer.setSegmentation = (value) => segmentation.push(value);
    app.video.requestVideoFrameCallback = (callback) => { capture = callback; return 1; };
    globalThis.createImageBitmap = async () => ({ width: 640, height: 480, close() { closed++; } });
    await app.session.start();
    const worker = app.worker();
    worker.send({ type: 'ready' });
    await capture(0, { mediaTime: 1 });
    const first = worker.lastMessage;
    assert.equal(first.occlusion, true);
    app.session.setOcclusion(false);
    app.session.setOcclusion(true);
    worker.send({ ...first, type: 'result', landmarks: null, mask: new ArrayBuffer(10) });
    assert.equal(closed, 1);
    assert.equal(app.tracking.length, 0);
    await capture(0, { mediaTime: 2 });
    assert.equal(worker.lastMessage.occlusion, true);
    assert.notEqual(worker.lastMessage.revision, first.revision);
    assert.deepEqual(segmentation, [false, true]);
  } finally { app.session.stop(); app.restore(); }
});

test('frozen calibration uses the displayed observation and closes late replies once', async () => {
  const app = setup();
  try {
    const shown = await trackedCamera(app);
    await app.video.capture(0, { mediaTime: 2 });
    const pending = app.worker().lastMessage;
    assert.equal(app.session.beginCalibration(), true);
    assert.equal(app.session.state, 'editing');
    const count = app.renders.length;
    app.worker().send({ ...pending, type: 'result', landmarks: bodyPoints() });
    assert.equal(pending.bitmap.closed, 1);
    assert.equal(shown.bitmap.closed, 0);
    assert.equal(app.renders.length, count);
    assert.equal(app.video.capture, null);
    const raw = app.session.editor.points.find((p) => p.id === 11).point;
    assert.equal(raw.x, .3);
    app.session.movePoint(11, { x: .2, y: .35 });
    const moved = app.session.editor.points.find((p) => p.id === 11).point;
    assert.ok(Math.abs(moved.x - .2) < 1e-10);
    assert.equal(app.renders.at(-1).bitmap, undefined);
    assert.equal(shown.bitmap.closed, 0);
    app.session.finishCalibration(true);
    assert.equal(app.session.state, 'running');
    assert.ok(app.video.capture);
    await replyFrame(app);
    assert.ok(Math.abs(app.session.editor.points.find((p) => p.id === 11).point.x - .2) < 1e-10);
    assert.equal(shown.bitmap.closed, 1);
  } finally { app.session.stop(); app.restore(); }
});

test('collapsing corrected shoulders rejects the draft without losing the frozen bitmap or fit', async () => {
  const app = setup();
  try {
    const shown = await trackedCamera(app);
    app.session.beginCalibration();
    const lastFit = app.renders.at(-1).torso;
    assert.equal(app.session.movePoint(11, { x: .7, y: .3 }), false);
    assert.match(app.session.editor.editReason, /shoulders apart/);
    assert.equal(app.renders.at(-1).torso, lastFit);
    assert.equal(shown.bitmap.closed, 0);
    app.session.resetCorrections();
    assert.equal(app.session.editor.editReason, '');
    app.session.finishCalibration(false);
    assert.equal(app.renders.at(-1).torso.kind, 'torso');
    assert.equal(shown.bitmap.closed, 0);
  } finally { app.session.stop(); app.restore(); }
});

test('fit sliders redraw immediately during edits, cancel restores committed points and reset preserves fit', async () => {
  const app = setup();
  try {
    await trackedCamera(app);
    const initial = app.renders.at(-1).torso;
    app.session.beginCalibration();
    app.session.movePoint(13, { x: .1, y: .55 });
    app.session.setFit({ width: 1.2, length: 1.1, vertical: .1 });
    const fitted = app.renders.at(-1).torso;
    assert.ok(Math.abs(fitted.width / initial.width - 1.2) < 1e-10);
    assert.ok(Math.abs(fitted.height / initial.height - 1.1) < 1e-10);
    assert.ok(Math.abs(fitted.elbows[0].x - 60) < 1e-10);
    app.session.finishCalibration(false);
    assert.equal(app.renders.at(-1).torso.elbows[0].x, 120);
    assert.equal(app.renders.at(-1).torso.width, fitted.width);
    app.session.beginCalibration();
    app.session.movePoint(13, { x: .1, y: .55 });
    app.session.finishCalibration(true);
    app.session.beginCalibration();
    app.session.resetCorrections();
    assert.equal(app.session.editor.hasCorrections, false);
    assert.equal(app.renders.at(-1).torso.width, fitted.width);
    app.session.finishCalibration(false);
    assert.equal(app.session.editor.hasCorrections, true);
    app.session.resetCorrections();
    assert.equal(app.session.editor.hasCorrections, false);
    assert.equal(app.renders.at(-1).torso.elbows[0].x, 120);
  } finally { app.session.stop(); app.restore(); }
});

test('corrections stay dormant through tracking loss but require raw valid shoulders', async () => {
  const app = setup();
  try {
    await trackedCamera(app);
    app.session.beginCalibration();
    app.session.movePoint(11, { x: .2, y: .3 });
    app.session.finishCalibration(true);
    const missing = bodyPoints();
    missing[11] = { x: .3, y: .3, visibility: .1 };
    await replyFrame(app, missing);
    assert.equal(app.session.editor.canEdit, false);
    assert.equal(app.session.beginCalibration(), false);
    assert.equal(app.session.editor.hasCorrections, true);
    await replyFrame(app);
    assert.ok(Math.abs(app.session.editor.points[0].point.x - .2) < 1e-10);
  } finally { app.session.stop(); app.restore(); }
});

test('stop and device replacement invalidate editing, corrections and delayed capture bitmaps', async () => {
  const app = setup();
  try {
    const shown = await trackedCamera(app);
    app.session.beginCalibration();
    app.session.movePoint(11, { x: .2, y: .3 });
    const worker = app.worker();
    app.session.stop();
    assert.equal(shown.bitmap.closed, 1);
    assert.equal(app.session.state, 'stopped');
    assert.equal(app.session.editor.canEdit, false);
    assert.equal(app.session.editor.hasCorrections, false);
    assert.equal(app.session.movePoint(11, { x: .2, y: .3 }), false);
    const late = fakeBitmap();
    worker.send({ type: 'result', bitmap: late });
    assert.equal(late.closed, 1);
    await app.session.start('replacement');
    app.worker(1).send({ type: 'ready' });
    assert.equal(app.session.editor.hasCorrections, false);
    let resolveBitmap;
    globalThis.createImageBitmap = () => new Promise((resolve) => { resolveBitmap = resolve; });
    const capturing = app.video.capture(0, {});
    app.session.stop();
    const captured = fakeBitmap();
    resolveBitmap(captured);
    await capturing;
    assert.equal(captured.closed, 1);
  } finally { app.session.stop(); app.restore(); }
});

test('demo and camera share the transaction path without retaining corrections across sources', async () => {
  const app = setup();
  try {
    await app.session.startDemo(async () => ({ bitmap: fakeBitmap(), landmarks: bodyPoints() }));
    assert.equal(FakeWorker.instances.length, 0);
    assert.equal(app.session.editor.source, 'demo');
    app.session.beginCalibration();
    app.session.movePoint(24, { x: .75, y: .9 });
    app.session.finishCalibration(true);
    await Promise.resolve();
    assert.ok(Math.abs(app.session.editor.points.find((p) => p.id === 24).point.x - .75) < 1e-10);
    app.session.beginCalibration();
    app.session.movePoint(24, { x: .8, y: .9 });
    app.session.finishCalibration(false);
    assert.ok(Math.abs(app.session.editor.points.find((p) => p.id === 24).point.x - .75) < 1e-10);
    await app.session.start();
    assert.equal(app.session.editor.hasCorrections, false);
    assert.equal(app.session.editor.source, 'camera');
  } finally { app.session.stop(); app.restore(); }
});

test('a late demo bitmap cannot replace a stopped or replacement source', async () => {
  const app = setup();
  let resolveFrame;
  try {
    const starting = app.session.startDemo(() => new Promise((resolve) => { resolveFrame = resolve; }));
    app.session.stop();
    const bitmap = fakeBitmap();
    resolveFrame({ bitmap, landmarks: bodyPoints() });
    await starting;
    assert.equal(bitmap.closed, 1);
    assert.equal(app.renders.length, 0);
    assert.equal(app.session.state, 'stopped');
  } finally { app.restore(); }
});
