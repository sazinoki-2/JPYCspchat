// 右上のウォレットボタンとメニュー、入力欄の「自分」の表示(YouTubeの右上のログイン・コメント欄と同じ考え方)
import { memphisIcon, guestIcon } from './art.js';
import { shortAddr } from './chat.js';
import * as account from './account.js';
import { connectOrExplain } from './setup.js';

const $ = (id) => document.getElementById(id);

// current(): いま開いているチャット欄 { to, name, url }(まだ無ければ null)
export function initTopbar({ current }) {
  const btn = $('walletBtn');
  const menu = $('walletMenu');

  const openMenu = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); };
  const closeMenu = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };

  function paint(a) {
    btn.classList.toggle('on', Boolean(a));
    $('walletIc').innerHTML = a ? memphisIcon(a) : guestIcon();
    const label = $('walletLabel');
    if (a) label.textContent = shortAddr(a);
    else label.innerHTML = '<span class="long">ウォレット接続</span><span class="short">接続</span>';
    // 入力欄の「自分」(アイコンとアドレス)
    $('meIc').innerHTML = a ? memphisIcon(a) : guestIcon();
    const me = $('meAddr');
    me.textContent = a ? shortAddr(a) : 'ウォレット未接続';
    me.classList.toggle('off', !a);
    // メニュー
    $('menuIc').innerHTML = a ? memphisIcon(a) : '';
    $('menuAddr').textContent = a || '';
    const page = current();
    const mine = Boolean(a && page && page.to.toLowerCase() === a.toLowerCase());
    $('menuRole').hidden = !mine;
    if (!a) closeMenu();
  }
  account.onAccount(paint);

  btn.addEventListener('click', () => {
    if (!account.myAddress()) connectOrExplain();
    else if (menu.hidden) openMenu();
    else closeMenu();
  });
  $('meAddr').addEventListener('click', () => {
    if (!account.myAddress()) connectOrExplain();
    else openMenu();
  });
  $('menuOff').addEventListener('click', async () => {
    closeMenu();
    await account.disconnect();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu();
  });

  return { repaint: () => paint(account.myAddress()) };
}
