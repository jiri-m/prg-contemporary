let img;
let canvasBuffer;
let imgLoaded = false;
let exportScale = 4;

// Sliders
let sldMargin, sldLen, sldWeight, sldSway, sldSpawnFreq, sldDrawSpeed;
let sldDensity, sldCluster, sldThreshold, sldWindSpeed, sldDisplace;
let sldS1, sldS2, sldS3, sldS4;
let sldC1, sldC2, sldC3, sldC4;
let sldR1, sldR2, sldR3, sldR4;
let sldMasterScale;

// Growth state
let allSeeds = [];
let activeBlades = [];
let seedIndex = 0;
let windTime = 0;
let growthPaused = false;
let showGrowth = false;

// Display geometry
let dispW = 0, dispH = 0, dispOX = 0, dispOY = 0;
let bMouseX = 0, bMouseY = 0;

// Cursor interaction
let sldMouseStrength, sldMouseRadius;
let interactMode = 'wind';
let mouseVelX = 0, mouseVelY = 0, _prevMX = 0, _prevMY = 0;
let windMagnitude = 0;
let windDirX = 0;

// Recording
let isRecording = false;
let mediaRecorder = null;
let recordingChunks = [];
let recordingCanvas = null;

// Embed export
let embedSourceBase64 = null;

// Mode: 'gradient' | 'image'
let currentMode = 'gradient';
let gradientUseText = false; // Gradient tab: Full Texture by default
let imageUseText    = true;  // Image tab: On Text by default

// Text / photo
let textPhotoElement = null;
let textAlignment = 'center';
let textPreviewCanvas = null;
let _previewTimer = null;

// Photo drag
let isDraggingPhoto = false;
let _photoDragMX = 0, _photoDragMY = 0;
let _photoDragStartX = 50, _photoDragStartY = 50;

// Photo resize
let isResizingPhoto = false;
let _resizeInitScale = 1.0;
let _resizeInitDist  = 1.0;
let _resizePhotoCX   = 0, _resizePhotoCY = 0;

// Gradient preview
let gradientPreviewCanvas = null;
let _gradientPreviewTimer = null;

// ── Mesh gradient ─────────────────────────────────────────────────────────────

const meshGreenTriads = [
  ['#037342', '#2E944C', '#45B04B'],
  ['#525C29', '#ADBA6B', '#DDE3B6'],
  ['#417F34', '#749E5E', '#8FB47D'],
];
const meshAccents = ['#8A6BD3', '#D297E8', '#C790DB', '#FF9FCC'];

let meshPoints = [];
let meshGreenTriad = 0;
let meshAccentIdx  = 0;
let meshSelectedId = null;
let _meshNextId    = 0;
let _meshDragId    = null;
let _meshDragCanvas = null;

// Sidebar
let sidebarVisible = true;
const SIDEBAR_W = 260;

// ── DOM helpers ────────────────────────────────────────────────────────────────

function domSlider(id) {
  return { value: () => parseFloat(document.getElementById(id).value) };
}
function getArtboardW() { return parseInt(document.getElementById('inp-artboard-w').value) || 1200; }
function getArtboardH() { return parseInt(document.getElementById('inp-artboard-h').value) || 800; }
function getCanvasScale() { return getArtboardW() / 1200; }

// ── p5 lifecycle ───────────────────────────────────────────────────────────────

function setup() {
  let canvas = createCanvas(windowWidth - SIDEBAR_W, windowHeight);
  canvas.parent('canvas-container');
  canvas.drop(handleFile);
  background(255);

  sldMargin      = domSlider('sld-margin');
  sldLen         = domSlider('sld-len');
  sldWeight      = domSlider('sld-weight');
  sldSway        = domSlider('sld-sway');
  sldSpawnFreq   = domSlider('sld-spawn-freq');
  sldDrawSpeed   = domSlider('sld-draw-speed');
  sldWindSpeed   = domSlider('sld-wind-speed');
  sldDensity     = domSlider('sld-density');
  sldCluster     = domSlider('sld-cluster');
  sldThreshold   = domSlider('sld-threshold');
  sldDisplace    = domSlider('sld-displace');
  sldMasterScale = domSlider('sld-master-scale');
  sldS1 = domSlider('sld-s1'); sldS2 = domSlider('sld-s2');
  sldS3 = domSlider('sld-s3'); sldS4 = domSlider('sld-s4');
  sldC1 = domSlider('sld-c1'); sldC2 = domSlider('sld-c2');
  sldC3 = domSlider('sld-c3'); sldC4 = domSlider('sld-c4');
  sldR1 = domSlider('sld-r1'); sldR2 = domSlider('sld-r2');
  sldR3 = domSlider('sld-r3'); sldR4 = domSlider('sld-r4');
  sldMouseStrength = domSlider('sld-mouse-strength');
  sldMouseRadius   = domSlider('sld-mouse-radius');

  initModeToggle();
  _meshRandomize();
  loadSettings();

  requestAnimationFrame(() => {
    _meshEditorUpdate();
    if (currentMode === 'image' && imageUseText) _scheduleTextPreview(50);
    else _scheduleGradientPreview(50);
  });
}

function windowResized() {
  resizeCanvas(windowWidth - (sidebarVisible ? SIDEBAR_W : 0), windowHeight);
}

// ── File handling ──────────────────────────────────────────────────────────────

function handleFile(file) {
  if (file.type === 'image' && currentMode === 'image' && !imageUseText) {
    img = loadImage(file.data, () => restartGrowth());
  }
}

// ── Growth ────────────────────────────────────────────────────────────────────

function restartGrowth() {
  if (!img) return;
  growthPaused = false;
  _updateStopBtn();

  let mVal = sldMargin.value();
  img.resize(getArtboardW() - mVal * 2, 0);
  if (img.height > getArtboardH() - mVal * 2) img.resize(0, getArtboardH() - mVal * 2);

  let bufferW = (img.width  + mVal * 2) * exportScale;
  let bufferH = (img.height + mVal * 2) * exportScale;

  canvasBuffer = createGraphics(bufferW, bufferH);
  canvasBuffer.clear();

  allSeeds = []; activeBlades = []; seedIndex = 0; windTime = 0;
  imgLoaded = true;
  showGrowth = true;
  findSeeds();

  try {
    const tmpC = document.createElement('canvas');
    tmpC.width = img.width; tmpC.height = img.height;
    tmpC.getContext('2d').drawImage(img.canvas, 0, 0);
    embedSourceBase64 = tmpC.toDataURL('image/jpeg', 0.92);
  } catch (e) { /* silent */ }
}

function findSeeds() {
  let step = 2, mVal = sldMargin.value();
  let dt = sldDensity.value(), cs = sldCluster.value() / 100;
  let wl = sldThreshold.value(), da = sldDisplace.value();
  img.loadPixels();
  for (let x = step; x < img.width - step; x += step) {
    for (let y = step; y < img.height - step; y += step) {
      let c = img.get(x, y);
      let br = (red(c) + green(c) + blue(c)) / 3;
      if (br >= wl) continue;
      let cn = noise(x * 0.04, y * 0.04);
      let fc = map(cn, 0, 1, -cs, cs);
      if (random(100) < dt + fc * 100) {
        allSeeds.push({
          x: (x + mVal + random(-da, da)) * exportScale,
          y: (y + mVal + random(-da, da)) * exportScale,
          col: c
        });
      }
    }
  }
  allSeeds = shuffle(allSeeds);
}

// ── Draw loop ──────────────────────────────────────────────────────────────────

