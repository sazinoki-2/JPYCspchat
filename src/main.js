// 全体をつなぐ係(画面はチャット欄の1枚だけ。切りかえない)
// ・URLの「#」の後ろに配信者の指定がある → その配信者のチャット欄
// ・ない → 同じチャット欄の中に「この画面を自分のチャット欄にする」案内を出す。
//   配信者がウォレットをつないで名前を入れると、画面はそのまま、URLだけがその人専用になる
import './style.css';
import { playIntro } from './intro.js';
import * as chat from './chat.js';
import { initSheet } from './sheet.js';
import { initStore, loadComment, saveComment, storeReady } from './store.js';
import { watchTips, balances, waitReceipt } from './chain.js';
import * as account from './account.js';
import { readPage, pageUrl, initCreator } from './setup.js';
import { initTopbar } from './topbar.js';
import { initBackground } from './bg.js';

// OBSのブラウザソースの中で開かれたら(OBSが window.obsstudio を用意する)、まわりを透明にする
if (window.obsstudio) document.documentElement.classList.add('obs');
// ページ全体の背景に、幾何学パーツを散りばめる
initBackground();

// ほかの配信者のURLに打ちかえたときなどは、そのページとして読み直す
window.addEventListener('hashchange', () => window.location.reload());

// ===== サービス全体の設定(public/config.js。運営者が1回だけ書く) =====
const raw = window.JPYC_CHAT_CONFIG || {};
const cfg = {
  reownProjectId: String(raw.reownProjectId || '').trim(),
  firebase: raw.firebase || {},
  historyHours: Number(raw.historyHours) > 0 ? Number(raw.historyHours) : 6,
  minTip: Number(raw.minTip) >= 0 ? Number(raw.minTip) : 100,
  ngWords: raw.ngWords || [],
};
// コメント置き場は Firestore だけなので、プロジェクトIDがあれば動く(apiKey などはなくてよい)
const FB_OK = Boolean(String(cfg.firebase.projectId || '').trim());
const WC_OK = Boolean(cfg.reownProjectId);
// 本番かどうかは、コメント置き場(Firebase)があるかで決める。
// 払い方は、WalletConnect の番号があればそれ(スマホのウォレットアプリともつながる)、
// まだ無ければブラウザに入っているウォレット(PCの MetaMask 拡張・ウォレットアプリの中のブラウザ)
const LIVE = FB_OK;
chat.setNgWords(cfg.ngWords);
account.initAccount(cfg.reownProjectId);
if (FB_OK) initStore(cfg.firebase);

// ===== いま開いているチャット欄(配信者) =====
const page = readPage();
let current = page.ok ? { to: page.to, name: page.name || chat.shortAddr(page.to), url: pageUrl(page.to, page.name) } : null;
const topbar = initTopbar({ current: () => current });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Firebase から来た なまえ・コメント を、表示できる形にそろえる
function apply(tip, c) {
  const max = chat.TIERS[chat.tierOf(tip.jpyc)].max;
  tip.name = chat.mask(chat.clean(c?.n, 16)) || chat.shortAddr(tip.from);
  tip.msg = chat.mask(chat.clean(c?.m, max));
  tip.hasComment = Boolean(c && (c.n || c.m));
}

async function attachComments(tips) {
  const found = await Promise.all(
    tips.map((t) => (storeReady() ? withTimeout(loadComment(t.tx), 3500).catch(() => null) : null)),
  );
  tips.forEach((t, i) => apply(t, found[i]));
}

// このページから自分が送った分。ウォレットによっては送金番号がずれることがあるので、その保険
let pending = null;

// コメントがまだ見つからない新しい投げ銭は、少しあとに見に行きなおす
function retryComment(tip) {
  [3000, 9000, 20000].forEach((ms) =>
    setTimeout(async () => {
      if (tip.hasComment) return;
      const c = await loadComment(tip.tx).catch(() => null);
      if (c && (c.n || c.m)) {
        apply(tip, c);
        chat.updateTip(tip.id, tip.name, tip.msg);
      }
    }, ms),
  );
}

function missingList() {
  const m = [];
  if (!FB_OK) m.push('Firebaseの設定');
  if (!WC_OK) m.push('WalletConnectの番号');
  return m;
}

// ===== チャット欄をうごかす =====
// introDone: オープニングが終わったら解決する約束
function startChat(introDone) {
  const p = current;
  document.title = `${p.name} のJPYCスパチャ`;
  document.getElementById('hostName').textContent = p.name;
  document.getElementById('host').hidden = false;
  topbar.repaint();

  // 受け取りアドレスへの送金を見張って、チャット欄にならべる
  watchTips({
    to: p.to,
    historyHours: cfg.historyHours,
    onStatus: chat.chainStatus,
    onTips: async (list, isNew) => {
      const tips = list.filter((t) => t.jpyc >= cfg.minTip); // 少なすぎる送金(いたずら)は出さない
      if (!tips.length) return;
      await attachComments(tips);
      if (isNew && pending) {
        for (const t of tips) {
          const mine =
            !t.hasComment &&
            t.from.toLowerCase() === pending.from &&
            Math.abs(t.jpyc - pending.jpyc) < 1e-9 &&
            Date.now() - pending.at < 10 * 60_000;
          if (!mine) continue;
          const q = pending;
          pending = null;
          if (t.tx !== q.tx && (q.n || q.m)) saveComment(t.tx, q.n, q.m).catch(() => {});
          apply(t, { n: q.n, m: q.m });
          break;
        }
      }
      await introDone; // オープニングが終わってから、どっと並べる
      if (isNew) {
        tips.forEach((t, k) => setTimeout(() => chat.addTip(t, { isNew: true }), k * 900));
        if (storeReady()) for (const t of tips) if (!t.hasComment) retryComment(t);
      } else {
        tips.forEach((t, k) => chat.addTip(t, { cascade: Math.max(0, k - (tips.length - 8)) }));
      }
    },
  });
  if (!LIVE) introDone.then(() => chat.demo(missingList(), { seed: false }));

  initSheet({ receiveAddress: p.to, streamerName: p.name, onSend: LIVE ? sendLive : sendDemo });

  // 開発中だけ: コンソールから __testTip(10000) のように金額を指定して流せる(本番のビルドには入らない)
  if (import.meta.env.DEV) window.__testTip = chat.testTip;

  // Shift + T で、自分の画面にだけテスト投げ銭を流す(配信前の確認用)
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (e.shiftKey && (e.key === 'T' || e.key === 't') && !typing) {
      e.preventDefault();
      chat.testTip();
    }
  });
}

