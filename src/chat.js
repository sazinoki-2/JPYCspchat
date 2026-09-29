// チャット欄を描く係: 投げ銭カード・上のバー(ティッカー)・効果音・テスト用の投げ銭
import { memphisIcon } from './art.js';
import { celebrate } from './fx.js';

// 金額ルール(YouTubeのスパチャに寄せたもの)
export const TIERS = {
  1: { label: '水色', max: 50, keepMin: 1, color: 'var(--sky)' },
  2: { label: '黄色', max: 100, keepMin: 5, color: 'var(--sun)' },
  3: { label: 'しましま', max: 200, keepMin: 30, color: 'var(--stripe)' },
};
export const tierOf = (v) => (v >= 5000 ? 3 : v >= 500 ? 2 : 1);
export const yen = (n) => Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const FLAG = { 1: 'JPYC きた!', 2: 'JPYC きた!!', 3: 'JPYC きたーー!!!' };
const MAX_CARDS = 150;

// 見えない制御文字・文字の向きを変える記号を取りのぞいて、文字数を上限までにする
export function clean(s, max) {
  const t = String(s ?? '')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁯﻿]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [...t].slice(0, max).join('');
}

// 出したくない言葉を「＊＊＊」にする
let ngWords = [];
export function setNgWords(list) {
  ngWords = (Array.isArray(list) ? list : []).filter((w) => typeof w === 'string' && w);
}
export function mask(s) {
  let out = s;
  for (const w of ngWords) out = out.split(w).join('＊＊＊');
  return out;
}

const feed = document.getElementById('feed');
const ticker = document.getElementById('ticker');
const jump = document.getElementById('jump');
const cards = new Map(); // id → カード要素
const chips = new Map(); // id → ティッカーの札

function cardEl(tip) {
  const t = tierOf(tip.jpyc);
  const el = document.createElement('article');
  el.className = `tip t${t}` + (tip.msg ? '' : ' nomsg');
  el.innerHTML =
    `<div class="card"><div class="card-head"><span class="ic">${memphisIcon(tip.from)}</span>` +
    `<span class="name"></span><span class="amt"><b>${yen(tip.jpyc)}</b><small>JPYC</small></span></div>` +
    `<p class="card-body"></p></div>`;
  // なまえとコメントは人が書いたものなので、必ず文字として入れる(HTMLとして解釈させない)
  el.querySelector('.name').textContent = tip.name;
  el.querySelector('.card-body').textContent = tip.msg;
  return el;
}

const nearBottom = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
const toBottom = () => { feed.scrollTop = feed.scrollHeight; };
feed.addEventListener('scroll', () => { if (nearBottom()) jump.hidden = true; });
jump.addEventListener('click', () => {
  feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
  jump.hidden = true;
});

// ===== ティッカー(金額が大きいほど長く残る) =====
function addChip(tip, { isNew, cascade }) {
  const t = tierOf(tip.jpyc);
  const span = TIERS[t].keepMin * 60_000;
  const until = tip.ts + span;
  if (until <= Date.now()) return;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `chip t${t}` + (isNew ? ' new' : '') + (cascade >= 0 ? ' rise' : '');
  if (cascade >= 0) el.style.setProperty('--i', cascade);
  el.innerHTML = `<span class="ic">${memphisIcon(tip.from)}</span><b>${yen(tip.jpyc)}</b>`;
  el.setAttribute('aria-label', `${tip.name} ${yen(tip.jpyc)} JPYC`);
  el.addEventListener('click', () => {
    cards.get(tip.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  ticker.prepend(el);
  chips.set(tip.id, { el, until, span });
  tickChips();
}
function tickChips() {
  const now = Date.now();
  for (const [id, c] of chips) {
    const left = c.until - now;
    if (left <= 0) {
      c.el.remove();
      chips.delete(id);
    } else {
      c.el.style.setProperty('--p', (left / c.span).toFixed(4));
    }
  }
}
setInterval(tickChips, 1000);

// ===== 投げ銭を1件ならべる =====
// isNew: いま届いたもの(旗・音・演出あり) / cascade: ひらいたときに順番に出す番号
export function addTip(tip, { isNew = false, cascade = -1 } = {}) {
  if (cards.has(tip.id)) return;
  const t = tierOf(tip.jpyc);
  const el = cardEl(tip);
  if (cascade >= 0) {
    el.classList.add('rise');
    el.style.setProperty('--i', cascade);
  }
  if (isNew) {
    el.classList.add('new');
    const flag = document.createElement('div');
    flag.className = 'flag';
    const label = document.createElement('span');
    label.textContent = (tip.test ? 'テスト ' : '') + FLAG[t];
    flag.appendChild(label);
    el.prepend(flag);
    setTimeout(() => flag.classList.add('gone'), 4800);
  }
  const stick = nearBottom();
  feed.appendChild(el);
  cards.set(tip.id, el);
  while (cards.size > MAX_CARDS) {
    const [oldId, oldEl] = cards.entries().next().value;
    oldEl.remove();
    cards.delete(oldId);
  }
  addChip(tip, { isNew, cascade });
  if (stick || cascade >= 0) toBottom();
  else if (isNew) jump.hidden = false;
  if (isNew) {
    chime(t);
    requestAnimationFrame(() => celebrate(el, t, tip.name, yen(tip.jpyc)));
  }
}

// あとからコメントが見つかったときに書きかえる
export function updateTip(id, name, msg) {
  const el = cards.get(id);
  if (!el) return;
  el.querySelector('.name').textContent = name;
  el.querySelector('.card-body').textContent = msg;
  el.classList.toggle('nomsg', !msg);
}

// ===== 効果音 =====
const sndBtn = document.getElementById('sndBtn');
let soundOn = true;
try { soundOn = localStorage.getItem('jpycchat.sound') !== 'off'; } catch { /* 保存できない環境 */ }
let actx = null;
function audio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
  } catch {
    actx = null;
  }
  return actx;
}
function paintSnd() {
  sndBtn.setAttribute('aria-pressed', String(soundOn));
  sndBtn.classList.toggle('blocked', soundOn && (!actx || actx.state !== 'running'));
}
sndBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  try { localStorage.setItem('jpycchat.sound', soundOn ? 'on' : 'off'); } catch { /* 保存できない環境 */ }
  audio();
  setTimeout(() => {
    paintSnd();
    if (soundOn) chime(1);
  }, 60);
});
// ブラウザのきまりで、どこかを1回さわるまで音が出せない(OBSではそのまま鳴る)
const unlock = () => { audio(); setTimeout(paintSnd, 80); };
document.addEventListener('pointerdown', unlock, { passive: true });
document.addEventListener('keydown', unlock);
audio();
setTimeout(paintSnd, 400);

