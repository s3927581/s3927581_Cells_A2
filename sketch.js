// Fauvist cats — Tempo ramps over time (dark dominates)
// - White canvas; SVG only for sampling (scaled 1/7)
// - Two independent streams: BRIGHT and DARK (separate rates & budgets)
// - Per-type allocation: 85% current / 15% finished (keeps growing)
// - Tempo ramps: both streams speed up over time; DARK ramps harder → dominates
// - Bright +80 dots/s per completion; Dark +160, +240, +320... per completion (+80 mỗi lần)
// - NEW: Cứ mỗi 30 mèo tối hoàn tất, giảm tốc độ mèo sáng (mặc định -20%)
// - Dark stream activates after 13 bright completions
// mp0809 + ChatGPT

const SVG_PATH = "concung.svg";

// ===== BASE (original) =====
const CELL_BASE = 10;
const DOT_SIZE_BASE = [6, 22];
const RADIUS_BASE = 8;
const FILL_ALPHA = 75;

// Geometry (ưu tiên ellipse dài)
const CIRCLE_PROB = 0.15;
const ELLIPSE_RATIO = [2,5]; // width = base * ratio

// Color rules (BRIGHT)
const PROB_MONO = 0.6;
const PROB_ANALOG = 0.4;
const HUE_SHIFT = 18;
const MONO_S_VARIATION = 10;
const MONO_V_VARIATION = 18;

// Bright: vivid & glowing
const SAT_MIN = 85;
const BRIGHT_MIN = 85;
const VIBRANCY = 0.25; // kéo S → 100
const GLOW = 0.22;     // kéo V → 100

// Palette from SVG
const PALETTE_H_BINS = 18;
const PALETTE_MIN_COUNT = 30;

// ===== SCALE =====
const SCALE = 1 / 4;

// ===== SPEEDS (per-type, dots/second) =====
// Bắt đầu mạnh theo yêu cầu trước (180–280) → mặc định 220
let BRIGHT_RATE = 220;
let DARK_RATE   = 220;
const EMIT_MIN  = 180;
const EMIT_MAX  = 20000;              // headroom lớn để tăng tốc dần
const FRAME_CAP_PER_STREAM = 700;     // giới hạn dots/frame/stream để bảo vệ FPS

let brightBudget = 0;                 // ngân sách thời gian (bright)
let darkBudget   = 0;                 // ngân sách thời gian (dark)

// ===== TEMPO RAMPS (tăng tốc theo thời gian) =====
// multiplicative ramps: rate *= (1 + ramp * dt)
// DARK có ramp mạnh hơn và scale theo số mèo tối đã hoàn tất → sẽ áp đảo
const BRIGHT_RAMP_PER_SEC = 0.035;    // ~+3.5% mỗi giây (ghi chú cũ nói 1.5%)
const DARK_RAMP_PER_SEC   = 0.1;    // ~+8.2% mỗi giây (cơ bản)
const DARK_DOMINANCE_PER_DARK = 0.04; // +4%/s thêm cho mỗi mèo tối đã hoàn tất

// ===== PENALTY: giảm tốc mèo sáng theo số mèo tối =====
const BRIGHT_PENALTY_EVERY_DARK = 20;   // mỗi 30 mèo tối hoàn tất
const BRIGHT_PENALTY_FACTOR = 0.7;      // giảm 20% tốc độ mèo sáng (chỉnh nếu muốn)

// ===== HOP (move) =====
let HOP_RADIUS = 0;
const HOP_RADIUS_JITTER = 0.15;
const MAX_HOP_TRIES = 32;

// ===== PROGRESS =====
const TARGET_DOTS_PER_CELL = 0.5;

// ===== ALLOCATION (per-type) =====
const NEW_WEIGHT = 0.85; // 85% cho con đang vẽ (theo từng stream), 15% cho các con cũ cùng stream

// ===== GROWTH FOR FINISHED =====
const OLD_SCALE_START = 1.10;
const OLD_SCALE_GROWTH_PER_SEC = 0.02;
const OLD_SCALE_MAX = 1.50;

