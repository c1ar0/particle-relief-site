const canvas = document.querySelector('#particleCanvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const settingsPanel = document.querySelector('#hiddenSettings');
const settingsToggleHint = document.querySelector('#settingsToggleHint');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => prefersReducedMotion.matches;

const THEMES = {
  night: {
    name: '深夜',
    palette: [178, 196, 215, 246, 278, 316, 154],
    base: '#030612',
    soft: 'rgba(3, 6, 18, 0.255)',
    softReduced: 'rgba(3, 6, 18, 0.42)',
    orb: [190, 250],
  },
  dawn: {
    name: '晨雾',
    palette: [28, 42, 184, 198, 318, 344, 156],
    base: '#090512',
    soft: 'rgba(9, 5, 18, 0.25)',
    softReduced: 'rgba(9, 5, 18, 0.42)',
    orb: [28, 318],
  },
  forest: {
    name: '林息',
    palette: [92, 126, 154, 172, 196, 218, 46],
    base: '#02100d',
    soft: 'rgba(2, 16, 13, 0.265)',
    softReduced: 'rgba(2, 16, 13, 0.43)',
    orb: [126, 190],
  },
  ember: {
    name: '余温',
    palette: [12, 24, 36, 274, 316, 342, 204],
    base: '#100609',
    soft: 'rgba(16, 6, 9, 0.255)',
    softReduced: 'rgba(16, 6, 9, 0.43)',
    orb: [24, 316],
  },
};

const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
const isSmallScreen = Math.min(window.innerWidth || 360, window.innerHeight || 640) < 430;
const lowMemoryDevice = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const oldPhoneMode = isCoarsePointer && (isSmallScreen || lowMemoryDevice);
const frameInterval = oldPhoneMode ? 1000 / 24 : (isCoarsePointer ? 1000 / 30 : 1000 / 45);

const QUALITY = {
  performance: { label: '性能', density: 90000, min: 8, max: 20, cap: 36, dpr: 1, burst: 0.32, homeSpeed: 0.55 },
  soft: { label: '柔和', density: 72000, min: 10, max: 28, cap: 52, dpr: oldPhoneMode ? 1 : 1.25, burst: 0.45, homeSpeed: 0.7 },
  rich: { label: '丰富', density: 46000, min: 16, max: 44, cap: 90, dpr: oldPhoneMode ? 1.12 : 1.5, burst: 0.75, homeSpeed: 1 },
};
const qualityProfile = () => QUALITY[settings.quality] || QUALITY.soft;

const defaultSettings = {
  sound: false,
  haptics: false,
  orientation: false,
  theme: 'night',
  goals: false,
  quality: oldPhoneMode ? 'performance' : 'soft',
};

const SETTINGS_VERSION = 2;

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem('particleCalmSettings') || '{}');
    if (stored.version !== SETTINGS_VERSION) return { ...defaultSettings };
    return { ...defaultSettings, ...stored };
  } catch {
    return { ...defaultSettings };
  }
}

const settings = loadSettings();

let width = 1;
let height = 1;
let dpr = 1;
let timeScale = 1;
let hueDrift = 0;
let lastFrame = 0;
let lastPaint = 0;
let particles = [];
let ripples = [];
let fields = [];
let touchBlooms = [];
let idleTimer = 0;
let calmMode = false;
let orientationTilt = { x: 0, y: 0 };
let orientationReady = false;
let gestureState = null;
let gestureSpin = 0;
let gestureZoom = 0;
let settingsHoldTimer = 0;
let lastTapAt = 0;
let lastTempoToggleAt = 0;
let audioContext;
let lastToneAt = 0;
let calmGoal = { x: 0, y: 0, radius: 72, life: 0, progress: 0, hue: 190 };

const pointers = new Map();
const theme = () => THEMES[settings.theme] || THEMES.night;
const palette = () => theme().palette;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const pickHue = () => palette()[Math.floor(Math.random() * palette().length)] + rand(-8, 12);
const pointerList = () => [...pointers.values()];