function draw() {
  // Gradient mode preview
  if (currentMode === 'gradient' && gradientPreviewCanvas && !showGrowth) {
    background(250);
    const ar = gradientPreviewCanvas.width / gradientPreviewCanvas.height;
    let dW = width, dH = width / ar;
    if (dH > height) { dH = height; dW = height * ar; }
    dispOX = (width - dW) / 2; dispOY = (height - dH) / 2;
    dispW = dW; dispH = dH;
    drawingContext.drawImage(gradientPreviewCanvas, dispOX, dispOY, dW, dH);
    cursor(ARROW);
    return;
  }

  // Image + On Text preview
  if (currentMode === 'image' && imageUseText && textPreviewCanvas && !showGrowth) {
    background(250);
    const arT = textPreviewCanvas.width / textPreviewCanvas.height;
    let dWt = width, dHt = width / arT;
    if (dHt > height) { dHt = height; dWt = height * arT; }
    dispOX = (width - dWt) / 2; dispOY = (height - dHt) / 2;
    dispW = dWt; dispH = dHt;
    drawingContext.drawImage(textPreviewCanvas, dispOX, dispOY, dWt, dHt);
    if (textPhotoElement) { _drawPhotoFrame(); } else { cursor(ARROW); }
    return;
  }

  // Standard growth display
  if (!imgLoaded) { background(255); cursor(ARROW); return; }
  cursor(ARROW);
  windTime += sldWindSpeed.value() * 0.0005;

  if (!growthPaused) {
    for (let i = 0; i < sldSpawnFreq.value(); i++) {
      if (seedIndex < allSeeds.length) {
        let s = allSeeds[seedIndex++];
        activeBlades.push(new Blade(s.x, s.y, s.col));
      }
    }
  }

  const cs = getCanvasScale();
  canvasBuffer.clear();
  canvasBuffer.strokeWeight(sldWeight.value() * exportScale * cs);
  canvasBuffer.noFill();
  for (let i = 0; i < activeBlades.length; i++) {
    if (!growthPaused) activeBlades[i].update();
    activeBlades[i].show();
  }

  dispW = width;
  dispH = (canvasBuffer.height / canvasBuffer.width) * width;
  if (dispH > height) { dispH = height; dispW = (canvasBuffer.width / canvasBuffer.height) * height; }
  dispOX = (width  - dispW) / 2;
  dispOY = (height - dispH) / 2;
  bMouseX = map(mouseX, dispOX, dispOX + dispW, 0, canvasBuffer.width);
  bMouseY = map(mouseY, dispOY, dispOY + dispH, 0, canvasBuffer.height);

  const bScale  = canvasBuffer.width / dispW;
  const rawVelX = (mouseX - _prevMX) * bScale;
  const rawVelY = (mouseY - _prevMY) * bScale;
  _prevMX = mouseX; _prevMY = mouseY;
  const rawMag  = Math.sqrt(rawVelX * rawVelX + rawVelY * rawVelY);
  const maxRaw  = canvasBuffer.width * 0.025;
  const clamp   = rawMag > maxRaw ? maxRaw / rawMag : 1;
  const smooth  = 0.90;
  mouseVelX = mouseVelX * smooth + rawVelX * clamp * (1 - smooth);
  mouseVelY = mouseVelY * smooth + rawVelY * clamp * (1 - smooth);
  const smoothMag = Math.sqrt(mouseVelX * mouseVelX + mouseVelY * mouseVelY);
  windMagnitude   = Math.min(smoothMag / maxRaw, 1);
  windDirX        = smoothMag > 0.5 ? mouseVelX / smoothMag : 0;

  if (isRecording && recordingCanvas) {
    const rctx = recordingCanvas.getContext('2d');
    rctx.fillStyle = '#f5f5f5';
    rctx.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    rctx.drawImage(canvasBuffer.elt, 0, 0, recordingCanvas.width, recordingCanvas.height);
  }

  background(255);
  imageMode(CENTER);
  image(canvasBuffer, width / 2, height / 2, dispW, dispH);
}

// ── Mesh gradient ─────────────────────────────────────────────────────────────

function _hexToRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _makeMeshCanvas(w, h) {
  if (meshPoints.length === 0) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').fillStyle = '#6c8d79';
    c.getContext('2d').fillRect(0, 0, w, h);
    return c;
  }

  const SMALL = 128;
  const smallH = Math.max(1, Math.round(SMALL * h / w));
  const tmp = document.createElement('canvas');
  tmp.width = SMALL; tmp.height = smallH;
  const ctx = tmp.getContext('2d');
  const imgData = ctx.createImageData(SMALL, smallH);
  const data = imgData.data;

  const pts = meshPoints.map(pt => {
    const rgb = _hexToRGB(pt.color);
    return { x: pt.x, y: pt.y, r: rgb[0], g: rgb[1], b: rgb[2], weight: pt.weight || 1.0 };
  });

  for (let py = 0; py < smallH; py++) {
    const ny = py / (smallH - 1 || 1);
    for (let px = 0; px < SMALL; px++) {
      const nx = px / (SMALL - 1 || 1);
      let wR = 0, wG = 0, wB = 0, wSum = 0;
      let exact = false;
      for (const pt of pts) {
        const dx = nx - pt.x, dy = ny - pt.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-8) {
          wR = pt.r; wG = pt.g; wB = pt.b; wSum = 1; exact = true; break;
        }
        const w = pt.weight / d2;
        wR += pt.r * w; wG += pt.g * w; wB += pt.b * w;
        wSum += w;
      }
      if (!exact && wSum === 0) { wR = 108; wG = 141; wB = 121; wSum = 1; }
      const i = (py * SMALL + px) * 4;
      data[i]   = Math.round(wR / wSum);
      data[i+1] = Math.round(wG / wSum);
      data[i+2] = Math.round(wB / wSum);
      data[i+3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(tmp, 0, 0, w, h);
  return out;
}

function _meshRenderCanvas(canvasEl) {
  if (!canvasEl || canvasEl.width === 0 || canvasEl.height === 0) return;
  const W = canvasEl.width, H = canvasEl.height;
  const ctx = canvasEl.getContext('2d');
  ctx.drawImage(_makeMeshCanvas(W, H), 0, 0);
  for (const pt of meshPoints) {
    const px = pt.x * W, py = pt.y * H;
    const sel = pt.id === meshSelectedId;
    ctx.beginPath();
    ctx.arc(px, py, sel ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = pt.color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = sel ? 2.5 : 1.5;
    ctx.stroke();
    if (sel) {
      ctx.beginPath();
      ctx.arc(px, py, 11, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function _meshEditorUpdate() {
  _meshRenderCanvas(document.getElementById('mesh-grad'));

  const sel = meshPoints.find(p => p.id === meshSelectedId);
  const picker    = document.getElementById('inp-mesh-color');
  const weightSld = document.getElementById('inp-mesh-weight');
  if (picker && sel) picker.value = sel.color;
  if (weightSld && sel) {
    const w = sel.weight || 1.0;
    weightSld.value = w;
    weightSld.nextElementSibling.textContent = w.toFixed(1);
  }

  document.querySelectorAll('#triad-btns .triad-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === meshGreenTriad);
  });
  document.querySelectorAll('#accent-btns .accent-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === meshAccentIdx);
  });

  if (currentMode === 'gradient') _scheduleGradientPreview(50);
}

function _updateTriadSwatches(t) {
  const btn = document.querySelector(`#triad-btns .triad-btn[data-triad="${t}"]`);
  if (!btn) return;
  const swatches = btn.querySelectorAll('.triad-swatch');
  meshGreenTriads[t].forEach((c, i) => { if (swatches[i]) swatches[i].style.background = c; });
}

function _updateAllTriadSwatches() { [0, 1, 2].forEach(_updateTriadSwatches); }

function _updateTriadEditRow() {
  const triad = meshGreenTriads[meshGreenTriad];
  ['triad-c0', 'triad-c1', 'triad-c2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el && triad[i]) el.value = triad[i];
  });
}

function _updateAccentBtns() {
  document.querySelectorAll('#accent-btns .accent-btn').forEach((inp, i) => {
    inp.value = meshAccents[i];
    inp.classList.toggle('active', i === meshAccentIdx);
  });
}

function _meshRandomize() {
  meshPoints = [];
  _meshNextId = 0;
  const triad  = meshGreenTriads[meshGreenTriad];
  const accent = meshAccents[meshAccentIdx];

  const basePositions = [
    { x: 0.10, y: 0.15 }, { x: 0.50, y: 0.08 }, { x: 0.90, y: 0.20 },
    { x: 0.20, y: 0.42 }, { x: 0.70, y: 0.38 }, { x: 0.45, y: 0.55 },
    { x: 0.05, y: 0.72 }, { x: 0.40, y: 0.70 }, { x: 0.82, y: 0.65 },
    { x: 0.25, y: 0.90 }, { x: 0.65, y: 0.88 },
  ];
  basePositions.forEach((pos, i) => {
    meshPoints.push({
      id: _meshNextId++,
      x: Math.max(0.03, Math.min(0.97, pos.x + (Math.random() - 0.5) * 0.18)),
      y: Math.max(0.03, Math.min(0.97, pos.y + (Math.random() - 0.5) * 0.18)),
      color: triad[i % triad.length],
      weight: 0.8 + Math.random() * 0.4,
    });
  });

  const numAccents = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < numAccents; i++) {
    meshPoints.push({
      id: _meshNextId++,
      x: Math.random() * 0.8 + 0.1,
      y: Math.random() * 0.8 + 0.1,
      color: accent,
      weight: 0.6 + Math.random() * 0.8,
    });
  }
  meshSelectedId = meshPoints[0].id;
  _meshEditorUpdate();
}

function _initMeshEditor(canvasId) {
  const canvasEl = document.getElementById(canvasId);
  if (!canvasEl) return;

  function _getCoords(ev) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      nx: Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)),
      ny: Math.max(0, Math.min(1, (ev.clientY - rect.top)  / rect.height)),
      hitR: 14 / rect.width,
    };
  }

  canvasEl.addEventListener('mousedown', ev => {
    ev.preventDefault();
    const { nx, ny, hitR } = _getCoords(ev);

    let hit = null, minD = Infinity;
    for (const pt of meshPoints) {
      const dx = nx - pt.x, dy = ny - pt.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < hitR && d < minD) { minD = d; hit = pt; }
    }

    if (hit) {
      meshSelectedId = hit.id;
      _meshDragId = hit.id;
    } else {
      const triad = meshGreenTriads[meshGreenTriad];
      const newPt = {
        id: _meshNextId++,
        x: nx, y: ny,
        color: triad[Math.floor(Math.random() * triad.length)],
        weight: 1.0,
      };
      meshPoints.push(newPt);
      meshSelectedId = newPt.id;
      _meshDragId = newPt.id;
    }
    _meshDragCanvas = canvasId;
    _meshEditorUpdate();
  });

  canvasEl.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    const { nx, ny, hitR } = _getCoords(ev);
    let hit = null, minD = Infinity;
    for (const pt of meshPoints) {
      const dx = nx - pt.x, dy = ny - pt.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < hitR && d < minD) { minD = d; hit = pt; }
    }
    if (hit && meshPoints.length > 2) {
      meshPoints = meshPoints.filter(p => p.id !== hit.id);
      if (meshSelectedId === hit.id) meshSelectedId = meshPoints[0]?.id ?? null;
      _meshEditorUpdate();
    }
  });
}

