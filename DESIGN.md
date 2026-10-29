# Local shirt preview design

## Problem

Test whether a tracked navy crew-neck can become a credible local meeting-camera effect on a Ryzen 7730U integrated GPU. This milestone is a feasibility preview, not a claim of meeting-ready realism. There is no existing code to integrate.

## Usage

Run `npm install && npm run assets && npm run dev`. Open the loopback URL, click Start camera, and adjust fit. Stop releases the camera. A camera-free demo verifies rendering without implying real tracking works.

## Shape

Use browser-local MediaPipe Tasks and Three.js. One session owns the camera, inference worker, and renderer. One frame in flight prevents an accumulating queue. Each inference result is paired with its source image. Runtime assets load from this machine. The dev server binds loopback.

The session is a state machine with stopped, starting, running, and error states. Stop during startup must invalidate pending acquisition and close late-arriving resources. A tracking result is either a valid torso or unavailable with a reason. Never reuse a shirt after loss. Pausing or ending capture clears the image rather than silently exposing raw video.

`createPreviewSession({video, renderer, onStatus, onTracking, onEditor})` owns camera/demo source state, the current raw observation, fit configuration, and committed/draft body-point corrections. Its operations start/stop a source, change fit/occlusion, and begin/move/apply/cancel/reset a frozen calibration. The renderer owns the retained source bitmap, GPU resources, and foreground compositing. The editor owns only pointer/focus UI state. There is no garment/plugin system.

The classic worker prefers a hardware WebGL GPU delegate with CPU fallback. Segmentation is conditional and uses a reduced aspect-preserving input. Paired source/pose/mask results remain mandatory. The detailed correction and processing design is in `LATENCY_CALIBRATION_DESIGN.md`; measured results are in `verification/latency-calibration.md`.

The garment is an authored shallow mesh with a crew-neck opening, sleeves, navy fabric texture, collar and seams. Shared pixel-space panel anchors keep body and sleeves connected. Anatomical arm pairs sort by image position before fitting. The old shoulder-slope yaw check was removed because it measured roll instead of turn angle. Side turns remain unsupported and are not reliably rejected. Pose is not a cloth simulation. Category segmentation plus arm landmarks estimates exposed-arm foreground; all torso skin must not be restored because bare torso is supported. Hair and face can appear in front. Person segmentation alone cannot distinguish arms from torso.

## Synthesis decision

Browser candidate is the base. It wins on runnable preview setup, permission UI, local assets, and lifecycle simplicity. Native output was written but its runner ended without a final response, so the artifact was read directly rather than treated as a successful run. Both candidates expose the same realism risk. Native candidate contributes sequence-matched frames and explicit unavailable tracking. Reject native Python packaging and direct V4L2 capture for this milestone. Against the five criteria in `/tmp/dresscode-design-rubric.md`, browser scores 5, 4, 4, 5, 3 and native scores 3, 4, 5, 4, 5. Native has a shorter eventual virtual-camera path, but preview setup is the immediate gate. Cross-family judge skipped because the configured panel maps to the same GPT family; independent different-model review will still run.

## Tradeoffs accepted

We accept browser dependency and image copies for a local preview without Python/Wayland window integration. We accept fixed garment shape and imperfect arm masks for a bounded experiment. Existing clothes outside the target silhouette remain visible. No reconstruction of loose clothes, no generative try-on, and no realistic drape guarantee.

## Implementation reconciliation

JavaScript modules avoid a TypeScript build layer for this small preview. There is one fixed garment, not a general garment API. No privileged system changes or virtual camera installation in this milestone.

The first E2E run at bee8b8f rejected the initial implementation. MediaPipe's loader falls back to dynamic import in a module worker, which Vite rejects for public WASM loader scripts. The supported replacement is a same-origin classic worker with MediaPipe's pinned IIFE bundle loaded by importScripts. Assets remain local and the single-frame ownership contract does not change. The garment owner is replacing the discontinuous grid mapping and mismatched collar with connected garment geometry. These changes are driven by actual runtime failures, tracked in GitHub issue 1.

## Open risks

Actual webcam quality, sustained performance, body-fit reliability, and hand-over-torso occlusion need real footage. Automated demo and blank-camera checks cannot settle these questions. No real webcam footage is stored without a deliberate user action.
