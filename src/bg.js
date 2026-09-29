// ページ全体の背景(メンフィス)
// 組み立て方: 対角の2つのすみに「流れる波」を重ねて主役にし、ふちに中くらいの飾り、そのまわりに小さな点をまぶす。
//             真ん中は空けておく(大・中・小のメリハリ)。
// 本人が見せた参考画像は「組み立て方」だけを参考にし、形・飾り・配色はこのサービス用に描き起こした
// (配色は水色・黄色・黒。飾りはジグザグ・しまの半円・ずらした輪・点の並び・四角と枠・十字など)。
const SKY = '#5CCFF2';
const SKY_LT = '#A9E7F8'; // 水色のうすい版(奥の層)
const SUN = '#FFCC00';
const INK = '#141414';
const WHITE = '#FFFFFF';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 左上のすみの波(620×520 の箱の左上が画面の左上)
const WAVE_TL = `
  <path d="M0 0H600C552 60 600 136 514 182C432 226 368 178 296 250C228 318 262 410 168 464C110 498 48 496 0 522Z" fill="${SKY_LT}"/>
  <path d="M0 0H466C428 54 468 122 392 160C320 196 266 152 204 214C146 274 176 350 98 394C60 416 24 422 0 434Z" fill="${SKY}"/>
  <path d="M0 0H296C270 42 298 88 244 114C192 140 154 118 110 160C66 202 84 252 28 278C16 284 8 288 0 292Z" fill="${SUN}"/>
  <path d="M488 0C450 62 488 130 408 170C334 208 280 164 218 226C158 286 188 362 108 408" fill="none" stroke="${INK}" stroke-width="1.8"/>
  <path d="M0 214C38 200 58 176 78 146C102 110 138 100 176 98C214 96 238 66 246 30" fill="none" stroke="${WHITE}" stroke-width="2.2"/>`;

// 右下のすみの波(620×520 の箱の右下が画面の右下)。左上とは形も重ね方も変える(いちばん手前は黒)
const WAVE_BR = `
  <path d="M620 520V52C572 86 590 158 520 200C446 246 378 204 314 270C254 334 298 424 216 472C176 496 116 508 56 520Z" fill="${SUN}"/>
  <path d="M620 520V168C580 196 596 252 542 284C484 318 436 290 386 340C338 388 372 452 310 486C282 502 244 512 198 520Z" fill="${SKY}"/>
  <path d="M620 520V332C594 348 604 384 570 404C532 428 500 408 468 440C440 468 462 504 424 520Z" fill="${INK}"/>
  <path d="M578 520C590 488 604 470 620 462" fill="none" stroke="${WHITE}" stroke-width="2.2"/>
  <path d="M42 520C112 506 166 484 204 450C286 378 238 290 300 228C362 166 432 206 508 160C574 120 556 50 604 14" fill="none" stroke="${INK}" stroke-width="1.8"/>`;

// ---- 中くらいの飾り(中心が 0,0) ----
const zigzag = (c) => `<path d="M-48 8l12-16l12 16l12-16l12 16l12-16l12 16l12-16" fill="none" stroke="${c}" stroke-width="3.2" stroke-linejoin="miter"/>`;
const stripeHalf = (fill) => `<clipPath id="bgHalf"><path d="M-34 0A34 34 0 0 1 34 0Z"/></clipPath>
  <path d="M-34 0A34 34 0 0 1 34 0Z" fill="${fill}"/>
  <g clip-path="url(#bgHalf)" stroke="${INK}" stroke-width="3"><path d="M-40 -28H40M-40 -18H40M-40 -8H40"/></g>
  <path d="M-40 6H40" stroke="${INK}" stroke-width="3"/>`;
