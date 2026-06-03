const canvas = document.querySelector('#particleCanvas');
const ctx = canvas.getContext('2d');
const textInput = document.querySelector('#reliefText');
const releaseBtn = document.querySelector('#releaseBtn');
const clearBtn = document.querySelector('#clearBtn');
const density = document.querySelector('#density');
const speed = document.querySelector('#speed');
const calm = document.querySelector('#calm');
const quoteText = document.querySelector('#quoteText');
const breathText = document.querySelector('#breathText');

const quotes = [
  '不需要马上解决全部，先把肩膀放低一点。',
  '每一次呼气，都是把身体轻轻还给自己。',
  '允许自己慢下来，也是一种可靠的照顾。',
  '此刻先不用逞强，让光替你接住一些杂念。',
  '把注意力交给一束光，给自己十秒钟。',
  '你可以暂停一下，世界不会因此失去秩序。',
];

let width = 0;
let height = 0;
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let particles = [];
let pointerDown = false;
let hueShift = 0;

class Particle {
  constructor(x, y, options = {}) {
    const angle = options.angle ?? Math.random() * Math.PI * 2;
    const velocity = options.velocity ?? (0.3 + Math.random() * Number(speed.value) * 0.18);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * velocity;
    this.vy = Math.sin(angle) * velocity;
    this.life = options.life ?? 90 + Math.random() * 120;
    this.maxLife = this.life;
    this.size = options.size ?? 1.2 + Math.random() * 3.6;
    this.hue = options.hue ?? 175 + Math.random() * 120;
    this.spin = (Math.random() - 0.5) * 0.035;
    this.orbit = Math.random() * Math.PI * 2;
    this.kind = options.kind ?? 'photon';
  }

  update() {
    const softness = Number(calm.value) / 10;
    this.orbit += this.spin;
    this.vx += Math.cos(this.orbit) * 0.012 * softness;
    this.vy += Math.sin(this.orbit) * 0.012 * softness;
    this.vx *= 0.992 - softness * 0.01;
    this.vy *= 0.992 - softness * 0.01;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 1;
  }

  draw() {
    const alpha = Math.max(this.life / this.maxLife, 0);
    const radius = this.size * (0.8 + (1 - alpha) * 1.8);
    const hue = (this.hue + hueShift) % 360;
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius * 5);
    gradient.addColorStop(0, `hsla(${hue}, 100%, 92%, ${alpha})`);
    gradient.addColorStop(0.28, `hsla(${hue}, 100%, 66%, ${alpha * 0.55})`);
    gradient.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius * 5, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === 'text') {
      ctx.fillStyle = `hsla(${hue}, 100%, 94%, ${alpha * 0.55})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(1, radius * 0.58), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedBackground();
}

function seedBackground() {
  const target = Number(density.value);
  particles = particles.filter((p) => p.kind === 'text' && p.life > 0).slice(-260);
  for (let i = particles.length; i < target; i += 1) {
    particles.push(new Particle(Math.random() * width, Math.random() * height, {
      velocity: 0.1 + Math.random() * 0.45,
      life: 180 + Math.random() * 260,
      size: 0.7 + Math.random() * 2,
      hue: 185 + Math.random() * 90,
    }));
  }
}

function burst(x, y, amount = 36, phrase = '') {
  const chars = [...phrase.trim()].filter((c) => c !== ' ');
  const count = Math.min(220, Math.max(amount, chars.length * 8));
  for (let i = 0; i < count; i += 1) {
    const charCode = chars.length ? chars[i % chars.length].charCodeAt(0) : i * 13;
    particles.push(new Particle(x, y, {
      angle: (i / count) * Math.PI * 2 + Math.sin(charCode) * 0.42,
      velocity: 0.6 + Math.random() * Number(speed.value) * 0.45,
      life: 95 + Math.random() * 125,
      size: 1.6 + Math.random() * 4.4,
      hue: (charCode * 7 + 160) % 360,
      kind: phrase ? 'text' : 'photon',
    }));
  }
  quoteText.textContent = quotes[Math.floor(Math.random() * quotes.length)];
}

function releaseText() {
  const phrase = textInput.value.trim() || textInput.placeholder.replace('例如：', '');
  const centerX = width * (0.42 + Math.random() * 0.16);
  const centerY = height * (window.innerWidth <= 860 ? 0.32 + Math.random() * 0.12 : 0.42 + Math.random() * 0.18);
  burst(centerX, centerY, 56, phrase);
  textInput.value = '';
  releaseBtn.textContent = '已经散开';
  window.setTimeout(() => { releaseBtn.textContent = '释放成光'; }, 900);
}

function animate() {
  hueShift += 0.08;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(4, 7, 18, 0.20)';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';

  particles.forEach((particle) => {
    particle.update();
    particle.draw();
  });
  particles = particles.filter((p) => p.life > 0 && p.x > -120 && p.x < width + 120 && p.y > -120 && p.y < height + 120);

  if (particles.length < Number(density.value)) {
    particles.push(new Particle(Math.random() * width, Math.random() * height, {
      velocity: 0.08 + Math.random() * 0.28,
      life: 180 + Math.random() * 220,
      size: 0.7 + Math.random() * 1.8,
    }));
  }
  requestAnimationFrame(animate);
}

function canvasPoint(event) {
  const touch = event.touches?.[0];
  return { x: touch ? touch.clientX : event.clientX, y: touch ? touch.clientY : event.clientY };
}

function handlePointer(event, intense = false) {
  if (event.target.closest('main, footer')) return;
  const { x, y } = canvasPoint(event);
  burst(x, y, intense ? 28 : 8);
}

releaseBtn.addEventListener('click', releaseText);
textInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') releaseText();
});

document.querySelectorAll('[data-phrase]').forEach((button) => {
  button.addEventListener('click', () => {
    textInput.value = button.dataset.phrase;
    releaseText();
  });
});

clearBtn.addEventListener('click', () => {
  particles = [];
  ctx.clearRect(0, 0, width, height);
  seedBackground();
  quoteText.textContent = '画面已经变轻，可以从一次呼吸重新开始。';
});

density.addEventListener('input', seedBackground);

window.addEventListener('resize', resize);
window.addEventListener('pointerdown', (event) => {
  if (event.target.closest('main')) return;
  pointerDown = true;
  handlePointer(event, true);
});
window.addEventListener('pointermove', (event) => {
  if (!pointerDown || event.target.closest('main')) return;
  handlePointer(event);
});
window.addEventListener('pointerup', () => { pointerDown = false; });
window.addEventListener('touchend', () => { pointerDown = false; });

const breathCycle = [
  { at: 0, text: '吸气' },
  { at: 4000, text: '停留' },
  { at: 8000, text: '呼气' },
];
function updateBreathText() {
  const t = Date.now() % 14000;
  const phase = [...breathCycle].reverse().find((item) => t >= item.at);
  breathText.textContent = phase.text;
  requestAnimationFrame(updateBreathText);
}

resize();
animate();
updateBreathText();
setTimeout(() => burst(width * 0.5, height * 0.5, 80, '欢迎，把压力释放成光'), 450);
