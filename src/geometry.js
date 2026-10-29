export const POSE = Object.freeze({
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
});

const visible = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)
  && (point.visibility ?? 1) > 0.25;
const inFrame = (point) => visible(point) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function fitTorso(landmarks, frame, fit = { width: 1, length: 1, vertical: 0 }) {
  if (![frame?.width, frame?.height, fit.width, fit.length, fit.vertical].every(Number.isFinite)
    || frame.width <= 0 || frame.height <= 0 || fit.width <= 0 || fit.length <= 0) {
    return { kind: 'unavailable', reason: 'Body tracking unavailable' };
  }
  const pixel = (point) => visible(point) ? { x: point.x * frame.width, y: point.y * frame.height } : null;
  const arms = [
    [POSE.leftShoulder, POSE.leftElbow, POSE.leftWrist],
    [POSE.rightShoulder, POSE.rightElbow, POSE.rightWrist],
  ].map((indices) => indices.map((index) => pixel(landmarks?.[index])));
  if (arms.some(([shoulder]) => !shoulder)) return { kind: 'unavailable', reason: 'Shoulders not visible' };
  arms.sort((a, b) => a[0].x - b[0].x);
  const shoulders = arms.map(([shoulder]) => shoulder);
  const dx = shoulders[1].x - shoulders[0].x;
  const dy = shoulders[1].y - shoulders[0].y;
  const shoulderSpan = Math.hypot(dx, dy);
  if (shoulderSpan < Math.min(frame.width, frame.height) * 0.035) {
    return { kind: 'unavailable', reason: 'Shoulders too close to fit' };
  }
  const down = { x: -dy / shoulderSpan, y: dx / shoulderSpan };
  const shoulderMid = midpoint(...shoulders);
  const leftHip = landmarks[POSE.leftHip];
  const rightHip = landmarks[POSE.rightHip];
  const hipsVisible = inFrame(leftHip) && inFrame(rightHip);
  const hipMid = hipsVisible ? midpoint(pixel(leftHip), pixel(rightHip)) : null;
  const naturalLength = hipMid
    ? Math.max(shoulderSpan * 1.25,
      (hipMid.x - shoulderMid.x) * down.x + (hipMid.y - shoulderMid.y) * down.y + shoulderSpan * 0.18)
    : shoulderSpan * 1.55;
  const height = naturalLength * fit.length;
  const centerOffset = height / 2 + fit.vertical * shoulderSpan;
  return {
    kind: 'torso',
    center: { x: shoulderMid.x + down.x * centerOffset, y: shoulderMid.y + down.y * centerOffset },
    width: shoulderSpan * 1.14 * fit.width,
    height,
    shoulderSpan,
    naturalHeight: naturalLength,
    fit: { ...fit },
    shoulders,
    elbows: arms.map(([, elbow]) => elbow),
    wrists: arms.map(([, , wrist]) => wrist),
    head: pixel(landmarks[0]),
    hipsVisible,
  };
}

export function buildArmCorridors(torso, sleeves, radius = 0.15) {
  const corridors = [];
  torso.shoulders.forEach((shoulder, index) => {
    const elbow = torso.elbows[index];
    if (!elbow) return;
    const armLength = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
    if (armLength < 1) return;
    const cutoff = Math.max(...sleeves[index].cuff.map(([px, py]) =>
      ((px - shoulder.x) * (elbow.x - shoulder.x) + (py - shoulder.y) * (elbow.y - shoulder.y)) / armLength)) + torso.shoulderSpan * 0.015;
    for (const { start, end, offset, width } of [
      { start: shoulder, end: elbow, offset: 0, width: 0.65 },
      { start: elbow, end: torso.wrists[index], offset: armLength, width: 1 },
    ]) {
      if (!end) continue;
      const dx = end.x - start.x, dy = end.y - start.y;
      const length2 = dx * dx + dy * dy;
      const minimum = Math.max(0, (cutoff - offset) / Math.sqrt(length2));
      if (length2 < 1 || minimum > 1) continue;
      corridors.push({ x: start.x, y: start.y, dx, dy, length2, minimum, radius2: (torso.shoulderSpan * radius * width) ** 2 });
    }
  });
  return corridors;
}

export function pointInArmCorridor(x, y, corridors) {
  return corridors.some((c) => {
    const t = Math.max(0, Math.min(1, ((x - c.x) * c.dx + (y - c.y) * c.dy) / c.length2));
    return t >= c.minimum && (x - c.x - t * c.dx) ** 2 + (y - c.y - t * c.dy) ** 2 < c.radius2;
  });
}
