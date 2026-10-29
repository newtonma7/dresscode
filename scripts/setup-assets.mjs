import { mkdir, copyFile, readdir, rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const root = new URL('../', import.meta.url);
const wasm = new URL('public/wasm/', root);
await mkdir(wasm, { recursive: true });
const source = new URL('node_modules/@mediapipe/tasks-vision/wasm/', root);
for (const name of await readdir(source)) await copyFile(new URL(name, source), new URL(name, wasm));
const models = [
  ['pose.task', 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'],
  ['segmenter.tflite', 'image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'],
];
await mkdir(new URL('public/models/', root), { recursive: true });
for (const [name, remote] of models) {
  const target = new URL('public/models/' + name, root);
  const temporary = new URL(target.href + '.part');
  console.log('Downloading', name);
  try {
    const response = await fetch('https://storage.googleapis.com/mediapipe-models/' + remote);
    if (!response.ok || !response.body) throw new Error('Download failed: ' + response.status);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
console.log('Assets ready. Runtime loads only local assets.');
