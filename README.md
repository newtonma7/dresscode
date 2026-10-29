# Dresscode Studio

A local feasibility preview for a navy crew-neck overlay. It is a fit sketch, not a meeting-ready effect or virtual camera. Camera frames stay in the browser and are not recorded or uploaded. The app binds Vite to loopback.

## Quick start

```sh
npm install
npm run assets
npm run dev
```

Open the loopback URL printed by Vite. Click **Try the camera-free demo** to check the rendering path without permission prompts or inference. Click **Start camera** to request a camera. The physical camera selector appears after permission is granted. **Stop** releases the camera and clears the preview. Hiding the tab or leaving the page also stops capture.

`npm run assets` copies the MediaPipe Tasks Vision 1.2.0 WASM runtime and classic worker bundle locally, then downloads the pose-landmarker-lite and selfie-multiclass models. Runtime requests use these local files. The classic worker runs both models with the CPU delegate. It handles one frame at a time and returns that image with its pose and category mask. There is no CDN runtime dependency, analytics, or webcam transport.

## What the preview does

The Three.js 0.186.1 garment is a fixed, shallow deformable mesh with a crew opening, collar, navy fabric texture and subtle surface folds. It fits the shoulder and hip landmarks. If hips are cropped, garment length falls back to shoulder span. Width, length and vertical position are adjustable. Mirror, overlay, and foreground segmentation can be toggled.

Tracking requires visible, approximately front-facing shoulders. A missing person or unsupported turned pose hides the entire image and garment with a reason. It does not silently show raw camera footage. The category labels used by the selfie multiclass model are 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes and 5 others, as documented in the [official MediaPipe Image Segmenter model guide](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter#models). Hair and face are preserved near the pose head point. Body-skin pixels are restored only inside pose-guided arm corridors beyond the virtual sleeve edge, so bare torso skin is not restored over the shirt or its sleeves.

## Limits

This is a feasibility experiment. The mesh is not cloth simulation and cannot reconstruct loose clothes or body shape. Landmark fit, segmentation, collar placement, sleeves and arm occlusion can be visibly wrong. Hand positions and loose sleeves are especially limited. Arm restoration starts beyond the sleeve edge, so an arm held across the shirt may disappear where the sleeve covers it. Face and hair preservation uses a coarse head region. Turning, moving quickly, partial visibility, varied lighting and different cameras need evaluation on real devices. CPU inference may be slow; the displayed inference time is per paired pose-plus-segmentation frame, not a promised frame rate. The demo uses a drawn synthetic person, synthetic landmarks and a synthetic mask. It does not exercise MediaPipe and is always labelled as simulated.

The UI intentionally does not expose camera video on failed or unavailable tracking. The raw/garment comparison is only available when a valid tracked frame is being rendered and the user explicitly switches the garment off. No code installs or provides a virtual camera.

## Checks

```sh
npm test
npm run build
```

Manual quality checks:

1. Open the app and verify the neutral preview does not request a camera.
2. Use the camera-free demo. Confirm the badge says simulated and no inference time is reported. Toggle the garment, segmentation and mirror controls, then adjust width, length and vertical fit.
3. Start a camera manually. Verify permission is requested only on click, a physical camera list appears after permission, and a front-facing torso produces the overlay and measured inference time.
4. Move out of frame or turn away. Confirm the shirt and image clear and a tracking reason appears rather than stale garment or raw video.
5. Stop, restart, and change cameras. Confirm the camera is released on Stop and when the tab becomes hidden.
6. Test on the target Ubuntu 26.04 Wayland / Ryzen 7730U system. The synthetic demo and automated tests do not establish real-camera fit, sustained inference speed, or meeting quality.