// ===== DARK MODE PALETTE (ưu tiên đỏ mạnh) =====
const DARK_RED_H = 0;
const DARK_GREEN_H = 120;
const DARK_ANALOG_SHIFT = 14;
const DARK_S_RANGE = { low: [0, 12], red: [70, 100], green: [60, 100], gray: [0, 12] };
const DARK_V_RANGE = { verylow: [5, 20], low: [20, 45], mid: [25, 55] };
const DARK_FAMILY_WEIGHTS = [
  { name: "red",   w: 0.55 },
  { name: "black", w: 0.20 },
  { name: "gray",  w: 0.15 },
  { name: "green", w: 0.10 },
];

// ===== BRIGHT→DARK SWITCH =====
const DARK_START_AFTER_BRIGHT = 5;

// ===== RUNTIME =====
let svgImg, refLayer, paintLayer;
let palette = [], cells = [];
let running = true;

// derived after scaling
let REF_W, REF_H, CELL_STEP, RADIUS;
let DOT_SIZE = [2, 6];

// current BRIGHT
let brightCenterX = 0, brightCenterY = 0;
let brightDots = 0, brightGoalDots = 1;
let brightCompletedCount = 0;

// current DARK
let darkActive = false;
let darkCenterX = 0, darkCenterY = 0;
let darkDots = 0, darkGoalDots = 1;
let darkBonusNext = 160; // +160, rồi +240, +320... (+80 mỗi lần)
let darkCompletedCount = 0;

// finished lists per-type
let finishedBright = []; // {cx, cy, scale}
let finishedDark   = []; // {cx, cy, scale}

function preload() { svgImg = loadImage(SVG_PATH); }

function setup() {
      const canvas = createCanvas(1920, 1080);   // giữ nguyên kích thước
  canvas.parent(document.querySelector('.sketch')); // ⚡ gắn vào div
  canvas.style('position', 'absolute');              // ⚡ phủ khít div
  pixelDensity(1);
  noSmooth();
  frameRate(60);

  // reference (scaled 1/7)
  REF_W = Math.max(1, Math.floor(width * SCALE));
  REF_H = Math.max(1, Math.floor(height * SCALE));
  refLayer = createGraphics(REF_W, REF_H);
  refLayer.clear();
  refLayer.image(svgImg, 0, 0, REF_W, REF_H);

  // accumulation
  paintLayer = createGraphics(width, height);
  paintLayer.clear();

  // scaled params
  CELL_STEP = Math.max(3, Math.round(CELL_BASE * SCALE));
  RADIUS    = Math.max(2, Math.round(RADIUS_BASE * SCALE));
  DOT_SIZE  = [
    Math.max(1.5, DOT_SIZE_BASE[0] * SCALE * 1.25),
    Math.max(3.0, DOT_SIZE_BASE[1] * SCALE * 1.25)
  ];

  palette = buildPalette(refLayer);
  buildCells(refLayer);

  // hop radius (xa hơn chút)
  HOP_RADIUS = Math.max(REF_W, REF_H) * 1.9;

  // start bright #1
  [brightCenterX, brightCenterY] = randomValidCenter();
  brightDots = 0;
  brightGoalDots = Math.max(1, Math.ceil(cells.length * TARGET_DOTS_PER_CELL));
  brightCompletedCount = 0;

  // dark stream inactive
  darkActive = false;
  darkDots = 0; darkGoalDots = 1; darkBonusNext = 160; darkCompletedCount = 0; darkBudget = 0;

  console.log(`Bright #1 started. Goal: ${brightGoalDots} | Rates: Bright=${BRIGHT_RATE} Dark=${DARK_RATE}`);
}