// ===== 送る処理 =====
function explain(e) {
  const s = `${e?.name || ''} ${e?.shortMessage || ''} ${e?.message || ''} ${e?.cause?.code ?? ''}`;
  if (/UserRejected|rejected|denied|4001|cancel/i.test(s)) return 'キャンセルしました。';
  if (/insufficient funds|gas required exceeds/i.test(s)) return 'ガス代（POL）が足りません。';
  if (/switch|mismatch|unsupported chain/i.test(s)) return 'ウォレットのネットワークを Polygon に切りかえてから、もう一度どうぞ。';
  return '送れませんでした。時間をおいて、もう一度どうぞ。';
}

async function sendLive(tip, ui) {
  let addr;
  try {
    addr = await account.connect();
  } catch (e) {
    if (e?.message === 'no-wallet') {
      return ui.fail('このブラウザからはウォレットにつなげません。MetaMaskなどのウォレットアプリの中のブラウザで開くか、「もどる」→「POLがない人はこちら」から直接送れます（コメントなし）。');
    }
    return ui.fail('ウォレットにつながりませんでした。もう一度どうぞ。');
  }
  const bal = await balances(addr).catch(() => null); // 読めなくても先へ(ウォレット側でも確かめられる)
  if (bal && bal.jpyc < tip.jpyc) return ui.fail(`JPYCが足りません（いまの残高 ${chat.yen(bal.jpyc)} JPYC）。`);
  if (bal && bal.pol === 0n) {
    return ui.fail('ガス代（POL）がありません。POLを少し入れてから、もう一度どうぞ。POLがない人は「POLがない人はこちら」から直接送れます。');
  }
  ui.step('approve');
  let hash;
  try {
    hash = await account.sendJPYC(current.to, tip.jpyc);
  } catch (e) {
    console.warn('[wallet]', e);
    return ui.fail(explain(e));
  }
  const tx = hash.toLowerCase();
  pending = { from: addr.toLowerCase(), jpyc: tip.jpyc, n: tip.name, m: tip.msg, at: Date.now(), tx };
  // すぐにコメントを保存(送るのは 送金番号・なまえ・コメント の3つだけ)
  if (tip.name || tip.msg) saveComment(tx, tip.name, tip.msg).catch((e) => console.warn('[store] コメントの保存に失敗', e));
  ui.step('confirm');
  try {
    const rc = await waitReceipt(hash);
    if (rc.status !== 'success') {
      return ui.fail('チェーンで失敗しました。JPYCは動いていません（ガス代だけかかっている場合があります）。');
    }
  } catch (e) {
    const slow = /timeout/i.test(`${e?.name} ${e?.message}`);
    return ui.fail(slow ? '確認に時間がかかっています。届いたら自動でチャットに流れます。' : '確認できませんでした。届いていればチャットに流れます。');
  }
  ui.done('届きました！チャットに流れます');
}

// 設定がまだのときの、見本の送る処理(実際には送らない)
async function sendDemo(tip, ui) {
  await sleep(700);
  ui.step('approve');
  await sleep(1100);
  ui.step('confirm');
  await sleep(1000);
  ui.done('届きました！（デモなので、実際には送っていません）');
  const from = account.myAddress() || `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
  setTimeout(
    () => chat.addTip({ id: `demo:${Date.now()}`, from, jpyc: tip.jpyc, name: tip.name || chat.shortAddr(from), msg: tip.msg, ts: Date.now() }, { isNew: true }),
    1600,
  );
}

// ===== はじめる =====
// 右上の「配信者」ボタンで出るウィンドウ。「この画面を自分のチャット欄にする」を押すと、
// 画面はそのまま、URLだけをその人専用にする(読み込み直しはしない)
const creator = initCreator({
  current: () => current,
  onCreate(to, name) {
    current = { to, name, url: pageUrl(to, name) };
    window.history.replaceState(null, '', current.url);
    startChat(Promise.resolve());
  },
});

// 送り先(配信者)がまだ決まっていないページで「JPYC」を押したら、送り先をえらぶ案内を出す
// (この画面を自分のチャット欄にしたあとは、ふつうの送る画面になる)
const askHost = (e) => {
  if (current) return;
  e.preventDefault();
  creator.open('guide');
};
document.getElementById('jpycBtn').addEventListener('click', askHost);
document.getElementById('msgIn').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) askHost(e);
});
const chatEl = document.getElementById('chat');
if (current) startChat(playIntro(`${current.name} のチャット欄`, chatEl));
else playIntro('あなたの投げ銭チャット欄', chatEl);
