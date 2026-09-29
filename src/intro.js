// ひらいたときのオープニング
// 図形が四方から飛んでくる → 「JPYC」がドン → 「スパチャ」が1文字ずつ落ちる
// → 幕がギザギザのふちで上に抜けて、チャット欄の部品が順番に入ってくる
// 画面をさわると、すぐ飛ばせる
import { burst } from './fx.js';

// 開発中だけ: アドレスの後ろに ?slow=5 をつけると、オープニングを5倍ゆっくり再生して確かめられる
// (本番用のビルドでは import.meta.env.DEV が false になり、この仕掛けは消える)
const SLOW = import.meta.env.DEV ? Math.max(1, Number(new URLSearchParams(window.location.search).get('slow')) || 1) : 1;
if (SLOW > 1) {
  const until = performance.now() + 12000 * SLOW;
  const slowdown = () => {
    for (const a of document.getAnimations()) if (a.playbackRate !== 1 / SLOW) a.playbackRate = 1 / SLOW;
    if (performance.now() < until) requestAnimationFrame(slowdown);
  };
  requestAnimationFrame(slowdown);
}

const HOLD_MS = 1650 * SLOW; // ロゴがそろってから幕が抜けるまで
const FONT_WAIT_MS = 900; // 文字の形(フォント)が届くのを待つ上限

// label: ロゴの下の札に出す文字 / section: 幕が抜けたあとに入ってくる画面(チャット欄 or トップページ)
export function playIntro(label, section) {
  const intro = document.getElementById('intro');
  const enter = () => {
    section.classList.add('enter');
    // 入ってくる動きが終わったら外す(外さないと、あとの演出とぶつかる)
    setTimeout(() => section.classList.remove('enter'), 1500 * SLOW);
  };
  if (!intro) {
    enter();
    return Promise.resolve();
  }

  document.getElementById('introHost').textContent = label;
  const word = document.getElementById('introWord');
  const letters = [...word.textContent];
  word.textContent = '';
  letters.forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.setProperty('--i', i);
    word.appendChild(s);
  });

  return new Promise((resolve) => {
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      intro.classList.add('is-out');
      enter();
      setTimeout(() => {
        intro.remove();
        resolve();
      }, 620 * SLOW);
    };
    intro.addEventListener('pointerdown', finish, { once: true });

    const fontReady = Promise.race([
      document.fonts ? document.fonts.load('400 60px "Dela Gothic One"', 'JPYCスパチャ') : Promise.resolve(),
      new Promise((r) => setTimeout(r, FONT_WAIT_MS)),
    ]).catch(() => {});

    fontReady.then(() => {
      if (ended) return;
      intro.classList.add('is-play');
      // 「JPYC」がドンと押された瞬間に、図形の粒をはじけさせる
      setTimeout(() => {
        if (ended) return;
        const r = intro.querySelector('.intro-jpyc').getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 90, 12);
      }, 270 * SLOW);
      setTimeout(finish, HOLD_MS);
    });
  });
}
