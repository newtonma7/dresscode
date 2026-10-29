import './style.css';
import { createRenderer } from './render.js';
import { createSession } from './session.js';
import { fitTorso } from './geometry.js';

const $ = (id) => document.getElementById(id);
const video = $('cameraVideo');
const stage = $('stage');
const renderer = createRenderer({ base: $('baseCanvas'), garment: $('garmentCanvas'), foreground: $('foregroundCanvas') });
const controls = { width: $('width'), length: $('length'), vertical: $('vertical') };
let session;
let demoTimer;
let demoActive = false;
let demoFrameInFlight = false;
let demoCanvas;
let demoMask;

function setFit() {
  const fit = { width: Number(controls.width.value) / 100, length: Number(controls.length.value) / 100, vertical: Number(controls.vertical.value) / 100 };
  $('widthValue').value = `${Math.round(fit.width * 100)}%`;
  $('lengthValue').value = `${Math.round(fit.length * 100)}%`;
  $('verticalValue').value = `${Number(controls.vertical.value) > 0 ? '+' : ''}${controls.vertical.value}`;
  session?.setFit(fit);
  if (demoActive) renderDemo();
}

function showStatus(state, detail = '') {
  const active = state === 'running';
  $('startButton').disabled = active || state === 'starting';
  $('stopButton').disabled = state === 'stopped' && !demoActive;
  $('statusText').textContent = detail || (state === 'starting' ? 'Starting' : state === 'running' ? 'Searching for pose' : state === 'error' ? 'Unavailable' : 'Stopped');
  $('trackingStatus').classList.toggle('active', active || demoActive);
  $('trackingStatus').classList.toggle('warning', state === 'error');
  if (state === 'running') refreshCameras();
  if (state === 'error') $('emptyState').hidden = false;
}

function showTracking({ torso, inferenceMs, mode }) {
  const valid = torso.kind === 'torso';
  $('trackingReason').hidden = valid;
  $('trackingReason').textContent = valid ? '' : torso.reason;
  $('statusText').textContent = demoActive ? 'Simulated tracking' : valid ? 'Torso tracked' : torso.reason;
  $('inferenceTime').textContent = mode === 'camera' && inferenceMs !== null ? `${Math.round(inferenceMs)} ms inference` : '';
  $('trackingStatus').classList.toggle('active', valid || demoActive);
  $('emptyState').hidden = valid || demoActive;
}

session = createSession({
  video, renderer, onStatus: ({ state, detail }) => showStatus(state, detail), onTracking: showTracking,
});

for (const input of Object.values(controls)) input.addEventListener('input', setFit);
$('garmentToggle').addEventListener('change', (event) => renderer.setEnabled(event.target.checked));
$('segmentationToggle').addEventListener('change', (event) => renderer.setSegmentation(event.target.checked));
$('mirrorToggle').addEventListener('change', (event) => stage.classList.toggle('mirrored', event.target.checked));
stage.classList.toggle('mirrored', $('mirrorToggle').checked);

async function refreshCameras() {
  const select = $('cameraSelect');
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    select.replaceChildren(new Option('Default camera', ''));
    cameras.forEach((camera, index) => select.add(new Option(camera.label || `Camera ${index + 1}`, camera.deviceId)));
    select.disabled = cameras.length === 0;
  } catch { select.disabled = true; }
}

$('startButton').addEventListener('click', async () => {
  stopDemo();
  $('emptyState').hidden = true;
  $('sourceLabel').textContent = 'Local camera';
  await session.start($('cameraSelect').value);
  if (session.state === 'running') await refreshCameras();
});
$('stopButton').addEventListener('click', () => { stopDemo(); session.stop(); $('sourceLabel').textContent = 'No camera active'; });
$('cameraSelect').addEventListener('change', async (event) => {
  if (session.state === 'running') await session.start(event.target.value);
});
$('demoButton').addEventListener('click', () => {
  session.stop();
  startDemo();
});

