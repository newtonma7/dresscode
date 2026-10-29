# Faster paired frames and body-point calibration

## Goal and usage

Reduce camera processing delay without silently drawing new video against stale body points. Keep the shirt-fit sliders. Add Adjust tracking, drag shoulder/elbow/hip handles over a frozen frame, Apply and resume, Cancel, and Reset corrections. Demo supports the same workflow without requesting a camera. Corrections follow the body and remain memory-only.

## Evidence and decision

At0ac37ee the occlusion checkbox only changes compositing. Real fake-camera stage profiles show pose and segmentation execute even when it is off. The CPU segmentation stage dominates the worker. A prototype using the same models on an actual AMD Radeon WebGL context succeeds with33landmarks, valid category masks and no worker errors. GPU submission-only timings are not GPU completion timings; mask readback and total processing must also be measured. The initial blob-based timing probe and a later probe-array reset mistake are rejected measurement attempts, not successful samples.

Candidate A is the base. Retain one paired worker and one in-flight frame. Candidate B independently explored two actors and rejected the extra joins/queues because exact occlusion would still wait for segmentation. Graft its fixed raw-body basis, edit apply/cancel semantics, early worker-handler installation and config/reply identity. Reject moving bitmap ownership out of the renderer unless a concrete blocker requires it. The editor needs frame metadata and an immediate pose redraw, not direct bitmap ownership. Configured models share a GPT family; do not claim cross-family review.

## Data and ownership

- One PreviewSession owns source mode, camera/worker lifecycle, current observation metadata, fit configuration, correction registry, and edit transaction. Renderer alone owns its retained source bitmap and mask.
- Observation stores raw normalized anatomical landmarks, source dimensions, unique frame identity, captured time and inference timings. Corrected landmarks are derived copies, never edits to MediaPipe output.
- Corrections map anatomical IDs11,12,13,14,23,24 to across/down offsets in units of raw pixel shoulder span. Build axes from uncorrected usable shoulders, oriented screen-right/down. This basis must not change as handles move.
- Edit is idle or frozen with committed and draft corrections. Apply commits draft and resumes fresh processing. Cancel restores committed values. Reset clears corrections without changing fit sliders. Missing or low-confidence landmarks are disabled, not invented. Missing hips retain the current length fallback.
- Pose/mask/source remain from the same frame. Calibration pauses capture and freezes the retained image. Late in-flight replies are closed and cannot replace it. Apply/cancel reset smoothing. Stop, device change, track end and hidden tab cancel editing and release resources. Session and demo use one correction/presentation computation.

## Latency unit first

1. Wire occlusion intent into frame requests. If disabled, do not initialize or execute segmentation, return no mask and clear compositing immediately. A stale old mask must not be used when re-enabling.
2. Prefer GPU only when a worker WebGL probe identifies actual hardware and GPU task creation succeeds. Use independent OffscreenCanvas task contexts. Unsupported or software contexts fall back to CPU with truthful status, not silent startup failure. Release partial tasks on failed initialization.
3. Run segmentation on an aspect-preserving reduced image whose longest side is256pixels, matching the model's inherent resolution. Keep pose on the source bitmap. Return mask dimensions independently of source dimensions. This avoids upscaled mask readback and per-pixel compositing work. Validate category alignment in actual screenshots.
4. Foreground compositing builds an alpha-only mask at mask resolution. Draw it scaled into the foreground canvas, then source-in the full-resolution source image. Do not downsample and restore face/arm RGB pixels.
5. Return pose, segmentation-submit, mask-readback, total-worker and selected-delegate diagnostics. Session adds capture-to-render processing age. Label these as processing time, not physical webcam-to-monitor latency. Keep paired presentation and do not claim live raw video is a latency fix.
6. Install worker error/message listeners before awaiting video playback. Preserve current startup cancellation and stream cleanup tests.

## Calibration unit second

Pure calibration math and pointer transforms go in one small module. UI handles are anatomical, not geometry's sorted arm indices. Fit, shirt rendering and arm occlusion use the same corrected geometry. Main remains the UI shell. Move the existing synthetic demo source into a focused helper if needed so the same PreviewSession can present both sources without duplicated correction state.

Session may expose beginCalibration, movePoint, finishCalibration, resetCorrections and a read-only editor view. The editor owns selected/pointer UI state only, not another correction registry. Renderer accepts an immediate torso-only redraw over its retained bitmap. No generic source adapters or event bus.

Overlay handles use CSS image coordinates, not WebGL backing pixels. Compute the centered contained-image rectangle from stage bounds and source aspect ratio, exclude letterboxing, invert mirror for pointer-to-source mapping, and use the inverse transform for handle placement. Labels are not mirrored. Support pointer capture and cancellation, touch, Tab focus and arrow-key nudges. Resize/mirror recompute layout without changing stored corrections. Expose a visible frozen/camera-on state while editing. No localStorage footage or automatic recording.

## Gates

Latency and calibration are separate commits ending in tests/build and browser checks. Compare successful actual model results before/after under identical fake media, actual renderer and occlusion settings. Use at least5alternating repeats for a reported comparison; retain errors, stage timings and actual model-output checks. A fake-media measurement is not physical-camera or meeting-quality proof. Browser-test actual drags, keyboard, mirrored and letterboxed views, reset/apply/cancel, demo, stop during edit, stale replies and track loss. Independent final review precedes completion. User requested frequent commits and pushes.
