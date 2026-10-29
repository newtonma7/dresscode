import { defaultTailoring } from './tailoring.js';

const rad = (degrees) => degrees * Math.PI / 180;
const mix = (a, b, t) => a + (b - a) * t;
const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

export function createCage() {
  const vertices = [];
  const faces = [];
  const regions = [];
  let region = 'body';
  const seams = [];
  const add = (shape) => { vertices.push(shape); return vertices.length - 1; };
  const quad = (...ids) => { faces.push(ids); regions.push(region); };
  const xs = [-1, -0.62, -0.3, 0, 0.3, 0.62, 1];
  const ys = [-1.25, -1.19, -0.65, 0.04, 0.52, 0.81, 1.12];
  const panels = [1, -1].map((front) => ys.map((y, row) => xs.map((x, column) => add({
    kind: 'body', x, y, row, column, front,
  }))));
  for (const [panelIndex, panel] of panels.entries()) {
    for (let row = 0; row < ys.length - 1; row++) {
      for (let col = 0; col < xs.length - 1; col++) {
        const ids = [panel[row][col], panel[row][col + 1], panel[row + 1][col + 1], panel[row + 1][col]];
        quad(...(panelIndex ? ids.reverse() : ids));
      }
    }
  }
  const [front, back] = panels;
  const sideMids = {};
  for (const col of [0, 6]) {
    const mids = ys.slice(0, 5).map((y, row) => add({ kind: 'side', side: col === 0 ? -1 : 1, y, row }));
    sideMids[col] = mids;
    for (let row = 0; row < 4; row++) {
      const strips = [
        [front[row][col], front[row + 1][col], mids[row + 1], mids[row]],
        [mids[row], mids[row + 1], back[row + 1][col], back[row][col]],
      ];
      for (const ids of strips) quad(...(col === 6 ? ids.reverse() : ids));
    }
  }
  const topMids = {};
  for (const columns of [[0, 1, 2], [4, 5, 6]]) {
    for (const col of columns) topMids[col] = add({ kind: 'shoulder', x: xs[col] });
    for (let i = 0; i < columns.length - 1; i++) {
      const a = columns[i];
      const b = columns[i + 1];
      quad(front[6][a], front[6][b], topMids[b], topMids[a]);
      quad(topMids[a], topMids[b], back[6][b], back[6][a]);
    }
    seams.push({ name: 'Shoulder seam', ids: columns.map((col) => topMids[col]), closed: false });
  }
  const cuffs = [];
  const roots = [];
  for (const col of [0, 6]) {
    const side = col === 0 ? -1 : 1;
    region = col === 0 ? 0 : 1;
    const root = [front[4][col], front[5][col], front[6][col], topMids[col],
      back[6][col], back[5][col], back[4][col], sideMids[col][4]];
    roots.push(root);
    let previous = root;
    for (const u of [0.22, 0.78, 0.94, 1, 0.985]) {
      const loop = root.map((rootId, cross) => add({ kind: 'sleeve', side, u, cross, rootId, lip: u === 0.985 }));
      for (let j = 0; j < 8; j++) {
        const next = (j + 1) % 8;
        const ids = [previous[j], previous[next], loop[next], loop[j]];
        quad(...(side === 1 ? ids.reverse() : ids));
      }
      if (u === 0.78 || u === 0.94) seams.push({ name: 'Cuff stitch', ids: loop, closed: true });
      if (u === 1) cuffs.push(loop);
      previous = loop;
    }
    seams.push({ name: 'Sleeve insertion seam', ids: root, closed: true });
  }
  region = 'collar';
  const neck = [front[6][2], front[6][3], front[6][4], topMids[4],
    back[6][4], back[6][3], back[6][2], topMids[2]];
  let previous = neck;
  for (const fold of [0.16, 0.82, 1, 1.04]) {
    const loop = neck.map((rootId) => add({ kind: 'collar', fold, rootId }));
    for (let j = 0; j < 8; j++) {
      const next = (j + 1) % 8;
      quad(previous[j], previous[next], loop[next], loop[j]);
    }
    previous = loop;
  }
  seams.push({ name: 'Neck attachment seam', ids: neck, closed: true });
  const hem = [...front[1], sideMids[6][1], ...back[1].toReversed(), sideMids[0][1]];
  seams.push({ name: 'Hem stitch', ids: hem, closed: true });
  return { vertices, faces, regions, seams, cuffs, roots, neck };
}