function _initMeshDocumentDrag() {
  document.addEventListener('mousemove', ev => {
    if (_meshDragId === null || !_meshDragCanvas) return;
    const canvasEl = document.getElementById(_meshDragCanvas);
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const nx = Math.max(0.01, Math.min(0.99, (ev.clientX - rect.left) / rect.width));
    const ny = Math.max(0.01, Math.min(0.99, (ev.clientY - rect.top)  / rect.height));
    const pt = meshPoints.find(p => p.id === _meshDragId);
    if (pt) { pt.x = nx; pt.y = ny; _meshEditorUpdate(); }
  });
  document.addEventListener('mouseup', () => { _meshDragId = null; _meshDragCanvas = null; });
}

// ── Typography helper ──────────────────────────────────────────────────────────

function _getTypography() {
  return {
    lines:      (document.getElementById('txt-content').value || '').split('\n'),
    fontFamily: document.getElementById('txt-font-family').value,
    fontSize:   parseInt(document.getElementById('txt-font-size').value) || 200,
    fontWeight: document.getElementById('txt-font-weight').value,
    letterSpc:  parseInt(document.getElementById('txt-letter-spacing').value) || 0,
    lineHMult:  parseFloat(document.getElementById('txt-line-height').value) || 1.2,
    textXPct:   parseInt(document.getElementById('txt-pos-x').value) / 100,
    textYPct:   parseInt(document.getElementById('txt-pos-y').value) / 100,
  };
}

function _buildTextMask(artW, artH, t) {
  const lineH   = t.fontSize * t.lineHMult;
  const fontStr = t.fontWeight + ' ' + t.fontSize + 'px ' + t.fontFamily;
  const mask = document.createElement('canvas');
  mask.width = artW; mask.height = artH;
  const mc = mask.getContext('2d');
  mc.fillStyle = 'black';
  mc.font = fontStr; mc.textBaseline = 'top';
  if ('letterSpacing' in mc) mc.letterSpacing = t.letterSpc + 'px';
  const totalH   = t.lines.length * lineH;
  const blockTop = t.textYPct * artH - totalH / 2;
  for (let i = 0; i < t.lines.length; i++) {
    const lw = _measureLine(mc, t.lines[i], t.letterSpc);
    const bx = t.textXPct * artW;
    const y  = blockTop + i * lineH;
    const x  = textAlignment === 'center' ? bx - lw / 2
             : textAlignment === 'right'  ? bx - lw : bx;
    if ('letterSpacing' in mc) mc.fillText(t.lines[i], x, y);
    else _drawSpaced(mc, t.lines[i], x, y, t.letterSpc);
  }
  return mask;
}

// ── Gradient previews ──────────────────────────────────────────────────────────

function _renderGradientFullTexturePreviewSync() {
  const artW = getArtboardW(), artH = getArtboardH();
  if (meshPoints.length < 2) return;
  if (!gradientPreviewCanvas) gradientPreviewCanvas = document.createElement('canvas');
  gradientPreviewCanvas.width  = artW;
  gradientPreviewCanvas.height = artH;
  gradientPreviewCanvas.getContext('2d').drawImage(_makeMeshCanvas(artW, artH), 0, 0);
}

function _renderGradientOnTextPreviewSync() {
  const artW = getArtboardW(), artH = getArtboardH();
  const t = _getTypography();
  if (!gradientPreviewCanvas) gradientPreviewCanvas = document.createElement('canvas');
  gradientPreviewCanvas.width  = artW;
  gradientPreviewCanvas.height = artH;
  const fc = gradientPreviewCanvas.getContext('2d');
  fc.fillStyle = '#ffffff';
  fc.fillRect(0, 0, artW, artH);
  if (meshPoints.length < 2) return;
  const meshCanvas = _makeMeshCanvas(artW, artH);
  fc.globalAlpha = 0.75;
  fc.drawImage(meshCanvas, 0, 0);
  fc.globalAlpha = 1.0;
  const mask = _buildTextMask(artW, artH, t);
  const comp = document.createElement('canvas');
  comp.width = artW; comp.height = artH;
  const cc = comp.getContext('2d');
  cc.drawImage(meshCanvas, 0, 0);
  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(mask, 0, 0);
  cc.globalCompositeOperation = 'source-over';
  fc.drawImage(comp, 0, 0);
}

function _scheduleGradientPreview(delay) {
  if (currentMode === 'gradient') showGrowth = false;
  if (_gradientPreviewTimer) clearTimeout(_gradientPreviewTimer);
  const doRender = () => {
    if (gradientUseText) _renderGradientOnTextPreviewSync();
    else _renderGradientFullTexturePreviewSync();
    _gradientPreviewTimer = null;
  };
  if (delay === 0) doRender();
  else _gradientPreviewTimer = setTimeout(doRender, delay);
}

function renderGradientComposition() {
  const artW = getArtboardW(), artH = getArtboardH();
  if (meshPoints.length < 2) return;
  const meshCanvas = _makeMeshCanvas(artW, artH);
  const dataURL = meshCanvas.toDataURL('image/jpeg', 0.92);
  embedSourceBase64 = dataURL;
  loadImage(dataURL, loaded => { img = loaded; restartGrowth(); });
}

function renderGradientOnTextComposition() {
  const artW = getArtboardW(), artH = getArtboardH();
  const t = _getTypography();
  if (meshPoints.length < 2) return;
  const meshCanvas = _makeMeshCanvas(artW, artH);
  const mask = _buildTextMask(artW, artH, t);
  const comp = document.createElement('canvas');
  comp.width = artW; comp.height = artH;
  const cc = comp.getContext('2d');
  cc.drawImage(meshCanvas, 0, 0);
  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(mask, 0, 0);
  cc.globalCompositeOperation = 'source-over';
  const final = document.createElement('canvas');
  final.width = artW; final.height = artH;
  const fc = final.getContext('2d');
  fc.fillStyle = 'white';
  fc.fillRect(0, 0, artW, artH);
  fc.drawImage(comp, 0, 0);
  const dataURL = final.toDataURL('image/jpeg', 0.92);
  embedSourceBase64 = dataURL;
  loadImage(dataURL, loaded => { img = loaded; restartGrowth(); });
}

// ── Text (image + on text) preview ────────────────────────────────────────────

