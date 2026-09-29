// 自分のウォレットの係: 右上のボタン・入力欄の「自分」・送るときの接続を、ここでひとまとめにする
// アドレスはこの端末の中だけに覚える。つなぐ部品(WalletConnect)は重いので、押したときに初めて読み込む
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
export const canConnect = () => Boolean(projectId);
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
    W = await import('./wallet.js');
    W.initWallet(projectId);
  }
  return W;
}

// ウォレットをつなぐ(ウォレット選びの画面が出る)。つながったアドレスを返す
export async function connect() {
  if (!projectId) throw new Error('not-configured');
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