function draw() {
  background(255);
  image(paintLayer, 0, 0);
  if (!running) return;

  const dt = deltaTime / 1000.0;

  // ===== tempo ramps over time =====
  // Bright grows gently
  BRIGHT_RATE = clamp(BRIGHT_RATE * (1 + BRIGHT_RAMP_PER_SEC * dt), EMIT_MIN, EMIT_MAX);
  // Dark grows harder and scales with number of completed dark cats
  if (darkActive) {
    const darkRampNow = DARK_RAMP_PER_SEC + DARK_DOMINANCE_PER_DARK * darkCompletedCount;
    DARK_RATE = clamp(DARK_RATE * (1 + darkRampNow * dt), EMIT_MIN, EMIT_MAX);
  }

  // finished cats keep growing
  updateFinishedScales(dt);

  // accumulate per-type budgets
  brightBudget += BRIGHT_RATE * dt;
  if (darkActive) darkBudget += DARK_RATE * dt;

  // emit per-type with frame caps
  let toEmitBright = Math.min(FRAME_CAP_PER_STREAM, Math.floor(brightBudget));
  let toEmitDark   = darkActive ? Math.min(FRAME_CAP_PER_STREAM, Math.floor(darkBudget)) : 0;

  if (toEmitBright > 0) {
    const emittedBrightCurrent = emitDotsForType('bright', toEmitBright);
    brightBudget -= toEmitBright;
    brightDots += emittedBrightCurrent;
    if (brightDots >= brightGoalDots) onBrightComplete();
  }

  if (toEmitDark > 0) {
    const emittedDarkCurrent = emitDotsForType('dark', toEmitDark);
    darkBudget -= toEmitDark;
    darkDots += emittedDarkCurrent;
    if (darkDots >= darkGoalDots) onDarkComplete();
  }
}

function keyPressed() {
  if (key === ' ') running = !running;
  if (key === 's' || key === 'S') saveCanvas('fauvist-cats', 'png');
  if (key === 'r' || key === 'R') resetAll();
  // Điều chỉnh đồng thời cả hai stream (giữ nhịp tương đối)
  if (key === '[') { BRIGHT_RATE = max(EMIT_MIN, BRIGHT_RATE - 20); DARK_RATE = max(EMIT_MIN, DARK_RATE - 20); }
  if (key === ']') { BRIGHT_RATE = min(EMIT_MAX, BRIGHT_RATE + 20); DARK_RATE = min(EMIT_MAX, DARK_RATE + 20); }
}

function resetAll() {
  paintLayer.clear();
  finishedBright = [];
  finishedDark   = [];
  BRIGHT_RATE = 220;
  DARK_RATE   = 220;
  brightBudget = 0; darkBudget = 0;

  [brightCenterX, brightCenterY] = randomValidCenter();
  brightDots = 0;
  brightGoalDots = Math.max(1, Math.ceil(cells.length * TARGET_DOTS_PER_CELL));
  brightCompletedCount = 0;

  darkActive = false;
  darkDots = 0; darkGoalDots = 1; darkBonusNext = 160; darkCompletedCount = 0;
  console.log(`Reset → Bright #1 started. Goal: ${brightGoalDots}`);
}

// ===== COMPLETIONS =====
function onBrightComplete() {
  console.log(`Bright #${brightCompletedCount + 1} done: 100%.`);
  finishedBright.push({ cx: brightCenterX, cy: brightCenterY, scale: OLD_SCALE_START });

  // +80 dots/s mỗi lần hoàn tất
  BRIGHT_RATE = Math.min(EMIT_MAX, BRIGHT_RATE + 80);
  console.log(`Bright speed → ${Math.round(BRIGHT_RATE)} dots/s`);

  brightCompletedCount++;
  if (!darkActive && brightCompletedCount >= DARK_START_AFTER_BRIGHT) {
    spawnDarkAt(randomValidCenterSeparated(brightCenterX, brightCenterY, HOP_RADIUS * 0.6));
  }

  [brightCenterX, brightCenterY] = hopFrom(brightCenterX, brightCenterY);
  brightDots = 0;
  brightGoalDots = Math.max(1, Math.ceil(cells.length * TARGET_DOTS_PER_CELL));
  console.log(`Bright #${brightCompletedCount + 1} started. Goal: ${brightGoalDots}`);
}

