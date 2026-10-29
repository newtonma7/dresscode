import { fitTorso } from './geometry.js';

const blend = (previous, next, amount) => {
  if (!previous || previous.kind !== 'torso' || next.kind !== 'torso') return next;
  const point = (a, b) => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount });
  return {
    ...next,
    center: point(previous.center, next.center),
    shoulders: next.shoulders.map((value, i) => point(previous.shoulders[i], value)),
    elbows: next.elbows.map((value, i) => previous.elbows[i] && value ? point(previous.elbows[i], value) : value),
    wrists: next.wrists.map((value, i) => previous.wrists[i] && value ? point(previous.wrists[i], value) : value),
    width: previous.width + (next.width - previous.width) * amount,
    height: previous.height + (next.height - previous.height) * amount,
    shoulderSpan: previous.shoulderSpan + (next.shoulderSpan - previous.shoulderSpan) * amount,
  };
};

export function createSession({ video, renderer, onStatus, onTracking }) {
  let state = 'stopped';
  let generation = 0;
  let resources;
  let fit = { width: 1, length: 1, vertical: 0 };
  let smoothed;
  let occlusion = true;
  let revision = 0;

  function status(next, detail = '') {
    state = next;
    onStatus({ state, detail });
  }

  function release(owner = resources) {
    if (!owner || owner.closed) return;
    const wasCurrent = resources === owner;
    owner.closed = true;
    if (owner.frameId && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(owner.frameId);
    owner.videoTrack?.removeEventListener('ended', owner.onTrackEnded);
    if (owner.stream) for (const track of owner.stream.getTracks()) track.stop();
    if (video.srcObject === owner.stream) video.srcObject = null;
    owner.worker?.terminate();
    if (wasCurrent) {
      renderer.clear();
      resources = undefined;
    }
  }

  async function start(deviceId) {
    const id = ++generation;
    if (resources) release(resources);
    smoothed = undefined;
    status('starting', 'Requesting camera');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      if (id !== generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      const owner = {
        stream,
        videoTrack: stream.getVideoTracks?.()[0] ?? stream.getTracks().find((track) => track.kind === 'video'),
        worker: new Worker('/tracking-worker.js'),
        inFlight: false,
      };
      owner.onTrackEnded = () => fail(owner, new Error('Camera disconnected. Reconnect the camera and start again.'));
      resources = owner;
      owner.videoTrack?.addEventListener('ended', owner.onTrackEnded);
      if (owner.videoTrack?.readyState === 'ended') { owner.onTrackEnded(); return; }
      video.srcObject = stream;
      owner.worker.onmessage = ({ data }) => {
        if (owner.closed || resources !== owner) { data.bitmap?.close(); return; }
        if (data.type === 'ready') {
          status('running', 'Camera ready. Find a front-facing pose.');
          owner.ready = true;
          schedule(owner);
          return;
        }
        if (data.type === 'failure') {
          fail(owner, new Error(data.message));
          return;
        }
        owner.inFlight = false;
        if (data.revision !== revision) { data.bitmap?.close(); schedule(owner); return; }
        const torso = data.landmarks ? fitTorso(data.landmarks, data.bitmap, fit) : { kind: 'unavailable', reason: 'No person detected' };
        const next = torso.kind === 'torso' ? blend(smoothed, torso, 0.38) : torso;
        smoothed = next.kind === 'torso' ? next : undefined;
        if (next.kind === 'torso') renderer.render({
          bitmap: data.bitmap,
          torso: next,
          mask: data.mask ? { data: new Uint8Array(data.mask), width: data.maskWidth, height: data.maskHeight } : undefined,
        });
        else { data.bitmap.close(); renderer.clear(); }
        const processingMs = performance.now() - data.capturedAt;
        onTracking({ torso: next, inferenceMs: data.inferenceMs, processingMs, timings: data.timings, delegate: data.delegate, delegateReason: data.delegateReason, hardware: data.hardware, mode: 'camera' });
        schedule(owner);
      };
      owner.worker.onerror = (event) => fail(owner, new Error(event.message || 'Tracking worker failed. Run npm run assets and try again.'));
      await video.play();
      if (id !== generation || owner.closed || resources !== owner) { release(owner); return; }
      owner.worker.postMessage({ type: 'init' });
    } catch (error) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (id !== generation) return;
      resources && release(resources);
      renderer.clear();
      const reason = error?.name === 'NotAllowedError'
        ? 'Camera access was denied. Allow camera access for this site, then try again.'
        : error instanceof Error ? error.message : String(error);
      status('error', reason);
      onTracking({ torso: { kind: 'unavailable', reason }, inferenceMs: null, mode: 'camera' });
    }
  }

  async function schedule(owner) {
    if (owner.closed || owner.inFlight || !owner.ready || state !== 'running') return;
    const capture = async (_now, metadata) => {
      owner.frameId = 0;
      if (owner.closed || owner.inFlight) return;
      owner.inFlight = true;
      const frameRevision = revision;
      const capturedAt = performance.now();
      try {
        const bitmap = await createImageBitmap(video);
        if (owner.closed) { bitmap.close(); return; }
        const timestamp = Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime * 1000 : performance.now();
        owner.worker.postMessage({ type: 'frame', id: timestamp, timestamp, bitmap, capturedAt, revision: frameRevision, occlusion }, [bitmap]);
      } catch (error) {
        owner.inFlight = false;
        fail(owner, error);
      }
    };
    if (video.requestVideoFrameCallback) owner.frameId = video.requestVideoFrameCallback(capture);
    else owner.frameId = requestAnimationFrame(capture);
  }

  function fail(owner, error) {
    if (owner.closed || resources !== owner) return;
    const reason = error instanceof Error ? error.message : String(error);
    release(owner);
    status('error', reason);
    onTracking({ torso: { kind: 'unavailable', reason }, inferenceMs: null, mode: 'camera' });
  }

  function stop() {
    generation += 1;
    if (resources) release(resources);
    else renderer.clear();
    smoothed = undefined;
    status('stopped');
    onTracking({ torso: { kind: 'unavailable', reason: 'Preview stopped' }, inferenceMs: null, mode: 'camera' });
  }

  return {
    start,
    stop,
    get state() { return state; },
    setFit(next) { fit = next; smoothed = undefined; },
    setOcclusion(value) {
      if (occlusion === value) return;
      occlusion = value;
      revision += 1;
      renderer.setSegmentation(value);
    },
  };
}
