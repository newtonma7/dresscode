# Dresscode Studio

A local feasibility preview for a navy crew-neck overlay. It is a fit sketch, not a meeting-ready effect or virtual camera. Camera frames stay in the browser and are not recorded or uploaded. The app binds Vite to loopback.

## Quick start

Use Node.js 24 and a desktop browser with WebGL. This run used Chrome on Ubuntu. The app requests video only, never microphone access.

```sh
npm install
npm run assets
npm run dev
```

Open the loopback URL printed by Vite. Click **Try the camera-free demo** to check the rendering path without permission prompts or inference. Click **Start camera** to request a camera. The physical camera selector appears after permission is granted. **Stop** releases the camera and clears the preview. Hiding the tab or leaving the page also stops capture.

`npm run assets` copies the MediaPipe Tasks Vision 1.2.0 WASM runtime and classic worker bundle locally, then downloads the pose-landmarker-lite and selfie-multiclass models. Runtime requests use these local files. The classic worker prefers the GPU delegate only when WebGL identifies a hardware renderer. Software WebGL or failed GPU initialization falls back to CPU. It handles one frame at a time and returns that image with its pose and optional category mask. Disabling occlusion skips segmentation initialization and inference. Pose uses the source image; segmentation uses an aspect-preserving image with a longest edge of 256 pixels. The compositor scales mask alpha while preserving full-resolution source pixels. There is no CDN runtime dependency, analytics, or webcam transport.

## What the preview does

The Three.js 0.186.1 garment is a fixed, shallow deformable mesh with a crew opening, collar, navy fabric texture and subtle surface folds. It fits the shoulder and hip landmarks. If hips are cropped, garment length falls back to shoulder span. Width, length and vertical position are adjustable. Mirror, overlay, and foreground segmentation can be toggled.

Click **Adjust tracking** on a tracked camera or demo frame to freeze the displayed image. The camera stays on while editing. Drag the anatomical shoulder, elbow, or hip handles. You can also Tab to a handle and use arrow keys, or Shift+arrow for ten source pixels. Mirror changes the displayed direction, not anatomical names. Missing, low-confidence, and out-of-frame points cannot be edited. Both raw shoulders must be usable.

**Apply and resume** commits body-relative corrections for this person. **Cancel** or Escape restores the previously applied corrections. **Reset corrections** clears the current draft while editing, or the applied corrections otherwise. Fit sliders remain independent and redraw immediately, even on the frozen frame. Corrections can remain dormant during temporary tracking loss. Reset them for another user. Stop, camera changes, source changes, tab hiding, and disconnection clear corrections and cancel editing. Frames and offsets stay in memory only.

The fitting model assumes a frontal torso with visible shoulders. Missing or collapsed shoulder landmarks hide the entire image and garment with a reason. It does not reliably detect side turns, so a sideways pose can still produce a visibly wrong fit. It does not silently show raw camera footage. The category labels used by the selfie multiclass model are 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes and 5 others, as documented in the [official MediaPipe Image Segmenter model guide](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter#models). Hair and face are preserved near the pose head point. Body-skin pixels are restored only inside pose-guided arm corridors beyond the virtual sleeve edge, so bare torso skin is not restored over the shirt or its sleeves.

## Limits

This is a feasibility experiment. The mesh is not cloth simulation and cannot reconstruct loose clothes or body shape. Landmark fit, segmentation, collar placement, sleeves and arm occlusion can be visibly wrong. Hand positions and loose sleeves are especially limited. Arm restoration starts beyond the sleeve edge, so an arm held across the shirt may disappear where the sleeve covers it. Face and hair preservation uses a coarse head region. Turning, moving quickly, partial visibility, varied lighting and different cameras need evaluation on real devices. CPU processing may be slow. The displayed processing time runs from bitmap capture request through paired-frame rendering. It is not physical webcam-to-monitor latency or a promised frame rate. Hover over it for pose, segmentation submission, GPU mask readback, total worker time, and selected-delegate diagnostics. Submission time alone does not include GPU completion. Geometry uses the current observation without the previous fixed smoothing delay. The demo uses a drawn synthetic person, synthetic landmarks and a synthetic mask. It does not exercise MediaPipe and is always labelled as simulated.

The UI intentionally does not expose camera video on failed or unavailable tracking. The raw/garment comparison is only available when a valid tracked frame is being rendered and the user explicitly switches the garment off. No code installs or provides a virtual camera.

## Checks

```sh
npm test
npm run build
```

With the dev server running, open `/test/renderer.html`. Expect `PASS 30 renderer checks`. Open `/test/calibration.html` for session, editor, and coordinate-mapping browser checks. These browser checks cover actual WebGL output, toggles, bare-torso mask compositing, and bitmap cleanup. They use synthetic pixels, not real camera footage. See [verification results](VERIFICATION.md) for the unattended run and remaining quality gates.

Manual quality checks:

1. Open the app and verify the neutral preview does not request a camera.
2. Use the camera-free demo. Confirm the badge says simulated and no inference time is reported. Toggle the garment, segmentation and mirror controls, then adjust width, length and vertical fit.
3. Start a camera manually. Verify permission is requested only on click, a physical camera list appears after permission, and a front-facing torso produces the overlay and measured processing time and selected delegate.
4. Move out of frame. Confirm the shirt and image clear and a tracking reason appears rather than stale garment or raw video. Check side turns separately. They are unsupported and are not reliably rejected.
5. Stop, restart, and change cameras. Confirm the camera is released on Stop and when the tab becomes hidden.
6. Test on the target Ubuntu 26.04 Wayland / Ryzen 7730U system. The synthetic demo and automated tests do not establish real-camera fit, sustained inference speed, or meeting quality.