window.particleCalm = {
  settings,
  openSettings: () => setSettingsPanel(true),
  closeSettings: () => setSettingsPanel(false),
  cycleTheme,
  cycleQuality,
  toggleSound: () => updateSetting('sound', !settings.sound),
  toggleHaptics: () => updateSetting('haptics', !settings.haptics),
  toggleOrientation: () => updateSetting('orientation', !settings.orientation),
  toggleGoals: () => updateSetting('goals', !settings.goals),
};

class Particle {
  constructor(x, y, options = {}) {
    const angle = options.angle ?? rand(0, Math.PI * 2);
    const speed = (options.speed ?? rand(0.015, 0.22)) * (reduced() ? 0.45 : 1);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = options.size ?? rand(10, 34);
    this.life = options.life ?? rand(180, 360);
    this.maxLife = this.life;
    this.hue = options.hue ?? pickHue();
    this.home = Boolean(options.home);
    this.seed = rand(0, Math.PI * 2);
    this.spin = rand(-0.018, 0.018);
    this.drag = options.drag ?? (this.home ? 0.992 : 0.982);
    this.kind = options.kind ?? 'mote';
  }

  update(dt, activePointers = []) {
    this.seed += this.spin * dt;

    const driftStrength = this.home ? 0.0018 : 0.0045;
    this.vx += Math.cos(this.seed + this.y * 0.0016) * driftStrength * dt;
    this.vy += Math.sin(this.seed + this.x * 0.0016) * driftStrength * dt;

    if (settings.orientation && orientationReady) {
      const tiltPower = this.home ? 0.0022 : 0.0044;
      this.vx += orientationTilt.x * tiltPower * dt;
      this.vy += orientationTilt.y * tiltPower * dt;
    }

    if (Math.abs(gestureSpin) > 0.0001 || Math.abs(gestureZoom) > 0.0001) {
      const cx = width * 0.5;
      const cy = height * 0.5;
      const dx = this.x - cx;
      const dy = this.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = clamp(1 - dist / Math.max(width, height), 0, 1);
      this.vx += (-dy / dist) * gestureSpin * reach * dt;
      this.vy += (dx / dist) * gestureSpin * reach * dt;
      this.vx += (dx / dist) * gestureZoom * reach * dt;
      this.vy += (dy / dist) * gestureZoom * reach * dt;
    }

    activePointers.forEach((point) => {
      const dx = point.x - this.x;
      const dy = point.y - this.y;
      const distSq = dx * dx + dy * dy;
      const radius = point.down ? 270 : 210;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 1;
        const proximity = 1 - dist / radius;
        const sign = calmMode ? -1 : 1;
        const force = proximity * (point.down ? 0.024 : 0.010) * sign * dt;
        this.vx += (dx / dist) * force;
        this.vy += (dy / dist) * force;
      }
    });

