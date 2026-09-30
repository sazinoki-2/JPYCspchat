// JPYCスパチャの自動テスト用の道具(本番URLを開いて確かめる)
// ・偽ウォレット: 本物の MetaMask と同じ名乗り方(EIP-6963)。送金は中で止めて、実際には送らない
// ・通信の差しかえ: Polygon の読み取り口や Firebase への通信を、テスト用の答えに差しかえられる
//   (Firebase への書き込みは受け止めて中身だけ記録し、本番のデータベースには書かない)
import puppeteer from 'puppeteer-core';

// 確かめるページ(ふだんは本番)。BASE_URL で変えられる
export const BASE = process.env.BASE_URL || 'https://sazinoki-2.github.io/JPYCspchat/';
export const JPYC = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29';
// 実在の投げ銭を使う確認(任意)。アドレスは書かずに、外から渡す
//   例: REAL_HOST=0x…(配信者のアドレス) REAL_TIP="なまえ 100 JPYC コメント"(そのページに出るはずのカード) npm run test:e2e
export const REAL_HOST = process.env.REAL_HOST || '';
export const REAL_TIP = process.env.REAL_TIP || '';
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function skip(id, name, why) {
  console.log(`SKIP  ${id}  ${name}  … ${why}`);
}
export const FAKE_STREAMER = '0x5ccff2ffcc00141414ffffff5ccff2ffcc001414'; // 実在の送金がないテスト用の配信者
export const FAKE_VIEWER = '0x7e57000000000000000000000000000000007e57'; // テスト用の視聴者(残高は差しかえで決める)
export const FAKE_HASH = `0x${'ab'.repeat(32)}`;
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const RPC_HOSTS = ['polygon-bor-rpc.publicnode.com', 'polygon.gateway.tenderly.co', 'polygon.drpc.org', '1rpc.io'];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pad32 = (hex) => `0x${hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
export const url = (hash = '') => `${BASE}?v=${Date.now()}${hash}`;
export const hostUrl = (to, name) => url(`#to=${to}${name ? `&name=${encodeURIComponent(name)}` : ''}`);

