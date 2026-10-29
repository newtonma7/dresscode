import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, BufferAttribute } from 'three';
import { fitTorso, buildArmCorridors, pointInArmCorridor } from '../src/geometry.js';
import { createCage, deformCage, garmentTopology, garmentIndices, buildGarmentFrame, pointInSleeve } from '../src/garment-shape.js';
import { TAILORING, defaultTailoring, tailoringSnapshot } from '../src/tailoring.js';
import { createTailoredGarment } from '../src/garment.js';

function torsoFor({ fit = { width: 1, length: 1, vertical: 0 }, roll = 0, raised = false, crossed = false, missing = false } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  for (const [id, x, y] of [[11, .3, .3], [12, .7, .3], [13, .2, .52], [14, .8, .52], [15, .16, .75], [16, .84, .75], [23, .35, .8], [24, .65, .8]]) points[id] = { x, y, visibility: 1 };
  if (raised) { points[13].y = points[14].y = .2; points[13].x = .08; points[14].x = .92; }
  if (crossed) { points[13].x = .55; points[14].x = .45; points[15].x = .7; points[16].x = .3; }
  if (missing) points[13].visibility = points[14].visibility = 0;
  for (const p of points) {
    const x = p.x - .5, y = p.y - .5;
    p.x = .5 + x * Math.cos(roll) - y * Math.sin(roll);
    p.y = .5 + x * Math.sin(roll) + y * Math.cos(roll);
  }
  return fitTorso(points, { width: 1000, height: 1000 }, fit);
}

function edgesOf(faces) {
  const edges = new Map();
  for (const face of faces) face.forEach((a, i) => {
    const b = face[(i + 1) % face.length];
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push([a, b]);
  });
  return edges;
}

test('connected cage and subdivided mesh have exactly neck, hem, and two cuff openings', () => {
  for (const shape of [createCage(), garmentTopology]) {
    const edges = edgesOf(shape.faces);
    const boundary = new Map();
    for (const visits of edges.values()) {
      assert.ok(visits.length <= 2, 'No non-manifold join');
      if (visits.length === 2) assert.equal(visits[0][0], visits[1][1], 'Shared edge winding');
      else {
        const [a, b] = visits[0];
        if (!boundary.has(a)) boundary.set(a, []);
        if (!boundary.has(b)) boundary.set(b, []);
        boundary.get(a).push(b); boundary.get(b).push(a);
      }
    }
    for (const neighbors of boundary.values()) assert.equal(neighbors.length, 2, 'Each opening is a simple loop');
    const remaining = new Set(boundary.keys());
    let loops = 0;
    while (remaining.size) {
      const pending = [remaining.values().next().value];
      while (pending.length) {
        const id = pending.pop();
        if (!remaining.delete(id)) continue;
        pending.push(...boundary.get(id));
      }
      loops++;
    }
    assert.equal(loops, 4);
    const count = shape.vertices?.length ?? shape.weights.length;
    assert.equal(count - edges.size + shape.faces.length, -2);
    const neighbors = Array.from({ length: count }, () => []);
    for (const face of shape.faces) for (const id of face) neighbors[id].push(...face);
    const seen = new Set(), pending = [0];
    while (pending.length) {
      const id = pending.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(...neighbors[id].filter((next) => !seen.has(next)));
    }
    assert.equal(seen.size, count, 'Torso, collar, shoulder and sleeves form one component');
  }
});

