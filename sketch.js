let img;
let canvasBuffer;
let imgLoaded = false;
let exportScale = 4;

// Sliders (wired to DOM via domSlider())
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

// Display geometry (computed in draw, used by Blade.show for cursor interaction)
let dispW = 0, dispH = 0, dispOX = 0, dispOY = 0;
let bMouseX = 0, bMouseY = 0;

// Cursor interaction
let sldMouseStrength, sldMouseRadius;
let interactMode = 'repel';
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

// Text mode
let currentMode = 'image';
let textPhotoElement = null;
let textAlignment = 'center';

// Text preview
let textPreviewCanvas = null;
let _previewTimer = null;

// Photo drag (in text preview mode)
let isDraggingPhoto = false;
let _photoDragMX = 0, _photoDragMY = 0;
let _photoDragStartX = 50, _photoDragStartY = 50;

// Photo frame resize (text preview mode)
let isResizingPhoto = false;
let _resizeInitScale = 1.0;
let _resizeInitDist = 1.0;
let _resizePhotoCX = 0, _resizePhotoCY = 0;

// Draw mode
let drawLayer = null;
let isDrawingOnCanvas = false;
let _drawLastBX = -1, _drawLastBY = -1;
let drawTool = 'brush'; // 'brush' | 'eraser' | 'blur'

// Sidebar
let sidebarVisible = true;
const SIDEBAR_W = 260;

// ── DOM helpers ──────────────────────────────────────────────────────────────────────────────

function domSlider(id) {
  return { value: () => parseFloat(document.getElementById(id).value) };
}
function getArtboardW() { return parseInt(document.getElementById('inp-artboard-w').value) || 1200; }
function getArtboardH() { return parseInt(document.getElementById('inp-artboard-h').value) || 800; }

// ── p5 lifecycle ─────────────────────────────────────────────────────────────────────────────────

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
}

function windowResized() {
  resizeCanvas(windowWidth - (sidebarVisible ? SIDEBAR_W : 0), windowHeight);
}

// ── File handling ──────────────────────────────────────────────────────────────────────────

function handleFile(file) {
  if (file.type === 'image' && currentMode === 'image') {
    img = loadImage(file.data, () => restartGrowth());
  }
}

// ── Growth ────────────────────────────────────────────────────────────────────────────────────

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

// ── Draw loop ───────────────────────────────────────────────────────────────────────────────────

