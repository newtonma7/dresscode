import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from '../src/session.js';

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
    requestVideoFrameCallback: () => 1,
    cancelVideoFrameCallback: () => {},
  };
  const clears = [];
  const renderer = { clear: () => clears.push('clear') };
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
  const session = createSession({ video, renderer, onStatus: (value) => statuses.push(value), onTracking: (value) => tracking.push(value) });
  return {
    session, track, video, renderer, clears, statuses, tracking,
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

test('an early worker loader error during pending playback stops startup', async () => {
  const app = setup();
  let resolvePlay;
  try {
    app.video.play = () => new Promise((resolve) => { resolvePlay = resolve; });
    const starting = app.session.start();
    await Promise.resolve();
    app.worker().onerror({ message: 'Early loader failure' });
    resolvePlay();
    await starting;
    assert.equal(app.session.state, 'error');
    assert.equal(app.track.stopped, 1);
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
