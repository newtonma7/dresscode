import './style.css';
import { createRenderer } from './render.js';
import { createPreviewSession } from './session.js';
import { createDemoFrame } from './demo.js';
import { createTrackingEditor } from './tracking-editor.js';
import { TAILORING } from './tailoring.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const renderer = createRenderer({ base: $('baseCanvas'), garment: $('garmentCanvas'), foreground: $('foregroundCanvas') });
const controls = { width: $('width'), length: $('length'), vertical: $('vertical') };
let editor;

function showFit() {
  for (const [key, input] of Object.entries(controls)) {
    const value = Math.round(session.fit[key] * 100);
    input.value = value;
    const text = key === 'vertical' ? `${value > 0 ? '+' : ''}${value}% span` : `${value}%`;
    $(`${key}Value`).value = text;
    input.setAttribute('aria-valuetext', key === 'vertical' ? `${value} percent shoulder span` : `${value} percent`);
  }
}

function setFit() {
  session.setFit(Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, Number(input.value) / 100])));
  showFit();
}

const tailoringInputs = new Map();

function showTailoring() {
  for (const [key, { input, output }] of tailoringInputs) {
    const spec = TAILORING[key], value = session.tailoring[key];
    input.value = value;
    output.value = `${value}${spec.unit}`;
    input.setAttribute('aria-valuetext', `${value} ${spec.unit === '°' ? 'degrees' : spec.unit === '% span' ? 'percent shoulder span' : 'percent of style'}`);
  }
}

function createTailoringControls() {
  for (const [key, spec] of Object.entries(TAILORING)) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const label = document.createElement('label');
    const input = document.createElement('input');
    const output = document.createElement('output');
    input.id = `tailoring-${key}`;
    input.type = 'range';
    input.min = spec.min;
    input.max = spec.max;
    input.step = 1;
    input.setAttribute('aria-describedby', 'tailoringHelp');
    label.htmlFor = input.id;
    label.textContent = spec.label;
    output.setAttribute('aria-hidden', 'true');
    input.addEventListener('input', () => {
      session.setTailoring({ [key]: Number(input.value) });
      showTailoring();
    });
    row.append(label, output, input);
    $('tailoringControls').append(row);
    tailoringInputs.set(key, { input, output });
  }
  showTailoring();
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
$('resetFit').addEventListener('click', () => { session.resetFit(); showFit(); });
$('resetTailoring').addEventListener('click', () => { session.resetTailoring(); showTailoring(); });
createTailoringControls();
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

showFit();
editor.update(session.editor);
window.addEventListener('pagehide', () => { editor.dispose(); session.stop(); renderer.dispose(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) session.stop(); });