function draw() {
  // — Draw mode ———————————————————————————————————————————————————————————————
  if (currentMode === 'draw') {
    background(245);
    if (!drawLayer) { cursor(CROSS); return; }
    const arD = drawLayer.width / drawLayer.height;
    let dWd = width, dHd = width / arD;
    if (dHd > height) { dHd = height; dWd = height * arD; }
    dispOX = (width - dWd) / 2; dispOY = (height - dHd) / 2;
    dispW = dWd; dispH = dHd;
    image(drawLayer, dispOX, dispOY, dWd, dHd);
    cursor(CROSS);
    return;
  }

  // — Text preview mode ——————————————————————————————————————————————————————————
  if (currentMode === 'text' && textPreviewCanvas && !showGrowth) {
    background(250);
    const arT = textPreviewCanvas.width / textPreviewCanvas.height;
    let dWt = width, dHt = width / arT;
    if (dHt > height) { dHt = height; dWt = height * arT; }
    dispOX = (width - dWt) / 2; dispOY = (height - dHt) / 2;
    dispW = dWt; dispH = dHt;
    drawingContext.drawImage(textPreviewCanvas, dispOX, dispOY, dWt, dHt);

    if (textPhotoElement) {
      _drawPhotoFrame();
    } else {
      cursor(ARROW);
    }
    return;
  }

  // — Standard growth display ——————————————————————————————————————————————————————
  if (!imgLoaded) {
    background(255);
    cursor(ARROW);
    return;
  }
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

  canvasBuffer.clear();
  canvasBuffer.strokeWeight(sldWeight.value() * exportScale);
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
  _prevMX = mouseX;
  _prevMY = mouseY;
  const rawMag    = Math.sqrt(rawVelX * rawVelX + rawVelY * rawVelY);
  const maxRaw    = canvasBuffer.width * 0.025;
  const clamp     = rawMag > maxRaw ? maxRaw / rawMag : 1;
  const velSmooth = 0.90;
  mouseVelX = mouseVelX * velSmooth + rawVelX * clamp * (1 - velSmooth);
  mouseVelY = mouseVelY * velSmooth + rawVelY * clamp * (1 - velSmooth);

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

// ── Text preview ───────────────────────────────────────────────────────────────────────────────

function renderTextPreviewSync() {
  const lines        = document.getElementById('txt-content').value.split('\n');
  const fontFamily   = document.getElementById('txt-font-family').value;
  const fontSize     = parseInt(document.getElementById('txt-font-size').value);
  const fontWeight   = document.getElementById('txt-font-weight').value;
  const letterSpc    = parseInt(document.getElementById('txt-letter-spacing').value);
  const lineHMult    = parseFloat(document.getElementById('txt-line-height').value);
  const textXPct     = parseInt(document.getElementById('txt-pos-x').value) / 100;
  const textYPct     = parseInt(document.getElementById('txt-pos-y').value) / 100;
  const photoXPct    = parseInt(document.getElementById('txt-photo-x').value) / 100;
  const photoYPct    = parseInt(document.getElementById('txt-photo-y').value) / 100;
  const photoSc      = parseFloat(document.getElementById('txt-photo-scale').value);

  const artW = getArtboardW(), artH = getArtboardH();
  const lineHeight = fontSize * lineHMult;
  const fontStr = fontWeight + ' ' + fontSize + 'px ' + fontFamily;

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

    // Full photo at 75% opacity (visible outside letters)
    fc.globalAlpha = 0.75;
    fc.drawImage(textPhotoElement, drawX, drawY, dw, dh);
    fc.globalAlpha = 1.0;

    // Build text mask (letters = opaque, rest = transparent)
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

    // Photo clipped to letters at 100% opacity
    const comp = document.createElement('canvas');
    comp.width = artW; comp.height = artH;
    const cc = comp.getContext('2d');
    cc.drawImage(textPhotoElement, drawX, drawY, dw, dh);
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(mask, 0, 0);
    cc.globalCompositeOperation = 'source-over';
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
  if (currentMode === 'text') showGrowth = false; // always show preview when settings change
  if (typeof delay === 'undefined') delay = 250;
  if (_previewTimer) clearTimeout(_previewTimer);
  if (delay === 0) {
    renderTextPreviewSync();
  } else {
    _previewTimer = setTimeout(function () {
      renderTextPreviewSync();
      _previewTimer = null;
    }, delay);
  }
}

// ── Photo frame helpers ──────────────────────────────────────────────────────────────────────

function _getPhotoFrameInfo() {
  if (!textPhotoElement || dispW <= 0) return null;
  const artW = getArtboardW(), artH = getArtboardH();
  const photoXPct = parseInt(document.getElementById('txt-photo-x').value) / 100;
  const photoYPct = parseInt(document.getElementById('txt-photo-y').value) / 100;
  const photoSc   = parseFloat(document.getElementById('txt-photo-scale').value);
  const srcW = textPhotoElement.naturalWidth, srcH = textPhotoElement.naturalHeight;
  const cov = Math.max(artW / srcW, artH / srcH);
  const fsc = cov * Math.max(photoSc, 1.0);
  const dw  = srcW * fsc, dh = srcH * fsc;
  const panX = (photoXPct - 0.5) * (dw - artW);
  const panY = (photoYPct - 0.5) * (dh - artH);
  const scX = dispW / artW, scY = dispH / artH;
  return {
    fx: dispOX + (artW / 2 - dw / 2 + panX) * scX,
    fy: dispOY + (artH / 2 - dh / 2 + panY) * scY,
    fw: dw * scX,
    fh: dh * scY,
    cx: dispOX + (artW / 2 + panX) * scX,
    cy: dispOY + (artH / 2 + panY) * scY
  };
}

function _drawPhotoFrame() {
  const info = _getPhotoFrameInfo();
  if (!info) { cursor('grab'); return; }
  const { fx, fy, fw, fh, cx, cy } = info;

  push();
  noFill();
  stroke(80, 100, 220, 180);
  strokeWeight(1.5);
  drawingContext.setLineDash([6, 4]);
  rect(fx, fy, fw, fh);
  drawingContext.setLineDash([]);

  const hS = 9;
  const corners = [
    { x: fx,      y: fy      },
    { x: fx + fw, y: fy      },
    { x: fx,      y: fy + fh },
    { x: fx + fw, y: fy + fh },
  ];
  fill(255, 255, 255, 230);
  stroke(60, 80, 200);
  strokeWeight(1.5);
  for (const c of corners) {
    rect(c.x - hS / 2, c.y - hS / 2, hS, hS);
  }
  pop();

  // Cursor based on state
  let onHandle = false;
  for (const c of corners) {
    if (abs(mouseX - c.x) < 12 && abs(mouseY - c.y) < 12) { onHandle = true; break; }
  }
  if (isResizingPhoto || onHandle) cursor('nwse-resize');
  else if (isDraggingPhoto)        cursor('grabbing');
  else                             cursor('grab');
}

// ── Mouse events ──────────────────────────────────────────────────────────────────

function mousePressed() {
  // Text preview — check resize handles before drag
  if (currentMode === 'text' && textPreviewCanvas && !showGrowth && textPhotoElement) {
    const info = _getPhotoFrameInfo();
    if (info) {
      const { fx, fy, fw, fh, cx, cy } = info;
      const corners = [
        { x: fx,      y: fy      },
        { x: fx + fw, y: fy      },
        { x: fx,      y: fy + fh },
        { x: fx + fw, y: fy + fh },
      ];
      for (const c of corners) {
        if (abs(mouseX - c.x) < 12 && abs(mouseY - c.y) < 12) {
          isResizingPhoto = true;
          _resizePhotoCX  = cx;
          _resizePhotoCY  = cy;
          _resizeInitScale = parseFloat(document.getElementById('txt-photo-scale').value);
          _resizeInitDist  = Math.max(1, Math.sqrt((mouseX - cx) ** 2 + (mouseY - cy) ** 2));
          return false;
        }
      }
    }
    // Photo drag
    isDraggingPhoto = true;
    _photoDragMX = mouseX; _photoDragMY = mouseY;
    _photoDragStartX = parseInt(document.getElementById('txt-photo-x').value);
    _photoDragStartY = parseInt(document.getElementById('txt-photo-y').value);
    return false;
  }
  // Drawing
  if (currentMode === 'draw' && drawLayer) {
    isDrawingOnCanvas = true;
    const bx = map(mouseX, dispOX, dispOX + dispW, 0, drawLayer.width);
    const by = map(mouseY, dispOY, dispOY + dispH, 0, drawLayer.height);
    _drawLastBX = bx; _drawLastBY = by;
    _doDrawBrush(bx, by, bx, by);
    return false;
  }
}

function mouseDragged() {
  // Photo resize
  if (isResizingPhoto) {
    const curDist = Math.sqrt((mouseX - _resizePhotoCX) ** 2 + (mouseY - _resizePhotoCY) ** 2);
    let newScale = _resizeInitScale * (curDist / _resizeInitDist);
    newScale = Math.min(3.0, Math.max(0.1, newScale));
    const sl = document.getElementById('txt-photo-scale');
    sl.value = newScale.toFixed(2);
    sl.nextElementSibling.textContent = newScale.toFixed(2) + '×';
    _scheduleTextPreview(0);
    return false;
  }
  // Photo drag
  if (isDraggingPhoto) {
    const dx = mouseX - _photoDragMX;
    const dy = mouseY - _photoDragMY;
    const dxPct = (dx / dispW) * 100;
    const dyPct = (dy / dispH) * 100;
    const nx = Math.min(100, Math.max(0, _photoDragStartX + dxPct));
    const ny = Math.min(100, Math.max(0, _photoDragStartY + dyPct));
    const sx = document.getElementById('txt-photo-x');
    const sy = document.getElementById('txt-photo-y');
    sx.value = Math.round(nx); sx.nextElementSibling.textContent = Math.round(nx) + '%';
    sy.value = Math.round(ny); sy.nextElementSibling.textContent = Math.round(ny) + '%';
    _scheduleTextPreview(0);
    return false;
  }
  // Drawing
  if (isDrawingOnCanvas && drawLayer) {
    const bx = map(mouseX, dispOX, dispOX + dispW, 0, drawLayer.width);
    const by = map(mouseY, dispOY, dispOY + dispH, 0, drawLayer.height);
    _doDrawBrush(_drawLastBX, _drawLastBY, bx, by);
    _drawLastBX = bx; _drawLastBY = by;
    return false;
  }
}

function mouseReleased() {
  if (isDraggingPhoto)   isDraggingPhoto   = false;
  if (isResizingPhoto) { isResizingPhoto   = false; }
  isDrawingOnCanvas = false;
  _drawLastBX = -1; _drawLastBY = -1;
}

function mouseWheel(event) {
  if (currentMode === 'text' && textPreviewCanvas && !showGrowth) {
    const sl = document.getElementById('txt-photo-scale');
    let v = parseFloat(sl.value) - event.delta * 0.0005;
    v = Math.min(3.0, Math.max(0.1, v));
    sl.value = v.toFixed(2);
    sl.nextElementSibling.textContent = v.toFixed(2) + '×';
    _scheduleTextPreview(0);
    return false;
  }
}

// ── Drawing canvas helpers ──────────────────────────────────────────────────────────────────

function _doDrawBrush(x1, y1, x2, y2) {
  if (!drawLayer) return;

  if (drawTool === 'blur') {
    const scale  = drawLayer.width / dispW;
    const brushR = parseInt(document.getElementById('inp-brush-size').value) * scale;
    const dx = x2 - x1, dy = y2 - y1;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / (brushR * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      _doBlurBrush(x1 + dx * t, y1 + dy * t, brushR);
    }
    return;
  }

  const scale  = drawLayer.width / dispW;
  const brushD = parseInt(document.getElementById('inp-brush-size').value) * scale * 2;

  if (drawTool === 'eraser') {
    drawLayer.noStroke();
    drawLayer.fill(255, 255, 255, 255);
  } else {
    const hex = document.getElementById('inp-brush-color').value;
    const r   = parseInt(hex.slice(1, 3), 16);
    const g   = parseInt(hex.slice(3, 5), 16);
    const b   = parseInt(hex.slice(5, 7), 16);
    drawLayer.noStroke();
    drawLayer.fill(r, g, b, 255);
  }

  const dx = x2 - x1, dy = y2 - y1;
  const dist  = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(dist / (brushD * 0.3)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    drawLayer.ellipse(x1 + dx * t, y1 + dy * t, brushD, brushD);
  }
}

function _doBlurBrush(cx, cy, brushR) {
  if (!drawLayer) return;
  const strength = parseInt(document.getElementById('inp-blur-strength').value);
  const blurAmt  = Math.max(2, Math.round(brushR * strength * 0.03));
  const dlCtx    = drawLayer.drawingContext;
  const margin   = Math.ceil(blurAmt * 3);
  const sx  = Math.max(0, Math.floor(cx - brushR - margin));
  const sy  = Math.max(0, Math.floor(cy - brushR - margin));
  const sx2 = Math.min(drawLayer.width,  Math.ceil(cx + brushR + margin));
  const sy2 = Math.min(drawLayer.height, Math.ceil(cy + brushR + margin));
  const sw = sx2 - sx, sh = sy2 - sy;
  if (sw <= 0 || sh <= 0) return;

  const tmp  = document.createElement('canvas');
  tmp.width  = sw; tmp.height = sh;
  const tctx = tmp.getContext('2d');
  tctx.filter = `blur(${blurAmt}px)`;
  tctx.drawImage(drawLayer.elt, sx, sy, sw, sh, 0, 0, sw, sh);
  tctx.filter = 'none';

  dlCtx.save();
  dlCtx.beginPath();
  dlCtx.arc(cx, cy, brushR, 0, Math.PI * 2);
  dlCtx.clip();
  dlCtx.drawImage(tmp, sx, sy);
  dlCtx.restore();
}

window.clearDrawing = function () {
  if (drawLayer) {
    drawLayer.background(255);
    // Re-init with current source so clearing resets to original
    _initDrawLayerFromSource();
  }
};

window.applyDrawingAsSource = function () {
  if (!drawLayer) return;
  const dataURL = drawLayer.elt.toDataURL('image/png');
  loadImage(dataURL, function (loaded) {
    img = loaded;
    restartGrowth();
  });
};

function _initDrawLayerFromSource() {
  if (!drawLayer) return;
  drawLayer.background(255);
  if (textPreviewCanvas && textPreviewCanvas.width > 0) {
    try {
      drawLayer.drawingContext.drawImage(textPreviewCanvas, 0, 0, drawLayer.width, drawLayer.height);
    } catch (e) { /* silent */ }
  } else if (img) {
    try {
      drawLayer.drawingContext.drawImage(img.canvas, 0, 0, drawLayer.width, drawLayer.height);
    } catch (e) { /* silent */ }
  }
}

// ── Blade ────────────────────────────────────────────────────────────────────────────────────────

class Blade {
  constructor(x, y, c) {
    this.root = createVector(x, y);
    this.color = c;

    let roll = random(0, sldC1.value() + sldC2.value() + sldC3.value() + sldC4.value());
    let basePct, tierJitter;
    if (roll < sldC1.value()) {
      basePct = sldS1.value(); tierJitter = sldR1.value();
    } else if (roll < sldC1.value() + sldC2.value()) {
      basePct = sldS2.value(); tierJitter = sldR2.value();
    } else if (roll < sldC1.value() + sldC2.value() + sldC3.value()) {
      basePct = sldS3.value(); tierJitter = sldR3.value();
    } else {
      basePct = sldS4.value(); tierJitter = sldR4.value();
    }
    let jitter = random(1 - tierJitter, 1 + tierJitter);
    this.maxLen          = basePct * jitter * sldLen.value() * sldMasterScale.value() * exportScale;
    this.windSensitivity = noise(x * 0.01, y * 0.01);
    this.currentLen      = 0;
    this.baseGrowthRate  = random(5, 15) * exportScale * sldMasterScale.value();
    this.baseAngle       = -HALF_PI + random(-0.2, 0.2);
    this.alpha           = random(80, 160);
  }

  update() {
    if (this.currentLen < this.maxLen) {
      this.currentLen += this.baseGrowthRate * sldDrawSpeed.value() * 0.1;
    }
  }

  show() {
    let c = this.color;
    canvasBuffer.stroke(red(c), green(c), blue(c), this.alpha);

    let noiseVal   = noise(this.root.x / exportScale * 0.005, this.root.y / exportScale * 0.005, windTime);
    let windBend   = map(noiseVal, 0, 1, -sldSway.value() * this.windSensitivity, sldSway.value() * this.windSensitivity);

    let dx = this.root.x - bMouseX;
    let dy = this.root.y - bMouseY;
    let d  = max(1, sqrt(dx * dx + dy * dy));
    let mouseRadius  = canvasBuffer.width * sldMouseRadius.value();
    let mouseFalloff = max(0, 1 - d / mouseRadius);
    let strength     = sldMouseStrength.value();
    let mouseBend;
    if (interactMode === 'attract') {
      mouseBend = mouseFalloff * strength * (-dx / d);
    } else if (interactMode === 'wind') {
      mouseBend = mouseFalloff * strength * windDirX * windMagnitude;
    } else {
      mouseBend = mouseFalloff * strength * (dx / d);
    }

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

// ── Video recording ──────────────────────────────────────────────────────────────────────────────

function startRecording() {
  if (!imgLoaded || !canvasBuffer) {
    alert('Start growing something first.');
    return;
  }
  const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType  = mimeTypes.find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) {
    alert('Video recording is not supported in this browser.\nUse Chrome or Firefox.');
    return;
  }
  const bufAR = canvasBuffer.width / canvasBuffer.height;
  const recW  = Math.min(canvasBuffer.width, 1920);
  const recH  = Math.round(recW / bufAR);

  recordingCanvas = document.createElement('canvas');
  recordingCanvas.width  = recW;
  recordingCanvas.height = recH;

  const stream = recordingCanvas.captureStream(30);
  mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 25_000_000 });
  recordingChunks = [];

  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordingChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordingChunks, { type: mimeType.split(';')[0] });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'meadow.webm';
    a.click();
    URL.revokeObjectURL(a.href);
    recordingCanvas = null;
  };

  mediaRecorder.start(100);
  isRecording = true;
  _updateRecordBtn();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false;
  _updateRecordBtn();
}