function onDarkComplete() {
  console.log(`Dark cat done: 100%.`);
  finishedDark.push({ cx: darkCenterX, cy: darkCenterY, scale: OLD_SCALE_START });

  // +160, rồi +240, +320... (+80 mỗi lần)
  DARK_RATE = Math.min(EMIT_MAX, DARK_RATE + darkBonusNext);
  console.log(`Dark speed → ${Math.round(DARK_RATE)} dots/s (added ${darkBonusNext})`);
  darkBonusNext += 80;
  darkCompletedCount++;

  // === NEW: penalty cho BRIGHT mỗi 30 mèo tối ===
  if (darkCompletedCount % BRIGHT_PENALTY_EVERY_DARK === 0) {
    const before = BRIGHT_RATE;
    BRIGHT_RATE = Math.max(EMIT_MIN, BRIGHT_RATE * BRIGHT_PENALTY_FACTOR);
    console.log(`Bright penalty after ${darkCompletedCount} dark cats: ${Math.round(before)} → ${Math.round(BRIGHT_RATE)} dots/s`);
  }

  [darkCenterX, darkCenterY] = hopFrom(darkCenterX, darkCenterY);
  darkDots = 0;
  darkGoalDots = Math.max(1, Math.ceil(cells.length * TARGET_DOTS_PER_CELL));
  console.log(`Dark cat started. Goal: ${darkGoalDots}`);
}

function spawnDarkAt([cx, cy]) {
  darkActive = true;
  darkCenterX = cx; darkCenterY = cy;
  darkDots = 0;
  darkGoalDots = Math.max(1, Math.ceil(cells.length * TARGET_DOTS_PER_CELL));
  darkBonusNext = 160;
  darkBudget = 0; // tránh burst tích luỹ trước
  console.log(`Dark sequence activated @(${Math.round(cx)},${Math.round(cy)}). Goal: ${darkGoalDots}`);
}

// ===== EMITTER PER TYPE =====
// Trả về số dots đi vào CON ĐANG VẼ (để tính % hoàn thành)
function emitDotsForType(type, totalCount) {
  paintLayer.push();
  paintLayer.noStroke();
  paintLayer.colorMode(HSB, 360, 100, 100, 100);

  let toCurrent = 0;

  for (let k = 0; k < totalCount; k++) {
    // pick target trong CHÍNH LOẠI đó: current (85%) vs finished (15%)
    const finishedList = (type === 'bright') ? finishedBright : finishedDark;
    const useCurrent = (finishedList.length === 0) || (random() < NEW_WEIGHT);

    let cx, cy, scale;
    if (type === 'bright') {
      if (useCurrent) { cx = brightCenterX; cy = brightCenterY; scale = 1.0; }
      else { const o = finishedBright[Math.floor(random(finishedBright.length))]; cx = o.cx; cy = o.cy; scale = o.scale; }
    } else {
      if (useCurrent) { cx = darkCenterX; cy = darkCenterY; scale = 1.0; }
      else { const o = finishedDark[Math.floor(random(finishedDark.length))]; cx = o.cx; cy = o.cy; scale = o.scale; }
    }

    const cell = cells[Math.floor(random(cells.length))];

    // color
    let col;
    if (type === 'dark') {
      col = darkVariant(); // black/red/gray/deep green (favor red)
    } else {
      const anchor = nearestByHue(cell.base, palette) || cell.base;
      col = (random() < PROB_MONO) ? monochrome(anchor, MONO_S_VARIATION, MONO_V_VARIATION)
                                   : analogous(anchor, HUE_SHIFT);
      // vivid & bright
      col.s = clamp(pushTo100(Math.max(col.s, SAT_MIN), VIBRANCY) + random(0, 6), 0, 100);
      col.v = clamp(pushTo100(Math.max(col.v, BRIGHT_MIN), GLOW) + random(0, 8), 0, 100);
    }

    // position (ref → canvas), centered at (cx,cy), scaled
    const jitterX = randomGaussian(0, RADIUS * 0.5) * scale;
    const jitterY = randomGaussian(0, RADIUS * 0.5) * scale;
    const baseX = cx - (REF_W * scale) / 2 + cell.x * scale + jitterX;
    const baseY = cy - (REF_H * scale) / 2 + cell.y * scale + jitterY;

    // size
    const sizeBase = random(DOT_SIZE[0], DOT_SIZE[1]) * map(100 - cell.base.v, 0, 100, 0.9, 1.35);
    const finalSize = sizeBase * scale;

    // shape
    const circle = random() < CIRCLE_PROB;
    const ratio  = circle ? 1 : random(ELLIPSE_RATIO[0], ELLIPSE_RATIO[1]);
    const rot    = random(TWO_PI);

    paintLayer.fill(col.h, col.s, col.v, FILL_ALPHA);
    paintLayer.push();
    paintLayer.translate(baseX, baseY);
    paintLayer.rotate(rot);
    paintLayer.ellipse(0, 0, finalSize * ratio, finalSize);
    paintLayer.pop();

    if (useCurrent) toCurrent++;
  }

  paintLayer.pop();
  return toCurrent;
}

