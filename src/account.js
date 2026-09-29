// 自分のウォレットの係: 右上のボタン・入力欄の「自分」・送るときの接続を、ここでひとまとめにする
// アドレスはこの端末の中だけに覚える。つなぐ部品は重いので、押したときに初めて読み込む
// ・WalletConnect(Reown)の番号がある → wallet.js(スマホのウォレットアプリともつながる)
// ・番号がまだ無い → injected.js(ブラウザに入っているウォレット: PCの MetaMask 拡張・ウォレットアプリの中のブラウザ)
import { isAddress, getAddress } from 'viem';

const KEY = 'jpycchat.addr';
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できない環境 */ } };

let addr = (() => {
  const a = read(KEY, '');
  return isAddress(a) ? getAddress(a) : '';
})();
let projectId = '';
let W = null;
const subs = new Set();

export function initAccount(id) {
  projectId = id;
}
// ブラウザにウォレットが入っているか(MetaMask の拡張機能・ウォレットアプリの中のブラウザなど)
export const hasInjected = () => typeof window !== 'undefined' && Boolean(window.ethereum);
export const canConnect = () => Boolean(projectId) || hasInjected();
export const myAddress = () => addr;

// アドレスが変わったら知らせてもらう(登録したときにも1回呼ぶ)
export function onAccount(fn) {
  subs.add(fn);
  fn(addr);
  return () => subs.delete(fn);
}

function set(a) {
  addr = a && isAddress(a) ? getAddress(a) : '';
  write(KEY, addr);
  subs.forEach((f) => f(addr));
}

async function wallet() {
  if (!W) {
    W = projectId ? await import('./wallet.js') : await import('./injected.js');
    W.initWallet(projectId);
  }
  return W;
}

// ウォレットをつなぐ(ウォレット選びの画面・ウォレットの確認が出る)。つながったアドレスを返す
// このブラウザではつなぐ手段がないときは 'no-wallet' で失敗する
export async function connect() {
  if (!canConnect()) throw new Error('no-wallet');
  const w = await wallet();
  const a = await w.connect();
  set(a);
  return a;
}

// 手で入れたアドレス(ウォレットがつながらない配信者向け)
export function useAddress(a) {
  set(a);
}

export async function disconnect() {
  set('');
  if (W) {
    try { await W.disconnectWallet(); } catch { /* もともとつながっていない */ }
  }
}

// JPYC を送る(ウォレットに承認を出す)。戻り値は送金番号
export async function sendJPYC(to, amount) {
  const w = await wallet();
  return w.sendJPYC(to, amount);
}