// ── Export & keys ─────────────────────────────────────────────────────────────────────────────

function downloadHighRes() {
  if (canvasBuffer) save(canvasBuffer, 'meadow.png');
}

function keyPressed() {
  if (key === 's' || key === 'S') downloadHighRes();
  if (key === 'r' || key === 'R') {
    if (currentMode === 'text') renderTextComposition();
    else if (currentMode === 'draw') window.applyDrawingAsSource();
    else restartGrowth();
  }
}

function logSettings() {
  const ids = [
    'inp-artboard-w','inp-artboard-h','sld-master-scale',
    'sld-margin','sld-density','sld-cluster','sld-displace','sld-threshold',
    'sld-len','sld-weight','sld-sway','sld-spawn-freq','sld-draw-speed','sld-wind-speed',
    'sld-s1','sld-s2','sld-s3','sld-s4','sld-c1','sld-c2','sld-c3','sld-c4',
    'sld-r1','sld-r2','sld-r3','sld-r4'
  ];
  const out = {};
  ids.forEach(id => { const el = document.getElementById(id); if (el) out[id] = el.value; });
  console.log(JSON.stringify(out, null, 2));
}

// ── Global wiring ────────────────────────────────────────────────────────────────────────────

window.applyAndRestart = restartGrowth;
window.saveHighRes     = downloadHighRes;
window.logSettings     = logSettings;

