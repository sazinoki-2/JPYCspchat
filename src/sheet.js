// 入力欄と「送る」画面の係: なまえ・コメント・金額えらび → ウォレットで承認 → 確認
import { renderSVG } from 'uqr';
import { memphisIcon, guestIcon } from './art.js';
import { TIERS, tierOf, yen, clean, shortAddr } from './chat.js';
import * as account from './account.js';

const AMOUNTS = [100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000];
const $ = (id) => document.getElementById(id);
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できない環境 */ } };

// onSend(tip, ui): 実際に送る処理(本番かデモかは main.js が決める)
export function initSheet({ receiveAddress, streamerName, onSend }) {
  const meName = $('meName');
  const msgIn = $('msgIn');
  const sheet = $('sheet');
  const pv = $('pv');
  const pvMsg = $('pvMsg');
  const stepPick = $('stepPick');
  const stepPay = $('stepPay');
  const payMsg = $('payMsg');
  const backBtn = $('backBtn');
  let amount = Number(read('jpycchat.amount', '500')) || 500;
  if (!AMOUNTS.includes(amount)) amount = 500;
  let busy = false;

  // 自分のアイコン・なまえ(アイコンはつないだウォレットのアドレスから。右上と同じ)
  meName.value = read('jpycchat.name', '');
  const myIcon = () => {
    const a = account.myAddress();
    return a ? memphisIcon(a) : guestIcon();
  };
  meName.addEventListener('input', () => write('jpycchat.name', meName.value));
  account.onAccount(() => { if (!sheet.hidden) paint(); });

  // 金額のタイル(3×3)
  const grid = $('amounts');
  for (const v of AMOUNTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `t${tierOf(v)}`;
    b.dataset.v = String(v);
    const label = document.createElement('span');
    label.textContent = yen(v);
    b.appendChild(label);
    b.addEventListener('click', () => {
      amount = v;
      write('jpycchat.amount', String(v));
      paint();
    });
    grid.appendChild(b);
  }

  function paint() {
    const t = tierOf(amount);
    const rule = TIERS[t];
    pv.className = `tip pv t${t}`;
    $('pvIc').innerHTML = myIcon();
    // なまえが空なら、実際にはアドレスの名前で流れる
    const a = account.myAddress();
    $('pvName').textContent = clean(meName.value, 16) || (a ? shortAddr(a) : '（なまえなし）');
    $('pvAmt').textContent = yen(amount);
    // 金額を下げて字数オーバーになったら、はみ出た分を切る
    const chars = [...pvMsg.value];
    if (chars.length > rule.max) pvMsg.value = chars.slice(0, rule.max).join('');
    $('count').textContent = `${[...pvMsg.value].length}/${rule.max}`;
    for (const b of grid.children) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === amount));
    const r = $('rule');
    r.innerHTML = '<i></i>';
    r.style.setProperty('--tc', rule.color);
    r.append(`${rule.label}｜コメント${rule.max}字まで｜上のバーに${rule.keepMin}分のこる`);
  }
  pvMsg.addEventListener('input', paint);

  // 送り先(なりすましを見分けられるように、名前とアドレスをいつも見せる)
  $('toName').textContent = streamerName;
  $('toAddr').textContent = shortAddr(receiveAddress);
  $('toAddr').title = receiveAddress;

  // POLがない人向け: アドレスとQR
  $('directAddr').textContent = receiveAddress || '(受け取りアドレスが未設定です)';
  if (receiveAddress) $('directQr').innerHTML = renderSVG(receiveAddress, { border: 1 });
  $('copyBtn').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    try {
      await navigator.clipboard.writeText(receiveAddress);
      b.textContent = 'コピーしました';
    } catch {
      b.textContent = 'コピーできませんでした';
    }
    setTimeout(() => { b.textContent = 'アドレスをコピー'; }, 1600);
  });

  function open() {
    pvMsg.value = msgIn.value;
    stepPick.hidden = false;
    stepPay.hidden = true;
    sheet.hidden = false;
    paint();
  }
  function close() {
    if (busy) return;
    sheet.hidden = true;
  }
  $('jpycBtn').addEventListener('click', open);
  msgIn.addEventListener('keydown', (e) => {
    // 日本語入力の「変換を確定するEnter」では開かない
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) open();
  });
  $('sheetX').addEventListener('click', close);
  sheet.addEventListener('pointerdown', (e) => { if (e.target === sheet) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  backBtn.addEventListener('click', () => {
    if (busy) return;
    stepPay.hidden = true;
    stepPick.hidden = false;
  });

  // 支払いの進みぐあいを表示する道具
  const order = ['connect', 'approve', 'confirm'];
  const ui = {
    step(name) {
      const at = order.indexOf(name);
      for (const li of $('steps').children) {
        const i = order.indexOf(li.dataset.step);
        li.className = i < at || name === 'done' ? 'done' : i === at ? 'now' : '';
      }
      payMsg.className = 'pay-msg';
      payMsg.textContent = name === 'approve' ? 'ウォレットのアプリに確認が届いています。承認してください。' : '';
    },
    done(text) {
      ui.step('done');
      payMsg.className = 'pay-msg ok';
      payMsg.textContent = text;
      busy = false;
      backBtn.hidden = true;
      msgIn.value = '';
      pvMsg.value = '';
      setTimeout(close, 1500);
    },
    fail(text) {
      for (const li of $('steps').children) if (li.className === 'now') li.className = '';
      payMsg.className = 'pay-msg err';
      payMsg.textContent = text;
      busy = false;
      backBtn.hidden = false;
    },
  };

  $('goBtn').addEventListener('click', async () => {
    if (busy) return;
    const t = tierOf(amount);
    const tip = {
      name: clean(meName.value, 16),
      msg: clean(pvMsg.value, TIERS[t].max),
      jpyc: amount,
    };
    busy = true;
    backBtn.hidden = true;
    stepPick.hidden = true;
    stepPay.hidden = false;
    ui.step('connect');
    try {
      await onSend(tip, ui);
    } catch (e) {
      console.error(e);
      ui.fail('送れませんでした。時間をおいて、もう一度どうぞ。');
    }
  });
}