function renderTextPreviewSync() {
  const lines      = document.getElementById('txt-content').value.split('\n');
  const fontFamily = document.getElementById('txt-font-family').value;
  const fontSize   = parseInt(document.getElementById('txt-font-size').value);
  const fontWeight = document.getElementById('txt-font-weight').value;
  const letterSpc  = parseInt(document.getElementById('txt-letter-spacing').value);
  const lineHMult  = parseFloat(document.getElementById('txt-line-height').value);
  const textXPct   = parseInt(document.getElementById('txt-pos-x').value) / 100;
  const textYPct   = parseInt(document.getElementById('txt-pos-y').value) / 100;
  const photoXPct  = parseInt(document.getElementById('txt-photo-x').value) / 100;
  const photoYPct  = parseInt(document.getElementById('txt-photo-y').value) / 100;
  const photoSc    = parseFloat(document.getElementById('txt-photo-scale').value);

  const artW = getArtboardW(), artH = getArtboardH();
  const lineHeight = fontSize * lineHMult;
  const fontStr    = fontWeight + ' ' + fontSize + 'px ' + fontFamily;

  if (!textPreviewCanvas) textPreviewCanvas = document.createElement('canvas');
  textPreviewCanvas.width  = artW;
  textPreviewCanvas.height = artH;
  const fc = textPreviewCanvas.getContext('2d');
  fc.fillStyle = '#ffffff';
  fc.fillRect(0, 0, artW, artH);

  if (textPhotoElement) {
    const srcW = textPhotoElement.naturalWidth, srcH = textPhotoElement.naturalHeight;
    const cov  = Math.max(artW / srcW, artH / srcH);
    const fsc  = cov * Math.max(photoSc, 1.0);
    const dw   = srcW * fsc, dh = srcH * fsc;
    const px   = (photoXPct - 0.5) * (dw - artW);
    const py   = (photoYPct - 0.5) * (dh - artH);
    const drawX = artW / 2 - dw / 2 + px;
    const drawY = artH / 2 - dh / 2 + py;

    fc.globalAlpha = 0.75;
    fc.drawImage(textPhotoElement, drawX, drawY, dw, dh);
    fc.globalAlpha = 1.0;

    const mask = document.createElement('canvas');
    mask.width = artW; mask.height = artH;
    const mc = mask.getContext('2d');
    mc.fillStyle = 'black';
    mc.font = fontStr; mc.textBaseline = 'top';
    if ('letterSpacing' in mc) mc.letterSpacing = letterSpc + 'px';
    const totalH   = lines.length * lineHeight;
    const blockTop = textYPct * artH - totalH / 2;
    for (let i = 0; i < lines.length; i++) {
      const lw = _measureLine(mc, lines[i], letterSpc);
      const bx = textXPct * artW;
      const y  = blockTop + i * lineHeight;
      const x  = textAlignment === 'center' ? bx - lw / 2
               : textAlignment === 'right'  ? bx - lw : bx;
      if ('letterSpacing' in mc) mc.fillText(lines[i], x, y);
      else _drawSpaced(mc, lines[i], x, y, letterSpc);
    }

    const comp = document.createElement('canvas');
    comp.width = artW; comp.height = artH;
    const compCtx = comp.getContext('2d');
    compCtx.drawImage(textPhotoElement, drawX, drawY, dw, dh);
    compCtx.globalCompositeOperation = 'destination-in';
    compCtx.drawImage(mask, 0, 0);
    compCtx.globalCompositeOperation = 'source-over';
    fc.drawImage(comp, 0, 0);
  } else {
    fc.fillStyle = '#111111';
    fc.font = fontStr; fc.textBaseline = 'top';
    if ('letterSpacing' in fc) fc.letterSpacing = letterSpc + 'px';
    const totalH   = lines.length * lineHeight;
    const blockTop = textYPct * artH - totalH / 2;
    for (let i = 0; i < lines.length; i++) {
      const lw = _measureLine(fc, lines[i], letterSpc);
      const bx = textXPct * artW;
      const y  = blockTop + i * lineHeight;
      const x  = textAlignment === 'center' ? bx - lw / 2
               : textAlignment === 'right'  ? bx - lw : bx;
      if ('letterSpacing' in fc) fc.fillText(lines[i], x, y);
      else _drawSpaced(fc, lines[i], x, y, letterSpc);
    }
  }
}

function _scheduleTextPreview(delay) {
  if (currentMode === 'image' && imageUseText) showGrowth = false;
  if (typeof delay === 'undefined') delay = 250;
  if (_previewTimer) clearTimeout(_previewTimer);
  if (delay === 0) {
    renderTextPreviewSync();
  } else {
    _previewTimer = setTimeout(() => {
      renderTextPreviewSync();
      _previewTimer = null;
    }, delay);
  }
}

// ── Photo frame helpers ────────────────────────────────────────────────────────

function _getPhotoFrameInfo() {
  if (!textPhotoElement || dispW <= 0) return null;
  const artW = getArtboardW(), artH = getArtboardH();
  const photoXPct = parseInt(document.getElementById('txt-photo-x').value) / 100;
  const photoYPct = parseInt(document.getElementById('txt-photo-y').value) / 100;
  const photoSc   = parseFloat(document.getElementById('txt-photo-scale').value);
  const srcW = textPhotoElement.naturalWidth, srcH = textPhotoElement.naturalHeight;
  const cov  = Math.max(artW / srcW, artH / srcH);
  const fsc  = cov * Math.max(photoSc, 1.0);
  const dw   = srcW * fsc, dh = srcH * fsc;
  const panX = (photoXPct - 0.5) * (dw - artW);
  const panY = (photoYPct - 0.5) * (dh - artH);
  const scX  = dispW / artW, scY = dispH / artH;
  return {
    fx: dispOX + (artW / 2 - dw / 2 + panX) * scX,
    fy: dispOY + (artH / 2 - dh / 2 + panY) * scY,
    fw: dw * scX, fh: dh * scY,
    cx: dispOX + (artW / 2 + panX) * scX,
    cy: dispOY + (artH / 2 + panY) * scY
  };
}

function _drawPhotoFrame() {
  const info = _getPhotoFrameInfo();
  if (!info) { cursor('grab'); return; }
  const { fx, fy, fw, fh } = info;

  push();
  noFill();
  stroke(80, 100, 220, 180);
  strokeWeight(1.5);
  drawingContext.setLineDash([6, 4]);
  rect(fx, fy, fw, fh);
  drawingContext.setLineDash([]);

  const hS = 9;
  const corners = [
    { x: fx,      y: fy      }, { x: fx + fw, y: fy      },
    { x: fx,      y: fy + fh }, { x: fx + fw, y: fy + fh },
  ];
  fill(255, 255, 255, 230);
  stroke(60, 80, 200); strokeWeight(1.5);
  for (const c of corners) rect(c.x - hS / 2, c.y - hS / 2, hS, hS);
  pop();

  let onHandle = false;
  for (const c of corners) {
    if (abs(mouseX - c.x) < 12 && abs(mouseY - c.y) < 12) { onHandle = true; break; }
  }
  if (isResizingPhoto || onHandle) cursor('nwse-resize');
  else if (isDraggingPhoto)        cursor('grabbing');
  else                             cursor('grab');
}

// ── Mouse events ───────────────────────────────────────────────────────────────

function mousePressed() {
  if (currentMode === 'image' && imageUseText && textPreviewCanvas && !showGrowth && textPhotoElement) {
    const info = _getPhotoFrameInfo();
    if (info) {
      const { fx, fy, fw, fh, cx, cy } = info;
      const corners = [
        { x: fx,      y: fy      }, { x: fx + fw, y: fy      },
        { x: fx,      y: fy + fh }, { x: fx + fw, y: fy + fh },
      ];
      for (const c of corners) {
        if (abs(mouseX - c.x) < 12 && abs(mouseY - c.y) < 12) {
          isResizingPhoto  = true;
          _resizePhotoCX   = cx; _resizePhotoCY = cy;
          _resizeInitScale = parseFloat(document.getElementById('txt-photo-scale').value);
          _resizeInitDist  = Math.max(1, Math.sqrt((mouseX - cx) ** 2 + (mouseY - cy) ** 2));
          return false;
        }
      }
    }
    isDraggingPhoto  = true;
    _photoDragMX     = mouseX; _photoDragMY = mouseY;
    _photoDragStartX = parseInt(document.getElementById('txt-photo-x').value);
    _photoDragStartY = parseInt(document.getElementById('txt-photo-y').value);
    return false;
  }
}

function mouseDragged() {
  if (isResizingPhoto) {
    const curDist = Math.sqrt((mouseX - _resizePhotoCX) ** 2 + (mouseY - _resizePhotoCY) ** 2);
    let newScale  = Math.min(3.0, Math.max(0.1, _resizeInitScale * (curDist / _resizeInitDist)));
    const sl = document.getElementById('txt-photo-scale');
    sl.value = newScale.toFixed(2);
    sl.nextElementSibling.textContent = newScale.toFixed(2) + '×';
    _scheduleTextPreview(0);
    return false;
  }
  if (isDraggingPhoto) {
    const nx = Math.min(100, Math.max(0, _photoDragStartX + (mouseX - _photoDragMX) / dispW * 100));
    const ny = Math.min(100, Math.max(0, _photoDragStartY + (mouseY - _photoDragMY) / dispH * 100));
    const sx = document.getElementById('txt-photo-x');
    const sy = document.getElementById('txt-photo-y');
    sx.value = Math.round(nx); sx.nextElementSibling.textContent = Math.round(nx) + '%';
    sy.value = Math.round(ny); sy.nextElementSibling.textContent = Math.round(ny) + '%';
    _scheduleTextPreview(0);
    return false;
  }
}