    fields.forEach((field) => {
      const dx = field.x - this.x;
      const dy = field.y - this.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < field.radius * field.radius) {
        const dist = Math.sqrt(distSq) || 1;
        const proximity = 1 - dist / field.radius;
        const age = field.life / field.maxLife;
        const swirl = field.swirl ?? 0;
        const force = proximity * field.power * age * dt;
        this.vx += (dx / dist) * force + (-dy / dist) * swirl * proximity * age * dt;
        this.vy += (dy / dist) * force + (dx / dist) * swirl * proximity * age * dt;
      }
    });

    this.vx *= Math.pow(this.drag, dt);
    this.vy *= Math.pow(this.drag, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= this.home ? 0.04 * dt : dt;

    if (this.home) {
      const margin = 56;
      if (this.x < -margin) this.x = width + margin;
      if (this.x > width + margin) this.x = -margin;
      if (this.y < -margin) this.y = height + margin;
      if (this.y > height + margin) this.y = -margin;
      if (this.life <= 0) this.life = this.maxLife;
    }
  }

  draw() {
  const q = qualityProfile();
  const alpha = clamp(this.life / this.maxLife, 0, 1);
  const pulse = 0.92 + Math.sin(this.seed * 1.2 + hueDrift * 0.006) * 0.08;
  const radius = this.size * (this.home ? pulse : 1 + (1 - alpha) * 0.65);
  const color = (this.hue + hueDrift + (calmMode ? 18 : 0)) % 360;
  const glowRadius = radius * (this.kind === 'spark' ? 2.4 : 2.25);

  const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowRadius);
  glow.addColorStop(0, `hsla(${color}, 56%, 82%, ${alpha * (this.home ? 0.075 : 0.13)})`);
  glow.addColorStop(0.46, `hsla(${color}, 50%, 62%, ${alpha * (this.home ? 0.036 : 0.06)})`);
    glow.addColorStop(1, `hsla(${color}, 58%, 40%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    if (!this.home) {
      ctx.fillStyle = `hsla(${color}, 46%, 88%, ${alpha * 0.28})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(1.2, radius * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function saveSettings() {
  localStorage.setItem('particleCalmSettings', JSON.stringify({ ...settings, version: SETTINGS_VERSION }));
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  document.body.dataset.theme = settings.theme;
  canvas.style.backgroundColor = theme().base;
}

function cycleTheme() {
  const keys = Object.keys(THEMES);
  settings.theme = keys[(keys.indexOf(settings.theme) + 1) % keys.length];
  saveSettings();
  applyTheme();
  burst(width * 0.5, height * 0.5, 12, true);
  tone('theme');
  buzz([12]);
  syncSettingsControls();
}

function cycleQuality() {
  const keys = Object.keys(QUALITY);
  settings.quality = keys[(keys.indexOf(settings.quality) + 1) % keys.length];
  saveSettings();
  particles = particles.filter((particle) => particle.home).slice(0, targetHomeCount());
  resize();
  syncSettingsControls();
}

function updateSetting(key, value) {
  settings[key] = value;
  saveSettings();
  if (key === 'theme') applyTheme();
  if (key === 'orientation' && value) requestOrientationAccess();
  if (key === 'goals' && value) placeGoal(true);
  syncSettingsControls();
}

function targetHomeCount() {
  const area = width * height;
  const q = qualityProfile();
  const mobileFactor = width < 720 ? 0.78 : 1;
  const reducedFactor = reduced() ? 0.72 : 1;
  return Math.round(clamp(area / q.density, q.min, q.max) * mobileFactor * reducedFactor);
}

function maxParticleCount() {
  const q = qualityProfile();
  return reduced() ? Math.round(q.cap * 0.72) : q.cap;
}

function seedHome() {
  const target = targetHomeCount();
  let homeCount = particles.filter((particle) => particle.home).length;
  while (homeCount < target) {
    particles.push(new Particle(rand(0, width), rand(0, height), {
      home: true,
      speed: rand(0.0025, 0.018) * qualityProfile().homeSpeed,
      size: rand(oldPhoneMode ? 34 : 24, oldPhoneMode ? 86 : 68),
      life: rand(3600, 7600),
      drag: 0.9992,
    }));
    homeCount += 1;
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, qualityProfile().dpr);
  width = Math.max(1, Math.floor(window.innerWidth));
  height = Math.max(1, Math.floor(window.visualViewport?.height || window.innerHeight));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = theme().base;
  ctx.fillRect(0, 0, width, height);
  seedHome();
  if (!calmGoal.x || calmGoal.x > width || calmGoal.y > height) placeGoal(true);
}

function trimParticles() {
  const limit = maxParticleCount();
  if (particles.length <= limit) return;
  const home = particles.filter((particle) => particle.home);
  const active = particles.filter((particle) => !particle.home).slice(-(limit - home.length));
  particles = home.concat(active);
}

function ensureAudio() {
  if (!settings.sound) return null;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function tone(kind = 'tap') {
  if (!settings.sound || reduced()) return;
  const now = performance.now();
  if (now - lastToneAt < 48) return;
  lastToneAt = now;
  const ac = ensureAudio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const base = kind === 'long' ? 174 : kind === 'double' ? 246 : kind === 'theme' ? 330 : kind === 'pinch' ? 220 : 196;
  osc.type = kind === 'pinch' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(base, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(base * (kind === 'double' ? 1.5 : 1.22), ac.currentTime + 0.22);
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.018 : 0.026, ac.currentTime + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.32);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.34);
}

function buzz(pattern) {
  if (settings.haptics && navigator.vibrate && !reduced()) navigator.vibrate(pattern);
}

function burst(x, y, amount = 36, gentle = false) {
  const count = Math.max(3, Math.round(amount * qualityProfile().burst * (reduced() ? 0.38 : 1)));
  const baseHue = pickHue();
  for (let i = 0; i < count; i += 1) {
    const ring = i / Math.max(1, count);
    const angle = ring * Math.PI * 2 + rand(-0.18, 0.18);
    particles.push(new Particle(x + rand(-4, 4), y + rand(-4, 4), {
      angle,
      speed: gentle ? rand(0.42, 2.1) : rand(0.8, 4.4),
      size: gentle ? rand(0.7, 2.2) : rand(0.9, 3.2),
      life: gentle ? rand(110, 220) : rand(70, 170),
      hue: baseHue + ring * 26,
      drag: gentle ? 0.988 : 0.974,
      kind: gentle ? 'mote' : 'spark',
    }));
  }
  ripples.push({ x, y, radius: 6, life: gentle ? 62 : 42, maxLife: gentle ? 62 : 42, hue: baseHue });
  fields.push({ x, y, radius: gentle ? 300 : 230, power: gentle ? 0.018 : -0.055, life: gentle ? 130 : 36, maxLife: gentle ? 130 : 36 });
  touchBlooms.push({ x, y, life: 74, maxLife: 74, hue: baseHue, gentle });
  trimParticles();
}

function stream(point) {
  const now = performance.now();
  const interval = oldPhoneMode ? 180 : (reduced() ? 220 : 120);
  if (now - point.lastStream < interval) return;
  point.lastStream = now;

  const dx = point.x - point.px;
  const dy = point.y - point.py;
  const angle = Math.atan2(dy, dx) + Math.PI + rand(-0.72, 0.72);
  const distance = Math.hypot(dx, dy);
  const amount = clamp(Math.round(distance / 34), 1, oldPhoneMode || reduced() ? 2 : 4);
  for (let i = 0; i < amount; i += 1) {
    particles.push(new Particle(point.x + rand(-7, 7), point.y + rand(-7, 7), {
      angle,
      speed: rand(0.06, 0.75),
      size: rand(1.4, 4.2),
      life: rand(130, 260),
      hue: pickHue(),
      drag: 0.986,
    }));
  }
}

function longPressBloom(point) {
  const heldFor = performance.now() - point.started;
  if (!point.longBloomed && heldFor > 560) {
    point.longBloomed = true;
    calmMode = true;
    burst(point.x, point.y, 18, true);
    fields.push({ x: point.x, y: point.y, radius: 360, power: 0.024, life: 240, maxLife: 240 });
    tone('long');
    buzz([20, 32, 20]);
  }
}

function placeGoal(immediate = false) {
  const margin = Math.min(width, height) * 0.18;
  calmGoal = {
    x: rand(margin, Math.max(margin, width - margin)),
    y: rand(margin, Math.max(margin, height - margin)),
    radius: clamp(Math.min(width, height) * rand(0.08, 0.13), 48, 92),
    life: immediate ? 180 : 0,
    progress: 0,
    hue: pickHue(),
  };
}

function drawGoal(dt, time) {
  if (!settings.goals) return;
  if (!calmGoal.x) placeGoal(true);
  calmGoal.life = Math.min(180, calmGoal.life + dt * 1.6);
  const alpha = clamp(calmGoal.life / 180, 0, 1) * (reduced() ? 0.24 : 0.32);
  const pulse = Math.sin(time * 0.0012) * 0.08 + calmGoal.progress * 0.28;
  const radius = calmGoal.radius * (1 + pulse);
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = `hsla(${(calmGoal.hue + hueDrift) % 360}, 48%, 78%, ${alpha})`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(calmGoal.x, calmGoal.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  const gradient = ctx.createRadialGradient(calmGoal.x, calmGoal.y, 0, calmGoal.x, calmGoal.y, radius * 1.8);
  gradient.addColorStop(0, `hsla(${(calmGoal.hue + hueDrift) % 360}, 54%, 74%, ${alpha * 0.12})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(calmGoal.x, calmGoal.y, radius * 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function updateGoal(dt) {
  if (!settings.goals || !calmGoal.x) return;
  const points = pointerList();
  const nearPointer = points.some((point) => point.down && Math.hypot(point.x - calmGoal.x, point.y - calmGoal.y) < calmGoal.radius * 1.28);
  const idleNear = !points.length && Math.hypot(width * 0.5 - calmGoal.x, height * 0.5 - calmGoal.y) < Math.min(width, height) * 0.32;
  if (nearPointer || idleNear) calmGoal.progress += dt * (nearPointer ? 0.018 : 0.004);
  else calmGoal.progress = Math.max(0, calmGoal.progress - dt * 0.006);
  if (calmGoal.progress >= 1) {
    burst(calmGoal.x, calmGoal.y, 12, true);
    fields.push({ x: calmGoal.x, y: calmGoal.y, radius: calmGoal.radius * 4, power: 0.018, life: 180, maxLife: 180 });
    tone('long');
    buzz([15]);
    placeGoal(false);
  }
}

function drawBackground(time) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = reduced() ? theme().softReduced : theme().soft;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'screen';
  const breath = 0.5 - Math.cos((time % 7600) / 7600 * Math.PI * 2) * 0.5;
  const radius = Math.min(width, height) * (0.22 + breath * 0.08);
  const x = width * 0.5 + Math.cos(time * 0.00013) * width * 0.06 + orientationTilt.x * 1.8;
  const y = height * 0.5 + Math.sin(time * 0.00016) * height * 0.055 + orientationTilt.y * 1.8;
  const orb = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.5);
  orb.addColorStop(0, `hsla(${theme().orb[0] + hueDrift}, 58%, 82%, ${reduced() ? 0.045 : 0.07})`);
  orb.addColorStop(0.42, `hsla(${theme().orb[1] + hueDrift}, 54%, 66%, ${reduced() ? 0.028 : 0.042})`);
  orb.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawRipples(dt) {
  ripples.forEach((ripple) => {
    const alpha = clamp(ripple.life / ripple.maxLife, 0, 1);
    ctx.strokeStyle = `hsla(${(ripple.hue + hueDrift) % 360}, 52%, 76%, ${alpha * 0.20})`;
    ctx.lineWidth = 0.7 + alpha * 1.9;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
    ripple.radius += (reduced() ? 2.8 : 4.8) * dt;
    ripple.life -= dt;
  });
  ripples = ripples.filter((ripple) => ripple.life > 0);
}

function drawTouchBlooms(dt) {
  touchBlooms.forEach((bloom) => {
    const alpha = clamp(bloom.life / bloom.maxLife, 0, 1);
    const radius = (1 - alpha) * (bloom.gentle ? 130 : 90) + 16;
    const gradient = ctx.createRadialGradient(bloom.x, bloom.y, 0, bloom.x, bloom.y, radius);
    gradient.addColorStop(0, `hsla(${(bloom.hue + hueDrift) % 360}, 54%, 80%, ${alpha * 0.055})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bloom.x, bloom.y, radius, 0, Math.PI * 2);
    ctx.fill();
    bloom.life -= dt;
  });
  touchBlooms = touchBlooms.filter((bloom) => bloom.life > 0);
}

function idleBreathe(dt) {
  idleTimer += dt;
  if (pointerList().length) return;
  const interval = reduced() ? 460 : 270;
  if (idleTimer > interval) {
    idleTimer = 0;
    const t = performance.now();
    const x = width * (0.5 + Math.cos(t * 0.00019) * 0.24) + rand(-18, 18);
    const y = height * (0.5 + Math.sin(t * 0.00023) * 0.20) + rand(-18, 18);
    burst(x, y, reduced() ? 8 : 14, true);
  }
}

function animate(now = 0) {
  const rawDt = lastFrame ? (now - lastFrame) / 16.666 : 1;
  lastFrame = now;
  const dt = clamp(rawDt, 0.45, 2.2) * timeScale;
  hueDrift = (hueDrift + (reduced() ? 0.006 : 0.024) * dt) % 360;
  gestureSpin *= Math.pow(0.935, dt);
  gestureZoom *= Math.pow(0.925, dt);

  drawBackground(now);
  drawGoal(dt, now);
  drawRipples(dt);
  drawTouchBlooms(dt);

  pointerList().forEach((point) => {
    if (point.down) {
      stream(point);
      longPressBloom(point);
    }
  });

  particles.forEach((particle) => {
    particle.update(dt);
    particle.draw();
  });

  particles = particles.filter((particle) => particle.home || (particle.life > 0 && particle.x > -180 && particle.x < width + 180 && particle.y > -180 && particle.y < height + 180));
  fields.forEach((field) => { field.life -= dt; });
  fields = fields.filter((field) => field.life > 0);
  if (!fields.length) calmMode = false;
  seedHome();
  trimParticles();
  updateGoal(dt);
  idleBreathe(dt);

  requestAnimationFrame(animate);
}

function maybeOpenHiddenSettings(point) {
  clearTimeout(settingsHoldTimer);
  const inCorner = point.x > width - 76 && point.y < 76;
  if (!inCorner) return;
  settingsHoldTimer = window.setTimeout(() => {
    setSettingsPanel(true);
    tone('theme');
    buzz([10, 25, 10]);
  }, 1050);
}

function upsertPointer(event, down = false) {
  const existing = pointers.get(event.pointerId);
  const point = existing ?? {
    x: event.clientX,
    y: event.clientY,
    px: event.clientX,
    py: event.clientY,
    down,
    started: performance.now(),
    lastStream: 0,
    longBloomed: false,
  };
  point.px = point.x;
  point.py = point.y;
  point.x = event.clientX;
  point.y = event.clientY;
  point.down = down || point.down;
  pointers.set(event.pointerId, point);
  idleTimer = 0;
  return point;
}

function updateGesture() {
  const downPoints = pointerList().filter((point) => point.down);
  if (downPoints.length < 2) {
    gestureState = null;
    return;
  }
  const [a, b] = downPoints;
  const cx = (a.x + b.x) * 0.5;
  const cy = (a.y + b.y) * 0.5;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 1;
  const angle = Math.atan2(dy, dx);
  if (!gestureState) {
    gestureState = { distance, angle, cx, cy };
    return;
  }
  let angleDelta = angle - gestureState.angle;
  while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
  while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
  const distanceDelta = distance - gestureState.distance;
  gestureSpin += clamp(angleDelta * 1.8, -0.18, 0.18);
  gestureZoom += clamp(distanceDelta * 0.006, -0.16, 0.16);
  fields.push({ x: cx, y: cy, radius: clamp(distance * 1.35, 120, 460), power: clamp(distanceDelta * 0.0008, -0.04, 0.04), swirl: clamp(angleDelta * 0.55, -0.12, 0.12), life: 32, maxLife: 32 });
  if (Math.abs(angleDelta) > 0.08 || Math.abs(distanceDelta) > 18) {
    tone('pinch');
    buzz([8]);
  }
  gestureState = { distance, angle, cx, cy };
}

function onPointerDown(event) {
  event.preventDefault();
  ensureAudio();
  requestOrientationAccess();
  canvas.setPointerCapture?.(event.pointerId);
  const point = upsertPointer(event, true);
  point.started = performance.now();
  point.lastStream = 0;
  point.longBloomed = false;
  burst(point.x, point.y, 12, false);
  tone('tap');
  buzz([12]);
  maybeOpenHiddenSettings(point);
  updateGesture();
}

function onPointerMove(event) {
  event.preventDefault();
  clearTimeout(settingsHoldTimer);
  const point = upsertPointer(event, event.buttons > 0 || pointers.get(event.pointerId)?.down);
  if (point.down) stream(point);
  updateGesture();
}

function onPointerLeave(event) {
  clearTimeout(settingsHoldTimer);
  const point = pointers.get(event.pointerId);
  if (point && !point.down) pointers.delete(event.pointerId);
  updateGesture();
}

function onPointerUp(event) {
  event.preventDefault();
  clearTimeout(settingsHoldTimer);
  const point = upsertPointer(event, false);
  if (!point.longBloomed) burst(point.x, point.y, 6, true);
  const now = performance.now();
  if (now - lastTapAt < 310) toggleQuietTempo();
  lastTapAt = now;
  pointers.delete(event.pointerId);
  canvas.releasePointerCapture?.(event.pointerId);
  updateGesture();
}

function toggleQuietTempo() {
  const now = performance.now();
  if (now - lastTempoToggleAt < 360) return;
  lastTempoToggleAt = now;
  timeScale = timeScale === 1 ? 0.62 : 1;
  fields.push({ x: width / 2, y: height / 2, radius: Math.min(width, height) * 0.62, power: 0.012, life: 170, maxLife: 170 });
  burst(width / 2, height / 2, 10, true);
  tone('double');
  buzz([18, 42, 18]);
}

async function requestOrientationAccess() {
  if (!settings.orientation || orientationReady || !window.DeviceOrientationEvent) return;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const result = await DeviceOrientationEvent.requestPermission();
      orientationReady = result === 'granted';
    } else {
      orientationReady = true;
    }
  } catch {
    orientationReady = false;
  }
}