export const results = [];
export function check(id, name, ok, detail = '') {
  results.push({ id, name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? `  … ${detail}` : ''}`);
}

let browser = null;
export async function launch() {
  // パソコンに入っている Chrome を使う(場所は CHROME_PATH で変えられる)
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
  return browser;
}
export async function close() {
  if (browser) await browser.close();
}

// 偽ウォレット(ページより先に入れる)
function mockWallet(o) {
  window.__w = { calls: [], sent: [], switchAsked: 0, chain: o.chain || '0x89' };
  const L = {};
  const emit = (ev, v) => (L[ev] || []).forEach((f) => { try { f(v); } catch (e) { console.error('listener', e); } });
  let accounts = [];
  const reject = () => Object.assign(new Error('User rejected the request.'), { code: 4001 });
  const provider = {
    isMetaMask: true,
    async request({ method, params }) {
      window.__w.calls.push(method);
      switch (method) {
        case 'eth_requestAccounts':
        case 'wallet_requestPermissions':
          await new Promise((r) => setTimeout(r, 400));
          if (o.rejectConnect) throw reject();
          accounts = [o.account];
          emit('accountsChanged', accounts);
          return method === 'eth_requestAccounts' ? accounts : [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: accounts }] }];
        case 'eth_accounts': return accounts;
        case 'eth_chainId': return window.__w.chain;
        case 'net_version': return String(parseInt(window.__w.chain, 16));
        case 'wallet_getPermissions': return accounts.length ? [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: accounts }] }] : [];
        case 'wallet_revokePermissions': accounts = []; emit('accountsChanged', []); return null;
        case 'wallet_switchEthereumChain':
          window.__w.switchAsked++;
          await new Promise((r) => setTimeout(r, 400));
          if (o.rejectSwitch) throw reject();
          window.__w.chain = params[0].chainId;
          setTimeout(() => emit('chainChanged', window.__w.chain), 30);
          return null;
        case 'wallet_getCapabilities': throw Object.assign(new Error('Method not supported'), { code: 4200 });
        case 'eth_sendTransaction':
          await new Promise((r) => setTimeout(r, 400));
          if (o.rejectTx) throw reject();
          window.__w.sent.push(params[0]);
          return o.txHash;
        default: {
          const r = await fetch('https://polygon-bor-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
          const j = await r.json();
          if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
          return j.result;
        }
      }
    },
    on(ev, f) { (L[ev] ||= []).push(f); return provider; },
    removeListener(ev, f) { L[ev] = (L[ev] || []).filter((x) => x !== f); return provider; },
  };
  window.ethereum = provider;
  const info = { uuid: '5a0f3a3b-0000-4000-8000-00000000abcd', name: 'MetaMask', icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', rdns: 'io.metamask' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
}

// ページをひらく
// wallet: { account, chain, rejectConnect, rejectSwitch, rejectTx, txHash }
// rpc: { block: [host...], respond: async (body, host) => 結果 | undefined }
// firestore: 'capture'(書き込みを受け止める) | 'block'(つながらない)
// config: config.js を差しかえる中身
export async function open(target, { mobile = false, width, height, wallet, rpc, firestore = 'capture', config, obs = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(mobile ? { width: width || 390, height: height || 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: width || 1280, height: height || 800 });
  const log = { errors: [], dialogs: 0, commits: [], rpcCalls: [], aborted: 0 };
  page.on('pageerror', (e) => log.errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text().slice(0, 200)); });
  page.on('dialog', async (d) => { log.dialogs++; await d.dismiss(); });
  if (wallet) await page.evaluateOnNewDocument(mockWallet, { txHash: FAKE_HASH, chain: '0x89', ...wallet });
  if (obs) await page.evaluateOnNewDocument(() => { window.obsstudio = { pluginVersion: 'test' }; });
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const u = req.url();
    try {
      if (config && /\/JPYCspchat\/config\.js/.test(u)) {
        return req.respond({ status: 200, contentType: 'text/javascript', body: config });
      }
      if (u.includes('firestore.googleapis.com')) {
        if (firestore === 'block') { log.aborted++; return req.abort(); }
        // コメントを1件読む(batchGet)を、テスト用の中身で答える
        if (firestore?.docs && req.method() === 'POST' && u.includes(':batchGet')) {
          const names = JSON.parse(req.postData() || '{}').documents || [];
          const now = new Date().toISOString();
          const out = names.map((name) => {
            const tx = name.split('/').pop();
            const d = firestore.docs[tx];
            return d
              ? { found: { name, fields: { n: { stringValue: d.n }, m: { stringValue: d.m } }, createTime: now, updateTime: now }, readTime: now }
              : { missing: name, readTime: now };
          });
          return req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
        }
        if (req.method() === 'POST' && u.includes(':commit')) {
          log.commits.push({ url: u, body: JSON.parse(req.postData() || '{}') });
          const now = new Date().toISOString();
          return req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ writeResults: [{ updateTime: now }], commitTime: now }) });
        }
        return req.continue();
      }
      const host = new URL(u).host;
      if (rpc && RPC_HOSTS.includes(host) && req.method() === 'POST') {
        if (rpc.block?.includes(host)) { log.aborted++; return req.abort(); }
        const body = JSON.parse(req.postData() || '{}');
        log.rpcCalls.push(body.method);
        const custom = rpc.respond ? await rpc.respond(body, host) : undefined;
        if (custom !== undefined) {
          return req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: custom }) });
        }
      }
      return req.continue();
    } catch (e) {
      try { await req.continue(); } catch { /* すでに応答ずみ */ }
    }
  });
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { ctx, page, log };
}

// shadow DOM の中まで探して、条件に合う要素の情報を返す
export function deepList(page, tag) {
  return page.evaluate((tagName) => {
    const out = [];
    const walk = (root) => root.querySelectorAll('*').forEach((el) => {
      if (el.tagName === tagName) out.push({ name: el.getAttribute('name'), id: el.getAttribute('data-testid'), tag: el.getAttribute('taglabel') || '' });
      if (el.shadowRoot) walk(el.shadowRoot);
    });
    walk(document);
    return out;
  }, tag);
}
export function deepClick(page, testid) {
  return page.evaluate((id) => {
    let hit = null;
    const walk = (root) => root.querySelectorAll('*').forEach((el) => {
      if (!hit && el.getAttribute && el.getAttribute('data-testid') === id) hit = el;
      if (el.shadowRoot) walk(el.shadowRoot);
    });
    walk(document);
    if (hit) hit.click();
    return Boolean(hit);
  }, testid);
}
export const modalOpen = (page) => page.evaluate(() => Boolean(document.querySelector('w3m-modal')?.open));
export const txt = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

// 右上の「ウォレット接続」→ MetaMask(入っているもの)を選ぶ。閉じて接続済みになるまでの秒数(ならなければ null)
export async function connectMetaMask(page, { via = '#walletBtn' } = {}) {
  await page.click(via);
  for (let i = 0; i < 30 && !(await deepList(page, 'W3M-LIST-WALLET')).length; i++) await sleep(300);
  const ok = await deepClick(page, 'wallet-selector-io.metamask');
  if (!ok) return null;
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const label = await txt(page, '#walletLabel');
    if (!(await modalOpen(page)) && /0x/.test(label || '')) return (Date.now() - t0) / 1000;
  }
  return null;
}

export function summary() {
  const ng = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length}件中 ${results.length - ng.length}件 OK / ${ng.length}件 NG ===`);
  for (const r of ng) console.log(`NG: ${r.id} ${r.name} … ${r.detail}`);
  if (ng.length) process.exitCode = 1; // NG があれば失敗として終わる(npm run test:e2e がそこで止まる)
}
