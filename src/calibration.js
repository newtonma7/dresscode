export const BODY_POINTS = Object.freeze([
  { id: 11, name: 'Left shoulder' }, { id: 12, name: 'Right shoulder' },
  { id: 13, name: 'Left elbow' }, { id: 14, name: 'Right elbow' },
  { id: 23, name: 'Left hip' }, { id: 24, name: 'Right hip' },
]);

export function usablePoint(point) {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Number.isFinite(point.visibility) && point.visibility > 0.25
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export function shoulderBasis(landmarks, frame) {
  if (!usablePoint(landmarks?.[11]) || !usablePoint(landmarks?.[12])) return null;
  const [a, b] = [landmarks[11], landmarks[12]].sort((a, b) => a.x - b.x);
  const dx = (b.x - a.x) * frame.width;
  const dy = (b.y - a.y) * frame.height;
  const span = Math.hypot(dx, dy);
  if (span < Math.min(frame.width, frame.height) * 0.035) return null;
  return { span, across: { x: dx / span, y: dy / span }, down: { x: -dy / span, y: dx / span } };
}

export function correctedLandmarks(landmarks, frame, corrections) {
  const basis = shoulderBasis(landmarks, frame);
  if (!basis) return null;
  const result = landmarks.map((point) => point ? { ...point } : point);
  for (const { id } of BODY_POINTS) {
    const point = landmarks[id];
    if (!usablePoint(point)) { result[id] = null; continue; }
    const offset = corrections[id];
    if (!offset) continue;
    result[id] = {
      ...point,
      x: point.x + basis.span * (basis.across.x * offset.across + basis.down.x * offset.down) / frame.width,
      y: point.y + basis.span * (basis.across.y * offset.across + basis.down.y * offset.down) / frame.height,
    };
  }
  return result;
}

export function correctionForPoint(landmarks, frame, id, target) {
  const basis = shoulderBasis(landmarks, frame);
  if (!basis || !BODY_POINTS.some((point) => point.id === id) || !usablePoint(landmarks[id])) return null;
  const dx = (target.x - landmarks[id].x) * frame.width;
  const dy = (target.y - landmarks[id].y) * frame.height;
  return {
    across: (dx * basis.across.x + dy * basis.across.y) / basis.span,
    down: (dx * basis.down.x + dy * basis.down.y) / basis.span,
  };
}

export function containedRect(bounds, frame) {
  const scale = Math.min(bounds.width / frame.width, bounds.height / frame.height);
  const width = frame.width * scale, height = frame.height * scale;
  return { left: bounds.left + (bounds.width - width) / 2, top: bounds.top + (bounds.height - height) / 2, width, height };
}

export function sourceToView(point, rect, mirrored) {
  return { x: rect.left + (mirrored ? 1 - point.x : point.x) * rect.width, y: rect.top + point.y * rect.height };
}

export function viewToSource(point, rect, mirrored) {
  const x = (point.x - rect.left) / rect.width, y = (point.y - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: mirrored ? 1 - x : x, y };
}