function onDeviceOrientation(event) {
  if (!settings.orientation) return;
  orientationReady = true;
  const gamma = clamp(event.gamma || 0, -35, 35);
  const beta = clamp(event.beta || 0, -35, 35);
  orientationTilt.x = orientationTilt.x * 0.86 + gamma * 0.14;
  orientationTilt.y = orientationTilt.y * 0.86 + beta * 0.14;
}

function setSettingsPanel(open) {
  if (!settingsPanel) return;
  settingsPanel.hidden = !open;
  settingsPanel.setAttribute('aria-hidden', String(!open));
  if (open) syncSettingsControls();
}

function syncSettingsControls() {
  if (!settingsPanel) return;
  settingsPanel.querySelectorAll('[data-setting]').forEach((button) => {
    const key = button.dataset.setting;
    const on = Boolean(settings[key]);
    button.setAttribute('aria-pressed', String(on));
    button.dataset.on = String(on);
  });
  const themeButton = settingsPanel.querySelector('[data-action="theme"]');
  if (themeButton) themeButton.textContent = `主题：${theme().name}`;
  const qualityButton = settingsPanel.querySelector('[data-action="quality"]');
  if (qualityButton) qualityButton.textContent = `档位：${qualityProfile().label}`;
}

function bindSettingsPanel() {
  if (!settingsPanel) return;
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click'].forEach((type) => {
    settingsPanel.addEventListener(type, (event) => {
      event.stopPropagation();
    }, { passive: true });
  });
  settingsPanel.querySelectorAll('[data-setting]').forEach((button) => {
    button.addEventListener('click', () => updateSetting(button.dataset.setting, !settings[button.dataset.setting]));
  });
  settingsPanel.querySelector('[data-action="theme"]')?.addEventListener('click', cycleTheme);
  settingsPanel.querySelector('[data-action="quality"]')?.addEventListener('click', cycleQuality);
  settingsPanel.querySelector('[data-action="close"]')?.addEventListener('click', () => setSettingsPanel(false));
  syncSettingsControls();
}

