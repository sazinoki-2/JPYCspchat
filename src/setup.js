// 配信者向けの係: 右上の「配信者」ボタンを押すと、その場に重なってウィンドウが出る
// ・まだ自分のチャット欄がない人: 「この画面を自分のチャット欄にする」
// ・この画面の配信者本人: 「あなたのチャット欄」(URLとQR)
// 名前とアドレスはURLの「#」より後ろに入れる(ここはサーバーに送られない部分。どこにも保存しない)
import { encode, renderSVG } from 'uqr';
import { isAddress, getAddress } from 'viem';
import { memphisIcon } from './art.js';
import { clean, shortAddr, toast } from './chat.js';
import { burst } from './fx.js';
import * as account from './account.js';

const $ = (id) => document.getElementById(id);
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できない環境 */ } };

// 配信者ごとのURL。配信者も視聴者もこの1本を開く
export function pageUrl(to, name) {
  const p = new URLSearchParams();
  p.set('to', to);
  if (name) p.set('name', name);
  return `${window.location.origin}${window.location.pathname}#${p.toString()}`;
}

// URLの「#」の後ろから、受け取りアドレスと配信者名を読む
export function readPage() {
  const q = new URLSearchParams(window.location.hash.slice(1));
  const raw = (q.get('to') || '').trim();
  const ok = isAddress(raw);
  return { to: ok ? getAddress(raw) : '', name: clean(q.get('name') || '', 16), hasTo: raw !== '', ok };
}

// QRを白黒のマス目から描いて、PNG画像で保存する(OBSの画像ソースに使える)
export function saveQrPng(url) {
  const { data } = encode(url);
  const pad = 4;
  const scale = 12;
  const n = data.length + pad * 2;
  const c = document.createElement('canvas');
  c.width = n * scale;
  c.height = n * scale;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#141414';
  data.forEach((row, y) => row.forEach((on, x) => { if (on) g.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale); }));
  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jpyc-superchat-qr.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

export async function copyText(text, btn, label) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'コピーしました';
  } catch {
    btn.textContent = 'コピーできませんでした';
  }
  setTimeout(() => { btn.textContent = label; }, 1600);
}

// ウォレットをつなぐ(運営側の設定がまだなら、そう伝える)
export async function connectOrExplain(say = (t) => toast(t)) {
  if (!account.canConnect()) {
    say('ウォレット接続は準備中です（運営側の設定待ち）。');
    return false;
  }
  try {
    await account.connect();
    say('');
    return true;
  } catch {
    say('ウォレットにつながりませんでした。もう一度どうぞ。');
    return false;
  }
}