window.toggleGrowth = function () {
  growthPaused = !growthPaused;
  _updateStopBtn();
};

window.toggleRecording = function () {
  isRecording ? stopRecording() : startRecording();
};

window.exportEmbed = function () {
  if (!embedSourceBase64) {
    alert('Please load an image or render text first, then click Apply & Restart.');
    return;
  }
  const S = {
    artW:       getArtboardW(),
    artH:       getArtboardH(),
    masterScale: parseFloat(document.getElementById('sld-master-scale').value),
    margin:     parseFloat(document.getElementById('sld-margin').value),
    density:    parseFloat(document.getElementById('sld-density').value),
    cluster:    parseFloat(document.getElementById('sld-cluster').value),
    displace:   parseFloat(document.getElementById('sld-displace').value),
    threshold:  parseFloat(document.getElementById('sld-threshold').value),
    len:        parseFloat(document.getElementById('sld-len').value),
    weight:     parseFloat(document.getElementById('sld-weight').value),
    sway:       parseFloat(document.getElementById('sld-sway').value),
    spawnFreq:  parseFloat(document.getElementById('sld-spawn-freq').value),
    drawSpeed:  parseFloat(document.getElementById('sld-draw-speed').value),
    windSpeed:  parseFloat(document.getElementById('sld-wind-speed').value),
    s1: parseFloat(document.getElementById('sld-s1').value),
    s2: parseFloat(document.getElementById('sld-s2').value),
    s3: parseFloat(document.getElementById('sld-s3').value),
    s4: parseFloat(document.getElementById('sld-s4').value),
    c1: parseFloat(document.getElementById('sld-c1').value),
    c2: parseFloat(document.getElementById('sld-c2').value),
    c3: parseFloat(document.getElementById('sld-c3').value),
    c4: parseFloat(document.getElementById('sld-c4').value),
    r1: parseFloat(document.getElementById('sld-r1').value),
    r2: parseFloat(document.getElementById('sld-r2').value),
    r3: parseFloat(document.getElementById('sld-r3').value),
    r4: parseFloat(document.getElementById('sld-r4').value),
    mouseStrength: parseFloat(document.getElementById('sld-mouse-strength').value),
    mouseRadius:   parseFloat(document.getElementById('sld-mouse-radius').value),
    interactMode:  interactMode,
    autoStop: 35
  };
  const html = buildEmbedHTML(embedSourceBase64, S);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'meadow-embed.html';
  a.click();
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

// ── Internal button state helpers ───────────────────────────────────────────────────────

function _updateStopBtn() {
  const btn = document.getElementById('btn-stop-grow');
  if (!btn) return;
  btn.textContent      = growthPaused ? 'Resume Growing' : 'Stop Growing';
  btn.style.background = growthPaused ? '#fff'    : '#EF3330';
  btn.style.color      = growthPaused ? '#EF3330' : '#fff';
  btn.style.border     = '1px solid #EF3330';
}

function _updateRecordBtn() {
  const btn = document.getElementById('btn-record');
  const dot = document.getElementById('rec-dot');
  if (!btn || !dot) return;
  if (isRecording) {
    btn.textContent = '■ Stop Recording';
    btn.style.background = '#fff';
    btn.style.color = '#EF3330';
    btn.style.border = '1px solid #EF3330';
    dot.classList.add('active');
  } else {
    btn.textContent = '● Record Video';
    btn.style.background = '';
    btn.style.color = '';
    btn.style.border = '';
    dot.classList.remove('active');
  }
}

// ── Mode toggle & text UI ──────────────────────────────────────────────────────────────────

function initModeToggle() {
  const btnImage   = document.getElementById('btn-image-mode');
  const btnText    = document.getElementById('btn-text-mode');
  const btnDraw    = document.getElementById('btn-draw-mode');
  const textPanel  = document.getElementById('text-mode-panel');
  const imagePanel = document.getElementById('image-mode-section');
  const drawPanel  = document.getElementById('draw-mode-panel');

  function setMode(mode) {
    currentMode = mode;
    btnImage.classList.toggle('active', mode === 'image');
    btnText.classList.toggle('active',  mode === 'text');
    if (btnDraw) btnDraw.classList.toggle('active', mode === 'draw');
    imagePanel.style.display = mode === 'image' ? 'block' : 'none';
    textPanel.style.display  = mode === 'text'  ? 'block' : 'none';
    if (drawPanel) drawPanel.style.display = mode === 'draw' ? 'block' : 'none';
  }

  btnImage.addEventListener('click', () => setMode('image'));

  btnText.addEventListener('click', () => {
    setMode('text');
    showGrowth = false;
    _scheduleTextPreview(50);
  });

  if (btnDraw) {
    btnDraw.addEventListener('click', () => {
      // Initialize draw layer with current content BEFORE switching mode
      const artW = getArtboardW(), artH = getArtboardH();
      if (drawLayer) { drawLayer.remove(); drawLayer = null; }
      drawLayer = createGraphics(artW, artH);
      drawLayer.background(255);

      if (textPreviewCanvas && textPreviewCanvas.width > 0) {
        try {
          drawLayer.drawingContext.drawImage(textPreviewCanvas, 0, 0, artW, artH);
        } catch (e) { /* silent */ }
      } else if (img) {
        try {
          drawLayer.drawingContext.drawImage(img.canvas, 0, 0, artW, artH);
        } catch (e) { /* silent */ }
      }

      setMode('draw');
    });
  }

  // Draw tool buttons (Brush / Eraser / Blur)
  document.querySelectorAll('#draw-tool-btns .align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#draw-tool-btns .align-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawTool = btn.dataset.tool;
    });
  });

  document.getElementById('btn-render-text').addEventListener('click', renderTextComposition);

  document.getElementById('btn-preview-text').addEventListener('click', () => {
    showGrowth = false;
    _scheduleTextPreview(0);
  });

  document.getElementById('btn-load-custom-font').addEventListener('click', () => {
    loadCustomFont(document.getElementById('txt-custom-font').value);
  });

  document.getElementById('txt-photo-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const htmlImg = new Image();
    htmlImg.onload = () => {
      textPhotoElement = htmlImg;
      _scheduleTextPreview(0);
    };
    htmlImg.src = URL.createObjectURL(file);
  });

  document.querySelectorAll('#txt-alignment-btns .align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#txt-alignment-btns .align-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      textAlignment = btn.dataset.align;
      _scheduleTextPreview(0);
    });
  });

  document.querySelectorAll('#mouse-mode-btns .align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mouse-mode-btns .align-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      interactMode = btn.dataset.mode;
    });
  });

  // Wire all text controls to live preview
  const previewSliders = [
    'txt-font-size', 'txt-letter-spacing', 'txt-line-height',
    'txt-pos-x', 'txt-pos-y', 'txt-photo-x', 'txt-photo-y', 'txt-photo-scale'
  ];
  previewSliders.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => _scheduleTextPreview(150));
  });
  const previewOther = ['txt-content'];
  previewOther.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => _scheduleTextPreview(300));
  });
  ['txt-font-family', 'txt-font-weight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => _scheduleTextPreview(100));
  });
}

