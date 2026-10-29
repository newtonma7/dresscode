let demoCanvas;
let demoMask;

function buildDemo() {
  const width = 600;
  const height = 800;
  demoCanvas = document.createElement('canvas');
  demoCanvas.width = width; demoCanvas.height = height;
  const ctx = demoCanvas.getContext('2d');
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#a4a9a7'); background.addColorStop(1, '#555d62');
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#717a7d'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(235,237,226,.1)'; ctx.fillRect(24, 0, 9, height);
  const skin = ctx.createLinearGradient(150, 220, 480, 690);
  skin.addColorStop(0, '#b77e5f'); skin.addColorStop(.5, '#d59b79'); skin.addColorStop(1, '#a86f57');
  ctx.strokeStyle = skin; ctx.lineWidth = 88; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(192, 310); ctx.lineTo(146, 446); ctx.lineTo(124, 590); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(408, 310); ctx.lineTo(454, 446); ctx.lineTo(476, 590); ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.moveTo(220, 260); ctx.lineTo(380, 260); ctx.lineTo(424, 360); ctx.lineTo(402, 660); ctx.lineTo(198, 660); ctx.lineTo(176, 360); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c99373'; ctx.fillRect(265, 205, 70, 82);
  ctx.fillStyle = '#5b3b2e'; ctx.beginPath(); ctx.ellipse(300, 147, 71, 87, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c99373'; ctx.beginPath(); ctx.ellipse(300, 157, 53, 69, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b3b2e'; ctx.beginPath(); ctx.arc(300, 122, 57, Math.PI, Math.PI * 2); ctx.lineTo(357, 155); ctx.quadraticCurveTo(340, 120, 300, 132); ctx.quadraticCurveTo(262, 121, 244, 155); ctx.closePath(); ctx.fill();
  demoMask = new Uint8Array(width * height);
  const category = (x, y, cx, cy, rx, ry, value) => {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) demoMask[y * width + x] = value;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    category(x, y, 300, 157, 54, 70, 3);
    category(x, y, 300, 115, 60, 39, 1);
    category(x, y, 296, 461, 106, 204, 2);
    category(x, y, 155, 465, 39, 175, 2);
    category(x, y, 445, 465, 39, 175, 2);
  }
}

const demoLandmarks = () => {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const set = (index, x, y) => { points[index] = { x, y, visibility: 0.98 }; };
  set(0, .5, .17); set(11, .68, .32); set(12, .32, .32);
  set(13, .76, .49); set(14, .24, .49); set(15, .79, .70); set(16, .21, .70);
  set(23, .65, .78); set(24, .35, .78);
  return points;
};


export async function createDemoFrame() {
  if (!demoCanvas) buildDemo();
  return { bitmap: await createImageBitmap(demoCanvas), landmarks: demoLandmarks(), mask: demoMask, maskWidth: 600, maskHeight: 800 };
}
