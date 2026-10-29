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
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function fitTorso(landmarks, frame, fit = { width: 1, length: 1, vertical: 0 }) {
  const left = landmarks?.[POSE.leftShoulder];
  const right = landmarks?.[POSE.rightShoulder];
  if (!visible(left) || !visible(right)) return { kind: 'unavailable', reason: 'Shoulders not visible' };
  const shoulderSpan = Math.hypot(right.x - left.x, right.y - left.y);
  if (!Number.isFinite(shoulderSpan) || shoulderSpan < 0.035) return { kind: 'unavailable', reason: 'Turn toward the camera' };
  const yaw = Math.abs(right.x - left.x) / shoulderSpan;
  if (yaw < 0.72) return { kind: 'unavailable', reason: 'Turn toward the camera' };

  const leftHip = landmarks[POSE.leftHip];
  const rightHip = landmarks[POSE.rightHip];
  const hipsVisible = visible(leftHip) && visible(rightHip);
  const shoulderMid = midpoint(left, right);
  const hipMid = hipsVisible ? midpoint(leftHip, rightHip) : null;
  const naturalLength = hipsVisible
    ? Math.max(shoulderSpan * 1.08, hipMid.y - shoulderMid.y + shoulderSpan * 0.14)
    : shoulderSpan * 1.55;
  const width = shoulderSpan * 1.36 * fit.width;
  const height = naturalLength * fit.length;
  const centerY = shoulderMid.y + naturalLength * 0.44 + fit.vertical * shoulderSpan;
  const values = [shoulderMid.x, centerY, width, height, frame?.width, frame?.height];
  if (!values.every(Number.isFinite) || width <= 0 || height <= 0) return { kind: 'unavailable', reason: 'Body tracking unavailable' };
  return {
    kind: 'torso',
    center: { x: shoulderMid.x * frame.width, y: centerY * frame.height },
    width: width * frame.width,
    height: height * frame.height,
    shoulderSpan: shoulderSpan * frame.width,
    shoulders: [left, right].map(({ x, y }) => ({ x: x * frame.width, y: y * frame.height })),
    elbows: [POSE.leftElbow, POSE.rightElbow].map((index) => {
      const point = landmarks[index];
      return visible(point) ? { x: point.x * frame.width, y: point.y * frame.height } : null;
    }),
    wrists: [POSE.leftWrist, POSE.rightWrist].map((index) => {
      const point = landmarks[index];
      return visible(point) ? { x: point.x * frame.width, y: point.y * frame.height } : null;
    }),
    head: landmarks[0] && visible(landmarks[0])
      ? { x: landmarks[0].x * frame.width, y: landmarks[0].y * frame.height } : null,
    hipsVisible,
    yaw,
  };
}

export function pointInArmCorridor(x, y, torso, radius = 0.15) {
  if (torso.kind !== 'torso') return false;
  return torso.shoulders.some((shoulder, index) => {
    const elbow = torso.elbows[index];
    if (!elbow) return false;
    const segments = [
      { start: shoulder, end: elbow, minimum: 0.62 },
      { start: elbow, end: torso.wrists[index], minimum: 0 },
    ];
    return segments.some(({ start, end, minimum }) => {
      if (!end) return false;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length2 = dx * dx + dy * dy;
      if (length2 < 1) return false;
      const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / length2));
      const px = start.x + t * dx;
      const py = start.y + t * dy;
      return t >= minimum && Math.hypot(x - px, y - py) < torso.shoulderSpan * radius;
    });
  });
}

export function garmentPoint(torso, u, v) {
  const { center, width, height, shoulders, elbows } = torso;
  let y = center.y - height / 2 + v * height;
  const shoulderLineY = (shoulders[0].y + shoulders[1].y) / 2;
  const bodyStart = Math.max(0.22, Math.min(0.28, (shoulderLineY - (center.y - height / 2)) / height));
  const shoulderRatio = Math.max(0, Math.min(1, v / bodyStart));
  const bodyWidth = width * (v < bodyStart ? 0.45 + shoulderRatio * 0.05 : 0.5 + 0.08 * Math.sin(Math.min(1, v) * Math.PI));
  let x = center.x + (u - 0.5) * bodyWidth;
  const sleeveFade = Math.max(0, Math.min(1, (v - bodyStart) / 0.12));
  const sleeveWidth = width * 0.24 * (1 - sleeveFade);
  if (v < bodyStart) y += Math.max(0, 1 - Math.abs(u - 0.5) / 0.18) * (bodyStart - v) * height * 0.32;
  if (v < bodyStart && elbows[0] && elbows[1]) {
    const shoulderX = shoulders[u < 0.5 ? 0 : 1].x;
    const elbow = elbows[u < 0.5 ? 0 : 1];
    const edgeWeight = Math.max(0, Math.min(1, Math.abs(u - 0.5) * 4));
    const armVector = { x: elbow.x - shoulderX, y: elbow.y - shoulders[u < 0.5 ? 0 : 1].y };
    const armProgress = Math.max(0, Math.min(1, v / bodyStart));
    x += Math.sign(u - 0.5) * sleeveWidth * edgeWeight + armVector.x * armProgress * edgeWeight * 0.18;
    y += armVector.y * armProgress * edgeWeight * 0.18;
  }
  return { x, y };
}
