# Volumetric crew-neck and independent tailoring

## Goal

Improve the navy crew-neck's construction and customization for a local Linux meeting preview. Keep Quick fit, Tailoring, and Tracking independent. This change is authored garment geometry, not cloth simulation, body reconstruction, reliable yaw tracking, or a meeting-quality claim.

## Usage and ownership

Keep existing Width, Length, and Vertical fit controls. Add a collapsible Tailoring group with shoulder width and slope, chest ease, sleeve length and opening, neckline width and depth, and collar thickness. Provide separate Quick fit and Tailoring resets. Tracking retains its existing body-point calibration and reset. Use style-relative percentages, shoulder-span percentages, and degrees. Do not imply physical measurements.

PreviewSession owns separate `fit`, `tailoring`, and correction records. `setFit`, `resetFit`, `setTailoring`, and `resetTailoring` change only the named record and redraw through the existing observation path. Calibration apply, cancel, and reset cannot change either garment record. Source changes keep existing garment preferences but clear corrections as before.

```js
session.setFit({ width: 1.08, length: 1, vertical: 0 });
session.setTailoring({ ...tailoring, sleeveLength: 120 });
session.resetTailoring();
// Width remains 108 percent. Body corrections remain unchanged.
```

Session passes renderer a read-only tailoring value with each normal or frozen redraw. Renderer retains that render snapshot, never a second independently mutable configuration registry.

```js
renderer.render({ bitmap, mask, torso, tailoring });
renderer.render({ torso, tailoring }); // Same retained source during calibration.
```

## Chosen shape

Use the welded authored cage from candidate `cf8c539c5eb4f4216ac7ec5f4311dabb50747719` as the base. One connected control cage joins front, back, rounded sides, shoulder bridges, sleeves, cuff lips, and a folded collar. Precompute subdivision weights and indices once. Each redraw deforms control points, evaluates retained vertex buffers, updates normals and attached seam lines, and derives projected sleeve coverage from that same result. Stable rest UVs and deterministic knit bump detail avoid animated texture noise.

Keep the production interface small. One pure garment-shape module may own cage construction, subdivision, source-pixel deformation, and sleeve coverage. A small garment renderer may own its Three.js mesh/material/seam buffers. A tailoring registry owns labels, defaults, ranges, and units so UI and validation cannot disagree. Do not copy the standalone study shell, wireframe, synthetic pose presets, or its public debug API into the app. Do not add a generic garment framework or new inference actor.

The existing fitted torso remains the authoritative corrected 2D body frame. Apply garment shaping in its across/down basis, including rolled shoulders and cropped-hip fallback. Fit width/length/vertical compose once, after local tailoring. Corrected shoulder-to-elbow directions guide sleeves. Authored depth is a fixed garment assumption, not an inferred body scan. Missing elbows retain conservative sleeve placement and suppress unsupported arm restoration.

The same deformed sleeve boundary must constrain exposed-arm restoration. Remove the independent rendered-reach and restoration-start constants. Preserve narrow distal arm corridors to avoid exposing bare torso, and exclude projected sleeve coverage before restoring skin. Keep hair/face behavior. No source pixels or segmentation masks belong to the geometry module.

## Comparison and synthesis

The parent inspected actual native-Chrome output from both candidates on the AMD Radeon context. Ring candidate `23e9efb8a2aacefc00e6ce81b14fa7a1ad9a46fb` became renderable only after fixing a startup shared-vertex failure, mutable sleeve centers, inward axes, topology, collar alignment, resize clearing, and roll axis. Its final front/oblique output remains coarse around the shoulder saddle with conspicuous horizontal bands and elongated sleeves. It is not the selected base.

The welded candidate shows smoother shoulder transitions, coherent front/back volume, open cuffs, a folded crew collar, and restrained seam detail. Raised-arm and simultaneous minimum/maximum tailoring presets remain visibly connected in the inspected views. These checks do not prove all self-intersections absent.

| Criterion, score out of 5 | Connected rings | Welded cage |
| --- | ---: | ---: |
| Garment form | 3 | 5 |
| Continuity | 3 | 4 |
| Parameter meaning | 4 | 5 |
| Maintainability | 3 | 4 |
| Render suitability | 3 | 4 |

Keep the welded candidate's fixed topology, rest UVs, folded collar, shared cuff indices, and precomputed deformation weights. Graft the repaired ring study's stronger bounds, manifold-boundary, collar-coincidence, and coupled-endpoint test ideas where applicable. Do not copy its coordinate-key welding or rebuild geometry per frame. Reject both prototypes' standalone UI and diagnostic cameras in production.

The configured candidate/judge models share the GPT family. Cross-family arena judging is unavailable and was skipped, not claimed. An independent source review remains mandatory before landing.

## Verification contract

Preserve source/pose/mask pairing, one-in-flight capture, accepted-bitmap renderer ownership, late-bitmap session cleanup, stop/hidden/device/track-end cleanup, GPU preference, conditional reduced-resolution segmentation, and calibration's fixed raw-body basis. Leave `public/tracking-worker.js` unchanged.

