import * as THREE from 'three';
import { buildArmCorridors, pointInArmCorridor } from './geometry.js';
import { createTailoredGarment } from './garment.js';
import { defaultTailoring } from './tailoring.js';
import { rasterizeSleeveUnion } from './sleeve-raster.js';

function canvasContext(canvas, options) {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Unable to create a 2D canvas context. Reload the preview or try a browser with canvas support.');
  return context;
}

export function createRenderer({ base, garment, foreground }) {
  const baseContext = canvasContext(base, { alpha: false });
  const foregroundContext = canvasContext(foreground);
  const occlusionCanvas = document.createElement('canvas');
  const occlusionContext = canvasContext(occlusionCanvas, { willReadFrequently: true });
  let gl;
  try {
    gl = new THREE.WebGLRenderer({ canvas: garment, alpha: true, antialias: true });
  } catch (cause) {
    throw new Error('Unable to start WebGL. Enable browser hardware acceleration and reload the preview.', { cause });
  }
  gl.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe3efff, 0x172438, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-0.4, 1, 2);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 2000);
  camera.position.z = 1000;
  const shirt = createTailoredGarment();
  scene.add(shirt.object);

  let currentBitmap;
  let currentFrame;
  let currentMask;
  let currentTorso;
  let currentTailoring = defaultTailoring();
  let garmentFrame;
  let enabled = true;
  let segmentationEnabled = true;
  let disposed = false;
  let renderWidth = 0;
  let renderHeight = 0;

  function resize(width, height) {
    for (const canvas of [base, foreground]) {
      canvas.width = width;
      canvas.height = height;
    }
    for (const canvas of [base, garment, foreground]) canvas.style.aspectRatio = `${width} / ${height}`;
    gl.setSize(width, height, false);
    camera.left = 0;
    camera.right = width;
    camera.top = 0;
    camera.bottom = -height;
    camera.updateProjectionMatrix();
    renderWidth = width;
    renderHeight = height;
  }

  function render(input = {}) {
    if (disposed) {
      input.bitmap?.close();
      return;
    }
    if (input.bitmap) {
      if (currentBitmap !== input.bitmap) currentBitmap?.close();
      currentBitmap = input.bitmap;
      currentFrame = { width: input.bitmap.width, height: input.bitmap.height };
      currentMask = input.mask;
      currentTorso = input.torso;
    }
    if (input.torso) currentTorso = input.torso;
    if (input.tailoring) currentTailoring = Object.freeze({ ...input.tailoring });
    if (!currentBitmap || (input.bitmap && currentTorso?.kind !== 'torso')) {
      clear();
      return;
    }
    const { width, height } = currentFrame;
    if (renderWidth !== width || renderHeight !== height) resize(width, height);
    baseContext.drawImage(currentBitmap, 0, 0, width, height);
    foregroundContext.clearRect(0, 0, width, height);
    if (currentTorso?.kind !== 'torso') { gl.clear(true, true, true); return; }
    shirt.object.visible = enabled;
    if (enabled) garmentFrame = shirt.update(currentTorso, currentTailoring);
    gl.render(scene, camera);
    if (enabled && segmentationEnabled && currentMask?.data?.length) drawForeground(width, height);
  }

  function drawForeground(width, height) {
    const maskWidth = currentMask.width;
    const maskHeight = currentMask.height;
    occlusionCanvas.width = maskWidth;
    occlusionCanvas.height = maskHeight;
    const scaleX = width / maskWidth;
    const scaleY = height / maskHeight;
    const corridors = buildArmCorridors(currentTorso, garmentFrame.sleeves);
    const sleeveCoverage = rasterizeSleeveUnion(garmentFrame.sleeves, maskWidth, maskHeight, width, height);
    const rgba = occlusionContext.getImageData(0, 0, maskWidth, maskHeight);
    for (let y = 0; y < maskHeight; y++) {
      const frameY = (y + 0.5) * scaleY;
      for (let x = 0; x < maskWidth; x++) {
        const frameX = (x + 0.5) * scaleX;
        const i = (y * maskWidth + x) * 4;
        const sleeveCovered = sleeveCoverage[y * maskWidth + x] !== 0;
        rgba.data[i + 3] = 0;
        const category = currentMask.data[y * maskWidth + x];
        const head = currentTorso.head && (frameX - currentTorso.head.x) ** 2 + (frameY - currentTorso.head.y) ** 2 < (currentTorso.shoulderSpan * 0.6) ** 2;
        if (((category === 1 || category === 3) && head)
          || (category === 2 && !sleeveCovered && pointInArmCorridor(frameX, frameY, corridors))) {
          rgba.data[i + 3] = 255;
        }
      }
    }
    occlusionContext.putImageData(rgba, 0, 0);
    foregroundContext.drawImage(occlusionCanvas, 0, 0, width, height);
    foregroundContext.globalCompositeOperation = 'source-in';
    foregroundContext.drawImage(currentBitmap, 0, 0, width, height);
    foregroundContext.globalCompositeOperation = 'source-over';
  }

  function clear() {
    if (disposed) return;
    currentBitmap?.close();
    currentBitmap = currentFrame = currentMask = currentTorso = garmentFrame = undefined;
    currentTailoring = defaultTailoring();
    baseContext.fillStyle = '#171b1e';
    baseContext.fillRect(0, 0, base.width, base.height);
    foregroundContext.clearRect(0, 0, foreground.width, foreground.height);
    occlusionContext.clearRect(0, 0, occlusionCanvas.width, occlusionCanvas.height);
    gl.clear(true, true, true);
  }

  return {
    render,
    clear,
    setEnabled(value) { enabled = value; render(); },
    setSegmentation(value) {
      segmentationEnabled = value;
      if (!value) currentMask = undefined;
      render();
    },
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      shirt.dispose();
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}
