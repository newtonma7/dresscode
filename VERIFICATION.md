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

Implementation and browser verification are pending.
