import { BODY_POINTS, containedRect, sourceToView, viewToSource } from './calibration.js';

export function createTrackingEditor({ session, stage, overlay, panel, mirror }) {
  let view = session.editor;
  let drag;
  const adjust = panel.querySelector('[data-action="adjust"]');
  const apply = panel.querySelector('[data-action="apply"]');
  const cancel = panel.querySelector('[data-action="cancel"]');
  const reset = panel.querySelector('[data-action="reset"]');
  const hint = panel.querySelector('[data-hint]');
  const handles = BODY_POINTS.map(({ id, name }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tracking-handle';
    button.dataset.point = id;
    button.setAttribute('aria-label', name);
    button.title = `${name}. Drag or use arrow keys. Shift moves ten pixels.`;
    const label = document.createElement('span');
    label.textContent = name;
    button.append(label);
    overlay.append(button);
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return;
      const point = view.points.find((point) => point.id === id);
      if (!point.enabled) return;
      const bounds = stage.getBoundingClientRect();
      const rect = containedRect({ left: bounds.left + stage.clientLeft, top: bounds.top + stage.clientTop, width: stage.clientWidth, height: stage.clientHeight }, view.frame);
      const pointerStart = viewToSource({ x: event.clientX, y: event.clientY }, rect, mirror());
      if (!pointerStart) return;
      drag = { id, pointerId: event.pointerId, button, start: { ...point.point }, pointerStart };
      button.setPointerCapture(event.pointerId);
      button.focus();
      event.preventDefault();
    });
    button.addEventListener('pointermove', (event) => {
      if (drag?.id !== id || drag.pointerId !== event.pointerId) return;
      const bounds = stage.getBoundingClientRect();
      const rect = containedRect({ left: bounds.left + stage.clientLeft, top: bounds.top + stage.clientTop, width: stage.clientWidth, height: stage.clientHeight }, view.frame);
      const point = viewToSource({ x: event.clientX, y: event.clientY }, rect, mirror());
      if (point) session.movePoint(id, {
        x: drag.start.x + point.x - drag.pointerStart.x,
        y: drag.start.y + point.y - drag.pointerStart.y,
      });
    });
    button.addEventListener('pointerup', (event) => endDrag(event, false));
    button.addEventListener('pointercancel', (event) => endDrag(event, true));
    button.addEventListener('lostpointercapture', (event) => endDrag(event, true));
    button.addEventListener('keydown', (event) => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!direction) return;
      event.preventDefault();
      const point = view.points.find((point) => point.id === id);
      const amount = event.shiftKey ? 10 : 1;
      session.movePoint(id, {
        x: point.point.x + direction[0] * (mirror() ? -1 : 1) * amount / view.frame.width,
        y: point.point.y + direction[1] * amount / view.frame.height,
      });
    });
    return button;
  });

  function endDrag(event, revert) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const previous = drag;
    drag = undefined;
    if (previous.button.hasPointerCapture(previous.pointerId)) previous.button.releasePointerCapture(previous.pointerId);
    if (revert && view.phase === 'editing') session.movePoint(previous.id, previous.start);
  }

  function layout() {
    if (view.phase !== 'editing' || !view.frame) return;
    const rect = containedRect({ left: 0, top: 0, width: stage.clientWidth, height: stage.clientHeight }, view.frame);
    handles.forEach((button, index) => {
      const { enabled, point } = view.points[index];
      button.disabled = !enabled;
      button.hidden = !enabled;
      if (!enabled) return;
      const position = sourceToView(point, rect, mirror());
      button.style.left = `${position.x}px`;
      button.style.top = `${position.y}px`;
      button.dataset.labelSide = position.x < 100 ? 'right' : position.x > stage.clientWidth - 100 ? 'left' : position.x < stage.clientWidth / 2 ? 'left' : 'right';
    });
  }

  function update(next) {
    view = next;
    const editing = view.phase === 'editing';
    if (!editing && drag) {
      const previous = drag;
      drag = undefined;
      if (previous.button.hasPointerCapture(previous.pointerId)) previous.button.releasePointerCapture(previous.pointerId);
    }
    overlay.hidden = !editing;
    adjust.hidden = editing;
    adjust.disabled = !view.canEdit || view.phase !== 'running';
    adjust.title = view.canEdit ? 'Freeze the displayed frame to correct body points' : view.reason;
    apply.hidden = cancel.hidden = !editing;
    reset.disabled = !view.hasCorrections && !view.editReason;
    const unavailable = view.points.filter((point) => !point.enabled).map((point) => point.name.toLowerCase());
    hint.textContent = editing
      ? `${view.editReason ? `${view.editReason} ` : ''}Frozen ${view.source === 'camera' ? 'frame. Camera stays on' : 'demo frame'}. Drag points or Tab to a point and use arrows. Escape cancels.${unavailable.length ? ` Unavailable: ${unavailable.join(', ')}.` : ''}`
      : view.canEdit ? 'Corrections follow this person. Reset corrections for another user. Fit sliders stay independent.' : view.reason;
    layout();
  }

  adjust.addEventListener('click', () => {
    if (session.beginCalibration()) handles.find((button) => !button.disabled)?.focus();
  });
  apply.addEventListener('click', () => { session.finishCalibration(true); adjust.focus(); });
  cancel.addEventListener('click', () => { session.finishCalibration(false); adjust.focus(); });
  reset.addEventListener('click', () => session.resetCorrections());
  const escape = (event) => {
    if (event.key === 'Escape' && view.phase === 'editing') {
      event.preventDefault();
      session.finishCalibration(false);
      adjust.focus();
    }
  };
  document.addEventListener('keydown', escape);
  const observer = new ResizeObserver(layout);
  observer.observe(stage);
  return { update, layout, dispose() { observer.disconnect(); document.removeEventListener('keydown', escape); } };
}