Run Node tests and build after each unit. Preserve renderer/session/calibration behavioral tests, replacing slab-specific assertions with equivalent coverage and connectivity checks. Add scoped reset/composition tests, all-control and combined-endpoint geometry checks, and tailored-sleeve foreground tests. Drive native-browser controls during frozen calibration, inspect real app output rather than only the standalone shape, and smoke the actual hardware-GPU model path using fake media. Check rendering cost without treating GPU submission time or synthetic FPS as live-camera latency. Independent review precedes source landing.

Local comparison evidence is in main checkout `.audit/tailoring-patch-{front,arms,min,max}.png`, `.audit/tailoring-ring-valid-{front,oblique}.png`, `.audit/tailoring-ground.md`, and `.audit/tailoring-rubric.md`. The failed ring images remain as rejected evidence. Verification artifacts will summarize integrated results separately.

## Tradeoffs and remaining risks

We accept authored volume and bounded controls instead of cloth physics. We accept conservative sleeve-aware arm restoration because multiclass segmentation cannot distinguish all torso and crossed-arm skin. We accept fixed navy material rather than wardrobe customization. Oblique screenshots demonstrate geometry depth, not supported live side turns.

Real moving user footage is unavailable. Meeting realism, hand-crossing occlusion, sustained real-camera behavior, and actual webcam-to-monitor latency remain unverified. Do not block all implementation on footage, but do not close those quality gates without it.

## Implementation reconciliation

Production now uses `src/garment-shape.js` for the welded cage, fixed subdivision weights, source-pixel deformation, and sleeve projections. `src/garment.js` owns retained GPU buffers, stable rest UVs, knit bump, navy material, and seam lines. `src/tailoring.js` is the only tailoring label/range/unit/default registry. The session owns frozen fit and tailoring values alongside the independent correction transaction. Legacy panel helpers and their renderer are removed.

The production adapter uses the fitted torso's natural height, corrected shoulder basis, and original corrected shoulder-to-elbow direction. It deforms in the natural frame, then applies width, length, and vertical fit once to the whole connected garment. Missing elbows keep conservative authored directions and disable that arm's restoration. No diagnostic study pose or yaw inference is used.

One authored proportion differs from the study. Front and back neckline depth match in production so the rear panel does not fill the visible crew opening under the source-pixel orthographic camera. The collar still shares its attachment vertices with the body.

The source-pixel mesh retains its reversed indices and outward local normals. Index reversal alone did not fix lighting. The former camera's Y-reflected projection classified those outward front panels as back faces, and `DoubleSide` then flipped their shading normals inward. The garment's Three.js root group now maps local Y-down source pixels into world Y-up with scale `(1, -1, 1)`. The orthographic camera uses top `0` and bottom `-height`, without a reflected projection. Three.js accounts for the group's negative world determinant when setting front-face winding. Normal matrices and attached seam offsets use the same transform. The key light is upper left in world coordinates, and the hemisphere sky is above the garment. Source bitmap, pure geometry, sleeve coverage, and foreground coordinates remain unchanged. These are projection adaptations, not tracking changes.

Foreground processing rasterizes the same final sleeve triangles once into conservative byte-mask scanline spans at segmentation-mask resolution. This replaces the initially expensive Canvas triangle-path union. Empty clipped spans are rejected before typed-array filling, so offscreen triangles cannot wrap across the mask. It computes distal arm corridors and cuff projections once before scanning category pixels. Any sleeve-covered mask pixel rejects body-skin restoration. Face and hair categories keep their original head-region rule. Full-resolution source RGB is composited only after the alpha mask is complete. No per-pixel triangle search runs in production.

The source controls occupy a sticky toolbar outside the growing settings rail. This keeps Stop reachable on short and mobile screens without clipping controls in a fixed page height. On desktop, the preview column also stays visible while the user scrolls to tailoring sliders. Its stage height fits the available viewport. Narrow layouts retain normal document flow. Quick fit stays exposed, Tailoring is a native accessible disclosure, and Tracking explicitly describes its separate body-point role. Sliders use actual label elements and value descriptions.

Parent verification passes 49 Node tests, the production build, 50 actual WebGL renderer checks, and 22 calibration browser checks. Native UI checks cover all eight sliders, scoped resets, frozen images, and responsive preview visibility. Actual hardware-GPU model smoke passes with paired source retention, apply/resume, occlusion-off inference, and Stop cleanup. Independent source review approved 9aa9596 without blockers after 12,000 seeded triangle-oracle checks and real Three projection/editor probes. The later CSS-only sticky-preview repair also passed the final independent user-flow check at exact PR head0204f38, including short desktop and narrow layouts. Comment review found no issues. See [verification/tailoring.md](verification/tailoring.md) for render-cost evidence and exact limits. Real moving footage and meeting quality remain unverified.
