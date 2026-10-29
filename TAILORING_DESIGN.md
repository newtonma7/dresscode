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

No production source has changed at this checkpoint. A single isolated implementation owner will adapt the chosen shape and configuration contract. Record accepted contract deviations here before handing the next unit to another owner.
