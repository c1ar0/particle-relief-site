const canvas = document.querySelector('#particleCanvas');
const ctx = canvas.getContext('2d');

const pointer = {
  x: 0,
  y: 0,
  down: false,
  active: false,
  lastBurst: 0,
};

let width = 0;
let height = 0;
let dpr = 1;
let hue = 0;
let particles = [];
let wells = [];
let ripples = [];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const palette = [176, 194, 214, 250, 286, 318, 150];
const GLOW_SATURATION = 72;
const CORE_SATURATION = 58;

class Particle {
  constructor(x, y, options = {}) {
    const angle = options.angle ?? Math.random() * Math.PI * 2;
    const speed = options.speed ?? 0.25 + Math.random() * 1.25;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = options.life ?? 180 + Math.random() * 220;
    this.maxLife = this.life;
    this.size = options.size ?? 1 + Math.random() * 3.8;
    this.hue = options.hue ?? palette[Math.floor(Math.random() * palette.length)] + Math.random() * 22;
    this.twist = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.04;
    this.home = options.home ?? false;
  }

  update() {
    this.twist += this.spin;
    this.vx += Math.cos(this.twist) * 0.018;
    this.vy += Math.sin(this.twist) * 0.018;

    if (pointer.active) {
      const dx = pointer.x - this.x;
      const dy = pointer.y - this.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 42000) {
        const dist = Math.sqrt(distSq) || 1;
        const force = (1 - dist / 205) * (pointer.down ? 0.78 : 0.22);
        this.vx += (dx / dist) * force;
        this.vy += (dy / dist) * force;
      }
    }

    wells.forEach((well) => {
      const dx = well.x - this.x;
      const dy = well.y - this.y;
      const distSq = dx * dx + dy * dy;
      const radiusSq = well.radius * well.radius;
      if (distSq < radiusSq) {
        const dist = Math.sqrt(distSq) || 1;
        const pull = (1 - dist / well.radius) * well.power * (well.life / well.maxLife);
        this.vx += (dx / dist) * pull;
        this.vy += (dy / dist) * pull;
      }
    });

    this.vx *= 0.985;
    this.vy *= 0.985;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.home ? 0.18 : 1;