window.addEventListener('resize', resize, { passive: true });
window.visualViewport?.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', () => requestAnimationFrame(resize), { passive: true });
window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
window.addEventListener('pointerdown', onPointerDown, { passive: false });
window.addEventListener('pointermove', onPointerMove, { passive: false });
window.addEventListener('pointerleave', onPointerLeave, { passive: true });
window.addEventListener('pointerout', onPointerLeave, { passive: true });
window.addEventListener('pointerup', onPointerUp, { passive: false });
window.addEventListener('pointercancel', onPointerUp, { passive: false });
window.addEventListener('dblclick', (event) => { event.preventDefault(); toggleQuietTempo(); }, { passive: false });
window.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
window.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
  if (event.key === '?' || event.key.toLowerCase() === 's') setSettingsPanel(settingsPanel?.hidden ?? true);
  if (event.key.toLowerCase() === 't') cycleTheme();
  if (event.key === 'Escape') setSettingsPanel(false);
});

settingsToggleHint?.addEventListener('click', () => setSettingsPanel(true));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    lastFrame = 0;
    resize();
  }
});

prefersReducedMotion.addEventListener?.('change', () => {
  particles = particles.filter((particle) => particle.home).slice(0, targetHomeCount());
  resize();
});

applyTheme();
bindSettingsPanel();
resize();
placeGoal(true);
requestAnimationFrame(animate);
setTimeout(() => burst(width * 0.5, height * 0.5, 10, true), 260);