test('all control ranges and all 256 combined endpoints stay bounded with finite unit normals and noncollapsed triangles', () => {
  const geometry = new BufferGeometry();
  geometry.setIndex(garmentIndices);
  const cases = [];
  const specs = Object.entries(TAILORING);
  for (const [key, spec] of specs) for (let step = 0; step <= 4; step++) cases.push({ ...defaultTailoring(), [key]: spec.min + (spec.max - spec.min) * step / 4 });
  for (let bits = 0; bits < 256; bits++) cases.push(Object.fromEntries(specs.map(([key, spec], i) => [key, bits & (1 << i) ? spec.max : spec.min])));
  const indices = [...garmentIndices];
  cases.forEach((tailoring, i) => {
    const torso = torsoFor({ raised: i % 3 === 0, crossed: i % 3 === 1, roll: i % 2 ? .4 : -.4, missing: i % 7 === 0,
      fit: i % 2 ? { width: .82, length: 1.22, vertical: -.18 } : { width: 1.22, length: .82, vertical: .18 } });
    const frame = buildGarmentFrame(torso, tailoring);
    for (const p of frame.positions) {
      assert.ok(p.every(Number.isFinite));
      assert.ok(p[0] > -600 && p[0] < 1600 && p[1] > -600 && p[1] < 1600, 'Projected geometry stays near its body');
      assert.ok(Math.abs(p[2]) < torso.shoulderSpan * .5, 'Authored depth stays bounded');
    }
    for (let j = 0; j < garmentIndices.length; j += 3) {
      const [a, b, c] = garmentIndices.slice(j, j + 3).map((id) => frame.positions[id]);
      const u = b.map((n, axis) => n - a[axis]), v = c.map((n, axis) => n - a[axis]);
      assert.ok(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-5, `Nonzero triangle in case ${i}`);
    }
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(frame.positions.flat()), 3));
    geometry.computeVertexNormals();
    const normals = geometry.attributes.normal.array;
    for (let j = 0; j < normals.length; j += 3) assert.ok(Math.abs(Math.hypot(normals[j], normals[j + 1], normals[j + 2]) - 1) < 1e-5, 'Finite unit normal');
  });
  assert.deepEqual(garmentIndices, indices, 'Parameter changes retain vertex and triangle identity');
  geometry.dispose();
});

test('every tailoring field changes the surface and fit composes once about the shoulder origin', () => {
  const baseTorso = torsoFor();
  const base = buildGarmentFrame(baseTorso, defaultTailoring()).positions;
  for (const [key, spec] of Object.entries(TAILORING)) {
    const changed = buildGarmentFrame(baseTorso, { ...defaultTailoring(), [key]: spec.max }).positions;
    assert.ok(changed.some((p, i) => p.some((n, axis) => Math.abs(n - base[i][axis]) > .01)), key);
  }
  const tailoring = { ...defaultTailoring(), sleeveLength: 127, necklineDepth: 119 };
  const original = buildGarmentFrame(baseTorso, tailoring).positions;
  const fitted = buildGarmentFrame(torsoFor({ fit: { width: 1.12, length: 1.08, vertical: .07 } }), tailoring).positions;
  fitted.forEach((p, i) => {
    assert.ok(Math.abs(p[0] - (500 + (original[i][0] - 500) * 1.12)) < 1e-8);
    assert.ok(Math.abs(p[1] - (300 + (original[i][1] - 300) * 1.08 + 28)) < 1e-8);
    assert.ok(Math.abs(p[2] - original[i][2] * 1.12) < 1e-8);
  });
});

test('shoulder width leaves lower chest unchanged and collar stays attached', () => {
  const cage = createCage(), torso = torsoFor();
  const base = deformCage(cage, torso, defaultTailoring());
  const wide = deformCage(cage, torso, { ...defaultTailoring(), shoulderWidth: 115 });
  const chest = cage.vertices.findIndex((v) => v.kind === 'body' && v.column === 6 && v.row === 3);
  assert.deepEqual(wide[chest], base[chest]);
  const shoulder = cage.vertices.findIndex((v) => v.kind === 'shoulder' && v.x === 1);
  assert.ok(wide[shoulder][0] > base[shoulder][0]);
  for (const id of cage.neck) assert.ok(cage.faces.some((face, i) => cage.regions[i] === 'collar' && face.includes(id)), 'Collar uses actual body neck vertices');
});

