import { mkdir, copyFile, readdir, rename, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const root = new URL('../', import.meta.url);
const wasm = new URL('public/wasm/', root);
await mkdir(wasm, { recursive: true });
const source = new URL('node_modules/@mediapipe/tasks-vision/wasm/', root);
for (const name of await readdir(source)) await copyFile(new URL(name, source), new URL(name, wasm));
const models = [
  ['pose.task', 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'],
  ['segmenter.tflite', 'image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite', 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0'],
];
await mkdir(new URL('public/models/', root), { recursive: true });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const [name, remote, sha256] of models) {
  const target = new URL('public/models/' + name, root);
  const existing = await readFile(target).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing && digest(existing) === sha256) {
    console.log('Verified', name);
    continue;
  }
  const temporary = new URL(target.href + '.part');
  console.log('Downloading', name);
  try {
    const response = await fetch('https://storage.googleapis.com/mediapipe-models/' + remote, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) throw new Error('Download failed: ' + response.status);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    if (digest(await readFile(temporary)) !== sha256) throw new Error('Model checksum mismatch: ' + name);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
console.log('Assets ready. Runtime loads only local assets.');