function mouseReleased() { isDraggingPhoto = false; isResizingPhoto = false; }

function mouseWheel(event) {
  if (currentMode === 'image' && imageUseText && textPreviewCanvas && !showGrowth) {
    const sl = document.getElementById('txt-photo-scale');
    let v = Math.min(3.0, Math.max(0.1, parseFloat(sl.value) - event.delta * 0.0005));
    sl.value = v.toFixed(2);
    sl.nextElementSibling.textContent = v.toFixed(2) + '×';
    _scheduleTextPreview(0);
    return false;
  }
}

// ── Blade ──────────────────────────────────────────────────────────────────────

class Blade {
  constructor(x, y, c) {
    this.root  = createVector(x, y);
    this.color = c;

    let roll = random(0, sldC1.value() + sldC2.value() + sldC3.value() + sldC4.value());
    let basePct, tierJitter;
    if      (roll < sldC1.value())                                       { basePct = sldS1.value(); tierJitter = sldR1.value(); }
    else if (roll < sldC1.value() + sldC2.value())                       { basePct = sldS2.value(); tierJitter = sldR2.value(); }
    else if (roll < sldC1.value() + sldC2.value() + sldC3.value())      { basePct = sldS3.value(); tierJitter = sldR3.value(); }
    else                                                                  { basePct = sldS4.value(); tierJitter = sldR4.value(); }

    const cs     = getCanvasScale();
    let jitter   = random(1 - tierJitter, 1 + tierJitter);
    this.maxLen          = basePct * jitter * sldLen.value() * sldMasterScale.value() * exportScale * cs;
    this.windSensitivity = noise(x * 0.01, y * 0.01);
    this.currentLen      = 0;
    this.baseGrowthRate  = random(5, 15) * exportScale * sldMasterScale.value() * cs;
    this.baseAngle       = -HALF_PI + random(-0.2, 0.2);
    this.alpha           = random(80, 160);
  }

  update() {
    if (this.currentLen < this.maxLen) this.currentLen += this.baseGrowthRate * sldDrawSpeed.value() * 0.1;
  }

  show() {
    let c = this.color;
    canvasBuffer.stroke(red(c), green(c), blue(c), this.alpha);

    let noiseVal = noise(this.root.x / exportScale * 0.005, this.root.y / exportScale * 0.005, windTime);
    let windBend = map(noiseVal, 0, 1, -sldSway.value() * this.windSensitivity, sldSway.value() * this.windSensitivity);

    let dx = this.root.x - bMouseX, dy = this.root.y - bMouseY;
    let d  = max(1, sqrt(dx * dx + dy * dy));
    let mouseFalloff = max(0, 1 - d / (canvasBuffer.width * sldMouseRadius.value()));
    let strength = sldMouseStrength.value();
    let mouseBend;
    if      (interactMode === 'attract') mouseBend = mouseFalloff * strength * (-dx / d);
    else if (interactMode === 'wind')    mouseBend = mouseFalloff * strength * windDirX * windMagnitude;
    else                                 mouseBend = mouseFalloff * strength * (dx / d);

    let finalAngle = this.baseAngle + windBend + mouseBend;
    let cpX = this.root.x + cos(this.baseAngle) * (this.currentLen * 0.5);
    let cpY = this.root.y + sin(this.baseAngle) * (this.currentLen * 0.5);
    let tipX = this.root.x + cos(finalAngle) * this.currentLen;
    let tipY = this.root.y + sin(finalAngle) * this.currentLen;

    canvasBuffer.beginShape();
    canvasBuffer.vertex(this.root.x, this.root.y);
    canvasBuffer.quadraticVertex(cpX, cpY, tipX, tipY);
    canvasBuffer.endShape();
  }
}

// ── Video recording ────────────────────────────────────────────────────────────

function startRecording() {
  if (!imgLoaded || !canvasBuffer) { alert('Start growing something first.'); return; }
  const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType  = mimeTypes.find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) { alert('Video recording not supported in this browser.\nUse Chrome or Firefox.'); return; }
  const recW = Math.min(canvasBuffer.width, 1920);
  const recH = Math.round(recW / (canvasBuffer.width / canvasBuffer.height));
  recordingCanvas = document.createElement('canvas');
  recordingCanvas.width = recW; recordingCanvas.height = recH;
  const stream = recordingCanvas.captureStream(30);
  mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 25_000_000 });
  recordingChunks = [];
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordingChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordingChunks, { type: mimeType.split(';')[0] });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'meadow.webm'; a.click();
    URL.revokeObjectURL(a.href); recordingCanvas = null;
  };
  mediaRecorder.start(100);
  isRecording = true; _updateRecordBtn();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false; _updateRecordBtn();
}

// ── Export & save ──────────────────────────────────────────────────────────────

function downloadHighRes() { if (canvasBuffer) save(canvasBuffer, 'meadow.png'); }

function keyPressed() {
  if (key === 's' || key === 'S') downloadHighRes();
}

function collectSettings() {
  const sliderIds = [
    'inp-artboard-w','inp-artboard-h','sld-master-scale',
    'sld-margin','sld-density','sld-cluster','sld-displace','sld-threshold',
    'sld-len','sld-weight','sld-sway','sld-spawn-freq','sld-draw-speed','sld-wind-speed',
    'sld-s1','sld-s2','sld-s3','sld-s4',
    'sld-c1','sld-c2','sld-c3','sld-c4',
    'sld-r1','sld-r2','sld-r3','sld-r4',
    'sld-mouse-strength','sld-mouse-radius',
    'txt-font-size','txt-letter-spacing','txt-line-height','txt-pos-x','txt-pos-y',
    'txt-photo-x','txt-photo-y','txt-photo-scale',
    'inp-mesh-weight',
  ];
  const selectIds = ['txt-font-family','txt-font-weight'];
  const sliders = {};
  sliderIds.forEach(id => { const el = document.getElementById(id); if (el) sliders[id] = el.value; });
  const selects = {};
  selectIds.forEach(id => { const el = document.getElementById(id); if (el) selects[id] = el.value; });
  return {
    version: 3,
    currentMode, gradientUseText, imageUseText,
    sliders, selects,
    text: { txtContent: document.getElementById('txt-content')?.value || '' },
    alignment: { textAlignment, interactMode },
    mesh: {
      greenTriad: meshGreenTriad,
      accentIdx:  meshAccentIdx,
      greenTriads: meshGreenTriads.map(t => [...t]),
      accents:    [...meshAccents],
      points:     meshPoints.map(p => ({ x: p.x, y: p.y, color: p.color, weight: p.weight || 1.0 })),
    },
  };
}