export function deformCage(cage, torso, t) {
  const shoulder = 0.7 * t.shoulderWidth / 100;
  const neck = 0.225 * t.necklineWidth / 100;
  const slope = Math.tan(rad(t.shoulderSlope));
  const topY = (x) => 1.14 - Math.max(0, Math.abs(x) - neck) * slope;
  const bodyX = (x, y) => {
    const a = Math.abs(x);
    const shoulderWeight = Math.max(0, Math.min(1, (y - 0.04) / 1.08));
    const width = mix(0.7 + t.chestEase * 0.007 / 1.14, shoulder + t.chestEase * 0.0035, shoulderWeight);
    return Math.sign(x) * (a <= 0.3 ? a / 0.3 * neck : neck + (a - 0.3) / 0.7 * (width - neck));
  };
  const [a, b] = torso.shoulders;
  const across = { x: (b.x - a.x) / torso.shoulderSpan, y: (b.y - a.y) / torso.shoulderSpan };
  const down = { x: -across.y, y: across.x };
  const origin = { x: torso.center.x - down.x * torso.height / 2, y: torso.center.y - down.y * torso.height / 2 };
  const scale = torso.shoulderSpan * 1.14 / 1.4;
  const naturalHeight = torso.naturalHeight;
  const local = [];
  for (const v of cage.vertices) {
    let p;
    if (v.kind === 'body') {
      const x = bodyX(v.x, v.y);
      const depth = (0.31 + t.chestEase * 0.0018) * (1 - 0.54 * Math.abs(v.x) ** 3);
      const taper = 1 - 0.04 * Math.exp(-(((v.y + 0.55) / 0.45) ** 2));
      let y = v.y;
      if (v.row === 6) {
        const neckWeight = Math.max(0, 1 - Math.abs(v.x) / 0.3);
        y = topY(x) - neckWeight * 0.23 * t.necklineDepth / 100;
      }
      if (v.row === 5) y = mix(0.52, topY(x), 0.55);
      p = [x * taper * scale, (1.14 - y) * naturalHeight / 2.39, v.front * depth * scale * (v.row === 0 ? 0.94 : 1)];
    } else if (v.kind === 'side') {
      p = [bodyX(v.side, v.y) * 1.035 * scale, (1.14 - v.y) * naturalHeight / 2.39, 0];
    } else if (v.kind === 'shoulder') {
      const x = bodyX(v.x, 1.12);
      p = [x * scale, (1.14 - topY(x) - 0.035) * naturalHeight / 2.39, 0];
    } else if (v.kind === 'sleeve') {
      const root = local[v.rootId];
      const side = v.side === -1 ? 0 : 1;
      const shoulderPoint = torso.shoulders[side];
      const elbow = torso.elbows[side];
      const dx = elbow ? elbow.x - shoulderPoint.x : (across.x * v.side * 0.35 + down.x) * torso.shoulderSpan;
      const dy = elbow ? elbow.y - shoulderPoint.y : (across.y * v.side * 0.35 + down.y) * torso.shoulderSpan;
      const length = Math.hypot(dx, dy);
      const along = length > 1 ? [(dx * across.x + dy * across.y) / length, (dx * down.x + dy * down.y) / length] : [0, 1];
      const outward = [v.side * along[1], -v.side * along[0]];
      const rootCenter = [bodyX(v.side, 1.12) * scale, (1.14 - mix(0.52, topY(bodyX(v.side, 1.12)), 0.5)) * naturalHeight / 2.39];
      const reach = Math.min(length * 0.58, torso.shoulderSpan * 0.55) * t.sleeveLength / 100;
      const cuffCenter = [rootCenter[0] + along[0] * reach, along[1] * reach + (1.14 - topY(bodyX(v.side, 1.12))) * naturalHeight / 2.39];
      const turn = Math.sin(v.u * Math.PI / 2);
      const radiusScale = mix(1, t.sleeveOpening / 100 * 0.89, v.u) * (v.lip ? 0.965 : 1);
      const radial = (rootCenter[1] - root[1]) * radiusScale;
      p = [
        mix(root[0], cuffCenter[0], turn) + outward[0] * radial * turn,
        mix(root[1], cuffCenter[1], turn) + outward[1] * radial * turn,
        root[2] * radiusScale * (1 + 0.14 * Math.sin(v.u * Math.PI)),
      ];
    } else {
      const root = local[v.rootId];
      const width = 0.055 * t.collarThickness / 100;
      const fold = Math.min(v.fold, 1);
      p = [root[0] * (1 - width / neck * fold),
        root[1] - (Math.sin(fold * Math.PI / 2) * 0.038 - Math.max(0, v.fold - 1) * 0.6) * t.collarThickness / 100 * naturalHeight / 2.39,
        root[2] * (1 - width / 0.31 * fold)];
    }
    local.push(p);
  }
  return local.map(([x, y, z]) => {
    x *= torso.fit.width;
    y *= torso.fit.length;
    return [origin.x + across.x * x + down.x * y, origin.y + across.y * x + down.y * y, z * torso.fit.width];
  });
}

function averageWeights(items) {
  const result = new Map();
  for (const [weights, factor] of items) {
    for (const [id, weight] of weights) result.set(id, (result.get(id) ?? 0) + weight * factor);
  }
  return result;
}

