importScripts('/vendor/vision_bundle.js');

const { FilesetResolver, ImageSegmenter, PoseLandmarker } = Vision;
let pose;
let segmenter;
let files;
let ready;
let delegate = 'CPU';
let delegateReason = '';
let hardware = '';
let lastTimestamp = -Infinity;
const segmentationInput = new OffscreenCanvas(1, 1);
const segmentationContext = segmentationInput.getContext('2d');

function hardwareGPU() {
  let gl;
  try {
    gl = new OffscreenCanvas(1, 1).getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    hardware = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return !!hardware && !/swiftshader|llvmpipe|softpipe|software|lavapipe|microsoft basic/i.test(hardware);
  } catch { return false; }
  finally { gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
}

function closeTasks() {
  pose?.close();
  segmenter?.close();
  pose = segmenter = undefined;
}

async function createPose() {
  pose = await PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/models/pose.task', delegate },
    ...(delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {}),
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.55, minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function createSegmenter() {
  segmenter = await ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/models/segmenter.tflite', delegate },
    ...(delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {}),
    runningMode: 'VIDEO', outputCategoryMask: true, outputConfidenceMasks: false,
  });
}

async function cpuFallback(error, occlusion) {
  closeTasks();
  delegate = 'CPU';
  delegateReason = `GPU initialization failed: ${error instanceof Error ? error.message : String(error)}`;
  try {
    await createPose();
    if (occlusion) await createSegmenter();
  } catch (cause) { closeTasks(); throw cause; }
}

async function initialize() {
  files = await FilesetResolver.forVisionTasks('/wasm');
  delegate = hardwareGPU() ? 'GPU' : 'CPU';
  delegateReason = delegate === 'GPU' ? 'Hardware WebGL' : 'Hardware WebGL unavailable or software renderer';
  try { await createPose(); }
  catch (error) {
    if (delegate !== 'GPU') throw error;
    await cpuFallback(error, false);
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      ready ??= initialize();
      await ready;
      self.postMessage({ type: 'ready', delegate, delegateReason, hardware });
    } catch (error) {
      self.postMessage({ type: 'failure', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (data.type !== 'frame') return;
  const { id, bitmap, revision, capturedAt } = data;
  let poseResult;
  let segmentation;
  try {
    const started = performance.now();
    await ready;
    if (data.occlusion && !segmenter) {
      try { await createSegmenter(); }
      catch (error) {
        if (delegate !== 'GPU') throw error;
        await cpuFallback(error, true);
      }
    }
    const timestamp = Math.max(Number(data.timestamp) || 0, lastTimestamp + 1);
    lastTimestamp = timestamp;
    const poseStarted = performance.now();
    poseResult = pose.detectForVideo(bitmap, timestamp);
    const poseMs = performance.now() - poseStarted;
    let mask, maskWidth = 0, maskHeight = 0, segmentSubmitMs = 0, maskReadbackMs = 0;
    if (data.occlusion) {
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      segmentationInput.width = Math.max(1, Math.round(bitmap.width * scale));
      segmentationInput.height = Math.max(1, Math.round(bitmap.height * scale));
      segmentationContext.drawImage(bitmap, 0, 0, segmentationInput.width, segmentationInput.height);
      const segmentStarted = performance.now();
      segmentation = segmenter.segmentForVideo(segmentationInput, timestamp);
      segmentSubmitMs = performance.now() - segmentStarted;
      const category = segmentation.categoryMask;
      const readbackStarted = performance.now();
      mask = category ? new Uint8Array(category.getAsUint8Array()) : new Uint8Array();
      maskReadbackMs = performance.now() - readbackStarted;
      maskWidth = category?.width ?? 0;
      maskHeight = category?.height ?? 0;
    }
    const landmarks = poseResult.landmarks?.[0]?.map(({ x, y, z, visibility }) => ({ x, y, z, visibility })) ?? null;
    segmentation?.close(); segmentation = undefined;
    poseResult.close(); poseResult = undefined;
    const workerTotalMs = performance.now() - started;
    self.postMessage({
      type: 'result', id, revision, capturedAt, bitmap, landmarks, mask: mask?.buffer,
      maskWidth, maskHeight, inferenceMs: workerTotalMs,
      delegate, delegateReason, hardware,
      timings: { poseMs, segmentSubmitMs, maskReadbackMs, workerTotalMs },
    }, mask ? [bitmap, mask.buffer] : [bitmap]);
  } catch (error) {
    segmentation?.close();
    poseResult?.close();
    bitmap.close();
    self.postMessage({ type: 'failure', id, revision, message: error instanceof Error ? error.message : String(error) });
  }
};