// ── Text compositing ────────────────────────────────────────────────────────────────────────────

function renderTextComposition() {
  const lines          = document.getElementById('txt-content').value.split('\n');
  const fontFamily     = document.getElementById('txt-font-family').value;
  const fontSize       = parseInt(document.getElementById('txt-font-size').value);
  const fontWeight     = document.getElementById('txt-font-weight').value;
  const letterSpacing  = parseInt(document.getElementById('txt-letter-spacing').value);
  const lineHeightMult = parseFloat(document.getElementById('txt-line-height').value);
  const textXPct       = parseInt(document.getElementById('txt-pos-x').value) / 100;
  const textYPct       = parseInt(document.getElementById('txt-pos-y').value) / 100;
  const photoXPct      = parseInt(document.getElementById('txt-photo-x').value) / 100;
  const photoYPct      = parseInt(document.getElementById('txt-photo-y').value) / 100;
  const photoScale     = parseFloat(document.getElementById('txt-photo-scale').value);

  const artW       = getArtboardW();
  const artH       = getArtboardH();
  const lineHeight = fontSize * lineHeightMult;
  const fontString = fontWeight + ' ' + fontSize + 'px ' + fontFamily;

  const compCanvas    = document.createElement('canvas');
  compCanvas.width    = artW;
  compCanvas.height   = artH;
  const cc            = compCanvas.getContext('2d');

  if (textPhotoElement) {
    const srcW = textPhotoElement.naturalWidth;
    const srcH = textPhotoElement.naturalHeight;
    const coverScale = Math.max(artW / srcW, artH / srcH);
    const finalScale = coverScale * Math.max(photoScale, 1.0);
    const drawW = srcW * finalScale;
    const drawH = srcH * finalScale;
    const panX  = (photoXPct - 0.5) * (drawW - artW);
    const panY  = (photoYPct - 0.5) * (drawH - artH);
    cc.drawImage(textPhotoElement, artW / 2 - drawW / 2 + panX, artH / 2 - drawH / 2 + panY, drawW, drawH);
  } else {
    cc.fillStyle = '#111111';
    cc.fillRect(0, 0, artW, artH);
  }

  const maskCanvas    = document.createElement('canvas');
  maskCanvas.width    = artW;
  maskCanvas.height   = artH;
  const mc            = maskCanvas.getContext('2d');
  mc.fillStyle    = 'black';
  mc.font         = fontString;
  mc.textBaseline = 'top';
  if ('letterSpacing' in mc) mc.letterSpacing = letterSpacing + 'px';

  const totalTextH = lines.length * lineHeight;
  const blockTop   = textYPct * artH - totalTextH / 2;

  for (let i = 0; i < lines.length; i++) {
    const lineW = _measureLine(mc, lines[i], letterSpacing);
    const baseX = textXPct * artW;
    const y     = blockTop + i * lineHeight;
    const x     = textAlignment === 'center' ? baseX - lineW / 2
                : textAlignment === 'right'  ? baseX - lineW
                :                              baseX;
    if ('letterSpacing' in mc) mc.fillText(lines[i], x, y);
    else _drawSpaced(mc, lines[i], x, y, letterSpacing);
  }

  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(maskCanvas, 0, 0);
  cc.globalCompositeOperation = 'source-over';

  const finalCanvas  = document.createElement('canvas');
  finalCanvas.width  = artW;
  finalCanvas.height = artH;
  const fc           = finalCanvas.getContext('2d');
  fc.fillStyle = 'white';
  fc.fillRect(0, 0, artW, artH);
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
  const link    = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=' + trimmed.replace(/ /g, '+') + ':wght@100;300;400;600;700;900&display=swap';
  document.head.appendChild(link);
  const sel       = document.getElementById('txt-font-family');
  const opt       = document.createElement('option');
  opt.value       = "'" + trimmed + "', sans-serif";
  opt.textContent = trimmed + ' (custom)';
  opt.selected    = true;
  sel.appendChild(opt);
  document.fonts.load('700 40px \'' + trimmed + '\'').then(() => {
    console.log('Font "' + trimmed + '" ready.');
    if (currentMode === 'text') _scheduleTextPreview(0);
  });
}