export function subdivide(cage, levels = 2) {
  let weights = cage.vertices.map((_, id) => new Map([[id, 1]]));
  let faces = cage.faces;
  let regions = cage.regions;
  let seams = cage.seams.map((s) => ({ ...s, ids: [...s.ids] }));
  let cuffs = cage.cuffs.map((ids) => [...ids]);
  for (let level = 0; level < levels; level++) {
    const edges = new Map();
    const touchingFaces = weights.map(() => []);
    const touchingEdges = weights.map(() => []);
    const faceWeights = faces.map((face, faceId) => {
      for (let j = 0; j < face.length; j++) {
        const a = face[j];
        const b = face[(j + 1) % face.length];
        const key = edgeKey(a, b);
        if (!edges.has(key)) {
          const edge = { a, b, faces: [], id: weights.length + edges.size };
          edges.set(key, edge);
          touchingEdges[a].push(edge);
          touchingEdges[b].push(edge);
        }
        edges.get(key).faces.push(faceId);
        touchingFaces[a].push(faceId);
      }
      return averageWeights(face.map((id) => [weights[id], 1 / face.length]));
    });
    const nextWeights = weights.map((w, id) => {
      const boundary = touchingEdges[id].filter((edge) => edge.faces.length === 1);
      if (boundary.length) {
        return averageWeights([[w, 0.75], ...boundary.map((e) => [weights[e.a === id ? e.b : e.a], 0.125])]);
      }
      const n = touchingFaces[id].length;
      const parts = [[w, (n - 3) / n]];
      for (const f of touchingFaces[id]) parts.push([faceWeights[f], 1 / n ** 2]);
      for (const e of touchingEdges[id]) {
        parts.push([weights[e.a], 1 / n ** 2], [weights[e.b], 1 / n ** 2]);
      }
      return averageWeights(parts);
    });
    for (const e of edges.values()) {
      const contributors = e.faces.length === 1
        ? [[weights[e.a], 0.5], [weights[e.b], 0.5]]
        : [[weights[e.a], 0.25], [weights[e.b], 0.25], ...e.faces.map((f) => [faceWeights[f], 0.25])];
      nextWeights.push(averageWeights(contributors));
    }
    const faceStart = nextWeights.length;
    nextWeights.push(...faceWeights);
    const nextFaces = [];
    faces.forEach((face, faceId) => face.forEach((id, j) => {
      const next = face[(j + 1) % face.length];
      const prev = face[(j + face.length - 1) % face.length];
      nextFaces.push([id, edges.get(edgeKey(id, next)).id, faceStart + faceId, edges.get(edgeKey(prev, id)).id]);
    }));
    const refinePath = (ids, closed) => ids.flatMap((id, j) => {
      if (!closed && j === ids.length - 1) return [id];
      return [id, edges.get(edgeKey(id, ids[(j + 1) % ids.length])).id];
    });
    seams = seams.map((s) => ({ ...s, ids: refinePath(s.ids, s.closed) }));
    cuffs = cuffs.map((ids) => refinePath(ids, true));
    regions = faces.flatMap((face, i) => face.map(() => regions[i]));
    weights = nextWeights;
    faces = nextFaces;
  }
  return { weights: weights.map((w) => [...w]), faces, regions, seams, cuffs };
}

export function evaluateSurface(topology, controlPositions) {
  return topology.weights.map((weights) => {
    const p = [0, 0, 0];
    for (const [id, weight] of weights) {
      for (let axis = 0; axis < 3; axis++) p[axis] += controlPositions[id][axis] * weight;
    }
    return p;
  });
}

const cage = createCage();
export const garmentTopology = subdivide(cage);
export const garmentIndices = garmentTopology.faces.flatMap(([a, b, c, d]) => [a, c, b, a, d, c]);
export const garmentRestPositions = evaluateSurface(garmentTopology, deformCage(cage, {
  shoulders: [{ x: -0.7, y: 0 }, { x: 0.7, y: 0 }], elbows: [null, null],
  shoulderSpan: 1.4, center: { x: 0, y: 1.195 }, height: 2.39, naturalHeight: 2.39,
  fit: { width: 1, length: 1, vertical: 0 },
}, defaultTailoring()));
const sleeveFaces = [0, 1].map((side) => garmentTopology.faces.filter((_, i) => garmentTopology.regions[i] === side));

export function buildGarmentFrame(torso, tailoring) {
  const positions = evaluateSurface(garmentTopology, deformCage(cage, torso, tailoring));
  const sleeves = garmentTopology.cuffs.map((ids, side) => ({
    side,
    cuff: ids.map((id) => positions[id]),
    triangles: sleeveFaces[side].flatMap(([a, b, c, d]) => [[positions[a], positions[b], positions[c]], [positions[a], positions[c], positions[d]]]),
  }));
  return { positions, sleeves };
}

export function pointInSleeve(x, y, sleeves) {
  return sleeves.some(({ triangles }) => triangles.some(([a, b, c]) => {
    const cross = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const ab = cross(a, b), bc = cross(b, c), ca = cross(c, a);
    return (ab >= 0 && bc >= 0 && ca >= 0 || ab <= 0 && bc <= 0 && ca <= 0)
      && Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 1e-8;
  }));
}