// ===== BUILD / HELPERS =====
function buildPalette(g) {
  const bins = new Array(PALETTE_H_BINS).fill(0).map(() => ({ h:0, s:0, v:0, n:0 }));
  g.loadPixels();
  for (let y = 0; y < g.height; y += CELL_STEP) {
    for (let x = 0; x < g.width; x += CELL_STEP) {
      const c = g.get(x, y);
      if (c[3] === 0) continue;
      const hsv = rgb2hsv(c[0], c[1], c[2]);
      const idx = Math.floor((hsv.h / 360) * PALETTE_H_BINS) % PALETTE_H_BINS;
      const bin = bins[idx];
      bin.h += hsv.h; bin.s += hsv.s; bin.v += hsv.v; bin.n++;
    }
  }
  const pal = [];
  bins.forEach(b => {
    if (b.n >= PALETTE_MIN_COUNT) pal.push({ h:(b.h/b.n+360)%360, s:b.s/b.n, v:b.v/b.n });
  });
  if (pal.length === 0) {
    bins.sort((a,b)=>b.n-a.n);
    for (let i=0;i<Math.min(6,bins.length);i++){
      if (bins[i].n>0) pal.push({
        h:(bins[i].h/bins[i].n+360)%360,
        s: bins[i].s/bins[i].n,
        v: bins[i].v/bins[i].n
      });
    }
  }
  return pal;
}

function buildCells(g) {
  cells.length = 0;
  for (let y = 0; y < g.height; y += CELL_STEP) {
    for (let x = 0; x < g.width; x += CELL_STEP) {
      const c = g.get(x, y);
      if (c[3] === 0) continue;
      const base = rgb2hsv(c[0], c[1], c[2]);
      const anchor = nearestByHue(base, palette) || base;
      cells.push({ x, y, base, anchor });
    }
  }
}

function updateFinishedScales(dt) {
  for (let i = 0; i < finishedBright.length; i++) {
    const c = finishedBright[i];
    c.scale = Math.min(OLD_SCALE_MAX, c.scale + OLD_SCALE_GROWTH_PER_SEC * dt);
  }
  for (let i = 0; i < finishedDark.length; i++) {
    const c = finishedDark[i];
    c.scale = Math.min(OLD_SCALE_MAX, c.scale + OLD_SCALE_GROWTH_PER_SEC * dt);
  }
}

function hopFrom(cx, cy) {
  let ok = false, tries = 0, nx = cx, ny = cy;
  while (!ok && tries < MAX_HOP_TRIES) {
    const ang = random(TWO_PI);
    const rad = HOP_RADIUS * random(1 - HOP_RADIUS_JITTER, 1 + HOP_RADIUS_JITTER);
    nx = cx + Math.cos(ang) * rad;
    ny = cy + Math.sin(ang) * rad;
    ok = isCenterInside(nx, ny);
    tries++;
  }
  if (!ok) return randomValidCenter();
  return [nx, ny];
}

