import * as THREE from 'three';
import { garmentPoint, sleevePoint, pointInArmCorridor } from './geometry.js';

function canvasContext(canvas, options) {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Unable to create a 2D canvas context. Reload the preview or try a browser with canvas support.');
  return context;
}

function fabricTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvasContext(canvas);
  context.fillStyle = '#122b49';
  context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    context.strokeStyle = i % 4 ? 'rgba(190,211,232,.018)' : 'rgba(0,8,25,.025)';
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, 128);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

function clothPoint(torso, u, v, point = garmentPoint) {
  const p = point(torso, u, v);
  const roundness = Math.sin(u * Math.PI) * 0.008;
  const fold = Math.sin(u * Math.PI * 7 + v * 5) * Math.sin(v * Math.PI) * 0.0025;
  return { ...p, z: (roundness + fold) * torso.shoulderSpan };
}

export function createRenderer({ base, garment, foreground }) {
  const baseContext = canvasContext(base, { alpha: false });
  const foregroundContext = canvasContext(foreground);
  const occlusionCanvas = document.createElement('canvas');
  const occlusionContext = canvasContext(occlusionCanvas);
  const texture = fabricTexture();
  let gl;
  try {
    gl = new THREE.WebGLRenderer({ canvas: garment, alpha: true, antialias: true });
  } catch (cause) {
    texture.dispose();
    throw new Error('Unable to start WebGL. Enable browser hardware acceleration and reload the preview.', { cause });
  }
  gl.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe3efff, 0x101b2c, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-0.4, -1, 2);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 2000);
  camera.position.z = 1000;
  const fabric = new THREE.MeshStandardMaterial({
    map: texture, color: '#c0cad7', roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });
  const ribbing = new THREE.MeshStandardMaterial({
    color: '#102641', roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });
  const panels = [];

  function panel(columns, rows, point, material = fabric) {
    const geometry = new THREE.BufferGeometry();
    const count = (columns + 1) * (rows + 1);
    const uvs = new Float32Array(count * 2);
    const indices = [];
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const index = row * (columns + 1) + column;
        uvs[index * 2] = column / columns;
        uvs[index * 2 + 1] = row / rows;
        if (row < rows && column < columns) {
          const a = index;
          const b = a + 1;
          const c = a + columns + 1;
          indices.push(a, c, b, b, c, c + 1);
        }
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    panels.push({ mesh, columns, rows, point });
  }

  panel(64, 32, clothPoint);
  for (const side of [0, 1]) {
    const sleeve = (torso, u, v) => sleevePoint(torso, side, u, v);
    const surface = (torso, u, v) => clothPoint(torso, u, v, sleeve);
    panel(12, 12, surface);
    panel(12, 1, (torso, u, v) => {
      const p = surface(torso, 1 - v * 0.035, u);
      return { ...p, z: p.z + 0.1 };
    }, ribbing);
  }
  panel(64, 1, (torso, u, v) => {
    const p = clothPoint(torso, u, v * 0.012);
    return { ...p, z: p.z + 0.1 };
  }, ribbing);
  panel(32, 1, (torso, u, v) => {
    const p = clothPoint(torso, u, 1 - v * 0.008);
    return { ...p, z: p.z + 0.1 };
  }, ribbing);

  let currentBitmap;
  let currentFrame;
  let currentMask;
  let currentTorso;
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
    camera.bottom = height;
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
    if (!currentBitmap || currentTorso?.kind !== 'torso') {
      clear();
      return;
    }
    const { width, height } = currentFrame;
    if (renderWidth !== width || renderHeight !== height) resize(width, height);
    baseContext.drawImage(currentBitmap, 0, 0, width, height);
    foregroundContext.clearRect(0, 0, width, height);
    for (const { mesh, columns, rows, point } of panels) {
      mesh.visible = enabled;
      if (!enabled) continue;
      const positions = mesh.geometry.attributes.position;
      for (let row = 0; row <= rows; row++) {
        for (let column = 0; column <= columns; column++) {
          const p = point(currentTorso, column / columns, row / rows);
          positions.setXYZ(row * (columns + 1) + column, p.x, p.y, p.z);
        }
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    gl.render(scene, camera);
    if (enabled && segmentationEnabled && currentMask?.data?.length) drawForeground(width, height);
  }

  function drawForeground(width, height) {
    const maskWidth = currentMask.width;
    const maskHeight = currentMask.height;
    occlusionCanvas.width = maskWidth;
    occlusionCanvas.height = maskHeight;
    occlusionContext.drawImage(currentBitmap, 0, 0, maskWidth, maskHeight);
    const image = occlusionContext.getImageData(0, 0, maskWidth, maskHeight);
    const rgba = occlusionContext.createImageData(maskWidth, maskHeight);
    const scaleX = width / maskWidth;
    const scaleY = height / maskHeight;
    for (let y = 0; y < maskHeight; y++) {
      const frameY = (y + 0.5) * scaleY;
      for (let x = 0; x < maskWidth; x++) {
        const frameX = (x + 0.5) * scaleX;
        const category = currentMask.data[y * maskWidth + x];
        const head = currentTorso.head && Math.hypot(frameX - currentTorso.head.x, frameY - currentTorso.head.y) < currentTorso.shoulderSpan * 0.6;
        if (((category === 1 || category === 3) && head)
          || (category === 2 && pointInArmCorridor(frameX, frameY, currentTorso))) {
          const i = (y * maskWidth + x) * 4;
          rgba.data[i] = image.data[i];
          rgba.data[i + 1] = image.data[i + 1];
          rgba.data[i + 2] = image.data[i + 2];
          rgba.data[i + 3] = 255;
        }
      }
    }
    occlusionContext.putImageData(rgba, 0, 0);
    foregroundContext.drawImage(occlusionCanvas, 0, 0, width, height);
  }

  function clear() {
    if (disposed) return;
    currentBitmap?.close();
    currentBitmap = currentFrame = currentMask = currentTorso = undefined;
    baseContext.fillStyle = '#171b1e';
    baseContext.fillRect(0, 0, base.width, base.height);
    foregroundContext.clearRect(0, 0, foreground.width, foreground.height);
    gl.clear(true, true, true);
  }

  return {
    render,
    clear,
    setEnabled(value) { enabled = value; render(); },
    setSegmentation(value) { segmentationEnabled = value; render(); },
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      for (const { mesh } of panels) mesh.geometry.dispose();
      texture.dispose();
      fabric.dispose();
      ribbing.dispose();
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}