function tone(a, freq, at, len, vol, type = 'triangle') {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g);
  g.connect(a.destination);
  o.start(at);
  o.stop(at + len + 0.05);
}
function chime(t) {
  if (!soundOn) return;
  const a = audio();
  if (!a || a.state !== 'running') {
    paintSnd();
    return;
  }
  const now = a.currentTime;
  const notes = t === 3 ? [523, 659, 784, 1047, 1319, 1568] : t === 2 ? [659, 988, 1319] : [880, 1319];
  notes.forEach((f, i) => tone(a, f, now + i * 0.085, 0.42, 0.16));
  if (t === 3) {
    // 最後に「ドン」
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, now);
    o.frequency.exponentialRampToValueAtTime(45, now + 0.45);
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    o.connect(g);
    g.connect(a.destination);
    o.start(now);
    o.stop(now + 0.55);
  }
}

// ===== お知らせ(チェーンが読めないときなど) =====
const toastEl = document.getElementById('toast');
let toastTimer = 0;
export function toast(text, ms = 4000) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}
let downSince = 0;
export function chainStatus(ok) {
  if (ok) {
    if (downSince) toastEl.hidden = true;
    downSince = 0;
  } else {
    downSince = downSince || Date.now();
    if (Date.now() - downSince > 8000) toast('チェーンの読み込みが止まっています（自動でつなぎなおします）', 0);
  }
}

// ===== テスト用の投げ銭(Shift+T。自分の画面にだけ出る) =====
const SAMPLES = [
  { name: 'はじめて勢', msg: 'はじめてのJPYCスパチャ！ちゃんと届いたかな？', jpyc: 100 },
  { name: 'ポリゴン太郎', msg: 'ガス代ちょっとで送れた、いい時代', jpyc: 500 },
  { name: '', msg: '', jpyc: 300 },
  { name: '常連のひと', msg: 'いつも配信たのしみにしてます！', jpyc: 1000 },
  { name: '太っ腹さん', msg: '今日の話めっちゃよかった！！これからも応援してます', jpyc: 10000 },
];
let sampleIndex = 0;
const fakeAddr = () => `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
export function testTip(jpyc) {
  // 金額の指定があれば、その金額に近い見本を使う(開発中の確認用)
  const s = jpyc
    ? { ...SAMPLES.find((x) => tierOf(x.jpyc) === tierOf(jpyc)), jpyc }
    : SAMPLES[sampleIndex++ % SAMPLES.length];
  const from = fakeAddr();
  addTip(
    { id: `test:${Date.now()}:${Math.random()}`, from, jpyc: s.jpyc, name: s.name || shortAddr(from), msg: s.msg, ts: Date.now(), test: true },
    { isNew: true },
  );
}

// ===== デモ表示(設定がまだのとき) =====
export function demo(missing, { seed = true } = {}) {
  const box = document.createElement('div');
  box.className = 'demo';
  const title = document.createElement('b');
  title.textContent = seed ? 'DEMO 設定前の見本表示です' : 'DEMO 送る画面はまだ見本です';
  const text = document.createElement('span');
  text.textContent = `config.js に ${missing.join('・')} を入れると本番になります。`;
  const how = document.createElement('div');
  how.innerHTML = '<kbd>Shift</kbd> + <kbd>T</kbd> でテスト投げ銭が流れます。';
  box.append(title, text, how);
  feed.prepend(box);
  if (!seed) return;
  const now = Date.now();
  [
    { name: '常連のひと', msg: 'きょうも配信ありがとう！', jpyc: 500, ago: 3 },
    { name: '', msg: '', jpyc: 300, ago: 0.6 },
    { name: 'ポリゴン太郎', msg: 'ガス代ちょっとで送れた、いい時代', jpyc: 1000, ago: 0.3 },
  ].forEach((s, i) => {
    const from = fakeAddr();
    addTip(
      { id: `demo:${i}`, from, jpyc: s.jpyc, name: s.name || shortAddr(from), msg: s.msg, ts: now - s.ago * 60_000 },
      { cascade: i },
    );
  });
}
