import { fitTorso } from './geometry.js';
import { BODY_POINTS, correctedLandmarks, correctionForPoint, shoulderBasis, usablePoint } from './calibration.js';

export function createPreviewSession({ video, renderer, onStatus, onTracking, onEditor = () => {} }) {
  const preview = {
    source: 'none', phase: 'stopped', observation: null,
    fit: { width: 1, length: 1, vertical: 0 }, corrections: {}, edit: null,
  };
  let generation = 0;
  let resources;
  let demoFrame;
  let occlusion = true;
  let revision = 0;
  let frameSequence = 0;

  function editorView() {
    const observation = preview.observation;
    const points = observation && correctedLandmarks(observation.landmarks, observation.frame, preview.edit?.draft ?? preview.corrections);
    return {
      source: preview.source, phase: preview.phase, frame: observation?.frame,
      canEdit: !!points, reason: points ? '' : 'Wait for a tracked frame with both shoulders visible before adjusting tracking.',
      hasCorrections: Object.keys(preview.edit?.draft ?? preview.corrections).length > 0,
      editReason: preview.edit?.reason ?? '',
      points: BODY_POINTS.map(({ id, name }) => ({ id, name, enabled: !!points && usablePoint(observation.landmarks[id]), point: points?.[id] })),
    };
  }

  function status(next, detail = '') {
    preview.phase = next;
    onStatus({ state: next, detail, source: preview.source });
    onEditor(editorView());
  }

  function cancelCapture(owner) {
    if (!owner?.frameId) return;
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(owner.frameId);
    else cancelAnimationFrame(owner.frameId);
    owner.frameId = 0;
  }

  function release(owner = resources) {
    if (!owner || owner.closed) return;
    const wasCurrent = resources === owner;
    owner.closed = true;
    cancelCapture(owner);
    owner.videoTrack?.removeEventListener('ended', owner.onTrackEnded);
    for (const track of owner.stream.getTracks()) track.stop();
    if (video.srcObject === owner.stream) video.srcObject = null;
    owner.worker.terminate();
    if (wasCurrent) { renderer.clear(); resources = undefined; }
  }

  function invalidate() {
    revision += 1;
    preview.edit = null;
    preview.observation = null;
    preview.corrections = {};
  }

  function torsoFor(observation) {
    const points = correctedLandmarks(observation.landmarks, observation.frame, preview.edit?.draft ?? preview.corrections);
    return points ? fitTorso(points, observation.frame, preview.fit) : { kind: 'unavailable', reason: 'Shoulders not visible' };
  }

  function report(torso, observation = preview.observation) {
    onTracking({
      torso, mode: preview.source, frozen: preview.phase === 'editing',
      inferenceMs: observation?.inferenceMs ?? null, processingMs: observation?.processingMs,
      timings: observation?.timings, delegate: observation?.delegate,
      delegateReason: observation?.delegateReason, hardware: observation?.hardware,
    });
    onEditor(editorView());
  }

  function redraw() {
    if (!preview.observation) return;
    const torso = torsoFor(preview.observation);
    renderer.render({ torso });
    report(torso);
  }

  function present(data) {
    const observation = {
      id: data.id, landmarks: data.landmarks,
      frame: { width: data.bitmap.width, height: data.bitmap.height },
      capturedAt: data.capturedAt, inferenceMs: data.inferenceMs,
      timings: data.timings, delegate: data.delegate, delegateReason: data.delegateReason, hardware: data.hardware,
    };
    const torso = data.landmarks ? torsoFor(observation) : { kind: 'unavailable', reason: 'No person detected' };
    if (torso.kind === 'torso') {
      preview.observation = observation;
      renderer.render({
        bitmap: data.bitmap, torso,
        mask: occlusion && data.mask ? {
          data: data.mask instanceof Uint8Array ? data.mask : new Uint8Array(data.mask),
          width: data.maskWidth, height: data.maskHeight,
        } : undefined,
      });
    } else {
      preview.observation = null;
      data.bitmap.close();
      renderer.clear();
    }
    observation.processingMs = performance.now() - data.capturedAt;
    report(torso, observation);
  }

  async function start(deviceId) {
    const id = ++generation;
    if (resources) release(resources);
    else if (preview.observation) renderer.clear();
    demoFrame = undefined;
    invalidate();
    preview.source = 'camera';
    status('starting', 'Requesting camera');
    let stream, owner;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      if (id !== generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      owner = {
        stream,
        videoTrack: stream.getVideoTracks?.()[0] ?? stream.getTracks().find((track) => track.kind === 'video'),
        worker: new Worker('/tracking-worker.js'), inFlight: false,
      };
      owner.onTrackEnded = () => fail(owner, new Error('Camera disconnected. Reconnect the camera and start again.'));
      resources = owner;
      owner.worker.onmessage = ({ data }) => {
        if (owner.closed || resources !== owner) { data.bitmap?.close(); return; }
        if (data.type === 'ready') {
          owner.ready = true;
          status('running', 'Camera ready. Find a front-facing pose.');
          schedule(owner);
          return;
        }
        owner.inFlight = false;
        if (data.revision != null && (data.revision !== revision || preview.phase === 'editing')) {
          data.bitmap?.close(); schedule(owner); return;
        }
        if (data.type === 'failure') { fail(owner, new Error(data.message)); return; }
        present(data);
        schedule(owner);
      };
      owner.worker.onerror = (event) => fail(owner, new Error(event.message || 'Tracking worker failed. Run npm run assets and try again.'));
      owner.videoTrack?.addEventListener('ended', owner.onTrackEnded);
      if (owner.videoTrack?.readyState === 'ended') { owner.onTrackEnded(); return; }
      video.srcObject = stream;
      await video.play();
      if (id !== generation || owner.closed || resources !== owner) { release(owner); return; }
      owner.worker.postMessage({ type: 'init' });
    } catch (error) {
      if (owner) release(owner);
      else stream?.getTracks().forEach((track) => track.stop());
      if (id !== generation) return;
      invalidate();
      renderer.clear();
      const reason = error?.name === 'NotAllowedError'
        ? 'Camera access was denied. Allow camera access for this site, then try again.'
        : error instanceof Error ? error.message : String(error);
      status('error', reason);
      report({ kind: 'unavailable', reason });
    }
  }

  function schedule(owner) {
    if (owner.closed || owner.inFlight || owner.frameId || !owner.ready || preview.phase !== 'running') return;
    const capture = async (_now, metadata) => {
      owner.frameId = 0;
      if (owner.closed || owner.inFlight || preview.phase !== 'running') return;
      owner.inFlight = true;
      const frameRevision = revision;
      const capturedAt = performance.now();
      let bitmap;
      try {
        bitmap = await createImageBitmap(video);
        if (owner.closed || frameRevision !== revision || preview.phase !== 'running') {
          bitmap.close(); owner.inFlight = false; schedule(owner); return;
        }
        const timestamp = Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime * 1000 : performance.now();
        owner.worker.postMessage({ type: 'frame', id: ++frameSequence, timestamp, bitmap, capturedAt, revision: frameRevision, occlusion }, [bitmap]);
      } catch (error) { bitmap?.close(); owner.inFlight = false; fail(owner, error); }
    };
    if (video.requestVideoFrameCallback) owner.frameId = video.requestVideoFrameCallback(capture);
    else owner.frameId = requestAnimationFrame(capture);
  }

  function fail(owner, error) {
    if (owner.closed || resources !== owner) return;
    const reason = error instanceof Error ? error.message : String(error);
    release(owner);
    invalidate();
    status('error', reason);
    report({ kind: 'unavailable', reason });
  }

  function stop() {
    generation += 1;
    if (resources) release(resources);
    else renderer.clear();
    demoFrame = undefined;
    invalidate();
    preview.source = 'none';
    status('stopped');
    report({ kind: 'unavailable', reason: 'Preview stopped' });
  }

  async function captureDemo() {
    const id = generation, frameRevision = revision;
    const capturedAt = performance.now();
    const makeFrame = demoFrame;
    try {
      const data = await makeFrame();
      if (id !== generation || frameRevision !== revision || preview.phase !== 'running') { data.bitmap.close(); return; }
      present({ ...data, id: ++frameSequence, capturedAt });
    } catch (error) {
      if (id !== generation || frameRevision !== revision || preview.phase !== 'running') return;
      invalidate();
      renderer.clear();
      status('error', `Demo error: ${error.message}`);
      report({ kind: 'unavailable', reason: error.message });
    }
  }

  function resume() {
    revision += 1;
    preview.edit = null;
    status('running');
    redraw();
    if (preview.source === 'camera') schedule(resources);
    else captureDemo();
  }

  return {
    start, stop,
    async startDemo(makeFrame) {
      stop();
      preview.source = 'demo';
      demoFrame = makeFrame;
      status('running', 'Simulated tracking');
      await captureDemo();
    },
    get state() { return preview.phase; },
    get editor() { return editorView(); },
    setFit(next) { preview.fit = next; redraw(); },
    setOcclusion(value) {
      if (occlusion === value) return;
      occlusion = value;
      revision += 1;
      renderer.setSegmentation(value);
      if (preview.source === 'demo' && preview.phase === 'running') captureDemo();
    },
    beginCalibration() {
      if (preview.phase !== 'running' || !preview.observation || !shoulderBasis(preview.observation.landmarks, preview.observation.frame)) return false;
      revision += 1;
      cancelCapture(resources);
      preview.edit = { draft: { ...preview.corrections } };
      status('editing');
      redraw();
      return true;
    },
    movePoint(id, target) {
      if (!preview.edit || !target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;
      const point = { x: Math.max(0, Math.min(1, target.x)), y: Math.max(0, Math.min(1, target.y)) };
      const observation = preview.observation;
      const correction = correctionForPoint(observation.landmarks, observation.frame, id, point);
      if (!correction) return false;
      const candidate = { ...preview.edit.draft, [id]: correction };
      if (Math.abs(correction.across) + Math.abs(correction.down) < 1e-10) delete candidate[id];
      const torso = fitTorso(correctedLandmarks(observation.landmarks, observation.frame, candidate), observation.frame, preview.fit);
      if (torso.kind !== 'torso') {
        preview.edit.reason = 'Keep the shoulders apart. This move cannot produce a valid fit.';
        onEditor(editorView());
        return false;
      }
      preview.edit.draft = candidate;
      preview.edit.reason = '';
      redraw();
      return true;
    },
    finishCalibration(apply) {
      if (!preview.edit) return;
      if (apply) preview.corrections = preview.edit.draft;
      resume();
    },
    resetCorrections() {
      if (preview.edit) { preview.edit.draft = {}; preview.edit.reason = ''; }
      else preview.corrections = {};
      redraw();
    },
  };
}