// current(): いま開いているチャット欄 { to, name, url }(まだ無ければ null)
// onCreate(to, name): 「この画面を自分のチャット欄にする」を押したとき
export function initCreator({ current, onCreate }) {
  const modal = $('creator');
  const win = $('creatorWin');
  let stop = null; // ウォレットの見張りをやめる関数

  const isMine = () => {
    const p = current();
    const a = account.myAddress();
    return Boolean(p && a && p.to.toLowerCase() === a.toLowerCase());
  };

  function close() {
    modal.hidden = true;
    if (stop) stop();
    stop = null;
  }

  function open(mode) {
    if (stop) stop();
    stop = null;
    if (mode === 'share' || (!mode && isMine())) renderShare(current());
    else renderSetup();
    modal.hidden = false;
  }

  const head = (title, cls = '') =>
    `<div class="modal-head ${cls}"><h2 id="creatorTitle">${title}</h2><button class="x" type="button" data-close aria-label="とじる"></button></div>`;

  // 「この画面を自分のチャット欄にする」
  function renderSetup() {
    win.innerHTML = `${head('配信者のかたへ')}
      <div class="modal-body setup"><div class="setup-body">
        <p class="setup-lead">この画面が、そのままあなたの<b>JPYC投げ銭チャット欄</b>になります。登録なし・無料です。</p>
        <ol class="setup-steps">
          <li><span class="num">1</span><div>受け取り用のウォレットをつなぐ
            <div class="setup-state" data-state></div>
            <button class="btn-ink" type="button" data-connect>ウォレット接続<i aria-hidden="true"></i></button>
            <details class="direct" data-manual>
              <summary>つながらないときは、アドレスを入力</summary>
              <input class="mk-input mono" data-addr placeholder="0x から始まる受け取りアドレス" spellcheck="false" autocomplete="off" aria-label="受け取りアドレス">
            </details>
          </div></li>
          <li><span class="num">2</span><div>配信者名
            <input class="mk-input" data-name maxlength="16" placeholder="例：さじのき" aria-label="配信者名" autocomplete="nickname">
          </div></li>
        </ol>
        <button class="go-btn" type="button" data-go>この画面を自分のチャット欄にする<i aria-hidden="true"></i></button>
        <p class="mk-err" data-err role="alert"></p>
        <p class="setup-note">保存するのは「送金番号・なまえ・コメント」だけ。お金はこのサービスを通らず、視聴者のウォレットからあなたのウォレットへ直接届きます。</p>
      </div></div>`;
    const q = (sel) => win.querySelector(sel);
    const say = (t) => { q('[data-err]').textContent = t; };
    q('[data-close]').addEventListener('click', close);

    const nameIn = q('[data-name]');
    nameIn.value = read('jpycchat.maker.name', '');
    nameIn.addEventListener('input', () => write('jpycchat.maker.name', nameIn.value));

    stop = account.onAccount((a) => {
      const st = q('[data-state]');
      if (!st) return;
      st.textContent = '';
      if (a) {
        const ic = document.createElement('span');
        ic.className = 'ic';
        ic.innerHTML = memphisIcon(a);
        const code = document.createElement('code');
        code.textContent = shortAddr(a);
        st.append(ic, code, 'をつないでいます');
      } else {
        st.textContent = 'まだつないでいません';
      }
      q('[data-connect]').hidden = Boolean(a);
    });

    q('[data-connect]').addEventListener('click', async () => {
      const ok = await connectOrExplain(say);
      if (!ok && !account.canConnect()) q('[data-manual]').open = true;
    });
    q('[data-addr]').addEventListener('input', (e) => {
      const v = e.target.value.trim();
      if (isAddress(v)) {
        account.useAddress(v);
        say('');
      }
    });
    q('[data-go]').addEventListener('click', () => {
      const a = account.myAddress();
      const name = clean(nameIn.value, 16);
      if (!a) {
        const typed = q('[data-addr]').value.trim();
        say(typed && !isAddress(typed) ? 'アドレスの形がちがいます。0x から始まる42文字を確かめてください。' : '先にウォレットをつないでください。');
        return;
      }
      if (!name) {
        nameIn.focus();
        say('配信者名を入れてください。');
        return;
      }
      onCreate(a, name);
      if (stop) stop();
      stop = null;
      renderShare(current(), { celebrate: true });
    });
  }

  // 「あなたのチャット欄」(URLとQR)
  function renderShare(p, { celebrate = false } = {}) {
    win.innerHTML = `${head(celebrate ? 'できました！あなたのチャット欄' : 'あなたのチャット欄', 'sky')}
      <div class="modal-body"><div class="pin-body">
        <p>このURLが、あなたと視聴者の共通のURLです。<b>配信の概要欄</b>と<b>OBSのブラウザソース</b>に、同じものを入れてください。</p>
        <div class="mk-url"><code></code><button class="copy" type="button" data-copy>コピー</button></div>
        <div class="mk-qr-row">
          <div class="qr"></div>
          <div><p>配信画面にQRを置くと、視聴者がスマホで読めます。</p><button class="copy" type="button" data-qr>QRを画像で保存</button></div>
        </div>
        <button class="go-btn modal-ok" type="button" data-ok>OK<i aria-hidden="true"></i></button>
      </div></div>`;
    const q = (sel) => win.querySelector(sel);
    q('code').textContent = p.url;
    q('.qr').innerHTML = renderSVG(p.url, { border: 1 });
    q('[data-copy]').addEventListener('click', (e) => copyText(p.url, e.currentTarget, 'コピー'));
    q('[data-qr]').addEventListener('click', () => saveQrPng(p.url));
    q('[data-close]').addEventListener('click', close);
    q('[data-ok]').addEventListener('click', close);
    if (celebrate) {
      setTimeout(() => {
        const r = win.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + 20, 90, 12);
      }, 200);
    }
  }

  $('createBtn').addEventListener('click', () => (modal.hidden ? open() : close()));
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  // 送る画面のいちばん下の「配信者のかたへ」からも開ける(画面は切りかえない)
  $('promo').addEventListener('click', (e) => {
    e.preventDefault();
    $('sheet').hidden = true;
    open('setup');
  });

  return { open, close };
}
