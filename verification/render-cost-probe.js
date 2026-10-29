(async () => {
  const { createRenderer } = await import('/src/render.js');
  const { fitTorso } = await import('/src/geometry.js');
  const width = 960, height = 640;
  const canvas = () => Object.assign(document.createElement('canvas'), { width, height });
  const base = canvas(), garment = canvas(), foreground = canvas(), source = canvas();
  const ctx = source.getContext('2d');
  ctx.fillStyle = '#c99373';
  ctx.fillRect(0, 0, width, height);
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  for (const [id, x, y] of [[0,.5,.13],[11,.35,.30],[12,.65,.30],[13,.27,.53],[14,.73,.53],[15,.22,.80],[16,.78,.80],[23,.38,.86],[24,.62,.86]]) points[id] = { x, y, visibility: .99 };
  const renderer = createRenderer({ base, garment, foreground });
  const bitmap = await createImageBitmap(source);
  const mask = { width: 256, height: 171, data: new Uint8Array(256 * 171).fill(2) };
  const gl = garment.getContext('webgl2');
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const hardware = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const frame = { width, height };
  renderer.render({ bitmap, mask, torso: fitTorso(points, frame) });
  const samples = [];
  let errors = 0;
  try {
    for (let i = 0; i < 38; i++) {
      await new Promise(requestAnimationFrame);
      const shifted = points.map(p => ({ ...p, x: p.x + Math.sin(i * .3) * .01 }));
      const torso = fitTorso(shifted, frame);
      if (torso.kind !== 'torso') throw new Error('Invalid fitted torso');
      const start = performance.now();
      renderer.render({ torso });
      gl.finish();
      const elapsed = performance.now() - start;
      const error = gl.getError();
      if (error !== gl.NO_ERROR) errors++;
      if (i >= 8) samples.push(elapsed);
    }
    const sample = document.createElement('canvas');
    sample.width = width; sample.height = height;
    const sampleCtx = sample.getContext('2d');
    renderer.render({ torso: fitTorso(points, frame) });
    sampleCtx.drawImage(garment, 0, 0);
    const rgba = sampleCtx.getImageData(0, 0, width, height).data;
    let opaque = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 200) opaque++;
    const fore = foreground.getContext('2d').getImageData(0, 0, width, height).data;
    let foregroundPixels = 0;
    for (let i = 3; i < fore.length; i += 4) if (fore[i] > 200) foregroundPixels++;
    if (!opaque || !foregroundPixels || errors) throw new Error(`Work check failed: opaque=${opaque}, foreground=${foregroundPixels}, GL errors=${errors}`);
    const sorted = [...samples].sort((a,b)=>a-b);
    return { hardware, width, height, maskWidth: mask.width, maskHeight: mask.height, samples, medianMs: (sorted[14]+sorted[15])/2, minMs: sorted[0], maxMs: sorted.at(-1), errors, opaque, foregroundPixels, includes: 'retained-source draw, garment CPU deformation/normals, GL completion, foreground compositing', excludes: 'bitmap capture, inference, UI scheduling, physical camera/display latency' };
  } finally { renderer.dispose(); }
})()