function exportSettings() {
  const blob = new Blob([JSON.stringify(collectSettings(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'meadow-settings.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function saveSettings() {
  localStorage.setItem('meadow-settings', JSON.stringify(collectSettings()));
  const btn = document.getElementById('btn-save-settings');
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = 'Saved ✓';
  btn.style.color = '#4a9a6f'; btn.style.borderColor = '#4a9a6f';
  setTimeout(() => { btn.textContent = prev; btn.style.color = ''; btn.style.borderColor = ''; }, 1500);
}

function loadSettings() {
  const raw = localStorage.getItem('meadow-settings');
  if (!raw) return;
  try { applySettings(JSON.parse(raw)); } catch(e) { /* ignore corrupt data */ }
}

function applySettings(data) {
  if (!data) return;

  // 1. Restore palette color arrays (mutate in-place)
  if (Array.isArray(data.mesh?.greenTriads)) {
    data.mesh.greenTriads.forEach((t, i) => {
      if (meshGreenTriads[i]) t.forEach((c, j) => { meshGreenTriads[i][j] = c; });
    });
  }
  if (Array.isArray(data.mesh?.accents)) {
    data.mesh.accents.forEach((c, i) => { if (i < meshAccents.length) meshAccents[i] = c; });
  }

  // 2. Restore mode variables first (so preview callbacks use correct mode)
  if (data.currentMode)                currentMode    = data.currentMode;
  if (data.gradientUseText !== undefined) gradientUseText = data.gradientUseText;
  if (data.imageUseText    !== undefined) imageUseText    = data.imageUseText;

  // 3. Update mode panel UI
  ['btn-gradient-mode','btn-image-mode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', el.id === 'btn-' + currentMode + '-mode');
  });
  const gradPanel = document.getElementById('gradient-mode-panel');
  const imgPanel  = document.getElementById('image-mode-panel');
  if (gradPanel) gradPanel.style.display = currentMode === 'gradient' ? 'block' : 'none';
  if (imgPanel)  imgPanel.style.display  = currentMode === 'image'    ? 'block' : 'none';

  const gFull = document.getElementById('btn-grad-full');
  const gText = document.getElementById('btn-grad-text');
  if (gFull) gFull.classList.toggle('active', !gradientUseText);
  if (gText) gText.classList.toggle('active',  gradientUseText);

  const iText = document.getElementById('btn-img-text');
  const iFull = document.getElementById('btn-img-full');
  if (iText) iText.classList.toggle('active', imageUseText);
  if (iFull) iFull.classList.toggle('active', !imageUseText);
  const photoSec = document.getElementById('img-photo-section');
  const fullHint = document.getElementById('img-full-hint');
  if (photoSec) photoSec.style.display = imageUseText ? 'block' : 'none';
  if (fullHint) fullHint.style.display = imageUseText ? 'none'  : 'block';

  const typoSec = document.getElementById('typography-section');
  if (typoSec) {
    const show = (currentMode === 'gradient' && gradientUseText) || (currentMode === 'image' && imageUseText);
    typoSec.style.display = show ? 'block' : 'none';
  }

  // 4. Restore sliders (dispatching input to update display spans)
  Object.entries(data.sliders || {}).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event('input'));
  });

  // 5. Restore selects
  Object.entries(data.selects || {}).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  // 6. Restore text
  const txtEl = document.getElementById('txt-content');
  if (txtEl && data.text?.txtContent !== undefined) txtEl.value = data.text.txtContent;

  // 7. Restore alignment button active states
  if (data.alignment?.textAlignment) {
    textAlignment = data.alignment.textAlignment;
    document.querySelectorAll('#txt-alignment-btns .align-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.align === textAlignment);
    });
  }
  if (data.alignment?.interactMode) {
    interactMode = data.alignment.interactMode;
    document.querySelectorAll('#mouse-mode-btns .align-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === interactMode);
    });
  }

  // 8. Restore mesh
  if (data.mesh) {
    meshGreenTriad = data.mesh.greenTriad ?? 0;
    meshAccentIdx  = data.mesh.accentIdx  ?? 0;
    if (Array.isArray(data.mesh.points) && data.mesh.points.length > 0) {
      _meshNextId = 0;
      meshPoints = data.mesh.points.map(p => ({
        id: _meshNextId++, x: p.x, y: p.y,
        color: p.color, weight: p.weight || 1.0,
      }));
      meshSelectedId = meshPoints[0].id;
    }
  }

  // 9. Refresh palette UI
  _updateAllTriadSwatches();
  _updateTriadEditRow();
  _updateAccentBtns();
}

// ── Global wiring ──────────────────────────────────────────────────────────────

window.saveHighRes     = downloadHighRes;
window.saveSettings    = saveSettings;
window.exportSettings  = exportSettings;
window.toggleGrowth    = function () { growthPaused = !growthPaused; _updateStopBtn(); };
window.toggleRecording = function () { isRecording ? stopRecording() : startRecording(); };

window.exportEmbed = function () {
  if (!embedSourceBase64) { alert('Render something first.'); return; }
  const S = {
    artW: getArtboardW(), artH: getArtboardH(),
    masterScale: parseFloat(document.getElementById('sld-master-scale').value),
    margin:      parseFloat(document.getElementById('sld-margin').value),
    density:     parseFloat(document.getElementById('sld-density').value),
    cluster:     parseFloat(document.getElementById('sld-cluster').value),
    displace:    parseFloat(document.getElementById('sld-displace').value),
    threshold:   parseFloat(document.getElementById('sld-threshold').value),
    len:         parseFloat(document.getElementById('sld-len').value),
    weight:      parseFloat(document.getElementById('sld-weight').value),
    sway:        parseFloat(document.getElementById('sld-sway').value),
    spawnFreq:   parseFloat(document.getElementById('sld-spawn-freq').value),
    drawSpeed:   parseFloat(document.getElementById('sld-draw-speed').value),
    windSpeed:   parseFloat(document.getElementById('sld-wind-speed').value),
    s1: parseFloat(document.getElementById('sld-s1').value), s2: parseFloat(document.getElementById('sld-s2').value),
    s3: parseFloat(document.getElementById('sld-s3').value), s4: parseFloat(document.getElementById('sld-s4').value),
    c1: parseFloat(document.getElementById('sld-c1').value), c2: parseFloat(document.getElementById('sld-c2').value),
    c3: parseFloat(document.getElementById('sld-c3').value), c4: parseFloat(document.getElementById('sld-c4').value),
    r1: parseFloat(document.getElementById('sld-r1').value), r2: parseFloat(document.getElementById('sld-r2').value),
    r3: parseFloat(document.getElementById('sld-r3').value), r4: parseFloat(document.getElementById('sld-r4').value),
    mouseStrength: parseFloat(document.getElementById('sld-mouse-strength').value),
    mouseRadius:   parseFloat(document.getElementById('sld-mouse-radius').value),
    canvasScale: getCanvasScale(),
    interactMode, autoStop: 35
  };
  const html = buildEmbedHTML(embedSourceBase64, S);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'meadow-embed.html'; a.click();
  URL.revokeObjectURL(a.href);
};

window.toggleUI = function () {
  const sidebar = document.getElementById('sidebar');
  const tab     = document.getElementById('ui-toggle-tab');
  const tabBtn  = document.getElementById('ui-toggle-tab-btn');
  sidebarVisible = !sidebarVisible;
  sidebar.style.display = sidebarVisible ? '' : 'none';
  tab.style.left        = sidebarVisible ? SIDEBAR_W + 'px' : '0px';
  tabBtn.textContent    = sidebarVisible ? 'HIDE' : 'SHOW';
  resizeCanvas(windowWidth - (sidebarVisible ? SIDEBAR_W : 0), windowHeight);
};

// ── Internal button state helpers ──────────────────────────────────────────────

function _updateStopBtn() {
  const btn = document.getElementById('btn-stop-grow');
  if (!btn) return;
  btn.textContent      = growthPaused ? 'Resume Growing' : 'Stop Growing';
  btn.style.background = growthPaused ? '#fff' : '#EF3330';
  btn.style.color      = growthPaused ? '#EF3330' : '#fff';
  btn.style.border     = '1px solid #EF3330';
}

function _updateRecordBtn() {
  const btn = document.getElementById('btn-record');
  const dot = document.getElementById('rec-dot');
  if (!btn || !dot) return;
  if (isRecording) {
    btn.textContent = '■ Stop Recording';
    btn.style.background = '#fff'; btn.style.color = '#EF3330'; btn.style.border = '1px solid #EF3330';
    dot.classList.add('active');
  } else {
    btn.textContent = '● Record Video';
    btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
    dot.classList.remove('active');
  }
}

// ── Mode toggle ────────────────────────────────────────────────────────────────

