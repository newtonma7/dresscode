import './style.css';
import { createRenderer } from './render.js';
import { createPreviewSession } from './session.js';
import { createDemoFrame } from './demo.js';
import { createTrackingEditor } from './tracking-editor.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const renderer = createRenderer({ base: $('baseCanvas'), garment: $('garmentCanvas'), foreground: $('foregroundCanvas') });
const controls = { width: $('width'), length: $('length'), vertical: $('vertical') };
let editor;

function setFit() {
  const fit = { width: Number(controls.width.value) / 100, length: Number(controls.length.value) / 100, vertical: Number(controls.vertical.value) / 100 };
  $('widthValue').value = `${Math.round(fit.width * 100)}%`;
  $('lengthValue').value = `${Math.round(fit.length * 100)}%`;
  $('verticalValue').value = `${Number(controls.vertical.value) > 0 ? '+' : ''}${controls.vertical.value}`;
  session.setFit(fit);
}

function showStatus({ state, detail, source }) {
  const active = state === 'running' || state === 'editing';
  $('startButton').disabled = source === 'camera' && (active || state === 'starting');
  $('stopButton').disabled = state === 'stopped';
  $('statusText').textContent = detail || (state === 'starting' ? 'Starting' : state === 'error' ? 'Unavailable' : state === 'stopped' ? 'Stopped' : 'Searching for pose');
  $('trackingStatus').classList.toggle('active', active);
  $('trackingStatus').classList.toggle('warning', state === 'error');
  $('demoBadge').hidden = source !== 'demo';
  $('sourceLabel').textContent = state === 'stopped' || state === 'error' ? 'No camera active' : source === 'demo' ? 'Synthetic person · not camera footage' : 'Local camera';
  if (state === 'running' && source === 'camera') refreshCameras();
  if (state === 'error' || state === 'stopped') $('emptyState').hidden = false;
}

function showTracking({ torso, inferenceMs, processingMs, timings, delegate, delegateReason, hardware, mode, frozen }) {
  const valid = torso.kind === 'torso';
  $('trackingReason').hidden = valid;
  $('trackingReason').textContent = valid ? '' : torso.reason;
  $('statusText').textContent = frozen ? mode === 'camera' ? 'Frozen frame · camera on' : 'Frozen demo frame' : mode === 'demo' ? 'Simulated tracking' : valid ? 'Torso tracked' : torso.reason;
  $('inferenceTime').textContent = mode === 'camera' && inferenceMs != null ? `${Math.round(processingMs)} ms processing · ${delegate}` : '';
  $('inferenceTime').title = timings ? `Pose ${timings.poseMs.toFixed(1)} ms; segmentation submit ${timings.segmentSubmitMs.toFixed(1)} ms; mask readback ${timings.maskReadbackMs.toFixed(1)} ms; worker total ${timings.workerTotalMs.toFixed(1)} ms. ${delegateReason}. ${hardware}` : '';
  $('trackingStatus').classList.toggle('active', valid);
  $('emptyState').hidden = valid || frozen;
}

const session = createPreviewSession({
  video: $('cameraVideo'), renderer, onStatus: showStatus, onTracking: showTracking,
  onEditor: (view) => editor?.update(view),
});
editor = createTrackingEditor({ session, stage, overlay: $('trackingEditor'), panel: $('calibrationControls'), mirror: () => $('mirrorToggle').checked });

for (const input of Object.values(controls)) input.addEventListener('input', setFit);
$('garmentToggle').addEventListener('change', (event) => renderer.setEnabled(event.target.checked));
$('segmentationToggle').addEventListener('change', (event) => session.setOcclusion(event.target.checked));
$('mirrorToggle').addEventListener('change', (event) => {
  stage.classList.toggle('mirrored', event.target.checked);
  editor.layout();
});
stage.classList.toggle('mirrored', $('mirrorToggle').checked);

async function refreshCameras() {
  const select = $('cameraSelect');
  try {
    const selected = select.value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    select.replaceChildren(new Option('Default camera', ''));
    cameras.forEach((camera, index) => select.add(new Option(camera.label || `Camera ${index + 1}`, camera.deviceId)));
    select.value = cameras.some((camera) => camera.deviceId === selected) ? selected : '';
    select.disabled = cameras.length === 0;
  } catch { select.disabled = true; }
}

$('startButton').addEventListener('click', () => {
  $('emptyState').hidden = true;
  session.start($('cameraSelect').value);
});
$('stopButton').addEventListener('click', () => session.stop());
$('cameraSelect').addEventListener('change', (event) => {
  if (['running', 'editing', 'starting'].includes(session.state) && session.editor.source === 'camera') session.start(event.target.value);
});
$('demoButton').addEventListener('click', () => session.startDemo(createDemoFrame));

setFit();
editor.update(session.editor);
window.addEventListener('pagehide', () => { editor.dispose(); session.stop(); renderer.dispose(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) session.stop(); });