const ringDot = (ring, dot) => `<circle cx="-8" cy="-6" r="20" fill="none" stroke="${ring}" stroke-width="2.6"/><circle cx="8" cy="8" r="14" fill="${dot}"/>`;
const dotGrid = (c) => {
  let d = '';
  for (let r = 0; r < 3; r++) for (let q = 0; q < 5; q++) d += `<circle cx="${-28 + q * 14}" cy="${-14 + r * 14}" r="2.3" fill="${c}"/>`;
  return d;
};
const squareFrame = () => `<rect x="-6" y="-6" width="26" height="26" fill="${SUN}"/><rect x="-18" y="-18" width="26" height="26" fill="none" stroke="${INK}" stroke-width="2.4"/>`;
const plus = (c) => `<path d="M-9 0h18M0 -9v18" stroke="${c}" stroke-width="3.6"/>`;
const tri = () => `<path d="M-12 8L0 -12L12 8Z" fill="none" stroke="${INK}" stroke-width="2.4"/>`;
const dot = (c, r) => `<circle r="${r}" fill="${c}"/>`;

// 飾りの置き場所: 画面に対する割合(x,y)。どれも「ふち寄り」で、真ん中は空ける
// kind: 形 / s: 大きさの倍率 / rot: 角度
const ACCENTS = [
  // 中
  { x: 0.74, y: 0.13, s: 1.0, rot: 0, svg: dotGrid(INK) },
  { x: 0.9, y: 0.34, s: 1.1, rot: -18, svg: stripeHalf(SUN) },
  { x: 0.08, y: 0.6, s: 1.0, rot: 0, svg: ringDot(INK, SKY) },
  { x: 0.2, y: 0.86, s: 1.0, rot: -8, svg: zigzag(INK) },
  { x: 0.8, y: 0.66, s: 1.0, rot: 12, svg: squareFrame() },
  { x: 0.44, y: 0.07, s: 0.9, rot: 6, svg: zigzag(SKY) },
  // 小(近くにまとめてまぶす)
  { x: 0.62, y: 0.2, s: 1, rot: 0, svg: dot(SKY, 7) },
  { x: 0.86, y: 0.2, s: 1, rot: 0, svg: plus(SKY) },
  { x: 0.96, y: 0.5, s: 1, rot: 0, svg: dot(SUN, 6) },
  { x: 0.16, y: 0.5, s: 1, rot: 0, svg: dot(INK, 4) },
  { x: 0.04, y: 0.72, s: 1, rot: 20, svg: tri() },
  { x: 0.3, y: 0.94, s: 1, rot: 0, svg: dot(SKY, 6) },
  { x: 0.66, y: 0.9, s: 1, rot: 0, svg: plus(SUN) },
  { x: 0.92, y: 0.8, s: 1, rot: 0, svg: dot(INK, 4) },
  { x: 0.1, y: 0.42, s: 1, rot: 0, svg: plus(SUN) },
  { x: 0.54, y: 0.95, s: 1, rot: -12, svg: tri() },
];

function render(el) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  // 大: すみの波は画面の短い辺に合わせる。中・小は画面の大きさに少しだけ合わせる
  // (スマホのような縦長の画面では、ヘッダーと入力欄に隠れないよう少し大きめに)
  const sWave = clamp((W < H ? W * 0.9 : Math.min(W, H) * 0.78) / 620, 0.45, 1.25);
  const k = clamp(Math.min(W, H) / 820, 0.72, 1.25);
  const accents = ACCENTS.map((a) =>
    `<g transform="translate(${(a.x * W).toFixed(1)} ${(a.y * H).toFixed(1)}) rotate(${a.rot}) scale(${(a.s * k).toFixed(2)})">${a.svg}</g>`,
  ).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <g transform="scale(${sWave.toFixed(3)})">${WAVE_TL}</g>
    <g transform="translate(${(W - 620 * sWave).toFixed(1)} ${(H - 520 * sWave).toFixed(1)}) scale(${sWave.toFixed(3)})">${WAVE_BR}</g>
    ${accents}
  </svg>`;
}

export function initBackground() {
  const el = document.getElementById('bgpat');
  if (!el) return;
  render(el);
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => render(el), 200);
  });
}
