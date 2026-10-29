# Preview verification

This file records observed checks, not a product-quality certification.

## Exit condition

A local page starts without requesting a camera. It renders the navy garment through a camera-free demo. An explicitly started fake camera initializes the actual local models. Stopping releases capture and clears the preview. Restart works. Build and behavioral tests pass. An independent reviewer inspects the implementation. The local server remains available for the user.

## Evidence to collect

- Build output and Node test results.
- Initial page and demo screenshots.
- Fake camera with no person. Expect no stale garment.
- Fake camera with a public pose photograph. Expect actual model inference rather than demo landmarks.
- Start, stop, restart, and stop during startup.
- Camera refusal or unavailable-device error.
- Runtime resource URLs. Expect local model and WASM requests only.
- Independent correctness review and follow-up checks for accepted findings.

## Limits of these checks

The fake camera tests do not establish physical-camera compatibility, sustained performance on the normal desktop browser, realistic fabric, or reliable hand occlusion. The public pose photograph is a static, full-body image. The demo has authored pose data. Neither represents moving, seated meeting footage.

A virtual camera is not part of this milestone. No kernel module is installed. No privileged command or remote publication is needed for the preview.

## Meeting-quality acceptance

A real moving-video review must cover bare torso and a fitted top separately. Check the neckline while speaking, shoulder motion, leaning, both side turns, crossed arms, hands at the collar, and hands in front of the chest. Repeat in normal desk light and backlighting. Existing collars, logos, and sleeves outside the replacement silhouette are a known failure case.

Reject footage with exposed torso holes, disconnected sleeves, arm-shaped cutouts, flickering edges, a collar floating above the body, or a shirt that slides independently of the torso. A successful static screenshot does not satisfy this review.

## Status

The first implementation at bee8b8f passed four Node tests and the production build. The build reported a 543 KB main-bundle advisory. Browser verification rejected that implementation.

Observed failures are tracked in [issue 1](https://github.com/newtonma7/dresscode/issues/1). The overlay toggle threw `Cannot read properties of undefined (reading 'bitmap')`. Starting a fake camera reached a Vite error loading the WASM script from a module worker. The demo screenshot showed disconnected shoulder geometry and a narrow torso panel. Independent lifecycle review also reproduced a stale frame after the current camera track ended.

Local baseline evidence is in `.audit/demo-full-before.png`, `.audit/initial.png`, and `.audit/vite.log`. These files are ignored by Git. No physical camera was opened.

## Repeat checks after repair

The integrated source at b0e6f76 passes all 14 Node tests and the production build. The actual browser page at `/test/renderer.html` reports `PASS 26 renderer checks`. It checks neck and sleeve pixels, bare-torso mask compositing, immediate toggles, stale-image clearing, bitmap cleanup, offscreen re-entry, and disposal. Results are saved in `.audit/renderer-regressions.json`. Tests use synthetic pixels.

The parent observed the following through native browser automation:

- Initial page has no active stream and requests no camera until Start.
- The synthetic demo renders a continuous navy shirt with an open crew neck and connected short sleeves. `.audit/demo-final-1280x720.png` records the 1280 by 720 view. The feasibility warning remains visible. Angular sleeves and shallow shading remain obvious.
- The real local pose and segmentation models return `Torso tracked` on a fake camera using Google's public pose photograph with simulated image movement. The production build also passes this check at `http://127.0.0.1:4173/`. See `.audit/production-inference-final.png`.
- Garment, segmentation, and mirror toggles work in the production page. The page error list is empty after clearing it before those checks.
- A fake color-bar camera returns `No person detected` with a neutral output rather than a stale shirt. See `.audit/no-person.png`.
- Stop ends the captured track and clears the video source. Restart reaches tracked output again. A synthetic track-ended event triggers a disconnect instruction, clears the preview, and stops the fake track. See `.audit/disconnect.png`.
- Opening another tab stops the active preview. Returning to the original tab leaves the stream cleared and reports `No camera active`.
- Chrome's actual denied-permission mode shows `Camera access was denied. Allow camera access for this site, then try again.` Both status and tracking retain the instruction and no stream remains. See `.audit/permission-denied-fixed.png`.
- Top-level network observations contained only loopback requests. Worker asset paths were also inspected in source. The browser's aggregate network list did not include all worker subrequests, so it is not a complete traffic audit.

An initial production check accidentally reached a leftover server owned by the original implementation worktree on port 4173. That check is rejected. The old owned process was stopped. The successful repeat used a server whose process working directory was `/home/newton/dev/dresscode` and whose worker URL returned JavaScript from the current build.

Automation used isolated headless Chrome with fake media, no real profile, and no credentials. Ubuntu blocked its sandbox, so the test browser used `--no-sandbox` for loopback testing. Its WebGL renderer was SwiftShader. These checks do not measure accelerated desktop performance on the Radeon GPU. No sustained frame-rate claim is made.

## Remaining gates

Independent code review found one additional P2 in uncaught worker error reporting. The parent reproduced `[object ErrorEvent]` with a genuinely faulting worker. The event boundary now retains its message. The production repeat displayed `Uncaught Error: Tracking worker boot failed. Run npm run assets.` in both status and tracking, released the stream, and reported no active camera. See `.audit/worker-error-before.png` and `.audit/worker-error-fixed.png`.

The final source at 5f62138 passes 16 Node tests and the production build. Normal production inference and Stop passed again after the final error fix. A fresh independent reviewer confirmed the original finding resolved with no new blocking defects. The independent trail audit confirmed the rejected baseline, rejected stale-server check, corrected production inference, and test counts. Its remaining flags are the unverified real-world requirements, incomplete worker traffic capture, and unreliable side-turn rejection. Review used a different configured model, gpt-6-luna, not a cross-family panel.

Five implementation and verification passes covered the initial preview, classic-worker lifecycle repair, permission-denial repair, garment and redraw repair, and final worker-error repair. The exit condition for the functional local preview is met. Meeting-quality realism and sustained performance remain NOT VERIFIED and are tracked in [issue 2](https://github.com/newtonma7/dresscode/issues/2). Virtual-camera output remains deferred. The build still reports a large-bundle advisory near 544 KB. No test fails because of that advisory.

The final comment review left a HOLD on the explanatory body-skin comment in `src/geometry.js`. Synthetic masks prove the compositor does not restore torso skin, but actual bare-torso model behavior is not yet verified. The comment is retained pending that evaluation.
