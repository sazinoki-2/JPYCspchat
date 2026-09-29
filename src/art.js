// 見た目の部品: 色と、ウォレットアドレスから作る幾何学アイコン
export const INK = '#141414';
export const SKY = '#5CCFF2';
export const SUN = '#FFCC00';
export const WHITE = '#FFFFFF';

// 文字列から数値を作る(アイコンの柄を決めるため)
export function hash(str) {
  let h = 2166136261;
  for (const ch of String(str).toLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 種が同じなら毎回同じ並びになる乱数
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1マス(20×20)に入れる図形
const SHAPES = [
  (c) => `<path d="M0 0H20A20 20 0 0 1 0 20Z" fill="${c}"/>`, // 四分円
  (c) => `<path d="M0 0H20L0 20Z" fill="${c}"/>`, // 三角
  (c) => `<path d="M0 20A10 10 0 0 1 20 20Z" fill="${c}"/>`, // 半円
  (c) => `<rect x="5" y="5" width="10" height="10" fill="${c}"/>`, // 四角
  (c) => `<circle cx="10" cy="10" r="4.6" fill="${c}"/>`, // 点
  (c) => `<path d="M0 4H20M0 10H20M0 16H20" stroke="${c}" stroke-width="2.4"/>`, // しま
  (c) => `<path d="M10 2L18 10L10 18L2 10Z" fill="${c}"/>`, // ひし形
];

// ウォレットアドレスから 2×2 マスの幾何学アイコンを作る(同じアドレスはいつも同じ柄)
export function memphisIcon(seed) {
  const r = rng(hash(seed || 'guest'));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  let tiles = '';
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * 20;
    const y = Math.floor(i / 2) * 20;
    const bg = pick([SKY, SUN, WHITE, SKY, SUN]);
    const fg = pick([INK, INK, SKY, SUN, WHITE].filter((c) => c !== bg));
    const rot = pick([0, 90, 180, 270]);
    tiles +=
      `<g transform="translate(${x} ${y})"><rect width="20" height="20" fill="${bg}"/>` +
      `<g transform="rotate(${rot} 10 10)">${pick(SHAPES)(fg)}</g></g>`;
  }
  return (
    `<svg viewBox="0 0 40 40" aria-hidden="true">${tiles}` +
    `<path d="M20 0V40M0 20H40" stroke="${INK}" stroke-width="1.4"/></svg>`
  );
}

// まだウォレットがわからない人用のアイコン(黒地にはてな)
export function guestIcon() {
  return (
    `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill="${INK}"/>` +
    `<path d="M0 40L40 0V40Z" fill="${SKY}"/><path d="M15 15a5 5 0 1 1 7 4.6c-1.3.6-2 1.4-2 2.9V24" fill="none" stroke="${WHITE}" stroke-width="3.2"/>` +
    `<rect x="18.4" y="27" width="3.4" height="3.4" fill="${WHITE}"/></svg>`
  );
}