function randomValidCenterSeparated(ax, ay, minDist) {
  let tries = 0;
  while (tries < 64) {
    const [cx, cy] = randomValidCenter();
    const dx = cx - ax, dy = cy - ay;
    if (Math.hypot(dx, dy) >= (minDist || 0)) return [cx, cy];
    tries++;
  }
  return randomValidCenter();
}

function isCenterInside(cx, cy) {
  return (
    cx - REF_W/2 >= 0 &&
    cy - REF_H/2 >= 0 &&
    cx + REF_W/2 <= width &&
    cy + REF_H/2 <= height
  );
}
function randomValidCenter() {
  const minX = REF_W / 2, maxX = width - REF_W / 2;
  const minY = REF_H / 2, maxY = height - REF_H / 2;
  return [ random(minX, maxX), random(minY, maxY) ];
}

// ===== Color helpers =====
function nearestByHue(hsv, pal) {
  if (!pal || pal.length === 0) return null;
  let best = pal[0], bestD = hueDist(hsv.h, pal[0].h);
  for (let i = 1; i < pal.length; i++) {
    const d = hueDist(hsv.h, pal[i].h);
    if (d < bestD) { best = pal[i]; bestD = d; }
  }
  return best;
}
function hueDist(a, b) { let d = Math.abs(a - b); return d > 180 ? 360 - d : d; }

function analogous(hsv, shiftDeg) {
  const dir = random() < 0.5 ? -1 : 1;
  const h = (hsv.h + dir * random(6, shiftDeg)) % 360;
  return { h: (h + 360) % 360, s: clamp(hsv.s + random(-8, 8), 0, 100), v: clamp(hsv.v + random(-6, 6), 0, 100) };
}
function monochrome(hsv, sVar, vVar) {
  return {
    h: hsv.h,
    s: clamp(hsv.s + random(-sVar, sVar), 0, 100),
    v: clamp(hsv.v + random(-vVar, vVar), 0, 100)
  };
}

// Dark variant generator (favor RED strongly)
function darkVariant() {
  const r = random();
  let pick = DARK_FAMILY_WEIGHTS[0].name, acc = 0;
  for (const f of DARK_FAMILY_WEIGHTS) { acc += f.w; if (r <= acc) { pick = f.name; break; } }
  if (pick === 'black') {
    return { h: 0, s: random(DARK_S_RANGE.low[0], DARK_S_RANGE.low[1]), v: random(DARK_V_RANGE.verylow[0], DARK_V_RANGE.verylow[1]) };
  }
  if (pick === 'gray')  {
    return { h: 0, s: random(DARK_S_RANGE.gray[0], DARK_S_RANGE.gray[1]), v: random(DARK_V_RANGE.mid[0], DARK_V_RANGE.mid[1]) };
  }
  if (pick === 'red') {
    const h = (DARK_RED_H + random(-DARK_ANALOG_SHIFT, DARK_ANALOG_SHIFT) + 360) % 360;
    return { h, s: random(DARK_S_RANGE.red[0], DARK_S_RANGE.red[1]), v: random(DARK_V_RANGE.mid[0], DARK_V_RANGE.mid[1]) };
  }
  // deep green
  const h = (DARK_GREEN_H + random(-DARK_ANALOG_SHIFT, DARK_ANALOG_SHIFT) + 360) % 360;
  return { h, s: random(DARK_S_RANGE.green[0], DARK_S_RANGE.green[1]), v: random(DARK_V_RANGE.low[0], DARK_V_RANGE.low[1]) };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pushTo100(v, k) { return v + (100 - v) * k; } // k in [0..1]

// RGB -> HSV (h:0..360, s/v:0..100)
function rgb2hsv(r, g, b) {
  r/=255; g/=255; b/=255;
  const maxv = Math.max(r,g,b), minv = Math.min(r,g,b), d = maxv - minv;
  let h = 0;
  if (d !== 0) {
    switch (maxv) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60; if (h < 0) h += 360;
  }
  const s = maxv === 0 ? 0 : d / maxv;
  const v = maxv;
  return { h, s: s*100, v: v*100 };
}
