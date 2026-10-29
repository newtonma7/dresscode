# Volumetric garment and tailoring verification

## Result and limits

The preview now uses a connected rounded garment with constructed shoulders, sleeves, cuff openings, collar, stable navy fabric detail, and seams. Quick fit, Tailoring, and Tracking remain independent. This is an authored feasibility preview, not cloth simulation or meeting-ready photorealism.

No moving user footage was supplied. Real-person drape, crossed-hand occlusion, sustained physical-camera behavior, and webcam-to-display latency remain unverified. The public pose fixture is a panning photograph, not moving human footage. No physical camera was opened during these checks.

## Artifact and design comparison

Source reviewed and measured is `9aa95965ff313ff7353635f473e908c9ec50dc82` against `4e7d5fd`. A later CSS-only repair, `3bdaaef`, keeps the preview visible beside desktop tailoring controls. Application JavaScript, HTML, and tests match the reviewed revision. Documentation and evidence commits do not change that source.

The parent inspected both real Three.js prototypes before selecting the welded cage. The [ring candidate](tailoring-ring-candidate.png) has volume and open sleeves but coarse shoulder transitions. The [welded candidate](tailoring-patch-candidate.png) has smoother shoulders, cuffs, and a folded collar. Raised arms and simultaneous tailoring minima/maxima were also inspected locally. [TAILORING_DESIGN.md](../TAILORING_DESIGN.md) records the scores, tradeoffs, and ownership contract.

The initial ring prototype failed at runtime despite building. Constructor and geometric repairs preceded its final comparison. The first integrated garment also passed coverage tests while shading inward. Independent review proved the inverted camera/front-facing mismatch. The final camera uses a source-to-world group reflection and a non-reflected projection, rather than brighter material hiding the defect.

[Final demo](tailoring-demo.png) and [scrolled Tailoring controls](tailoring-controls.png) show actual app output. These are synthetic-person screenshots. Each original native-browser capture reported zero missing, pending, or unverified artifacts and was visually inspected.

## Automated and native checks

- `npm test` passes all 49 Node tests. Coverage includes all 256 tailoring endpoint combinations, topology/openings, finite normals and bounds, fit composition, scoped resets, lifecycle, paired masks, and independent corrections.
- `npm run build` succeeds. The existing bundle-size advisory remains.
- Native Chrome `/test/renderer.html` passes 50 actual WebGL checks. These include source registration, front-facing/culling, front-versus-rear light pixels, sleeve-aware foreground, full-resolution RGB, stale masks, and bitmap cleanup.
- Native `/test/calibration.html` passes 22 checks after the renderer repairs. Frozen redraw, anatomical labels, mirror/letterbox transforms, apply/cancel/reset, and scoped garment resets remain covered.
- Real UI native keyboard actions reach all eight tailoring maxima while editing. Quick fit width reaches 122 percent and sleeve length 135 percent. The frozen base-image hash remains unchanged while an anatomical shoulder correction moves.
- Reset tailoring preserves Quick fit and corrections. Reset fit preserves Tailoring and corrections. Native Stop clears the image and editor while retaining garment preferences.
- At 1280 by 900, scrolling to Sleeve length originally put the stage top at minus 424 pixels. The CSS repair keeps the full stage visible at top 116 through bottom 716, alongside the slider and Stop. Checks at 1280 by 720 and 1000 by 600 also retain the stage and controls. At 390 by 844, preview layout stays non-sticky, Stop remains reachable, and there is no horizontal overflow.

The optimized sleeve raster initially mishandled a fully offscreen triangle. A browser module probe and regression both showed 177 covered mask pixels instead of zero. Rejecting empty clipped spans fixes it. Independent review subsequently checked 12,000 seeded triangles against a separate pixel-intersection oracle.

## Actual model smoke

A production build ran in isolated native Chrome with fake media and hardware GPU flags. The worker selected ANGLE AMD Radeon Graphics, radeonsi renoir ACO, OpenGL ES 3.2, and reached Torso tracked. The test did not reuse a real browser profile.