// ── Embed HTML generator ───────────────────────────────────────────────────────────────────────

function buildEmbedHTML(base64, S) {
  const cfg = JSON.stringify(S);
  return '<!DOCTYPE html>\n' +
'<html>\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
'<style>\n' +
'*{margin:0;padding:0;box-sizing:border-box}\n' +
'html,body{width:100%;height:100%;overflow:hidden;background:#ffffff}\n' +
'canvas{display:block}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"><' + '/script>\n' +
'<script>\n' +
'var C=' + cfg + ';\n' +
'var SRC="' + base64 + '";\n' +
'var img,buf,blades=[],seeds=[],si=0,wt=0,going=false;\n' +
'var ES=4,bMX=0,bMY=0,dW=0,dH=0,dOX=0,dOY=0;\n' +
'var growStart=0,growDone=false;\n' +
'var mVX=0,mVY=0,pMX=0,pMY=0,wMag=0,wDir=0;\n' +
'\n' +
'function setup(){\n' +
'  createCanvas(windowWidth,windowHeight);\n' +
'  background(255);\n' +
'  loadImage(SRC,function(i){img=i;boot();});\n' +
'}\n' +
'\n' +
'function windowResized(){resizeCanvas(windowWidth,windowHeight);}\n' +
'\n' +
'function boot(){\n' +
'  var m=C.margin;\n' +
'  img.resize(C.artW-m*2,0);\n' +
'  if(img.height>C.artH-m*2) img.resize(0,C.artH-m*2);\n' +
'  var bW=(img.width+m*2)*ES,bH=(img.height+m*2)*ES;\n' +
'  buf=createGraphics(bW,bH);\n' +
'  buf.clear();\n' +
'  blades=[];seeds=[];si=0;wt=0;\n' +
'  seeds=findSeeds();\n' +
'  going=true;\n' +
'}\n' +
'\n' +
'function findSeeds(){\n' +
'  var s=2,m=C.margin,dt=C.density,cs=C.cluster/100,wl=C.threshold,da=C.displace;\n' +
'  img.loadPixels();\n' +
'  var out=[];\n' +
'  for(var x=s;x<img.width-s;x+=s){\n' +
'    for(var y=s;y<img.height-s;y+=s){\n' +
'      var c=img.get(x,y),br=(red(c)+green(c)+blue(c))/3;\n' +
'      if(br>=wl) continue;\n' +
'      var cn=noise(x*.04,y*.04),fc=map(cn,0,1,-cs,cs);\n' +
'      if(random(100)<(dt+fc*100)){\n' +
'        out.push({x:(x+m+random(-da,da))*ES,y:(y+m+random(-da,da))*ES,col:c});\n' +
'      }\n' +
'    }\n' +
'  }\n' +
'  return shuffle(out);\n' +
'}\n' +
'\n' +
'function draw(){\n' +
'  if(!going) return;\n' +
'  if(growStart===0) growStart=millis();\n' +
'  if(!growDone&&(millis()-growStart)/1000>C.autoStop) growDone=true;\n' +
'  wt+=C.windSpeed*0.0005;\n' +
'  if(!growDone){\n' +
'    for(var i=0;i<C.spawnFreq;i++){\n' +
'      if(si<seeds.length){var s=seeds[si++];blades.push(new Blade(s.x,s.y,s.col));}\n' +
'    }\n' +
'  }\n' +
'  buf.clear();\n' +
'  buf.strokeWeight(C.weight*ES);\n' +
'  buf.noFill();\n' +
'  dW=width;dH=(buf.height/buf.width)*width;\n' +
'  if(dH>height){dH=height;dW=(buf.width/buf.height)*height;}\n' +
'  dOX=(width-dW)/2;dOY=(height-dH)/2;\n' +
'  bMX=map(mouseX,dOX,dOX+dW,0,buf.width);\n' +
'  bMY=map(mouseY,dOY,dOY+dH,0,buf.height);\n' +
'  var bSc=buf.width/dW;\n' +
'  var rVX=(mouseX-pMX)*bSc,rVY=(mouseY-pMY)*bSc;\n' +
'  pMX=mouseX;pMY=mouseY;\n' +
'  var rMag=Math.sqrt(rVX*rVX+rVY*rVY);\n' +
'  var mxR=buf.width*0.025,cl=rMag>mxR?mxR/rMag:1;\n' +
'  mVX=mVX*0.9+rVX*cl*0.1;mVY=mVY*0.9+rVY*cl*0.1;\n' +
'  var sm=Math.sqrt(mVX*mVX+mVY*mVY);\n' +
'  wMag=Math.min(sm/mxR,1);wDir=sm>0.5?mVX/sm:0;\n' +
'  for(var j=0;j<blades.length;j++){\n' +
'    if(!growDone) blades[j].upd();\n' +
'    blades[j].shw();\n' +
'  }\n' +
'  background(255);\n' +
'  imageMode(CENTER);\n' +
'  image(buf,width/2,height/2,dW,dH);\n' +
'}\n' +
'\n' +
'function Blade(x,y,c){\n' +
'  this.x=x;this.y=y;this.c=c;\n' +
'  var roll=random(0,C.c1+C.c2+C.c3+C.c4),bp,tj;\n' +
'  if(roll<C.c1){bp=C.s1;tj=C.r1;}\n' +
'  else if(roll<C.c1+C.c2){bp=C.s2;tj=C.r2;}\n' +
'  else if(roll<C.c1+C.c2+C.c3){bp=C.s3;tj=C.r3;}\n' +
'  else{bp=C.s4;tj=C.r4;}\n' +
'  var j=random(1-tj,1+tj);\n' +
'  this.ml=(bp*j)*C.len*C.masterScale*ES;\n' +
'  this.ws=noise(x*.01,y*.01);\n' +
'  this.cl=0;\n' +
'  this.gr=random(5,15)*ES*C.masterScale;\n' +
'  this.ba=-HALF_PI+random(-.2,.2);\n' +
'  this.al=random(80,160);\n' +
'}\n' +
'Blade.prototype.upd=function(){\n' +
'  if(this.cl<this.ml) this.cl+=this.gr*C.drawSpeed*0.1;\n' +
'};\n' +
'Blade.prototype.shw=function(){\n' +
'  var c=this.c;\n' +
'  buf.stroke(red(c),green(c),blue(c),this.al);\n' +
'  var nv=noise(this.x/ES*.005,this.y/ES*.005,wt);\n' +
'  var sw=C.sway*this.ws,wb=map(nv,0,1,-sw,sw);\n' +
'  var dx=this.x-bMX,dy=this.y-bMY;\n' +
'  var d=max(1,sqrt(dx*dx+dy*dy));\n' +
'  var mr=buf.width*C.mouseRadius,mf=max(0,1-d/mr);\n' +
'  var mb;\n' +
'  if(C.interactMode==="attract"){mb=mf*C.mouseStrength*(-dx/d);}\n' +
'  else if(C.interactMode==="wind"){mb=mf*C.mouseStrength*wDir*wMag;}\n' +
'  else{mb=mf*C.mouseStrength*(dx/d);}\n' +
'  var fa=this.ba+wb+mb;\n' +
'  var cpx=this.x+cos(this.ba)*(this.cl*.5),cpy=this.y+sin(this.ba)*(this.cl*.5);\n' +
'  var tx=this.x+cos(fa)*this.cl,ty=this.y+sin(fa)*this.cl;\n' +
'  buf.beginShape();\n' +
'  buf.vertex(this.x,this.y);\n' +
'  buf.quadraticVertex(cpx,cpy,tx,ty);\n' +
'  buf.endShape();\n' +
'};\n' +
'<' + '/script>\n' +
'</body>\n' +
'</html>';
}
