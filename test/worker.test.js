import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/tracking-worker.js', import.meta.url), 'utf8');
function worker({ hardware = 'AMD Radeon', failGPU = false, failSegmentGPU = false } = {}) {
  const created = [], replies = [], inputs = [], canvases = [];
  let poseCloses = 0, resultCloses = 0, calls = 0;
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; canvases.push(this); }
    getContext(type) {
      if (type === '2d') return { drawImage: (...args) => inputs.push(args) };
      return { getExtension: (name) => name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : { loseContext() {} }, getParameter: () => hardware };
    }
  }
  const context = {
    importScripts() {}, OffscreenCanvas: Canvas, Uint8Array, performance,
    Vision: {
      FilesetResolver: { forVisionTasks: async () => ({}) },
      PoseLandmarker: { createFromOptions: async (_files, options) => {
        created.push(['pose', options]);
        if (failGPU && options.baseOptions.delegate === 'GPU') throw new Error('GPU unavailable');
        return { close() { poseCloses++; }, detectForVideo: () => ({ landmarks: [[{ x: .3, y: .4, visibility: .9 }]], close() { resultCloses++; } }) };
      } },
      ImageSegmenter: { createFromOptions: async (_files, options) => {
        created.push(['segment', options]);
        if (failSegmentGPU && options.baseOptions.delegate === 'GPU') throw new Error('Segment GPU unavailable');
        return { close() {}, segmentForVideo(input) {
          calls++;
          return { categoryMask: { width: input.width, height: input.height, getAsUint8Array: () => new Uint8Array(input.width * input.height).fill(2) }, close() { resultCloses++; } };
        } };
      } },
    },
    self: { postMessage: (message) => replies.push(message) },
  };
  vm.runInNewContext(script, context);
  const send = (data) => context.self.onmessage({ data });
  const frame = (occlusion, revision = 0) => send({ type: 'frame', id: 5, timestamp: 10, capturedAt: 1, revision, occlusion, bitmap: { width: 1280, height: 720, close() {} } });
  return { send, frame, created, replies, inputs, canvases, get calls() { return calls; }, get poseCloses() { return poseCloses; }, get resultCloses() { return resultCloses; } };
}

test('occlusion off never initializes or invokes segmentation and returns no mask', async () => {
  const w = worker();
  await w.send({ type: 'init' });
  await w.frame(false, 9);
  assert.deepEqual(w.created.map(([kind]) => kind), ['pose']);
  assert.equal(w.calls, 0);
  const result = w.replies.at(-1);
  assert.equal(result.type, 'result');
  assert.equal(result.mask, undefined);
  assert.equal(result.revision, 9);
  assert.equal(result.landmarks.length, 1);
});

test('segmentation uses a reduced aspect-preserving image and independent hardware task canvases', async () => {
  const w = worker();
  await w.send({ type: 'init' });
  await w.frame(true);
  const result = w.replies.at(-1);
  assert.equal(result.type, 'result');
  assert.equal(result.maskWidth, 256);
  assert.equal(result.maskHeight, 144);
  assert.equal(result.mask.byteLength, 256 * 144);
  assert.equal(result.bitmap.width, 1280);
  assert.equal(result.delegate, 'GPU');
  assert.equal(w.created[0][1].baseOptions.delegate, 'GPU');
  assert.notEqual(w.created[0][1].canvas, w.created[1][1].canvas);
  for (const key of ['poseMs', 'segmentSubmitMs', 'maskReadbackMs', 'workerTotalMs']) assert.ok(Number.isFinite(result.timings[key]), key);
  assert.equal(w.resultCloses, 2);
});

for (const options of [{ hardware: 'Google SwiftShader' }, { failGPU: true }, { failSegmentGPU: true }]) {
  test(`CPU fallback is truthful and closes partial GPU tasks ${JSON.stringify(options)}`, async () => {
    const w = worker(options);
    await w.send({ type: 'init' });
    await w.frame(true);
    assert.equal(w.replies.at(-1).type, 'result');
    assert.equal(w.replies.at(-1).delegate, 'CPU');
    assert.equal(w.created.at(-1)[1].baseOptions.delegate, 'CPU');
    if (options.hardware) assert.ok(w.created.every(([, o]) => o.baseOptions.delegate === 'CPU'));
    if (options.failSegmentGPU) assert.equal(w.poseCloses, 1);
  });
}