Native Adjust tracking froze the paired source while the video clock advanced. Changing sleeve length to 135 percent retained the exact frozen image. Apply resumed new tracked source images. Disabling occlusion produced zero segmentation submission and mask-readback diagnostics. Stop cleared the video source and editor. The physical camera was never requested.

`public/tracking-worker.js` is unchanged. Frame/mask pairing, accepted-bitmap renderer ownership, late-bitmap cleanup, GPU preference, reduced segmentation dimensions, and fixed raw calibration basis remain intact.

## Rendering cost

The final renderer diagnostic is faster than the original shallow renderer in this particular test. Median per-run redraw cost is **13.70 ms original to 6.20 ms final**. Five alternating release runs per side have median ranges 13.45 to 15.15 ms original and 5.90 to 6.25 ms final. These are renderer micro-measurements, not live camera latency or sustained FPS.

Both use the same native AMD browser, 960 by 640 synthetic source, 256 by 171 all-skin category mask, pose sequence, retained source, and default garment configuration. Each run excludes eight warmups and records 30 redraws, including CPU deformation/normals, foreground composition, and `gl.finish()` completion. All 300 recorded samples finish; all ten runs have zero GL errors and nonempty garment/foreground pixels. Final output has 149191 opaque garment pixels and 41384 foreground pixels, versus 135899 and 42620 originally. The garment is intentionally different, not missing work. Capture, inference, scheduling, physical camera, and display latency are excluded.

The host has 16 logical CPUs. Load average before accepted final comparisons was 0.72, 1.13, 2.07. Release entries were built with the same Vite/dependencies and served from separate immutable directories without a Vite client. Traced runs were separate and excluded from the comparison.

The first integrated renderer cost about 26 ms in an earlier five-pair diagnostic. A separate trace found Canvas `closePath` dominating its sleeve exclusion. Scanline byte-mask spans removed those thousands of paths. The original renderer also rebuilt arm-corridor work for each skin pixel; the final renderer computes corridors once per redraw. Final profiling leaves foreground category/corridor scanning, raster spans, and GPU completion as costs. The change does not remove the worker's mask-readback limit. Actual-model smoke confirms the full pipeline still operates, but it is not a controlled before/after end-to-end latency measurement.

[Raw accepted runs](tailoring-render-cost.json) and the [probe](render-cost-probe.js) are committed. The probe is an async browser expression importing `/src/render.js` and `/src/geometry.js`. Evaluate it on a development page for a diagnostic. For the recorded release method, expose the same expression as `window.runRenderCost` in a temporary Vite HTML entry, build each revision with `copyPublicDir: false`, serve the outputs separately, and alternate five calls per revision. Local build entries and separate trace files remain under `.audit/tailoring-*`.

## Independent review

Comment audits report zero findings. One retained comment documents Three.js's actual negative-determinant front-face handling and cites its installed implementation.

Independent reviewer `a03353deb8acca549` approved source `9aa9596` with no blockers after running all 49 tests, seeded raster checks, and actual Three projection/editor-transform probes. Independent user-flow verifier `a8d7d32972b6485cc` then posted [PASS+NOTES](https://github.com/newtonma7/dresscode/pull/5#issuecomment-6508822538) for exact head `0204f388d49c62bb4d8f724d2e4dc6e2db77a4be`, base `4e7d5fd`, and stable patch-id `63eac8fcdb11d85e61566d69b404d68db19840ac`. Its own build matched the production assets; it reran the UI, all tests, responsive CSS, and the trail audit with no additional flags. Review models share the configured GPT family; no cross-family review is claimed.

PR5 merged into main as `985643c686211af5ed1e1ff430b892cf68c0ce7c` under a service-enforced exact-head condition. The destination history and source tree matched the verified artifact. Merged main passed all 49 tests and build again. Its live port5173 preview also passed actual hardware-GPU inference, frozen tracking, collar adjustment, and Stop cleanup with fake media. No physical camera was opened. No automatic merge or queue request remains.
