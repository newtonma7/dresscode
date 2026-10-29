# Third-party assets

## Runtime dependencies

`package-lock.json` pins the dependency versions. MediaPipe Tasks Vision is Apache-2.0. Three.js and Vite are MIT. Their package distributions contain their license notices.

## Models

`scripts/setup-assets.mjs` downloads these versioned Google MediaPipe assets and verifies their SHA-256 checksums. Model files stay in the ignored `public/models/` directory.

- Pose Landmarker Lite, float16, version 1. Source is <https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task>. See the [pose task documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker).
- Selfie Multiclass Segmenter, 256 by 256, float32, version 1. Source is <https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite>. The [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf) lists Apache License 2.0. The model does not provide pixel-perfect masks. Low light, backlighting, fast motion, and occlusion reduce mask quality.

The [image segmenter documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter#models) defines zero-based category indices. They are background, hair, body skin, face skin, clothes, and accessories. The model card's appendix numbers the same list starting at one. The task API uses zero-based indices.

## Verification fixture

Automated browser checks may use Google's public [pose example photograph](https://storage.googleapis.com/mediapipe-assets/pose.jpg) as a fake camera input. This is a static sample, not a recording of the user. It is not bundled with the app and does not establish moving-video quality.