    if (this.home) {
      if (this.x < -40) this.x = width + 40;
      if (this.x > width + 40) this.x = -40;
      if (this.y < -40) this.y = height + 40;
      if (this.y > height + 40) this.y = -40;
    }
  }

  draw() {
    const alpha = Math.max(0, this.life / this.maxLife);
    const pulse = 0.72 + Math.sin(this.twist * 2.3 + hue * 0.03) * 0.22;
    const radius = this.size * (this.home ? pulse : 1 + (1 - alpha) * 2.8);
    const color = (this.hue + hue) % 360;
    const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius * 6.2);
    glow.addColorStop(0, `hsla(${color}, ${GLOW_SATURATION}%, 86%, ${alpha * 0.42})`);
    glow.addColorStop(0.28, `hsla(${color}, ${GLOW_SATURATION}%, 64%, ${alpha * 0.2})`);
    glow.addColorStop(1, `hsla(${color}, ${GLOW_SATURATION}%, 46%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius * 6.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsla(${color}, ${CORE_SATURATION}%, 88%, ${alpha * 0.72})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0.8, radius * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.visualViewport?.height || window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seed();
}

function targetCount() {
  const area = width * height;
  const mobileBoost = width < 700 ? 0.78 : 1;
  return Math.round(Math.min(280, Math.max(100, area / 6800)) * mobileBoost);
}

function seed() {
  particles = particles.filter((particle) => !particle.home && particle.life > 0).slice(-180);
  const count = targetCount();
  while (particles.filter((particle) => particle.home).length < count) {
    particles.push(new Particle(Math.random() * width, Math.random() * height, {
      speed: 0.08 + Math.random() * 0.42,
      size: 0.55 + Math.random() * 1.9,
      life: 900 + Math.random() * 900,
      home: true,
    }));
  }
}

function burst(x, y, amount = 56) {
  const count = reducedMotion ? Math.floor(amount * 0.45) : amount;
  for (let i = 0; i < count; i += 1) {
    const ring = i / count;
    particles.push(new Particle(x, y, {
      angle: ring * Math.PI * 2 + Math.random() * 0.55,
      speed: 1.2 + Math.random() * 5.4,
      size: 1 + Math.random() * 3.1,
      life: 80 + Math.random() * 130,
      hue: palette[i % palette.length] + Math.random() * 28,
    }));
  }
  wells.push({ x, y, radius: 230, power: -0.36, life: 34, maxLife: 34 });
  ripples.push({ x, y, radius: 8, life: 40, maxLife: 40, hue: palette[Math.floor(Math.random() * palette.length)] });
}

function breatheOrb(time) {
  const cycle = (time % 7200) / 7200;
  const ease = 0.5 - Math.cos(cycle * Math.PI * 2) * 0.5;
  const radius = Math.min(width, height) * (0.09 + ease * 0.035);
  const x = width * 0.5 + Math.cos(time * 0.00018) * width * 0.09;
  const y = height * 0.5 + Math.sin(time * 0.00021) * height * 0.08;
  const orb = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.9);
  orb.addColorStop(0, `hsla(${188 + hue}, 70%, 86%, 0.06)`);
  orb.addColorStop(0.34, `hsla(${210 + hue}, 64%, 66%, 0.04)`);
  orb.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.9, 0, Math.PI * 2);
  ctx.fill();
}

function drawRipples() {
  ripples.forEach((ripple) => {
    const alpha = ripple.life / ripple.maxLife;
    ctx.strokeStyle = `hsla(${(ripple.hue + hue) % 360}, 66%, 76%, ${alpha * 0.24})`;
    ctx.lineWidth = 0.8 + alpha * 2.4;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
    ripple.radius += 5.8;
    ripple.life -= 1;
  });
  ripples = ripples.filter((ripple) => ripple.life > 0);
}

function animate(time = 0) {
  hue += reducedMotion ? 0.015 : 0.055;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(3, 6, 20, 0.31)';
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'screen';
  breatheOrb(time);
  drawRipples();

  particles.forEach((particle) => {
    particle.update();
    particle.draw();
  });

  particles = particles.filter((particle) => particle.home || (particle.life > 0 && particle.x > -160 && particle.x < width + 160 && particle.y > -160 && particle.y < height + 160));
  wells.forEach((well) => { well.life -= 1; });
  wells = wells.filter((well) => well.life > 0);

  if (particles.filter((particle) => particle.home).length < targetCount()) seed();
  requestAnimationFrame(animate);
}

function eventPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  return {
    x: touch ? touch.clientX : event.clientX,
    y: touch ? touch.clientY : event.clientY,
  };
}

function movePointer(event) {
  event.preventDefault();
  const point = eventPoint(event);
  pointer.x = point.x;
  pointer.y = point.y;
  pointer.active = true;

  const now = performance.now();
  if (pointer.down && now - pointer.lastBurst > 110) {
    pointer.lastBurst = now;
    burst(pointer.x, pointer.y, 12);
  }
}

function pressPointer(event) {
  event.preventDefault();
  movePointer(event);
  pointer.down = true;
  pointer.lastBurst = performance.now();
  burst(pointer.x, pointer.y, 58);
}

function releasePointer(event) {
  event.preventDefault();
  pointer.down = false;
  const point = eventPoint(event);
  burst(point.x, point.y, 24);
}

window.addEventListener('resize', resize, { passive: true });
window.visualViewport?.addEventListener('resize', resize, { passive: true });
window.addEventListener('pointerdown', pressPointer, { passive: false });
window.addEventListener('pointermove', movePointer, { passive: false });
window.addEventListener('pointerup', releasePointer, { passive: false });
window.addEventListener('pointercancel', () => { pointer.down = false; }, { passive: true });
window.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
window.addEventListener('contextmenu', (event) => event.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resize();
});

resize();
requestAnimationFrame(animate);
setTimeout(() => burst(width * 0.5, height * 0.5, 72), 240);