function buildDemo() {
  const width = 600;
  const height = 800;
  demoCanvas = document.createElement('canvas');
  demoCanvas.width = width; demoCanvas.height = height;
  const ctx = demoCanvas.getContext('2d');
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#a4a9a7'); background.addColorStop(1, '#555d62');
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#717a7d'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(235,237,226,.1)'; ctx.fillRect(24, 0, 9, height);
  const skin = ctx.createLinearGradient(150, 220, 480, 690);
  skin.addColorStop(0, '#b77e5f'); skin.addColorStop(.5, '#d59b79'); skin.addColorStop(1, '#a86f57');
  ctx.strokeStyle = skin; ctx.lineWidth = 88; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(192, 310); ctx.lineTo(146, 446); ctx.lineTo(124, 590); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(408, 310); ctx.lineTo(454, 446); ctx.lineTo(476, 590); ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(220, 260); ctx.lineTo(380, 260); ctx.lineTo(424, 360); ctx.lineTo(402, 660); ctx.lineTo(198, 660); ctx.lineTo(176, 360); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c99373'; ctx.fillRect(265, 205, 70, 82);
  ctx.fillStyle = '#5b3b2e'; ctx.beginPath(); ctx.ellipse(300, 147, 71, 87, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c99373'; ctx.beginPath(); ctx.ellipse(300, 157, 53, 69, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b3b2e'; ctx.beginPath(); ctx.arc(300, 122, 57, Math.PI, Math.PI * 2); ctx.lineTo(357, 155); ctx.quadraticCurveTo(340, 120, 300, 132); ctx.quadraticCurveTo(262, 121, 244, 155); ctx.closePath(); ctx.fill();
  demoMask = new Uint8Array(width * height);
  const category = (x, y, cx, cy, rx, ry, value) => {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) demoMask[y * width + x] = value;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    category(x, y, 300, 157, 54, 70, 3);
    category(x, y, 300, 115, 60, 39, 1);
    category(x, y, 296, 461, 106, 204, 2);
    category(x, y, 155, 465, 39, 175, 2);
    category(x, y, 445, 465, 39, 175, 2);
  }
}

const demoLandmarks = () => {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const set = (index, x, y) => { points[index] = { x, y, visibility: 0.98 }; };
  set(0, .5, .17); set(11, .32, .32); set(12, .68, .32);
  set(13, .24, .49); set(14, .76, .49); set(15, .21, .70); set(16, .79, .70);
  set(23, .35, .78); set(24, .65, .78);
  return points;
};

async function renderDemo() {
  if (!demoActive || demoFrameInFlight) return;
  demoFrameInFlight = true;
  try {
    const bitmap = await createImageBitmap(demoCanvas);
    if (!demoActive) { bitmap.close(); return; }
    const torso = fitTorso(demoLandmarks(), bitmap, {
      width: Number(controls.width.value) / 100,
      length: Number(controls.length.value) / 100,
      vertical: Number(controls.vertical.value) / 100,
    });
    showTracking({ torso, inferenceMs: null, mode: 'demo' });
    renderer.render({ bitmap, torso, mask: { data: demoMask, width: 600, height: 800 } });
  } catch (error) {
    $('statusText').textContent = `Demo error: ${error.message}`;
  } finally { demoFrameInFlight = false; }
}

function startDemo() {
  demoActive = true;
  if (!demoCanvas) buildDemo();
  $('sourceLabel').textContent = 'Synthetic person · not camera footage';
  $('demoBadge').hidden = false;
  $('emptyState').hidden = true;
  $('startButton').disabled = false;
  $('stopButton').disabled = false;
  $('trackingStatus').classList.add('active');
  $('statusText').textContent = 'Simulated tracking';
  renderDemo();
  demoTimer = window.setInterval(renderDemo, 160);
}

function stopDemo() {
  if (!demoActive) return;
  demoActive = false;
  clearInterval(demoTimer);
  $('demoBadge').hidden = true;
  if (session?.state === 'stopped') renderer.clear();
}

setFit();
$('stopButton').disabled = true;
$('emptyState').hidden = false;
window.addEventListener('pagehide', () => { stopDemo(); session.stop(); renderer.dispose(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopDemo(); session.stop(); $('sourceLabel').textContent = 'No camera active'; } });
