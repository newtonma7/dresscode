import * as THREE from 'three';
import { garmentTopology as topology, garmentIndices, garmentRestPositions as rest, buildGarmentFrame } from './garment-shape.js';

function knitTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stitch = Math.sin(x * Math.PI / 2 + Math.sin(y * Math.PI / 4) * 0.65);
      const weft = Math.cos(y * Math.PI / 2);
      const value = Math.round(128 + stitch * 13 + weft * 7);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 14);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createTailoredGarment() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(topology.weights.length * 3);
  const colors = new Float32Array(positions.length);
  const uvs = new Float32Array(topology.weights.length * 2);
  const navy = new THREE.Color('#19334f');
  const rib = new THREE.Color('#10273e');
  const collarIds = new Set(topology.faces.filter((_, i) => topology.regions[i] === 'collar').flat());
  topology.weights.forEach((_, i) => {
    const collar = collarIds.has(i) ? 1 : 0;
    const color = navy.clone().lerp(rib, collar * 0.8);
    colors.set([color.r, color.g, color.b], i * 3);
    uvs.set([rest[i][0] * 0.7 + rest[i][2] * 0.2, rest[i][1] * 0.65], i * 2);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(garmentIndices);
  const bump = knitTexture();
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.94, metalness: 0,
    bumpMap: bump, bumpScale: 0.6, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  const seamMaterial = new THREE.LineBasicMaterial({ color: '#71869a', transparent: true, opacity: 0.3 });
  const seams = topology.seams.map((seam) => {
    const ids = seam.closed ? [...seam.ids, seam.ids[0]] : seam.ids;
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ids.length * 3), 3));
    const line = new THREE.Line(buffer, seamMaterial);
    line.frustumCulled = false;
    line.name = seam.name;
    group.add(line);
    return { ids, line };
  });

  return {
    object: group,
    update(torso, tailoring) {
      const frame = buildGarmentFrame(torso, tailoring);
      const points = frame.positions;
      material.bumpScale = torso.shoulderSpan * 0.0015;
      points.forEach((p, i) => positions.set(p, i * 3));
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      const normals = geometry.attributes.normal;
      for (const { ids, line } of seams) {
        const output = line.geometry.attributes.position;
        ids.forEach((id, i) => output.setXYZ(i,
          points[id][0] + normals.getX(id) * torso.shoulderSpan * 0.0015,
          points[id][1] + normals.getY(id) * torso.shoulderSpan * 0.0015,
          points[id][2] + normals.getZ(id) * torso.shoulderSpan * 0.0015));
        output.needsUpdate = true;
      }
      return frame;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      bump.dispose();
      seamMaterial.dispose();
      seams.forEach(({ line }) => line.geometry.dispose());
    },
  };
}