function initModeToggle() {
  const btnGradient   = document.getElementById('btn-gradient-mode');
  const btnImage      = document.getElementById('btn-image-mode');
  const gradientPanel = document.getElementById('gradient-mode-panel');
  const imagePanel    = document.getElementById('image-mode-panel');
  const typoSection   = document.getElementById('typography-section');

  function updateTypoVisibility() {
    const show = (currentMode === 'gradient' && gradientUseText) ||
                 (currentMode === 'image'    && imageUseText);
    typoSection.style.display = show ? 'block' : 'none';
  }

  function setMode(mode) {
    currentMode = mode;
    btnGradient.classList.toggle('active', mode === 'gradient');
    btnImage.classList.toggle('active',    mode === 'image');
    gradientPanel.style.display = mode === 'gradient' ? 'block' : 'none';
    imagePanel.style.display    = mode === 'image'    ? 'block' : 'none';
    updateTypoVisibility();
  }

  setMode('gradient');

  btnGradient.addEventListener('click', () => {
    setMode('gradient');
    showGrowth = false;
    _scheduleGradientPreview(0);
  });
  btnImage.addEventListener('click', () => {
    setMode('image');
    showGrowth = false;
    if (imageUseText) _scheduleTextPreview(50);
  });

  // ── Gradient sub-toggle ────────────────────────────────────────────────────

  document.getElementById('btn-grad-full').addEventListener('click', () => {
    gradientUseText = false;
    document.getElementById('btn-grad-full').classList.add('active');
    document.getElementById('btn-grad-text').classList.remove('active');
    updateTypoVisibility();
    showGrowth = false;
    _scheduleGradientPreview(0);
  });
  document.getElementById('btn-grad-text').addEventListener('click', () => {
    gradientUseText = true;
    document.getElementById('btn-grad-text').classList.add('active');
    document.getElementById('btn-grad-full').classList.remove('active');
    updateTypoVisibility();
    showGrowth = false;
    _scheduleGradientPreview(0);
  });

  // ── Image sub-toggle ───────────────────────────────────────────────────────

  document.getElementById('btn-img-text').addEventListener('click', () => {
    imageUseText = true;
    document.getElementById('btn-img-text').classList.add('active');
    document.getElementById('btn-img-full').classList.remove('active');
    document.getElementById('img-photo-section').style.display = 'block';
    document.getElementById('img-full-hint').style.display     = 'none';
    updateTypoVisibility();
    showGrowth = false;
    _scheduleTextPreview(50);
  });
  document.getElementById('btn-img-full').addEventListener('click', () => {
    imageUseText = false;
    document.getElementById('btn-img-full').classList.add('active');
    document.getElementById('btn-img-text').classList.remove('active');
    document.getElementById('img-photo-section').style.display = 'none';
    document.getElementById('img-full-hint').style.display     = 'block';
    updateTypoVisibility();
  });

  // ── Mesh editor ────────────────────────────────────────────────────────────

  _initMeshEditor('mesh-grad');
  _initMeshDocumentDrag();

  document.getElementById('inp-mesh-color').addEventListener('input', e => {
    const pt = meshPoints.find(p => p.id === meshSelectedId);
    if (pt) { pt.color = e.target.value; _meshEditorUpdate(); }
  });

  document.getElementById('inp-mesh-weight').addEventListener('input', e => {
    const pt = meshPoints.find(p => p.id === meshSelectedId);
    if (pt) { pt.weight = parseFloat(e.target.value); _meshEditorUpdate(); }
  });

  document.getElementById('btn-mesh-del').addEventListener('click', () => {
    if (meshPoints.length <= 2) return;
    meshPoints = meshPoints.filter(p => p.id !== meshSelectedId);
    meshSelectedId = meshPoints[0]?.id ?? null;
    _meshEditorUpdate();
  });

  document.getElementById('btn-mesh-randomize').addEventListener('click', _meshRandomize);

  document.querySelectorAll('#triad-btns .triad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      meshGreenTriad = parseInt(btn.dataset.triad);
      _updateTriadEditRow();
      _meshRandomize();
    });
  });

  // Triad color editing
  ['triad-c0','triad-c1','triad-c2'].forEach((id, pos) => {
    const el = document.getElementById(id);
    if (!el) return;
    // mousedown: apply this triad shade to the currently selected point immediately
    el.addEventListener('mousedown', () => {
      const pt = meshPoints.find(p => p.id === meshSelectedId);
      if (pt) pt.color = meshGreenTriads[meshGreenTriad][pos];
      _meshEditorUpdate();
    });
    // change: redefine the triad shade + update all matching points
    el.addEventListener('change', e => {
      const oldColor = meshGreenTriads[meshGreenTriad][pos];
      meshGreenTriads[meshGreenTriad][pos] = e.target.value;
      meshPoints.forEach(pt => { if (pt.color === oldColor) pt.color = e.target.value; });
      _updateTriadSwatches(meshGreenTriad);
      _meshEditorUpdate();
    });
  });

  // Accent color inputs: mousedown = select + apply to selected point; change = redefine + update all matching
  document.querySelectorAll('#accent-btns .accent-btn').forEach(inp => {
    inp.addEventListener('mousedown', () => {
      meshAccentIdx = parseInt(inp.dataset.accent);
      const pt = meshPoints.find(p => p.id === meshSelectedId);
      if (pt) pt.color = meshAccents[meshAccentIdx];
      document.querySelectorAll('#accent-btns .accent-btn').forEach(b => b.classList.remove('active'));
      inp.classList.add('active');
      _meshEditorUpdate();
    });
    inp.addEventListener('change', e => {
      const idx      = parseInt(inp.dataset.accent);
      const oldColor = meshAccents[idx];
      meshAccents[idx] = e.target.value;
      meshPoints.forEach(pt => { if (pt.color === oldColor) pt.color = e.target.value; });
      _meshEditorUpdate();
    });
  });

  document.getElementById('btn-grad-render').addEventListener('click', () => {
    gradientUseText ? renderGradientOnTextComposition() : renderGradientComposition();
  });

  // ── Image mode ─────────────────────────────────────────────────────────────

  document.getElementById('btn-render-image').addEventListener('click', () => {
    imageUseText ? renderTextComposition() : restartGrowth();
  });

  document.getElementById('txt-photo-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const htmlImg = new Image();
    htmlImg.onload = () => { textPhotoElement = htmlImg; _scheduleTextPreview(0); };
    htmlImg.src = URL.createObjectURL(file);
  });

  // ── Shared typography controls ─────────────────────────────────────────────

  document.getElementById('txt-content').addEventListener('input', () => {
    if      (currentMode === 'gradient' && gradientUseText) _scheduleGradientPreview(250);
    else if (currentMode === 'image'    && imageUseText)    _scheduleTextPreview(300);
  });

  ['txt-font-size','txt-letter-spacing','txt-line-height','txt-pos-x','txt-pos-y'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      if      (currentMode === 'gradient' && gradientUseText) _scheduleGradientPreview(150);
      else if (currentMode === 'image'    && imageUseText)    _scheduleTextPreview(150);
    });
  });

  ['txt-font-family','txt-font-weight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
      if      (currentMode === 'gradient' && gradientUseText) _scheduleGradientPreview(100);
      else if (currentMode === 'image'    && imageUseText)    _scheduleTextPreview(100);
    });
  });

  document.querySelectorAll('#txt-alignment-btns .align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#txt-alignment-btns .align-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      textAlignment = btn.dataset.align;
      if      (currentMode === 'gradient' && gradientUseText) _scheduleGradientPreview(0);
      else if (currentMode === 'image'    && imageUseText)    _scheduleTextPreview(0);
    });
  });

  ['txt-photo-x','txt-photo-y','txt-photo-scale'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => _scheduleTextPreview(150));
  });

  document.getElementById('btn-load-custom-font').addEventListener('click', () => {
    loadCustomFont(document.getElementById('txt-custom-font').value);
  });

  // ── Interaction mode ───────────────────────────────────────────────────────

  document.querySelectorAll('#mouse-mode-btns .align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mouse-mode-btns .align-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      interactMode = btn.dataset.mode;
    });
  });

  // ── Collapsible sections ───────────────────────────────────────────────────

  document.querySelectorAll('.section.collapsible .section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.section').classList.toggle('open');
    });
  });
}

// ── Text compositing ───────────────────────────────────────────────────────────

