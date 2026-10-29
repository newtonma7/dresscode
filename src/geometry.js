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
    shoulders,
    elbows: arms.map(([, elbow]) => elbow),
    wrists: arms.map(([, , wrist]) => wrist),
    head: pixel(landmarks[0]),
    hipsVisible,
  };
}

export function pointInArmCorridor(x, y, torso, radius = 0.15) {
  if (torso.kind !== 'torso') return false;
  return torso.shoulders.some((shoulder, index) => {
    const elbow = torso.elbows[index];
    if (!elbow) return false;
    // Skin labels include the bare torso, so restore only a narrow distal upper arm.
    const segments = [
      { start: shoulder, end: elbow, minimum: 0.68, width: 0.65 },
      { start: elbow, end: torso.wrists[index], minimum: 0, width: 1 },
    ];
    return segments.some(({ start, end, minimum, width }) => {
      if (!end) return false;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length2 = dx * dx + dy * dy;
      if (length2 < 1) return false;
      const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / length2));
      const px = start.x + t * dx;
      const py = start.y + t * dy;
      return t >= minimum && Math.hypot(x - px, y - py) < torso.shoulderSpan * radius * width;
    });
  });
}

function garmentAxes(torso) {
  const [a, b] = torso.shoulders;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const across = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const down = { x: -across.y, y: across.x };
  const origin = { x: torso.center.x - down.x * torso.height / 2, y: torso.center.y - down.y * torso.height / 2 };
  return { across, down, origin };
}

export function garmentPoint(torso, u, v) {
  const { across, down, origin } = garmentAxes(torso);
  const topX = (u - 0.5) * torso.width;
  const neckHalf = torso.shoulderSpan * 0.18;
  const neck = Math.abs(topX) / neckHalf;
  const topY = neck <= 1
    ? torso.shoulderSpan * (-0.03 + 0.21 * Math.sqrt(Math.max(0, 1 - neck * neck)))
    : -torso.shoulderSpan * 0.03 * (torso.width / 2 - Math.abs(topX)) / (torso.width / 2 - neckHalf);
  const x = topX * (1 - 0.04 * v);
  const y = topY + (torso.height - topY) * v;
  return { x: origin.x + across.x * x + down.x * y, y: origin.y + across.y * x + down.y * y };
}

export function sleevePoint(torso, side, u, v) {
  const { across, down, origin } = garmentAxes(torso);
  const direction = side === 0 ? -1 : 1;
  const shoulder = torso.shoulders[side];
  const elbow = torso.elbows[side];
  const armX = elbow ? elbow.x - shoulder.x : (across.x * direction * 0.35 + down.x) * torso.shoulderSpan;
  const armY = elbow ? elbow.y - shoulder.y : (across.y * direction * 0.35 + down.y) * torso.shoulderSpan;
  const armLength = Math.hypot(armX, armY);
  const along = armLength > 1 ? { x: armX / armLength, y: armY / armLength } : down;
  const outward = { x: direction * along.y, y: -direction * along.x };
  const reach = Math.min(armLength * 0.58, torso.shoulderSpan * 0.55);
  const shift = { x: origin.x - (torso.shoulders[0].x + torso.shoulders[1].x) / 2,
    y: origin.y - (torso.shoulders[0].y + torso.shoulders[1].y) / 2 };
  const cuffRadius = torso.width * 0.15;
  const cuffX = shoulder.x + shift.x + along.x * reach + outward.x * torso.width * 0.025;
  const cuffY = shoulder.y + shift.y + along.y * reach + outward.y * torso.width * 0.025;
  const inner = garmentPoint(torso, side, v * Math.min(0.6, torso.shoulderSpan * 0.36 / torso.height));
  const outer = { x: cuffX + outward.x * cuffRadius * (1 - 2 * v), y: cuffY + outward.y * cuffRadius * (1 - 2 * v) };
  return { x: inner.x + (outer.x - inner.x) * u, y: inner.y + (outer.y - inner.y) * u };
}
