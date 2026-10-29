import * as THREE from 'three';
import { garmentPoint, pointInArmCorridor } from './geometry.js';

function fabricTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#102b50';
  context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 3) {
    context.strokeStyle = i % 6 ? 'rgba(190,211,232,.045)' : 'rgba(0,8,25,.06)';
    context.beginPath();
    context.moveTo(i, 0); context.lineTo(i, 128);
    context.stroke();
  }
  for (let y = 0; y < 128; y += 8) {
    context.strokeStyle = 'rgba(190,211,232,.025)';
    context.beginPath(); context.moveTo(0, y); context.lineTo(128, y); context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  return texture;
}

export function createRenderer({ base, garment, foreground }) {
  const gl = new THREE.WebGLRenderer({ canvas: garment, alpha: true, antialias: true });
  gl.setPixelRatio(Math.min(devicePixelRatio, 2));
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe3efff, 0x101b2c, 2.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-0.4, -1, 2);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 100);
  camera.position.z = 30;

  const columns = 40;
  const rows = 40;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((columns + 1) * (rows + 1) * 2);
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const index = row * (columns + 1) + column;
      uvs[index * 2] = column / columns;
      uvs[index * 2 + 1] = row / rows;
      if (row < rows && column < columns) {
        const a = index; const b = index + 1; const c = index + columns + 1; const d = c + 1;
        const u = (column + 0.5) / columns;
        const v = (row + 0.5) / rows;
        const collarOpening = ((u - 0.5) / 0.13) ** 2 + ((v - 0.11) / 0.085) ** 2 < 1;
        if (!collarOpening) indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const shirt = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: fabricTexture(), color: '#d4e0ef', roughness: 0.86, metalness: 0,
    side: THREE.DoubleSide,
  }));
  scene.add(shirt);
  const collar = new THREE.Mesh(new THREE.RingGeometry(0.195, 0.225, 48), new THREE.MeshStandardMaterial({
    color: '#26476d', roughness: 0.8, side: THREE.DoubleSide,
  }));
  collar.position.z = 0.4;
  scene.add(collar);

  const baseContext = base.getContext('2d', { alpha: false });
  const foregroundContext = foreground.getContext('2d');
  const occlusionCanvas = document.createElement('canvas');
  const occlusionContext = occlusionCanvas.getContext('2d');
  let currentBitmap;
  let currentFrame;
  let currentMask;
  let currentTorso;
  let enabled = true;
  let segmentationEnabled = true;

  function resize(width, height) {
    for (const canvas of [base, garment, foreground]) {
      canvas.width = width; canvas.height = height;
      canvas.style.aspectRatio = `${width} / ${height}`;
    }
    gl.setSize(width, height, false);
    camera.left = 0; camera.right = width; camera.top = 0; camera.bottom = height;
    camera.updateProjectionMatrix();
  }

  function render(input) {
    if (input.bitmap) {
      currentBitmap?.close();
      currentBitmap = input.bitmap;
      currentFrame = { width: input.bitmap.width, height: input.bitmap.height };
      currentMask = input.mask;
      currentTorso = input.torso;
    }
    if (!currentBitmap || !currentTorso || currentTorso.kind !== 'torso') {
      clear();
      return;
    }
    const { width, height } = currentFrame;
    if (base.width !== width || base.height !== height) resize(width, height);
    baseContext.drawImage(currentBitmap, 0, 0, width, height);
    foregroundContext.clearRect(0, 0, width, height);
    if (enabled) {
      const position = geometry.attributes.position.array;
      for (let row = 0; row <= rows; row++) {
        for (let column = 0; column <= columns; column++) {
          const u = column / columns;
          const v = row / rows;
          const p = garmentPoint(currentTorso, u, v);
          const offset = (row * (columns + 1) + column) * 3;
          position[offset] = p.x;
          position[offset + 1] = p.y;
          position[offset + 2] = 0.02 + Math.sin(u * Math.PI * 5 + v * 8) * currentTorso.shoulderSpan * 0.012 * Math.sin(v * Math.PI);
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      const yTop = currentTorso.center.y - currentTorso.height / 2;
      const neckY = yTop + currentTorso.height * 0.145;
      collar.position.set(currentTorso.center.x, neckY, 0.4);
      const radius = currentTorso.shoulderSpan * 0.17;
      collar.scale.set(radius / 0.19, radius / 0.19, 1);
    }
    shirt.visible = enabled;
    collar.visible = enabled;
    gl.render(scene, camera);
    if (segmentationEnabled && currentMask?.data?.length && currentTorso) drawForeground(width, height);
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
    for (let y = 0; y < maskHeight; y += 1) {
      const frameY = (y + 0.5) * scaleY;
      for (let x = 0; x < maskWidth; x += 1) {
        const frameX = (x + 0.5) * scaleX;
        const category = currentMask.data[y * maskWidth + x];
        const head = currentTorso.head && Math.hypot(frameX - currentTorso.head.x, frameY - currentTorso.head.y) < currentTorso.shoulderSpan * 0.6;
        if ((category === 1 || category === 3) && head || category === 2 && pointInArmCorridor(frameX, frameY, currentTorso)) {
          const i = (y * maskWidth + x) * 4;
          rgba.data[i] = image.data[i]; rgba.data[i + 1] = image.data[i + 1];
          rgba.data[i + 2] = image.data[i + 2]; rgba.data[i + 3] = 255;
        }
      }
    }
    occlusionContext.putImageData(rgba, 0, 0);
    foregroundContext.drawImage(occlusionCanvas, 0, 0, width, height);
  }

  function clear() {
    currentBitmap?.close();
    currentBitmap = currentFrame = currentMask = currentTorso = undefined;
    baseContext.clearRect(0, 0, base.width, base.height);
    foregroundContext.clearRect(0, 0, foreground.width, foreground.height);
    gl.clear(true, true, true);
  }

  return {
    render,
    clear,
    setEnabled(value) { enabled = value; render(); },
    setSegmentation(value) { segmentationEnabled = value; render(); },
    dispose() { clear(); geometry.dispose(); shirt.material.map.dispose(); shirt.material.dispose(); collar.geometry.dispose(); collar.material.dispose(); gl.dispose(); },
  };
}
