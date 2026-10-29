# Latency and calibration verification

## Result

Frame processing is faster in the tested configuration. The median per-run post-message-to-next-animation-frame time fell from **592.35 ms to 57.80 ms**. This is a 90.2% reduction across five alternating runs per build, with occlusion enabled on both sides.

This measures processing after capture, not physical webcam-to-monitor latency. It is a configuration and pipeline comparison, not an algorithmic speedup or a sustained FPS claim. The original worker forces CPU inference. The updated worker selects the actual Radeon GPU, reduces segmentation output/readback size, avoids downsampled foreground RGB, and removes extra result-count smoothing.

## Builds and environment

- Original camera path is commit `0ac37ee`. The design-only baseline `c396114` has identical application code.
- Updated camera path is commit `0201fe8`.
- Both builds use Vite production output served from immutable local directories. No Vite client or hot reload is present in accepted runs.
- Hardware is AMD Ryzen 7 7730U, 16 logical CPUs, Ubuntu Wayland, with ANGLE reporting `AMD Radeon Graphics (radeonsi renoir ACO), OpenGL ES 3.2`.
- The browser is isolated headless Chrome with no real profile. It uses fake media, not the physical camera. Launch arguments enable the real GPU through `--enable-gpu --use-angle=gl --use-gl=angle` and use `--no-sandbox` because this Ubuntu environment blocks the automation sandbox. These settings are for local testing, not installation instructions for the user's browser.
- Input is a 960 by 640, 15 FPS loop made from Google's public pose example photograph with a small simulated pan. Both sides use the same input and versions of the MediaPipe models. There is no user footage.
- The host reported 16 logical CPUs. Load averages were recorded before profiling and comparison. The comparison alternates original and updated runs so background desktop activity does not consistently favor one side.

## Method and checks

Each run restarts the preview, excludes four initial results, and records the next eight successful processed frames. Five original and five updated runs alternate in that order. The summary uses the median of each run's eight observations, then the median across the five runs.

The probe wraps the actual classic worker, calls the same actual models, and observes their results. It measures pose calls, segmentation submission, mask readback, total worker time, worker round trip, and the next main-thread animation-frame callback after the result's synchronous render. GPU submission-only time is not GPU completion time. A request is considered usable only when it returns 33 landmarks, confident shoulders, a nonempty mask containing the clothes category, no worker failures, and enabled occlusion. The actual renderer string must identify the AMD hardware.

All ten accepted runs passed those checks. Each contains eight recorded valid frames. Original masks contain 614400 bytes. Updated masks contain 43776 bytes and retain independent mask dimensions aligned to the source frame. The renderer builds low-resolution alpha and composites full-resolution source RGB, verified by browser pixel checks.

The raw results are in [latency-calibration-benchmark.json](latency-calibration-benchmark.json). Local probe and driver sources remain in `.audit/latency-probe.js`, `.audit/timing-worker.js`, and `.audit/benchmark-cell.js`. They run through the native browser tools. The local directories and raw command outputs are audit artifacts, not application dependencies.

| Processing metric | Original median | Updated median |
| --- | ---: | ---: |
| Next animation frame after worker send | 592.35 ms | 57.80 ms |
| Worker round trip | 523.90 ms | 49.85 ms |
| Pose method | 46.40 ms | 13.90 ms |
| Segmentation submission method | 476.35 ms | 2.60 ms |
| Mask completion/readback | 0.00 ms | 32.30 ms |

The five original run medians for the primary metric range from 586.35 to 593.50 ms. Updated run medians range from 57.20 to 61.75 ms. The difference is much larger than the observed run-to-run spread.

The original limit is CPU segmentation, followed by full-source-size foreground processing. The updated worker spends most of its remaining time waiting for GPU mask completion/readback. This explains why the GPU segmentation submission number alone looks unrealistically small. Pose, mask completion, and rendering still take time, so removing CPU segmentation does not remove the entire frame cost.

The previous eight-sample development profiles are exploratory evidence, not part of this comparison. Rejected attempts include a blob worker with invalid relative import paths, an array reset that replaced a captured probe array, a missing probe after a page/session transition, and inconsistent explicit idle settings that restarted a native browser. Those failures are not counted as successful runs. The accepted comparison uses fresh, verified browser sessions with consistent launch settings, immutable release pages, init-script instrumentation, and fail-fast command checks.

## Functional browser checks

The parent ran the real UI and actual model pipeline rather than relying only on the implementation owner's report.

- `npm test` passes 35 tests. The production build succeeds with the existing large-chunk advisory.
- `/test/renderer.html` passes 30 actual WebGL checks, including full-resolution foreground RGB, stale-mask clearing, torso-only redraw, and bitmap lifecycle.
- `/test/calibration.html` passes 18 shared session, editor, anatomical-label, and coordinate regression checks.
- On the actual demo page, a native mouse drag moved the left-shoulder handle by exactly 24 by 12 CSS pixels while the base image hash stayed unchanged. No camera stream existed.
- A Shift+right-arrow nudge moved right on the mirrored display by 7.975 CSS pixels, corresponding to ten source pixels at the current scale. Toggling mirror placed the handle at the reflected position without altering its source correction.
- Resizing from 1280 by 800 to 1000 by 700 preserved the corrected source point. The Width slider changed to 122% while editing. Cancel restored the original body point and retained the 122% width.
- Apply retained a shoulder correction when re-entering editing. Reset inside an edit cleared the draft. Cancel after that reset restored the committed correction. Reset outside editing cleared committed corrections without changing the fit slider.
- With the fake camera, the video clock advanced while the frozen base-image hash stayed unchanged. A keyboard correction kept the source image frozen. Apply resumed fresh source images and retained the correction.
- Stop during camera editing ended the track, cleared the video source, hid the editor, and discarded corrections.
- With occlusion disabled, actual GPU model output still tracks the torso and reports zero segmentation and mask-readback work.

Local screenshots are `.audit/calibration-demo-edit.png` and `.audit/calibration-camera-frozen.png`. Their native artifact verification reported saved files with no missing, pending, or unverified entries. Code review at `0201fe8` found no blocking lifecycle, correction-math, coordinate, or privacy defect. A focused follow-up at `2ee9014` corrects the demo's anatomical left/right labels without changing the camera processing path. The browser regression increases from 17 to 18 checks and passes after that fix. The published [demo screenshot](calibration-demo.png) contains only the authored synthetic person, not camera footage.

## Remaining limits

The comparison does not measure physical camera exposure, capture-driver buffering, or monitor display latency. It does not establish performance on a browser that falls back to CPU. The UI reports its selected delegate and per-stage processing times for that reason.

Corrections adjust garment fitting. They do not retrain MediaPipe or create detections for missing landmarks. Cloth realism, real bare-torso masking, side turns, sustained meeting-video performance, and virtual-camera output remain separate requirements in issue 2. No webcam recording or upload was added.