function renderTextComposition() {
  const lines         = document.getElementById('txt-content').value.split('\n');
  const fontFamily    = document.getElementById('txt-font-family').value;
  const fontSize      = parseInt(document.getElementById('txt-font-size').value);
  const fontWeight    = document.getElementById('txt-font-weight').value;
  const letterSpacing = parseInt(document.getElementById('txt-letter-spacing').value);
  const lineHMult     = parseFloat(document.getElementById('txt-line-height').value);
  const textXPct      = parseInt(document.getElementById('txt-pos-x').value) / 100;
  const textYPct      = parseInt(document.getElementById('txt-pos-y').value) / 100;
  const photoXPct     = parseInt(document.getElementById('txt-photo-x').value) / 100;
  const photoYPct     = parseInt(document.getElementById('txt-photo-y').value) / 100;
  const photoScale    = parseFloat(document.getElementById('txt-photo-scale').value);
  const artW = getArtboardW(), artH = getArtboardH();
  const lineHeight = fontSize * lineHMult;
  const fontString = fontWeight + ' ' + fontSize + 'px ' + fontFamily;

  const compCanvas = document.createElement('canvas');
  compCanvas.width = artW; compCanvas.height = artH;
  const cc = compCanvas.getContext('2d');

  if (textPhotoElement) {
    const srcW = textPhotoElement.naturalWidth, srcH = textPhotoElement.naturalHeight;
    const coverScale = Math.max(artW / srcW, artH / srcH);
    const finalScale = coverScale * Math.max(photoScale, 1.0);
    const drawW = srcW * finalScale, drawH = srcH * finalScale;
    const panX  = (photoXPct - 0.5) * (drawW - artW);
    const panY  = (photoYPct - 0.5) * (drawH - artH);
    cc.drawImage(textPhotoElement, artW / 2 - drawW / 2 + panX, artH / 2 - drawH / 2 + panY, drawW, drawH);
  } else {
    cc.fillStyle = '#111111'; cc.fillRect(0, 0, artW, artH);
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = artW; maskCanvas.height = artH;
  const mc = maskCanvas.getContext('2d');
  mc.fillStyle = 'black'; mc.font = fontString; mc.textBaseline = 'top';
  if ('letterSpacing' in mc) mc.letterSpacing = letterSpacing + 'px';
  const totalTextH = lines.length * lineHeight;
  const blockTop   = textYPct * artH - totalTextH / 2;
  for (let i = 0; i < lines.length; i++) {
    const lineW = _measureLine(mc, lines[i], letterSpacing);
    const baseX = textXPct * artW;
    const y     = blockTop + i * lineHeight;
    const x     = textAlignment === 'center' ? baseX - lineW / 2 : textAlignment === 'right' ? baseX - lineW : baseX;
    if ('letterSpacing' in mc) mc.fillText(lines[i], x, y);
    else _drawSpaced(mc, lines[i], x, y, letterSpacing);
  }

  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(maskCanvas, 0, 0);
  cc.globalCompositeOperation = 'source-over';

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = artW; finalCanvas.height = artH;
  const fc = finalCanvas.getContext('2d');
  fc.fillStyle = 'white'; fc.fillRect(0, 0, artW, artH);
  fc.drawImage(compCanvas, 0, 0);

  const dataURL = finalCanvas.toDataURL('image/jpeg', 0.92);
  embedSourceBase64 = dataURL;
  loadImage(dataURL, loaded => { img = loaded; restartGrowth(); });
}

function _measureLine(ctx, line, letterSpacing) {
  if ('letterSpacing' in ctx) return ctx.measureText(line).width;
  let w = 0;
  for (let i = 0; i < line.length; i++) {
    w += ctx.measureText(line[i]).width;
    if (i < line.length - 1) w += letterSpacing;
  }
  return w;
}

function _drawSpaced(ctx, line, startX, y, letterSpacing) {
  let x = startX;
  for (let i = 0; i < line.length; i++) {
    ctx.fillText(line[i], x, y);
    x += ctx.measureText(line[i]).width + letterSpacing;
  }
}

function loadCustomFont(name) {
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=' + trimmed.replace(/ /g, '+') + ':wght@100;300;400;600;700;900&display=swap';
  document.head.appendChild(link);
  const sel = document.getElementById('txt-font-family');
  const opt = document.createElement('option');
  opt.value = "'" + trimmed + "', sans-serif";
  opt.textContent = trimmed + ' (custom)';
  opt.selected = true;
  sel.appendChild(opt);
  document.fonts.load('700 40px \'' + trimmed + '\'').then(() => {
    if      (currentMode === 'gradient' && gradientUseText) _scheduleGradientPreview(0);
    else if (currentMode === 'image'    && imageUseText)    _scheduleTextPreview(0);
  });
}

// ── Embed HTML generator ───────────────────────────────────────────────────────

function buildEmbedHTML(base64, S) {
  const cfg = JSON.stringify(S);
  return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<style>\n*{margin:0;padding:0;box-sizing:border-box}\nhtml,body{width:100%;height:100%;overflow:hidden;background:#ffffff}\ncanvas{display:block}\n</style>\n</head>\n<body>\n' +
'<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"><' + '/script>\n<script>\n' +
'var C=' + cfg + ';\nvar SRC="' + base64 + '";\n' +
'var img,buf,blades=[],seeds=[],si=0,wt=0,going=false;\n' +
'var ES=4,bMX=0,bMY=0,dW=0,dH=0,dOX=0,dOY=0;\n' +
'var growStart=0,growDone=false;\nvar mVX=0,mVY=0,pMX=0,pMY=0,wMag=0,wDir=0;\n' +
'function setup(){createCanvas(windowWidth,windowHeight);background(255);loadImage(SRC,function(i){img=i;boot();});}\n' +
'function windowResized(){resizeCanvas(windowWidth,windowHeight);}\n' +
'function boot(){var m=C.margin;img.resize(C.artW-m*2,0);if(img.height>C.artH-m*2)img.resize(0,C.artH-m*2);var bW=(img.width+m*2)*ES,bH=(img.height+m*2)*ES;buf=createGraphics(bW,bH);buf.clear();blades=[];seeds=[];si=0;wt=0;seeds=findSeeds();going=true;}\n' +
'function findSeeds(){var s=2,m=C.margin,dt=C.density,cs=C.cluster/100,wl=C.threshold,da=C.displace;img.loadPixels();var out=[];for(var x=s;x<img.width-s;x+=s){for(var y=s;y<img.height-s;y+=s){var c=img.get(x,y),br=(red(c)+green(c)+blue(c))/3;if(br>=wl)continue;var cn=noise(x*.04,y*.04),fc=map(cn,0,1,-cs,cs);if(random(100)<(dt+fc*100)){out.push({x:(x+m+random(-da,da))*ES,y:(y+m+random(-da,da))*ES,col:c});}}}return shuffle(out);}\n' +
'function draw(){if(!going)return;if(growStart===0)growStart=millis();if(!growDone&&(millis()-growStart)/1000>C.autoStop)growDone=true;wt+=C.windSpeed*0.0005;var csc=C.canvasScale||1;if(!growDone){for(var i=0;i<C.spawnFreq;i++){if(si<seeds.length){var s=seeds[si++];blades.push(new Blade(s.x,s.y,s.col));}}}buf.clear();buf.strokeWeight(C.weight*ES*csc);buf.noFill();dW=width;dH=(buf.height/buf.width)*width;if(dH>height){dH=height;dW=(buf.width/buf.height)*height;}dOX=(width-dW)/2;dOY=(height-dH)/2;bMX=map(mouseX,dOX,dOX+dW,0,buf.width);bMY=map(mouseY,dOY,dOY+dH,0,buf.height);var bSc=buf.width/dW;var rVX=(mouseX-pMX)*bSc,rVY=(mouseY-pMY)*bSc;pMX=mouseX;pMY=mouseY;var rMag=Math.sqrt(rVX*rVX+rVY*rVY);var mxR=buf.width*0.025,cl=rMag>mxR?mxR/rMag:1;mVX=mVX*0.9+rVX*cl*0.1;mVY=mVY*0.9+rVY*cl*0.1;var sm=Math.sqrt(mVX*mVX+mVY*mVY);wMag=Math.min(sm/mxR,1);wDir=sm>0.5?mVX/sm:0;for(var j=0;j<blades.length;j++){if(!growDone)blades[j].upd();blades[j].shw();}background(255);imageMode(CENTER);image(buf,width/2,height/2,dW,dH);}\n' +
'function Blade(x,y,c){this.x=x;this.y=y;this.c=c;var csc=C.canvasScale||1;var roll=random(0,C.c1+C.c2+C.c3+C.c4),bp,tj;if(roll<C.c1){bp=C.s1;tj=C.r1;}else if(roll<C.c1+C.c2){bp=C.s2;tj=C.r2;}else if(roll<C.c1+C.c2+C.c3){bp=C.s3;tj=C.r3;}else{bp=C.s4;tj=C.r4;}var j=random(1-tj,1+tj);this.ml=(bp*j)*C.len*C.masterScale*ES*csc;this.ws=noise(x*.01,y*.01);this.cl=0;this.gr=random(5,15)*ES*C.masterScale*csc;this.ba=-HALF_PI+random(-.2,.2);this.al=random(80,160);}\n' +
'Blade.prototype.upd=function(){if(this.cl<this.ml)this.cl+=this.gr*C.drawSpeed*0.1;};\n' +
'Blade.prototype.shw=function(){var c=this.c;buf.stroke(red(c),green(c),blue(c),this.al);var nv=noise(this.x/ES*.005,this.y/ES*.005,wt);var sw=C.sway*this.ws,wb=map(nv,0,1,-sw,sw);var dx=this.x-bMX,dy=this.y-bMY;var d=max(1,sqrt(dx*dx+dy*dy));var mr=buf.width*C.mouseRadius,mf=max(0,1-d/mr);var mb;if(C.interactMode==="attract"){mb=mf*C.mouseStrength*(-dx/d);}else if(C.interactMode==="wind"){mb=mf*C.mouseStrength*wDir*wMag;}else{mb=mf*C.mouseStrength*(dx/d);}var fa=this.ba+wb+mb;var cpx=this.x+cos(this.ba)*(this.cl*.5),cpy=this.y+sin(this.ba)*(this.cl*.5);var tx=this.x+cos(fa)*this.cl,ty=this.y+sin(fa)*this.cl;buf.beginShape();buf.vertex(this.x,this.y);buf.quadraticVertex(cpx,cpy,tx,ty);buf.endShape();};\n' +
'<' + '/script>\n</body>\n</html>';
}
