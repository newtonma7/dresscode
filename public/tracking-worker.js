importScripts('/vendor/vision_bundle.js');

const { FilesetResolver, ImageSegmenter, PoseLandmarker } = Vision;
let pose;
let segmenter;
let ready;
let lastTimestamp = -Infinity;

async function initialize() {
  const files = await FilesetResolver.forVisionTasks('/wasm');
  [pose, segmenter] = await Promise.all([
    PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/models/pose.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.55, minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
    ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/models/segmenter.tflite', delegate: 'CPU' },
      runningMode: 'VIDEO', outputCategoryMask: true, outputConfidenceMasks: false,
    }),
  ]);
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      ready ??= initialize();
      await ready;
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'failure', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (data.type === 'close') {
    pose?.close();
    segmenter?.close();
    pose = segmenter = undefined;
    ready = undefined;
    lastTimestamp = -Infinity;
    return;
  }
  if (data.type !== 'frame') return;
  const { id, bitmap } = data;
  try {
    await ready;
    const timestamp = Math.max(Number(data.timestamp) || 0, lastTimestamp + 1);
    lastTimestamp = timestamp;
    const started = performance.now();
    const poseResult = pose.detectForVideo(bitmap, timestamp);
    const segmentation = segmenter.segmentForVideo(bitmap, timestamp);
    const category = segmentation.categoryMask;
    const mask = category ? new Uint8Array(category.getAsUint8Array()) : new Uint8Array();
    const landmarks = poseResult.landmarks?.[0]?.map(({ x, y, z, visibility }) => ({ x, y, z, visibility })) ?? null;
    const maskWidth = category?.width ?? 0;
    const maskHeight = category?.height ?? 0;
    segmentation.close();
    poseResult.close();
    self.postMessage({
      type: 'result', id, bitmap, landmarks, mask: mask.buffer,
      maskWidth, maskHeight, inferenceMs: performance.now() - started,
    }, [bitmap, mask.buffer]);
  } catch (error) {
    bitmap.close();
    self.postMessage({ type: 'failure', id, message: error instanceof Error ? error.message : String(error) });
  }
};
