// はなやか演出の係: 図形の粒(パーティクル)・ひし形の衝撃波・紙吹雪・大きな帯・画面ゆれ
import { INK, SKY, SUN, WHITE } from './art.js';

const canvas = document.getElementById('fx');
const ctx = canvas.getContext('2d');
const parts = [];
let W = 0;
let H = 0;
let running = false;
let last = 0;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const COLORS = [SKY, SUN, WHITE, INK, SKY, SUN];
const SHAPES = ['tri', 'sq', 'circ', 'ring', 'plus', 'zig', 'bar', 'half', 'dia'];

function add(p) {
  parts.push(p);
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }
}

// 1点から図形の粒をはじけさせる
export function burst(x, y, count = 60, power = 9) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const s = power * rand(0.3, 1.15);
    add({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - power * 0.35,
      g: 0.24, drag: 0.982,
      rot: rand(0, 6.3), vr: rand(-0.3, 0.3),
      size: rand(6, 14), shape: pick(SHAPES), color: pick(COLORS),
      life: 0, max: rand(55, 105),
    });
  }
}

// 上から紙吹雪をふらせる
export function rain(count = 160) {
  for (let i = 0; i < count; i++) {
    add({
      x: rand(0, W), y: rand(-H * 0.8, -20),
      vx: rand(-1, 1), vy: rand(2.2, 5.2),
      g: 0.03, drag: 0.996,
      rot: rand(0, 6.3), vr: rand(-0.12, 0.12),
      size: rand(8, 16), shape: pick(SHAPES), color: pick(COLORS),
      life: 0, max: rand(230, 330), sway: rand(0, 6.3),
    });
  }
}

// ひし形の輪が広がる(衝撃波)
export function shock(x, y, rings = 1) {
  for (let i = 0; i < rings; i++) {
    add({ kind: 'shock', x, y, r: 4, grow: 4.4 + i * 1.4, wait: i * 7, color: i % 2 ? SUN : SKY, life: 0, max: 38 });
  }
}

function loop(now) {
  const dt = Math.min(2.5, (now - last) / 16.667);
  last = now;
  ctx.clearRect(0, 0, W, H);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.wait > 0) {
      p.wait -= dt;
      continue;
    }
    p.life += dt;
    if (p.kind === 'shock') {
      p.r += p.grow * dt;
      p.grow *= Math.pow(0.95, dt);
    } else {
      p.vx *= Math.pow(p.drag, dt);
      p.vy = p.vy * Math.pow(p.drag, dt) + p.g * dt;
      if (p.sway !== undefined) {
        p.sway += 0.05 * dt;
        p.x += Math.sin(p.sway) * 0.7 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    if (p.life >= p.max || p.y > H + 60) {
      parts.splice(i, 1);
      continue;
    }
    draw(p);
  }
  ctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(loop);
  else {
    running = false;
    ctx.clearRect(0, 0, W, H);
  }
}

function draw(p) {
  const k = p.life / p.max;
  ctx.globalAlpha = k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.kind === 'shock') {
    ctx.rotate(Math.PI / 4);
    const w = Math.max(1, 8 * (1 - k));
    ctx.lineWidth = w + 3.5;
    ctx.strokeStyle = INK;
    ctx.strokeRect(-p.r, -p.r, p.r * 2, p.r * 2);
    ctx.lineWidth = w;
    ctx.strokeStyle = p.color;
    ctx.strokeRect(-p.r, -p.r, p.r * 2, p.r * 2);
    ctx.restore();
    return;
  }
  ctx.rotate(p.rot);
  const s = p.size;
  const h = s / 2;
  const t = s / 6;
  const line = p.color === WHITE ? INK : p.color; // 線だけの図形は白だと見えないので黒に
  ctx.fillStyle = p.color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  switch (p.shape) {
    case 'tri':
      ctx.moveTo(0, -h); ctx.lineTo(h, h); ctx.lineTo(-h, h); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'sq':
      ctx.rect(-h, -h, s, s);
      ctx.fill(); ctx.stroke();
      break;
    case 'dia':
      ctx.moveTo(0, -h); ctx.lineTo(h * 0.7, 0); ctx.lineTo(0, h); ctx.lineTo(-h * 0.7, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'circ':
      ctx.arc(0, 0, h, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      break;
    case 'half':
      ctx.arc(0, 0, h, Math.PI, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'ring':
      ctx.arc(0, 0, h, 0, Math.PI * 2);
      ctx.lineWidth = 3.4; ctx.strokeStyle = line; ctx.stroke();
      break;
    case 'plus':
      ctx.moveTo(-t, -h); ctx.lineTo(t, -h); ctx.lineTo(t, -t); ctx.lineTo(h, -t); ctx.lineTo(h, t);
      ctx.lineTo(t, t); ctx.lineTo(t, h); ctx.lineTo(-t, h); ctx.lineTo(-t, t); ctx.lineTo(-h, t);
      ctx.lineTo(-h, -t); ctx.lineTo(-t, -t); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'zig':
      ctx.moveTo(-h, h / 2); ctx.lineTo(-h / 2, -h / 2); ctx.lineTo(0, h / 2); ctx.lineTo(h / 2, -h / 2); ctx.lineTo(h, h / 2);
      ctx.lineWidth = 3.2; ctx.strokeStyle = line; ctx.stroke();
      break;
    default: // bar
      ctx.rect(-t, -h, t * 2, s);
      ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ===== 5,000 JPYC以上の大きな帯 =====
const hype = document.getElementById('hype');
let hypeTimer = 0;
function showHype(name, amountText) {
  document.getElementById('hypeAmt').textContent = amountText;
  document.getElementById('hypeName').textContent = name;
  clearTimeout(hypeTimer);
  hype.classList.remove('is-out');
  hype.hidden = false; // 非表示→表示で、中のアニメーションが最初から動く
  hypeTimer = setTimeout(() => {
    hype.classList.add('is-out');
    hypeTimer = setTimeout(() => {
      hype.hidden = true;
      hype.classList.remove('is-out');
    }, 480);
  }, 2900);
}

function restartClass(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // もう一度最初からアニメーションさせるため
  el.classList.add(cls);
}

// 投げ銭が届いたときの演出。段階(1〜3)が上がるほど派手になる
export function celebrate(cardEl, tier, name, amountText) {
  const feedRect = document.getElementById('feed').getBoundingClientRect();
  const amt = cardEl?.querySelector('.amt')?.getBoundingClientRect();
  let x = feedRect.left + feedRect.width / 2;
  let y = feedRect.bottom - 48;
  if (amt && amt.bottom > feedRect.top && amt.top < feedRect.bottom) {
    x = amt.left + amt.width / 2;
    y = amt.top + amt.height / 2;
  }
  shock(x, y, tier);
  burst(x, y, [0, 55, 100, 150][tier], [0, 8.5, 10.5, 13][tier]);
  restartClass(document.getElementById('head'), 'flash');
  if (tier >= 2) setTimeout(() => burst(x, y, 45, 6.5), 200);
  if (tier === 3) {
    restartClass(document.getElementById('chat'), 'shake');
    setTimeout(() => {
      showHype(name, amountText);
      rain(180);
      burst(W * 0.15, H * 0.5, 50, 11);
      burst(W * 0.85, H * 0.5, 50, 11);
    }, 180);
  }
}