test('actual cuff vertices and sleeve triangles determine tailored foreground under roll and crossed arms', () => {
  for (const options of [{}, { roll: .6 }, { crossed: true }, { raised: true }, { missing: true }]) {
    const torso = torsoFor(options);
    for (const sleeveLength of [75, 135]) for (const sleeveOpening of [75, 130]) {
      const frame = buildGarmentFrame(torso, { ...defaultTailoring(), sleeveLength, sleeveOpening });
      const corridors = buildArmCorridors(torso, frame.sleeves);
      frame.sleeves.forEach((sleeve, side) => {
        assert.deepEqual(sleeve.cuff, garmentTopology.cuffs[side].map((id) => frame.positions[id]));
        for (const triangle of sleeve.triangles.filter((_, i) => i % 97 === 0)) {
          const x = triangle.reduce((sum, p) => sum + p[0] / 3, 0), y = triangle.reduce((sum, p) => sum + p[1] / 3, 0);
          assert.equal(pointInSleeve(x, y, frame.sleeves), true, 'Visible sleeve triangles exclude restored skin');
        }
      });
      if (options.missing) assert.equal(corridors.length, 0, 'No invented exposed arm for missing elbows');
      else assert.equal(pointInArmCorridor(500, 400, corridors), false, 'Unrelated torso skin is not restored');
    }
  }
  const torso = torsoFor();
  const short = buildGarmentFrame(torso, { ...defaultTailoring(), sleeveLength: 75 });
  const long = buildGarmentFrame(torso, { ...defaultTailoring(), sleeveLength: 135 });
  assert.equal(pointInArmCorridor(230, 454, buildArmCorridors(torso, short.sleeves)), true);
  assert.equal(pointInArmCorridor(230, 454, buildArmCorridors(torso, long.sleeves)), false, 'Long sleeve moves the restoration start');
});

test('garment updates retain GPU buffers and rest UVs, use deterministic knit, and release every owned resource', () => {
  const shirt = createTailoredGarment(), other = createTailoredGarment();
  const mesh = shirt.object.children[0];
  const positions = mesh.geometry.attributes.position;
  const uvs = [...mesh.geometry.attributes.uv.array];
  const index = mesh.geometry.index;
  const topology = [...index.array];
  assert.deepEqual(mesh.material.bumpMap.image.data, other.object.children[0].material.bumpMap.image.data);
  shirt.update(torsoFor(), defaultTailoring());
  const normals = mesh.geometry.attributes.normal;
  const first = [...positions.array];
  const firstSeam = [...shirt.object.children[1].geometry.attributes.position.array];
  shirt.update(torsoFor({ raised: true, roll: .3 }), { ...defaultTailoring(), shoulderWidth: 115, sleeveLength: 135 });
  assert.equal(mesh.geometry.attributes.position, positions);
  assert.equal(mesh.geometry.attributes.normal, normals);
  assert.equal(mesh.geometry.index, index);
  assert.deepEqual([...mesh.geometry.index.array], topology);
  assert.deepEqual([...mesh.geometry.attributes.uv.array], uvs);
  assert.notDeepEqual([...positions.array], first);
  assert.notDeepEqual([...shirt.object.children[1].geometry.attributes.position.array], firstSeam);
  const resources = new Set(shirt.object.children.flatMap((child) => [child.geometry, child.material]));
  resources.add(mesh.material.bumpMap);
  const released = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => released.set(resource, (released.get(resource) ?? 0) + 1));
  shirt.dispose();
  assert.equal(released.size, resources.size);
  assert.ok([...released.values()].every((n) => n === 1));
  other.dispose();
});

test('tailoring boundary rejects unknown, nonfinite and out-of-range values without mutating snapshots', () => {
  const initial = defaultTailoring();
  for (const patch of [{ sleeveLength: NaN }, { unknown: 4 }, { sleeveLength: 136 }, { chestEase: -9 }]) assert.throws(() => tailoringSnapshot(initial, patch), RangeError);
  const next = tailoringSnapshot(initial, { sleeveLength: 120 });
  assert.equal(initial.sleeveLength, 100);
  assert.equal(next.sleeveLength, 120);
  assert.ok(Object.isFrozen(next));
});
